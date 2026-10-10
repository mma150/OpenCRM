import type request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  resetRecords,
  signInAs,
  type ValidationDetail,
} from "../../../test/helpers";
import type { User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

type RecordType = "LEAD" | "CONTACT" | "COMPANY" | "OPPORTUNITY";
type FieldType = "TEXT" | "NUMBER" | "DATE" | "DROPDOWN";
type Values = Record<string, string | number | null>;

interface ApiCustomField {
  id: string;
  recordType: RecordType;
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiRecord {
  id: string;
  customFields: Values;
  updatedAt: string;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const FIELDS = "/api/v1/custom-fields";

// The four record types that take custom fields: where their routes are, and the least a
// create needs.
const RECORDS = [
  {
    type: "LEAD",
    path: "/api/v1/leads",
    body: { firstName: "Lee", lastName: "Lead", source: "OTHER" },
  },
  { type: "CONTACT", path: "/api/v1/contacts", body: { firstName: "Cora", lastName: "Contact" } },
  { type: "COMPANY", path: "/api/v1/companies", body: { name: "Company" } },
  { type: "OPPORTUNITY", path: "/api/v1/opportunities", body: { name: "Opportunity" } },
] as const;

const app = createTestApp();

// Meera manages Ravi. Uma is a rep without a manager.
let admin: User;
let meera: User;
let ravi: User;
let uma: User;
let viewer: User;

let asAdmin: Agent;
let asMeera: Agent;
let asRavi: Agent;
let asUma: Agent;
let asViewer: Agent;

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function details(response: request.Response): ValidationDetail[] {
  return errorOf(response).details as ValidationDetail[];
}

function detailPaths(response: request.Response): string[] {
  return details(response).map((detail) => detail.path);
}

function fieldOf(response: request.Response): ApiCustomField {
  return (response.body as Envelope<ApiCustomField>).data;
}

function fieldsOf(response: request.Response): ApiCustomField[] {
  return (response.body as Envelope<ApiCustomField[]>).data;
}

function labelsOf(response: request.Response): string[] {
  return fieldsOf(response).map((field) => field.label);
}

function recordOf(response: request.Response): ApiRecord {
  return (response.body as Envelope<ApiRecord>).data;
}

function idsOf(response: request.Response): string[] {
  return (response.body as Envelope<ApiRecord[]>).data.map((record) => record.id);
}

// A field made through the API, as an Admin would.
async function makeField(
  recordType: RecordType,
  label: string,
  type: FieldType = "TEXT",
  extra: { options?: string[]; required?: boolean } = {},
): Promise<ApiCustomField> {
  const response = await asAdmin.post(FIELDS).send({ recordType, label, type, ...extra });
  expect(response.status).toBe(201);
  return fieldOf(response);
}

// One field of each type on the record type.
async function makeFieldSet(recordType: RecordType) {
  return {
    text: await makeField(recordType, "Region"),
    number: await makeField(recordType, "Seats", "NUMBER"),
    date: await makeField(recordType, "Renewal", "DATE"),
    dropdown: await makeField(recordType, "Tier", "DROPDOWN", { options: ["Gold", "Silver"] }),
  };
}

function storedColumn(
  type: RecordType,
  id: string,
): Promise<{ customFields: unknown; updatedAt: Date }> {
  const select = { customFields: true, updatedAt: true } as const;
  switch (type) {
    case "LEAD": {
      return prisma.lead.findUniqueOrThrow({ where: { id }, select });
    }
    case "CONTACT": {
      return prisma.contact.findUniqueOrThrow({ where: { id }, select });
    }
    case "COMPANY": {
      return prisma.company.findUniqueOrThrow({ where: { id }, select });
    }
    case "OPPORTUNITY": {
      return prisma.opportunity.findUniqueOrThrow({ where: { id }, select });
    }
  }
}

beforeAll(async () => {
  await resetDatabase();
  admin = await createUser({ name: "Asha Admin", role: "ADMIN" });
  meera = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
  ravi = await createUser({ name: "Ravi Rep", role: "SALES_REP", managerId: meera.id });
  uma = await createUser({ name: "Uma Rep", role: "SALES_REP" });
  viewer = await createUser({ name: "Vik Viewer", role: "READ_ONLY" });

  asAdmin = await signInAs(app, admin);
  asMeera = await signInAs(app, meera);
  asRavi = await signInAs(app, ravi);
  asUma = await signInAs(app, uma);
  asViewer = await signInAs(app, viewer);
});

beforeEach(async () => {
  await resetRecords();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("GET /custom-fields", () => {
  it.each([
    ["an Admin", () => asAdmin],
    ["a Sales Manager", () => asMeera],
    ["a Sales Rep", () => asRavi],
    ["a Read-only user", () => asViewer],
  ])("gives %s the fields in use, in order", async (_, as) => {
    await makeField("LEAD", "Region");
    await makeField("LEAD", "Tier", "DROPDOWN", { options: ["Gold", "Silver"], required: true });
    const archived = await makeField("LEAD", "Old");
    await asAdmin.post(`${FIELDS}/${archived.id}/archive`);

    const response = await as().get(FIELDS).query({ recordType: "LEAD" });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(
      fieldsOf(response).map(({ label, type, options, required, position, archived: gone }) => ({
        label,
        type,
        options,
        required,
        position,
        archived: gone,
      })),
    ).toEqual([
      { label: "Region", type: "TEXT", options: [], required: false, position: 0, archived: false },
      {
        label: "Tier",
        type: "DROPDOWN",
        options: ["Gold", "Silver"],
        required: true,
        position: 1,
        archived: false,
      },
    ]);
  });

  it("narrows to one record type, and lists every type without one", async () => {
    await makeField("CONTACT", "Birthday", "DATE");
    await makeField("LEAD", "Region");
    await makeField("OPPORTUNITY", "Seats", "NUMBER");
    await makeField("COMPANY", "Segment");

    expect(labelsOf(await asRavi.get(FIELDS).query({ recordType: "CONTACT" }))).toEqual([
      "Birthday",
    ]);
    // By record type in the order LEAD, CONTACT, COMPANY, OPPORTUNITY.
    expect(labelsOf(await asRavi.get(FIELDS))).toEqual(["Region", "Birthday", "Segment", "Seats"]);
  });

  it("shows an Admin the archived fields on request, after the fields in use", async () => {
    const old = await makeField("LEAD", "Old");
    await makeField("LEAD", "Region");
    await asAdmin.post(`${FIELDS}/${old.id}/archive`);

    const response = await asAdmin
      .get(FIELDS)
      .query({ recordType: "LEAD", includeArchived: "true" });

    expect(fieldsOf(response).map(({ label, archived }) => [label, archived])).toEqual([
      ["Region", false],
      ["Old", true],
    ]);
  });

  it.each([
    ["a Sales Manager", () => asMeera],
    ["a Sales Rep", () => asRavi],
    ["a Read-only user", () => asViewer],
  ])("refuses %s the archived fields", async (_, as) => {
    const response = await as().get(FIELDS).query({ includeArchived: "true" });

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
  });

  it.each([
    [{ recordType: "TASK" }, "recordType"],
    [{ includeArchived: "yes" }, "includeArchived"],
  ])("refuses the query %j", async (query, path) => {
    const response = await asAdmin.get(FIELDS).query(query);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
  });
});

describe("POST /custom-fields", () => {
  it("adds a field last in its record type", async () => {
    await makeField("LEAD", "Region");
    await makeField("CONTACT", "Elsewhere");

    const response = await asAdmin
      .post(FIELDS)
      .send({ recordType: "LEAD", label: "  Seats  ", type: "NUMBER", required: true });

    expect(response.status).toBe(201);
    const field = fieldOf(response);
    expect(field).toEqual({
      id: field.id,
      recordType: "LEAD",
      label: "Seats",
      type: "NUMBER",
      options: [],
      required: true,
      position: 1,
      archived: false,
      createdAt: field.createdAt,
      updatedAt: field.updatedAt,
    });
  });

  it.each([
    ["a Sales Manager", () => asMeera],
    ["a Sales Rep", () => asRavi],
    ["a Read-only user", () => asViewer],
  ])("is not for %s", async (_, as) => {
    const response = await as().post(FIELDS).send({ recordType: "LEAD", label: "X", type: "TEXT" });

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect(await prisma.customField.count()).toBe(0);
  });

  it("refuses a label another field of the record type has, whatever the case", async () => {
    await makeField("LEAD", "Region");

    const response = await asAdmin
      .post(FIELDS)
      .send({ recordType: "LEAD", label: "REGION", type: "TEXT" });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(["label"]);
  });

  it("allows the same label on another record type", async () => {
    await makeField("LEAD", "Region");

    expect((await makeField("CONTACT", "Region")).label).toBe("Region");
  });

  it("refuses a label an archived field still has, and says so", async () => {
    const old = await makeField("LEAD", "Region");
    await asAdmin.post(`${FIELDS}/${old.id}/archive`);

    const response = await asAdmin
      .post(FIELDS)
      .send({ recordType: "LEAD", label: "region", type: "TEXT" });

    expect(response.status).toBe(400);
    expect(details(response)[0]?.path).toBe("label");
    expect(details(response)[0]?.message).toContain("archived");
  });

  it("treats % and _ in a label as themselves", async () => {
    await makeField("LEAD", "Discount %");

    expect((await makeField("LEAD", "Discount 5")).label).toBe("Discount 5");
  });

  it.each([
    ["an empty label", { label: "   " }, "label"],
    ["a label over 60 characters", { label: "x".repeat(61) }, "label"],
    ["a label with a control character", { label: "Re\ngion" }, "label"],
    ["an unknown type", { type: "CHECKBOX" }, "type"],
    ["an unknown record type", { recordType: "TASK" }, "recordType"],
    ["a dropdown without options", { type: "DROPDOWN" }, "options"],
    ["a dropdown with an empty list", { type: "DROPDOWN", options: [] }, "options"],
    ["options on a text field", { type: "TEXT", options: ["A"] }, "options"],
    ["an option twice", { type: "DROPDOWN", options: ["Gold", "gold"] }, "options"],
    ["an empty option", { type: "DROPDOWN", options: ["Gold", " "] }, "options.1"],
    [
      "more than 50 options",
      {
        type: "DROPDOWN",
        options: Array.from({ length: 51 }, (_, index) => `Option ${String(index)}`),
      },
      "options",
    ],
    ["required that is not true or false", { required: "yes" }, "required"],
  ])("refuses %s", async (_, change, path) => {
    const response = await asAdmin
      .post(FIELDS)
      .send({ recordType: "LEAD", label: "Region", type: "TEXT", ...change });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await prisma.customField.count()).toBe(0);
  });

  it("allows 50 options", async () => {
    const options = Array.from({ length: 50 }, (_, index) => `Option ${String(index)}`);

    expect((await makeField("LEAD", "Many", "DROPDOWN", { options })).options).toEqual(options);
  });

  it("stops at 30 fields in use per record type; archived fields do not count", async () => {
    await prisma.customField.createMany({
      data: Array.from({ length: 30 }, (_, position) => ({
        recordType: "LEAD" as const,
        label: `Field ${String(position)}`,
        type: "TEXT" as const,
        position,
      })),
    });

    const full = await asAdmin
      .post(FIELDS)
      .send({ recordType: "LEAD", label: "One more", type: "TEXT" });
    expect(full.status).toBe(400);
    expect(errorOf(full).code).toBe("VALIDATION_FAILED");
    expect(errorOf(full).details).toBeNull();
    // Another record type has its own count.
    expect((await makeField("CONTACT", "One more")).position).toBe(0);

    const first = await prisma.customField.findFirstOrThrow({ where: { label: "Field 0" } });
    await asAdmin.post(`${FIELDS}/${first.id}/archive`);
    expect((await makeField("LEAD", "One more")).position).toBe(30);
  });
});

describe("PATCH /custom-fields/:id", () => {
  it("changes the label, the options and whether it is required", async () => {
    const field = await makeField("LEAD", "Tier", "DROPDOWN", { options: ["Gold", "Silver"] });

    const response = await asAdmin
      .patch(`${FIELDS}/${field.id}`)
      .send({ label: "Level", options: ["Gold", "Bronze"], required: true });

    expect(response.status).toBe(200);
    expect(fieldOf(response)).toMatchObject({
      id: field.id,
      label: "Level",
      options: ["Gold", "Bronze"],
      required: true,
      type: "DROPDOWN",
      recordType: "LEAD",
    });
  });

  it("changes only the keys that are sent", async () => {
    const field = await makeField("LEAD", "Tier", "DROPDOWN", {
      options: ["Gold"],
      required: true,
    });

    const response = await asAdmin.patch(`${FIELDS}/${field.id}`).send({ label: "Level" });

    expect(fieldOf(response)).toMatchObject({ label: "Level", options: ["Gold"], required: true });
  });

  it("keeps its own label, in another case too", async () => {
    const field = await makeField("LEAD", "Region");

    const response = await asAdmin.patch(`${FIELDS}/${field.id}`).send({ label: "REGION" });

    expect(response.status).toBe(200);
    expect(fieldOf(response).label).toBe("REGION");
  });

  it.each([
    ["the type", { type: "NUMBER" }, [""]],
    ["the record type", { recordType: "CONTACT" }, [""]],
    ["the position", { position: 3 }, [""]],
    ["archived", { archived: true }, [""]],
  ])("cannot change %s", async (_, body, paths) => {
    const field = await makeField("LEAD", "Region");

    const response = await asAdmin.patch(`${FIELDS}/${field.id}`).send(body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(paths);
  });

  it("refuses another field's label, options on a text field and a dropdown left empty", async () => {
    const region = await makeField("LEAD", "Region");
    const tier = await makeField("LEAD", "Tier", "DROPDOWN", { options: ["Gold"] });

    const label = await asAdmin.patch(`${FIELDS}/${tier.id}`).send({ label: "region" });
    const options = await asAdmin.patch(`${FIELDS}/${region.id}`).send({ options: ["A"] });
    const empty = await asAdmin.patch(`${FIELDS}/${tier.id}`).send({ options: [] });

    expect([label.status, options.status, empty.status]).toEqual([400, 400, 400]);
    expect(detailPaths(label)).toEqual(["label"]);
    expect(detailPaths(options)).toEqual(["options"]);
    expect(detailPaths(empty)).toEqual(["options"]);
  });

  it("answers NOT_FOUND for an unknown id and FORBIDDEN for anyone but an Admin", async () => {
    const field = await makeField("LEAD", "Region");

    const unknown = await asAdmin.patch(`${FIELDS}/${UNKNOWN_ID}`).send({ label: "X" });
    const manager = await asMeera.patch(`${FIELDS}/${field.id}`).send({ label: "X" });

    expect(unknown.status).toBe(404);
    expect(errorOf(unknown).code).toBe("NOT_FOUND");
    expect(manager.status).toBe(403);
    expect(errorOf(manager).code).toBe("FORBIDDEN");
  });
});

describe("PUT /custom-fields/order", () => {
  it("puts the fields in use in the order sent and answers with the record type's fields", async () => {
    const a = await makeField("LEAD", "A");
    const b = await makeField("LEAD", "B");
    const c = await makeField("LEAD", "C");
    const old = await makeField("LEAD", "Old");
    await asAdmin.post(`${FIELDS}/${old.id}/archive`);
    await makeField("CONTACT", "Elsewhere");

    const response = await asAdmin
      .put(`${FIELDS}/order`)
      .send({ recordType: "LEAD", ids: [c.id, a.id, b.id] });

    expect(response.status).toBe(200);
    expect(fieldsOf(response).map(({ label, position }) => [label, position])).toEqual([
      ["C", 0],
      ["A", 1],
      ["B", 2],
      ["Old", 3],
    ]);
    expect(labelsOf(await asRavi.get(FIELDS).query({ recordType: "LEAD" }))).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("refuses ids that are not every field in use exactly once", async () => {
    const a = await makeField("LEAD", "A");
    const b = await makeField("LEAD", "B");
    const old = await makeField("LEAD", "Old");
    await asAdmin.post(`${FIELDS}/${old.id}/archive`);
    const other = await makeField("CONTACT", "Elsewhere");

    for (const ids of [
      [a.id],
      [a.id, a.id],
      [a.id, b.id, old.id],
      [a.id, other.id],
      [a.id, UNKNOWN_ID],
    ]) {
      const response = await asAdmin.put(`${FIELDS}/order`).send({ recordType: "LEAD", ids });

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ids"]);
    }
    expect(labelsOf(await asAdmin.get(FIELDS).query({ recordType: "LEAD" }))).toEqual(["A", "B"]);
  });

  it("is for Admins only", async () => {
    const a = await makeField("LEAD", "A");

    const response = await asMeera.put(`${FIELDS}/order`).send({ recordType: "LEAD", ids: [a.id] });

    expect(response.status).toBe(403);
  });
});

describe("archive, restore and delete", () => {
  it("archives a field and restores it last, with its values", async () => {
    const region = await makeField("LEAD", "Region");
    await makeField("LEAD", "Seats", "NUMBER");
    const lead = recordOf(
      await asRavi
        .post("/api/v1/leads")
        .send({ ...RECORDS[0].body, customFields: { [region.id]: "North" } }),
    );

    const archived = await asAdmin.post(`${FIELDS}/${region.id}/archive`);
    expect(archived.status).toBe(200);
    expect(fieldOf(archived).archived).toBe(true);
    // Archiving it again changes nothing.
    expect(fieldOf(await asAdmin.post(`${FIELDS}/${region.id}/archive`)).archived).toBe(true);
    expect(labelsOf(await asRavi.get(FIELDS).query({ recordType: "LEAD" }))).toEqual(["Seats"]);
    expect(
      Object.keys(recordOf(await asRavi.get(`/api/v1/leads/${lead.id}`)).customFields),
    ).not.toContain(region.id);

    const restored = await asAdmin.post(`${FIELDS}/${region.id}/restore`);
    expect(restored.status).toBe(200);
    expect(fieldOf(restored)).toMatchObject({ archived: false, position: 2 });
    expect(labelsOf(await asRavi.get(FIELDS).query({ recordType: "LEAD" }))).toEqual([
      "Seats",
      "Region",
    ]);
    expect(recordOf(await asRavi.get(`/api/v1/leads/${lead.id}`)).customFields[region.id]).toBe(
      "North",
    );
    // Restoring a field that is in use changes nothing.
    expect(fieldOf(await asAdmin.post(`${FIELDS}/${region.id}/restore`)).position).toBe(2);
  });

  it("does not restore a field into a record type that is full", async () => {
    const old = await makeField("LEAD", "Old");
    await asAdmin.post(`${FIELDS}/${old.id}/archive`);
    await prisma.customField.createMany({
      data: Array.from({ length: 30 }, (_, position) => ({
        recordType: "LEAD" as const,
        label: `Field ${String(position)}`,
        type: "TEXT" as const,
        position,
      })),
    });

    const response = await asAdmin.post(`${FIELDS}/${old.id}/restore`);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(errorOf(response).details).toBeNull();
  });

  it("deletes only an archived field", async () => {
    const field = await makeField("LEAD", "Region");

    const response = await asAdmin.delete(`${FIELDS}/${field.id}`);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(errorOf(response).details).toBeNull();
    expect(await prisma.customField.count()).toBe(1);
  });

  it.each(RECORDS)(
    "deletes an archived $type field with every value, and nothing else",
    async (kind) => {
      const gone = await makeField(kind.type, "Gone");
      const kept = await makeField(kind.type, "Kept");
      const withBoth = recordOf(
        await asRavi
          .post(kind.path)
          .send({ ...kind.body, customFields: { [gone.id]: "a", [kept.id]: "b" } }),
      );
      const withNeither = recordOf(await asRavi.post(kind.path).send(kind.body));
      const before = await storedColumn(kind.type, withBoth.id);
      await asAdmin.post(`${FIELDS}/${gone.id}/archive`);

      const response = await asAdmin.delete(`${FIELDS}/${gone.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: null, meta: {} });
      expect(await prisma.customField.findUnique({ where: { id: gone.id } })).toBeNull();
      const after = await storedColumn(kind.type, withBoth.id);
      expect(after.customFields).toEqual({ [kept.id]: "b" });
      // Nobody edited the record.
      expect(after.updatedAt).toEqual(before.updatedAt);
      expect((await storedColumn(kind.type, withNeither.id)).customFields).toEqual({});
    },
  );

  it("answers NOT_FOUND for an unknown id and FORBIDDEN for anyone but an Admin", async () => {
    const field = await makeField("LEAD", "Region");

    for (const action of ["archive", "restore"]) {
      expect((await asAdmin.post(`${FIELDS}/${UNKNOWN_ID}/${action}`)).status).toBe(404);
      expect((await asMeera.post(`${FIELDS}/${field.id}/${action}`)).status).toBe(403);
      expect((await asViewer.post(`${FIELDS}/${field.id}/${action}`)).status).toBe(403);
    }
    expect((await asAdmin.delete(`${FIELDS}/${UNKNOWN_ID}`)).status).toBe(404);
    expect((await asRavi.delete(`${FIELDS}/${field.id}`)).status).toBe(403);
  });
});

describe.each(RECORDS)("custom field values on a $type", (kind) => {
  it("answers with a key for every field in use, null where there is no value", async () => {
    const fields = await makeFieldSet(kind.type);
    const old = await makeField(kind.type, "Old");
    await asAdmin.post(`${FIELDS}/${old.id}/archive`);
    await makeField(kind.type === "LEAD" ? "CONTACT" : "LEAD", "Other type");

    const created = await asRavi.post(kind.path).send(kind.body);

    expect(created.status).toBe(201);
    const expected = {
      [fields.text.id]: null,
      [fields.number.id]: null,
      [fields.date.id]: null,
      [fields.dropdown.id]: null,
    };
    expect(recordOf(created).customFields).toEqual(expected);
    const list = await asRavi.get(kind.path);
    expect((list.body as Envelope<ApiRecord[]>).data[0]?.customFields).toEqual(expected);
  });

  it("saves a value of each type on create and reads it back", async () => {
    const fields = await makeFieldSet(kind.type);
    const customFields = {
      [fields.text.id]: "  North  ",
      [fields.number.id]: 12.5,
      [fields.date.id]: "2026-11-15",
      [fields.dropdown.id]: "Gold",
    };

    const created = await asRavi.post(kind.path).send({ ...kind.body, customFields });

    expect(created.status).toBe(201);
    const saved = { ...customFields, [fields.text.id]: "North" };
    expect(recordOf(created).customFields).toEqual(saved);
    expect(recordOf(await asRavi.get(`${kind.path}/${recordOf(created).id}`)).customFields).toEqual(
      saved,
    );
    expect((await storedColumn(kind.type, recordOf(created).id)).customFields).toEqual(saved);
  });

  it("merges a PATCH key by key; null and an empty string clear a value", async () => {
    const fields = await makeFieldSet(kind.type);
    const created = recordOf(
      await asRavi.post(kind.path).send({
        ...kind.body,
        customFields: {
          [fields.text.id]: "North",
          [fields.number.id]: 5,
          [fields.dropdown.id]: "Gold",
        },
      }),
    );
    const url = `${kind.path}/${created.id}`;

    const changed = await asRavi
      .patch(url)
      .send({ customFields: { [fields.number.id]: 0, [fields.date.id]: "2027-01-31" } });
    expect(changed.status).toBe(200);
    expect(recordOf(changed).customFields).toEqual({
      [fields.text.id]: "North",
      [fields.number.id]: 0,
      [fields.date.id]: "2027-01-31",
      [fields.dropdown.id]: "Gold",
    });

    const cleared = await asRavi
      .patch(url)
      .send({ customFields: { [fields.text.id]: null, [fields.dropdown.id]: "" } });
    expect(recordOf(cleared).customFields).toEqual({
      [fields.text.id]: null,
      [fields.number.id]: 0,
      [fields.date.id]: "2027-01-31",
      [fields.dropdown.id]: null,
    });
    expect((await storedColumn(kind.type, created.id)).customFields).toEqual({
      [fields.number.id]: 0,
      [fields.date.id]: "2027-01-31",
    });

    // A PATCH that does not mention custom fields leaves them alone.
    const untouched = await asRavi.patch(url).send({ notes: "Called" });
    expect(recordOf(untouched).customFields[fields.number.id]).toBe(0);
  });

  it.each([
    ["a number in a text field", "text", 5, "Enter text"],
    ["text over 500 characters", "text", "x".repeat(501), "Use at most 500 characters"],
    ["text in a number field", "number", "12", "Enter a number"],
    ["a date that is not a day", "date", "15/11/2026", "Enter a date such as 2026-11-15"],
    ["a date that does not exist", "date", "2026-02-30", "Enter a date such as 2026-11-15"],
    ["a number in a date field", "date", 20_261_115, "Enter a date such as 2026-11-15"],
    ["an option the dropdown does not have", "dropdown", "Bronze", "Choose one of the options"],
    ["an option in another case", "dropdown", "gold", "Choose one of the options"],
  ] as const)("refuses %s on create and on PATCH", async (_, which, value, message) => {
    const fields = await makeFieldSet(kind.type);
    const field = fields[which];
    const record = recordOf(await asRavi.post(kind.path).send(kind.body));
    const customFields = { [field.id]: value };

    const onCreate = await asRavi.post(kind.path).send({ ...kind.body, customFields });
    const onPatch = await asRavi.patch(`${kind.path}/${record.id}`).send({ customFields });

    for (const response of [onCreate, onPatch]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(details(response)).toEqual([{ path: `customFields.${field.id}`, message }]);
    }
    expect((await storedColumn(kind.type, record.id)).customFields).toEqual({});
  });

  it("refuses a value that is not a string, a number or null", async () => {
    const fields = await makeFieldSet(kind.type);

    const response = await asRavi
      .post(kind.path)
      .send({ ...kind.body, customFields: { [fields.text.id]: ["North"] } });

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual([`customFields.${fields.text.id}`]);
  });

  it("refuses an unknown field, an archived field and a field of another record type", async () => {
    const archived = await makeField(kind.type, "Old");
    await asAdmin.post(`${FIELDS}/${archived.id}/archive`);
    const foreign = await makeField(kind.type === "LEAD" ? "CONTACT" : "LEAD", "Other type");
    const record = recordOf(await asRavi.post(kind.path).send(kind.body));

    for (const id of [UNKNOWN_ID, archived.id, foreign.id, "not-an-id"]) {
      const customFields = { [id]: "x" };
      const onCreate = await asRavi.post(kind.path).send({ ...kind.body, customFields });
      const onPatch = await asRavi.patch(`${kind.path}/${record.id}`).send({ customFields });

      for (const response of [onCreate, onPatch]) {
        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe("VALIDATION_FAILED");
        expect(detailPaths(response)).toEqual([`customFields.${id}`]);
      }
    }
  });

  it("reports every problem at once", async () => {
    const fields = await makeFieldSet(kind.type);

    const response = await asRavi.post(kind.path).send({
      ...kind.body,
      customFields: {
        [fields.number.id]: "many",
        [fields.dropdown.id]: "Bronze",
        [fields.text.id]: "ok",
      },
    });

    expect(detailPaths(response).sort()).toEqual(
      [`customFields.${fields.number.id}`, `customFields.${fields.dropdown.id}`].sort(),
    );
  });

  it("needs a required field on create, and whenever a request sends it", async () => {
    const existing = recordOf(await asRavi.post(kind.path).send(kind.body));
    const required = await makeField(kind.type, "Region", "TEXT", { required: true });
    const optional = await makeField(kind.type, "Seats", "NUMBER");
    const path = `customFields.${required.id}`;
    const message = "This field is required";

    const missing = await asRavi.post(kind.path).send(kind.body);
    const other = await asRavi
      .post(kind.path)
      .send({ ...kind.body, customFields: { [optional.id]: 1 } });
    const empty = await asRavi
      .post(kind.path)
      .send({ ...kind.body, customFields: { [required.id]: " " } });
    const nothing = await asRavi
      .post(kind.path)
      .send({ ...kind.body, customFields: { [required.id]: null } });
    for (const response of [missing, other, empty, nothing]) {
      expect(response.status).toBe(400);
      expect(details(response)).toEqual([{ path, message }]);
    }

    const filled = await asRavi
      .post(kind.path)
      .send({ ...kind.body, customFields: { [required.id]: "North" } });
    expect(filled.status).toBe(201);

    // A record from before the field existed can still be edited, as long as the request
    // does not send the field empty.
    const url = `${kind.path}/${existing.id}`;
    expect((await asRavi.patch(url).send({ notes: "Still editable" })).status).toBe(200);
    expect((await asRavi.patch(url).send({ customFields: { [optional.id]: 3 } })).status).toBe(200);
    const cleared = await asRavi.patch(url).send({ customFields: { [required.id]: null } });
    expect(cleared.status).toBe(400);
    expect(details(cleared)).toEqual([{ path, message }]);
    expect(
      (await asRavi.patch(url).send({ customFields: { [required.id]: "South" } })).status,
    ).toBe(200);
  });

  it("keeps showing a dropdown value whose option was removed, and lets it be saved back", async () => {
    const tier = await makeField(kind.type, "Tier", "DROPDOWN", { options: ["Gold", "Silver"] });
    const record = recordOf(
      await asRavi.post(kind.path).send({ ...kind.body, customFields: { [tier.id]: "Silver" } }),
    );
    const url = `${kind.path}/${record.id}`;
    await asAdmin.patch(`${FIELDS}/${tier.id}`).send({ options: ["Gold"] });

    expect(recordOf(await asRavi.get(url)).customFields[tier.id]).toBe("Silver");
    // A form that sends every field back unchanged still saves.
    const same = await asRavi.patch(url).send({ customFields: { [tier.id]: "Silver" } });
    expect(same.status).toBe(200);
    expect(recordOf(same).customFields[tier.id]).toBe("Silver");
    // But the option cannot be chosen for another record, or again once it was changed.
    const fresh = await asRavi
      .post(kind.path)
      .send({ ...kind.body, customFields: { [tier.id]: "Silver" } });
    expect(fresh.status).toBe(400);
    await asRavi.patch(url).send({ customFields: { [tier.id]: "Gold" } });
    expect((await asRavi.patch(url).send({ customFields: { [tier.id]: "Silver" } })).status).toBe(
      400,
    );
  });

  it("follows the record's own access rules", async () => {
    const region = await makeField(kind.type, "Region");
    const record = recordOf(
      await asRavi.post(kind.path).send({ ...kind.body, customFields: { [region.id]: "North" } }),
    );
    const url = `${kind.path}/${record.id}`;
    const change = { customFields: { [region.id]: "South" } };

    expect((await asViewer.patch(url).send(change)).status).toBe(403);
    expect((await asUma.patch(url).send(change)).status).toBe(404);
    expect(recordOf(await asViewer.get(url)).customFields[region.id]).toBe("North");
    expect(recordOf(await asMeera.patch(url).send(change)).customFields[region.id]).toBe("South");
  });
});

describe("required fields and the other write routes", () => {
  it("does not stop a lead from being reassigned, marked lost or converted", async () => {
    const lead = recordOf(await asRavi.post("/api/v1/leads").send(RECORDS[0].body));
    const second = recordOf(await asRavi.post("/api/v1/leads").send(RECORDS[0].body));
    for (const type of ["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"] as const) {
      await makeField(type, "Must have", "TEXT", { required: true });
    }

    const assigned = await asMeera
      .post(`/api/v1/leads/${lead.id}/assign`)
      .send({ ownerId: meera.id });
    const followUp = await asMeera
      .put(`/api/v1/leads/${lead.id}/follow-up`)
      .send({ at: "2030-01-01T09:00:00Z", note: null });
    const lost = await asRavi
      .post(`/api/v1/leads/${second.id}/mark-lost`)
      .send({ reason: "PRICE" });
    const converted = await asMeera.post(`/api/v1/leads/${lead.id}/convert`).send({
      company: { mode: "create", name: "Northwind" },
      contact: { mode: "create" },
      opportunity: { create: true },
    });

    expect([assigned.status, followUp.status, lost.status, converted.status]).toEqual([
      200, 200, 200, 200,
    ]);
    // The records a conversion makes start without custom field values.
    const contact = await prisma.contact.findFirstOrThrow();
    const opportunity = await prisma.opportunity.findFirstOrThrow();
    expect(contact.customFields).toEqual({});
    expect(opportunity.customFields).toEqual({});
  });

  it("does not stop an opportunity from being moved, closed, reopened or reassigned", async () => {
    const opportunity = recordOf(await asRavi.post("/api/v1/opportunities").send({ name: "Deal" }));
    await makeField("OPPORTUNITY", "Must have", "TEXT", { required: true });
    const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { name: "Proposal" } });
    const url = `/api/v1/opportunities/${opportunity.id}`;

    const moved = await asRavi.post(`${url}/stage`).send({ stageId: stage.id });
    const closed = await asRavi.post(`${url}/close`).send({ outcome: "WON" });
    const reopened = await asRavi.post(`${url}/reopen`);
    const assigned = await asMeera.post(`${url}/assign`).send({ ownerId: meera.id });

    expect([moved.status, closed.status, reopened.status, assigned.status]).toEqual([
      200, 200, 200, 200,
    ]);
  });

  it("does not carry a lead's custom field values over to what it is converted into", async () => {
    const leadField = await makeField("LEAD", "Region");
    await makeField("CONTACT", "Region");
    const lead = recordOf(
      await asRavi
        .post("/api/v1/leads")
        .send({ ...RECORDS[0].body, customFields: { [leadField.id]: "North" } }),
    );

    await asRavi.post(`/api/v1/leads/${lead.id}/convert`).send({
      company: { mode: "none" },
      contact: { mode: "create" },
      opportunity: { create: false },
    });

    expect((await prisma.contact.findFirstOrThrow()).customFields).toEqual({});
    // The lead keeps its own.
    expect(recordOf(await asRavi.get(`/api/v1/leads/${lead.id}`)).customFields[leadField.id]).toBe(
      "North",
    );
  });
});

describe.each(RECORDS)("filtering the $type list by custom fields", (kind) => {
  // Four records of Ravi's with different values, one of Uma's, and one without any.
  async function setUp() {
    const fields = await makeFieldSet(kind.type);
    const make = async (agent: Agent, values: [string, number, string, string] | null) => {
      const customFields = values
        ? {
            [fields.text.id]: values[0],
            [fields.number.id]: values[1],
            [fields.date.id]: values[2],
            [fields.dropdown.id]: values[3],
          }
        : {};
      return recordOf(await agent.post(kind.path).send({ ...kind.body, customFields })).id;
    };
    const ids = {
      north: await make(asRavi, ["North region", 5, "2026-01-15", "Gold"]),
      south: await make(asRavi, ["south 100%", 10, "2026-06-30", "Silver"]),
      east: await make(asRavi, ["East_coast", 20, "2026-12-31", "Gold"]),
      negative: await make(asRavi, ["Northern", -3.5, "2027-03-01", "Silver"]),
      umas: await make(asUma, ["North region", 5, "2026-01-15", "Gold"]),
      empty: await make(asRavi, null),
    };
    return { fields, ids };
  }

  const list = (agent: Agent, query: Record<string, string>) => agent.get(kind.path).query(query);

  it("matches a text field by what it contains, whatever the case", async () => {
    const { fields, ids } = await setUp();
    const key = `cf.${fields.text.id}`;

    expect(idsOf(await list(asRavi, { [key]: "NORTH" })).sort()).toEqual(
      [ids.north, ids.negative].sort(),
    );
    expect(idsOf(await list(asRavi, { [key]: "region" }))).toEqual([ids.north]);
    // % and _ are themselves, not wildcards.
    expect(idsOf(await list(asRavi, { [key]: "%" }))).toEqual([ids.south]);
    expect(idsOf(await list(asRavi, { [key]: "_" }))).toEqual([ids.east]);
    expect(idsOf(await list(asRavi, { [key]: "nowhere" }))).toEqual([]);
  });

  it("matches a dropdown field by the whole option", async () => {
    const { fields, ids } = await setUp();
    const key = `cf.${fields.dropdown.id}`;

    expect(idsOf(await list(asRavi, { [key]: "Gold" })).sort()).toEqual(
      [ids.north, ids.east].sort(),
    );
    expect(idsOf(await list(asRavi, { [key]: "Gol" }))).toEqual([]);
    expect(idsOf(await list(asRavi, { [key]: "gold" }))).toEqual([]);
  });

  it("matches a number field between min and max, both included", async () => {
    const { fields, ids } = await setUp();
    const min = `cf.${fields.number.id}.min`;
    const max = `cf.${fields.number.id}.max`;

    expect(idsOf(await list(asRavi, { [min]: "10" })).sort()).toEqual([ids.south, ids.east].sort());
    expect(idsOf(await list(asRavi, { [max]: "5" })).sort()).toEqual(
      [ids.north, ids.negative].sort(),
    );
    expect(idsOf(await list(asRavi, { [min]: "5", [max]: "10" })).sort()).toEqual(
      [ids.north, ids.south].sort(),
    );
    expect(idsOf(await list(asRavi, { [min]: "-3.5", [max]: "-3.5" }))).toEqual([ids.negative]);
    expect(idsOf(await list(asRavi, { [min]: "21" }))).toEqual([]);
  });

  it("matches a date field from a day to a day, both included", async () => {
    const { fields, ids } = await setUp();
    const from = `cf.${fields.date.id}.from`;
    const to = `cf.${fields.date.id}.to`;

    expect(idsOf(await list(asRavi, { [from]: "2026-12-31" })).sort()).toEqual(
      [ids.east, ids.negative].sort(),
    );
    expect(idsOf(await list(asRavi, { [to]: "2026-01-15" }))).toEqual([ids.north]);
    expect(idsOf(await list(asRavi, { [from]: "2026-01-16", [to]: "2026-12-30" }))).toEqual([
      ids.south,
    ]);
  });

  it("combines with the other filters, the search and the paging, and counts every match", async () => {
    const { fields, ids } = await setUp();

    const response = await list(asRavi, {
      [`cf.${fields.dropdown.id}`]: "Gold",
      [`cf.${fields.number.id}.min`]: "1",
      ownerId: ravi.id,
      pageSize: "1",
      sort: "createdAt",
      order: "asc",
    });

    expect(idsOf(response)).toEqual([ids.north]);
    expect((response.body as Envelope<unknown>).meta).toEqual({ page: 1, pageSize: 1, total: 2 });
  });

  it("never shows a record the caller may not see", async () => {
    const { fields, ids } = await setUp();
    const query = { [`cf.${fields.text.id}`]: "North region" };

    expect(idsOf(await list(asRavi, query))).toEqual([ids.north]);
    expect(idsOf(await list(asUma, query))).toEqual([ids.umas]);
    expect(idsOf(await list(asAdmin, query)).sort()).toEqual([ids.north, ids.umas].sort());
    expect(idsOf(await list(asViewer, query)).sort()).toEqual([ids.north, ids.umas].sort());
    expect(idsOf(await list(asMeera, query))).toEqual([ids.north]);
  });

  it("ignores a filter that is sent empty", async () => {
    const { fields } = await setUp();

    const response = await list(asRavi, {
      [`cf.${fields.text.id}`]: " ",
      [`cf.${fields.number.id}.min`]: "",
    });

    expect(response.status).toBe(200);
    expect(idsOf(response)).toHaveLength(5);
  });

  it("refuses a filter that does not fit, naming the parameter", async () => {
    const { fields } = await setUp();
    const archived = await makeField(kind.type, "Old");
    await asAdmin.post(`${FIELDS}/${archived.id}/archive`);
    const foreign = await makeField(kind.type === "LEAD" ? "CONTACT" : "LEAD", "Other type");

    const bad: [string, string][] = [
      [`cf.${UNKNOWN_ID}`, "x"],
      [`cf.${archived.id}`, "x"],
      [`cf.${foreign.id}`, "x"],
      ["cf.not-a-uuid", "x"],
      ["cf.", "x"],
      [`cf.${fields.text.id}.contains`, "x"],
      [`cf.${fields.text.id}.min`, "1"],
      [`cf.${fields.dropdown.id}.from`, "2026-01-01"],
      [`cf.${fields.number.id}`, "5"],
      [`cf.${fields.number.id}.min`, "five"],
      [`cf.${fields.number.id}.from`, "5"],
      [`cf.${fields.date.id}`, "2026-01-01"],
      [`cf.${fields.date.id}.from`, "01/01/2026"],
      [`cf.${fields.date.id}.max`, "2026-01-01"],
      [`cf.${fields.text.id}`, "x".repeat(101)],
      [`cf.${fields.text.id}') OR 1=1 --`, "x"],
    ];
    for (const [key, value] of bad) {
      const response = await list(asRavi, { [key]: value });

      expect(response.status, key).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual([key]);
    }
  });

  it("refuses a filter that is sent twice", async () => {
    const { fields } = await setUp();
    const key = `cf.${fields.text.id}`;

    const response = await asRavi.get(`${kind.path}?${key}=a&${key}=b`);

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual([key]);
  });

  it("treats a value that looks like SQL as text", async () => {
    const { fields } = await setUp();

    const response = await list(asRavi, { [`cf.${fields.text.id}`]: "' OR '1'='1" });

    expect(response.status).toBe(200);
    expect(idsOf(response)).toEqual([]);
  });
});

describe("filtering the board by custom fields", () => {
  it("narrows the cards, the counts and the totals", async () => {
    const tier = await makeField("OPPORTUNITY", "Tier", "DROPDOWN", {
      options: ["Gold", "Silver"],
    });
    const make = (name: string, value: number, option: string) =>
      asRavi
        .post("/api/v1/opportunities")
        .send({ name, value, customFields: { [tier.id]: option } });
    await make("Gold deal", 100, "Gold");
    await make("Silver deal", 50, "Silver");

    const response = await asRavi
      .get("/api/v1/opportunities/board")
      .query({ [`cf.${tier.id}`]: "Gold" });

    expect(response.status).toBe(200);
    const [first] = (
      response.body as Envelope<
        { count: number; totalValue: number; opportunities: { name: string }[] }[]
      >
    ).data;
    expect(first?.count).toBe(1);
    expect(first?.totalValue).toBe(100);
    expect(first?.opportunities.map((card) => card.name)).toEqual(["Gold deal"]);

    const bad = await asRavi
      .get("/api/v1/opportunities/board")
      .query({ [`cf.${UNKNOWN_ID}`]: "Gold" });
    expect(bad.status).toBe(400);
  });
});
