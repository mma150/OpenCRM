import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { parseCsv } from "../../lib/csv";
import { prisma } from "../../lib/prisma";
import * as timeline from "../../lib/timeline";

interface ImportField {
  key: string;
  label: string;
  required: boolean;
  kind: string;
  options?: string[];
}

interface ImportPreview {
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  suggestedMapping: Record<string, string | null>;
}

interface RowMessage {
  field: string | null;
  column: string | null;
  message: string;
}

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  companiesCreated: number;
  errors: { row: number; values: Record<string, string>; messages: RowMessage[] }[];
  errorsTruncated: boolean;
  failedCsv: string | null;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const IMPORTS = "/api/v1/imports";
const PREVIEW = `${IMPORTS}/preview`;
const IMPORT_FIELDS = `${IMPORTS}/fields`;
const CUSTOM_FIELDS = "/api/v1/custom-fields";
const BOM = "﻿";

const app = createTestApp();

// Meera manages Ravi. Uma is a rep without a manager.
let admin: User;
let meera: User;
let ravi: User;
let uma: User;
let viewer: User;
let deactivated: User;

let asAdmin: Agent;
let asMeera: Agent;
let asRavi: Agent;
let asViewer: Agent;

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function details(response: request.Response): ValidationDetail[] {
  return errorOf(response).details as ValidationDetail[];
}

function resultOf(response: request.Response): ImportResult {
  expect(response.status).toBe(200);
  return (response.body as Envelope<ImportResult>).data;
}

function previewOf(response: request.Response): ImportPreview {
  expect(response.status).toBe(200);
  return (response.body as Envelope<ImportPreview>).data;
}

function fieldsOf(response: request.Response): ImportField[] {
  return (response.body as Envelope<ImportField[]>).data;
}

// A file from its lines.
function csv(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

async function makeCustomField(
  recordType: string,
  label: string,
  type: string,
  extra: { options?: string[]; required?: boolean } = {},
): Promise<string> {
  const response = await asAdmin.post(CUSTOM_FIELDS).send({ recordType, label, type, ...extra });
  expect(response.status).toBe(201);
  return (response.body as Envelope<{ id: string }>).data.id;
}

const NAME_MAPPING = { "First name": "firstName", "Last name": "lastName" };

// The file most lead tests import: five data rows, two of them bad, an empty line, and a
// cell with a line break in it.
const LEADS_CSV = [
  "First name,Last name,E-mail,Phone number,Company,Lead Source,Value,Notes",
  'Asha,Rao,Asha@Example.com,+44 20 7946 0000,"Acme, Inc.",Cold call,"1,200.50",Met at the expo',
  ",Nameless,none@example.com,,,,,",
  "Ben,Okafor,not-an-email,,,Hot,12k,",
  "",
  'Mia,Person,multi@example.com,,,referral,,"A note with',
  'a line break"',
  "Dee,Lopez",
  "",
].join("\r\n");

const LEADS_MAPPING = {
  "First name": "firstName",
  "Last name": "lastName",
  "E-mail": "email",
  "Phone number": "phone",
  Company: "company",
  "Lead Source": "source",
  Value: "estimatedValue",
  Notes: "notes",
};

beforeAll(async () => {
  await resetDatabase();
  admin = await createUser({ name: "Asha Admin", role: "ADMIN" });
  meera = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
  ravi = await createUser({ name: "Ravi Rep", role: "SALES_REP", managerId: meera.id });
  uma = await createUser({ name: "Uma Rep", role: "SALES_REP" });
  viewer = await createUser({ name: "Vik Viewer", role: "READ_ONLY" });
  deactivated = await createUser({ name: "Dev Deactivated", role: "SALES_REP", isActive: false });

  asAdmin = await signInAs(app, admin);
  asMeera = await signInAs(app, meera);
  asRavi = await signInAs(app, ravi);
  asViewer = await signInAs(app, viewer);
});

beforeEach(async () => {
  await resetRecords();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("GET /imports/fields", () => {
  it("lists a lead's fields, then its custom fields in use", async () => {
    const region = await makeCustomField("LEAD", "Region", "TEXT", { required: true });
    const tier = await makeCustomField("LEAD", "Tier", "DROPDOWN", { options: ["Gold", "Silver"] });
    const seats = await makeCustomField("LEAD", "Seats", "NUMBER");
    const renewal = await makeCustomField("LEAD", "Renewal", "DATE");
    const old = await makeCustomField("LEAD", "Old", "TEXT");
    await asAdmin.post(`${CUSTOM_FIELDS}/${old}/archive`);
    await makeCustomField("CONTACT", "Not a lead's", "TEXT");

    const response = await asRavi.get(IMPORT_FIELDS).query({ type: "LEAD" });

    expect(response.status).toBe(200);
    expect(fieldsOf(response)).toEqual([
      { key: "firstName", label: "First name", required: true, kind: "TEXT" },
      { key: "lastName", label: "Last name", required: true, kind: "TEXT" },
      { key: "company", label: "Company", required: false, kind: "TEXT" },
      { key: "jobTitle", label: "Job title", required: false, kind: "TEXT" },
      { key: "email", label: "Email", required: false, kind: "EMAIL" },
      { key: "phone", label: "Phone", required: false, kind: "TEXT" },
      {
        key: "source",
        label: "Source",
        required: false,
        kind: "DROPDOWN",
        options: ["WEBSITE", "REFERRAL", "COLD_CALL", "EVENT", "OTHER"],
      },
      { key: "estimatedValue", label: "Estimated value", required: false, kind: "NUMBER" },
      { key: "notes", label: "Notes", required: false, kind: "TEXT" },
      { key: `cf:${region}`, label: "Region", required: true, kind: "TEXT" },
      {
        key: `cf:${tier}`,
        label: "Tier",
        required: false,
        kind: "DROPDOWN",
        options: ["Gold", "Silver"],
      },
      { key: `cf:${seats}`, label: "Seats", required: false, kind: "NUMBER" },
      { key: `cf:${renewal}`, label: "Renewal", required: false, kind: "DATE" },
    ]);
  });

  it("lists a contact's and a company's fields", async () => {
    const contact = fieldsOf(await asRavi.get(IMPORT_FIELDS).query({ type: "CONTACT" }));
    const company = fieldsOf(await asRavi.get(IMPORT_FIELDS).query({ type: "COMPANY" }));

    expect(contact.map(({ key, required }) => [key, required])).toEqual([
      ["firstName", true],
      ["lastName", true],
      ["jobTitle", false],
      ["email", false],
      ["phone", false],
      ["companyName", false],
      ["notes", false],
    ]);
    expect(contact.find((field) => field.key === "companyName")?.label).toBe("Company name");
    expect(company.map(({ key, required }) => [key, required])).toEqual([
      ["name", true],
      ["website", false],
      ["industry", false],
      ["phone", false],
      ["address", false],
      ["notes", false],
    ]);
  });

  it.each([{}, { type: "OPPORTUNITY" }, { type: "lead" }])(
    "refuses the query %j",
    async (query) => {
      const response = await asRavi.get(IMPORT_FIELDS).query(query);

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(details(response)[0]?.path).toBe("type");
    },
  );
});

describe("who may import", () => {
  it("is not for a Read-only user, on any of the three routes", async () => {
    const body = { type: "LEAD", csv: csv("First name,Last name", "A,B"), mapping: NAME_MAPPING };

    const responses = [
      await asViewer.get(IMPORT_FIELDS).query({ type: "LEAD" }),
      await asViewer.post(PREVIEW).send({ type: "LEAD", csv: body.csv }),
      await asViewer.post(IMPORTS).send(body),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe("FORBIDDEN");
    }
    expect(await prisma.lead.count()).toBe(0);
  });

  it("needs a session, whatever the size of the body", async () => {
    const response = await request(app)
      .post(IMPORTS)
      .send({ type: "LEAD", csv: "x".repeat(300_000), mapping: {} });

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe("UNAUTHENTICATED");
  });

  it.each([
    ["an Admin", () => asAdmin, () => admin],
    ["a Sales Manager", () => asMeera, () => meera],
    ["a Sales Rep", () => asRavi, () => ravi],
  ])("lets %s import, as the owner and the creator", async (_, as, user) => {
    const result = resultOf(
      await as()
        .post(IMPORTS)
        .send({ type: "LEAD", csv: csv("First name,Last name", "A,B"), mapping: NAME_MAPPING }),
    );

    expect(result.created).toBe(1);
    const lead = await prisma.lead.findFirstOrThrow();
    expect(lead).toMatchObject({
      ownerId: user().id,
      createdById: user().id,
      status: "NEW",
      source: "OTHER",
    });
  });

  it("gives the records to ownerId when the caller may assign to that user", async () => {
    const body = { type: "LEAD", csv: csv("First name,Last name", "A,B"), mapping: NAME_MAPPING };

    const result = resultOf(await asMeera.post(IMPORTS).send({ ...body, ownerId: ravi.id }));

    expect(result.created).toBe(1);
    const lead = await prisma.lead.findFirstOrThrow();
    expect(lead).toMatchObject({ ownerId: ravi.id, createdById: meera.id });
    const entry = await prisma.timelineEntry.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(entry.authorId).toBe(meera.id);
  });

  it.each([
    ["a rep to another rep", () => asRavi, () => uma],
    ["a manager to someone outside the team", () => asMeera, () => uma],
    ["an Admin to a Read-only user", () => asAdmin, () => viewer],
    ["an Admin to a deactivated user", () => asAdmin, () => deactivated],
  ])("refuses %s, and imports nothing", async (_, as, owner) => {
    const body = { type: "LEAD", csv: csv("First name,Last name", "A,B"), mapping: NAME_MAPPING };

    const response = await as()
      .post(IMPORTS)
      .send({ ...body, ownerId: owner().id });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(details(response).map((detail) => detail.path)).toEqual(["ownerId"]);
    expect(await prisma.lead.count()).toBe(0);
  });
});

describe("POST /imports/preview", () => {
  it("answers with the columns, the first rows, the row count and a suggested mapping", async () => {
    const response = await asRavi.post(PREVIEW).send({ type: "LEAD", csv: LEADS_CSV });

    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(previewOf(response)).toEqual({
      headers: [
        "First name",
        "Last name",
        "E-mail",
        "Phone number",
        "Company",
        "Lead Source",
        "Value",
        "Notes",
      ],
      sampleRows: [
        [
          "Asha",
          "Rao",
          "Asha@Example.com",
          "+44 20 7946 0000",
          "Acme, Inc.",
          "Cold call",
          "1,200.50",
          "Met at the expo",
        ],
        ["", "Nameless", "none@example.com", "", "", "", "", ""],
        ["Ben", "Okafor", "not-an-email", "", "", "Hot", "12k", ""],
        [
          "Mia",
          "Person",
          "multi@example.com",
          "",
          "",
          "referral",
          "",
          "A note with\r\na line break",
        ],
        ["Dee", "Lopez", "", "", "", "", "", ""],
      ],
      rowCount: 5,
      suggestedMapping: LEADS_MAPPING,
    });
    expect(await prisma.lead.count()).toBe(0);
  });

  it("shows only the first five rows and counts them all", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => `Lead,${String(index)}`);

    const preview = previewOf(
      await asRavi.post(PREVIEW).send({ type: "LEAD", csv: csv("First name,Last name", ...rows) }),
    );

    expect(preview.rowCount).toBe(12);
    expect(preview.sampleRows).toEqual([
      ["Lead", "0"],
      ["Lead", "1"],
      ["Lead", "2"],
      ["Lead", "3"],
      ["Lead", "4"],
    ]);
  });

  it("suggests fields by other common names, whatever the case and punctuation", async () => {
    const region = await makeCustomField("CONTACT", "Sales Region", "TEXT");
    const headers = [
      "GIVEN NAME",
      "surname",
      "Email Address",
      "Mobile",
      "Organisation",
      "Job Title",
      "comments",
      "sales_region",
      "Favourite colour",
      "Error",
    ];

    const preview = previewOf(
      await asRavi
        .post(PREVIEW)
        .send({ type: "CONTACT", csv: csv(headers.join(","), "a,b,c,d,e,f,g,h,i,j") }),
    );

    expect(preview.suggestedMapping).toEqual({
      "GIVEN NAME": "firstName",
      surname: "lastName",
      "Email Address": "email",
      Mobile: "phone",
      Organisation: "companyName",
      "Job Title": "jobTitle",
      comments: "notes",
      sales_region: `cf:${region}`,
      "Favourite colour": null,
      Error: null,
    });
  });

  it("suggests each field for one column only, and a company's own names", async () => {
    const contact = previewOf(
      await asRavi
        .post(PREVIEW)
        .send({ type: "CONTACT", csv: csv("Email,E-mail,Phone,Telephone", "a,b,c,d") }),
    );
    const company = previewOf(
      await asRavi
        .post(PREVIEW)
        .send({ type: "COMPANY", csv: csv("Company,URL,Sector,Location", "a,b,c,d") }),
    );

    expect(contact.suggestedMapping).toEqual({
      Email: "email",
      "E-mail": null,
      Phone: "phone",
      Telephone: null,
    });
    expect(company.suggestedMapping).toEqual({
      Company: "name",
      URL: "website",
      Sector: "industry",
      Location: "address",
    });
  });

  it("reads a file with a byte order mark, and ignores empty columns after the last one", async () => {
    const preview = previewOf(
      await asRavi
        .post(PREVIEW)
        .send({ type: "LEAD", csv: `${BOM}First name,Last name,,\r\nA,B,,\r\n` }),
    );

    expect(preview.headers).toEqual(["First name", "Last name"]);
    expect(preview.sampleRows).toEqual([["A", "B"]]);
  });

  it.each([
    ["an empty file", "", "The file is empty"],
    ["a file of empty lines", "\n\n , \n", "The file is empty"],
    ["a first row without names", csv(",,", "A,B,C"), "The first row must hold the column names"],
    [
      "a column without a name",
      csv("First name,,Last name", "A,x,B"),
      "Column 2 has no name in the first row",
    ],
    [
      "two columns with one name",
      csv("First name,Email,email", "A,b,c"),
      'The column "email" appears more than once',
    ],
    [
      "only the column names",
      csv("First name,Last name"),
      "The file has no rows below the column names",
    ],
    [
      "a quoted cell that is never closed",
      csv("First name,Last name", 'A,"B'),
      "The file is not valid CSV: a quoted cell is never closed",
    ],
  ])("refuses %s, on preview and on import", async (_, file, message) => {
    const preview = await asRavi.post(PREVIEW).send({ type: "LEAD", csv: file });
    const run = await asRavi.post(IMPORTS).send({ type: "LEAD", csv: file, mapping: NAME_MAPPING });

    for (const response of [preview, run]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(details(response)).toEqual([{ path: "csv", message }]);
    }
    expect(await prisma.lead.count()).toBe(0);
  });

  it("refuses more than 5,000 rows with VALIDATION_FAILED", async () => {
    const file = csv("First name,Last name", ...Array.from({ length: 5001 }, () => "A,B"));

    const preview = await asRavi.post(PREVIEW).send({ type: "LEAD", csv: file });
    const run = await asRavi.post(IMPORTS).send({ type: "LEAD", csv: file, mapping: NAME_MAPPING });

    for (const response of [preview, run]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(details(response)).toEqual([
        { path: "csv", message: "The file has 5001 rows; import at most 5000 at a time" },
      ]);
    }
    expect(await prisma.lead.count()).toBe(0);
  });

  it("refuses a file over 5 MB with PAYLOAD_TOO_LARGE", async () => {
    const file = csv("First name,Last name", `A,${"x".repeat(5 * 1024 * 1024)}`);

    const preview = await asRavi.post(PREVIEW).send({ type: "LEAD", csv: file });
    const run = await asRavi.post(IMPORTS).send({ type: "LEAD", csv: file, mapping: NAME_MAPPING });

    for (const response of [preview, run]) {
      expect(response.status).toBe(413);
      expect(errorOf(response)).toEqual({
        code: "PAYLOAD_TOO_LARGE",
        message: "The file is larger than 5 MB",
        details: null,
      });
    }
  });

  it("refuses a body over 12 MB before reading it", async () => {
    const response = await asRavi
      .post(PREVIEW)
      .send({ type: "LEAD", csv: "x".repeat(13 * 1024 * 1024) });

    expect(response.status).toBe(413);
    expect(errorOf(response).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("takes a body far over the 100 kB every other route allows", async () => {
    const rows = Array.from(
      { length: 4000 },
      (_, index) => `Lead,${String(index)},${"n".repeat(100)}`,
    );
    const file = csv("First name,Last name,Notes", ...rows);

    const preview = await asRavi.post(PREVIEW).send({ type: "LEAD", csv: file });
    const elsewhere = await asRavi
      .post("/api/v1/leads")
      .send({ firstName: "A", lastName: "B", source: "OTHER", notes: file });

    expect(previewOf(preview).rowCount).toBe(4000);
    expect(elsewhere.status).toBe(413);
  });
});

describe("POST /imports: the mapping", () => {
  it("reports every problem with the mapping at once, and imports nothing", async () => {
    const response = await asRavi.post(IMPORTS).send({
      type: "LEAD",
      csv: csv("First name,Last name,Other,E-mail", "A,B,C,d@example.com"),
      mapping: {
        Nope: "firstName",
        "First name": "bogus",
        "Last name": "lastName",
        Other: "lastName",
        "E-mail": null,
      },
    });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(details(response)).toEqual([
      { path: "mapping.Nope", message: "The file has no column with this name" },
      { path: "mapping.First name", message: "This is not a field that can be imported" },
      { path: "mapping.Other", message: '"Last name" is already mapped to the column "Last name"' },
      { path: "mapping", message: 'Map a column to "First name"' },
    ]);
    expect(await prisma.lead.count()).toBe(0);
  });

  it("needs every required field mapped, a required custom field included", async () => {
    await makeCustomField("LEAD", "Region", "TEXT", { required: true });

    const response = await asRavi.post(IMPORTS).send({
      type: "LEAD",
      csv: csv("First name,Last name", "A,B"),
      mapping: { "First name": "firstName" },
    });

    expect(response.status).toBe(400);
    expect(details(response)).toEqual([
      { path: "mapping", message: 'Map a column to "Last name"' },
      { path: "mapping", message: 'Map a column to "Region"' },
    ]);
  });

  it("refuses a field of another record type", async () => {
    const contactField = await makeCustomField("CONTACT", "Region", "TEXT");

    const response = await asRavi.post(IMPORTS).send({
      type: "LEAD",
      csv: csv("First name,Last name,Region,Co", "A,B,North,Acme"),
      mapping: { ...NAME_MAPPING, Region: `cf:${contactField}`, Co: "companyName" },
    });

    expect(response.status).toBe(400);
    expect(details(response).map((detail) => detail.path)).toEqual([
      "mapping.Region",
      "mapping.Co",
    ]);
  });

  it("leaves a column out when it is mapped to null or not mentioned", async () => {
    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "LEAD",
        csv: csv("First name,Last name,E-mail,Notes", "A,B,not-an-email,Secret"),
        mapping: { ...NAME_MAPPING, "E-mail": null },
      }),
    );

    expect(result.created).toBe(1);
    expect(await prisma.lead.findFirstOrThrow()).toMatchObject({ email: null, notes: null });
  });

  it.each([
    ["no mapping", { mapping: undefined }, "mapping"],
    ["a mapping to a number", { mapping: { "First name": 1 } }, "mapping.First name"],
    ["an ownerId that is not an id", { ownerId: "me" }, "ownerId"],
    ["skipDuplicates that is not true or false", { skipDuplicates: "yes" }, "skipDuplicates"],
    ["an unknown type", { type: "OPPORTUNITY" }, "type"],
    ["a csv that is not text", { csv: ["a,b"] }, "csv"],
  ])("refuses %s", async (_, change, path) => {
    const body = { type: "LEAD", csv: csv("First name,Last name", "A,B"), mapping: NAME_MAPPING };

    const response = await asRavi.post(IMPORTS).send({ ...body, ...change });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(details(response)[0]?.path).toBe(path);
  });
});

describe("POST /imports: leads", () => {
  it("creates the rows that pass and reports the rest by spreadsheet row number", async () => {
    const response = await asRavi
      .post(IMPORTS)
      .send({ type: "LEAD", csv: LEADS_CSV, mapping: LEADS_MAPPING });

    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    const result = resultOf(response);
    expect(result).toMatchObject({
      total: 5,
      created: 3,
      skipped: 0,
      failed: 2,
      companiesCreated: 0,
      errorsTruncated: false,
    });
    // The header row is row 1, so the first data row is row 2.
    expect(result.errors).toEqual([
      {
        row: 3,
        values: {
          "First name": "",
          "Last name": "Nameless",
          "E-mail": "none@example.com",
          "Phone number": "",
          Company: "",
          "Lead Source": "",
          Value: "",
          Notes: "",
        },
        messages: [{ field: "First name", column: "First name", message: "Enter a name" }],
      },
      {
        row: 4,
        values: {
          "First name": "Ben",
          "Last name": "Okafor",
          "E-mail": "not-an-email",
          "Phone number": "",
          Company: "",
          "Lead Source": "Hot",
          Value: "12k",
          Notes: "",
        },
        messages: [
          {
            field: "Source",
            column: "Lead Source",
            message: "Use one of: Website, Referral, Cold call, Event, Other",
          },
          { field: "Estimated value", column: "Value", message: "Enter a number such as 1200.50" },
          { field: "Email", column: "E-mail", message: "Enter a valid email" },
        ],
      },
    ]);

    const leads = await prisma.lead.findMany({ orderBy: { firstName: "asc" } });
    expect(leads.map((lead) => `${lead.firstName} ${lead.lastName}`)).toEqual([
      "Asha Rao",
      "Dee Lopez",
      "Mia Person",
    ]);
    expect(leads[0]).toMatchObject({
      email: "asha@example.com",
      phone: "+44 20 7946 0000",
      company: "Acme, Inc.",
      source: "COLD_CALL",
      notes: "Met at the expo",
      status: "NEW",
      ownerId: ravi.id,
      createdById: ravi.id,
      customFields: {},
    });
    expect(leads[0]?.estimatedValue?.toNumber()).toBe(1200.5);
    // A row without a source is given OTHER; a row with fewer cells has empty cells.
    expect(leads[1]).toMatchObject({
      source: "OTHER",
      email: null,
      company: null,
      estimatedValue: null,
    });
    expect(leads[2]).toMatchObject({ source: "REFERRAL", notes: "A note with\r\na line break" });
  });

  it("hands back the failed rows as a file with the reason in an Error column", async () => {
    const result = resultOf(
      await asRavi.post(IMPORTS).send({ type: "LEAD", csv: LEADS_CSV, mapping: LEADS_MAPPING }),
    );

    expect(result.failedCsv?.startsWith(BOM)).toBe(true);
    expect(parseCsv(result.failedCsv ?? "")).toEqual([
      [
        "First name",
        "Last name",
        "E-mail",
        "Phone number",
        "Company",
        "Lead Source",
        "Value",
        "Notes",
        "Error",
      ],
      ["", "Nameless", "none@example.com", "", "", "", "", "", "First name: Enter a name"],
      [
        "Ben",
        "Okafor",
        "not-an-email",
        "",
        "",
        "Hot",
        "12k",
        "",
        "Source: Use one of: Website, Referral, Cold call, Event, Other; Estimated value: Enter a number such as 1200.50; Email: Enter a valid email",
      ],
    ]);
  });

  it("imports the corrected failed rows file, reusing its Error column", async () => {
    const first = resultOf(
      await asRavi.post(IMPORTS).send({ type: "LEAD", csv: LEADS_CSV, mapping: LEADS_MAPPING }),
    );
    // The user fixes one row and leaves the other as it was.
    const corrected = (first.failedCsv ?? "").replace(",Nameless,", "Nia,Nameless,");

    const preview = previewOf(await asRavi.post(PREVIEW).send({ type: "LEAD", csv: corrected }));
    const second = resultOf(
      await asRavi
        .post(IMPORTS)
        .send({ type: "LEAD", csv: corrected, mapping: preview.suggestedMapping }),
    );

    expect(preview.suggestedMapping).toEqual({ ...LEADS_MAPPING, Error: null });
    expect(second).toMatchObject({ total: 2, created: 1, failed: 1 });
    expect(second.errors.map((error) => error.row)).toEqual([3]);
    expect(parseCsv(second.failedCsv ?? "")[0]).toEqual([...Object.keys(LEADS_MAPPING), "Error"]);
    expect(await prisma.lead.count({ where: { firstName: "Nia" } })).toBe(1);
  });

  it("answers failedCsv null and no errors when every row passes", async () => {
    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "LEAD",
        csv: csv("First name,Last name", "A,B", "C,D"),
        mapping: NAME_MAPPING,
      }),
    );

    expect(result).toEqual({
      total: 2,
      created: 2,
      skipped: 0,
      failed: 0,
      companiesCreated: 0,
      errors: [],
      errorsTruncated: false,
      failedCsv: null,
    });
  });

  it("writes a CREATED timeline entry for each lead, marked as an import", async () => {
    await asRavi.post(IMPORTS).send({
      type: "LEAD",
      csv: csv("First name,Last name", "A,B", "C,D"),
      mapping: NAME_MAPPING,
    });

    const leads = await prisma.lead.findMany({ include: { timelineEntries: true } });
    expect(leads).toHaveLength(2);
    for (const lead of leads) {
      expect(lead.timelineEntries).toHaveLength(1);
      expect(lead.timelineEntries[0]).toMatchObject({
        kind: "CREATED",
        authorId: ravi.id,
        details: { import: true },
        occurredAt: lead.createdAt,
      });
    }
    // And the lead reads like any other.
    const read = await asRavi.get(`/api/v1/leads/${leads[0]?.id ?? ""}/timeline`);
    expect(read.status).toBe(200);
  });

  it("checks every row with the rules of the create route", async () => {
    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "LEAD",
        csv: csv(
          "First name,Last name,Value,Source,Phone",
          `${"x".repeat(101)},Long,,,`,
          "Neg,Value,-5,,",
          "Three,Decimals,1.234,,",
          "Good,Value,1200,event,",
          "Enum,Value,,COLD_CALL,",
          `Long,Phone,,,${"9".repeat(51)}`,
        ),
        mapping: { ...NAME_MAPPING, Value: "estimatedValue", Source: "source", Phone: "phone" },
      }),
    );

    expect(result).toMatchObject({ total: 6, created: 2, failed: 4 });
    expect(
      result.errors.map((error) => [error.row, error.messages.map((message) => message.field)]),
    ).toEqual([
      [2, ["First name"]],
      [3, ["Estimated value"]],
      [4, ["Estimated value"]],
      [7, ["Phone"]],
    ]);
    expect(result.errors[2]?.messages[0]?.message).toBe("Use at most two decimal places");
    const sources = await prisma.lead.findMany({
      select: { source: true },
      orderBy: { firstName: "asc" },
    });
    expect(sources.map((lead) => lead.source)).toEqual(["COLD_CALL", "EVENT"]);
  });

  it("fails a row with more cells than there are columns, and takes one with fewer", async () => {
    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "LEAD",
        csv: csv("First name,Last name,E-mail", "A,B,a@example.com,stray", "C,D,,,", "E,F"),
        mapping: { ...NAME_MAPPING, "E-mail": "email" },
      }),
    );

    expect(result).toMatchObject({ total: 3, created: 2, failed: 1 });
    expect(result.errors).toEqual([
      {
        row: 2,
        values: { "First name": "A", "Last name": "B", "E-mail": "a@example.com" },
        messages: [
          { field: null, column: null, message: "This row has more cells than there are columns" },
        ],
      },
    ]);
  });

  it("reads back what an export wrote: the apostrophe before a formula character is removed", async () => {
    await asRavi.post(IMPORTS).send({
      type: "LEAD",
      csv: csv("First name,Last name,Phone,Notes", "A,B,'+44 20 7946 0000,'=not a formula"),
      mapping: { ...NAME_MAPPING, Phone: "phone", Notes: "notes" },
    });
    const exported = await asRavi.get("/api/v1/leads/export");

    const again = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "LEAD",
        csv: exported.text,
        mapping: { ...NAME_MAPPING, Phone: "phone", Notes: "notes", Source: "source" },
      }),
    );

    expect(again.created).toBe(1);
    const leads = await prisma.lead.findMany();
    expect(leads).toHaveLength(2);
    for (const lead of leads) {
      expect(lead).toMatchObject({
        phone: "+44 20 7946 0000",
        notes: "=not a formula",
        source: "OTHER",
      });
    }
    // And the failed rows file is as safe to open as an export.
    const failed = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "LEAD",
        csv: csv("First name,Last name,E-mail", "=1+1,B,nope"),
        mapping: { ...NAME_MAPPING, "E-mail": "email" },
      }),
    );
    expect(failed.failedCsv).toContain("'=1+1,B,nope");
  });

  it("lists at most 200 failed rows, and all of them in the file", async () => {
    const rows = Array.from({ length: 201 }, (_, index) => `,Row ${String(index)}`);

    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "LEAD",
        csv: csv("First name,Last name", ...rows, "Good,Row"),
        mapping: NAME_MAPPING,
      }),
    );

    expect(result).toMatchObject({ total: 202, created: 1, failed: 201, errorsTruncated: true });
    expect(result.errors).toHaveLength(200);
    expect(result.errors.at(-1)?.row).toBe(201);
    expect(parseCsv(result.failedCsv ?? "")).toHaveLength(202);
  });

  it("imports 5,000 rows", async () => {
    const rows = Array.from(
      { length: 5000 },
      (_, index) => `Lead,${String(index)},lead${String(index)}@example.com`,
    );

    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "LEAD",
        csv: csv("First name,Last name,Email", ...rows),
        mapping: { ...NAME_MAPPING, Email: "email" },
      }),
    );

    expect(result).toMatchObject({ total: 5000, created: 5000, failed: 0 });
    expect(await prisma.lead.count()).toBe(5000);
    expect(await prisma.timelineEntry.count({ where: { kind: "CREATED" } })).toBe(5000);
  }, 120_000);

  it("saves a batch row by row when the batch fails, losing nothing", async () => {
    const rows = Array.from({ length: 150 }, (_, index) => `Lead,${String(index)}`);
    const spy = vi.spyOn(timeline, "addCreatedEntries").mockRejectedValueOnce(new Error("boom"));

    const result = resultOf(
      await asRavi
        .post(IMPORTS)
        .send({ type: "LEAD", csv: csv("First name,Last name", ...rows), mapping: NAME_MAPPING }),
    );

    expect(result).toMatchObject({ total: 150, created: 150, failed: 0 });
    // The first batch of 100 failed and was saved one row at a time; the second went in whole.
    expect(spy).toHaveBeenCalledTimes(102);
    expect(await prisma.lead.count()).toBe(150);
    expect(await prisma.timelineEntry.count()).toBe(150);
  });

  it("reports a row that cannot be saved, and never keeps a lead without its timeline entry", async () => {
    vi.spyOn(timeline, "addCreatedEntries").mockRejectedValue(new Error("boom"));

    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "LEAD",
        csv: csv("First name,Last name", "A,B", "C,D"),
        mapping: NAME_MAPPING,
      }),
    );

    expect(result).toMatchObject({ total: 2, created: 0, failed: 2 });
    expect(result.errors.map((error) => [error.row, error.messages])).toEqual([
      [2, [{ field: null, column: null, message: "This row could not be saved" }]],
      [3, [{ field: null, column: null, message: "This row could not be saved" }]],
    ]);
    expect(await prisma.lead.count()).toBe(0);
  });
});

describe("POST /imports: custom field values", () => {
  it("fills in each type of custom field and checks it like the create route", async () => {
    const region = await makeCustomField("LEAD", "Region", "TEXT", { required: true });
    const seats = await makeCustomField("LEAD", "Seats", "NUMBER");
    const renewal = await makeCustomField("LEAD", "Renewal", "DATE");
    const tier = await makeCustomField("LEAD", "Tier", "DROPDOWN", { options: ["Gold", "Silver"] });
    const file = csv(
      "First name,Last name,Region,Seats,Renewal,Tier",
      'Full,Row, North ,"1,250",2026-11-15,gold',
      "Bare,Row,South,,,",
      "Bad,Row,,many,15/11/2026,Bronze",
    );

    const preview = previewOf(await asRavi.post(PREVIEW).send({ type: "LEAD", csv: file }));
    const result = resultOf(
      await asRavi
        .post(IMPORTS)
        .send({ type: "LEAD", csv: file, mapping: preview.suggestedMapping }),
    );

    expect(preview.suggestedMapping).toMatchObject({
      Region: `cf:${region}`,
      Seats: `cf:${seats}`,
      Renewal: `cf:${renewal}`,
      Tier: `cf:${tier}`,
    });
    expect(result).toMatchObject({ total: 3, created: 2, failed: 1 });
    expect(result.errors[0]?.row).toBe(4);
    expect(result.errors[0]?.messages).toEqual([
      { field: "Seats", column: "Seats", message: "Enter a number such as 1200.50" },
      { field: "Tier", column: "Tier", message: "Use one of: Gold, Silver" },
      { field: "Renewal", column: "Renewal", message: "Enter a date such as 2026-11-15" },
      { field: "Region", column: "Region", message: "This field is required" },
    ]);
    const leads = await prisma.lead.findMany({ orderBy: { firstName: "asc" } });
    expect(leads.map((lead) => lead.customFields)).toEqual([
      { [region]: "South" },
      { [region]: "North", [seats]: 1250, [renewal]: "2026-11-15", [tier]: "Gold" },
    ]);
  });
});

describe("POST /imports: contacts", () => {
  const CONTACTS_CSV = csv(
    "First name,Last name,Email,Company",
    "Ann,One,ann@example.com,NORTHWIND",
    "Bo,Two,,Newco",
    "Cy,Three,,newco",
    "Di,Four,,Hidden Co",
    "Ed,Five,,",
  );
  const CONTACTS_MAPPING = { ...NAME_MAPPING, Email: "email", Company: "companyName" };

  async function setUp() {
    const northwind = await prisma.company.create({
      data: { name: "Northwind", ownerId: ravi.id, createdById: ravi.id },
    });
    const hidden = await prisma.company.create({
      data: { name: "Hidden Co", ownerId: uma.id, createdById: uma.id },
    });
    return { northwind, hidden };
  }

  it("links each contact to a visible company by name, and creates the ones that are missing", async () => {
    const { northwind, hidden } = await setUp();

    const result = resultOf(
      await asRavi
        .post(IMPORTS)
        .send({ type: "CONTACT", csv: CONTACTS_CSV, mapping: CONTACTS_MAPPING }),
    );

    expect(result).toMatchObject({ total: 5, created: 5, failed: 0, companiesCreated: 2 });
    const contacts = await prisma.contact.findMany({
      include: { company: true },
      orderBy: { firstName: "asc" },
    });
    expect(contacts.map((contact) => [contact.firstName, contact.company?.name ?? null])).toEqual([
      ["Ann", "Northwind"],
      ["Bo", "Newco"],
      ["Cy", "Newco"],
      ["Di", "Hidden Co"],
      ["Ed", null],
    ]);
    expect(contacts[0]).toMatchObject({
      companyId: northwind.id,
      email: "ann@example.com",
      ownerId: ravi.id,
    });
    // One Newco for both rows.
    expect(contacts[1]?.companyId).toBe(contacts[2]?.companyId);
    // A company the caller cannot see is never linked: the contact gets a company of its own.
    expect(contacts[3]?.companyId).not.toBe(hidden.id);
    expect(contacts[3]?.company).toMatchObject({ ownerId: ravi.id, createdById: ravi.id });

    const made = await prisma.company.findMany({
      where: { id: { notIn: [northwind.id, hidden.id] } },
      include: { timelineEntries: true },
    });
    expect(made.map((company) => company.name).sort()).toEqual(["Hidden Co", "Newco"]);
    for (const company of made) {
      expect(company.timelineEntries).toHaveLength(1);
      expect(company.timelineEntries[0]).toMatchObject({
        kind: "CREATED",
        details: { import: true },
      });
    }
    expect(await prisma.timelineEntry.count({ where: { contactId: { not: null } } })).toBe(5);
  });

  it("gives new companies to ownerId as well", async () => {
    await asMeera
      .post(IMPORTS)
      .send({ type: "CONTACT", csv: CONTACTS_CSV, mapping: CONTACTS_MAPPING, ownerId: ravi.id });

    const companies = await prisma.company.findMany();
    expect(companies.map((company) => company.name).sort()).toEqual([
      "Hidden Co",
      "NORTHWIND",
      "Newco",
    ]);
    for (const company of companies) {
      expect(company).toMatchObject({ ownerId: ravi.id, createdById: meera.id });
    }
  });

  it("fails the rows whose company does not exist when createCompanies is false", async () => {
    const { northwind } = await setUp();

    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "CONTACT",
        csv: CONTACTS_CSV,
        mapping: CONTACTS_MAPPING,
        createCompanies: false,
      }),
    );

    expect(result).toMatchObject({ total: 5, created: 2, failed: 3, companiesCreated: 0 });
    expect(result.errors.map((error) => [error.row, error.messages])).toEqual([
      [
        3,
        [
          {
            field: "Company name",
            column: "Company",
            message: 'No company called "Newco" was found',
          },
        ],
      ],
      [
        4,
        [
          {
            field: "Company name",
            column: "Company",
            message: 'No company called "newco" was found',
          },
        ],
      ],
      [
        5,
        [
          {
            field: "Company name",
            column: "Company",
            message: 'No company called "Hidden Co" was found',
          },
        ],
      ],
    ]);
    expect(await prisma.company.count()).toBe(2);
    const ann = await prisma.contact.findFirstOrThrow({ where: { firstName: "Ann" } });
    expect(ann.companyId).toBe(northwind.id);
  });

  it("creates no company for a row that fails", async () => {
    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "CONTACT",
        csv: csv("First name,Last name,Email,Company", "Ann,One,nope,Ghost Co"),
        mapping: CONTACTS_MAPPING,
      }),
    );

    expect(result).toMatchObject({ created: 0, failed: 1, companiesCreated: 0 });
    expect(await prisma.company.count()).toBe(0);
  });
});

describe("POST /imports: companies", () => {
  it("creates companies and checks them like the create route", async () => {
    const segment = await makeCustomField("COMPANY", "Segment", "DROPDOWN", {
      options: ["SMB", "Enterprise"],
    });

    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "COMPANY",
        csv: csv(
          "Company,URL,Sector,Segment",
          "Northwind,northwind.example,Retail,smb",
          "Bad Site,javascript:alert(1),Retail,",
          ",nameless.example,,",
        ),
        mapping: { Company: "name", URL: "website", Sector: "industry", Segment: `cf:${segment}` },
      }),
    );

    expect(result).toMatchObject({ total: 3, created: 1, failed: 2 });
    expect(
      result.errors.map((error) => [error.row, error.messages.map((message) => message.field)]),
    ).toEqual([
      [3, ["Website"]],
      [4, ["Name"]],
    ]);
    const company = await prisma.company.findFirstOrThrow({ include: { timelineEntries: true } });
    expect(company).toMatchObject({
      name: "Northwind",
      website: "northwind.example",
      industry: "Retail",
      ownerId: ravi.id,
      customFields: { [segment]: "SMB" },
    });
    expect(company.timelineEntries[0]).toMatchObject({
      kind: "CREATED",
      details: { import: true },
    });
  });
});

describe("POST /imports: skipDuplicates", () => {
  const file = csv(
    "First name,Last name,Email",
    "Dup,Existing,A@Example.com",
    "Not,Visible,u@example.com",
    "New,One,new@example.com",
    "New,Again,NEW@example.com",
    "No,Email,",
    "No,Email,",
  );
  const mapping = { ...NAME_MAPPING, Email: "email" };

  it.each(["LEAD", "CONTACT"] as const)(
    "skips a %s whose email a visible record or an earlier row has",
    async (type) => {
      const base = { firstName: "Old", lastName: "Record", createdById: admin.id };
      if (type === "LEAD") {
        await prisma.lead.create({
          data: { ...base, source: "OTHER", email: "a@example.com", ownerId: ravi.id },
        });
        await prisma.lead.create({
          data: { ...base, source: "OTHER", email: "u@example.com", ownerId: uma.id },
        });
      } else {
        await prisma.contact.create({
          data: { ...base, email: "a@example.com", ownerId: ravi.id },
        });
        await prisma.contact.create({ data: { ...base, email: "u@example.com", ownerId: uma.id } });
      }

      const result = resultOf(
        await asRavi.post(IMPORTS).send({ type, csv: file, mapping, skipDuplicates: true }),
      );

      // Uma's record is not one Ravi can see, so its email does not count.
      expect(result).toMatchObject({
        total: 6,
        created: 4,
        skipped: 2,
        failed: 0,
        failedCsv: null,
      });
    },
  );

  it("creates duplicates when it is not asked to skip them", async () => {
    await prisma.lead.create({
      data: {
        firstName: "Old",
        lastName: "Record",
        source: "OTHER",
        email: "a@example.com",
        ownerId: ravi.id,
        createdById: ravi.id,
      },
    });

    const result = resultOf(await asRavi.post(IMPORTS).send({ type: "LEAD", csv: file, mapping }));

    expect(result).toMatchObject({ total: 6, created: 6, skipped: 0 });
    expect(await prisma.lead.count({ where: { email: "a@example.com" } })).toBe(2);
  });

  it("skips a deleted record's email no longer", async () => {
    await prisma.lead.create({
      data: {
        firstName: "Old",
        lastName: "Record",
        source: "OTHER",
        email: "a@example.com",
        ownerId: ravi.id,
        createdById: ravi.id,
        deletedAt: new Date(),
      },
    });

    const result = resultOf(
      await asRavi.post(IMPORTS).send({ type: "LEAD", csv: file, mapping, skipDuplicates: true }),
    );

    expect(result).toMatchObject({ created: 5, skipped: 1 });
  });

  it("skips a company whose name a visible company or an earlier row has", async () => {
    await prisma.company.create({ data: { name: "Acme", ownerId: ravi.id, createdById: ravi.id } });
    await prisma.company.create({ data: { name: "Umas", ownerId: uma.id, createdById: uma.id } });

    const result = resultOf(
      await asRavi.post(IMPORTS).send({
        type: "COMPANY",
        csv: csv("Name", "ACME", "Beta", "beta", "Umas", "100%"),
        mapping: { Name: "name" },
        skipDuplicates: true,
      }),
    );

    expect(result).toMatchObject({ total: 5, created: 3, skipped: 2 });
    const mine = await prisma.company.findMany({
      where: { ownerId: ravi.id },
      orderBy: { name: "asc" },
    });
    expect(mine.map((company) => company.name)).toEqual(["100%", "Acme", "Beta", "Umas"]);
  });
});
