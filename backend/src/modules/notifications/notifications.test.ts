import type request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  resetRecords,
  signInAs,
  type ValidationDetail,
} from "../../../test/helpers";
import type { Notification, Prisma, User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

interface ApiNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string;
  readAt: string | null;
  createdAt: string;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const NOTIFICATIONS = "/api/v1/notifications";

const app = createTestApp();

let admin: User;
let meera: User;
let ravi: User;
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

function titlesOf(response: request.Response): string[] {
  return (response.body as Envelope<ApiNotification[]>).data.map((item) => item.title);
}

function countOf(response: request.Response): number {
  return (response.body as Envelope<{ count: number }>).data.count;
}

let notificationCount = 0;

// Straight into the database. Each one is a minute newer than the one before.
async function makeNotification(
  user: User,
  fields: Partial<Prisma.NotificationUncheckedCreateInput> = {},
): Promise<Notification> {
  notificationCount += 1;
  return prisma.notification.create({
    data: {
      userId: user.id,
      kind: "TASK_REMINDER",
      title: `N${String(notificationCount)}`,
      link: "/tasks?open=1",
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, notificationCount)),
      ...fields,
    },
  });
}

function stored(id: string): Promise<Notification> {
  return prisma.notification.findUniqueOrThrow({ where: { id } });
}

beforeAll(async () => {
  await resetDatabase();
  admin = await createUser({ name: "Asha Admin", role: "ADMIN" });
  meera = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
  ravi = await createUser({ name: "Ravi Rep", role: "SALES_REP", managerId: meera.id });
  tara = await createUser({ name: "Tara Rep", role: "SALES_REP" });
  viewer = await createUser({ name: "Vik Viewer", role: "READ_ONLY" });

  asAdmin = await signInAs(app, admin);
  asMeera = await signInAs(app, meera);
  asRavi = await signInAs(app, ravi);
  asViewer = await signInAs(app, viewer);
});

beforeEach(async () => {
  await resetRecords();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("GET /notifications", () => {
  it("lists the caller's own notifications, newest first", async () => {
    const first = await makeNotification(ravi, {
      kind: "LEAD_FOLLOW_UP",
      title: "Follow up with Jane Doe",
      body: "Send the price list",
      link: "/leads/abc",
    });
    await makeNotification(ravi, { title: "Second", readAt: new Date("2026-02-01T10:00:00Z") });
    await makeNotification(tara, { title: "For Tara" });

    const response = await asRavi.get(NOTIFICATIONS);
    const body = response.body as Envelope<ApiNotification[]>;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
    expect(body.meta).toEqual({ page: 1, pageSize: 25, total: 2 });
    expect(titlesOf(response)).toEqual(["Second", "Follow up with Jane Doe"]);
    expect(body.data[1]).toEqual({
      id: first.id,
      kind: "LEAD_FOLLOW_UP",
      title: "Follow up with Jane Doe",
      body: "Send the price list",
      link: "/leads/abc",
      readAt: null,
      createdAt: first.createdAt.toISOString(),
    });
    expect(body.data[0]).toMatchObject({ body: null, readAt: "2026-02-01T10:00:00.000Z" });
  });

  it.each([
    ["an Admin", () => asAdmin, () => admin],
    ["a Sales Manager", () => asMeera, () => meera],
    ["a Read-only user", () => asViewer, () => viewer],
  ])("shows %s only their own, never another user's", async (_name, agent, user) => {
    await makeNotification(user(), { title: "Mine" });
    await makeNotification(ravi, { title: "For Ravi" });

    const response = await agent().get(NOTIFICATIONS);

    expect(response.status).toBe(200);
    expect(titlesOf(response)).toEqual(["Mine"]);
    expect(countOf(await agent().get(`${NOTIFICATIONS}/unread-count`))).toBe(1);
  });

  it("leaves out the ones already read with unread=true", async () => {
    await makeNotification(ravi, { title: "Read", readAt: new Date() });
    await makeNotification(ravi, { title: "Unread" });

    const unread = await asRavi.get(NOTIFICATIONS).query({ unread: "true" });
    const everything = await asRavi.get(NOTIFICATIONS).query({ unread: "false" });

    expect(titlesOf(unread)).toEqual(["Unread"]);
    expect((unread.body as Envelope<unknown>).meta).toMatchObject({ total: 1 });
    expect(titlesOf(everything)).toEqual(["Unread", "Read"]);
  });

  it("pages the list and counts every match", async () => {
    for (let index = 0; index < 5; index += 1) {
      await makeNotification(ravi, { title: `T${String(index)}` });
    }

    const pages = await Promise.all(
      [1, 2, 3, 4].map((page) => asRavi.get(NOTIFICATIONS).query({ pageSize: 2, page })),
    );

    expect(pages.map((page) => titlesOf(page))).toEqual([["T4", "T3"], ["T2", "T1"], ["T0"], []]);
    expect((pages[2]?.body as Envelope<unknown>).meta).toEqual({ page: 3, pageSize: 2, total: 5 });
  });

  it.each([
    ["page", "0"],
    ["pageSize", "101"],
    ["unread", "maybe"],
  ])("answers VALIDATION_FAILED for a bad %s", async (name, value) => {
    const response = await asRavi.get(NOTIFICATIONS).query({ [name]: value });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([name]);
  });
});

describe("GET /notifications/unread-count", () => {
  it("counts the caller's unread notifications", async () => {
    await makeNotification(ravi);
    await makeNotification(ravi);
    await makeNotification(ravi, { readAt: new Date() });
    await makeNotification(tara);

    const response = await asRavi.get(`${NOTIFICATIONS}/unread-count`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { count: 2 }, meta: {} });
  });

  it("is zero for a user without notifications", async () => {
    expect(countOf(await asViewer.get(`${NOTIFICATIONS}/unread-count`))).toBe(0);
  });
});

describe("POST /notifications/:id/read", () => {
  it("marks the notification as read", async () => {
    const notification = await makeNotification(ravi);
    const before = Date.now();

    const response = await asRavi.post(`${NOTIFICATIONS}/${notification.id}/read`);
    const data = (response.body as Envelope<ApiNotification>).data;

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(data.id).toBe(notification.id);
    expect(new Date(data.readAt ?? 0).getTime()).toBeGreaterThanOrEqual(before);
    expect(countOf(await asRavi.get(`${NOTIFICATIONS}/unread-count`))).toBe(0);
  });

  it("keeps the time a notification was first read", async () => {
    const readAt = new Date("2026-02-01T10:00:00Z");
    const notification = await makeNotification(ravi, { readAt });

    const response = await asRavi.post(`${NOTIFICATIONS}/${notification.id}/read`);

    expect(response.status).toBe(200);
    expect((response.body as Envelope<ApiNotification>).data.readAt).toBe(readAt.toISOString());
    expect((await stored(notification.id)).readAt).toEqual(readAt);
  });

  it("answers NOT_FOUND for another user's notification, whatever the role, and an unknown id", async () => {
    const forRavi = await makeNotification(ravi);

    for (const [agent, id] of [
      [asAdmin, forRavi.id],
      [asMeera, forRavi.id],
      [asViewer, forRavi.id],
      [asRavi, UNKNOWN_ID],
    ] as const) {
      const response = await agent.post(`${NOTIFICATIONS}/${id}/read`);

      expect(response.status).toBe(404);
      expect(errorOf(response)).toEqual({
        code: "NOT_FOUND",
        message: "Notification not found",
        details: null,
      });
    }
    expect((await stored(forRavi.id)).readAt).toBeNull();
  });

  it("lets a Read-only user mark their own as read", async () => {
    const notification = await makeNotification(viewer);

    const response = await asViewer.post(`${NOTIFICATIONS}/${notification.id}/read`);

    expect(response.status).toBe(200);
    expect((await stored(notification.id)).readAt).not.toBeNull();
  });
});

describe("POST /notifications/read-all", () => {
  it("marks every unread notification of the caller, and nobody else's", async () => {
    const readAt = new Date("2026-02-01T10:00:00Z");
    const alreadyRead = await makeNotification(ravi, { readAt });
    await makeNotification(ravi);
    await makeNotification(ravi);
    const forTara = await makeNotification(tara);

    const response = await asRavi.post(`${NOTIFICATIONS}/read-all`);
    const again = await asRavi.post(`${NOTIFICATIONS}/read-all`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { marked: 2 }, meta: {} });
    expect(again.body).toEqual({ data: { marked: 0 }, meta: {} });
    expect(countOf(await asRavi.get(`${NOTIFICATIONS}/unread-count`))).toBe(0);
    expect((await stored(alreadyRead.id)).readAt).toEqual(readAt);
    expect((await stored(forTara.id)).readAt).toBeNull();
  });
});
