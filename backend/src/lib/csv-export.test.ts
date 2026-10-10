import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  resetRecords,
  sessionCookie,
  signInAs,
  type ValidationDetail,
} from "../../test/helpers";
import type { User } from "../generated/prisma/client";
import { parseCsv } from "./csv";
import { EXPORT_ROW_LIMIT } from "./csv-export";
import { prisma } from "./prisma";
import { createSession } from "./sessions";
import { dayIn } from "./time-zone";

// The CSV exports of the five lists (DATA-03), through their routes.

type Agent = Awaited<ReturnType<typeof signInAs>>;

interface Created {
  data: { id: string };
}

const API = "/api/v1";
const BOM = "﻿";

const HEADERS = {
  leads: [
    "First name",
    "Last name",
    "Company",
    "Job title",
    "Email",
    "Phone",
    "Source",
    "Status",
    "Owner",
    "Estimated value",
    "Notes",
    "Lost reason",
    "Lost note",
    "Last contact",
    "Follow-up",
    "Follow-up note",
    "Created",
    "Updated",
  ],
  contacts: [
    "First name",
    "Last name",
    "Job title",
    "Email",
    "Phone",
    "Company",
    "Owner",
    "Notes",
    "Last contact",
    "Created",
    "Updated",
  ],
  companies: [
    "Name",
    "Website",
    "Industry",
    "Phone",
    "Address",
    "Owner",
    "Contacts",
    "Notes",
    "Created",
    "Updated",
  ],
  opportunities: [
    "Name",
    "Value",
    "Stage",
    "Status",
    "Expected close date",
    "Contact",
    "Company",
    "Owner",
    "Close reason",
    "Closed",
    "Notes",
    "Last contact",
    "Follow-up",
    "Follow-up note",
    "Created",
    "Updated",
  ],
  tasks: [
    "Title",
    "Description",
    "Due",
    "Status",
    "Completed",
    "Assignee",
    "Created by",
    "Record type",
    "Record",
    "Reminder",
    "Created",
    "Updated",
  ],
};

// The four lists of owned records: the least a create needs, and the column that names a row.
const RECORD_LISTS = [
  { name: "leads", type: "LEAD", body: { firstName: "Lee", lastName: "Lead", source: "OTHER" } },
  { name: "contacts", type: "CONTACT", body: { firstName: "Cora", lastName: "Contact" } },
  { name: "companies", type: "COMPANY", body: { name: "Company" } },
  { name: "opportunities", type: "OPPORTUNITY", body: { name: "Opportunity" } },
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

function idOf(response: request.Response): string {
  expect(response.status).toBe(201);
  return (response.body as Created).data.id;
}

// The file as rows of cells, header row first, without the byte order mark.
function rowsOf(response: request.Response): string[][] {
  expect(response.status).toBe(200);
  return parseCsv(response.text);
}

// The data rows as objects keyed by header.
function recordsOf(response: request.Response): Record<string, string>[] {
  const [header = [], ...rows] = rowsOf(response);
  return rows.map((row) =>
    Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])),
  );
}

function column(response: request.Response, header: string): string[] {
  return recordsOf(response).map((record) => record[header] ?? "");
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

describe.each(Object.entries(HEADERS))("GET /%s/export", (name, headers) => {
  it("sends a CSV download with a byte order mark and the header row", async () => {
    const response = await asViewer.get(`${API}/${name}/export`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="${name}-${dayIn("UTC", new Date())}.csv"`,
    );
    expect(response.headers["x-export-truncated"]).toBe("false");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.text.startsWith(BOM)).toBe(true);
    expect(response.text).toBe(`${BOM}${headers.join(",")}\r\n`);
  });

  it("works as a plain link: a GET with the session cookie and nothing else", async () => {
    const token = await createSession(ravi.id);

    const response = await request(app)
      .get(`${API}/${name}/export`)
      .set("Cookie", sessionCookie(token));

    expect(response.status).toBe(200);
    expect(rowsOf(response)).toEqual([headers]);
  });

  it("needs a session", async () => {
    const response = await request(app).get(`${API}/${name}/export`);

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe("UNAUTHENTICATED");
  });

  it("names the file after the viewer's today and refuses a time zone that is not one", async () => {
    const zone = "Pacific/Kiritimati";

    const response = await asViewer.get(`${API}/${name}/export`).query({ tz: zone });
    const bad = await asViewer.get(`${API}/${name}/export`).query({ tz: "Mars/Olympus" });

    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="${name}-${dayIn(zone, new Date())}.csv"`,
    );
    expect(bad.status).toBe(400);
    expect(errorOf(bad).code).toBe("VALIDATION_FAILED");
    expect((errorOf(bad).details as ValidationDetail[])[0]?.path).toBe("tz");
  });

  it("refuses a bad list parameter like the list does", async () => {
    const response = await asViewer.get(`${API}/${name}/export`).query({ sort: "nonsense" });

    expect(response.status).toBe(400);
    expect((errorOf(response).details as ValidationDetail[])[0]?.path).toBe("sort");
  });
});

describe.each(RECORD_LISTS)("the $name export", (list) => {
  const url = `${API}/${list.name}`;
  // The first column names the row: a lead's and a contact's first name, or the name.
  const nameKey = "firstName" in list.body ? "firstName" : "name";
  const nameHeader = "firstName" in list.body ? "First name" : "Name";

  const make = (agent: Agent, name: string, extra: Record<string, unknown> = {}) =>
    agent.post(url).send({ ...list.body, [nameKey]: name, ...extra });

  it("holds exactly the rows the caller's list holds", async () => {
    await make(asRavi, "Ravis");
    await make(asUma, "Umas");
    await make(asMeera, "Meeras");
    await make(asAdmin, "Admins");

    const names = async (agent: Agent) =>
      column(await agent.get(`${url}/export`), nameHeader).sort();

    expect(await names(asAdmin)).toEqual(["Admins", "Meeras", "Ravis", "Umas"]);
    // A Read-only user sees every record, so exports every record.
    expect(await names(asViewer)).toEqual(["Admins", "Meeras", "Ravis", "Umas"]);
    expect(await names(asMeera)).toEqual(["Meeras", "Ravis"]);
    expect(await names(asRavi)).toEqual(["Ravis"]);
    expect(await names(asUma)).toEqual(["Umas"]);
  });

  it("leaves out deleted records", async () => {
    const id = idOf(await make(asRavi, "Gone"));
    await make(asRavi, "Kept");
    await asRavi.delete(`${url}/${id}`);

    expect(column(await asRavi.get(`${url}/export`), nameHeader)).toEqual(["Kept"]);
  });

  it("applies the list's search, filters and sort, and ignores paging", async () => {
    await make(asRavi, "Beta");
    await make(asRavi, "Alpha");
    await make(asRavi, "Gamma");
    await make(asMeera, "Alphabet");

    const sorted = await asMeera
      .get(`${url}/export`)
      .query({ sort: "name", order: "desc", page: "2", pageSize: "1" });
    const searched = await asMeera
      .get(`${url}/export`)
      .query({ search: "alph", sort: "name", order: "asc" });
    const filtered = await asMeera.get(`${url}/export`).query({ ownerId: meera.id });

    expect(column(sorted, nameHeader)).toEqual(["Gamma", "Beta", "Alphabet", "Alpha"]);
    expect(column(searched, nameHeader)).toEqual(["Alpha", "Alphabet"]);
    expect(column(filtered, nameHeader)).toEqual(["Alphabet"]);
  });

  it("adds a column per custom field in use, by label, and applies custom field filters", async () => {
    const field = async (label: string, type: string, options?: string[]) =>
      idOf(
        await asAdmin
          .post(`${API}/custom-fields`)
          .send({ recordType: list.type, label, type, options }),
      );
    const region = await field("Region", "TEXT");
    const seats = await field("Seats", "NUMBER");
    const renewal = await field("Renewal", "DATE");
    const tier = await field("Tier", "DROPDOWN", ["Gold", "Silver"]);
    const old = await field("Old", "TEXT");
    await make(asRavi, "Full", {
      customFields: {
        [region]: "North",
        [seats]: -5,
        [renewal]: "2026-11-15",
        [tier]: "Gold",
        [old]: "x",
      },
    });
    await make(asRavi, "Bare", { customFields: { [tier]: "Silver" } });
    await asAdmin.post(`${API}/custom-fields/${old}/archive`);

    const response = await asRavi.get(`${url}/export`).query({ sort: "createdAt", order: "asc" });

    expect(rowsOf(response)[0]).toEqual([
      ...HEADERS[list.name],
      "Region",
      "Seats",
      "Renewal",
      "Tier",
    ]);
    const [full, bare] = recordsOf(response);
    expect(full).toMatchObject({
      Region: "North",
      Seats: "-5",
      Renewal: "2026-11-15",
      Tier: "Gold",
    });
    expect(bare).toMatchObject({ Region: "", Seats: "", Renewal: "", Tier: "Silver" });
    // A negative number is a number, not a formula: no apostrophe.
    expect(response.text).toContain(",-5,");

    const filtered = await asRavi.get(`${url}/export`).query({ [`cf.${tier}`]: "Silver" });
    expect(column(filtered, nameHeader)).toEqual(["Bare"]);
    const bad = await asRavi.get(`${url}/export`).query({ [`cf.${old}`]: "x" });
    expect(bad.status).toBe(400);
    expect((errorOf(bad).details as ValidationDetail[])[0]?.path).toBe(`cf.${old}`);
  });

  it("puts an apostrophe before a cell a spreadsheet would run as a formula", async () => {
    const formulas = ['=HYPERLINK("http://evil.example","click")', "+1+1", "-2+3", "@SUM(1)"];
    for (const formula of formulas) {
      await make(asRavi, formula, { notes: `${formula}\nsecond line, with a comma` });
    }
    await make(asRavi, "Plain", { notes: "a=b, 1+1" });

    const response = await asRavi.get(`${url}/export`).query({ sort: "createdAt", order: "asc" });

    expect(column(response, nameHeader)).toEqual([
      ...formulas.map((formula) => `'${formula}`),
      "Plain",
    ]);
    expect(column(response, "Notes")).toEqual([
      ...formulas.map((formula) => `'${formula}\nsecond line, with a comma`),
      "a=b, 1+1",
    ]);
    // No cell of the file starts with a formula character.
    const cells = rowsOf(response).flat();
    expect(cells.filter((cell) => /^[=+\-@\t\r]/.test(cell))).toEqual([]);
  });
});

describe("what the exports write", () => {
  it("writes a lead with its owner by name, readable enums and times on the viewer's clock", async () => {
    const id = idOf(
      await asRavi.post(`${API}/leads`).send({
        firstName: "Zoë",
        lastName: "Müller",
        company: "Acme, Inc.",
        jobTitle: 'The "Boss"',
        email: "ZOE@example.com",
        phone: "+44 20 7946 0000",
        source: "COLD_CALL",
        estimatedValue: 1200.5,
        notes: "Line one\nLine two",
      }),
    );
    await asRavi
      .post(`${API}/leads/${id}/mark-lost`)
      .send({ reason: "CHOSE_COMPETITOR", note: "Went elsewhere" });
    await prisma.lead.update({
      where: { id },
      data: {
        createdAt: new Date("2026-03-01T22:30:00Z"),
        lastContactAt: new Date("2026-03-02T00:15:00Z"),
      },
    });

    const [lead] = recordsOf(await asRavi.get(`${API}/leads/export`).query({ tz: "Asia/Kolkata" }));

    expect(lead).toMatchObject({
      "First name": "Zoë",
      "Last name": "Müller",
      Company: "Acme, Inc.",
      "Job title": 'The "Boss"',
      Email: "zoe@example.com",
      Phone: "'+44 20 7946 0000",
      Source: "Cold call",
      Status: "Lost",
      Owner: "Ravi Rep",
      "Estimated value": "1200.5",
      Notes: "Line one\nLine two",
      "Lost reason": "Chose competitor",
      "Lost note": "Went elsewhere",
      // 22:30 UTC is 04:00 the next day in India.
      Created: "2026-03-02 04:00",
      "Last contact": "2026-03-02 05:45",
      "Follow-up": "",
    });
  });

  it("names a contact's company only when the caller may see it", async () => {
    const company = idOf(await asMeera.post(`${API}/companies`).send({ name: "Meera's Co" }));
    await prisma.contact.create({
      data: {
        firstName: "Cora",
        lastName: "Contact",
        companyId: company,
        ownerId: ravi.id,
        createdById: ravi.id,
      },
    });

    const forRavi = recordsOf(await asRavi.get(`${API}/contacts/export`));
    const forMeera = recordsOf(await asMeera.get(`${API}/contacts/export`));

    expect(forRavi[0]?.Company).toBe("");
    expect(forMeera[0]?.Company).toBe("Meera's Co");
    expect(forMeera[0]?.Owner).toBe("Ravi Rep");
  });

  it("writes a company with how many contacts the caller may see", async () => {
    const company = idOf(
      await asRavi
        .post(`${API}/companies`)
        .send({ name: "Northwind", website: "northwind.example", industry: "Retail" }),
    );
    await asRavi
      .post(`${API}/contacts`)
      .send({ firstName: "A", lastName: "One", companyId: company });
    await asRavi
      .post(`${API}/contacts`)
      .send({ firstName: "B", lastName: "Two", companyId: company });

    const [row] = recordsOf(await asRavi.get(`${API}/companies/export`));

    expect(row).toMatchObject({
      Name: "Northwind",
      Website: "northwind.example",
      Industry: "Retail",
      Owner: "Ravi Rep",
      Contacts: "2",
    });
  });

  it("writes an opportunity with its stage, contact and company by name", async () => {
    const company = idOf(await asRavi.post(`${API}/companies`).send({ name: "Northwind" }));
    const contact = idOf(
      await asRavi.post(`${API}/contacts`).send({ firstName: "Cora", lastName: "Contact" }),
    );
    const id = idOf(
      await asRavi.post(`${API}/opportunities`).send({
        name: "Fleet deal",
        value: 48_000,
        expectedCloseDate: "2026-11-15",
        companyId: company,
        contactId: contact,
      }),
    );
    await asRavi
      .post(`${API}/opportunities/${id}/close`)
      .send({ outcome: "LOST", reason: "Budget cut" });
    await asRavi.post(`${API}/opportunities`).send({ name: "Open deal" });

    const rows = recordsOf(
      await asRavi.get(`${API}/opportunities/export`).query({ status: "LOST" }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      Name: "Fleet deal",
      Value: "48000",
      Stage: "Lost",
      Status: "Lost",
      "Expected close date": "2026-11-15",
      Contact: "Cora Contact",
      Company: "Northwind",
      Owner: "Ravi Rep",
      "Close reason": "Budget cut",
    });
    expect(rows[0]?.Closed).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("writes the tasks the caller may see, with the list's filters", async () => {
    const lead = idOf(
      await asRavi
        .post(`${API}/leads`)
        .send({ firstName: "Lee", lastName: "Lead", source: "OTHER" }),
    );
    const done = idOf(
      await asRavi.post(`${API}/tasks`).send({
        title: "=Call back",
        description: "About the quote",
        dueAt: "2026-11-15T09:30:00Z",
        record: { type: "LEAD", id: lead },
      }),
    );
    await asRavi.post(`${API}/tasks/${done}/complete`);
    await asRavi.post(`${API}/tasks`).send({ title: "Open task" });
    await asUma.post(`${API}/tasks`).send({ title: "Uma's task" });

    const mine = recordsOf(await asRavi.get(`${API}/tasks/export`).query({ status: "DONE" }));
    const titles = async (agent: Agent) =>
      column(await agent.get(`${API}/tasks/export`), "Title").sort();

    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      Title: "'=Call back",
      Description: "About the quote",
      Due: "2026-11-15 09:30",
      Status: "Done",
      Assignee: "Ravi Rep",
      "Created by": "Ravi Rep",
      "Record type": "Lead",
      Record: "Lee Lead",
      Reminder: "",
    });
    expect(await titles(asRavi)).toEqual(["'=Call back", "Open task"]);
    expect(await titles(asUma)).toEqual(["Uma's task"]);
    expect(await titles(asMeera)).toEqual(["'=Call back", "Open task"]);
    expect(await titles(asViewer)).toEqual(["'=Call back", "Open task", "Uma's task"]);
    expect(await titles(asAdmin)).toEqual(["'=Call back", "Open task", "Uma's task"]);
  });

  it("stops at 10,000 rows, in the order asked for, and says so", async () => {
    const leads = Array.from({ length: EXPORT_ROW_LIMIT + 1 }, (_, index) => ({
      firstName: "Lead",
      lastName: String(index).padStart(5, "0"),
      source: "OTHER" as const,
      ownerId: ravi.id,
      createdById: ravi.id,
    }));
    // A thousand at a time: Prisma would split one larger insert into statements that run
    // side by side on one connection, which the database driver warns about.
    for (let start = 0; start < leads.length; start += 1000) {
      await prisma.lead.createMany({ data: leads.slice(start, start + 1000) });
    }

    const response = await asRavi.get(`${API}/leads/export`).query({ sort: "name", order: "asc" });
    const exact = await asRavi.get(`${API}/leads/export`).query({ search: "0000" });

    const lastNames = column(response, "Last name");
    expect(response.headers["x-export-truncated"]).toBe("true");
    expect(lastNames).toHaveLength(EXPORT_ROW_LIMIT);
    expect(lastNames[0]).toBe("00000");
    expect(lastNames.at(-1)).toBe("09999");
    expect(exact.headers["x-export-truncated"]).toBe("false");
  }, 60_000);
});
