import type request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  resetPipelineStages,
  resetRecords,
  signInAs,
  utcNoon,
  type ValidationDetail,
  zoneOnAnotherDay,
} from "../../../test/helpers";
import type { PipelineStage, Prisma, User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

interface MyDashboard {
  openLeads: { total: number; byStatus: { status: string; count: number }[] };
  pipeline: {
    totalValue: number;
    stages: {
      stage: { id: string; name: string; kind: string };
      count: number;
      totalValue: number;
    }[];
  };
  tasks: { overdue: number; today: number; upcoming: number };
  tasksDue: { id: string; title: string; assignee: { id: string } }[];
  followUps: { type: string; id: string; name: string; at: string; note: string | null }[];
  wonThisMonth: { count: number; totalValue: number };
}

interface Figures {
  leadsCreated: number;
  leadsHandled: number;
  conversationsLogged: number;
  opportunitiesWon: number;
  opportunitiesLost: number;
  wonValue: number;
  openPipelineValue: number;
  overdueTasks: number;
}

interface TeamDashboard {
  range: { from: string; to: string };
  totals: Figures;
  reps: (Figures & { user: { id: string; name: string; role: string; active: boolean } })[];
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;
type StageName = "New" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";

const ME = "/api/v1/dashboard/me";
const TEAM = "/api/v1/dashboard/team";
const MARCH = { from: "2026-03-01", to: "2026-03-31" };

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
let asTara: Agent;
let asViewer: Agent;

let stages: Record<StageName, PipelineStage>;

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

function mine(response: request.Response): MyDashboard {
  return (response.body as Envelope<MyDashboard>).data;
}

function team(response: request.Response): TeamDashboard {
  return (response.body as Envelope<TeamDashboard>).data;
}

function repOf(response: request.Response, user: User) {
  const rep = team(response).reps.find((row) => row.user.id === user.id);
  if (!rep) {
    throw new Error(`${user.name} is not on the team dashboard`);
  }
  return rep;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function makeLead(owner: User, fields: Partial<Prisma.LeadUncheckedCreateInput> = {}) {
  return prisma.lead.create({
    data: {
      firstName: "Jane",
      lastName: "Doe",
      source: "WEBSITE",
      ownerId: owner.id,
      createdById: owner.id,
      ...fields,
    },
  });
}

function makeOpportunity(
  owner: User,
  stage: StageName,
  value: number,
  fields: Partial<Prisma.OpportunityUncheckedCreateInput> = {},
) {
  return prisma.opportunity.create({
    data: {
      name: "Deal",
      value,
      stageId: stages[stage].id,
      ownerId: owner.id,
      createdById: owner.id,
      ...fields,
    },
  });
}

function makeTask(assignee: User, fields: Partial<Prisma.TaskUncheckedCreateInput> = {}) {
  return prisma.task.create({
    data: { title: "Task", assigneeId: assignee.id, createdById: assignee.id, ...fields },
  });
}

// An entry on a lead's timeline, written by `author` at `occurredAt`.
function makeEntry(
  author: User,
  leadId: string,
  occurredAt: string,
  kind: "CONVERSATION" | "NOTE" | "STATUS_CHANGE" = "CONVERSATION",
) {
  return prisma.timelineEntry.create({
    data: { kind, authorId: author.id, leadId, occurredAt: new Date(occurredAt) },
  });
}

const NO_FIGURES: Figures = {
  leadsCreated: 0,
  leadsHandled: 0,
  conversationsLogged: 0,
  opportunitiesWon: 0,
  opportunitiesLost: 0,
  wonValue: 0,
  openPipelineValue: 0,
  overdueTasks: 0,
};

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
  asTara = await signInAs(app, tara);
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

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("GET /dashboard/me", () => {
  const empty: MyDashboard = {
    openLeads: {
      total: 0,
      byStatus: [
        { status: "NEW", count: 0 },
        { status: "CONTACTED", count: 0 },
        { status: "QUALIFIED", count: 0 },
      ],
    },
    pipeline: { totalValue: 0, stages: [] },
    tasks: { overdue: 0, today: 0, upcoming: 0 },
    tasksDue: [],
    followUps: [],
    wonThisMonth: { count: 0, totalValue: 0 },
  };

  function emptyPipeline() {
    return (["New", "Qualified", "Proposal", "Negotiation"] as const).map((name) => ({
      stage: { id: stages[name].id, name, kind: "OPEN" },
      count: 0,
      totalValue: 0,
    }));
  }

  // Everything one rep can have, with something beside each figure that must not count.
  async function raviesWork() {
    await makeLead(ravi);
    await makeLead(ravi);
    await makeLead(ravi, { status: "CONTACTED" });
    await makeLead(ravi, { status: "CONVERTED" });
    await makeLead(ravi, { status: "LOST" });
    await makeLead(ravi, { deletedAt: new Date() });

    await makeOpportunity(ravi, "New", 1000);
    await makeOpportunity(ravi, "New", 250.5);
    await makeOpportunity(ravi, "Proposal", 4000);
    await makeOpportunity(ravi, "New", 99, { deletedAt: new Date() });
    await makeOpportunity(ravi, "Lost", 700, { closedAt: new Date() });
    await makeOpportunity(ravi, "Won", 9000, { closedAt: new Date() });
    await makeOpportunity(ravi, "Won", 5000, { closedAt: daysAgo(40) });

    await makeTask(ravi, { title: "Yesterday", dueAt: utcNoon(-1) });
    await makeTask(ravi, { title: "Three days ago", dueAt: utcNoon(-3) });
    await makeTask(ravi, { title: "Today", dueAt: utcNoon() });
    await makeTask(ravi, { title: "Tomorrow", dueAt: utcNoon(1) });
    await makeTask(ravi, { title: "Some day" });
    await makeTask(ravi, { title: "Done", dueAt: utcNoon(-1), status: "DONE" });
    await makeTask(ravi, { title: "Deleted", dueAt: utcNoon(-1), deletedAt: new Date() });
  }

  it("answers the caller's open leads, pipeline, tasks and won deals", async () => {
    await raviesWork();
    // Someone else's work, which is not Ravi's to see here.
    await makeLead(tara);
    await makeOpportunity(tara, "New", 1);
    await makeOpportunity(tara, "Won", 1, { closedAt: new Date() });
    await makeTask(tara, { dueAt: utcNoon(-1) });
    await makeTask(tara, { dueAt: utcNoon(), createdById: ravi.id });

    const response = await asRavi.get(ME);
    const data = mine(response);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(data.openLeads).toEqual({
      total: 3,
      byStatus: [
        { status: "NEW", count: 2 },
        { status: "CONTACTED", count: 1 },
        { status: "QUALIFIED", count: 0 },
      ],
    });
    expect(data.pipeline).toEqual({
      totalValue: 5250.5,
      stages: [
        { stage: { id: stages.New.id, name: "New", kind: "OPEN" }, count: 2, totalValue: 1250.5 },
        {
          stage: { id: stages.Qualified.id, name: "Qualified", kind: "OPEN" },
          count: 0,
          totalValue: 0,
        },
        {
          stage: { id: stages.Proposal.id, name: "Proposal", kind: "OPEN" },
          count: 1,
          totalValue: 4000,
        },
        {
          stage: { id: stages.Negotiation.id, name: "Negotiation", kind: "OPEN" },
          count: 0,
          totalValue: 0,
        },
      ],
    });
    expect(data.tasks).toEqual({ overdue: 2, today: 1, upcoming: 1 });
    expect(data.tasksDue.map((task) => task.title)).toEqual([
      "Three days ago",
      "Yesterday",
      "Today",
    ]);
    expect(data.tasksDue.every((task) => task.assignee.id === ravi.id)).toBe(true);
    expect(data.wonThisMonth).toEqual({ count: 1, totalValue: 9000 });
  });

  it("lists the follow-ups that are due today or overdue, the longest overdue first", async () => {
    const overdueLead = await makeLead(ravi, {
      firstName: "Late",
      lastName: "Lead",
      followUpAt: utcNoon(-2),
      followUpNote: "Send the price list",
    });
    const overdueDeal = await makeOpportunity(ravi, "New", 1, {
      name: "Late deal",
      followUpAt: utcNoon(-1),
      // It has fired; it stays on the list until it is cleared or moved.
      followUpNotifiedAt: utcNoon(-1),
    });
    const todayLead = await makeLead(ravi, {
      firstName: "Today",
      lastName: "Lead",
      followUpAt: utcNoon(),
    });
    // None of these: not due yet, not open any more, deleted, or someone else's.
    await makeLead(ravi, { followUpAt: utcNoon(1) });
    await makeLead(ravi, { status: "CONVERTED", followUpAt: utcNoon(-1) });
    await makeLead(ravi, { status: "LOST", followUpAt: utcNoon(-1) });
    await makeLead(ravi, { deletedAt: new Date(), followUpAt: utcNoon(-1) });
    await makeOpportunity(ravi, "Won", 1, { followUpAt: utcNoon(-1) });
    await makeLead(tara, { followUpAt: utcNoon(-1) });
    await makeLead(ravi);

    const response = await asRavi.get(ME);

    expect(mine(response).followUps).toEqual([
      {
        type: "LEAD",
        id: overdueLead.id,
        name: "Late Lead",
        at: utcNoon(-2).toISOString(),
        note: "Send the price list",
      },
      {
        type: "OPPORTUNITY",
        id: overdueDeal.id,
        name: "Late deal",
        at: utcNoon(-1).toISOString(),
        note: null,
      },
      {
        type: "LEAD",
        id: todayLead.id,
        name: "Today Lead",
        at: utcNoon().toISOString(),
        note: null,
      },
    ]);
  });

  it("lists at most 10 tasks and 10 follow-ups, and still counts them all", async () => {
    for (let index = 0; index < 12; index += 1) {
      await makeTask(ravi, { title: `T${String(index)}`, dueAt: utcNoon(-20 + index) });
    }
    for (let index = 0; index < 6; index += 1) {
      await makeLead(ravi, {
        firstName: `L${String(index)}`,
        followUpAt: utcNoon(-20 + index * 2),
      });
      await makeOpportunity(ravi, "New", 1, {
        name: `O${String(index)}`,
        followUpAt: utcNoon(-19 + index * 2),
      });
    }

    const data = mine(await asRavi.get(ME));

    expect(data.tasks.overdue).toBe(12);
    expect(data.tasksDue.map((task) => task.title)).toEqual([
      "T0",
      "T1",
      "T2",
      "T3",
      "T4",
      "T5",
      "T6",
      "T7",
      "T8",
      "T9",
    ]);
    expect(data.followUps.map((item) => item.name)).toEqual([
      "L0 Doe",
      "O0",
      "L1 Doe",
      "O1",
      "L2 Doe",
      "O2",
      "L3 Doe",
      "O3",
      "L4 Doe",
      "O4",
    ]);
  });

  it("never shows a rep another rep's numbers", async () => {
    await raviesWork();

    const response = await asTara.get(ME);

    expect(response.status).toBe(200);
    expect(mine(response)).toEqual({
      ...empty,
      pipeline: { totalValue: 0, stages: emptyPipeline() },
    });
  });

  it.each([
    ["a Sales Manager (their team's work is not their own)", () => asMeera],
    ["an Admin", () => asAdmin],
    ["a Read-only user", () => asViewer],
  ])("is about the caller's own work for %s", async (_name, agent) => {
    await raviesWork();

    const response = await agent().get(ME);

    expect(response.status).toBe(200);
    expect(mine(response)).toEqual({
      ...empty,
      pipeline: { totalValue: 0, stages: emptyPipeline() },
    });
  });

  it("shows a Sales Manager what they own themselves", async () => {
    await raviesWork();
    await makeLead(meera, { status: "QUALIFIED" });
    await makeOpportunity(meera, "Negotiation", 12_000);
    await makeTask(meera, { dueAt: utcNoon() });

    const data = mine(await asMeera.get(ME));

    expect(data.openLeads.total).toBe(1);
    expect(data.pipeline.totalValue).toBe(12_000);
    expect(data.tasks).toEqual({ overdue: 0, today: 1, upcoming: 0 });
  });

  it("counts the days in the viewer's time zone", async () => {
    const { timeZone, moment, inUtc, inZone } = zoneOnAnotherDay();
    await makeTask(ravi, { dueAt: moment });

    const utc = mine(await asRavi.get(ME));
    const zone = mine(await asRavi.get(ME).query({ tz: timeZone }));

    expect(utc.tasks).toMatchObject({ [inUtc]: 1, [inZone]: 0 });
    expect(zone.tasks).toMatchObject({ [inUtc]: 0, [inZone]: 1 });
    expect(zone.tasksDue).toHaveLength(1);
  });

  it("answers VALIDATION_FAILED for a time zone that does not exist", async () => {
    const response = await asRavi.get(ME).query({ tz: "Europe/Atlantis" });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(["tz"]);
  });
});

describe("GET /dashboard/team", () => {
  it("answers FORBIDDEN for a Sales Rep", async () => {
    const response = await asRavi.get(TEAM);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
  });

  it("shows a Read-only user exactly what an Admin sees", async () => {
    await makeOpportunity(ravi, "New", 100);
    await makeOpportunity(tara, "New", 5000);

    const forViewer = await asViewer.get(TEAM).query(MARCH);
    const forAdmin = await asAdmin.get(TEAM).query(MARCH);

    expect(forViewer.status).toBe(200);
    expect(team(forViewer)).toEqual(team(forAdmin));
    expect(team(forViewer).reps.map((rep) => rep.user.name)).toEqual([
      "Asha Admin",
      "Meera Manager",
      "Omar Manager",
      "Ravi Rep",
      "Tara Rep",
      "Uma Rep",
    ]);
    expect(team(forViewer).totals.openPipelineValue).toBe(5100);
  });

  it("shows an Admin everyone who is not Read-only, by name, with zeros where nothing happened", async () => {
    const response = await asAdmin.get(TEAM).query(MARCH);
    const data = team(response);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(data.range).toEqual(MARCH);
    expect(data.totals).toEqual(NO_FIGURES);
    expect(data.reps.map((rep) => rep.user)).toEqual([
      { id: admin.id, name: "Asha Admin", role: "ADMIN", active: true },
      { id: meera.id, name: "Meera Manager", role: "SALES_MANAGER", active: true },
      { id: omar.id, name: "Omar Manager", role: "SALES_MANAGER", active: true },
      { id: ravi.id, name: "Ravi Rep", role: "SALES_REP", active: true },
      { id: tara.id, name: "Tara Rep", role: "SALES_REP", active: true },
      { id: uma.id, name: "Uma Rep", role: "SALES_REP", active: true },
    ]);
    expect(data.reps[3]).toEqual({ user: data.reps[3]?.user, ...NO_FIGURES });
  });

  it("shows a Sales Manager themselves and their team, and nobody else's numbers", async () => {
    await makeOpportunity(ravi, "New", 100);
    await makeOpportunity(tara, "New", 5000);
    await makeOpportunity(uma, "New", 7000);

    const data = team(await asMeera.get(TEAM));

    expect(data.reps.map((rep) => rep.user.name)).toEqual(["Meera Manager", "Ravi Rep"]);
    expect(data.totals.openPipelineValue).toBe(100);
  });

  it("counts each figure for the person it belongs to", async () => {
    // Leads created: by who made them, in the range, not deleted.
    const leadA = await makeLead(ravi, { createdAt: new Date("2026-03-02T10:00:00Z") });
    const leadB = await makeLead(ravi, { createdAt: new Date("2026-03-20T10:00:00Z") });
    const leadC = await makeLead(ravi, { createdAt: new Date("2026-02-10T10:00:00Z") });
    const leadD = await makeLead(ravi, { createdAt: new Date("2026-04-01T10:00:00Z") });
    const deletedLead = await makeLead(ravi, {
      createdAt: new Date("2026-03-05T10:00:00Z"),
      deletedAt: new Date("2026-03-06T10:00:00Z"),
    });
    // Made by Meera for Ravi: Meera created it, Ravi owns it.
    const leadE = await makeLead(ravi, {
      createdById: meera.id,
      createdAt: new Date("2026-03-07T10:00:00Z"),
    });
    const tarasLead = await makeLead(tara, { createdAt: new Date("2026-01-05T10:00:00Z") });

    // Leads handled: Ravi's leads with a conversation or a status change in the range, by
    // anyone, each lead once. Conversations logged: by who wrote them.
    await makeEntry(meera, leadA.id, "2026-03-03T09:00:00Z");
    await makeEntry(ravi, leadA.id, "2026-03-04T09:00:00Z");
    await makeEntry(ravi, leadB.id, "2026-03-21T09:00:00Z", "STATUS_CHANGE");
    await makeEntry(ravi, leadC.id, "2026-03-10T09:00:00Z", "NOTE");
    await makeEntry(ravi, leadD.id, "2026-04-02T09:00:00Z");
    await makeEntry(ravi, leadE.id, "2026-02-27T09:00:00Z");
    await makeEntry(ravi, deletedLead.id, "2026-03-05T12:00:00Z");
    await makeEntry(ravi, tarasLead.id, "2026-03-15T09:00:00Z");

    // Won and lost: by owner, closed in the range.
    await makeOpportunity(ravi, "Won", 1000, { closedAt: new Date("2026-03-10T10:00:00Z") });
    await makeOpportunity(ravi, "Won", 2500.5, { closedAt: new Date("2026-03-31T23:59:59Z") });
    await makeOpportunity(ravi, "Won", 800, { closedAt: new Date("2026-02-28T23:59:59Z") });
    await makeOpportunity(ravi, "Won", 900, { closedAt: new Date("2026-04-01T00:00:00Z") });
    await makeOpportunity(ravi, "Won", 50, {
      closedAt: new Date("2026-03-11T10:00:00Z"),
      deletedAt: new Date(),
    });
    await makeOpportunity(ravi, "Lost", 400, { closedAt: new Date("2026-03-12T10:00:00Z") });
    // Open pipeline and overdue tasks: as of now, whatever the range.
    await makeOpportunity(ravi, "New", 300);
    await makeOpportunity(ravi, "Negotiation", 700.25);
    await makeTask(ravi, { dueAt: utcNoon(-1) });
    await makeTask(ravi, { dueAt: utcNoon(-9) });
    await makeTask(ravi, { dueAt: utcNoon() });
    await makeTask(ravi, { dueAt: utcNoon(-1), status: "DONE" });
    await makeTask(ravi, { dueAt: utcNoon(-1), deletedAt: new Date() });

    const response = await asAdmin.get(TEAM).query(MARCH);

    expect(repOf(response, ravi)).toEqual({
      user: { id: ravi.id, name: "Ravi Rep", role: "SALES_REP", active: true },
      leadsCreated: 2,
      leadsHandled: 2,
      conversationsLogged: 2,
      opportunitiesWon: 2,
      opportunitiesLost: 1,
      wonValue: 3500.5,
      openPipelineValue: 1000.25,
      overdueTasks: 2,
    });
    expect(repOf(response, meera)).toMatchObject({
      ...NO_FIGURES,
      leadsCreated: 1,
      conversationsLogged: 1,
    });
    expect(repOf(response, tara)).toMatchObject({ ...NO_FIGURES, leadsHandled: 1 });
    expect(team(response).totals).toEqual({
      leadsCreated: 3,
      leadsHandled: 3,
      conversationsLogged: 3,
      opportunitiesWon: 2,
      opportunitiesLost: 1,
      wonValue: 3500.5,
      openPipelineValue: 1000.25,
      overdueTasks: 2,
    });

    // The same question from Ravi's manager: Tara's lead is not on her page.
    const forMeera = team(await asMeera.get(TEAM).query(MARCH));
    expect(forMeera.reps.map((rep) => rep.user.name)).toEqual(["Meera Manager", "Ravi Rep"]);
    expect(forMeera.totals).toMatchObject({
      leadsCreated: 3,
      leadsHandled: 2,
      conversationsLogged: 3,
    });
  });

  it("covers the current month up to today when no range is sent", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await makeLead(ravi);
    await makeLead(ravi, { createdAt: daysAgo(40) });
    await makeOpportunity(ravi, "Won", 500, { closedAt: new Date() });
    await makeOpportunity(ravi, "Won", 900, { closedAt: daysAgo(40) });

    const response = await asAdmin.get(TEAM);

    expect(team(response).range).toEqual({ from: `${today.slice(0, 8)}01`, to: today });
    expect(repOf(response, ravi)).toMatchObject({
      leadsCreated: 1,
      opportunitiesWon: 1,
      wonValue: 500,
    });
  });

  it("takes one end of the range and keeps the default for the other", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tenDaysAgo = daysAgo(10).toISOString().slice(0, 10);

    const fromOnly = team(await asAdmin.get(TEAM).query({ from: tenDaysAgo }));
    const toOnly = team(await asAdmin.get(TEAM).query({ to: today }));

    expect(fromOnly.range).toEqual({ from: tenDaysAgo, to: today });
    expect(toOnly.range).toEqual({ from: `${today.slice(0, 8)}01`, to: today });
  });

  it("reads the days of the range in the viewer's time zone", async () => {
    const lead = await makeLead(ravi, { createdAt: new Date("2026-01-01T00:00:00Z") });
    // 20:00 UTC on 1 March is 01:30 on 2 March in India.
    await makeEntry(ravi, lead.id, "2026-03-01T20:00:00Z");

    const count = async (day: string, tz?: string) =>
      repOf(await asAdmin.get(TEAM).query({ from: day, to: day, tz }), ravi).conversationsLogged;

    expect(await count("2026-03-01")).toBe(1);
    expect(await count("2026-03-02")).toBe(0);
    expect(await count("2026-03-01", "Asia/Kolkata")).toBe(0);
    expect(await count("2026-03-02", "Asia/Kolkata")).toBe(1);
    // 15:00 on 1 March in New York.
    expect(await count("2026-03-01", "America/New_York")).toBe(1);
  });

  it("lists a deactivated person only while one of their figures is not zero", async () => {
    const before = team(await asAdmin.get(TEAM).query(MARCH));
    await makeOpportunity(deactivated, "Won", 250, { closedAt: new Date("2026-03-10T10:00:00Z") });
    const after = await asAdmin.get(TEAM).query(MARCH);

    expect(before.reps.map((rep) => rep.user.id)).not.toContain(deactivated.id);
    expect(repOf(after, deactivated)).toMatchObject({
      user: { name: "Dev Deactivated", active: false },
      opportunitiesWon: 1,
      wonValue: 250,
    });
    expect(team(after).totals.wonValue).toBe(250);
  });

  it("allows a range of 366 days and no more", async () => {
    const longest = await asAdmin.get(TEAM).query({ from: "2026-01-01", to: "2027-01-01" });
    const tooLong = await asAdmin.get(TEAM).query({ from: "2026-01-01", to: "2027-01-02" });

    expect(longest.status).toBe(200);
    expect(tooLong.status).toBe(400);
    expect(errorOf(tooLong).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(tooLong)).toEqual(["to"]);
  });

  it.each([
    ["an end before the start", { from: "2026-03-10", to: "2026-03-09" }, "to"],
    ["a start that is not a day", { from: "March", to: "2026-03-09" }, "from"],
    ["a day that does not exist", { from: "2026-02-30" }, "from"],
    ["an end with a time", { to: "2026-03-09T10:00:00Z" }, "to"],
    ["a time zone that does not exist", { tz: "Europe/Atlantis" }, "tz"],
  ])("answers VALIDATION_FAILED for %s", async (_name, query, path) => {
    const response = await asAdmin.get(TEAM).query(query);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
  });
});
