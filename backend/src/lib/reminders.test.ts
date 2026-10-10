import { createTransport } from "nodemailer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureMail,
  createTestApp,
  createUser,
  ORIGIN,
  resetDatabase,
  resetPipelineStages,
  resetRecords,
  signInAs,
} from "../../test/helpers";
import type { Notification, PipelineStage, Prisma, User } from "../generated/prisma/client";
import * as mailer from "./mailer";
import { prisma } from "./prisma";
import { reminderMessage, runDueReminders } from "./reminders";

// The reminder runner is called directly here, with the moment it should believe it is, so
// nothing waits for a timer. Times are fixed: only "due at or before now" matters.
const DUE = new Date("2026-11-15T09:00:00Z");
const NOW = new Date("2026-11-15T09:00:30Z");
const BEFORE = new Date("2026-11-15T08:59:59Z");

const app = createTestApp();

let meera: User;
let ravi: User;
let gone: User;
let stages: Record<string, PipelineStage>;

function makeTask(assignee: User, fields: Partial<Prisma.TaskUncheckedCreateInput> = {}) {
  return prisma.task.create({
    data: {
      title: "Call Jane",
      assigneeId: assignee.id,
      createdById: assignee.id,
      reminderAt: DUE,
      ...fields,
    },
  });
}

function makeLead(owner: User, fields: Partial<Prisma.LeadUncheckedCreateInput> = {}) {
  return prisma.lead.create({
    data: {
      firstName: "Jane",
      lastName: "Doe",
      source: "WEBSITE",
      ownerId: owner.id,
      createdById: owner.id,
      followUpAt: DUE,
      ...fields,
    },
  });
}

function makeOpportunity(
  owner: User,
  fields: Partial<Prisma.OpportunityUncheckedCreateInput> = {},
) {
  return prisma.opportunity.create({
    data: {
      name: "Fleet deal",
      stageId: stages.New?.id ?? "",
      ownerId: owner.id,
      createdById: owner.id,
      followUpAt: DUE,
      ...fields,
    },
  });
}

function notifications(): Promise<Notification[]> {
  return prisma.notification.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

beforeAll(async () => {
  await resetDatabase();
  await resetPipelineStages();
  meera = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
  ravi = await createUser({
    name: "Ravi Rep",
    email: "ravi@example.com",
    role: "SALES_REP",
    managerId: meera.id,
  });
  gone = await createUser({ name: "Dev Deactivated", role: "SALES_REP", isActive: false });
  const rows = await prisma.pipelineStage.findMany();
  stages = Object.fromEntries(rows.map((stage) => [stage.name, stage]));
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

describe("runDueReminders", () => {
  it("fires a task's reminder once: a notification for the assignee", async () => {
    const task = await makeTask(ravi, { description: "About the renewal", createdById: meera.id });

    const first = await runDueReminders(NOW);
    const second = await runDueReminders(new Date(NOW.getTime() + 60_000));

    expect(first).toEqual({ fired: 1, emailed: 0 });
    expect(second).toEqual({ fired: 0, emailed: 0 });
    expect(await notifications()).toMatchObject([
      {
        userId: ravi.id,
        kind: "TASK_REMINDER",
        title: "Reminder: Call Jane",
        body: "About the renewal",
        link: `/tasks?open=${task.id}`,
        readAt: null,
      },
    ]);
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.reminderSentAt).toEqual(NOW);
    // Firing a reminder is not an edit.
    expect(stored.updatedAt).toEqual(task.updatedAt);
  });

  it("fires a lead's follow-up once, for its owner", async () => {
    const lead = await makeLead(ravi, { followUpNote: "Send the price list" });

    const first = await runDueReminders(NOW);
    const second = await runDueReminders(NOW);

    expect(first.fired).toBe(1);
    expect(second.fired).toBe(0);
    expect(await notifications()).toMatchObject([
      {
        userId: ravi.id,
        kind: "LEAD_FOLLOW_UP",
        title: "Follow up with Jane Doe",
        body: "Send the price list",
        link: `/leads/${lead.id}`,
      },
    ]);
    const stored = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(stored.followUpNotifiedAt).toEqual(NOW);
    expect(stored.updatedAt).toEqual(lead.updatedAt);
  });

  it("fires an opportunity's follow-up once, for its owner", async () => {
    const opportunity = await makeOpportunity(ravi);

    const first = await runDueReminders(NOW);
    const second = await runDueReminders(NOW);

    expect(first.fired).toBe(1);
    expect(second.fired).toBe(0);
    expect(await notifications()).toMatchObject([
      {
        userId: ravi.id,
        kind: "OPPORTUNITY_FOLLOW_UP",
        title: "Follow up on Fleet deal",
        body: null,
        link: `/opportunities/${opportunity.id}`,
      },
    ]);
    const stored = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
    expect(stored.followUpNotifiedAt).toEqual(NOW);
    expect(stored.updatedAt).toEqual(opportunity.updatedAt);
  });

  it("fires at the reminder's own moment and not before", async () => {
    await makeTask(ravi);
    await makeLead(ravi);
    await makeOpportunity(ravi);

    expect((await runDueReminders(BEFORE)).fired).toBe(0);
    expect(await notifications()).toEqual([]);
    expect((await runDueReminders(DUE)).fired).toBe(3);
  });

  it("leaves a task without a reminder and a record without a follow-up alone", async () => {
    await makeTask(ravi, { reminderAt: null, dueAt: DUE });
    await makeLead(ravi, { followUpAt: null });
    await makeOpportunity(ravi, { followUpAt: null });

    expect((await runDueReminders(NOW)).fired).toBe(0);
  });

  it("fires again after the time is moved through the API", async () => {
    const asRavi = await signInAs(app, ravi);
    const task = await makeTask(ravi);
    const lead = await makeLead(ravi);
    const opportunity = await makeOpportunity(ravi);
    await runDueReminders(NOW);
    const later = new Date("2026-11-20T09:00:00Z");

    await asRavi.patch(`/api/v1/tasks/${task.id}`).send({ reminderAt: later.toISOString() });
    await asRavi.put(`/api/v1/leads/${lead.id}/follow-up`).send({ at: later.toISOString() });
    await asRavi
      .put(`/api/v1/opportunities/${opportunity.id}/follow-up`)
      .send({ at: later.toISOString() });
    const beforeNewTime = await runDueReminders(new Date("2026-11-19T09:00:00Z"));
    const atNewTime = await runDueReminders(later);
    const afterwards = await runDueReminders(new Date("2026-11-21T09:00:00Z"));

    expect(beforeNewTime.fired).toBe(0);
    expect(atNewTime.fired).toBe(3);
    expect(afterwards.fired).toBe(0);
    expect(await notifications()).toHaveLength(6);
  });

  it("does not fire again when a fired reminder is saved with the same time", async () => {
    const asRavi = await signInAs(app, ravi);
    const task = await makeTask(ravi);
    const lead = await makeLead(ravi);
    await runDueReminders(NOW);

    await asRavi
      .patch(`/api/v1/tasks/${task.id}`)
      .send({ title: "Renamed", reminderAt: DUE.toISOString() });
    await asRavi
      .put(`/api/v1/leads/${lead.id}/follow-up`)
      .send({ at: DUE.toISOString(), note: "A new note" });

    expect((await runDueReminders(new Date(NOW.getTime() + 60_000))).fired).toBe(0);
    expect(await notifications()).toHaveLength(2);
  });

  describe("what does not fire", () => {
    it.each([
      ["a done task", () => makeTask(ravi, { status: "DONE", completedAt: BEFORE })],
      ["a deleted task", () => makeTask(ravi, { deletedAt: BEFORE })],
      ["a task of a deactivated user", () => makeTask(gone)],
      ["a deleted lead", () => makeLead(ravi, { deletedAt: BEFORE })],
      ["a converted lead", () => makeLead(ravi, { status: "CONVERTED" })],
      ["a lost lead", () => makeLead(ravi, { status: "LOST" })],
      ["a lead of a deactivated user", () => makeLead(gone)],
      ["a deleted opportunity", () => makeOpportunity(ravi, { deletedAt: BEFORE })],
      ["a won opportunity", () => makeOpportunity(ravi, { stageId: stages.Won?.id })],
      ["a lost opportunity", () => makeOpportunity(ravi, { stageId: stages.Lost?.id })],
      ["an opportunity of a deactivated user", () => makeOpportunity(gone)],
    ])("%s", async (_name, make) => {
      const sent = captureMail();
      await make();

      const run = await runDueReminders(NOW);

      expect(run).toEqual({ fired: 0, emailed: 0 });
      expect(await notifications()).toEqual([]);
      expect(sent).toEqual([]);
    });

    it("stays armed, so it fires once the task is open again", async () => {
      const task = await makeTask(ravi, { status: "DONE", completedAt: BEFORE });
      await runDueReminders(NOW);

      await prisma.task.update({
        where: { id: task.id },
        data: { status: "OPEN", completedAt: null },
      });

      expect((await runDueReminders(new Date(NOW.getTime() + 60_000))).fired).toBe(1);
    });
  });

  describe("email", () => {
    it("sends the reminder through the mail transport, with a link into the app", async () => {
      // nodemailer's own in-memory transport: builds the message, sends nothing.
      const transport = createTransport({ jsonTransport: true });
      const send = vi.spyOn(transport, "sendMail");
      const sendMail = mailer.sendMail;
      vi.spyOn(mailer, "sendMail").mockImplementation((message) => sendMail(message, transport));
      const task = await makeTask(ravi, { description: "About the renewal" });

      const run = await runDueReminders(NOW);

      expect(run).toEqual({ fired: 1, emailed: 1 });
      expect(send).toHaveBeenCalledExactlyOnceWith({
        from: "OpenCRM Test <test@opencrm.local>",
        to: "ravi@example.com",
        subject: "Reminder: Call Jane",
        text: [
          "Hello Ravi Rep,",
          "Reminder: Call Jane",
          "About the renewal",
          `${ORIGIN}/tasks?open=${task.id}`,
        ].join("\n\n"),
      });
    });

    it("emails a lead's and an opportunity's follow-up to the owner", async () => {
      const sent = captureMail();
      const lead = await makeLead(ravi, { followUpNote: "Send the price list" });
      const opportunity = await makeOpportunity(ravi);

      const run = await runDueReminders(NOW);

      expect(run).toEqual({ fired: 2, emailed: 2 });
      expect(sent).toEqual([
        {
          to: "ravi@example.com",
          subject: "Follow up with Jane Doe",
          text: `Hello Ravi Rep,\n\nFollow up with Jane Doe\n\nSend the price list\n\n${ORIGIN}/leads/${lead.id}`,
        },
        {
          to: "ravi@example.com",
          subject: "Follow up on Fleet deal",
          text: `Hello Ravi Rep,\n\nFollow up on Fleet deal\n\n${ORIGIN}/opportunities/${opportunity.id}`,
        },
      ]);
    });

    it("still writes the notification when email is off", async () => {
      await makeTask(ravi);

      expect(mailer.isMailConfigured()).toBe(false);
      expect(await runDueReminders(NOW)).toEqual({ fired: 1, emailed: 0 });
      expect(await notifications()).toHaveLength(1);
    });

    it("keeps the notification and carries on when the mail server cannot be reached", async () => {
      // Nothing listens on port 1.
      const transport = createTransport({ host: "127.0.0.1", port: 1, connectionTimeout: 2000 });
      const sendMail = mailer.sendMail;
      vi.spyOn(mailer, "sendMail").mockImplementation((message) => sendMail(message, transport));
      await makeTask(ravi);
      await makeLead(ravi);

      const first = await runDueReminders(NOW);
      const second = await runDueReminders(NOW);

      expect(first).toEqual({ fired: 2, emailed: 0 });
      // The reminder has fired: a failed email is not sent again and again.
      expect(second).toEqual({ fired: 0, emailed: 0 });
      expect((await notifications()).map((item) => item.kind)).toEqual([
        "TASK_REMINDER",
        "LEAD_FOLLOW_UP",
      ]);
    });

    it("survives an email that throws, and still fires the reminders after it", async () => {
      const send = vi.spyOn(mailer, "sendMail").mockRejectedValueOnce(new Error("mail exploded"));
      send.mockResolvedValue(true);
      await makeTask(ravi);
      await makeLead(ravi);
      await makeOpportunity(ravi);

      const run = await runDueReminders(NOW);

      expect(send).toHaveBeenCalledTimes(3);
      expect(await notifications()).toHaveLength(3);
      expect(run.emailed).toBe(2);
    });

    it("writes the subject on one line", () => {
      const message = reminderMessage(
        { id: ravi.id, name: "Ravi Rep", email: "ravi@example.com" },
        {
          userId: ravi.id,
          kind: "OPPORTUNITY_FOLLOW_UP",
          title: "Follow up on Deal\r\nBcc: someone@example.com",
          link: "/opportunities/1",
        },
      );

      expect(message.subject).toBe("Follow up on Deal Bcc: someone@example.com");
    });
  });

  it("fires each reminder once when two runners work at the same moment", async () => {
    const sent = captureMail();
    for (let index = 0; index < 5; index += 1) {
      await makeTask(ravi, { title: `Task ${String(index)}` });
    }
    await makeLead(ravi);
    await makeOpportunity(ravi);

    const runs = await Promise.all([
      runDueReminders(NOW),
      runDueReminders(NOW),
      runDueReminders(NOW),
    ]);

    expect(runs.reduce((sum, run) => sum + run.fired, 0)).toBe(7);
    expect(runs.reduce((sum, run) => sum + run.emailed, 0)).toBe(7);
    expect(sent).toHaveLength(7);
    const written = await notifications();
    expect(written).toHaveLength(7);
    expect(new Set(written.map((item) => item.link)).size).toBe(7);
  });
});
