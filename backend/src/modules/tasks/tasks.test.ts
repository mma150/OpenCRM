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
import type { Lead, Prisma, Task, User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

interface Person {
  id: string;
  name: string;
}

interface ApiTask {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: string;
  completedAt: string | null;
  assignee: Person;
  createdBy: Person;
  record: { type: string; id: string; name: string } | null;
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const TASKS = "/api/v1/tasks";

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

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

function taskOf(response: request.Response): ApiTask {
  return (response.body as Envelope<ApiTask>).data;
}

function titlesOf(response: request.Response): string[] {
  return (response.body as Envelope<ApiTask[]>).data.map((task) => task.title);
}

function metaOf(response: request.Response) {
  return (response.body as Envelope<unknown>).meta;
}

let taskCount = 0;

// Straight into the database, so a test can start from any state. Each task is created a
// minute after the one before, and ids follow creation order, so ties are predictable.
// Made by its assignee unless `createdById` says otherwise.
async function makeTask(
  assignee: User,
  fields: Partial<Prisma.TaskUncheckedCreateInput> = {},
): Promise<Task> {
  taskCount += 1;
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, taskCount));
  return prisma.task.create({
    data: {
      id: `01920000-0000-7000-8000-${String(taskCount).padStart(12, "0")}`,
      title: `Task ${String(taskCount)}`,
      assigneeId: assignee.id,
      createdById: assignee.id,
      createdAt,
      updatedAt: createdAt,
      ...fields,
    },
  });
}

function makeLead(owner: User, firstName = "Jane", lastName = "Doe"): Promise<Lead> {
  return prisma.lead.create({
    data: { firstName, lastName, source: "WEBSITE", ownerId: owner.id, createdById: owner.id },
  });
}

function stored(id: string): Promise<Task> {
  return prisma.task.findUniqueOrThrow({ where: { id } });
}

function notificationsFor(user: User) {
  return prisma.notification.findMany({ where: { userId: user.id } });
}

// The ways to change an existing task that share one rule, in an order that lets all of
// them succeed on the same task (delete last).
function writesTo(agent: Agent, id: string) {
  const url = `${TASKS}/${id}`;
  return [
    ["update", () => agent.patch(url).send({ title: "Changed" })],
    ["complete", () => agent.post(`${url}/complete`)],
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
  asTara = await signInAs(app, tara);
  asViewer = await signInAs(app, viewer);
});

beforeEach(async () => {
  await resetRecords();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("who sees which tasks", () => {
  // One task per possible assignee, each made by its assignee, and one that Ravi made
  // which now belongs to Tara.
  async function tasksForEveryone() {
    return {
      ofAdmin: await makeTask(admin, { title: "Of Admin" }),
      ofMeera: await makeTask(meera, { title: "Of Meera" }),
      ofRavi: await makeTask(ravi, { title: "Of Ravi" }),
      ofOmar: await makeTask(omar, { title: "Of Omar" }),
      ofTara: await makeTask(tara, { title: "Of Tara" }),
      ofUma: await makeTask(uma, { title: "Of Uma" }),
      byRaviForTara: await makeTask(tara, { title: "By Ravi for Tara", createdById: ravi.id }),
    };
  }

  const everyTask = [
    "By Ravi for Tara",
    "Of Admin",
    "Of Meera",
    "Of Omar",
    "Of Ravi",
    "Of Tara",
    "Of Uma",
  ];

  it.each([
    ["an Admin", () => asAdmin, everyTask],
    ["a Read-only user", () => asViewer, everyTask],
    [
      "a Sales Manager (assigned to or made by them, and assigned to their team)",
      () => asMeera,
      ["Of Meera", "Of Ravi"],
    ],
    ["a Sales Rep (assigned to or made by them)", () => asRavi, ["By Ravi for Tara", "Of Ravi"]],
    ["a Sales Rep on another team", () => asTara, ["By Ravi for Tara", "Of Tara"]],
  ])("lists for %s exactly the tasks they may see", async (_name, agent, expected) => {
    await tasksForEveryone();

    const response = await agent().get(TASKS);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(titlesOf(response).sort()).toEqual(expected);
    expect(metaOf(response)).toEqual({ page: 1, pageSize: 25, total: expected.length });
  });

  it("shows a Sales Manager a task someone else made for a rep on their team", async () => {
    const task = await makeTask(ravi, { createdById: admin.id });

    expect((await asMeera.get(`${TASKS}/${task.id}`)).status).toBe(200);
    expect((await asRavi.get(`${TASKS}/${task.id}`)).status).toBe(200);
  });

  it("reads one task for those who may see it and answers NOT_FOUND for the rest", async () => {
    const { ofRavi, ofTara } = await tasksForEveryone();

    for (const agent of [asAdmin, asViewer, asMeera, asRavi]) {
      const response = await agent.get(`${TASKS}/${ofRavi.id}`);

      expect(response.status).toBe(200);
      expect(taskOf(response)).toMatchObject({ id: ofRavi.id, title: "Of Ravi" });
    }
    for (const [agent, id] of [
      [asTara, ofRavi.id],
      [asRavi, ofTara.id],
      [asMeera, ofTara.id],
      [asAdmin, UNKNOWN_ID],
    ] as const) {
      const response = await agent.get(`${TASKS}/${id}`);

      expect(response.status).toBe(404);
      expect(errorOf(response)).toEqual({
        code: "NOT_FOUND",
        message: "Task not found",
        details: null,
      });
    }
  });

  it.each([
    ["a Sales Rep outside the task", () => asTara],
    ["a Sales Manager of another team", () => asMeera],
  ])("answers NOT_FOUND when %s tries to change it", async (_name, agent) => {
    const task = await makeTask(uma, { title: "Untouched" });

    for (const [name, write] of writesTo(agent(), task.id)) {
      const response = await write();

      expect(response.status, name).toBe(404);
      expect(errorOf(response).code, name).toBe("NOT_FOUND");
    }
    expect(await stored(task.id)).toMatchObject({
      title: "Untouched",
      status: "OPEN",
      deletedAt: null,
    });
  });

  it("answers FORBIDDEN for every write by a Read-only user", async () => {
    const task = await makeTask(ravi, { title: "Untouched" });

    const create = await asViewer.post(TASKS).send({ title: "Mine" });
    expect(create.status).toBe(403);
    expect(errorOf(create).code).toBe("FORBIDDEN");
    for (const [name, write] of writesTo(asViewer, task.id)) {
      const response = await write();

      expect(response.status, name).toBe(403);
      expect(errorOf(response).code, name).toBe("FORBIDDEN");
    }
    expect(await stored(task.id)).toMatchObject({ title: "Untouched", deletedAt: null });
    expect(await prisma.task.count()).toBe(1);
  });

  it.each([
    ["the assignee", () => asRavi],
    ["their Sales Manager", () => asMeera],
    ["an Admin", () => asAdmin],
  ])("lets %s change, complete, reopen and delete a task", async (_name, agent) => {
    const task = await makeTask(ravi, { createdById: admin.id });

    for (const [name, write] of writesTo(agent(), task.id)) {
      expect((await write()).status, name).toBe(200);
    }
  });
});

describe("create", () => {
  it("creates a task for the caller with every field, linked to a record", async () => {
    const lead = await makeLead(ravi);

    const response = await asRavi.post(TASKS).send({
      title: "  Send the proposal  ",
      description: "  With the new prices  ",
      // 15:00 in India is 09:30 UTC.
      dueAt: "2026-11-15T15:00:00+05:30",
      reminderAt: "2026-11-15T08:30:00Z",
      record: { type: "LEAD", id: lead.id },
    });
    const task = taskOf(response);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(task).toEqual({
      id: task.id,
      title: "Send the proposal",
      description: "With the new prices",
      dueAt: "2026-11-15T09:30:00.000Z",
      status: "OPEN",
      completedAt: null,
      assignee: { id: ravi.id, name: "Ravi Rep" },
      createdBy: { id: ravi.id, name: "Ravi Rep" },
      record: { type: "LEAD", id: lead.id, name: "Jane Doe" },
      reminderAt: "2026-11-15T08:30:00.000Z",
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
    expect(await stored(task.id)).toMatchObject({ leadId: lead.id, reminderSentAt: null });
  });

  it("needs only a title: no record, no due date, no reminder", async () => {
    const response = await asRavi.post(TASKS).send({ title: "Tidy the desk", description: "" });

    expect(response.status).toBe(201);
    expect(taskOf(response)).toMatchObject({
      title: "Tidy the desk",
      description: null,
      dueAt: null,
      record: null,
      reminderAt: null,
      assignee: { id: ravi.id },
    });
  });

  it("links to a contact, a company or an opportunity and names it", async () => {
    const owned = { ownerId: ravi.id, createdById: ravi.id };
    const contact = await prisma.contact.create({
      data: { firstName: "Carl", lastName: "Contact", ...owned },
    });
    const company = await prisma.company.create({ data: { name: "Acme", ...owned } });
    const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { name: "New" } });
    const opportunity = await prisma.opportunity.create({
      data: { name: "Fleet deal", stageId: stage.id, ...owned },
    });

    for (const [type, id, name] of [
      ["CONTACT", contact.id, "Carl Contact"],
      ["COMPANY", company.id, "Acme"],
      ["OPPORTUNITY", opportunity.id, "Fleet deal"],
    ] as const) {
      const response = await asRavi.post(TASKS).send({ title: "Call", record: { type, id } });

      expect(response.status, type).toBe(201);
      expect(taskOf(response).record, type).toEqual({ type, id, name });
    }
  });

  it("writes nothing on the record's timeline", async () => {
    const lead = await makeLead(ravi);

    const created = await asRavi
      .post(TASKS)
      .send({ title: "Call", record: { type: "LEAD", id: lead.id } });
    await asRavi.post(`${TASKS}/${taskOf(created).id}/complete`);

    expect(await prisma.timelineEntry.count()).toBe(0);
  });

  it.each([
    ["no title", {}, "title"],
    ["an empty title", { title: "   " }, "title"],
    ["a title over 200 characters", { title: "x".repeat(201) }, "title"],
    ["a title with a line break", { title: "One\nTwo" }, "title"],
    [
      "a description over 5000 characters",
      { title: "T", description: "x".repeat(5001) },
      "description",
    ],
    ["a due date without a time", { title: "T", dueAt: "2026-11-15" }, "dueAt"],
    ["a reminder that is not a time", { title: "T", reminderAt: "soon" }, "reminderAt"],
    ["an assignee that is not an id", { title: "T", assigneeId: "me" }, "assigneeId"],
    [
      "a record of an unknown type",
      { title: "T", record: { type: "INVOICE", id: UNKNOWN_ID } },
      "record.type",
    ],
    ["a record without an id", { title: "T", record: { type: "LEAD" } }, "record.id"],
    ["a status", { title: "T", status: "DONE" }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_name, body, path) => {
    const response = await asRavi.post(TASKS).send(body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await prisma.task.count()).toBe(0);
  });

  it("answers VALIDATION_FAILED on record.id for a record the caller cannot see, a deleted one and an unknown one", async () => {
    const ofTara = await makeLead(tara);
    const deleted = await makeLead(ravi);
    await prisma.lead.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    for (const id of [ofTara.id, deleted.id, UNKNOWN_ID]) {
      const response = await asRavi.post(TASKS).send({ title: "T", record: { type: "LEAD", id } });

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["record.id"]);
    }
    // A lead's id is not a company's id.
    const wrongType = await asRavi
      .post(TASKS)
      .send({ title: "T", record: { type: "COMPANY", id: (await makeLead(ravi)).id } });
    expect(detailPaths(wrongType)).toEqual(["record.id"]);
    expect(await prisma.task.count()).toBe(0);
  });

  describe("who a task may be assigned to", () => {
    it.each([
      ["a Sales Rep to themselves", () => asRavi, () => ravi],
      ["a Sales Manager to themselves", () => asMeera, () => meera],
      ["a Sales Manager to a rep on their team", () => asMeera, () => ravi],
      ["an Admin to a Sales Rep", () => asAdmin, () => tara],
      ["an Admin to a Sales Manager", () => asAdmin, () => omar],
    ])("lets %s", async (_name, agent, assignee) => {
      const response = await agent().post(TASKS).send({ title: "T", assigneeId: assignee().id });

      expect(response.status).toBe(201);
      expect(taskOf(response).assignee.id).toBe(assignee().id);
    });

    it.each([
      ["a Sales Rep to another rep", () => asRavi, () => tara],
      ["a Sales Rep to their manager", () => asRavi, () => meera],
      ["a Sales Manager to a rep on another team", () => asMeera, () => tara],
      ["a Sales Manager to a rep without a manager", () => asMeera, () => uma],
      ["a Sales Manager to an Admin", () => asMeera, () => admin],
      ["an Admin to a Read-only user", () => asAdmin, () => viewer],
      ["an Admin to a deactivated user", () => asAdmin, () => deactivated],
    ])("refuses %s with VALIDATION_FAILED on assigneeId", async (_name, agent, assignee) => {
      const response = await agent().post(TASKS).send({ title: "T", assigneeId: assignee().id });

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["assigneeId"]);
      expect(await prisma.task.count()).toBe(0);
    });

    it("refuses an assignee that does not exist the same way", async () => {
      const response = await asAdmin.post(TASKS).send({ title: "T", assigneeId: UNKNOWN_ID });

      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["assigneeId"]);
    });
  });

  it("tells the assignee when someone else gives them a task, and nobody otherwise", async () => {
    const forRavi = await asMeera
      .post(TASKS)
      .send({ title: "Prepare the demo", assigneeId: ravi.id });
    await asMeera.post(TASKS).send({ title: "My own" });

    expect(await notificationsFor(ravi)).toMatchObject([
      {
        kind: "TASK_ASSIGNED",
        title: "Meera Manager assigned you a task",
        body: "Prepare the demo",
        link: `/tasks?open=${taskOf(forRavi).id}`,
        readAt: null,
      },
    ]);
    expect(await notificationsFor(meera)).toEqual([]);
  });

  it("answers a task with record null when the caller may not see its record", async () => {
    const adminsLead = await makeLead(admin, "Hidden", "Lead");

    const created = await asAdmin.post(TASKS).send({
      title: "Look into this",
      assigneeId: ravi.id,
      record: { type: "LEAD", id: adminsLead.id },
    });
    const forRavi = await asRavi.get(`${TASKS}/${taskOf(created).id}`);

    expect(taskOf(created).record).toEqual({
      type: "LEAD",
      id: adminsLead.id,
      name: "Hidden Lead",
    });
    expect(forRavi.status).toBe(200);
    expect(taskOf(forRavi).record).toBeNull();
  });

  it("answers record null once the record is deleted", async () => {
    const lead = await makeLead(ravi);
    const task = await makeTask(ravi, { leadId: lead.id });
    await prisma.lead.update({ where: { id: lead.id }, data: { deletedAt: new Date() } });

    const response = await asRavi.get(`${TASKS}/${task.id}`);

    expect(response.status).toBe(200);
    expect(taskOf(response).record).toBeNull();
  });
});

describe("update", () => {
  it("changes only the keys that are sent, and null clears a field", async () => {
    const task = await makeTask(ravi, {
      title: "Old",
      description: "Keep me",
      dueAt: new Date("2026-11-15T09:00:00Z"),
    });

    const renamed = await asRavi.patch(`${TASKS}/${task.id}`).send({ title: "New" });
    const cleared = await asRavi
      .patch(`${TASKS}/${task.id}`)
      .send({ description: null, dueAt: null });

    expect(renamed.status).toBe(200);
    expect(taskOf(renamed)).toMatchObject({
      title: "New",
      description: "Keep me",
      dueAt: "2026-11-15T09:00:00.000Z",
    });
    expect(taskOf(cleared)).toMatchObject({ title: "New", description: null, dueAt: null });
  });

  it("links, moves and unlinks the record", async () => {
    const lead = await makeLead(ravi);
    const company = await prisma.company.create({
      data: { name: "Acme", ownerId: ravi.id, createdById: ravi.id },
    });
    const task = await makeTask(ravi);
    const url = `${TASKS}/${task.id}`;

    const linked = await asRavi.patch(url).send({ record: { type: "LEAD", id: lead.id } });
    const moved = await asRavi.patch(url).send({ record: { type: "COMPANY", id: company.id } });
    const afterMove = await stored(task.id);
    const untouched = await asRavi.patch(url).send({ title: "Renamed" });
    const unlinked = await asRavi.patch(url).send({ record: null });

    expect(taskOf(linked).record).toEqual({ type: "LEAD", id: lead.id, name: "Jane Doe" });
    expect(taskOf(moved).record).toEqual({ type: "COMPANY", id: company.id, name: "Acme" });
    expect(afterMove).toMatchObject({ leadId: null, companyId: company.id });
    expect(taskOf(untouched).record).toMatchObject({ type: "COMPANY" });
    expect(taskOf(unlinked).record).toBeNull();
  });

  it("refuses a record the caller cannot see with VALIDATION_FAILED on record.id", async () => {
    const task = await makeTask(ravi);
    const ofTara = await makeLead(tara);

    const response = await asRavi
      .patch(`${TASKS}/${task.id}`)
      .send({ record: { type: "LEAD", id: ofTara.id } });

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual(["record.id"]);
    expect((await stored(task.id)).leadId).toBeNull();
  });

  it("reassigns within the caller's reach and tells the new assignee", async () => {
    const task = await makeTask(meera, { title: "Quarterly review" });

    const response = await asMeera.patch(`${TASKS}/${task.id}`).send({ assigneeId: ravi.id });

    expect(response.status).toBe(200);
    expect(taskOf(response).assignee).toEqual({ id: ravi.id, name: "Ravi Rep" });
    expect(await notificationsFor(ravi)).toMatchObject([
      {
        kind: "TASK_ASSIGNED",
        title: "Meera Manager assigned you a task",
        body: "Quarterly review",
        link: `/tasks?open=${task.id}`,
      },
    ]);
  });

  it("refuses an assignee outside the caller's reach with VALIDATION_FAILED on assigneeId", async () => {
    const ofRavi = await makeTask(ravi);
    const ofMeera = await makeTask(meera);

    const byRep = await asRavi.patch(`${TASKS}/${ofRavi.id}`).send({ assigneeId: tara.id });
    const byManager = await asMeera.patch(`${TASKS}/${ofMeera.id}`).send({ assigneeId: tara.id });

    for (const response of [byRep, byManager]) {
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["assigneeId"]);
    }
    expect((await stored(ofRavi.id)).assigneeId).toBe(ravi.id);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("lets a rep edit a task and send its present assignee, and tells nobody", async () => {
    // Made by Ravi, now Tara's: Ravi could not assign it to Tara, but it already is.
    const task = await makeTask(tara, { createdById: ravi.id });

    const response = await asRavi
      .patch(`${TASKS}/${task.id}`)
      .send({ title: "Edited", assigneeId: tara.id });

    expect(response.status).toBe(200);
    expect(taskOf(response)).toMatchObject({ title: "Edited", assignee: { id: tara.id } });
    expect(await prisma.notification.count()).toBe(0);
  });

  it("does not tell a user who takes a task for themselves", async () => {
    const task = await makeTask(ravi);

    await asMeera.patch(`${TASKS}/${task.id}`).send({ assigneeId: meera.id });

    expect(await prisma.notification.count()).toBe(0);
  });

  it("arms the reminder again when its time moves, and not when it stays", async () => {
    const sentAt = new Date("2026-11-15T08:31:00Z");
    const task = await makeTask(ravi, {
      reminderAt: new Date("2026-11-15T08:30:00Z"),
      reminderSentAt: sentAt,
    });
    const url = `${TASKS}/${task.id}`;

    await asRavi.patch(url).send({ title: "Edited", reminderAt: "2026-11-15T08:30:00Z" });
    const afterSameTime = await stored(task.id);
    const moved = await asRavi.patch(url).send({ reminderAt: "2026-11-16T08:30:00Z" });
    const afterMove = await stored(task.id);
    await prisma.task.update({ where: { id: task.id }, data: { reminderSentAt: sentAt } });
    const cleared = await asRavi.patch(url).send({ reminderAt: null });

    expect(afterSameTime.reminderSentAt).toEqual(sentAt);
    expect(taskOf(moved).reminderAt).toBe("2026-11-16T08:30:00.000Z");
    expect(afterMove.reminderSentAt).toBeNull();
    expect(taskOf(cleared).reminderAt).toBeNull();
    expect(await stored(task.id)).toMatchObject({ reminderAt: null, reminderSentAt: null });
  });

  it.each([
    ["an empty title", { title: "" }, "title"],
    ["a title set to null", { title: null }, "title"],
    ["a due date that is not a time", { dueAt: "tomorrow" }, "dueAt"],
    ["a status (it has its own routes)", { status: "DONE" }, ""],
    ["an assignee set to null", { assigneeId: null }, "assigneeId"],
  ])("answers VALIDATION_FAILED for %s", async (_name, body, path) => {
    const task = await makeTask(ravi, { title: "Untouched" });

    const response = await asRavi.patch(`${TASKS}/${task.id}`).send(body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await stored(task.id)).toMatchObject({ title: "Untouched", status: "OPEN" });
  });
});

describe("complete and reopen", () => {
  it("marks a task done with the time, and open again without it", async () => {
    const task = await makeTask(ravi);
    const before = Date.now();

    const done = await asRavi.post(`${TASKS}/${task.id}/complete`);
    const reopened = await asRavi.post(`${TASKS}/${task.id}/reopen`);

    expect(done.status).toBe(200);
    expect(Object.keys(done.body as object).sort()).toEqual(["data", "meta"]);
    expect(taskOf(done).status).toBe("DONE");
    expect(new Date(taskOf(done).completedAt ?? 0).getTime()).toBeGreaterThanOrEqual(before);
    expect(reopened.status).toBe(200);
    expect(taskOf(reopened)).toMatchObject({ status: "OPEN", completedAt: null });
  });

  it("answers a task that is already done, or already open, as it is", async () => {
    const completedAt = new Date("2026-03-01T10:00:00Z");
    const done = await makeTask(ravi, { status: "DONE", completedAt });
    const open = await makeTask(ravi);

    const again = await asRavi.post(`${TASKS}/${done.id}/complete`);
    const stillOpen = await asRavi.post(`${TASKS}/${open.id}/reopen`);

    expect(again.status).toBe(200);
    expect(taskOf(again)).toMatchObject({
      status: "DONE",
      completedAt: completedAt.toISOString(),
    });
    expect(stillOpen.status).toBe(200);
    expect(taskOf(stillOpen)).toMatchObject({ status: "OPEN", completedAt: null });
  });

  it("answers NOT_FOUND for an unknown id", async () => {
    for (const action of ["complete", "reopen"]) {
      const response = await asAdmin.post(`${TASKS}/${UNKNOWN_ID}/${action}`);

      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe("NOT_FOUND");
    }
  });
});

describe("delete", () => {
  it("keeps the row but never shows the task again", async () => {
    const task = await makeTask(ravi);

    const response = await asRavi.delete(`${TASKS}/${task.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect((await stored(task.id)).deletedAt).not.toBeNull();
    expect(titlesOf(await asAdmin.get(TASKS))).toEqual([]);
    for (const again of [
      await asRavi.get(`${TASKS}/${task.id}`),
      await asAdmin.patch(`${TASKS}/${task.id}`).send({ title: "Back" }),
      await asRavi.delete(`${TASKS}/${task.id}`),
    ]) {
      expect(again.status).toBe(404);
    }
  });
});

describe("list: search, filters, sorting and paging", () => {
  function list(query: Record<string, string | number> = {}, agent: Agent = asAdmin) {
    return agent.get(TASKS).query(query);
  }

  it("searches the title: every word, whatever the case, and a literal wildcard", async () => {
    await makeTask(ravi, { title: "Send proposal to Acme" });
    await makeTask(ravi, { title: "Call Acme" });
    await makeTask(ravi, { title: "100% discount check", description: "acme" });

    expect(titlesOf(await list({ search: "acme" })).sort()).toEqual([
      "Call Acme",
      "Send proposal to Acme",
    ]);
    expect(titlesOf(await list({ search: "ACME send" }))).toEqual(["Send proposal to Acme"]);
    expect(titlesOf(await list({ search: "%" }))).toEqual(["100% discount check"]);
    expect(titlesOf(await list({ search: "nothing" }))).toEqual([]);
  });

  it("filters by status", async () => {
    await makeTask(ravi, { title: "Open" });
    await makeTask(ravi, { title: "Done", status: "DONE", completedAt: new Date() });

    expect(titlesOf(await list({ status: "OPEN" }))).toEqual(["Open"]);
    expect(titlesOf(await list({ status: "DONE" }))).toEqual(["Done"]);
    expect(metaOf(await list({ status: "DONE" }))).toMatchObject({ total: 1 });
  });

  it("filters by assignee, which narrows the list and never widens it", async () => {
    await makeTask(ravi, { title: "Of Ravi" });
    await makeTask(tara, { title: "Of Tara" });
    await makeTask(meera, { title: "Of Meera" });

    expect(titlesOf(await list({ assigneeId: ravi.id }))).toEqual(["Of Ravi"]);
    expect(titlesOf(await list({ assigneeId: ravi.id }, asMeera))).toEqual(["Of Ravi"]);
    // Tara is not on Meera's team, and Ravi sees no task of Meera's.
    expect(titlesOf(await list({ assigneeId: tara.id }, asMeera))).toEqual([]);
    expect(titlesOf(await list({ assigneeId: meera.id }, asRavi))).toEqual([]);
  });

  it("filters by record, and a record the caller cannot see never matches", async () => {
    const lead = await makeLead(ravi);
    const other = await makeLead(ravi, "Other", "Lead");
    const adminsLead = await makeLead(admin, "Hidden", "Lead");
    await makeTask(ravi, { title: "On the lead", leadId: lead.id });
    await makeTask(ravi, { title: "On the other", leadId: other.id });
    await makeTask(ravi, { title: "On a hidden lead", leadId: adminsLead.id });
    await makeTask(ravi, { title: "On nothing" });

    const onLead = { recordType: "LEAD", recordId: lead.id };
    const onHidden = { recordType: "LEAD", recordId: adminsLead.id };

    expect(titlesOf(await list(onLead, asRavi))).toEqual(["On the lead"]);
    expect(titlesOf(await list({ recordType: "COMPANY", recordId: lead.id }, asRavi))).toEqual([]);
    expect(titlesOf(await list(onHidden, asAdmin))).toEqual(["On a hidden lead"]);
    expect(titlesOf(await list(onHidden, asRavi))).toEqual([]);
  });

  it("filters by when a task is due: overdue, today, upcoming or without a date", async () => {
    await makeTask(ravi, { title: "Yesterday", dueAt: utcNoon(-1) });
    await makeTask(ravi, { title: "Last week", dueAt: utcNoon(-7) });
    await makeTask(ravi, { title: "Today", dueAt: utcNoon() });
    await makeTask(ravi, { title: "Tomorrow", dueAt: utcNoon(1) });
    await makeTask(ravi, { title: "Some day" });

    expect(titlesOf(await list({ due: "overdue" }))).toEqual(["Last week", "Yesterday"]);
    expect(titlesOf(await list({ due: "today" }))).toEqual(["Today"]);
    expect(titlesOf(await list({ due: "upcoming" }))).toEqual(["Tomorrow"]);
    expect(titlesOf(await list({ due: "none" }))).toEqual(["Some day"]);
    expect(titlesOf(await list({ due: "today", tz: "UTC" }))).toEqual(["Today"]);
  });

  it("counts the days in the viewer's time zone", async () => {
    const { timeZone, moment, inUtc, inZone } = zoneOnAnotherDay();
    await makeTask(ravi, { title: "On the edge", dueAt: moment });

    expect(titlesOf(await list({ due: inUtc }))).toEqual(["On the edge"]);
    expect(titlesOf(await list({ due: inZone }))).toEqual([]);
    expect(titlesOf(await list({ due: inZone, tz: timeZone }))).toEqual(["On the edge"]);
    expect(titlesOf(await list({ due: inUtc, tz: timeZone }))).toEqual([]);
  });

  it("sorts by due date, soonest first, by default, with undated tasks last both ways", async () => {
    await makeTask(ravi, { title: "No date" });
    await makeTask(ravi, { title: "Later", dueAt: utcNoon(3) });
    await makeTask(ravi, { title: "Sooner", dueAt: utcNoon(1) });

    expect(titlesOf(await list())).toEqual(["Sooner", "Later", "No date"]);
    expect(titlesOf(await list({ sort: "dueAt", order: "desc" }))).toEqual([
      "Later",
      "Sooner",
      "No date",
    ]);
  });

  it("sorts by title and by createdAt", async () => {
    await makeTask(ravi, { title: "Banana" });
    await makeTask(ravi, { title: "Apple" });
    await makeTask(ravi, { title: "Cherry" });

    expect(titlesOf(await list({ sort: "title" }))).toEqual(["Apple", "Banana", "Cherry"]);
    expect(titlesOf(await list({ sort: "title", order: "desc" }))).toEqual([
      "Cherry",
      "Banana",
      "Apple",
    ]);
    expect(titlesOf(await list({ sort: "createdAt", order: "desc" }))).toEqual([
      "Cherry",
      "Apple",
      "Banana",
    ]);
    expect(titlesOf(await list({ sort: "createdAt", order: "asc" }))).toEqual([
      "Banana",
      "Apple",
      "Cherry",
    ]);
  });

  it("pages the list and counts every match, giving each task exactly one place", async () => {
    for (let index = 0; index < 5; index += 1) {
      await makeTask(ravi, { title: `T${String(index)}`, dueAt: utcNoon(1) });
    }

    const pages = await Promise.all([1, 2, 3, 4].map((page) => list({ pageSize: 2, page })));

    expect(pages.map((page) => titlesOf(page))).toEqual([["T0", "T1"], ["T2", "T3"], ["T4"], []]);
    expect(metaOf(pages[1] as request.Response)).toEqual({ page: 2, pageSize: 2, total: 5 });
  });

  it.each([
    ["page", "0"],
    ["pageSize", "101"],
    ["sort", "assignee"],
    ["order", "up"],
    ["status", "CLOSED"],
    ["assigneeId", "me"],
    ["due", "soon"],
    ["tz", "Mars/Olympus"],
    ["search", "x".repeat(101)],
  ])("answers VALIDATION_FAILED for a bad %s", async (name, value) => {
    const response = await list({ [name]: value });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([name]);
  });

  it("wants recordType and recordId together", async () => {
    const typeOnly = await list({ recordType: "LEAD" });
    const idOnly = await list({ recordId: UNKNOWN_ID });
    const badType = await list({ recordType: "INVOICE", recordId: UNKNOWN_ID });

    for (const response of [typeOnly, idOnly]) {
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["recordId"]);
    }
    expect(detailPaths(badType)).toEqual(["recordType"]);
  });
});

describe("summary", () => {
  const SUMMARY = `${TASKS}/summary`;

  it("counts the caller's own open tasks by when they are due", async () => {
    await makeTask(ravi, { dueAt: utcNoon(-2) });
    await makeTask(ravi, { dueAt: utcNoon(-1) });
    await makeTask(ravi, { dueAt: utcNoon() });
    await makeTask(ravi, { dueAt: utcNoon(1) });
    await makeTask(ravi, { dueAt: utcNoon(2) });
    await makeTask(ravi, { dueAt: utcNoon(30) });
    await makeTask(ravi);
    // None of these count: done, deleted, someone else's, and one Ravi made for Tara.
    await makeTask(ravi, { dueAt: utcNoon(-1), status: "DONE", completedAt: new Date() });
    await makeTask(ravi, { dueAt: utcNoon(), deletedAt: new Date() });
    await makeTask(meera, { dueAt: utcNoon() });
    await makeTask(tara, { dueAt: utcNoon(), createdById: ravi.id });

    const response = await asRavi.get(SUMMARY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { overdue: 2, today: 1, upcoming: 3, noDueDate: 1 },
      meta: {},
    });
  });

  it("counts only the caller's own tasks for a Sales Manager, an Admin and a Read-only user", async () => {
    await makeTask(ravi, { dueAt: utcNoon() });
    await makeTask(meera, { dueAt: utcNoon(-1) });

    const zeros = { overdue: 0, today: 0, upcoming: 0, noDueDate: 0 };

    expect((await asMeera.get(SUMMARY)).body).toMatchObject({ data: { ...zeros, overdue: 1 } });
    expect((await asAdmin.get(SUMMARY)).body).toMatchObject({ data: zeros });
    expect((await asViewer.get(SUMMARY)).body).toMatchObject({ data: zeros });
  });

  it("counts the days in the viewer's time zone", async () => {
    const { timeZone, moment, inUtc, inZone } = zoneOnAnotherDay();
    await makeTask(ravi, { dueAt: moment });

    const utc = await asRavi.get(SUMMARY);
    const zone = await asRavi.get(SUMMARY).query({ tz: timeZone });

    expect((utc.body as Envelope<Record<string, number>>).data).toMatchObject({
      [inUtc]: 1,
      [inZone]: 0,
    });
    expect((zone.body as Envelope<Record<string, number>>).data).toMatchObject({
      [inUtc]: 0,
      [inZone]: 1,
    });
  });

  it("answers VALIDATION_FAILED for a time zone that does not exist", async () => {
    const response = await asRavi.get(SUMMARY).query({ tz: "Europe/Atlantis" });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(["tz"]);
  });
});
