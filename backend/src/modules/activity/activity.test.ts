import type request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  signInAs,
  type ValidationDetail,
} from "../../../test/helpers";
import type { Lead, Prisma, User } from "../../generated/prisma/client";
import { parseCsv } from "../../lib/csv";
import { prisma } from "../../lib/prisma";
import { dayIn } from "../../lib/time-zone";

interface ActivityEntry {
  id: string;
  kind: string;
  conversationType: string | null;
  body: string | null;
  details: Record<string, unknown> | null;
  occurredAt: string;
  author: { id: string; name: string };
  createdAt: string;
  fromLead: { id: string; name: string } | null;
  record: { type: string; id: string; name: string };
}

interface Summary {
  conversations: number;
  notes: number;
  statusChanges: number;
  emails: number;
}

interface ActivityEnvelope {
  data: ActivityEntry[];
  meta: { page: number; pageSize: number; total: number; summary: Summary };
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const ACTIVITY = "/api/v1/activity";
const AUTHORS = "/api/v1/activity/authors";

const app = createTestApp();

// Two teams: Meera manages Ravi and Dev (deactivated), Omar manages Tara.
let admin: User;
let meera: User;
let ravi: User;
let dev: User;
let omar: User;
let tara: User;
let viewer: User;

let asAdmin: Agent;
let asMeera: Agent;
let asOmar: Agent;
let asRavi: Agent;
let asViewer: Agent;

let ravisLead: Lead;
let tarasLead: Lead;

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

function feedOf(response: request.Response): ActivityEnvelope {
  return response.body as ActivityEnvelope;
}

// Every seeded entry carries a label in `body`, so a test can name what it expects.
function labelsOf(response: request.Response): (string | null)[] {
  return feedOf(response).data.map((entry) => entry.body);
}

function feed(query: Record<string, string | number> = {}, agent: Agent = asAdmin) {
  return agent.get(ACTIVITY).query(query);
}

function day(date: number, hour = 10): Date {
  return new Date(Date.UTC(2026, 2, date, hour));
}

function makeLead(
  owner: User,
  lastName: string,
  fields: Partial<Prisma.LeadUncheckedCreateInput> = {},
) {
  return prisma.lead.create({
    data: {
      firstName: "Lead",
      lastName,
      source: "WEBSITE",
      ownerId: owner.id,
      createdById: owner.id,
      ...fields,
    },
  });
}

// Straight into the table, with an exact time. System entries get a label too, which the
// real ones never have, purely so the tests can tell the rows apart.
function makeEntry(
  label: string,
  author: User,
  lead: Lead,
  occurredAt: Date,
  kind: Prisma.TimelineEntryUncheckedCreateInput["kind"],
) {
  return prisma.timelineEntry.create({
    data: {
      kind,
      conversationType: kind === "CONVERSATION" ? "CALL" : null,
      body: label,
      occurredAt,
      authorId: author.id,
      leadId: lead.id,
    },
  });
}

// Newest first. The deleted lead's entry (7 March) is never among them.
const EVERYTHING = [
  "ravi note on tara's lead, 8 Mar",
  "admin note, 6 Mar",
  "omar note, end of 5 Mar",
  "admin assignment, 5 Mar",
  "tara call, 4 Mar",
  "meera status change, 3 Mar",
  "ravi note, 2 Mar",
  "ravi call, 1 Mar",
  "dev call, 28 Feb",
  "ravi created, 27 Feb",
];

const MEERAS_TEAM = EVERYTHING.filter((label) => /^(meera|ravi|dev) /.test(label));

beforeAll(async () => {
  await resetDatabase();
  admin = await createUser({ name: "Asha Admin", role: "ADMIN" });
  meera = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
  ravi = await createUser({ name: "Ravi Rep", role: "SALES_REP", managerId: meera.id });
  dev = await createUser({
    name: "Dev Deactivated",
    role: "SALES_REP",
    managerId: meera.id,
    isActive: false,
  });
  omar = await createUser({ name: "Omar Manager", role: "SALES_MANAGER" });
  tara = await createUser({ name: "Tara Rep", role: "SALES_REP", managerId: omar.id });
  viewer = await createUser({ name: "Vik Viewer", role: "READ_ONLY" });

  asAdmin = await signInAs(app, admin);
  asMeera = await signInAs(app, meera);
  asOmar = await signInAs(app, omar);
  asRavi = await signInAs(app, ravi);
  asViewer = await signInAs(app, viewer);

  ravisLead = await makeLead(ravi, "Of Ravi");
  tarasLead = await makeLead(tara, "Of Tara");
  const deletedLead = await makeLead(ravi, "Deleted", { deletedAt: new Date() });

  await makeEntry(
    "ravi created, 27 Feb",
    ravi,
    ravisLead,
    new Date(Date.UTC(2026, 1, 27)),
    "CREATED",
  );
  await makeEntry(
    "dev call, 28 Feb",
    dev,
    ravisLead,
    new Date(Date.UTC(2026, 1, 28)),
    "CONVERSATION",
  );
  await makeEntry("ravi call, 1 Mar", ravi, ravisLead, day(1), "CONVERSATION");
  await makeEntry("ravi note, 2 Mar", ravi, ravisLead, day(2), "NOTE");
  await makeEntry("meera status change, 3 Mar", meera, ravisLead, day(3), "STATUS_CHANGE");
  await makeEntry("tara call, 4 Mar", tara, tarasLead, day(4), "CONVERSATION");
  await makeEntry("admin assignment, 5 Mar", admin, tarasLead, day(5, 0), "ASSIGNMENT");
  await makeEntry(
    "omar note, end of 5 Mar",
    omar,
    tarasLead,
    new Date("2026-03-05T23:59:59.999Z"),
    "NOTE",
  );
  // On a lead of Meera's team, but not written by her team.
  await makeEntry("admin note, 6 Mar", admin, ravisLead, day(6), "NOTE");
  await makeEntry("ravi call on a deleted lead, 7 Mar", ravi, deletedLead, day(7), "CONVERSATION");
  // Written by Meera's team, on a lead that is not theirs (any more).
  await makeEntry("ravi note on tara's lead, 8 Mar", ravi, tarasLead, day(8), "NOTE");
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("GET /activity: who sees what", () => {
  it("shows an Admin everyone's entries, newest first, with the summary in meta", async () => {
    const response = await feed();
    const body = feedOf(response);

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
    expect(labelsOf(response)).toEqual(EVERYTHING);
    expect(body.meta).toEqual({
      page: 1,
      pageSize: 25,
      total: 10,
      summary: { conversations: 3, notes: 4, statusChanges: 1, emails: 0 },
    });
  });

  it("answers each entry as a timeline entry plus its record", async () => {
    const response = await feed({ kind: "STATUS_CHANGE" });
    const [entry] = feedOf(response).data;

    expect(entry).toEqual({
      id: entry?.id,
      kind: "STATUS_CHANGE",
      conversationType: null,
      body: "meera status change, 3 Mar",
      details: null,
      occurredAt: "2026-03-03T10:00:00.000Z",
      author: { id: meera.id, name: "Meera Manager" },
      createdAt: entry?.createdAt,
      // The feed shows each entry on its own record.
      fromLead: null,
      record: { type: "LEAD", id: ravisLead.id, name: "Lead Of Ravi" },
    });
  });

  it("shows a Sales Manager what they and their team wrote, whoever owns the record", async () => {
    const response = await feed({}, asMeera);

    expect(response.status).toBe(200);
    expect(labelsOf(response)).toEqual(MEERAS_TEAM);
    expect(feedOf(response).meta).toEqual({
      page: 1,
      pageSize: 25,
      total: 6,
      summary: { conversations: 2, notes: 2, statusChanges: 1, emails: 0 },
    });
  });

  it("keeps the two teams apart", async () => {
    const response = await feed({}, asOmar);

    expect(labelsOf(response)).toEqual(["omar note, end of 5 Mar", "tara call, 4 Mar"]);
  });

  it("shows a Read-only user everyone's entries, exactly as an Admin sees them", async () => {
    const forViewer = await feed({}, asViewer);
    const forAdmin = await feed();

    expect(forViewer.status).toBe(200);
    expect(labelsOf(forViewer)).toEqual(EVERYTHING);
    expect(feedOf(forViewer)).toEqual(feedOf(forAdmin));
  });

  it("lets a Read-only user filter by anyone, like an Admin", async () => {
    const taras = await feed({ userId: tara.id }, asViewer);

    expect(taras.status).toBe(200);
    expect(labelsOf(taras)).toEqual(["tara call, 4 Mar"]);
  });

  it("answers FORBIDDEN for a Sales Rep, on the feed, its authors and its export", async () => {
    for (const url of [ACTIVITY, AUTHORS, `${ACTIVITY}/export`]) {
      const response = await asRavi.get(url);
      expect(response.status, url).toBe(403);
      expect(errorOf(response).code, url).toBe("FORBIDDEN");
    }
  });

  it("leaves out the entries of a deleted lead, for everyone and in the counts", async () => {
    const forAdmin = await feed({ from: "2026-03-07", to: "2026-03-07" });
    const forMeera = await feed({ from: "2026-03-07", to: "2026-03-07" }, asMeera);

    for (const response of [forAdmin, forMeera]) {
      expect(labelsOf(response)).toEqual([]);
      expect(feedOf(response).meta.total).toBe(0);
      expect(feedOf(response).meta.summary).toEqual({
        conversations: 0,
        notes: 0,
        statusChanges: 0,
        emails: 0,
      });
    }
  });
});

describe("GET /activity: filters", () => {
  it("filters by person", async () => {
    const taras = await feed({ userId: tara.id });
    const devs = await feed({ userId: dev.id });

    expect(labelsOf(taras)).toEqual(["tara call, 4 Mar"]);
    expect(labelsOf(devs)).toEqual(["dev call, 28 Feb"]);
    expect(feedOf(taras).meta.summary).toEqual({
      conversations: 1,
      notes: 0,
      statusChanges: 0,
      emails: 0,
    });
  });

  it("answers an Admin with an empty feed for a person who wrote nothing", async () => {
    const response = await feed({ userId: UNKNOWN_ID });

    expect(response.status).toBe(200);
    expect(labelsOf(response)).toEqual([]);
  });

  it("lets a Sales Manager filter by themselves or someone on their team", async () => {
    const own = await feed({ userId: meera.id }, asMeera);
    const ravis = await feed({ userId: ravi.id }, asMeera);
    const devs = await feed({ userId: dev.id }, asMeera);

    expect(labelsOf(own)).toEqual(["meera status change, 3 Mar"]);
    expect(labelsOf(ravis)).toEqual(MEERAS_TEAM.filter((label) => label.startsWith("ravi ")));
    expect(labelsOf(devs)).toEqual(["dev call, 28 Feb"]);
  });

  it.each([
    ["a rep on another team", () => tara.id],
    ["another manager", () => omar.id],
    ["an Admin", () => admin.id],
    ["nobody at all", () => UNKNOWN_ID],
  ])("answers VALIDATION_FAILED on userId when a Sales Manager asks for %s", async (_who, id) => {
    const response = await feed({ userId: id() }, asMeera);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(["userId"]);
  });

  it("filters by exact moments, both ends included", async () => {
    const response = await feed({
      from: "2026-03-02T10:00:00.000Z",
      to: "2026-03-04T10:00:00.000Z",
    });
    const justInside = await feed({
      from: "2026-03-02T10:00:00.001Z",
      to: "2026-03-04T09:59:59.999Z",
    });

    expect(labelsOf(response)).toEqual([
      "tara call, 4 Mar",
      "meera status change, 3 Mar",
      "ravi note, 2 Mar",
    ]);
    expect(labelsOf(justInside)).toEqual(["meera status change, 3 Mar"]);
  });

  it("reads a moment with an offset as that moment", async () => {
    // 15:30 in India is 10:00 UTC, the time of Ravi's note.
    const response = await feed({
      from: "2026-03-02T15:30:00+05:30",
      to: "2026-03-02T15:30:00+05:30",
    });

    expect(labelsOf(response)).toEqual(["ravi note, 2 Mar"]);
  });

  it("filters by whole days, including all of the last one", async () => {
    const oneDay = await feed({ from: "2026-03-05", to: "2026-03-05" });
    const range = await feed({ from: "2026-03-04", to: "2026-03-05" });

    expect(labelsOf(oneDay)).toEqual(["omar note, end of 5 Mar", "admin assignment, 5 Mar"]);
    expect(labelsOf(range)).toEqual([
      "omar note, end of 5 Mar",
      "admin assignment, 5 Mar",
      "tara call, 4 Mar",
    ]);
  });

  it("accepts either end on its own", async () => {
    const since = await feed({ from: "2026-03-06" });
    const until = await feed({ to: "2026-02-28" });

    expect(labelsOf(since)).toEqual(["ravi note on tara's lead, 8 Mar", "admin note, 6 Mar"]);
    expect(labelsOf(until)).toEqual(["dev call, 28 Feb", "ravi created, 27 Feb"]);
  });

  it("answers an empty feed when the range ends before it starts", async () => {
    const response = await feed({ from: "2026-03-05", to: "2026-03-01" });

    expect(response.status).toBe(200);
    expect(labelsOf(response)).toEqual([]);
  });

  it.each([
    ["CONVERSATION", ["tara call, 4 Mar", "ravi call, 1 Mar", "dev call, 28 Feb"]],
    ["STATUS_CHANGE", ["meera status change, 3 Mar"]],
    ["ASSIGNMENT", ["admin assignment, 5 Mar"]],
    ["CREATED", ["ravi created, 27 Feb"]],
    ["SYSTEM", ["admin assignment, 5 Mar", "meera status change, 3 Mar", "ravi created, 27 Feb"]],
  ])("filters by kind=%s", async (kind, expected) => {
    const response = await feed({ kind });

    expect(labelsOf(response)).toEqual(expected);
    expect(feedOf(response).meta.total).toBe(expected.length);
  });

  it("combines person, dates and kind, within what the caller may see", async () => {
    const response = await feed(
      { userId: ravi.id, from: "2026-03-01", to: "2026-03-31", kind: "NOTE" },
      asMeera,
    );

    expect(labelsOf(response)).toEqual(["ravi note on tara's lead, 8 Mar", "ravi note, 2 Mar"]);
    expect(feedOf(response).meta.summary).toEqual({
      conversations: 0,
      notes: 2,
      statusChanges: 0,
      emails: 0,
    });
  });

  it.each([
    ["userId", "me"],
    ["from", "yesterday"],
    ["from", "2026-13-01"],
    ["to", "2026-03-05T10:00:00"],
    ["to", "05/03/2026"],
    ["kind", "TASK"],
    ["page", "0"],
    ["pageSize", "101"],
  ])("answers VALIDATION_FAILED for %s=%s", async (key, value) => {
    const response = await feed({ [key]: value });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([key]);
  });
});

describe("GET /activity: paging and the summary", () => {
  it("pages through the feed, and counts the whole filtered range on every page", async () => {
    const summary = { conversations: 3, notes: 4, statusChanges: 1, emails: 0 };

    const first = await feed({ pageSize: 4 });
    const third = await feed({ pageSize: 4, page: 3 });
    const beyond = await feed({ pageSize: 4, page: 4 });

    expect(labelsOf(first)).toEqual(EVERYTHING.slice(0, 4));
    expect(labelsOf(third)).toEqual(EVERYTHING.slice(8));
    expect(labelsOf(beyond)).toEqual([]);
    expect(feedOf(first).meta).toEqual({ page: 1, pageSize: 4, total: 10, summary });
    expect(feedOf(third).meta).toEqual({ page: 3, pageSize: 4, total: 10, summary });
    expect(feedOf(beyond).meta).toEqual({ page: 4, pageSize: 4, total: 10, summary });
  });

  it("counts only what the filters and the caller's reach leave", async () => {
    const march = await feed({ from: "2026-03-01", to: "2026-03-31", pageSize: 1 });
    const forMeera = await feed({ from: "2026-03-01", to: "2026-03-31", pageSize: 1 }, asMeera);

    expect(feedOf(march).meta.summary).toEqual({
      conversations: 2,
      notes: 4,
      statusChanges: 1,
      emails: 0,
    });
    expect(feedOf(march).meta.total).toBe(8);
    expect(feedOf(forMeera).meta.summary).toEqual({
      conversations: 1,
      notes: 2,
      statusChanges: 1,
      emails: 0,
    });
    expect(feedOf(forMeera).meta.total).toBe(4);
  });
});

describe("GET /activity/authors", () => {
  function namesOf(response: request.Response): string[] {
    return (response.body as { data: { id: string; name: string }[] }).data.map(
      (author) => author.name,
    );
  }

  it("gives an Admin everyone who is not Read-only, deactivated users included, by name", async () => {
    const response = await asAdmin.get(AUTHORS);
    const body = response.body as { data: { id: string; name: string }[]; meta: object };

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
    expect(namesOf(response)).toEqual([
      "Asha Admin",
      "Dev Deactivated",
      "Meera Manager",
      "Omar Manager",
      "Ravi Rep",
      "Tara Rep",
    ]);
    expect(body.data[0]).toEqual({ id: admin.id, name: "Asha Admin" });
  });

  it("gives a Read-only user the same people as an Admin", async () => {
    const forViewer = await asViewer.get(AUTHORS);

    expect(forViewer.status).toBe(200);
    expect(forViewer.body).toEqual((await asAdmin.get(AUTHORS)).body);
  });

  it("gives a Sales Manager themselves and their team", async () => {
    expect(namesOf(await asMeera.get(AUTHORS))).toEqual([
      "Dev Deactivated",
      "Meera Manager",
      "Ravi Rep",
    ]);
    expect(namesOf(await asOmar.get(AUTHORS))).toEqual(["Omar Manager", "Tara Rep"]);
  });
});

// Last, because these add to the seeded feed.
describe("the feed follows what people do", () => {
  it("shows a conversation logged through the API, and drops it when the lead is deleted", async () => {
    const created = await asRavi
      .post("/api/v1/leads")
      .send({ firstName: "Nora", lastName: "New", source: "EVENT" });
    const leadId = (created.body as { data: { id: string } }).data.id;
    await asRavi.post(`/api/v1/leads/${leadId}/conversations`).send({
      type: "MESSAGE",
      occurredAt: new Date().toISOString(),
      summary: "Asked for a quote",
    });

    const before = await feed({ pageSize: 2 }, asMeera);
    await asRavi.delete(`/api/v1/leads/${leadId}`);
    const after = await feed({ pageSize: 2 }, asMeera);

    expect(feedOf(before).data.map((entry) => [entry.kind, entry.record.name])).toEqual([
      ["CONVERSATION", "Nora New"],
      ["CREATED", "Nora New"],
    ]);
    expect(feedOf(before).data[0]?.author).toEqual({ id: ravi.id, name: "Ravi Rep" });
    expect(feedOf(before).meta.total).toBe(8);
    expect(labelsOf(after)).toEqual(MEERAS_TEAM.slice(0, 2));
    expect(feedOf(after).meta.total).toBe(6);
  });
});

// Contacts, companies and opportunities write to the same feed as leads. These entries are
// all in April, away from the seeded ones, and each test asks for April only.
describe("GET /activity: leads, contacts, companies and opportunities together", () => {
  const APRIL = { from: "2026-04-01", to: "2026-04-30" };

  function april(date: number): Date {
    return new Date(Date.UTC(2026, 3, date, 10));
  }

  function makeContact(owner: User, lastName: string, deletedAt: Date | null = null) {
    return prisma.contact.create({
      data: { firstName: "Contact", lastName, ownerId: owner.id, createdById: owner.id, deletedAt },
    });
  }

  function makeCompany(owner: User, name: string, deletedAt: Date | null = null) {
    return prisma.company.create({
      data: { name, ownerId: owner.id, createdById: owner.id, deletedAt },
    });
  }

  function makeRecordEntry(
    label: string,
    author: User,
    record: { contactId: string } | { companyId: string } | { opportunityId: string },
    occurredAt: Date,
    kind: Prisma.TimelineEntryUncheckedCreateInput["kind"],
  ) {
    return prisma.timelineEntry.create({
      data: {
        kind,
        conversationType: kind === "CONVERSATION" ? "CALL" : null,
        body: label,
        occurredAt,
        authorId: author.id,
        ...record,
      },
    });
  }

  async function makeOpportunity(owner: User, name: string, deletedAt: Date | null = null) {
    const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { kind: "OPEN" } });
    return prisma.opportunity.create({
      data: { name, stageId: stage.id, ownerId: owner.id, createdById: owner.id, deletedAt },
    });
  }

  let ravisContact: { id: string };
  let tarasCompany: { id: string };
  let ravisOpportunity: { id: string };

  beforeAll(async () => {
    ravisContact = await makeContact(ravi, "Of Ravi");
    tarasCompany = await makeCompany(tara, "Tara Traders");
    ravisOpportunity = await makeOpportunity(ravi, "Fleet deal");
    const deletedOpportunity = await makeOpportunity(ravi, "Deleted deal", new Date());
    await makeRecordEntry(
      "ravi opportunity stage change, 8 Apr",
      ravi,
      { opportunityId: ravisOpportunity.id },
      april(8),
      "STATUS_CHANGE",
    );
    await makeRecordEntry(
      "ravi note on a deleted opportunity, 9 Apr",
      ravi,
      { opportunityId: deletedOpportunity.id },
      april(9),
      "NOTE",
    );
    const deletedContact = await makeContact(ravi, "Deleted", new Date());
    const deletedCompany = await makeCompany(ravi, "Deleted Ltd", new Date());

    await makeEntry("ravi lead note, 1 Apr", ravi, ravisLead, april(1), "NOTE");
    await makeRecordEntry(
      "ravi contact call, 2 Apr",
      ravi,
      { contactId: ravisContact.id },
      april(2),
      "CONVERSATION",
    );
    await makeRecordEntry(
      "tara company call, 3 Apr",
      tara,
      { companyId: tarasCompany.id },
      april(3),
      "CONVERSATION",
    );
    await makeRecordEntry(
      "meera company note, 4 Apr",
      meera,
      { companyId: tarasCompany.id },
      april(4),
      "NOTE",
    );
    await makeRecordEntry(
      "admin contact assignment, 5 Apr",
      admin,
      { contactId: ravisContact.id },
      april(5),
      "ASSIGNMENT",
    );
    await makeRecordEntry(
      "ravi call on a deleted contact, 6 Apr",
      ravi,
      { contactId: deletedContact.id },
      april(6),
      "CONVERSATION",
    );
    await makeRecordEntry(
      "ravi note on a deleted company, 7 Apr",
      ravi,
      { companyId: deletedCompany.id },
      april(7),
      "NOTE",
    );
  });

  it("names the record of each entry by its type, id and name, newest first", async () => {
    const response = await feed(APRIL);

    expect(response.status).toBe(200);
    expect(feedOf(response).data.map((entry) => [entry.body, entry.record])).toEqual([
      [
        "ravi opportunity stage change, 8 Apr",
        { type: "OPPORTUNITY", id: ravisOpportunity.id, name: "Fleet deal" },
      ],
      [
        "admin contact assignment, 5 Apr",
        { type: "CONTACT", id: ravisContact.id, name: "Contact Of Ravi" },
      ],
      ["meera company note, 4 Apr", { type: "COMPANY", id: tarasCompany.id, name: "Tara Traders" }],
      ["tara company call, 3 Apr", { type: "COMPANY", id: tarasCompany.id, name: "Tara Traders" }],
      [
        "ravi contact call, 2 Apr",
        { type: "CONTACT", id: ravisContact.id, name: "Contact Of Ravi" },
      ],
      ["ravi lead note, 1 Apr", { type: "LEAD", id: ravisLead.id, name: "Lead Of Ravi" }],
    ]);
  });

  it("leaves out the entries of a deleted contact, company or opportunity, in the counts too", async () => {
    const response = await feed(APRIL);

    expect(labelsOf(response)).not.toContain("ravi note on a deleted opportunity, 9 Apr");
    expect(labelsOf(response)).not.toContain("ravi call on a deleted contact, 6 Apr");
    expect(labelsOf(response)).not.toContain("ravi note on a deleted company, 7 Apr");
    expect(feedOf(response).meta).toEqual({
      page: 1,
      pageSize: 25,
      total: 6,
      summary: { conversations: 2, notes: 2, statusChanges: 1, emails: 0 },
    });
  });

  it("scopes a Sales Manager by who wrote the entry, whatever the record's type or owner", async () => {
    const forMeera = await feed(APRIL, asMeera);
    const forOmar = await feed(APRIL, asOmar);

    // Meera wrote on a company her team cannot even see; it is still her activity.
    expect(labelsOf(forMeera)).toEqual([
      "ravi opportunity stage change, 8 Apr",
      "meera company note, 4 Apr",
      "ravi contact call, 2 Apr",
      "ravi lead note, 1 Apr",
    ]);
    expect(labelsOf(forOmar)).toEqual(["tara company call, 3 Apr"]);
  });

  it("combines with the person, kind and paging filters", async () => {
    const byPerson = await feed({ ...APRIL, userId: ravi.id });
    const byKind = await feed({ ...APRIL, kind: "CONVERSATION" });
    const secondPage = await feed({ ...APRIL, pageSize: 2, page: 3 });

    expect(labelsOf(byPerson)).toEqual([
      "ravi opportunity stage change, 8 Apr",
      "ravi contact call, 2 Apr",
      "ravi lead note, 1 Apr",
    ]);
    expect(labelsOf(byKind)).toEqual(["tara company call, 3 Apr", "ravi contact call, 2 Apr"]);
    expect(labelsOf(secondPage)).toEqual(["ravi contact call, 2 Apr", "ravi lead note, 1 Apr"]);
    expect(feedOf(secondPage).meta.total).toBe(6);
  });

  it("follows what people do to an opportunity through the API", async () => {
    const from = new Date().toISOString();
    const created = await asRavi.post("/api/v1/opportunities").send({ name: "Nova renewal" });
    const { id } = (created.body as { data: { id: string } }).data;
    await asRavi.post(`/api/v1/opportunities/${id}/close`).send({ outcome: "WON" });
    await asRavi.post(`/api/v1/opportunities/${id}/notes`).send({ body: "Signed" });

    const before = await feed({ from }, asMeera);
    await asRavi.delete(`/api/v1/opportunities/${id}`);
    const after = await feed({ from }, asMeera);

    expect(
      feedOf(before)
        .data.map((entry) => `${entry.kind} ${entry.record.type} ${entry.record.name}`)
        .sort(),
    ).toEqual([
      "CREATED OPPORTUNITY Nova renewal",
      "NOTE OPPORTUNITY Nova renewal",
      "STATUS_CHANGE OPPORTUNITY Nova renewal",
    ]);
    expect(feedOf(before).meta.summary.statusChanges).toBe(1);
    expect(feedOf(after).data).toEqual([]);
  });

  it("follows what people do to contacts and companies through the API", async () => {
    const from = new Date().toISOString();
    const company = await asRavi.post("/api/v1/companies").send({ name: "Nova Works" });
    const companyId = (company.body as { data: { id: string } }).data.id;
    const contact = await asRavi
      .post("/api/v1/contacts")
      .send({ firstName: "Nora", lastName: "New", companyId });
    const contactId = (contact.body as { data: { id: string } }).data.id;
    await asRavi.post(`/api/v1/contacts/${contactId}/notes`).send({ body: "Prefers email" });
    await asRavi.post(`/api/v1/companies/${companyId}/notes`).send({ body: "Renews in May" });

    const before = await feed({ from }, asMeera);
    await asRavi.delete(`/api/v1/companies/${companyId}`);
    const afterCompany = await feed({ from }, asMeera);
    await asRavi.delete(`/api/v1/contacts/${contactId}`);
    const afterBoth = await feed({ from }, asMeera);

    const seen = (response: request.Response) =>
      feedOf(response)
        .data.map((entry) => `${entry.kind} ${entry.record.type} ${entry.record.name}`)
        .sort();
    expect(seen(before)).toEqual([
      "CREATED COMPANY Nova Works",
      "CREATED CONTACT Nora New",
      "NOTE COMPANY Nova Works",
      "NOTE CONTACT Nora New",
    ]);
    // Deleting the company removes its entries from the feed, not those of its contact.
    expect(seen(afterCompany)).toEqual(["CREATED CONTACT Nora New", "NOTE CONTACT Nora New"]);
    expect(feedOf(afterCompany).meta.summary.notes).toBe(1);
    expect(seen(afterBoth)).toEqual([]);
  });
});

// Last, because the formula test adds entries (in May, away from the others).
describe("GET /activity/export", () => {
  const EXPORT = `${ACTIVITY}/export`;
  const BOM = "\uFEFF";
  const HEADERS = [
    "When",
    "Person",
    "Type",
    "Conversation type",
    "Record type",
    "Record",
    "Details",
    "Text",
    "Logged",
  ];
  // Up to the end of March: the seeded feed, without what later tests add.
  const SEEDED = { to: "2026-03-31" };

  function rowsOf(response: request.Response): string[][] {
    expect(response.status).toBe(200);
    return parseCsv(response.text);
  }

  function recordsOf(response: request.Response): Record<string, string>[] {
    const [header = [], ...rows] = rowsOf(response);
    return rows.map((row) =>
      Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])),
    );
  }

  function textsOf(response: request.Response): string[] {
    return recordsOf(response).map((record) => record.Text ?? "");
  }

  it("sends the feed as a CSV download named activity-<today>.csv", async () => {
    const response = await asAdmin.get(EXPORT).query(SEEDED);

    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="activity-${dayIn("UTC", new Date())}.csv"`,
    );
    expect(response.headers["x-export-truncated"]).toBe("false");
    expect(response.text.startsWith(BOM)).toBe(true);
    expect(rowsOf(response)[0]).toEqual(HEADERS);
    expect(textsOf(response)).toEqual(EVERYTHING);
  });

  it("holds exactly what each role's feed holds", async () => {
    const texts = async (agent: Agent) => textsOf(await agent.get(EXPORT).query(SEEDED));

    expect(await texts(asAdmin)).toEqual(EVERYTHING);
    expect(await texts(asViewer)).toEqual(EVERYTHING);
    expect(await texts(asMeera)).toEqual(MEERAS_TEAM);
    expect(await texts(asOmar)).toEqual(["omar note, end of 5 Mar", "tara call, 4 Mar"]);
  });

  it("applies the feed's filters and ignores paging", async () => {
    const notes = await asAdmin
      .get(EXPORT)
      .query({ ...SEEDED, userId: ravi.id, kind: "NOTE", page: "2", pageSize: "1" });
    const days = await asMeera.get(EXPORT).query({ from: "2026-03-01", to: "2026-03-03" });
    const outsideTeam = await asMeera.get(EXPORT).query({ userId: tara.id });

    expect(textsOf(notes)).toEqual(["ravi note on tara's lead, 8 Mar", "ravi note, 2 Mar"]);
    expect(textsOf(days)).toEqual([
      "meera status change, 3 Mar",
      "ravi note, 2 Mar",
      "ravi call, 1 Mar",
    ]);
    expect(outsideTeam.status).toBe(400);
    expect(detailPaths(outsideTeam)).toEqual(["userId"]);
  });

  it("writes who, what, on which record and when, on the viewer's clock", async () => {
    const response = await asAdmin
      .get(EXPORT)
      .query({ ...SEEDED, userId: tara.id, kind: "CONVERSATION", tz: "Asia/Kolkata" });
    const records = recordsOf(response);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      // 10:00 UTC is 15:30 in India.
      When: "2026-03-04 15:30",
      Person: "Tara Rep",
      Type: "Conversation",
      "Conversation type": "Call",
      "Record type": "Lead",
      Record: "Lead Of Tara",
      Details: "",
      Text: "tara call, 4 Mar",
    });
    expect(records[0]?.Logged).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("refuses a time zone that is not one", async () => {
    const response = await asAdmin.get(EXPORT).query({ tz: "Mars/Olympus" });

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual(["tz"]);
  });

  it("describes system entries and emails in Details, and neutralises formulas", async () => {
    const may = (date: number) => new Date(Date.UTC(2026, 4, date, 10));
    const entry = (
      occurredAt: Date,
      kind: Prisma.TimelineEntryUncheckedCreateInput["kind"],
      fields: Partial<Prisma.TimelineEntryUncheckedCreateInput> = {},
    ) =>
      prisma.timelineEntry.create({
        data: { kind, occurredAt, authorId: ravi.id, leadId: ravisLead.id, ...fields },
      });
    await entry(may(1), "STATUS_CHANGE", { details: { from: "NEW", to: "CONTACTED" } });
    await entry(may(2), "ASSIGNMENT", {
      details: {
        fromOwner: { id: ravi.id, name: "Ravi Rep" },
        toOwner: { id: tara.id, name: "Tara Rep" },
      },
    });
    await entry(may(3), "EMAIL", {
      body: "Hello",
      details: { to: ["lee@example.com"], cc: [], subject: "Our proposal" },
    });
    await entry(may(4), "QUOTE_STATUS", {
      details: { quote: { id: UNKNOWN_ID, number: "Q-0001" }, from: "DRAFT", to: "SENT" },
    });
    const formulas = ['=HYPERLINK("http://evil.example","click")', "+1+1", "-2+3", "@SUM(1)"];
    for (const [index, formula] of formulas.entries()) {
      await entry(may(10 + index), "NOTE", { body: `${formula}\nsecond line, with a comma` });
    }

    const response = await asViewer.get(EXPORT).query({ from: "2026-05-01", to: "2026-05-31" });
    const records = recordsOf(response);

    expect(records.slice(4).map((record) => record.Details)).toEqual([
      "Q-0001: Draft → Sent",
      "To: lee@example.com · Our proposal",
      "Ravi Rep → Tara Rep",
      "New → Contacted",
    ]);
    expect(records.slice(0, 4).map((record) => record.Text)).toEqual(
      [...formulas].reverse().map((formula) => `'${formula}\nsecond line, with a comma`),
    );
    // No cell of the file starts with a formula character.
    const cells = rowsOf(response).flat();
    expect(cells.filter((cell) => /^[=+\-@\t\r]/.test(cell))).toEqual([]);
  });
});
