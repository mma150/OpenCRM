import type request from "supertest";
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
import type { Lead, Prisma, TimelineEntry, User } from "../../generated/prisma/client";
import { registry } from "../../lib/openapi";
import { prisma } from "../../lib/prisma";
import * as timeline from "../../lib/timeline";

interface ApiEntry {
  id: string;
  kind: string;
  conversationType: string | null;
  body: string | null;
  details: Record<string, unknown> | null;
  occurredAt: string;
  author: { id: string; name: string };
  createdAt: string;
  fromLead: { id: string; name: string } | null;
}

interface ApiLead {
  id: string;
  status: string;
  lastContactAt: string | null;
  updatedAt: string;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const LEADS = "/api/v1/leads";
const MINUTE = 60 * 1000;

const app = createTestApp();

// Two teams: Meera manages Ravi, Omar manages Tara.
let admin: User;
let meera: User;
let ravi: User;
let omar: User;
let tara: User;
let viewer: User;

let asAdmin: Agent;
let asMeera: Agent;
let asRavi: Agent;
let asViewer: Agent;

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

function entryOf(response: request.Response): ApiEntry {
  return (response.body as Envelope<ApiEntry>).data;
}

function entriesOf(response: request.Response): ApiEntry[] {
  return (response.body as Envelope<ApiEntry[]>).data;
}

function bodiesOf(response: request.Response): (string | null)[] {
  return entriesOf(response).map((entry) => entry.body);
}

function kindsOf(response: request.Response): string[] {
  return entriesOf(response).map((entry) => entry.kind);
}

function leadOf(response: request.Response): ApiLead {
  return (response.body as Envelope<ApiLead>).data;
}

// Straight into the database, so a test can start from any state. A lead made this way
// has no entries at all, which makes "exactly one entry was written" easy to see.
function makeLead(owner: User, fields: Partial<Prisma.LeadUncheckedCreateInput> = {}) {
  return prisma.lead.create({
    data: {
      firstName: "Lead",
      lastName: "One",
      source: "WEBSITE",
      ownerId: owner.id,
      createdById: owner.id,
      ...fields,
    },
  });
}

// An entry put straight into the table, to set up a timeline with exact times.
function makeEntry(
  lead: Lead,
  author: User,
  fields: Partial<Prisma.TimelineEntryUncheckedCreateInput> = {},
) {
  return prisma.timelineEntry.create({
    data: {
      kind: "NOTE",
      body: "A note",
      occurredAt: new Date(),
      authorId: author.id,
      leadId: lead.id,
      ...fields,
    },
  });
}

function storedLead(id: string): Promise<Lead> {
  return prisma.lead.findUniqueOrThrow({ where: { id } });
}

// Every entry in the table for a lead, in the order they were written.
function storedEntries(leadId: string): Promise<TimelineEntry[]> {
  return prisma.timelineEntry.findMany({
    where: { leadId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

function conversation(fields: Record<string, unknown> = {}) {
  return {
    type: "CALL",
    occurredAt: new Date(Date.now() - 60 * MINUTE).toISOString(),
    summary: "Talked about pricing",
    ...fields,
  };
}

function day(date: number, hour = 0): Date {
  return new Date(Date.UTC(2026, 2, date, hour));
}

// The two things a person writes on a timeline, which share every access rule.
function writesTo(agent: Agent, leadId: string) {
  return [
    ["a conversation", () => agent.post(`${LEADS}/${leadId}/conversations`).send(conversation())],
    ["a note", () => agent.post(`${LEADS}/${leadId}/notes`).send({ body: "Prefers email" })],
  ] as const;
}

beforeAll(async () => {
  await resetDatabase();
  admin = await createUser({ name: "Asha Admin", role: "ADMIN" });
  meera = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
  ravi = await createUser({ name: "Ravi Rep", role: "SALES_REP", managerId: meera.id });
  omar = await createUser({ name: "Omar Manager", role: "SALES_MANAGER" });
  tara = await createUser({ name: "Tara Rep", role: "SALES_REP", managerId: omar.id });
  viewer = await createUser({ name: "Vik Viewer", role: "READ_ONLY" });

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

describe("system entries written by the leads service", () => {
  const newLead = { firstName: "Jane", lastName: "Doe", source: "REFERRAL" };

  it("writes one CREATED entry when a lead is created, by the caller, at the lead's own time", async () => {
    const response = await asRavi.post(LEADS).send(newLead);
    const lead = await storedLead(leadOf(response).id);
    const entries = await storedEntries(lead.id);

    expect(response.status).toBe(201);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "CREATED",
      conversationType: null,
      body: null,
      details: null,
      authorId: ravi.id,
      occurredAt: lead.createdAt,
    });
  });

  it("names the caller, not the owner, as the author", async () => {
    const response = await asMeera.post(LEADS).send({ ...newLead, ownerId: ravi.id });
    const entries = await storedEntries(leadOf(response).id);

    expect(entries.map((entry) => [entry.kind, entry.authorId])).toEqual([["CREATED", meera.id]]);
  });

  it("writes one STATUS_CHANGE entry when the status is changed by editing", async () => {
    const lead = await makeLead(ravi);

    const response = await asAdmin.patch(`${LEADS}/${lead.id}`).send({ status: "CONTACTED" });
    const entries = await storedEntries(lead.id);

    expect(response.status).toBe(200);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "STATUS_CHANGE",
      body: null,
      details: { from: "NEW", to: "CONTACTED" },
      authorId: admin.id,
    });
  });

  it("writes nothing when other fields are edited or the status stays the same", async () => {
    const lead = await makeLead(ravi, { status: "CONTACTED" });

    const edited = await asRavi.patch(`${LEADS}/${lead.id}`).send({ company: "Acme", notes: "x" });
    const sameStatus = await asRavi.patch(`${LEADS}/${lead.id}`).send({ status: "CONTACTED" });

    expect(edited.status).toBe(200);
    expect(sameStatus.status).toBe(200);
    expect(await storedEntries(lead.id)).toEqual([]);
  });

  it("writes one STATUS_CHANGE entry with the reason and note when a lead is marked lost", async () => {
    const lead = await makeLead(ravi, { status: "QUALIFIED" });

    const response = await asRavi
      .post(`${LEADS}/${lead.id}/mark-lost`)
      .send({ reason: "PRICE", note: "Too dear" });
    const entries = await storedEntries(lead.id);

    expect(response.status).toBe(200);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "STATUS_CHANGE",
      details: { from: "QUALIFIED", to: "LOST", reason: "PRICE", note: "Too dear" },
      authorId: ravi.id,
    });
  });

  it("records a null note when a lead is marked lost without one", async () => {
    const lead = await makeLead(ravi);

    await asRavi.post(`${LEADS}/${lead.id}/mark-lost`).send({ reason: "NO_BUDGET" });

    expect((await storedEntries(lead.id))[0]?.details).toEqual({
      from: "NEW",
      to: "LOST",
      reason: "NO_BUDGET",
      note: null,
    });
  });

  it("writes one STATUS_CHANGE entry when a lost lead is reopened, and keeps the lost one", async () => {
    const lead = await makeLead(ravi);
    await asRavi.post(`${LEADS}/${lead.id}/mark-lost`).send({ reason: "PRICE", note: "Too dear" });

    const response = await asRavi.patch(`${LEADS}/${lead.id}`).send({ status: "CONTACTED" });
    const entries = await storedEntries(lead.id);

    expect(response.status).toBe(200);
    expect(entries.map((entry) => entry.details)).toEqual([
      { from: "NEW", to: "LOST", reason: "PRICE", note: "Too dear" },
      { from: "LOST", to: "CONTACTED" },
    ]);
  });

  it("writes one ASSIGNMENT entry naming both owners when a lead is assigned", async () => {
    const lead = await makeLead(meera);

    const response = await asMeera.post(`${LEADS}/${lead.id}/assign`).send({ ownerId: ravi.id });
    const entries = await storedEntries(lead.id);

    expect(response.status).toBe(200);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "ASSIGNMENT",
      body: null,
      details: {
        fromOwner: { id: meera.id, name: "Meera Manager" },
        toOwner: { id: ravi.id, name: "Ravi Rep" },
      },
      authorId: meera.id,
    });
  });

  it("writes nothing when a lead is assigned to the owner it already has", async () => {
    const lead = await makeLead(ravi);

    const response = await asAdmin.post(`${LEADS}/${lead.id}/assign`).send({ ownerId: ravi.id });

    expect(response.status).toBe(200);
    expect(await storedEntries(lead.id)).toEqual([]);
  });

  it("writes nothing when a lead is deleted, and keeps the entries it has", async () => {
    const lead = await makeLead(ravi);
    await makeEntry(lead, ravi);

    const response = await asRavi.delete(`${LEADS}/${lead.id}`);

    expect(response.status).toBe(200);
    expect(await storedEntries(lead.id)).toHaveLength(1);
  });

  it("writes nothing when the change is refused", async () => {
    const converted = await makeLead(ravi, { status: "CONVERTED" });
    const mine = await makeLead(ravi);
    const taras = await makeLead(tara);

    const refused = await Promise.all([
      asRavi.patch(`${LEADS}/${converted.id}`).send({ status: "NEW" }),
      asRavi.post(`${LEADS}/${converted.id}/mark-lost`).send({ reason: "PRICE" }),
      asRavi.patch(`${LEADS}/${mine.id}`).send({ status: "LOST" }),
      asViewer.patch(`${LEADS}/${mine.id}`).send({ status: "CONTACTED" }),
      asViewer.post(`${LEADS}/${mine.id}/mark-lost`).send({ reason: "PRICE" }),
      asRavi.post(`${LEADS}/${mine.id}/assign`).send({ ownerId: meera.id }),
      asMeera.post(`${LEADS}/${mine.id}/assign`).send({ ownerId: tara.id }),
      asMeera.patch(`${LEADS}/${taras.id}`).send({ status: "CONTACTED" }),
      asViewer.post(LEADS).send(newLead),
      asRavi.post(LEADS).send({ ...newLead, ownerId: tara.id }),
    ]);

    expect(refused.map((response) => response.status)).toEqual([
      409, 409, 400, 403, 403, 403, 400, 404, 403, 400,
    ]);
    expect(await prisma.timelineEntry.count()).toBe(0);
    expect(await prisma.lead.count()).toBe(3);
  });

  // The entry and the change are one transaction: if the entry cannot be written, the
  // change is undone, so the timeline never misses something that happened.
  describe("when the entry cannot be written", () => {
    function failEntries() {
      vi.spyOn(timeline, "addTimelineEntry").mockRejectedValue(new Error("entry failed"));
    }

    it("does not create the lead", async () => {
      failEntries();

      const response = await asRavi.post(LEADS).send(newLead);

      expect(response.status).toBe(500);
      expect(errorOf(response).code).toBe("INTERNAL_ERROR");
      expect(await prisma.lead.count()).toBe(0);
      expect(await prisma.timelineEntry.count()).toBe(0);
    });

    it("does not change the status, by editing or by marking lost", async () => {
      const lead = await makeLead(ravi, { company: "Before" });
      failEntries();

      const edited = await asRavi
        .patch(`${LEADS}/${lead.id}`)
        .send({ status: "CONTACTED", company: "After" });
      const lost = await asRavi.post(`${LEADS}/${lead.id}/mark-lost`).send({ reason: "PRICE" });

      expect([edited.status, lost.status]).toEqual([500, 500]);
      expect(await storedLead(lead.id)).toMatchObject({
        status: "NEW",
        company: "Before",
        lostReason: null,
        lostAt: null,
      });
      expect(await storedEntries(lead.id)).toEqual([]);
    });

    it("does not change the owner", async () => {
      const lead = await makeLead(meera);
      failEntries();

      const response = await asMeera.post(`${LEADS}/${lead.id}/assign`).send({ ownerId: ravi.id });

      expect(response.status).toBe(500);
      expect((await storedLead(lead.id)).ownerId).toBe(meera.id);
    });

    it("does not move lastContactAt for a conversation", async () => {
      const lead = await makeLead(ravi);
      failEntries();

      const response = await asRavi.post(`${LEADS}/${lead.id}/conversations`).send(conversation());

      expect(response.status).toBe(500);
      expect((await storedLead(lead.id)).lastContactAt).toBeNull();
    });
  });
});

describe("POST /leads/:id/conversations", () => {
  it("logs a conversation as the caller and answers with the entry", async () => {
    const lead = await makeLead(ravi);
    const occurredAt = "2026-03-04T09:30:00.000Z";

    const response = await asRavi
      .post(`${LEADS}/${lead.id}/conversations`)
      .send({ type: "MEETING", occurredAt, summary: "  Walked through the proposal  " });
    const entry = entryOf(response);
    const [stored] = await storedEntries(lead.id);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(entry).toEqual({
      id: stored?.id,
      kind: "CONVERSATION",
      conversationType: "MEETING",
      body: "Walked through the proposal",
      details: null,
      occurredAt,
      author: { id: ravi.id, name: "Ravi Rep" },
      createdAt: stored?.createdAt.toISOString(),
      fromLead: null,
    });
    expect(await storedEntries(lead.id)).toHaveLength(1);
  });

  it.each(["CALL", "MEETING", "EMAIL", "MESSAGE"])("accepts the type %s", async (type) => {
    const lead = await makeLead(ravi);

    const response = await asRavi
      .post(`${LEADS}/${lead.id}/conversations`)
      .send(conversation({ type }));

    expect(response.status).toBe(201);
    expect(entryOf(response).conversationType).toBe(type);
  });

  it("accepts a time with an offset and stores the same moment", async () => {
    const lead = await makeLead(ravi);

    const response = await asRavi
      .post(`${LEADS}/${lead.id}/conversations`)
      .send(conversation({ occurredAt: "2026-03-04T15:00:00+05:30" }));

    expect(response.status).toBe(201);
    expect(entryOf(response).occurredAt).toBe("2026-03-04T09:30:00.000Z");
  });

  it("accepts a conversation from long ago and one a few minutes ahead", async () => {
    const lead = await makeLead(ravi);

    const longAgo = await asRavi
      .post(`${LEADS}/${lead.id}/conversations`)
      .send(conversation({ occurredAt: "2019-01-01T00:00:00Z" }));
    const slightlyAhead = await asRavi
      .post(`${LEADS}/${lead.id}/conversations`)
      .send(conversation({ occurredAt: new Date(Date.now() + 4 * MINUTE).toISOString() }));

    expect(longAgo.status).toBe(201);
    expect(slightlyAhead.status).toBe(201);
  });

  it("refuses a conversation more than 5 minutes in the future", async () => {
    const lead = await makeLead(ravi);

    const response = await asRavi
      .post(`${LEADS}/${lead.id}/conversations`)
      .send(conversation({ occurredAt: new Date(Date.now() + 6 * MINUTE).toISOString() }));

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(["occurredAt"]);
    expect(await storedEntries(lead.id)).toEqual([]);
  });

  it("accepts a summary of 5000 characters", async () => {
    const lead = await makeLead(ravi);

    const response = await asRavi
      .post(`${LEADS}/${lead.id}/conversations`)
      .send(conversation({ summary: "x".repeat(5000) }));

    expect(response.status).toBe(201);
  });

  it.each([
    ["a missing type", "type", { type: undefined }],
    ["an unknown type", "type", { type: "LUNCH" }],
    ["a missing time", "occurredAt", { occurredAt: undefined }],
    ["a time that is not a date", "occurredAt", { occurredAt: "yesterday" }],
    ["a day without a time", "occurredAt", { occurredAt: "2026-03-04" }],
    ["a time without a zone", "occurredAt", { occurredAt: "2026-03-04T09:30:00" }],
    ["a missing summary", "summary", { summary: undefined }],
    ["an empty summary", "summary", { summary: "" }],
    ["a summary of spaces", "summary", { summary: "   " }],
    ["a summary of 5001 characters", "summary", { summary: "x".repeat(5001) }],
    // The author and the time of writing are never the caller's to choose.
    ["an author", "", { authorId: UNKNOWN_ID }],
    ["a createdAt", "", { createdAt: "2020-01-01T00:00:00Z" }],
    ["a kind", "", { kind: "NOTE" }],
  ])("answers VALIDATION_FAILED for %s", async (_what, path, fields) => {
    const lead = await makeLead(ravi);

    const response = await asRavi
      .post(`${LEADS}/${lead.id}/conversations`)
      .send(conversation(fields));

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await storedEntries(lead.id)).toEqual([]);
  });
});

describe("POST /leads/:id/notes", () => {
  it("adds a note as the caller, dated now, and answers with the entry", async () => {
    const lead = await makeLead(ravi);
    const before = Date.now();

    const response = await asMeera
      .post(`${LEADS}/${lead.id}/notes`)
      .send({ body: "  Prefers email  " });
    const entry = entryOf(response);
    const [stored] = await storedEntries(lead.id);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(entry).toEqual({
      id: stored?.id,
      kind: "NOTE",
      conversationType: null,
      body: "Prefers email",
      details: null,
      occurredAt: entry.occurredAt,
      author: { id: meera.id, name: "Meera Manager" },
      createdAt: entry.createdAt,
      fromLead: null,
    });
    expect(new Date(entry.occurredAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(entry.occurredAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it.each([
    ["an empty body", "body", { body: "" }],
    ["a body of spaces", "body", { body: "   " }],
    ["a body of 5001 characters", "body", { body: "x".repeat(5001) }],
    ["a missing body", "body", {}],
    // A note is always dated now and written by the caller.
    ["a time", "", { body: "ok", occurredAt: "2020-01-01T00:00:00Z" }],
    ["an author", "", { body: "ok", authorId: UNKNOWN_ID }],
  ])("answers VALIDATION_FAILED for %s", async (_what, path, body) => {
    const lead = await makeLead(ravi);

    const response = await asRavi.post(`${LEADS}/${lead.id}/notes`).send(body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await storedEntries(lead.id)).toEqual([]);
  });
});

describe("who may write on a lead's timeline", () => {
  it("lets an Admin write on anyone's lead", async () => {
    const lead = await makeLead(tara);

    for (const [, write] of writesTo(asAdmin, lead.id)) {
      expect((await write()).status).toBe(201);
    }
    expect(await storedEntries(lead.id)).toHaveLength(2);
  });

  it("lets a Sales Manager write on their own and their team's leads", async () => {
    const own = await makeLead(meera);
    const teams = await makeLead(ravi);

    for (const [, write] of [...writesTo(asMeera, own.id), ...writesTo(asMeera, teams.id)]) {
      expect((await write()).status).toBe(201);
    }
  });

  it("lets a Sales Rep write on their own leads", async () => {
    const lead = await makeLead(ravi);

    for (const [, write] of writesTo(asRavi, lead.id)) {
      const response = await write();
      expect(response.status).toBe(201);
      expect(entryOf(response).author).toEqual({ id: ravi.id, name: "Ravi Rep" });
    }
  });

  it("answers NOT_FOUND when a Sales Manager writes on a lead outside their team", async () => {
    const lead = await makeLead(tara);

    for (const [what, write] of writesTo(asMeera, lead.id)) {
      const response = await write();
      expect(response.status, what).toBe(404);
      expect(errorOf(response).code, what).toBe("NOT_FOUND");
    }
    expect(await storedEntries(lead.id)).toEqual([]);
  });

  it("answers NOT_FOUND when a Sales Rep writes on someone else's lead", async () => {
    const lead = await makeLead(meera);

    for (const [what, write] of writesTo(asRavi, lead.id)) {
      const response = await write();
      expect(response.status, what).toBe(404);
      expect(errorOf(response).code, what).toBe("NOT_FOUND");
    }
    expect(await storedEntries(lead.id)).toEqual([]);
  });

  it("answers FORBIDDEN for a Read-only user, whether or not the lead exists", async () => {
    const lead = await makeLead(ravi);

    for (const [what, write] of [
      ...writesTo(asViewer, lead.id),
      ...writesTo(asViewer, UNKNOWN_ID),
    ]) {
      const response = await write();
      expect(response.status, what).toBe(403);
      expect(errorOf(response).code, what).toBe("FORBIDDEN");
    }
    expect(await storedEntries(lead.id)).toEqual([]);
  });

  it("answers NOT_FOUND for a lead that does not exist or was deleted", async () => {
    const deleted = await makeLead(ravi, { deletedAt: new Date() });

    for (const [what, write] of [
      ...writesTo(asAdmin, UNKNOWN_ID),
      ...writesTo(asAdmin, deleted.id),
    ]) {
      const response = await write();
      expect(response.status, what).toBe(404);
      expect(errorOf(response).code, what).toBe("NOT_FOUND");
    }
    expect(await prisma.timelineEntry.count()).toBe(0);
  });

  it.each(["CONVERTED", "LOST"] as const)("still accepts both on a %s lead", async (status) => {
    const lead = await makeLead(ravi, { status });

    for (const [, write] of writesTo(asRavi, lead.id)) {
      expect((await write()).status).toBe(201);
    }
    expect((await storedLead(lead.id)).status).toBe(status);
  });
});

describe("lastContactAt", () => {
  function log(lead: Lead, occurredAt: Date) {
    return asRavi
      .post(`${LEADS}/${lead.id}/conversations`)
      .send(conversation({ occurredAt: occurredAt.toISOString() }));
  }

  async function lastContactOf(lead: Lead): Promise<string | null> {
    return leadOf(await asRavi.get(`${LEADS}/${lead.id}`)).lastContactAt;
  }

  it("is null until a conversation is logged, and then its time", async () => {
    const lead = await makeLead(ravi);
    const before = await lastContactOf(lead);

    await log(lead, day(4, 9));

    expect(before).toBeNull();
    expect(await lastContactOf(lead)).toBe("2026-03-04T09:00:00.000Z");
  });

  it("moves forward to a later conversation and never back to an earlier one", async () => {
    const lead = await makeLead(ravi);

    await log(lead, day(4));
    await log(lead, day(6));
    await log(lead, day(5));
    await log(lead, day(1));

    expect(await lastContactOf(lead)).toBe("2026-03-06T00:00:00.000Z");
    expect(await storedEntries(lead.id)).toHaveLength(4);
  });

  it("is not set by a note or by a status change", async () => {
    const lead = await makeLead(ravi);

    await asRavi.post(`${LEADS}/${lead.id}/notes`).send({ body: "Prefers email" });
    await asRavi.patch(`${LEADS}/${lead.id}`).send({ status: "CONTACTED" });

    expect(await lastContactOf(lead)).toBeNull();
  });

  it("belongs to one lead only, and leaves updatedAt alone", async () => {
    const lead = await makeLead(ravi);
    const other = await makeLead(ravi);

    await log(lead, day(4));

    expect((await storedLead(other.id)).lastContactAt).toBeNull();
    expect((await storedLead(lead.id)).updatedAt).toEqual(lead.updatedAt);
  });
});

describe("GET /leads/:id/timeline", () => {
  function read(lead: Lead, query: Record<string, string | number> = {}, agent: Agent = asAdmin) {
    return agent.get(`${LEADS}/${lead.id}/timeline`).query(query);
  }

  // One entry of every kind on one lead, a day apart, written in a jumbled order.
  async function fullTimeline() {
    const lead = await makeLead(ravi);
    await makeEntry(lead, ravi, { kind: "STATUS_CHANGE", body: null, occurredAt: day(3) });
    await makeEntry(lead, ravi, { kind: "CREATED", body: null, occurredAt: day(1) });
    await makeEntry(lead, meera, { kind: "ASSIGNMENT", body: null, occurredAt: day(5) });
    await makeEntry(lead, ravi, { kind: "NOTE", body: "note", occurredAt: day(4) });
    await makeEntry(lead, ravi, {
      kind: "CONVERSATION",
      conversationType: "CALL",
      body: "call",
      occurredAt: day(2),
    });
    return lead;
  }

  it("answers with the entries newest first, in the list envelope", async () => {
    const lead = await fullTimeline();

    const response = await read(lead);
    const body = response.body as Envelope<ApiEntry[]>;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
    expect(kindsOf(response)).toEqual([
      "ASSIGNMENT",
      "NOTE",
      "STATUS_CHANGE",
      "CONVERSATION",
      "CREATED",
    ]);
    expect(body.meta).toEqual({ page: 1, pageSize: 25, total: 5 });
    expect(Object.keys(body.data[0] ?? {}).sort()).toEqual([
      "author",
      "body",
      "conversationType",
      "createdAt",
      "details",
      "fromLead",
      "id",
      "kind",
      "occurredAt",
    ]);
    // A lead's own timeline holds only its own entries.
    expect(body.data.map((entry) => entry.fromLead)).toEqual([null, null, null, null, null]);
  });

  it("orders by when it happened, not by when it was written down", async () => {
    const lead = await makeLead(ravi);
    await asRavi.post(`${LEADS}/${lead.id}/notes`).send({ body: "written first, happened now" });
    await asRavi
      .post(`${LEADS}/${lead.id}/conversations`)
      .send(conversation({ summary: "written second, happened last week", occurredAt: day(1) }));

    const response = await read(lead);

    expect(bodiesOf(response)).toEqual([
      "written first, happened now",
      "written second, happened last week",
    ]);
  });

  it("breaks a tie on the time by createdAt, and then by id", async () => {
    const lead = await makeLead(ravi);
    const same = { occurredAt: day(2), createdAt: day(2) };
    await makeEntry(lead, ravi, { ...same, body: "low id", id: `${UNKNOWN_ID.slice(0, -1)}1` });
    await makeEntry(lead, ravi, { ...same, body: "high id", id: `${UNKNOWN_ID.slice(0, -1)}2` });
    await makeEntry(lead, ravi, { occurredAt: day(2), createdAt: day(3), body: "written later" });

    const response = await read(lead);

    expect(bodiesOf(response)).toEqual(["written later", "high id", "low id"]);
  });

  it.each([
    ["CONVERSATION", ["CONVERSATION"]],
    ["NOTE", ["NOTE"]],
    ["CREATED", ["CREATED"]],
    ["STATUS_CHANGE", ["STATUS_CHANGE"]],
    ["ASSIGNMENT", ["ASSIGNMENT"]],
    ["SYSTEM", ["ASSIGNMENT", "STATUS_CHANGE", "CREATED"]],
  ])("filters by kind=%s", async (kind, expected) => {
    const lead = await fullTimeline();

    const response = await read(lead, { kind });

    expect(response.status).toBe(200);
    expect(kindsOf(response)).toEqual(expected);
    expect((response.body as Envelope<ApiEntry[]>).meta).toEqual({
      page: 1,
      pageSize: 25,
      total: expected.length,
    });
  });

  it("pages through the timeline and reports the total", async () => {
    const lead = await fullTimeline();

    const first = await read(lead, { pageSize: 2 });
    const third = await read(lead, { pageSize: 2, page: 3 });
    const beyond = await read(lead, { pageSize: 2, page: 4 });

    expect(kindsOf(first)).toEqual(["ASSIGNMENT", "NOTE"]);
    expect(kindsOf(third)).toEqual(["CREATED"]);
    expect(kindsOf(beyond)).toEqual([]);
    expect((first.body as Envelope<ApiEntry[]>).meta).toEqual({ page: 1, pageSize: 2, total: 5 });
    expect((beyond.body as Envelope<ApiEntry[]>).meta).toEqual({ page: 4, pageSize: 2, total: 5 });
  });

  it("shows only the entries of the lead that was asked for", async () => {
    const lead = await makeLead(ravi);
    const other = await makeLead(ravi);
    await makeEntry(lead, ravi, { body: "mine" });
    await makeEntry(other, ravi, { body: "the other lead's" });

    expect(bodiesOf(await read(lead))).toEqual(["mine"]);
  });

  it("shows the system entries the lead's own history wrote", async () => {
    const created = await asMeera
      .post(LEADS)
      .send({ firstName: "Jane", lastName: "Doe", source: "EVENT" });
    const id = leadOf(created).id;
    await asMeera.patch(`${LEADS}/${id}`).send({ status: "QUALIFIED" });
    await asMeera.post(`${LEADS}/${id}/assign`).send({ ownerId: ravi.id });

    const response = await asRavi.get(`${LEADS}/${id}/timeline`);

    expect(kindsOf(response)).toEqual(["ASSIGNMENT", "STATUS_CHANGE", "CREATED"]);
    expect(entriesOf(response).map((entry) => entry.details)).toEqual([
      {
        fromOwner: { id: meera.id, name: "Meera Manager" },
        toOwner: { id: ravi.id, name: "Ravi Rep" },
      },
      { from: "NEW", to: "QUALIFIED" },
      null,
    ]);
    expect(entriesOf(response).every((entry) => entry.author.id === meera.id)).toBe(true);
  });

  it.each([
    ["kind", "TASK"],
    ["kind", "system"],
    ["page", "0"],
    ["pageSize", "101"],
  ])("answers VALIDATION_FAILED for %s=%s", async (key, value) => {
    const lead = await makeLead(ravi);

    const response = await read(lead, { [key]: value });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([key]);
  });

  it("lets an Admin and a Read-only user read any lead's timeline", async () => {
    const lead = await makeLead(tara);
    await makeEntry(lead, tara);

    for (const agent of [asAdmin, asViewer]) {
      const response = await read(lead, {}, agent);
      expect(response.status).toBe(200);
      expect(entriesOf(response)).toHaveLength(1);
    }
  });

  it("lets a Sales Manager read their team's timelines and a Sales Rep their own", async () => {
    const ravis = await makeLead(ravi);
    await makeEntry(ravis, ravi);

    expect((await read(ravis, {}, asMeera)).status).toBe(200);
    expect((await read(ravis, {}, asRavi)).status).toBe(200);
  });

  it("answers NOT_FOUND for a lead the caller may not see, exactly like one that does not exist", async () => {
    const taras = await makeLead(tara);
    const meeras = await makeLead(meera);
    await makeEntry(taras, tara);
    await makeEntry(meeras, meera);

    const outsideTeam = await read(taras, {}, asMeera);
    const notMine = await read(meeras, {}, asRavi);
    const unknown = await asRavi.get(`${LEADS}/${UNKNOWN_ID}/timeline`);

    expect(outsideTeam.status).toBe(404);
    expect(notMine.status).toBe(404);
    expect(notMine.body).toEqual(unknown.body);
    expect(errorOf(unknown).code).toBe("NOT_FOUND");
  });

  it("no longer shows the timeline of a deleted lead, though its entries are kept", async () => {
    const lead = await makeLead(ravi);
    await makeEntry(lead, ravi);
    await asRavi.delete(`${LEADS}/${lead.id}`);

    const response = await read(lead);

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("NOT_FOUND");
    expect(await storedEntries(lead.id)).toHaveLength(1);
  });
});

describe("entries are permanent", () => {
  it("documents no route that edits or deletes an entry", () => {
    const changing = registry.definitions.flatMap((definition) =>
      definition.type === "route" &&
      /timeline|conversations|notes|activity/.test(definition.route.path) &&
      !["get", "post"].includes(definition.route.method)
        ? [`${definition.route.method} ${definition.route.path}`]
        : [],
    );

    expect(changing).toEqual([]);
  });

  it("answers NOT_FOUND to every attempt to edit or delete one, and leaves it as it was", async () => {
    const lead = await makeLead(ravi);
    const entry = await makeEntry(lead, ravi, { body: "The original" });
    const urls = [
      `${LEADS}/${lead.id}/timeline`,
      `${LEADS}/${lead.id}/timeline/${entry.id}`,
      `${LEADS}/${lead.id}/conversations/${entry.id}`,
      `${LEADS}/${lead.id}/notes/${entry.id}`,
      `/api/v1/timeline/${entry.id}`,
      `/api/v1/activity/${entry.id}`,
    ];

    for (const url of urls) {
      for (const method of ["patch", "put", "delete"] as const) {
        const response = await asAdmin[method](url).send({ body: "Rewritten" });
        expect(response.status, `${method} ${url}`).toBe(404);
        expect(errorOf(response).code, `${method} ${url}`).toBe("NOT_FOUND");
      }
    }
    expect(await storedEntries(lead.id)).toEqual([entry]);
  });

  it("leaves an entry untouched by everything that later happens to its lead", async () => {
    const lead = await makeLead(ravi);
    await asRavi.post(`${LEADS}/${lead.id}/notes`).send({ body: "Before the changes" });
    const [before] = await storedEntries(lead.id);

    await asAdmin.patch(`${LEADS}/${lead.id}`).send({ status: "QUALIFIED", company: "Acme" });
    await asAdmin.post(`${LEADS}/${lead.id}/assign`).send({ ownerId: meera.id });
    await asAdmin.post(`${LEADS}/${lead.id}/mark-lost`).send({ reason: "PRICE" });

    expect((await storedEntries(lead.id))[0]).toEqual(before);
  });
});

// Contacts, companies and opportunities have the same three routes and the same rules as
// leads. What differs: a contact and a company have no status, and a company does not
// remember when it was last spoken to. An opportunity's stage changes are tested with the
// opportunities themselves.
describe.each([
  {
    type: "contact",
    base: "/api/v1/contacts",
    column: "contactId",
    convertedColumn: "convertedContactId",
  },
  {
    type: "company",
    base: "/api/v1/companies",
    column: "companyId",
    convertedColumn: "convertedCompanyId",
  },
  {
    type: "opportunity",
    base: "/api/v1/opportunities",
    column: "opportunityId",
    convertedColumn: "convertedOpportunityId",
  },
] as const)("the timeline of a $type", ({ type, base, column, convertedColumn }) => {
  const newRecord =
    type === "contact" ? { firstName: "Jane", lastName: "Doe" } : { name: "Acme Holdings" };

  // Straight into the database: a record with no entries at all.
  async function makeRecord(
    owner: User,
    fields: { deletedAt?: Date } = {},
  ): Promise<{ id: string }> {
    const common = { ownerId: owner.id, createdById: owner.id, ...fields };
    switch (type) {
      case "contact": {
        return prisma.contact.create({
          data: { firstName: "Contact", lastName: "One", ...common },
        });
      }
      case "company": {
        return prisma.company.create({ data: { name: "Company One", ...common } });
      }
      case "opportunity": {
        const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { kind: "OPEN" } });
        return prisma.opportunity.create({
          data: { name: "Opportunity One", stageId: stage.id, ...common },
        });
      }
    }
  }

  function storedRecords(): Promise<{ id: string; ownerId: string }[]> {
    switch (type) {
      case "contact": {
        return prisma.contact.findMany();
      }
      case "company": {
        return prisma.company.findMany();
      }
      case "opportunity": {
        return prisma.opportunity.findMany();
      }
    }
  }

  function makeRecordEntry(
    record: { id: string },
    author: User,
    fields: Partial<Prisma.TimelineEntryUncheckedCreateInput> = {},
  ) {
    return prisma.timelineEntry.create({
      data: {
        kind: "NOTE",
        body: "A note",
        occurredAt: new Date(),
        authorId: author.id,
        [column]: record.id,
        ...fields,
      },
    });
  }

  function storedRecordEntries(id: string): Promise<TimelineEntry[]> {
    return prisma.timelineEntry.findMany({
      where: { [column]: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  function writesOn(agent: Agent, id: string) {
    return [
      ["a conversation", () => agent.post(`${base}/${id}/conversations`).send(conversation())],
      ["a note", () => agent.post(`${base}/${id}/notes`).send({ body: "Prefers email" })],
    ] as const;
  }

  describe("system entries", () => {
    it("writes one CREATED entry when it is created, by the caller, on this record only", async () => {
      const response = await asMeera.post(base).send({ ...newRecord, ownerId: ravi.id });
      const created = (response.body as Envelope<{ id: string; createdAt: string }>).data;

      expect(response.status).toBe(201);
      const entries = await prisma.timelineEntry.findMany();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        kind: "CREATED",
        authorId: meera.id,
        body: null,
        details: null,
        conversationType: null,
        leadId: null,
        contactId: type === "contact" ? created.id : null,
        companyId: type === "company" ? created.id : null,
        opportunityId: type === "opportunity" ? created.id : null,
      });
      expect(entries[0]?.occurredAt.toISOString()).toBe(created.createdAt);
    });

    it("writes one ASSIGNMENT entry naming both owners when it is assigned", async () => {
      const record = await makeRecord(ravi);

      const response = await asAdmin.post(`${base}/${record.id}/assign`).send({ ownerId: tara.id });

      expect(response.status).toBe(200);
      const entries = await storedRecordEntries(record.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        kind: "ASSIGNMENT",
        authorId: admin.id,
        details: {
          fromOwner: { id: ravi.id, name: "Ravi Rep" },
          toOwner: { id: tara.id, name: "Tara Rep" },
        },
      });
    });

    it("writes nothing when it is assigned to the owner it already has, edited, deleted or refused", async () => {
      const record = await makeRecord(ravi);

      await asMeera.post(`${base}/${record.id}/assign`).send({ ownerId: ravi.id });
      await asMeera.post(`${base}/${record.id}/assign`).send({ ownerId: tara.id });
      await asRavi.post(`${base}/${record.id}/assign`).send({ ownerId: meera.id });
      await asRavi.patch(`${base}/${record.id}`).send({ notes: "Edited" });
      await asViewer.post(base).send(newRecord);
      await asRavi.delete(`${base}/${record.id}`);

      expect(await prisma.timelineEntry.count()).toBe(0);
    });

    it("does not create or reassign the record when the entry cannot be written", async () => {
      const record = await makeRecord(meera);
      vi.spyOn(timeline, "addTimelineEntry").mockRejectedValue(new Error("entry failed"));

      const created = await asRavi.post(base).send(newRecord);
      const assigned = await asMeera.post(`${base}/${record.id}/assign`).send({ ownerId: ravi.id });

      expect([created.status, assigned.status]).toEqual([500, 500]);
      expect(errorOf(created).code).toBe("INTERNAL_ERROR");
      const rows = await storedRecords();
      expect(rows.map((row) => ({ id: row.id, ownerId: row.ownerId }))).toEqual([
        { id: record.id, ownerId: meera.id },
      ]);
    });
  });

  describe("conversations and notes", () => {
    it("logs a conversation as the caller and answers with the entry", async () => {
      const record = await makeRecord(ravi);
      const occurredAt = "2026-03-04T09:30:00.000Z";

      const response = await asRavi
        .post(`${base}/${record.id}/conversations`)
        .send({ type: "MEETING", occurredAt, summary: "  Agreed on a demo  " });
      const entry = entryOf(response);

      expect(response.status).toBe(201);
      expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
      expect(entry).toEqual({
        id: entry.id,
        kind: "CONVERSATION",
        conversationType: "MEETING",
        body: "Agreed on a demo",
        details: null,
        occurredAt,
        author: { id: ravi.id, name: "Ravi Rep" },
        createdAt: entry.createdAt,
        fromLead: null,
      });
      expect(await storedRecordEntries(record.id)).toHaveLength(1);
    });

    it("adds a note as the caller, dated now", async () => {
      const record = await makeRecord(ravi);
      const before = Date.now();

      const response = await asMeera.post(`${base}/${record.id}/notes`).send({ body: " Hello " });
      const entry = entryOf(response);

      expect(response.status).toBe(201);
      expect(entry).toMatchObject({
        kind: "NOTE",
        conversationType: null,
        body: "Hello",
        author: { id: meera.id, name: "Meera Manager" },
      });
      expect(new Date(entry.occurredAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it.each([
      ["a conversation without a type", { type: undefined }, "type"],
      ["a conversation with an unknown type", { type: "FAX" }, "type"],
      ["a conversation without a summary", { summary: " " }, "summary"],
      [
        "a conversation in the future",
        { occurredAt: new Date(Date.now() + 60 * MINUTE).toISOString() },
        "occurredAt",
      ],
      ["a conversation with an author", { authorId: UNKNOWN_ID }, ""],
    ])("answers VALIDATION_FAILED for %s", async (_what, fields, path) => {
      const record = await makeRecord(ravi);

      const response = await asRavi
        .post(`${base}/${record.id}/conversations`)
        .send(conversation(fields));

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual([path]);
      expect(await prisma.timelineEntry.count()).toBe(0);
    });

    it.each([
      ["an empty note", { body: "" }, "body"],
      ["a note over 5000 characters", { body: "x".repeat(5001) }, "body"],
      ["a note with a date", { body: "Hi", occurredAt: "2026-01-01T00:00:00Z" }, ""],
    ])("answers VALIDATION_FAILED for %s", async (_what, body, path) => {
      const record = await makeRecord(ravi);

      const response = await asRavi.post(`${base}/${record.id}/notes`).send(body);

      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual([path]);
      expect(await prisma.timelineEntry.count()).toBe(0);
    });
  });

  describe("who may write on it", () => {
    it("lets an Admin write on anyone's, a Sales Manager on the team's, a Sales Rep on their own", async () => {
      const ofTara = await makeRecord(tara);
      const ofRavi = await makeRecord(ravi);
      const ofMeera = await makeRecord(meera);

      const allowed = [
        ...writesOn(asAdmin, ofTara.id),
        ...writesOn(asMeera, ofRavi.id),
        ...writesOn(asMeera, ofMeera.id),
        ...writesOn(asRavi, ofRavi.id),
      ];
      for (const [what, write] of allowed) {
        expect((await write()).status, what).toBe(201);
      }
      expect(await prisma.timelineEntry.count()).toBe(8);
    });

    it("answers NOT_FOUND outside the caller's reach, and for one that is missing or deleted", async () => {
      const ofTara = await makeRecord(tara);
      const ofMeera = await makeRecord(meera);
      const deleted = await makeRecord(ravi, { deletedAt: new Date() });

      const refused = [
        ...writesOn(asMeera, ofTara.id),
        ...writesOn(asRavi, ofTara.id),
        ...writesOn(asRavi, ofMeera.id),
        ...writesOn(asAdmin, deleted.id),
        ...writesOn(asAdmin, UNKNOWN_ID),
      ];
      const bodies = [];
      for (const [what, write] of refused) {
        const response = await write();
        expect(response.status, what).toBe(404);
        expect(errorOf(response).code).toBe("NOT_FOUND");
        bodies.push(JSON.stringify(response.body));
      }
      // A hidden record answers exactly like a missing one.
      expect(new Set(bodies).size).toBe(1);
      expect(await prisma.timelineEntry.count()).toBe(0);
    });

    it("answers FORBIDDEN for a Read-only user, whether or not the record exists", async () => {
      const record = await makeRecord(ravi);

      for (const [what, write] of [
        ...writesOn(asViewer, record.id),
        ...writesOn(asViewer, UNKNOWN_ID),
      ]) {
        const response = await write();
        expect(response.status, what).toBe(403);
        expect(errorOf(response).code).toBe("FORBIDDEN");
      }
      expect(await prisma.timelineEntry.count()).toBe(0);
    });
  });

  describe("the history of a lead converted into it", () => {
    // A lead of Tara's (another team) converted into a record of Ravi's, with its entries
    // between the record's own: the record's are on the odd days, the lead's on the even.
    async function convertedSetUp() {
      const record = await makeRecord(ravi);
      const lead = await makeLead(tara, {
        firstName: "Lara",
        lastName: "Lead",
        status: "CONVERTED",
        convertedAt: day(6),
        [convertedColumn]: record.id,
      });
      const unrelated = await makeLead(tara, { firstName: "Other" });
      await makeRecordEntry(record, ravi, { kind: "CREATED", body: null, occurredAt: day(1) });
      await makeEntry(lead, tara, { kind: "CREATED", body: null, occurredAt: day(2) });
      await makeRecordEntry(record, ravi, { body: "record note", occurredAt: day(3) });
      await makeEntry(lead, tara, {
        kind: "CONVERSATION",
        conversationType: "CALL",
        body: "lead call",
        occurredAt: day(4),
      });
      await makeRecordEntry(record, meera, {
        kind: "CONVERSATION",
        conversationType: "MEETING",
        body: "record meeting",
        occurredAt: day(5),
      });
      await makeEntry(lead, tara, { body: "lead note", occurredAt: day(6) });
      await makeEntry(unrelated, tara, { body: "not converted here", occurredAt: day(7) });
      return { record, lead, url: `${base}/${record.id}/timeline` };
    }

    it("merges the lead's entries in date order, each labelled with the lead", async () => {
      const { lead, url } = await convertedSetUp();

      const response = await asRavi.get(url);
      const entries = entriesOf(response);
      const fromLead = { id: lead.id, name: "Lara Lead" };

      expect(response.status).toBe(200);
      expect(entries.map((entry) => [entry.kind, entry.body, entry.fromLead])).toEqual([
        ["NOTE", "lead note", fromLead],
        ["CONVERSATION", "record meeting", null],
        ["CONVERSATION", "lead call", fromLead],
        ["NOTE", "record note", null],
        ["CREATED", null, fromLead],
        ["CREATED", null, null],
      ]);
      expect(entries[0]?.author).toEqual({ id: tara.id, name: "Tara Rep" });
      expect((response.body as Envelope<ApiEntry[]>).meta).toEqual({
        page: 1,
        pageSize: 25,
        total: 6,
      });
    });

    it("pages and filters over both together", async () => {
      const { url } = await convertedSetUp();

      const second = await asRavi.get(url).query({ pageSize: 4, page: 2 });
      const notes = await asRavi.get(url).query({ kind: "NOTE" });
      const calls = await asRavi.get(url).query({ kind: "CONVERSATION", pageSize: 1, page: 2 });
      const system = await asRavi.get(url).query({ kind: "SYSTEM" });

      expect(entriesOf(second).map((entry) => [entry.kind, entry.fromLead?.name ?? null])).toEqual([
        ["CREATED", "Lara Lead"],
        ["CREATED", null],
      ]);
      expect((second.body as Envelope<ApiEntry[]>).meta).toEqual({
        page: 2,
        pageSize: 4,
        total: 6,
      });
      expect(bodiesOf(notes)).toEqual(["lead note", "record note"]);
      expect(bodiesOf(calls)).toEqual(["lead call"]);
      expect((calls.body as Envelope<ApiEntry[]>).meta).toEqual({
        page: 2,
        pageSize: 1,
        total: 2,
      });
      expect(entriesOf(system).map((entry) => entry.fromLead?.name ?? null)).toEqual([
        "Lara Lead",
        null,
      ]);
    });

    it("shows them to everyone who may see the record, whoever owns the lead", async () => {
      const { url } = await convertedSetUp();
      const asTara = await signInAs(app, tara);

      for (const agent of [asRavi, asMeera, asAdmin, asViewer]) {
        const response = await agent.get(url);
        expect(response.status).toBe(200);
        expect((response.body as Envelope<ApiEntry[]>).meta.total).toBe(6);
      }
      // Tara owns the lead but cannot see Ravi's record, so she does not get its timeline.
      const forTara = await asTara.get(url);
      expect(forTara.status).toBe(404);
      expect(errorOf(forTara).code).toBe("NOT_FOUND");
    });

    it("leaves the lead's own timeline as it was", async () => {
      const { lead } = await convertedSetUp();

      const response = await asAdmin.get(`${LEADS}/${lead.id}/timeline`);

      expect(bodiesOf(response)).toEqual(["lead note", "lead call", null]);
      expect(entriesOf(response).map((entry) => entry.fromLead)).toEqual([null, null, null]);
    });

    it("leaves out the entries of a deleted lead", async () => {
      const { lead, url } = await convertedSetUp();
      await prisma.lead.update({ where: { id: lead.id }, data: { deletedAt: new Date() } });

      expect(bodiesOf(await asRavi.get(url))).toEqual(["record meeting", "record note", null]);
    });

    it("writes a new conversation or note to the record only", async () => {
      const { record, lead } = await convertedSetUp();
      const before = await storedEntries(lead.id);

      for (const [what, write] of writesOn(asRavi, record.id)) {
        const response = await write();
        expect(response.status, what).toBe(201);
        expect(entryOf(response).fromLead, what).toBeNull();
      }

      expect(await storedEntries(lead.id)).toEqual(before);
      expect(await storedRecordEntries(record.id)).toHaveLength(5);
    });
  });

  describe("reading it", () => {
    it("answers with this record's entries only, newest first, in the list envelope", async () => {
      const record = await makeRecord(ravi);
      const other = await makeRecord(ravi);
      const lead = await makeLead(ravi);
      await makeRecordEntry(record, ravi, { body: "first", occurredAt: day(1) });
      await makeRecordEntry(record, meera, { body: "third", occurredAt: day(3) });
      await makeRecordEntry(record, ravi, {
        kind: "CONVERSATION",
        conversationType: "CALL",
        body: "second",
        occurredAt: day(2),
      });
      await makeRecordEntry(other, ravi, { body: "another record" });
      await makeEntry(lead, ravi, { body: "a lead" });

      const response = await asRavi.get(`${base}/${record.id}/timeline`);

      expect(response.status).toBe(200);
      expect(bodiesOf(response)).toEqual(["third", "second", "first"]);
      expect((response.body as Envelope<ApiEntry[]>).meta).toEqual({
        page: 1,
        pageSize: 25,
        total: 3,
      });
      expect(entriesOf(response)[0]?.author).toEqual({ id: meera.id, name: "Meera Manager" });
    });

    it("filters by kind and pages", async () => {
      const record = await makeRecord(ravi);
      await makeRecordEntry(record, ravi, { kind: "CREATED", body: null, occurredAt: day(1) });
      await makeRecordEntry(record, ravi, { body: "note", occurredAt: day(2) });
      await makeRecordEntry(record, ravi, { kind: "ASSIGNMENT", body: null, occurredAt: day(3) });
      const url = `${base}/${record.id}/timeline`;

      expect(kindsOf(await asRavi.get(url).query({ kind: "NOTE" }))).toEqual(["NOTE"]);
      expect(kindsOf(await asRavi.get(url).query({ kind: "SYSTEM" }))).toEqual([
        "ASSIGNMENT",
        "CREATED",
      ]);
      const second = await asRavi.get(url).query({ pageSize: 2, page: 2 });
      expect(kindsOf(second)).toEqual(["CREATED"]);
      expect((second.body as Envelope<ApiEntry[]>).meta).toEqual({
        page: 2,
        pageSize: 2,
        total: 3,
      });
      const bad = await asRavi.get(url).query({ kind: "EVERYTHING" });
      expect(bad.status).toBe(400);
      expect(detailPaths(bad)).toEqual(["kind"]);
    });

    it("shows what the record's own history wrote, through the API", async () => {
      const created = await asMeera.post(base).send(newRecord);
      const { id } = (created.body as Envelope<{ id: string }>).data;
      await asMeera.post(`${base}/${id}/assign`).send({ ownerId: ravi.id });
      await asRavi.post(`${base}/${id}/notes`).send({ body: "Prefers email" });

      const response = await asRavi.get(`${base}/${id}/timeline`);

      expect(kindsOf(response).sort()).toEqual(["ASSIGNMENT", "CREATED", "NOTE"]);
    });

    it("follows who may see the record", async () => {
      const ofRavi = await makeRecord(ravi);
      const ofTara = await makeRecord(tara);
      await makeRecordEntry(ofRavi, ravi);
      await makeRecordEntry(ofTara, tara);

      for (const agent of [asAdmin, asViewer]) {
        expect((await agent.get(`${base}/${ofTara.id}/timeline`)).status).toBe(200);
      }
      expect((await asMeera.get(`${base}/${ofRavi.id}/timeline`)).status).toBe(200);
      expect((await asRavi.get(`${base}/${ofRavi.id}/timeline`)).status).toBe(200);

      const missing = await asRavi.get(`${base}/${UNKNOWN_ID}/timeline`);
      for (const agent of [asMeera, asRavi]) {
        const hidden = await agent.get(`${base}/${ofTara.id}/timeline`);
        expect(hidden.status).toBe(404);
        expect(hidden.body).toEqual(missing.body);
      }
    });

    it("no longer shows the timeline once the record is deleted, though its entries are kept", async () => {
      const record = await makeRecord(ravi);
      await makeRecordEntry(record, ravi);

      await asRavi.delete(`${base}/${record.id}`);

      for (const agent of [asRavi, asAdmin, asViewer]) {
        expect((await agent.get(`${base}/${record.id}/timeline`)).status).toBe(404);
      }
      expect(await storedRecordEntries(record.id)).toHaveLength(1);
    });

    it("does not answer a record of another type under this path", async () => {
      const lead = await makeLead(ravi);
      await makeEntry(lead, ravi);

      const read = await asAdmin.get(`${base}/${lead.id}/timeline`);
      const written = await asAdmin.post(`${base}/${lead.id}/notes`).send({ body: "Wrong door" });

      expect([read.status, written.status]).toEqual([404, 404]);
      expect(await storedEntries(lead.id)).toHaveLength(1);
    });
  });
});

describe("lastContactAt on a contact", () => {
  const CONTACTS = "/api/v1/contacts";

  function makeContact(owner: User) {
    return prisma.contact.create({
      data: { firstName: "Contact", lastName: "One", ownerId: owner.id, createdById: owner.id },
    });
  }

  function storedContact(id: string) {
    return prisma.contact.findUniqueOrThrow({ where: { id } });
  }

  function log(id: string, occurredAt: Date) {
    return asRavi
      .post(`${CONTACTS}/${id}/conversations`)
      .send(conversation({ occurredAt: occurredAt.toISOString() }));
  }

  async function lastContactAt(id: string): Promise<string | null> {
    const response = await asRavi.get(`${CONTACTS}/${id}`);
    return (response.body as Envelope<{ lastContactAt: string | null }>).data.lastContactAt;
  }

  it("is null until a conversation is logged, and then its time", async () => {
    const contact = await makeContact(ravi);
    expect(await lastContactAt(contact.id)).toBeNull();

    await log(contact.id, day(5, 9));

    expect(await lastContactAt(contact.id)).toBe(day(5, 9).toISOString());
  });

  it("moves forward to a later conversation and never back to an earlier one", async () => {
    const contact = await makeContact(ravi);

    await log(contact.id, day(5));
    await log(contact.id, day(7));
    await log(contact.id, day(6));
    await log(contact.id, day(1));

    expect(await lastContactAt(contact.id)).toBe(day(7).toISOString());
  });

  it("is not set by a note or by an assignment", async () => {
    const contact = await makeContact(ravi);

    await asRavi.post(`${CONTACTS}/${contact.id}/notes`).send({ body: "A note" });
    await asMeera.post(`${CONTACTS}/${contact.id}/assign`).send({ ownerId: meera.id });

    expect((await storedContact(contact.id)).lastContactAt).toBeNull();
  });

  it("belongs to one contact only, and leaves updatedAt alone", async () => {
    const contact = await makeContact(ravi);
    const other = await makeContact(ravi);

    await log(contact.id, day(5));

    expect((await storedContact(contact.id)).updatedAt).toEqual(contact.updatedAt);
    expect((await storedContact(other.id)).lastContactAt).toBeNull();
  });

  it("does not move when the entry cannot be written", async () => {
    const contact = await makeContact(ravi);
    vi.spyOn(timeline, "addTimelineEntry").mockRejectedValue(new Error("entry failed"));

    const response = await log(contact.id, day(5));

    expect(response.status).toBe(500);
    expect((await storedContact(contact.id)).lastContactAt).toBeNull();
  });

  it("is not something a company has: a conversation there changes only the timeline", async () => {
    const company = await prisma.company.create({
      data: { name: "Acme", ownerId: ravi.id, createdById: ravi.id },
    });
    const contact = await prisma.contact.create({
      data: {
        firstName: "Jane",
        lastName: "Doe",
        ownerId: ravi.id,
        createdById: ravi.id,
        companyId: company.id,
      },
    });

    const response = await asRavi
      .post(`/api/v1/companies/${company.id}/conversations`)
      .send(conversation());

    expect(response.status).toBe(201);
    const after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(after.updatedAt).toEqual(company.updatedAt);
    expect(Object.keys(after)).not.toContain("lastContactAt");
    // Talking to the company is not talking to each person in it.
    expect(await lastContactAt(contact.id)).toBeNull();
  });
});

describe("one record per entry", () => {
  it("is enforced by the database: an entry with no record, or with two, is refused", async () => {
    const lead = await makeLead(ravi);
    const contact = await prisma.contact.create({
      data: { firstName: "Jane", lastName: "Doe", ownerId: ravi.id, createdById: ravi.id },
    });
    const entry = {
      kind: "NOTE",
      body: "A note",
      occurredAt: new Date(),
      authorId: ravi.id,
    } as const;

    await expect(prisma.timelineEntry.create({ data: entry })).rejects.toThrow();
    await expect(
      prisma.timelineEntry.create({ data: { ...entry, leadId: lead.id, contactId: contact.id } }),
    ).rejects.toThrow();
    const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { kind: "OPEN" } });
    const opportunity = await prisma.opportunity.create({
      data: { name: "Deal", stageId: stage.id, ownerId: ravi.id, createdById: ravi.id },
    });
    await expect(
      prisma.timelineEntry.create({
        data: { ...entry, leadId: lead.id, opportunityId: opportunity.id },
      }),
    ).rejects.toThrow();
    expect(await prisma.timelineEntry.count()).toBe(0);
  });
});

// LEAD-04 end to end: what a real conversion leaves on each timeline.
describe("a lead converted through the API", () => {
  it("shows its history on the contact, company and opportunity it became; the lead keeps its own", async () => {
    const created = await asRavi
      .post(LEADS)
      .send({ firstName: "Lara", lastName: "Lifecycle", source: "REFERRAL" });
    const leadId = leadOf(created).id;
    await asRavi
      .post(`${LEADS}/${leadId}/conversations`)
      .send(conversation({ summary: "Discovery call" }));
    const converted = await asRavi.post(`${LEADS}/${leadId}/convert`).send({
      company: { mode: "create", name: "Lifecycle Co" },
      contact: { mode: "create" },
      opportunity: { create: true, name: "Lifecycle Co - Pilot" },
    });
    expect(converted.status).toBe(200);
    const to = (
      converted.body as Envelope<{
        convertedTo: Record<"contact" | "company" | "opportunity", { id: string }>;
      }>
    ).data.convertedTo;
    const fromLead = { id: leadId, name: "Lara Lifecycle" };

    for (const [path, id] of [
      ["contacts", to.contact.id],
      ["companies", to.company.id],
      ["opportunities", to.opportunity.id],
    ] as const) {
      const response = await asRavi.get(`/api/v1/${path}/${id}/timeline`);
      expect(response.status, path).toBe(200);
      // Newest first: the lead's conversion (written last), the record's own CREATED, then
      // the lead's CREATED and its call of an hour ago. The lead's are labelled with it.
      expect(
        entriesOf(response).map((entry) => [entry.kind, entry.fromLead]),
        path,
      ).toEqual([
        ["STATUS_CHANGE", fromLead],
        ["CREATED", null],
        ["CREATED", fromLead],
        ["CONVERSATION", fromLead],
      ]);
      expect(bodiesOf(response)[3], path).toBe("Discovery call");
    }

    const ownTimeline = await asRavi.get(`${LEADS}/${leadId}/timeline`);
    expect(entriesOf(ownTimeline).map((entry) => [entry.kind, entry.fromLead])).toEqual([
      ["STATUS_CHANGE", null],
      ["CREATED", null],
      ["CONVERSATION", null],
    ]);
  });
});
