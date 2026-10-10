import { createTransport } from "nodemailer";
import request, { type Response } from "supertest";
import { vi } from "vitest";

import { createApp } from "../src/app";
import { type Env, env } from "../src/env";
import type { Role, User } from "../src/generated/prisma/client";
import * as mailer from "../src/lib/mailer";
import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";
import { SESSION_COOKIE_NAME } from "../src/lib/session-cookie";
import { createSession } from "../src/lib/sessions";

// Must match test.env.CORS_ORIGINS and APP_URL in vitest.config.ts.
export const ORIGIN = "http://localhost:3000";

// The password of every user made by createUser.
export const PASSWORD = "plum-harbour-41-kettle";

export interface ErrorEnvelope {
  error: { code: string; message: string; details: unknown };
}

export interface ValidationDetail {
  path: string;
  message: string;
}

// The public auth routes are rate-limited; ordinary tests sign in far more often than the
// real limits allow, so they get an app without a practical limit.
export function createTestApp() {
  return createApp({
    rateLimit: {
      ipLimit: 100_000,
      emailLimit: 100_000,
      statusLimit: 100_000,
      sendLimit: 100_000,
    },
  });
}

// Every record, its timeline, every task, every notification, every custom field, every
// quote, invoice, product and email template and the saved settings, keeping the users and
// the pipeline stages: for a test file that makes its users once and wants a
// clean slate before each test. Entries and tasks go before the records they belong to, leads before what they
// were converted into, and opportunities and contacts before the contacts and companies
// they are linked to.
export async function resetRecords(): Promise<void> {
  await prisma.notification.deleteMany();
  await prisma.task.deleteMany();
  await prisma.timelineEntry.deleteMany();
  // Invoices before the quotes they were made from, quotes before the products on their
  // lines and before the opportunities they belong to.
  await prisma.invoice.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.product.deleteMany();
  await prisma.documentCounter.deleteMany();
  await prisma.emailTemplate.deleteMany();
  await prisma.mailSettings.deleteMany();
  await prisma.organizationSettings.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
  await prisma.customField.deleteMany();
}

// The pipeline as the migration seeds it, for a test that renames, adds, reorders or
// deletes stages. Call it after resetRecords(): a stage that holds opportunities cannot go.
export async function resetPipelineStages(): Promise<void> {
  await prisma.pipelineStage.deleteMany();
  await prisma.pipelineStage.createMany({
    data: [
      { name: "New", position: 0 },
      { name: "Qualified", position: 1 },
      { name: "Proposal", position: 2 },
      { name: "Negotiation", position: 3 },
      { name: "Won", position: 0, kind: "WON" },
      { name: "Lost", position: 0, kind: "LOST" },
    ],
  });
}

// Sessions and links go with their user (ON DELETE CASCADE). Records a user owns or wrote
// on do not, so they are removed first.
export async function resetDatabase(): Promise<void> {
  await resetRecords();
  await prisma.user.deleteMany();
}

let passwordHash: Promise<string> | undefined;
let userCount = 0;

interface UserOptions {
  name?: string;
  email?: string;
  role?: Role;
  isActive?: boolean;
  // An invited user has no password yet.
  invited?: boolean;
  managerId?: string;
}

export async function createUser(options: UserOptions = {}): Promise<User> {
  // Hashing is slow on purpose, so the one test password is hashed once.
  passwordHash ??= hashPassword(PASSWORD);
  userCount += 1;
  return prisma.user.create({
    data: {
      name: options.name ?? `User ${String(userCount)}`,
      email: options.email ?? `user${String(userCount)}@example.com`,
      role: options.role ?? "SALES_REP",
      isActive: options.isActive ?? true,
      passwordHash: options.invited ? null : await passwordHash,
      managerId: options.managerId ?? null,
    },
  });
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}`;
}

// The Set-Cookie line that sets (or clears) the session cookie, if the response has one.
export function sessionSetCookie(response: Response): string | undefined {
  const header = response.headers["set-cookie"] as string[] | undefined;
  return header?.find((line) => line.startsWith(`${SESSION_COOKIE_NAME}=`));
}

// "name=value" from that line: what a browser would send back in the Cookie header.
export function cookieFrom(response: Response): string {
  const pair = sessionSetCookie(response)?.split(";")[0];
  if (!pair) {
    throw new Error("The response did not set the session cookie");
  }
  return pair;
}

// A supertest agent that is signed in as the user (a new session each call) and sends the
// Origin header a browser would, which the origin check requires beside a cookie.
export async function signInAs(app: ReturnType<typeof createApp>, user: User) {
  const token = await createSession(user.id);
  const agent = request.agent(app);
  agent.set("Origin", ORIGIN).set("Cookie", sessionCookie(token));
  return agent;
}

// Stands in for a working mail server: collects what would have been sent.
// Undone by vi.restoreAllMocks().
export function captureMail(): mailer.MailMessage[] {
  const messages: mailer.MailMessage[] = [];
  vi.spyOn(mailer, "isMailConfigured").mockResolvedValue(true);
  vi.spyOn(mailer, "sendMail").mockImplementation((message) => {
    messages.push(message);
    return Promise.resolve(true);
  });
  vi.spyOn(mailer, "deliverMail").mockImplementation((message) => {
    messages.push(message);
    return Promise.resolve();
  });
  return messages;
}

// One step closer to the real thing than captureMail: the settings an Admin would save are
// in the database, and the mail server itself is nodemailer's in-memory transport, which
// builds each message and sends nothing. Returns the spy on what that transport was asked to
// send, so a test can check the From and Reply-To headers too. Undone by
// vi.restoreAllMocks() and resetRecords().
export async function useFakeMailServer() {
  await prisma.mailSettings.create({
    data: {
      host: "smtp.test",
      port: 587,
      fromName: "OpenCRM Test",
      fromAddress: "test@opencrm.local",
    },
  });
  const transport = createTransport({ jsonTransport: true });
  const send = vi.spyOn(transport, "sendMail");
  vi.spyOn(mailer.mailTransport, "create").mockReturnValue(transport);
  return send;
}

// A mail server that fails the way a real one does: an error with nodemailer's code, an SMTP
// status number, and text of its own that must never reach a response.
export const MAIL_SERVER_TEXT = "554 banner of mail.internal.example";

export function useFailingMailServer(code = "ECONNECTION") {
  const transport = createTransport({ jsonTransport: true });
  vi.spyOn(transport, "sendMail").mockRejectedValue(
    Object.assign(new Error(MAIL_SERVER_TEXT), { code, responseCode: 554 }),
  );
  vi.spyOn(mailer.mailTransport, "create").mockReturnValue(transport);
}

// The token inside an invite or password-reset link.
export function tokenFromLink(link: string): string {
  const token = new URL(link).searchParams.get("token");
  if (!token) {
    throw new Error(`No token in link: ${link}`);
  }
  return token;
}

// The first link in the text of an email.
export function linkFromMail(message: mailer.MailMessage | undefined): string {
  const link = message?.text.split(/\s+/).find((word) => word.startsWith("http"));
  if (!link) {
    throw new Error("No link in the email");
  }
  return link;
}

const HOUR_MS = 60 * 60 * 1000;

// Noon (UTC) today, or so many days from today: a moment that is safely inside its UTC day.
export function utcNoon(daysFromToday = 0): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromToday, 12),
  );
}

// For tests of the `tz` parameter without faking the clock: a time zone in which it is
// another calendar day than in UTC right now, and a moment that therefore falls in a
// different due bucket there than it does in UTC.
export function zoneOnAnotherDay() {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (now.getUTCHours() >= 10) {
    // Kiritimati is 14 hours ahead of UTC, so it is already tomorrow there: 05:00 UTC
    // today was yesterday evening on their calendar.
    return {
      timeZone: "Pacific/Kiritimati",
      moment: new Date(midnight + 5 * HOUR_MS),
      inUtc: "today",
      inZone: "overdue",
    } as const;
  }
  // Pago Pago is 11 hours behind UTC, so it is still yesterday there: 19:00 UTC yesterday
  // is this morning on their calendar.
  return {
    timeZone: "Pacific/Pago_Pago",
    moment: new Date(midnight - 5 * HOUR_MS),
    inUtc: "overdue",
    inZone: "today",
  } as const;
}

const originalEnv = { ...env };

// Changes the parsed environment for one test (the mail variables, the encryption key),
// since it is read once at start-up. Put restoreEnv() in afterEach.
export function setEnv(values: Partial<Env>): void {
  Object.assign(env, values);
}

export function restoreEnv(): void {
  for (const key of Object.keys(env) as (keyof Env)[]) {
    if (!(key in originalEnv)) {
      Reflect.deleteProperty(env, key);
    }
  }
  Object.assign(env, originalEnv);
}
