import { env } from "../env";
import type { Prisma } from "../generated/prisma/client";
import { logger } from "./logger";
import { type MailMessage, sendMail } from "./mailer";
import { addNotification, type NewNotification, notificationLinks } from "./notifications";
import { prisma } from "./prisma";
import type { FollowUpBody } from "./record-fields";

// Reminders (TASK-03 to TASK-05). There is one mechanism for all three kinds: a time on the
// row (a task's `reminderAt`, a lead's or an opportunity's `followUpAt`) and beside it the
// time the reminder fired (`reminderSentAt`, `followUpNotifiedAt`). runDueReminders finds
// the rows whose time has come and that have not fired, and for each one writes an in-app
// notification and sends an email. A reminder fires once; moving its time arms it again.
//
// It does not fire for a done or deleted task, a deleted, converted or lost lead, a deleted
// or closed opportunity, or a deactivated user. It stays armed, so it fires on the next run
// after that stops being true (the task is reopened, the user is reactivated).

// How often the server looks for due reminders.
const INTERVAL_MS = 60_000;

// The most reminders of one kind a single run handles; the rest wait for the next run.
const BATCH_SIZE = 200;

const recipient = { select: { id: true, name: true, email: true } } as const;

interface Recipient {
  id: string;
  name: string;
  email: string;
}

interface DueReminder {
  // Marks the reminder as fired if nobody has yet, and says whether this call did it. One
  // conditional UPDATE, so when two servers run at the same moment only one of them sends.
  // Raw SQL so that `updatedAt` is left alone: the record was not edited.
  claim: (tx: Prisma.TransactionClient) => Promise<number>;
  to: Recipient;
  notification: NewNotification;
}

async function dueTaskReminders(now: Date): Promise<DueReminder[]> {
  const tasks = await prisma.task.findMany({
    where: {
      reminderAt: { lte: now },
      reminderSentAt: null,
      status: "OPEN",
      deletedAt: null,
      assignee: { isActive: true },
    },
    include: { assignee: recipient },
    orderBy: [{ reminderAt: "asc" }, { id: "asc" }],
    take: BATCH_SIZE,
  });
  return tasks.map((task) => ({
    claim: (tx) => tx.$executeRaw`
      UPDATE "Task" SET "reminderSentAt" = ${now}
      WHERE "id" = ${task.id} AND "reminderSentAt" IS NULL AND "reminderAt" <= ${now}`,
    to: task.assignee,
    notification: {
      userId: task.assigneeId,
      kind: "TASK_REMINDER",
      title: `Reminder: ${task.title}`,
      body: task.description,
      link: notificationLinks.task(task.id),
    },
  }));
}

async function dueLeadFollowUps(now: Date): Promise<DueReminder[]> {
  const leads = await prisma.lead.findMany({
    where: {
      followUpAt: { lte: now },
      followUpNotifiedAt: null,
      status: { notIn: ["CONVERTED", "LOST"] },
      deletedAt: null,
      owner: { isActive: true },
    },
    include: { owner: recipient },
    orderBy: [{ followUpAt: "asc" }, { id: "asc" }],
    take: BATCH_SIZE,
  });
  return leads.map((lead) => ({
    claim: (tx) => tx.$executeRaw`
      UPDATE "Lead" SET "followUpNotifiedAt" = ${now}
      WHERE "id" = ${lead.id} AND "followUpNotifiedAt" IS NULL AND "followUpAt" <= ${now}`,
    to: lead.owner,
    notification: {
      userId: lead.ownerId,
      kind: "LEAD_FOLLOW_UP",
      title: `Follow up with ${lead.firstName} ${lead.lastName}`,
      body: lead.followUpNote,
      link: notificationLinks.lead(lead.id),
    },
  }));
}

async function dueOpportunityFollowUps(now: Date): Promise<DueReminder[]> {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      followUpAt: { lte: now },
      followUpNotifiedAt: null,
      stage: { kind: "OPEN" },
      deletedAt: null,
      owner: { isActive: true },
    },
    include: { owner: recipient },
    orderBy: [{ followUpAt: "asc" }, { id: "asc" }],
    take: BATCH_SIZE,
  });
  return opportunities.map((opportunity) => ({
    claim: (tx) => tx.$executeRaw`
      UPDATE "Opportunity" SET "followUpNotifiedAt" = ${now}
      WHERE "id" = ${opportunity.id} AND "followUpNotifiedAt" IS NULL AND "followUpAt" <= ${now}`,
    to: opportunity.owner,
    notification: {
      userId: opportunity.ownerId,
      kind: "OPPORTUNITY_FOLLOW_UP",
      title: `Follow up on ${opportunity.name}`,
      body: opportunity.followUpNote,
      link: notificationLinks.opportunity(opportunity.id),
    },
  }));
}

// The email for a reminder: the same words as the notification, with a link into the app.
export function reminderMessage(to: Recipient, notification: NewNotification): MailMessage {
  const lines = [`Hello ${to.name},`, notification.title];
  if (notification.body) {
    lines.push(notification.body);
  }
  lines.push(`${env.APP_URL}${notification.link}`);
  return {
    to: to.email,
    // A subject is one line, whatever the title holds.
    subject: notification.title.replaceAll(/\s+/g, " "),
    text: lines.join("\n\n"),
  };
}

export interface ReminderRun {
  // Reminders this run fired: each one wrote a notification.
  fired: number;
  // How many of those were also handed to the mail server.
  emailed: number;
}

// Fires every reminder that is due at `now`. Safe to call from more than one process at
// once. The notification is written in the same transaction as the claim, so a reminder is
// never marked as fired without one. The email comes after and may fail (or email may be
// off): that is logged by the mailer and loses nothing, and one bad reminder never stops
// the rest.
export async function runDueReminders(now: Date): Promise<ReminderRun> {
  const due = [
    ...(await dueTaskReminders(now)),
    ...(await dueLeadFollowUps(now)),
    ...(await dueOpportunityFollowUps(now)),
  ];

  const run: ReminderRun = { fired: 0, emailed: 0 };
  for (const reminder of due) {
    try {
      const claimed = await prisma.$transaction(async (tx) => {
        if ((await reminder.claim(tx)) === 0) {
          return false;
        }
        await addNotification(tx, reminder.notification);
        return true;
      });
      if (!claimed) {
        continue;
      }
      run.fired += 1;
      if (await sendMail(reminderMessage(reminder.to, reminder.notification))) {
        run.emailed += 1;
      }
    } catch (error) {
      logger.error({ err: error, link: reminder.notification.link }, "A reminder failed");
    }
  }
  return run;
}

// Started by server.ts once the API listens; never by createApp, so tests and scripts that
// build the app do not start a timer. One run at a time: a slow mail server makes the next
// tick skip instead of piling up.
export function startReminderLoop(): void {
  if (env.NODE_ENV === "test") {
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const run = await runDueReminders(new Date());
      if (run.fired > 0) {
        logger.info(run, "Reminders fired");
      }
    } catch (error) {
      logger.error({ err: error }, "Looking for due reminders failed");
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(() => void tick(), INTERVAL_MS);
}

// Whether a reminder's time was moved. A reminder that has fired is armed again only then,
// so saving a form without touching the time does not send it twice.
export function isMoved(from: Date | null, to: Date | null): boolean {
  return from?.getTime() !== to?.getTime();
}

// The columns to write for PUT .../follow-up on a lead or an opportunity.
export function followUpChange(current: { followUpAt: Date | null }, input: FollowUpBody) {
  if (input.at === null) {
    return { followUpAt: null, followUpNote: null, followUpNotifiedAt: null };
  }
  const followUpAt = new Date(input.at);
  return {
    followUpAt,
    followUpNote: input.note ?? null,
    ...(isMoved(current.followUpAt, followUpAt) ? { followUpNotifiedAt: null } : {}),
  };
}
