import request, { type Response } from "supertest";
import { vi } from "vitest";

import { createApp } from "../src/app";
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
  return createApp({ rateLimit: { ipLimit: 100_000, emailLimit: 100_000, statusLimit: 100_000 } });
}

// Every record and its timeline, keeping the users and the pipeline stages: for a test file
// that makes its users once and wants a clean slate before each test. Entries go before the
// records they belong to, leads before what they were converted into, and opportunities and
// contacts before the contacts and companies they are linked to.
export async function resetRecords(): Promise<void> {
  await prisma.timelineEntry.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
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
  vi.spyOn(mailer, "isMailConfigured").mockReturnValue(true);
  vi.spyOn(mailer, "sendMail").mockImplementation((message) => {
    messages.push(message);
    return Promise.resolve(true);
  });
  return messages;
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
