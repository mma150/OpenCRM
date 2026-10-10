import type request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  resetPipelineStages,
  resetRecords,
  signInAs,
  type ValidationDetail,
} from "../../../test/helpers";
import type {
  Company,
  Contact,
  Opportunity,
  PipelineStage,
  Prisma,
  TimelineEntry,
  User,
} from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import * as timeline from "../../lib/timeline";

interface Link {
  id: string;
  name: string;
}

interface ApiOpportunity {
  id: string;
  name: string;
  value: number;
  expectedCloseDate: string | null;
  stage: { id: string; name: string; kind: string };
  status: string;
  closeReason: string | null;
  closedAt: string | null;
  contact: Link | null;
  company: Link | null;
  notes: string | null;
  owner: Link;
  convertedFromLead: Link | null;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BoardColumn {
  stage: { id: string; name: string; position: number; kind: string };
  count: number;
  totalValue: number;
  opportunities: ApiOpportunity[];
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;
type StageName = "New" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const OPPORTUNITIES = "/api/v1/opportunities";
const BOARD = `${OPPORTUNITIES}/board`;

const app = createTestApp();

// Two teams: Meera manages Ravi, Omar manages Tara. Uma is a rep without a manager.
let admin: User;
let meera: User;
let ravi: User;
let omar: User;
let tara: User;
let uma: User;
let viewer: User;
let deactivated: User;

let asAdmin: Agent;
let asMeera: Agent;
let asRavi: Agent;
let asViewer: Agent;

// The default pipeline, by name.
let stages: Record<StageName, PipelineStage>;

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

function opportunityOf(response: request.Response): ApiOpportunity {
  return (response.body as Envelope<ApiOpportunity>).data;
}

function opportunitiesOf(response: request.Response): ApiOpportunity[] {
  return (response.body as Envelope<ApiOpportunity[]>).data;
}

function namesOf(response: request.Response): string[] {
  return opportunitiesOf(response).map((opportunity) => opportunity.name);
}

function metaOf(response: request.Response) {
  return (response.body as Envelope<unknown>).meta;
}

function boardOf(response: request.Response): BoardColumn[] {
  return (response.body as Envelope<BoardColumn[]>).data;
}

let opportunityCount = 0;

// Straight into the database, so a test can start from any state. Each opportunity is
// created a minute after the one before, and ids follow creation order, so the default
// order (newest first) and ties are predictable. It starts in the New stage.
async function makeOpportunity(
  owner: User,
  fields: Partial<Prisma.OpportunityUncheckedCreateInput> = {},
): Promise<Opportunity> {
  opportunityCount += 1;
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, opportunityCount));
  return prisma.opportunity.create({
    data: {
      id: `01920000-0000-7000-8000-${String(opportunityCount).padStart(12, "0")}`,
      name: `Deal ${String(opportunityCount)}`,
      stageId: stages.New.id,
      ownerId: owner.id,
      createdById: owner.id,
      createdAt,
      updatedAt: createdAt,
      ...fields,
    },
  });
}

function makeCompany(owner: User, name: string): Promise<Company> {
  return prisma.company.create({ data: { name, ownerId: owner.id, createdById: owner.id } });
}

function makeContact(owner: User, firstName: string, lastName: string): Promise<Contact> {
  return prisma.contact.create({
    data: { firstName, lastName, ownerId: owner.id, createdById: owner.id },
  });
}

function stored(id: string): Promise<Opportunity> {
  return prisma.opportunity.findUniqueOrThrow({ where: { id } });
}

// Every entry in the table for an opportunity, in the order they were written.
function storedEntries(opportunityId: string): Promise<TimelineEntry[]> {
  return prisma.timelineEntry.findMany({
    where: { opportunityId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

// The ways to change an existing opportunity that share one rule, in an order that lets all
// of them succeed on the same opportunity (delete last).
function writesTo(agent: Agent, id: string) {
  const url = `${OPPORTUNITIES}/${id}`;
  return [
    ["update", () => agent.patch(url).send({ notes: "Changed" })],
    ["move", () => agent.post(`${url}/stage`).send({ stageId: stages.Proposal.id })],
    ["close", () => agent.post(`${url}/close`).send({ outcome: "LOST", reason: "Price" })],
    ["reopen", () => agent.post(`${url}/reopen`)],
    ["delete", () => agent.delete(url)],
  ] as const;
}

beforeAll(async () => {
  await resetDatabase();
  await resetPipelineStages();
  admin = await createUser({ name: "Asha Admin", role: "ADMIN" });
  meera = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
  ravi = await createUser({ name: "Ravi Rep", role: "SALES_REP", managerId: meera.id });
  omar = await createUser({ name: "Omar Manager", role: "SALES_MANAGER" });
  tara = await createUser({ name: "Tara Rep", role: "SALES_REP", managerId: omar.id });
  uma = await createUser({ name: "Uma Rep", role: "SALES_REP" });
  viewer = await createUser({ name: "Vik Viewer", role: "READ_ONLY" });
  deactivated = await createUser({ name: "Dev Deactivated", role: "SALES_REP", isActive: false });

  asAdmin = await signInAs(app, admin);
  asMeera = await signInAs(app, meera);
  asRavi = await signInAs(app, ravi);
  asViewer = await signInAs(app, viewer);

  const rows = await prisma.pipelineStage.findMany();
  stages = Object.fromEntries(rows.map((stage) => [stage.name, stage])) as Record<
    StageName,
    PipelineStage
  >;
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

describe("who sees which opportunities", () => {
  // One opportunity per possible owner.
  async function oneEach() {
    return {
      ofAdmin: await makeOpportunity(admin, { name: "Of Admin" }),
      ofMeera: await makeOpportunity(meera, { name: "Of Meera" }),
      ofRavi: await makeOpportunity(ravi, { name: "Of Ravi" }),
      ofOmar: await makeOpportunity(omar, { name: "Of Omar" }),
      ofTara: await makeOpportunity(tara, { name: "Of Tara" }),
      ofUma: await makeOpportunity(uma, { name: "Of Uma" }),
    };
  }

  const everyOne = ["Of Uma", "Of Tara", "Of Omar", "Of Ravi", "Of Meera", "Of Admin"];

  it.each([
    ["an Admin", () => asAdmin, everyOne],
    ["a Read-only user", () => asViewer, everyOne],
    ["a Sales Manager (own and the team's)", () => asMeera, ["Of Ravi", "Of Meera"]],
    ["a Sales Rep (own only)", () => asRavi, ["Of Ravi"]],
  ])("lists the right opportunities for %s, newest first", async (_who, agent, expected) => {
    await oneEach();

    const response = await agent().get(OPPORTUNITIES);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(namesOf(response)).toEqual(expected);
    expect(metaOf(response)).toEqual({ page: 1, pageSize: 25, total: expected.length });
  });

  it("lets an Admin and a Read-only user read any opportunity", async () => {
    const { ofTara } = await oneEach();

    for (const agent of [asAdmin, asViewer]) {
      const response = await agent.get(`${OPPORTUNITIES}/${ofTara.id}`);
      expect(response.status).toBe(200);
      expect(opportunityOf(response).owner).toEqual({ id: tara.id, name: "Tara Rep" });
    }
  });

  it("lets a Sales Manager read their own and their team's, and nobody else's", async () => {
    const all = await oneEach();

    expect((await asMeera.get(`${OPPORTUNITIES}/${all.ofMeera.id}`)).status).toBe(200);
    expect((await asMeera.get(`${OPPORTUNITIES}/${all.ofRavi.id}`)).status).toBe(200);
    for (const outside of [all.ofAdmin, all.ofOmar, all.ofTara, all.ofUma]) {
      const response = await asMeera.get(`${OPPORTUNITIES}/${outside.id}`);
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });

  it("lets a Sales Rep read only their own, not even their manager's", async () => {
    const all = await oneEach();

    expect((await asRavi.get(`${OPPORTUNITIES}/${all.ofRavi.id}`)).status).toBe(200);
    for (const outside of [all.ofAdmin, all.ofMeera, all.ofTara, all.ofUma]) {
      const response = await asRavi.get(`${OPPORTUNITIES}/${outside.id}`);
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });

  it("answers a hidden opportunity exactly like one that does not exist", async () => {
    const { ofTara } = await oneEach();

    const hidden = await asRavi.get(`${OPPORTUNITIES}/${ofTara.id}`);
    const missing = await asRavi.get(`${OPPORTUNITIES}/${UNKNOWN_ID}`);

    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
  });
});

describe("create", () => {
  it("creates an opportunity owned by the caller, linked to a contact and a company", async () => {
    const acme = await makeCompany(ravi, "Acme");
    const jane = await makeContact(ravi, "Jane", "Doe");

    const response = await asRavi.post(OPPORTUNITIES).send({
      name: "  Fleet expansion  ",
      value: 48_000.5,
      expectedCloseDate: "2026-11-15",
      stageId: stages.Qualified.id,
      contactId: jane.id,
      companyId: acme.id,
      notes: "Wants a pilot first",
    });
    const opportunity = opportunityOf(response);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(opportunity).toEqual({
      id: opportunity.id,
      name: "Fleet expansion",
      value: 48_000.5,
      expectedCloseDate: "2026-11-15",
      stage: { id: stages.Qualified.id, name: "Qualified", kind: "OPEN" },
      status: "OPEN",
      closeReason: null,
      closedAt: null,
      contact: { id: jane.id, name: "Jane Doe" },
      company: { id: acme.id, name: "Acme" },
      notes: "Wants a pilot first",
      owner: { id: ravi.id, name: "Ravi Rep" },
      convertedFromLead: null,
      lastContactAt: null,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt,
    });
    expect(await stored(opportunity.id)).toMatchObject({ createdById: ravi.id });
  });

  it("starts in the first open stage with a value of 0 when only a name is sent", async () => {
    const response = await asRavi.post(OPPORTUNITIES).send({ name: "Bare", notes: "" });

    expect(response.status).toBe(201);
    expect(opportunityOf(response)).toMatchObject({
      value: 0,
      expectedCloseDate: null,
      stage: { id: stages.New.id, name: "New", kind: "OPEN" },
      status: "OPEN",
      contact: null,
      company: null,
      notes: null,
    });
  });

  it("writes one CREATED entry, by the caller", async () => {
    const response = await asMeera.post(OPPORTUNITIES).send({ name: "Deal", ownerId: ravi.id });

    const entries = await storedEntries(opportunityOf(response).id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "CREATED", authorId: meera.id, details: null });
    expect(entries[0]?.occurredAt.toISOString()).toBe(opportunityOf(response).createdAt);
  });

  it.each([
    ["no name", { name: undefined }, "name"],
    ["an empty name", { name: " " }, "name"],
    ["a name over 200 characters", { name: "x".repeat(201) }, "name"],
    ["a negative value", { value: -1 }, "value"],
    ["a value with three decimals", { value: 10.001 }, "value"],
    ["a value as text", { value: "100" }, "value"],
    ["a value too large to store", { value: 10_000_000_000 }, "value"],
    ["a date with a time", { expectedCloseDate: "2026-11-15T10:00:00Z" }, "expectedCloseDate"],
    ["a date that does not exist", { expectedCloseDate: "2026-02-30" }, "expectedCloseDate"],
    ["a stage that does not exist", { stageId: UNKNOWN_ID }, "stageId"],
    ["a contact that does not exist", { contactId: UNKNOWN_ID }, "contactId"],
    ["a company that does not exist", { companyId: UNKNOWN_ID }, "companyId"],
    ["a status", { status: "WON" }, ""],
    ["a close reason", { closeReason: "Because" }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_what, fields, path) => {
    const response = await asRavi.post(OPPORTUNITIES).send({ name: "Deal", ...fields });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await prisma.opportunity.count()).toBe(0);
  });

  it("does not start an opportunity in the Won or the Lost stage", async () => {
    for (const stage of [stages.Won, stages.Lost]) {
      const response = await asRavi.post(OPPORTUNITIES).send({ name: "Deal", stageId: stage.id });
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["stageId"]);
    }
    expect(await prisma.opportunity.count()).toBe(0);
  });

  it("refuses a contact or a company the caller may not see, like one that does not exist", async () => {
    const tarasCompany = await makeCompany(tara, "Tara Traders");
    const tarasContact = await makeContact(tara, "Tia", "Other");

    const company = await asRavi
      .post(OPPORTUNITIES)
      .send({ name: "Deal", companyId: tarasCompany.id });
    const contact = await asRavi
      .post(OPPORTUNITIES)
      .send({ name: "Deal", contactId: tarasContact.id });
    const missing = await asRavi.post(OPPORTUNITIES).send({ name: "Deal", companyId: UNKNOWN_ID });

    expect(detailPaths(company)).toEqual(["companyId"]);
    expect(detailPaths(contact)).toEqual(["contactId"]);
    expect(company.body).toEqual(missing.body);
    expect(await prisma.opportunity.count()).toBe(0);
  });

  it("lets a Sales Rep create only for themselves", async () => {
    const own = await asRavi.post(OPPORTUNITIES).send({ name: "Deal", ownerId: ravi.id });
    const forManager = await asRavi.post(OPPORTUNITIES).send({ name: "Deal", ownerId: meera.id });

    expect(own.status).toBe(201);
    expect(forManager.status).toBe(400);
    expect(detailPaths(forManager)).toEqual(["ownerId"]);
  });

  it("lets a Sales Manager create for their team, and an Admin for anyone who can own one", async () => {
    const forRavi = await asMeera.post(OPPORTUNITIES).send({ name: "Deal", ownerId: ravi.id });
    const forTara = await asMeera.post(OPPORTUNITIES).send({ name: "Deal", ownerId: tara.id });
    const byAdmin = await asAdmin.post(OPPORTUNITIES).send({ name: "Deal", ownerId: tara.id });

    expect(opportunityOf(forRavi).owner.id).toBe(ravi.id);
    expect(detailPaths(forTara)).toEqual(["ownerId"]);
    expect(opportunityOf(byAdmin).owner.id).toBe(tara.id);
    for (const ownerId of [viewer.id, deactivated.id, UNKNOWN_ID]) {
      const refused = await asAdmin.post(OPPORTUNITIES).send({ name: "Deal", ownerId });
      expect(detailPaths(refused)).toEqual(["ownerId"]);
    }
  });

  it("answers FORBIDDEN for a Read-only user", async () => {
    const response = await asViewer.post(OPPORTUNITIES).send({ name: "Deal" });

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect(await prisma.opportunity.count()).toBe(0);
  });
});

describe("the contact and company of an opportunity", () => {
  it("shows each only to someone who may see it", async () => {
    const tarasCompany = await makeCompany(tara, "Tara Traders");
    const tarasContact = await makeContact(tara, "Tia", "Other");
    const opportunity = await makeOpportunity(ravi, {
      companyId: tarasCompany.id,
      contactId: tarasContact.id,
    });

    const forAdmin = opportunityOf(await asAdmin.get(`${OPPORTUNITIES}/${opportunity.id}`));
    const forRavi = opportunityOf(await asRavi.get(`${OPPORTUNITIES}/${opportunity.id}`));
    const listed = opportunitiesOf(await asRavi.get(OPPORTUNITIES))[0];

    expect(forAdmin.company).toEqual({ id: tarasCompany.id, name: "Tara Traders" });
    expect(forAdmin.contact).toEqual({ id: tarasContact.id, name: "Tia Other" });
    expect(forRavi).toMatchObject({ company: null, contact: null });
    expect(listed).toMatchObject({ company: null, contact: null });
  });

  it("unlinks the opportunity when its contact or its company is deleted", async () => {
    const acme = await makeCompany(ravi, "Acme");
    const jane = await makeContact(ravi, "Jane", "Doe");
    const opportunity = await makeOpportunity(ravi, { companyId: acme.id, contactId: jane.id });

    await asRavi.delete(`/api/v1/companies/${acme.id}`);
    expect(await stored(opportunity.id)).toMatchObject({ companyId: null, contactId: jane.id });
    await asRavi.delete(`/api/v1/contacts/${jane.id}`);

    expect(await stored(opportunity.id)).toMatchObject({
      companyId: null,
      contactId: null,
      deletedAt: null,
    });
    const response = await asRavi.get(`${OPPORTUNITIES}/${opportunity.id}`);
    expect(opportunityOf(response)).toMatchObject({ company: null, contact: null });
  });
});

describe("update", () => {
  it("changes only the fields that were sent, and writes no timeline entry", async () => {
    const opportunity = await makeOpportunity(ravi, { name: "Before", value: 100, notes: "Keep" });

    const response = await asRavi
      .patch(`${OPPORTUNITIES}/${opportunity.id}`)
      .send({ name: "After", value: 250.75, expectedCloseDate: "2026-12-01" });

    expect(response.status).toBe(200);
    expect(opportunityOf(response)).toMatchObject({
      name: "After",
      value: 250.75,
      expectedCloseDate: "2026-12-01",
      notes: "Keep",
      stage: { name: "New" },
    });
    expect(await storedEntries(opportunity.id)).toEqual([]);
  });

  it("clears a field that is sent as null or as an empty string", async () => {
    const acme = await makeCompany(ravi, "Acme");
    const jane = await makeContact(ravi, "Jane", "Doe");
    const opportunity = await makeOpportunity(ravi, {
      notes: "Old",
      expectedCloseDate: new Date("2026-11-15"),
      companyId: acme.id,
      contactId: jane.id,
    });

    const response = await asRavi
      .patch(`${OPPORTUNITIES}/${opportunity.id}`)
      .send({ notes: "", expectedCloseDate: null, companyId: null, contactId: null });

    expect(response.status).toBe(200);
    expect(opportunityOf(response)).toMatchObject({
      notes: null,
      expectedCloseDate: null,
      company: null,
      contact: null,
    });
  });

  it.each([
    ["an empty name", { name: "" }, "name"],
    ["a null value", { value: null }, "value"],
    ["a negative value", { value: -0.01 }, "value"],
    ["a bad date", { expectedCloseDate: "tomorrow" }, "expectedCloseDate"],
    ["a stage (it has its own route)", { stageId: UNKNOWN_ID }, ""],
    ["an owner (it has its own route)", { ownerId: UNKNOWN_ID }, ""],
    ["a status", { status: "WON" }, ""],
    ["a close reason", { closeReason: "Because" }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_what, body, path) => {
    const opportunity = await makeOpportunity(ravi, { name: "Before" });

    const response = await asRavi.patch(`${OPPORTUNITIES}/${opportunity.id}`).send(body);

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual([path]);
    expect(await stored(opportunity.id)).toMatchObject({ name: "Before", ownerId: ravi.id });
  });

  it("refuses a contact or a company the caller may not see", async () => {
    const tarasCompany = await makeCompany(tara, "Tara Traders");
    const tarasContact = await makeContact(tara, "Tia", "Other");
    const opportunity = await makeOpportunity(ravi);
    const url = `${OPPORTUNITIES}/${opportunity.id}`;

    expect(detailPaths(await asRavi.patch(url).send({ companyId: tarasCompany.id }))).toEqual([
      "companyId",
    ]);
    expect(detailPaths(await asRavi.patch(url).send({ contactId: tarasContact.id }))).toEqual([
      "contactId",
    ]);
    expect(await stored(opportunity.id)).toMatchObject({ companyId: null, contactId: null });
  });

  it("lets a closed opportunity be edited, and leaves it closed", async () => {
    const opportunity = await makeOpportunity(ravi, {
      stageId: stages.Won.id,
      closedAt: new Date(),
    });

    const response = await asRavi.patch(`${OPPORTUNITIES}/${opportunity.id}`).send({ value: 900 });

    expect(response.status).toBe(200);
    expect(opportunityOf(response)).toMatchObject({ value: 900, status: "WON" });
    expect(opportunityOf(response).closedAt).not.toBeNull();
  });
});

describe("who may change an opportunity (update, move, close, reopen, delete)", () => {
  it("lets an Admin change anyone's", async () => {
    const opportunity = await makeOpportunity(tara);

    for (const [action, write] of writesTo(asAdmin, opportunity.id)) {
      expect((await write()).status, action).toBe(200);
    }
  });

  it("lets a Sales Manager change their own and their team's", async () => {
    const own = await makeOpportunity(meera);
    const teams = await makeOpportunity(ravi);

    for (const [action, write] of [...writesTo(asMeera, own.id), ...writesTo(asMeera, teams.id)]) {
      expect((await write()).status, action).toBe(200);
    }
  });

  it("lets a Sales Rep change their own", async () => {
    const opportunity = await makeOpportunity(ravi);

    for (const [action, write] of writesTo(asRavi, opportunity.id)) {
      expect((await write()).status, action).toBe(200);
    }
  });

  it("answers NOT_FOUND outside the caller's reach, and for one that does not exist", async () => {
    const ofTara = await makeOpportunity(tara, { name: "Untouched" });
    const ofMeera = await makeOpportunity(meera, { name: "Untouched" });

    const refused = [
      ...writesTo(asMeera, ofTara.id),
      ...writesTo(asRavi, ofTara.id),
      ...writesTo(asRavi, ofMeera.id),
      ...writesTo(asAdmin, UNKNOWN_ID),
    ];
    for (const [action, write] of refused) {
      const response = await write();
      expect(response.status, action).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
    for (const opportunity of [ofTara, ofMeera]) {
      expect(await stored(opportunity.id)).toMatchObject({
        notes: null,
        stageId: stages.New.id,
        deletedAt: null,
      });
    }
    expect(await prisma.timelineEntry.count()).toBe(0);
  });

  it("answers FORBIDDEN for every change by a Read-only user, whether or not it exists", async () => {
    const opportunity = await makeOpportunity(ravi);

    for (const [action, write] of [
      ...writesTo(asViewer, opportunity.id),
      ...writesTo(asViewer, UNKNOWN_ID),
    ]) {
      const response = await write();
      expect(response.status, action).toBe(403);
      expect(errorOf(response).code).toBe("FORBIDDEN");
    }
    expect(await stored(opportunity.id)).toMatchObject({ stageId: stages.New.id, deletedAt: null });
  });
});

describe("POST /opportunities/:id/stage", () => {
  it("moves an opportunity to another open stage and writes one STATUS_CHANGE entry", async () => {
    const opportunity = await makeOpportunity(ravi);

    const response = await asMeera
      .post(`${OPPORTUNITIES}/${opportunity.id}/stage`)
      .send({ stageId: stages.Proposal.id });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(opportunityOf(response)).toMatchObject({
      stage: { id: stages.Proposal.id, name: "Proposal", kind: "OPEN" },
      status: "OPEN",
      closeReason: null,
      closedAt: null,
    });
    const entries = await storedEntries(opportunity.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "STATUS_CHANGE",
      authorId: meera.id,
      body: null,
      details: { from: "New", to: "Proposal", fromKind: "OPEN", toKind: "OPEN" },
    });
  });

  it("changes nothing and writes nothing when it is already in that stage", async () => {
    const opportunity = await makeOpportunity(ravi);

    const response = await asRavi
      .post(`${OPPORTUNITIES}/${opportunity.id}/stage`)
      .send({ stageId: stages.New.id });

    expect(response.status).toBe(200);
    expect(await storedEntries(opportunity.id)).toEqual([]);
    expect((await stored(opportunity.id)).updatedAt).toEqual(opportunity.updatedAt);
  });

  it("refuses the Won and the Lost stage: closing has its own route", async () => {
    const opportunity = await makeOpportunity(ravi);

    for (const stage of [stages.Won, stages.Lost]) {
      const response = await asRavi
        .post(`${OPPORTUNITIES}/${opportunity.id}/stage`)
        .send({ stageId: stage.id });
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["stageId"]);
    }
    expect((await stored(opportunity.id)).stageId).toBe(stages.New.id);
    expect(await storedEntries(opportunity.id)).toEqual([]);
  });

  it.each([
    ["no stage", {}],
    ["a stage that does not exist", { stageId: UNKNOWN_ID }],
    ["something that is not an id", { stageId: "Proposal" }],
  ])("answers VALIDATION_FAILED on stageId for %s", async (_what, body) => {
    const opportunity = await makeOpportunity(ravi);

    const response = await asRavi.post(`${OPPORTUNITIES}/${opportunity.id}/stage`).send(body);

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual(["stageId"]);
  });

  it("reopens a closed opportunity that is moved to an open stage", async () => {
    const opportunity = await makeOpportunity(ravi, {
      stageId: stages.Lost.id,
      closeReason: "Price",
      closedAt: new Date(),
    });

    const response = await asRavi
      .post(`${OPPORTUNITIES}/${opportunity.id}/stage`)
      .send({ stageId: stages.Negotiation.id });

    expect(opportunityOf(response)).toMatchObject({
      stage: { name: "Negotiation" },
      status: "OPEN",
      closeReason: null,
      closedAt: null,
    });
    expect((await storedEntries(opportunity.id))[0]?.details).toEqual({
      from: "Lost",
      to: "Negotiation",
      fromKind: "LOST",
      toKind: "OPEN",
    });
  });
});

describe("POST /opportunities/:id/close", () => {
  it("closes an opportunity as lost, with the reason and the time", async () => {
    const opportunity = await makeOpportunity(ravi, { stageId: stages.Proposal.id });
    const before = Date.now();

    const response = await asRavi
      .post(`${OPPORTUNITIES}/${opportunity.id}/close`)
      .send({ outcome: "LOST", reason: "  Chose a competitor  " });
    const closed = opportunityOf(response);

    expect(response.status).toBe(200);
    expect(closed).toMatchObject({
      stage: { id: stages.Lost.id, name: "Lost", kind: "LOST" },
      status: "LOST",
      closeReason: "Chose a competitor",
    });
    expect(new Date(closed.closedAt ?? 0).getTime()).toBeGreaterThanOrEqual(before - 1000);
    const entries = await storedEntries(opportunity.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "STATUS_CHANGE",
      authorId: ravi.id,
      details: {
        from: "Proposal",
        to: "Lost",
        fromKind: "OPEN",
        toKind: "LOST",
        reason: "Chose a competitor",
      },
    });
  });

  it("closes an opportunity as won, with or without a reason", async () => {
    const plain = await makeOpportunity(ravi);
    const explained = await makeOpportunity(ravi);

    const first = await asRavi.post(`${OPPORTUNITIES}/${plain.id}/close`).send({ outcome: "WON" });
    const second = await asRavi
      .post(`${OPPORTUNITIES}/${explained.id}/close`)
      .send({ outcome: "WON", reason: "Best on support" });

    expect(opportunityOf(first)).toMatchObject({
      stage: { id: stages.Won.id, kind: "WON" },
      status: "WON",
      closeReason: null,
    });
    expect(opportunityOf(first).closedAt).not.toBeNull();
    expect(opportunityOf(second)).toMatchObject({ status: "WON", closeReason: "Best on support" });
    expect((await storedEntries(plain.id))[0]?.details).toEqual({
      from: "New",
      to: "Won",
      fromKind: "OPEN",
      toKind: "WON",
      reason: null,
    });
  });

  it.each([
    ["lost without a reason", { outcome: "LOST" }, "reason"],
    ["lost with a blank reason", { outcome: "LOST", reason: "  " }, "reason"],
    ["lost with a null reason", { outcome: "LOST", reason: null }, "reason"],
    ["a reason over 1000 characters", { outcome: "WON", reason: "x".repeat(1001) }, "reason"],
    ["no outcome", { reason: "Price" }, "outcome"],
    ["an outcome that is not won or lost", { outcome: "OPEN", reason: "Price" }, "outcome"],
    ["a closing time", { outcome: "WON", closedAt: "2026-01-01T00:00:00Z" }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_what, body, path) => {
    const opportunity = await makeOpportunity(ravi);

    const response = await asRavi.post(`${OPPORTUNITIES}/${opportunity.id}/close`).send(body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await stored(opportunity.id)).toMatchObject({ stageId: stages.New.id, closedAt: null });
    expect(await storedEntries(opportunity.id)).toEqual([]);
  });

  it("lets a won opportunity be closed as lost instead, as a new close", async () => {
    const opportunity = await makeOpportunity(ravi);
    await asRavi.post(`${OPPORTUNITIES}/${opportunity.id}/close`).send({ outcome: "WON" });

    const response = await asRavi
      .post(`${OPPORTUNITIES}/${opportunity.id}/close`)
      .send({ outcome: "LOST", reason: "Cancelled" });

    expect(opportunityOf(response)).toMatchObject({ status: "LOST", closeReason: "Cancelled" });
    const entries = await storedEntries(opportunity.id);
    expect(entries.map((entry) => entry.details)).toMatchObject([
      { from: "New", to: "Won" },
      { from: "Won", to: "Lost", fromKind: "WON", toKind: "LOST", reason: "Cancelled" },
    ]);
  });

  it("only corrects the reason when it is closed the same way again", async () => {
    const closedAt = new Date("2026-03-01T10:00:00.000Z");
    const opportunity = await makeOpportunity(ravi, {
      stageId: stages.Lost.id,
      closeReason: "Price",
      closedAt,
    });

    const response = await asRavi
      .post(`${OPPORTUNITIES}/${opportunity.id}/close`)
      .send({ outcome: "LOST", reason: "No budget" });

    expect(opportunityOf(response)).toMatchObject({
      status: "LOST",
      closeReason: "No budget",
      closedAt: closedAt.toISOString(),
    });
    expect(await storedEntries(opportunity.id)).toEqual([]);
  });
});

describe("POST /opportunities/:id/reopen", () => {
  function lost(owner: User) {
    return makeOpportunity(owner, {
      stageId: stages.Lost.id,
      closeReason: "Price",
      closedAt: new Date(),
    });
  }

  it("moves a closed opportunity back to the first open stage when no body is sent", async () => {
    const opportunity = await lost(ravi);

    const response = await asRavi.post(`${OPPORTUNITIES}/${opportunity.id}/reopen`);

    expect(response.status).toBe(200);
    expect(opportunityOf(response)).toMatchObject({
      stage: { id: stages.New.id, name: "New", kind: "OPEN" },
      status: "OPEN",
      closeReason: null,
      closedAt: null,
    });
    const entries = await storedEntries(opportunity.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "STATUS_CHANGE",
      authorId: ravi.id,
      details: { from: "Lost", to: "New", fromKind: "LOST", toKind: "OPEN" },
    });
  });

  it("moves it to the open stage that was asked for", async () => {
    const opportunity = await makeOpportunity(ravi, {
      stageId: stages.Won.id,
      closedAt: new Date(),
    });

    const response = await asRavi
      .post(`${OPPORTUNITIES}/${opportunity.id}/reopen`)
      .send({ stageId: stages.Negotiation.id });

    expect(opportunityOf(response)).toMatchObject({
      stage: { name: "Negotiation" },
      status: "OPEN",
      closedAt: null,
    });
  });

  it.each([
    ["the Won stage", () => stages.Won.id],
    ["the Lost stage", () => stages.Lost.id],
    ["a stage that does not exist", () => UNKNOWN_ID],
  ])("answers VALIDATION_FAILED on stageId for %s", async (_what, stageId) => {
    const opportunity = await lost(ravi);

    const response = await asRavi
      .post(`${OPPORTUNITIES}/${opportunity.id}/reopen`)
      .send({ stageId: stageId() });

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual(["stageId"]);
    expect(await stored(opportunity.id)).toMatchObject({
      stageId: stages.Lost.id,
      closeReason: "Price",
    });
  });

  it("refuses an opportunity that is open already", async () => {
    const opportunity = await makeOpportunity(ravi, { stageId: stages.Proposal.id });

    const response = await asRavi.post(`${OPPORTUNITIES}/${opportunity.id}/reopen`).send({});

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(errorOf(response).details).toBeNull();
    expect((await stored(opportunity.id)).stageId).toBe(stages.Proposal.id);
    expect(await storedEntries(opportunity.id)).toEqual([]);
  });
});

describe("assign", () => {
  it("lets an Admin give any opportunity to anyone who can own one, with an ASSIGNMENT entry", async () => {
    const opportunity = await makeOpportunity(ravi);

    const response = await asAdmin
      .post(`${OPPORTUNITIES}/${opportunity.id}/assign`)
      .send({ ownerId: tara.id });

    expect(response.status).toBe(200);
    expect(opportunityOf(response).owner).toEqual({ id: tara.id, name: "Tara Rep" });
    const entries = await storedEntries(opportunity.id);
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

  it("lets a Sales Manager move one within the team, and nowhere else", async () => {
    const opportunity = await makeOpportunity(meera);
    const url = `${OPPORTUNITIES}/${opportunity.id}/assign`;

    const toRavi = await asMeera.post(url).send({ ownerId: ravi.id });
    const toTara = await asMeera.post(url).send({ ownerId: tara.id });

    expect(opportunityOf(toRavi).owner.id).toBe(ravi.id);
    expect(toTara.status).toBe(400);
    expect(detailPaths(toTara)).toEqual(["ownerId"]);
    expect((await stored(opportunity.id)).ownerId).toBe(ravi.id);
  });

  it("writes nothing when it is assigned to the owner it already has", async () => {
    const opportunity = await makeOpportunity(ravi);

    const response = await asMeera
      .post(`${OPPORTUNITIES}/${opportunity.id}/assign`)
      .send({ ownerId: ravi.id });

    expect(response.status).toBe(200);
    expect(await storedEntries(opportunity.id)).toEqual([]);
  });

  it("answers NOT_FOUND when a Sales Manager assigns one outside their team, or one that does not exist", async () => {
    const opportunity = await makeOpportunity(tara);

    const hidden = await asMeera
      .post(`${OPPORTUNITIES}/${opportunity.id}/assign`)
      .send({ ownerId: meera.id });
    const missing = await asAdmin
      .post(`${OPPORTUNITIES}/${UNKNOWN_ID}/assign`)
      .send({ ownerId: meera.id });

    expect([hidden.status, missing.status]).toEqual([404, 404]);
    expect((await stored(opportunity.id)).ownerId).toBe(tara.id);
  });

  it("answers FORBIDDEN for a Sales Rep, even on their own, and for a Read-only user", async () => {
    const opportunity = await makeOpportunity(ravi);

    for (const agent of [asRavi, asViewer]) {
      const response = await agent
        .post(`${OPPORTUNITIES}/${opportunity.id}/assign`)
        .send({ ownerId: meera.id });
      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe("FORBIDDEN");
    }
    expect((await stored(opportunity.id)).ownerId).toBe(ravi.id);
  });

  it("refuses a new owner who is Read-only, deactivated or unknown", async () => {
    const opportunity = await makeOpportunity(ravi);

    for (const ownerId of [viewer.id, deactivated.id, UNKNOWN_ID]) {
      const response = await asAdmin
        .post(`${OPPORTUNITIES}/${opportunity.id}/assign`)
        .send({ ownerId });
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["ownerId"]);
    }
  });
});

describe("delete", () => {
  it("answers 200 with data null and keeps the row, marked as deleted", async () => {
    const opportunity = await makeOpportunity(ravi);

    const response = await asRavi.delete(`${OPPORTUNITIES}/${opportunity.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect((await stored(opportunity.id)).deletedAt).not.toBeNull();
    expect(await storedEntries(opportunity.id)).toEqual([]);
  });

  it("never shows a deleted opportunity again: not read, listed, on the board or changed", async () => {
    const opportunity = await makeOpportunity(ravi, { value: 500 });
    await asRavi.delete(`${OPPORTUNITIES}/${opportunity.id}`);

    for (const agent of [asRavi, asAdmin, asViewer]) {
      expect((await agent.get(`${OPPORTUNITIES}/${opportunity.id}`)).status).toBe(404);
      expect(opportunitiesOf(await agent.get(OPPORTUNITIES))).toEqual([]);
      expect(boardOf(await agent.get(BOARD))[0]).toMatchObject({ count: 0, totalValue: 0 });
    }
    for (const [action, write] of writesTo(asAdmin, opportunity.id)) {
      expect((await write()).status, action).toBe(404);
    }
  });
});

describe("when the timeline entry cannot be written", () => {
  function failEntries() {
    vi.spyOn(timeline, "addTimelineEntry").mockRejectedValue(new Error("entry failed"));
  }

  it("does not create the opportunity", async () => {
    failEntries();

    const response = await asRavi.post(OPPORTUNITIES).send({ name: "Deal" });

    expect(response.status).toBe(500);
    expect(errorOf(response).code).toBe("INTERNAL_ERROR");
    expect(await prisma.opportunity.count()).toBe(0);
  });

  it("does not move, close, reopen or reassign it", async () => {
    const open = await makeOpportunity(meera);
    const lost = await makeOpportunity(meera, {
      stageId: stages.Lost.id,
      closeReason: "Price",
      closedAt: new Date(),
    });
    failEntries();

    const responses = [
      await asMeera.post(`${OPPORTUNITIES}/${open.id}/stage`).send({ stageId: stages.Proposal.id }),
      await asMeera.post(`${OPPORTUNITIES}/${open.id}/close`).send({ outcome: "WON" }),
      await asMeera.post(`${OPPORTUNITIES}/${open.id}/assign`).send({ ownerId: ravi.id }),
      await asMeera.post(`${OPPORTUNITIES}/${lost.id}/reopen`),
    ];

    expect(responses.map((response) => response.status)).toEqual([500, 500, 500, 500]);
    expect(await stored(open.id)).toMatchObject({
      stageId: stages.New.id,
      closedAt: null,
      ownerId: meera.id,
    });
    expect(await stored(lost.id)).toMatchObject({ stageId: stages.Lost.id, closeReason: "Price" });
  });
});

describe("lastContactAt on an opportunity", () => {
  it("moves forward to a logged conversation, never back, and leaves updatedAt alone", async () => {
    const opportunity = await makeOpportunity(ravi);
    const log = (occurredAt: string) =>
      asRavi
        .post(`${OPPORTUNITIES}/${opportunity.id}/conversations`)
        .send({ type: "CALL", occurredAt, summary: "Talked about pricing" });

    await log("2026-03-07T09:00:00.000Z");
    await log("2026-03-05T09:00:00.000Z");
    await asRavi.post(`${OPPORTUNITIES}/${opportunity.id}/notes`).send({ body: "A note" });

    const response = await asRavi.get(`${OPPORTUNITIES}/${opportunity.id}`);
    expect(opportunityOf(response).lastContactAt).toBe("2026-03-07T09:00:00.000Z");
    expect((await stored(opportunity.id)).updatedAt).toEqual(opportunity.updatedAt);
  });
});

describe("list: search, filters, sorting and paging", () => {
  let acme: Company;
  let tarasCompany: Company;
  let jane: Contact;

  // Five opportunities of Ravi's and one of Tara's, across the pipeline.
  async function seed() {
    acme = await makeCompany(ravi, "Acme Holdings");
    tarasCompany = await makeCompany(tara, "Zenith Traders");
    jane = await makeContact(ravi, "Jane", "Doe");
    await makeOpportunity(ravi, {
      name: "Alpha rollout",
      value: 300,
      expectedCloseDate: new Date("2026-12-01"),
      companyId: acme.id,
    });
    await makeOpportunity(ravi, {
      name: "Bravo renewal",
      value: 100,
      stageId: stages.Proposal.id,
      contactId: jane.id,
    });
    await makeOpportunity(ravi, {
      name: "Charlie pilot",
      value: 200,
      expectedCloseDate: new Date("2026-11-01"),
      stageId: stages.Won.id,
      closedAt: new Date(),
    });
    await makeOpportunity(meera, {
      name: "Delta upgrade",
      value: 50,
      stageId: stages.Lost.id,
      closeReason: "Price",
      closedAt: new Date(),
      // Ravi cannot see this company, so it never matches for him.
      companyId: tarasCompany.id,
    });
    await makeOpportunity(tara, {
      name: "Echo expansion",
      value: 400,
      stageId: stages.Qualified.id,
      companyId: tarasCompany.id,
    });
    await makeOpportunity(ravi, { name: "Deleted deal", deletedAt: new Date() });
  }

  function list(query: Record<string, string | number>, agent: Agent = asAdmin) {
    return agent.get(OPPORTUNITIES).query(query);
  }

  it("orders by newest first when nothing is asked for, and leaves out deleted ones", async () => {
    await seed();

    expect(namesOf(await list({}))).toEqual([
      "Echo expansion",
      "Delta upgrade",
      "Charlie pilot",
      "Bravo renewal",
      "Alpha rollout",
    ]);
  });

  it.each([
    ["the opportunity's name", "bravo", ["Bravo renewal"]],
    ["the company's name", "acme", ["Alpha rollout"]],
    ["the contact's name", "jane doe", ["Bravo renewal"]],
    ["every word, in any of them", "alpha holdings", ["Alpha rollout"]],
    ["nothing", "nowhere", []],
  ])("searches %s", async (_what, search, expected) => {
    await seed();

    expect(namesOf(await list({ search }))).toEqual(expected);
  });

  it("does not match a company or a contact the caller cannot see", async () => {
    await seed();

    expect(namesOf(await list({ search: "zenith" }))).toEqual(["Echo expansion", "Delta upgrade"]);
    expect(namesOf(await list({ search: "zenith" }, asMeera))).toEqual([]);
  });

  it("treats % and _ in a search as plain characters", async () => {
    await seed();
    await makeOpportunity(ravi, { name: "100% sure" });

    expect(namesOf(await list({ search: "%" }))).toEqual(["100% sure"]);
    expect(namesOf(await list({ search: "_" }))).toEqual([]);
  });

  it("filters by stage, status, owner, company and contact", async () => {
    await seed();

    expect(namesOf(await list({ stageId: stages.Proposal.id }))).toEqual(["Bravo renewal"]);
    expect(namesOf(await list({ status: "OPEN" }))).toEqual([
      "Echo expansion",
      "Bravo renewal",
      "Alpha rollout",
    ]);
    expect(namesOf(await list({ status: "WON" }))).toEqual(["Charlie pilot"]);
    expect(namesOf(await list({ status: "LOST" }))).toEqual(["Delta upgrade"]);
    expect(namesOf(await list({ ownerId: meera.id }))).toEqual(["Delta upgrade"]);
    expect(namesOf(await list({ companyId: tarasCompany.id }))).toEqual([
      "Echo expansion",
      "Delta upgrade",
    ]);
    expect(namesOf(await list({ contactId: jane.id }))).toEqual(["Bravo renewal"]);
    expect(namesOf(await list({ status: "OPEN", ownerId: ravi.id, search: "a" }))).toEqual([
      "Bravo renewal",
      "Alpha rollout",
    ]);
  });

  it("never lets a filter widen what the caller may see", async () => {
    await seed();

    expect(namesOf(await list({ ownerId: tara.id }, asRavi))).toEqual([]);
    expect(namesOf(await list({ ownerId: tara.id }, asMeera))).toEqual([]);
    // Meera owns an opportunity in a company she cannot see: the filter finds nothing.
    expect(namesOf(await list({ companyId: tarasCompany.id }, asMeera))).toEqual([]);
    expect(namesOf(await list({ status: "LOST" }, asRavi))).toEqual([]);
  });

  it.each([
    ["name", "asc", ["Alpha rollout", "Bravo renewal", "Charlie pilot", "Delta upgrade", "Echo"]],
    ["value", "desc", ["Echo", "Alpha rollout", "Charlie pilot", "Bravo renewal", "Delta upgrade"]],
    [
      "createdAt",
      "asc",
      ["Alpha rollout", "Bravo renewal", "Charlie pilot", "Delta upgrade", "Echo"],
    ],
    // New, Qualified, Proposal, then Won, then Lost.
    ["stage", "asc", ["Alpha rollout", "Echo", "Bravo renewal", "Charlie pilot", "Delta upgrade"]],
    ["stage", "desc", ["Delta upgrade", "Charlie pilot", "Bravo renewal", "Echo", "Alpha rollout"]],
  ])("sorts by %s %s", async (sort, order, expected) => {
    await seed();

    const names = namesOf(await list({ sort, order }));

    expect(names.map((name) => (name === "Echo expansion" ? "Echo" : name))).toEqual(expected);
  });

  it("sorts by expectedCloseDate, with opportunities without a date last in both directions", async () => {
    await seed();

    const ascending = namesOf(await list({ sort: "expectedCloseDate", order: "asc" }));
    const descending = namesOf(await list({ sort: "expectedCloseDate", order: "desc" }));

    expect(ascending.slice(0, 2)).toEqual(["Charlie pilot", "Alpha rollout"]);
    expect(descending.slice(0, 2)).toEqual(["Alpha rollout", "Charlie pilot"]);
    expect(ascending.slice(2)).toEqual(["Bravo renewal", "Delta upgrade", "Echo expansion"]);
    expect(descending.slice(2)).toEqual(["Echo expansion", "Delta upgrade", "Bravo renewal"]);
  });

  it("pages through the list and reports the total of what the caller may see", async () => {
    await seed();

    const second = await list({ pageSize: 2, page: 2, sort: "name", order: "asc" });
    const pastTheEnd = await list({ pageSize: 2, page: 9 });
    const forRavi = await list({ pageSize: 1 }, asRavi);

    expect(namesOf(second)).toEqual(["Charlie pilot", "Delta upgrade"]);
    expect(metaOf(second)).toEqual({ page: 2, pageSize: 2, total: 5 });
    expect(namesOf(pastTheEnd)).toEqual([]);
    expect(metaOf(forRavi)).toEqual({ page: 1, pageSize: 1, total: 3 });
  });

  it.each([
    ["page", { page: 0 }],
    ["pageSize", { pageSize: 101 }],
    ["sort", { sort: "closeReason" }],
    ["order", { order: "up" }],
    ["status", { status: "CLOSED" }],
    ["stageId", { stageId: "Proposal" }],
    ["ownerId", { ownerId: "me" }],
    ["companyId", { companyId: "acme" }],
    ["contactId", { contactId: "jane" }],
    ["search", { search: "x".repeat(101) }],
  ])("answers VALIDATION_FAILED for a bad %s", async (path, query) => {
    const response = await list(query);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
  });
});

describe("GET /opportunities/board", () => {
  it("answers one column for every stage in pipeline order, empty ones included", async () => {
    const response = await asRavi.get(BOARD);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(boardOf(response)).toEqual(
      (["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"] as const).map(
        (name, position) => ({
          stage: { id: stages[name].id, name, position, kind: stages[name].kind },
          count: 0,
          totalValue: 0,
          opportunities: [],
        }),
      ),
    );
  });

  it("puts each opportunity in its stage's column, with the count and the total value", async () => {
    const first = await makeOpportunity(ravi, { name: "First", value: 100.25 });
    const second = await makeOpportunity(ravi, { name: "Second", value: 200.5 });
    await makeOpportunity(ravi, { name: "Won", value: 999, stageId: stages.Won.id });
    await makeOpportunity(ravi, { name: "Deleted", value: 5000, deletedAt: new Date() });

    const board = boardOf(await asRavi.get(BOARD));

    expect(board.map((column) => [column.stage.name, column.count, column.totalValue])).toEqual([
      ["New", 2, 300.75],
      ["Qualified", 0, 0],
      ["Proposal", 0, 0],
      ["Negotiation", 0, 0],
      ["Won", 1, 999],
      ["Lost", 0, 0],
    ]);
    // The card changed most recently is on top.
    expect(board[0]?.opportunities.map((card) => card.id)).toEqual([second.id, first.id]);
    expect(board[0]?.opportunities[0]).toMatchObject({
      name: "Second",
      value: 200.5,
      stage: { id: stages.New.id, name: "New", kind: "OPEN" },
      status: "OPEN",
      owner: { id: ravi.id, name: "Ravi Rep" },
    });
  });

  it("moves a card between columns when its stage changes", async () => {
    const opportunity = await makeOpportunity(ravi, { value: 100 });
    await makeOpportunity(ravi, { value: 50 });

    await asRavi
      .post(`${OPPORTUNITIES}/${opportunity.id}/stage`)
      .send({ stageId: stages.Proposal.id });

    const board = boardOf(await asRavi.get(BOARD));
    expect(board.map((column) => column.count)).toEqual([1, 0, 1, 0, 0, 0]);
    expect(board[2]?.opportunities[0]?.id).toBe(opportunity.id);
    expect(board[2]?.totalValue).toBe(100);
  });

  it("shows each role only what it may see, in the cards and in the totals", async () => {
    await makeOpportunity(ravi, { value: 10 });
    await makeOpportunity(meera, { value: 20 });
    await makeOpportunity(tara, { value: 40 });

    const firstColumn = async (agent: Agent) => {
      const column = boardOf(await agent.get(BOARD))[0];
      return [column?.count, column?.totalValue, column?.opportunities.length];
    };

    expect(await firstColumn(asAdmin)).toEqual([3, 70, 3]);
    expect(await firstColumn(asViewer)).toEqual([3, 70, 3]);
    expect(await firstColumn(asMeera)).toEqual([2, 30, 2]);
    expect(await firstColumn(asRavi)).toEqual([1, 10, 1]);
  });

  it("takes the same search and owner filter as the list", async () => {
    const acme = await makeCompany(ravi, "Acme Holdings");
    await makeOpportunity(ravi, { name: "Alpha", value: 10, companyId: acme.id });
    await makeOpportunity(ravi, { name: "Bravo", value: 20 });
    await makeOpportunity(tara, { name: "Charlie", value: 40, stageId: stages.Won.id });

    const bySearch = boardOf(await asAdmin.get(BOARD).query({ search: "acme" }));
    const byOwner = boardOf(await asAdmin.get(BOARD).query({ ownerId: tara.id }));
    const widened = boardOf(await asRavi.get(BOARD).query({ ownerId: tara.id }));

    expect(bySearch.map((column) => column.count)).toEqual([1, 0, 0, 0, 0, 0]);
    expect(bySearch[0]).toMatchObject({ totalValue: 10, opportunities: [{ name: "Alpha" }] });
    expect(byOwner.map((column) => column.count)).toEqual([0, 0, 0, 0, 1, 0]);
    expect(widened.map((column) => column.count)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("carries at most 50 cards in a column, with the true count and total", async () => {
    await prisma.opportunity.createMany({
      data: Array.from({ length: 53 }, (_, index) => ({
        name: `Deal ${String(index)}`,
        value: 10,
        stageId: stages.Qualified.id,
        ownerId: ravi.id,
        createdById: ravi.id,
      })),
    });

    const column = boardOf(await asRavi.get(BOARD))[1];

    expect(column?.opportunities).toHaveLength(50);
    expect(column).toMatchObject({ count: 53, totalValue: 530 });
  });

  it("answers VALIDATION_FAILED for a bad owner", async () => {
    const response = await asAdmin.get(BOARD).query({ ownerId: "me" });

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual(["ownerId"]);
  });
});
