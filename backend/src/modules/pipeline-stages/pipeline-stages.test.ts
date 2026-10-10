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
import type { Opportunity, Prisma, User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import * as timeline from "../../lib/timeline";

interface ApiStage {
  id: string;
  name: string;
  position: number;
  kind: string;
  opportunityCount: number;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const STAGES = "/api/v1/pipeline-stages";
const DEFAULT_NAMES = ["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

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
let asViewer: Agent;

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

function stagesOf(response: request.Response): ApiStage[] {
  return (response.body as Envelope<ApiStage[]>).data;
}

function namesOf(response: request.Response): string[] {
  return stagesOf(response).map((stage) => stage.name);
}

// The pipeline as the API lists it now, by name.
async function pipeline(): Promise<Record<string, ApiStage>> {
  const stages = stagesOf(await asAdmin.get(STAGES));
  return Object.fromEntries(stages.map((stage) => [stage.name, stage]));
}

async function storedNames(): Promise<string[]> {
  return namesOf(await asAdmin.get(STAGES));
}

function makeOpportunity(
  owner: User,
  stageId: string,
  fields: Partial<Prisma.OpportunityUncheckedCreateInput> = {},
): Promise<Opportunity> {
  return prisma.opportunity.create({
    data: { name: "Deal", stageId, ownerId: owner.id, createdById: owner.id, ...fields },
  });
}

function stored(id: string): Promise<Opportunity> {
  return prisma.opportunity.findUniqueOrThrow({ where: { id } });
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
  asViewer = await signInAs(app, viewer);
});

beforeEach(async () => {
  await resetRecords();
  await resetPipelineStages();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetRecords();
  await resetPipelineStages();
  await resetDatabase();
  await prisma.$disconnect();
});

describe("GET /pipeline-stages", () => {
  it.each([
    ["an Admin", () => asAdmin],
    ["a Sales Manager", () => asMeera],
    ["a Sales Rep", () => asRavi],
    ["a Read-only user", () => asViewer],
  ])("gives %s the default pipeline in order: open stages, then Won, then Lost", async (_, as) => {
    const response = await as().get(STAGES);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(
      stagesOf(response).map(({ name, position, kind, opportunityCount }) => ({
        name,
        position,
        kind,
        opportunityCount,
      })),
    ).toEqual([
      { name: "New", position: 0, kind: "OPEN", opportunityCount: 0 },
      { name: "Qualified", position: 1, kind: "OPEN", opportunityCount: 0 },
      { name: "Proposal", position: 2, kind: "OPEN", opportunityCount: 0 },
      { name: "Negotiation", position: 3, kind: "OPEN", opportunityCount: 0 },
      { name: "Won", position: 4, kind: "WON", opportunityCount: 0 },
      { name: "Lost", position: 5, kind: "LOST", opportunityCount: 0 },
    ]);
  });

  it("counts only the opportunities the caller may see, and never a deleted one", async () => {
    const { New, Won } = await pipeline();
    await makeOpportunity(ravi, New?.id ?? "");
    await makeOpportunity(ravi, Won?.id ?? "");
    await makeOpportunity(meera, New?.id ?? "");
    await makeOpportunity(uma, New?.id ?? "");
    await makeOpportunity(ravi, New?.id ?? "", { deletedAt: new Date() });

    const counts = async (agent: Agent) => {
      const stages = stagesOf(await agent.get(STAGES));
      return stages.map((stage) => stage.opportunityCount);
    };

    expect(await counts(asAdmin)).toEqual([3, 0, 0, 0, 1, 0]);
    expect(await counts(asViewer)).toEqual([3, 0, 0, 0, 1, 0]);
    expect(await counts(asMeera)).toEqual([2, 0, 0, 0, 1, 0]);
    expect(await counts(asRavi)).toEqual([1, 0, 0, 0, 1, 0]);
  });
});

describe("who may change the pipeline", () => {
  it.each([
    ["a Sales Manager", () => asMeera],
    ["a Sales Rep", () => asRavi],
    ["a Read-only user", () => asViewer],
  ])("answers FORBIDDEN to every change by %s", async (_who, as) => {
    const { New, Qualified, Proposal, Negotiation } = await pipeline();
    const ids = [Negotiation?.id, Proposal?.id, Qualified?.id, New?.id];

    const refused = [
      await as().post(STAGES).send({ name: "Demo" }),
      await as()
        .patch(`${STAGES}/${New?.id ?? ""}`)
        .send({ name: "Fresh" }),
      await as().put(`${STAGES}/order`).send({ ids }),
      await as().delete(`${STAGES}/${New?.id ?? ""}`),
    ];

    for (const response of refused) {
      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe("FORBIDDEN");
    }
    expect(await storedNames()).toEqual(DEFAULT_NAMES);
  });
});

describe("POST /pipeline-stages", () => {
  it("adds an open stage last before Won and answers with the whole pipeline", async () => {
    const response = await asAdmin.post(STAGES).send({ name: "  Demo  " });

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(namesOf(response)).toEqual([
      "New",
      "Qualified",
      "Proposal",
      "Negotiation",
      "Demo",
      "Won",
      "Lost",
    ]);
    expect(stagesOf(response)[4]).toMatchObject({
      name: "Demo",
      position: 4,
      kind: "OPEN",
      opportunityCount: 0,
    });
    expect(stagesOf(response).map((stage) => stage.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it.each([
    ["no name", {}],
    ["an empty name", { name: "  " }],
    ["a name over 50 characters", { name: "x".repeat(51) }],
    ["a name another stage has", { name: "proposal" }],
    ["the name of the Won stage", { name: "WON" }],
  ])("answers VALIDATION_FAILED on name for %s", async (_what, body) => {
    const response = await asAdmin.post(STAGES).send(body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(["name"]);
    expect(await storedNames()).toEqual(DEFAULT_NAMES);
  });

  it("does not let a request choose the kind or the position", async () => {
    const response = await asAdmin.post(STAGES).send({ name: "Second win", kind: "WON" });

    expect(response.status).toBe(400);
    expect(await storedNames()).toEqual(DEFAULT_NAMES);
  });

  it("stops at 20 open stages", async () => {
    await prisma.pipelineStage.createMany({
      data: Array.from({ length: 16 }, (_, index) => ({
        name: `Extra ${String(index)}`,
        position: 4 + index,
      })),
    });

    const response = await asAdmin.post(STAGES).send({ name: "One too many" });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(errorOf(response).details).toBeNull();
    expect(await prisma.pipelineStage.count({ where: { kind: "OPEN" } })).toBe(20);
  });
});

describe("PATCH /pipeline-stages/:id", () => {
  it("renames an open stage and leaves its place alone", async () => {
    const { Proposal } = await pipeline();

    const response = await asAdmin
      .patch(`${STAGES}/${Proposal?.id ?? ""}`)
      .send({ name: " Quote sent " });

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual([
      "New",
      "Qualified",
      "Quote sent",
      "Negotiation",
      "Won",
      "Lost",
    ]);
    expect(stagesOf(response)[2]).toMatchObject({ id: Proposal?.id, position: 2, kind: "OPEN" });
  });

  it("renames the Won and Lost stages, which stay Won and Lost", async () => {
    const { Won, Lost } = await pipeline();

    await asAdmin.patch(`${STAGES}/${Won?.id ?? ""}`).send({ name: "Closed won" });
    const response = await asAdmin
      .patch(`${STAGES}/${Lost?.id ?? ""}`)
      .send({ name: "Closed lost" });

    expect(response.status).toBe(200);
    expect(stagesOf(response).slice(4)).toMatchObject([
      { id: Won?.id, name: "Closed won", kind: "WON" },
      { id: Lost?.id, name: "Closed lost", kind: "LOST" },
    ]);
  });

  it("lets a stage keep its own name in another case", async () => {
    const { New } = await pipeline();

    const response = await asAdmin.patch(`${STAGES}/${New?.id ?? ""}`).send({ name: "NEW" });

    expect(response.status).toBe(200);
    expect(namesOf(response)[0]).toBe("NEW");
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a name another stage has", { name: "qualified" }],
  ])("answers VALIDATION_FAILED on name for %s", async (_what, body) => {
    const { New } = await pipeline();

    const response = await asAdmin.patch(`${STAGES}/${New?.id ?? ""}`).send(body);

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual(["name"]);
    expect(await storedNames()).toEqual(DEFAULT_NAMES);
  });

  it("answers NOT_FOUND for a stage that does not exist", async () => {
    const response = await asAdmin.patch(`${STAGES}/${UNKNOWN_ID}`).send({ name: "Ghost" });

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("NOT_FOUND");
  });
});

describe("PUT /pipeline-stages/order", () => {
  it("puts the open stages in the order sent, with Won and Lost still last", async () => {
    const { New, Qualified, Proposal, Negotiation } = await pipeline();

    const response = await asAdmin
      .put(`${STAGES}/order`)
      .send({ ids: [Negotiation?.id, New?.id, Proposal?.id, Qualified?.id] });

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual([
      "Negotiation",
      "New",
      "Proposal",
      "Qualified",
      "Won",
      "Lost",
    ]);
    expect(stagesOf(response).map((stage) => stage.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(await storedNames()).toEqual(namesOf(response));
  });

  it("refuses a list that is not every open stage exactly once", async () => {
    const { New, Qualified, Proposal, Negotiation, Won } = await pipeline();
    const all = [Negotiation?.id, Proposal?.id, Qualified?.id, New?.id];

    const refused = [
      await asAdmin.put(`${STAGES}/order`).send({ ids: all.slice(1) }),
      await asAdmin.put(`${STAGES}/order`).send({ ids: [...all.slice(1), all[1]] }),
      await asAdmin.put(`${STAGES}/order`).send({ ids: [...all, Won?.id] }),
      await asAdmin.put(`${STAGES}/order`).send({ ids: [...all.slice(1), Won?.id] }),
      await asAdmin.put(`${STAGES}/order`).send({ ids: [...all.slice(1), UNKNOWN_ID] }),
    ];

    for (const response of refused) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["ids"]);
    }
    expect(await storedNames()).toEqual(DEFAULT_NAMES);
  });

  it.each([
    ["no ids", {}],
    ["an empty list", { ids: [] }],
    ["something that is not an id", { ids: ["first"] }],
  ])("answers VALIDATION_FAILED for %s", async (_what, body) => {
    const response = await asAdmin.put(`${STAGES}/order`).send(body);

    expect(response.status).toBe(400);
    expect(detailPaths(response)[0]).toMatch(/^ids/);
  });
});

describe("DELETE /pipeline-stages/:id", () => {
  it("deletes an empty open stage without a body and closes the gap", async () => {
    const { Qualified } = await pipeline();

    const response = await asAdmin.delete(`${STAGES}/${Qualified?.id ?? ""}`);

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual(["New", "Proposal", "Negotiation", "Won", "Lost"]);
    expect(stagesOf(response).map((stage) => stage.position)).toEqual([0, 1, 2, 3, 4]);
    const open = await prisma.pipelineStage.findMany({
      where: { kind: "OPEN" },
      orderBy: { position: "asc" },
    });
    expect(open.map((stage) => stage.position)).toEqual([0, 1, 2]);
  });

  it("does not delete the Won or the Lost stage", async () => {
    const { Won, Lost, New } = await pipeline();

    for (const stage of [Won, Lost]) {
      const response = await asAdmin
        .delete(`${STAGES}/${stage?.id ?? ""}`)
        .send({ moveToStageId: New?.id });
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(errorOf(response).details).toBeNull();
    }
    expect(await storedNames()).toEqual(DEFAULT_NAMES);
  });

  it("does not delete the last open stage", async () => {
    const { New, Qualified, Proposal, Negotiation } = await pipeline();
    for (const stage of [New, Qualified, Proposal]) {
      expect((await asAdmin.delete(`${STAGES}/${stage?.id ?? ""}`)).status).toBe(200);
    }

    const response = await asAdmin.delete(`${STAGES}/${Negotiation?.id ?? ""}`);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(errorOf(response).details).toBeNull();
    expect(await storedNames()).toEqual(["Negotiation", "Won", "Lost"]);
  });

  it("keeps one open stage when the last two are deleted at the same moment", async () => {
    const { New, Qualified, Proposal, Negotiation } = await pipeline();
    await asAdmin.delete(`${STAGES}/${New?.id ?? ""}`);
    await asAdmin.delete(`${STAGES}/${Qualified?.id ?? ""}`);

    const responses = await Promise.all([
      asAdmin.delete(`${STAGES}/${Proposal?.id ?? ""}`),
      asAdmin.delete(`${STAGES}/${Negotiation?.id ?? ""}`),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(await prisma.pipelineStage.count({ where: { kind: "OPEN" } })).toBe(1);
  });

  it("needs a target when the stage holds opportunities", async () => {
    const { Proposal } = await pipeline();
    const opportunity = await makeOpportunity(ravi, Proposal?.id ?? "");

    const response = await asAdmin.delete(`${STAGES}/${Proposal?.id ?? ""}`);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(["moveToStageId"]);
    expect(await storedNames()).toEqual(DEFAULT_NAMES);
    expect((await stored(opportunity.id)).stageId).toBe(Proposal?.id);
  });

  it("refuses a target that is the stage itself, Won, Lost or unknown", async () => {
    const { Proposal, Won, Lost } = await pipeline();
    await makeOpportunity(ravi, Proposal?.id ?? "");

    for (const moveToStageId of [Proposal?.id, Won?.id, Lost?.id, UNKNOWN_ID]) {
      const response = await asAdmin
        .delete(`${STAGES}/${Proposal?.id ?? ""}`)
        .send({ moveToStageId });
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["moveToStageId"]);
    }
    expect(await storedNames()).toEqual(DEFAULT_NAMES);
  });

  it("moves the stage's opportunities to the target, each with a timeline entry", async () => {
    const { Proposal, Negotiation, New } = await pipeline();
    const first = await makeOpportunity(ravi, Proposal?.id ?? "");
    const second = await makeOpportunity(uma, Proposal?.id ?? "");
    const deleted = await makeOpportunity(ravi, Proposal?.id ?? "", { deletedAt: new Date() });
    const elsewhere = await makeOpportunity(ravi, New?.id ?? "");

    const response = await asAdmin
      .delete(`${STAGES}/${Proposal?.id ?? ""}`)
      .send({ moveToStageId: Negotiation?.id });

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual(["New", "Qualified", "Negotiation", "Won", "Lost"]);
    expect(stagesOf(response)[2]).toMatchObject({ name: "Negotiation", opportunityCount: 2 });
    for (const moved of [first, second, deleted]) {
      expect((await stored(moved.id)).stageId).toBe(Negotiation?.id);
    }
    expect((await stored(elsewhere.id)).stageId).toBe(New?.id);

    const entries = await prisma.timelineEntry.findMany({ orderBy: { opportunityId: "asc" } });
    expect(entries.map((entry) => entry.opportunityId).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    for (const entry of entries) {
      expect(entry).toMatchObject({
        kind: "STATUS_CHANGE",
        authorId: admin.id,
        details: { from: "Proposal", to: "Negotiation", fromKind: "OPEN", toKind: "OPEN" },
      });
    }
  });

  it("deletes a stage whose only opportunities are deleted ones, without a target", async () => {
    const { Proposal } = await pipeline();
    const deleted = await makeOpportunity(ravi, Proposal?.id ?? "", { deletedAt: new Date() });

    const response = await asAdmin.delete(`${STAGES}/${Proposal?.id ?? ""}`);

    expect(response.status).toBe(200);
    expect(namesOf(response)).not.toContain("Proposal");
    expect((await stored(deleted.id)).stageId).not.toBe(Proposal?.id);
    expect(await prisma.timelineEntry.count()).toBe(0);
  });

  it("deletes nothing and moves nothing when a timeline entry cannot be written", async () => {
    const { Proposal, Negotiation } = await pipeline();
    const opportunity = await makeOpportunity(ravi, Proposal?.id ?? "");
    vi.spyOn(timeline, "addTimelineEntry").mockRejectedValue(new Error("entry failed"));

    const response = await asAdmin
      .delete(`${STAGES}/${Proposal?.id ?? ""}`)
      .send({ moveToStageId: Negotiation?.id });

    expect(response.status).toBe(500);
    expect(errorOf(response).code).toBe("INTERNAL_ERROR");
    expect(await storedNames()).toEqual(DEFAULT_NAMES);
    expect((await stored(opportunity.id)).stageId).toBe(Proposal?.id);
  });

  it("answers NOT_FOUND for a stage that does not exist", async () => {
    const response = await asAdmin.delete(`${STAGES}/${UNKNOWN_ID}`);

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("NOT_FOUND");
  });
});
