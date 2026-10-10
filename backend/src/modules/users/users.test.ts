import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureMail,
  createTestApp,
  createUser,
  type ErrorEnvelope,
  linkFromMail,
  PASSWORD,
  resetDatabase,
  sessionCookie,
  signInAs,
  tokenFromLink,
  type ValidationDetail,
} from "../../../test/helpers";
import type { User } from "../../generated/prisma/client";
import * as mailer from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { createSession } from "../../lib/sessions";

interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  managerId: string | null;
  manager: { id: string; name: string; status: string } | null;
  createdAt: string;
}

interface LinkResult {
  emailed: boolean;
  link: string | null;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";

const app = createTestApp();

let admin: User;
let asAdmin: Awaited<ReturnType<typeof signInAs>>;

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

function userOf(response: request.Response): ApiUser {
  return (response.body as Envelope<ApiUser>).data;
}

function linkOf(response: request.Response): LinkResult {
  return (response.body as Envelope<LinkResult>).data;
}

function login(email: string, password = PASSWORD) {
  return request(app).post("/api/v1/auth/login").send({ email, password });
}

function invite(body: Record<string, unknown>) {
  return asAdmin.post("/api/v1/users").send(body);
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser({ name: "Asha Admin", email: "admin@example.com", role: "ADMIN" });
  asAdmin = await signInAs(app, admin);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("access", () => {
  const routes = [
    ["get", "/api/v1/users"],
    ["post", "/api/v1/users"],
    ["patch", `/api/v1/users/${UNKNOWN_ID}`],
    ["post", `/api/v1/users/${UNKNOWN_ID}/deactivate`],
    ["post", `/api/v1/users/${UNKNOWN_ID}/reactivate`],
    ["post", `/api/v1/users/${UNKNOWN_ID}/resend-invite`],
    ["post", `/api/v1/users/${UNKNOWN_ID}/password-reset-link`],
  ] as const;

  it("answers UNAUTHENTICATED on every route without a session", async () => {
    for (const [method, path] of routes) {
      const response = await request(app)[method](path);
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(errorOf(response).code).toBe("UNAUTHENTICATED");
    }
  });

  it.each(["SALES_MANAGER", "SALES_REP", "READ_ONLY"] as const)(
    "answers FORBIDDEN on every route for a %s",
    async (role) => {
      const agent = await signInAs(app, await createUser({ role }));

      for (const [method, path] of routes) {
        const response = await agent[method](path);
        expect(response.status, `${method} ${path}`).toBe(403);
        expect(errorOf(response).code).toBe("FORBIDDEN");
      }
      expect(await prisma.user.count()).toBe(2);
    },
  );
});

describe("assignable users", () => {
  interface AssignableUser {
    id: string;
    name: string;
    role: string;
  }

  // Meera manages Ravi and Ina (invited); Omar manages Tara. Asha Admin is made in beforeEach.
  async function makeTeams() {
    const meera = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
    const omar = await createUser({ name: "Omar Manager", role: "SALES_MANAGER" });
    const ravi = await createUser({ name: "Ravi Rep", managerId: meera.id });
    await createUser({ name: "Ina Invited", managerId: meera.id, invited: true });
    await createUser({ name: "Dev Deactivated", managerId: meera.id, isActive: false });
    await createUser({ name: "Tara Rep", managerId: omar.id });
    const viewer = await createUser({ name: "Vik Viewer", role: "READ_ONLY" });
    return { meera, ravi, viewer };
  }

  async function assignableFor(user: User) {
    const agent = await signInAs(app, user);
    const response = await agent.get("/api/v1/users/assignable");
    return { response, users: (response.body as Envelope<AssignableUser[]>).data };
  }

  it("gives an Admin every active user who can own a record, by name", async () => {
    await makeTeams();

    const { response, users } = await assignableFor(admin);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object).sort()).toEqual(["data", "meta"]);
    expect(users.map((user) => user.name)).toEqual([
      "Asha Admin",
      "Ina Invited",
      "Meera Manager",
      "Omar Manager",
      "Ravi Rep",
      "Tara Rep",
    ]);
    expect(users[0]).toEqual({ id: admin.id, name: "Asha Admin", role: "ADMIN" });
  });

  it("gives a Sales Manager themselves and their active reps", async () => {
    const { meera } = await makeTeams();

    const { response, users } = await assignableFor(meera);

    expect(response.status).toBe(200);
    expect(users.map((user) => user.name)).toEqual(["Ina Invited", "Meera Manager", "Ravi Rep"]);
  });

  it("gives a Sales Rep only themselves", async () => {
    const { ravi } = await makeTeams();

    const { response, users } = await assignableFor(ravi);

    expect(response.status).toBe(200);
    expect(users).toEqual([{ id: ravi.id, name: "Ravi Rep", role: "SALES_REP" }]);
  });

  it("gives a Read-only user an empty list", async () => {
    const { viewer } = await makeTeams();

    const { response, users } = await assignableFor(viewer);

    expect(response.status).toBe(200);
    expect(users).toEqual([]);
  });

  it("answers UNAUTHENTICATED without a session", async () => {
    const response = await request(app).get("/api/v1/users/assignable");

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe("UNAUTHENTICATED");
  });
});

describe("list", () => {
  it("returns every user with a derived status and their manager", async () => {
    const manager = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
    await createUser({ name: "Ravi Rep", role: "SALES_REP", managerId: manager.id });
    await createUser({ name: "Ira Invited", role: "READ_ONLY", invited: true });
    await createUser({ name: "Dev Deactivated", isActive: false });

    const response = await asAdmin.get("/api/v1/users");
    const body = response.body as Envelope<ApiUser[]>;
    const byName = new Map(body.data.map((user) => [user.name, user]));

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
    expect(body.data.map((user) => user.name)).toEqual([
      "Asha Admin",
      "Dev Deactivated",
      "Ira Invited",
      "Meera Manager",
      "Ravi Rep",
    ]);
    expect(byName.get("Asha Admin")).toEqual({
      id: admin.id,
      name: "Asha Admin",
      email: "admin@example.com",
      role: "ADMIN",
      status: "ACTIVE",
      managerId: null,
      manager: null,
      createdAt: admin.createdAt.toISOString(),
    });
    expect(byName.get("Ira Invited")?.status).toBe("INVITED");
    expect(byName.get("Dev Deactivated")?.status).toBe("DEACTIVATED");
    expect(byName.get("Ravi Rep")?.managerId).toBe(manager.id);
    expect(byName.get("Ravi Rep")?.manager).toEqual({
      id: manager.id,
      name: "Meera Manager",
      status: "ACTIVE",
    });
  });

  it("never exposes password hashes or lock state", async () => {
    const response = await asAdmin.get("/api/v1/users");

    expect(response.text).not.toContain("argon2");
    expect(response.text).not.toContain("passwordHash");
    expect(response.text).not.toContain("failedLoginCount");
  });

  it("says in meta whether outgoing email is on", async () => {
    const off = await asAdmin.get("/api/v1/users");
    captureMail();
    const on = await asAdmin.get("/api/v1/users");

    expect((off.body as Envelope<ApiUser[]>).meta).toEqual({ mailEnabled: false });
    expect((on.body as Envelope<ApiUser[]>).meta).toEqual({ mailEnabled: true });
  });
});

describe("invite", () => {
  const newUser = { name: "Ravi Shah", email: "Ravi@Example.com", role: "SALES_REP" };

  it("creates an invited user and, with email off, hands the Admin the link", async () => {
    const response = await invite(newUser);
    const body = response.body as Envelope<{ user: ApiUser; invite: LinkResult }>;

    expect(response.status).toBe(201);
    expect(body.data.user).toMatchObject({
      name: "Ravi Shah",
      email: "ravi@example.com",
      role: "SALES_REP",
      status: "INVITED",
      managerId: null,
      manager: null,
    });
    expect(body.data.invite.emailed).toBe(false);
    expect(body.data.invite.link).toMatch(
      /^http:\/\/localhost:3000\/accept-invite\?token=[\w-]{43}$/,
    );

    const info = await request(app)
      .post("/api/v1/auth/invite-info")
      .send({ token: tokenFromLink(body.data.invite.link ?? "") });
    expect(info.status).toBe(200);
  });

  it("emails the link when email is on and does not show it to the Admin", async () => {
    const mail = captureMail();

    const response = await invite(newUser);
    const body = response.body as Envelope<{ user: ApiUser; invite: LinkResult }>;

    expect(response.status).toBe(201);
    expect(body.data.invite).toEqual({ emailed: true, link: null });
    expect(mail).toHaveLength(1);
    expect(mail[0]?.to).toBe("ravi@example.com");
    expect(linkFromMail(mail[0])).toContain("/accept-invite?token=");
    expect(response.text).not.toContain("token=");
  });

  it("still succeeds and hands over the link when sending the email fails", async () => {
    vi.spyOn(mailer, "isMailConfigured").mockReturnValue(true);
    vi.spyOn(mailer, "sendMail").mockResolvedValue(false);

    const response = await invite(newUser);
    const body = response.body as Envelope<{ user: ApiUser; invite: LinkResult }>;

    expect(response.status).toBe(201);
    expect(body.data.invite.emailed).toBe(false);
    expect(body.data.invite.link).toContain("/accept-invite?token=");
  });

  it("refuses an email that is already used, whatever its letter case", async () => {
    const response = await invite({ ...newUser, email: "ADMIN@example.com" });

    expect(response.status).toBe(409);
    expect(errorOf(response).code).toBe("EMAIL_IN_USE");
    expect(await prisma.user.count()).toBe(1);
  });

  it("creates one user when the same invite is submitted twice at once", async () => {
    const responses = await Promise.all([invite(newUser), invite(newUser)]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count({ where: { email: "ravi@example.com" } })).toBe(1);
  });

  it("accepts exactly the four roles", async () => {
    const roles = ["ADMIN", "SALES_MANAGER", "SALES_REP", "READ_ONLY"];
    for (const [index, role] of roles.entries()) {
      const response = await invite({ ...newUser, email: `u${String(index)}@example.com`, role });
      expect(response.status).toBe(201);
      expect((response.body as Envelope<{ user: ApiUser }>).data.user.role).toBe(role);
    }

    const invalid = await invite({ ...newUser, email: "x@example.com", role: "OWNER" });
    const missing = await invite({ name: "No Role", email: "y@example.com" });

    for (const response of [invalid, missing]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["role"]);
    }
  });

  it("validates the name, the email and unknown keys", async () => {
    const response = await invite({ name: "", email: "not-an-email", role: "SALES_REP" });
    const extra = await invite({ ...newUser, isActive: false });

    expect(response.status).toBe(400);
    expect(detailPaths(response).sort()).toEqual(["email", "name"]);
    expect(extra.status).toBe(400);
    expect(errorOf(extra).code).toBe("VALIDATION_FAILED");
  });
});

describe("manager", () => {
  it("assigns a Sales Rep to an active Sales Manager", async () => {
    const manager = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });

    const response = await invite({
      name: "Ravi Rep",
      email: "ravi@example.com",
      role: "SALES_REP",
      managerId: manager.id,
    });

    expect(response.status).toBe(201);
    expect((response.body as Envelope<{ user: ApiUser }>).data.user.manager).toEqual({
      id: manager.id,
      name: "Meera Manager",
      status: "ACTIVE",
    });
  });

  it.each(["ADMIN", "SALES_MANAGER", "READ_ONLY"])(
    "refuses a manager on a user whose role is %s",
    async (role) => {
      const manager = await createUser({ role: "SALES_MANAGER" });

      const response = await invite({
        name: "Someone",
        email: "someone@example.com",
        role,
        managerId: manager.id,
      });

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["managerId"]);
    },
  );

  it("refuses a manager who is not a Sales Manager, is deactivated, or does not exist", async () => {
    const rep = await createUser({ role: "SALES_REP" });
    const deactivated = await createUser({ role: "SALES_MANAGER", isActive: false });
    const target = await createUser({ role: "SALES_REP" });

    for (const managerId of [rep.id, deactivated.id, admin.id, UNKNOWN_ID]) {
      const response = await asAdmin.patch(`/api/v1/users/${target.id}`).send({ managerId });
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["managerId"]);
    }
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).managerId,
    ).toBeNull();
  });

  it("changes and removes a rep's manager", async () => {
    const first = await createUser({ role: "SALES_MANAGER" });
    const second = await createUser({ role: "SALES_MANAGER" });
    const rep = await createUser({ role: "SALES_REP", managerId: first.id });

    const moved = await asAdmin.patch(`/api/v1/users/${rep.id}`).send({ managerId: second.id });
    const removed = await asAdmin.patch(`/api/v1/users/${rep.id}`).send({ managerId: null });

    expect(userOf(moved).managerId).toBe(second.id);
    expect(userOf(removed).managerId).toBeNull();
    expect(userOf(removed).manager).toBeNull();
  });

  it("removes the manager when the user stops being a Sales Rep", async () => {
    const manager = await createUser({ role: "SALES_MANAGER" });
    const rep = await createUser({ role: "SALES_REP", managerId: manager.id });

    const response = await asAdmin.patch(`/api/v1/users/${rep.id}`).send({ role: "READ_ONLY" });

    expect(response.status).toBe(200);
    expect(userOf(response).role).toBe("READ_ONLY");
    expect(userOf(response).managerId).toBeNull();
  });

  it("unassigns the team when a Sales Manager changes role, and reports how many", async () => {
    const manager = await createUser({ role: "SALES_MANAGER" });
    const other = await createUser({ role: "SALES_MANAGER" });
    const repA = await createUser({ role: "SALES_REP", managerId: manager.id });
    const repB = await createUser({ role: "SALES_REP", managerId: manager.id });
    const untouched = await createUser({ role: "SALES_REP", managerId: other.id });

    const response = await asAdmin.patch(`/api/v1/users/${manager.id}`).send({ role: "SALES_REP" });
    const after = await prisma.user.findMany({
      where: { id: { in: [repA.id, repB.id, untouched.id] } },
    });

    expect(response.status).toBe(200);
    expect((response.body as Envelope<ApiUser>).meta).toEqual({ reassignedReports: 2 });
    expect(after.find((user) => user.id === repA.id)?.managerId).toBeNull();
    expect(after.find((user) => user.id === repB.id)?.managerId).toBeNull();
    expect(after.find((user) => user.id === untouched.id)?.managerId).toBe(other.id);
  });

  it("keeps the team of a deactivated manager, and restores it on reactivation", async () => {
    const manager = await createUser({ name: "Meera Manager", role: "SALES_MANAGER" });
    const rep = await createUser({ name: "Ravi Rep", role: "SALES_REP", managerId: manager.id });

    await asAdmin.post(`/api/v1/users/${manager.id}/deactivate`);
    const list = await asAdmin.get("/api/v1/users");
    const listedRep = (list.body as Envelope<ApiUser[]>).data.find((user) => user.id === rep.id);
    const reactivated = await asAdmin.post(`/api/v1/users/${manager.id}/reactivate`);

    expect(listedRep?.manager).toEqual({
      id: manager.id,
      name: "Meera Manager",
      status: "DEACTIVATED",
    });
    expect(userOf(reactivated).status).toBe("ACTIVE");
    expect(userOf(reactivated).role).toBe("SALES_MANAGER");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: rep.id } })).managerId).toBe(
      manager.id,
    );
  });
});

describe("edit", () => {
  it("changes name, email and role, and reports no reassigned reps", async () => {
    const user = await createUser({ name: "Ravi", email: "ravi@example.com" });

    const response = await asAdmin
      .patch(`/api/v1/users/${user.id}`)
      .send({ name: " Ravi Shah ", email: "Ravi.Shah@Example.com", role: "SALES_MANAGER" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: user.id,
        name: "Ravi Shah",
        email: "ravi.shah@example.com",
        role: "SALES_MANAGER",
        status: "ACTIVE",
        managerId: null,
        manager: null,
        createdAt: user.createdAt.toISOString(),
      },
      meta: { reassignedReports: 0 },
    });
  });

  it("changes only the keys that are sent", async () => {
    const manager = await createUser({ role: "SALES_MANAGER" });
    const rep = await createUser({ name: "Ravi", role: "SALES_REP", managerId: manager.id });

    const response = await asAdmin.patch(`/api/v1/users/${rep.id}`).send({ name: "Ravi Shah" });

    expect(userOf(response)).toMatchObject({
      name: "Ravi Shah",
      email: rep.email,
      role: "SALES_REP",
      managerId: manager.id,
    });
  });

  it("refuses an email another user has", async () => {
    const user = await createUser();

    const response = await asAdmin
      .patch(`/api/v1/users/${user.id}`)
      .send({ email: "admin@example.com" });

    expect(response.status).toBe(409);
    expect(errorOf(response).code).toBe("EMAIL_IN_USE");
  });

  it("keeps an active user signed in when their email changes", async () => {
    const user = await createUser();
    const token = await createSession(user.id);

    await asAdmin.patch(`/api/v1/users/${user.id}`).send({ email: "new@example.com" });
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", sessionCookie(token));

    expect(me.status).toBe(200);
    expect((await login("new@example.com")).status).toBe(200);
  });

  it("cancels the invite link when an invited user's email changes", async () => {
    const invited = await invite({ name: "Ira", email: "ira@example.com", role: "READ_ONLY" });
    const { user, invite: link } = (invited.body as Envelope<{ user: ApiUser; invite: LinkResult }>)
      .data;

    await asAdmin.patch(`/api/v1/users/${user.id}`).send({ email: "ira.new@example.com" });
    const info = await request(app)
      .post("/api/v1/auth/invite-info")
      .send({ token: tokenFromLink(link.link ?? "") });

    expect(errorOf(info).code).toBe("INVALID_TOKEN");
  });

  it("answers NOT_FOUND for an unknown user and VALIDATION_FAILED for a malformed id", async () => {
    const unknown = await asAdmin.patch(`/api/v1/users/${UNKNOWN_ID}`).send({ name: "Nobody" });
    const malformed = await asAdmin.patch("/api/v1/users/not-a-uuid").send({ name: "Nobody" });

    expect(unknown.status).toBe(404);
    expect(errorOf(unknown).code).toBe("NOT_FOUND");
    expect(malformed.status).toBe(400);
    expect(detailPaths(malformed)).toEqual(["id"]);
  });

  it("refuses unknown keys, so status and password cannot be set here", async () => {
    const user = await createUser();

    for (const body of [{ isActive: false }, { passwordHash: "x" }, { status: "DEACTIVATED" }]) {
      const response = await asAdmin.patch(`/api/v1/users/${user.id}`).send(body);
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("last admin and role changes", () => {
  it("refuses to move the only Admin to another role", async () => {
    const response = await asAdmin.patch(`/api/v1/users/${admin.id}`).send({ role: "SALES_REP" });

    expect(response.status).toBe(409);
    expect(errorOf(response).code).toBe("LAST_ADMIN");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe("ADMIN");
  });

  it("does not count an invited or a deactivated Admin as one who can sign in", async () => {
    await createUser({ role: "ADMIN", invited: true });
    await createUser({ role: "ADMIN", isActive: false });

    const response = await asAdmin.patch(`/api/v1/users/${admin.id}`).send({ role: "READ_ONLY" });

    expect(response.status).toBe(409);
    expect(errorOf(response).code).toBe("LAST_ADMIN");
  });

  it("lets an Admin change role once another Admin can sign in", async () => {
    await createUser({ role: "ADMIN" });

    const response = await asAdmin.patch(`/api/v1/users/${admin.id}`).send({ role: "READ_ONLY" });

    expect(response.status).toBe(200);
    expect(userOf(response).role).toBe("READ_ONLY");
    // The change takes effect at once: they are no longer allowed here.
    expect((await asAdmin.get("/api/v1/users")).status).toBe(403);
  });

  it("lets the only Admin demote an Admin who cannot sign in", async () => {
    const invited = await createUser({ role: "ADMIN", invited: true });

    const response = await asAdmin.patch(`/api/v1/users/${invited.id}`).send({ role: "SALES_REP" });

    expect(response.status).toBe(200);
  });

  it("refuses an Admin deactivating their own account", async () => {
    await createUser({ role: "ADMIN" });

    const response = await asAdmin.post(`/api/v1/users/${admin.id}/deactivate`);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).isActive).toBe(true);
  });

  it("keeps one Admin when two Admins deactivate each other at the same moment", async () => {
    const second = await createUser({ role: "ADMIN" });
    const asSecond = await signInAs(app, second);

    const responses = await Promise.all([
      asAdmin.post(`/api/v1/users/${second.id}/deactivate`),
      asSecond.post(`/api/v1/users/${admin.id}/deactivate`),
    ]);
    const statuses = responses.map((response) => response.status);
    const refused = responses.find((response) => response.status !== 200);

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    // The loser is refused by the last-admin rule, or finds its session already ended.
    expect(["LAST_ADMIN", "UNAUTHENTICATED"]).toContain(refused ? errorOf(refused).code : "");
    expect(await prisma.user.count({ where: { role: "ADMIN", isActive: true } })).toBe(1);
  });

  it("keeps one Admin when two Admins give up the role at the same moment", async () => {
    const second = await createUser({ role: "ADMIN" });
    const asSecond = await signInAs(app, second);

    const responses = await Promise.all([
      asAdmin.patch(`/api/v1/users/${admin.id}`).send({ role: "READ_ONLY" }),
      asSecond.patch(`/api/v1/users/${second.id}`).send({ role: "READ_ONLY" }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
  });
});

describe("deactivate and reactivate", () => {
  it("ends the user's sessions at once and blocks sign-in and password reset", async () => {
    const mail = captureMail();
    const user = await createUser();
    const token = await createSession(user.id);

    const response = await asAdmin.post(`/api/v1/users/${user.id}/deactivate`);
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", sessionCookie(token));
    const signIn = await login(user.email);
    await request(app).post("/api/v1/auth/forgot-password").send({ email: user.email });

    expect(response.status).toBe(200);
    expect(userOf(response).status).toBe("DEACTIVATED");
    expect(me.status).toBe(401);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(errorOf(signIn).code).toBe("ACCOUNT_DEACTIVATED");
    expect(mail).toHaveLength(0);
  });

  it("keeps the account, and deactivating twice changes nothing", async () => {
    const user = await createUser();

    await asAdmin.post(`/api/v1/users/${user.id}/deactivate`);
    const again = await asAdmin.post(`/api/v1/users/${user.id}/deactivate`);

    expect(again.status).toBe(200);
    expect(userOf(again).status).toBe("DEACTIVATED");
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
  });

  it("restores access with the same role and manager", async () => {
    const manager = await createUser({ role: "SALES_MANAGER" });
    const rep = await createUser({ role: "SALES_REP", managerId: manager.id });
    await asAdmin.post(`/api/v1/users/${rep.id}/deactivate`);

    const response = await asAdmin.post(`/api/v1/users/${rep.id}/reactivate`);

    expect(response.status).toBe(200);
    expect(userOf(response)).toMatchObject({
      status: "ACTIVE",
      role: "SALES_REP",
      managerId: manager.id,
    });
    expect((await login(rep.email)).status).toBe(200);
  });

  it("returns a user who never accepted their invite to Invited", async () => {
    const invited = await createUser({ invited: true });
    await asAdmin.post(`/api/v1/users/${invited.id}/deactivate`);

    const response = await asAdmin.post(`/api/v1/users/${invited.id}/reactivate`);

    expect(userOf(response).status).toBe("INVITED");
  });

  it("answers NOT_FOUND for an unknown user and VALIDATION_FAILED for a malformed id", async () => {
    for (const action of ["deactivate", "reactivate", "resend-invite", "password-reset-link"]) {
      const unknown = await asAdmin.post(`/api/v1/users/${UNKNOWN_ID}/${action}`);
      const malformed = await asAdmin.post(`/api/v1/users/not-a-uuid/${action}`);

      expect(unknown.status, action).toBe(404);
      expect(errorOf(unknown).code).toBe("NOT_FOUND");
      expect(malformed.status, action).toBe(400);
      expect(detailPaths(malformed)).toEqual(["id"]);
    }
  });
});

describe("resend invite", () => {
  function inviteInfo(link: string | null) {
    return request(app)
      .post("/api/v1/auth/invite-info")
      .send({ token: tokenFromLink(link ?? "") });
  }

  it("makes a new link and cancels the earlier one", async () => {
    const invited = await invite({ name: "Ira", email: "ira@example.com", role: "READ_ONLY" });
    const { user, invite: first } = (
      invited.body as Envelope<{ user: ApiUser; invite: LinkResult }>
    ).data;

    const response = await asAdmin.post(`/api/v1/users/${user.id}/resend-invite`);
    const second = linkOf(response);

    expect(response.status).toBe(200);
    expect(second.emailed).toBe(false);
    expect(second.link).not.toBe(first.link);
    expect(errorOf(await inviteInfo(first.link)).code).toBe("INVALID_TOKEN");
    expect((await inviteInfo(second.link)).status).toBe(200);
  });

  it("emails the new link when email is on", async () => {
    const user = await createUser({ email: "ira@example.com", invited: true });
    const mail = captureMail();

    const response = await asAdmin.post(`/api/v1/users/${user.id}/resend-invite`);

    expect(response.body).toEqual({ data: { emailed: true, link: null }, meta: {} });
    expect(mail[0]?.to).toBe("ira@example.com");
    expect((await inviteInfo(linkFromMail(mail[0]))).status).toBe(200);
  });

  it("is refused for a user who already has a password or is deactivated", async () => {
    const active = await createUser();
    const deactivated = await createUser({ invited: true, isActive: false });

    for (const user of [active, deactivated]) {
      const response = await asAdmin.post(`/api/v1/users/${user.id}/resend-invite`);
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    }
    expect(await prisma.authToken.count()).toBe(0);
  });
});

describe("password reset link", () => {
  it("hands the Admin a working reset link when email is off", async () => {
    const user = await createUser();

    const response = await asAdmin.post(`/api/v1/users/${user.id}/password-reset-link`);
    const result = linkOf(response);
    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: tokenFromLink(result.link ?? ""), password: "walnut-lantern-88-river" });

    expect(response.status).toBe(200);
    expect(result.emailed).toBe(false);
    expect(result.link).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=[\w-]{43}$/);
    expect(reset.status).toBe(200);
    expect((await login(user.email, "walnut-lantern-88-river")).status).toBe(200);
  });

  it("emails the link when email is on and does not show it", async () => {
    const user = await createUser();
    const mail = captureMail();

    const response = await asAdmin.post(`/api/v1/users/${user.id}/password-reset-link`);

    expect(response.body).toEqual({ data: { emailed: true, link: null }, meta: {} });
    expect(mail[0]?.to).toBe(user.email);
    expect(linkFromMail(mail[0])).toContain("/reset-password?token=");
  });

  it("is refused for a user who is invited or deactivated", async () => {
    const invited = await createUser({ invited: true });
    const deactivated = await createUser({ isActive: false });

    for (const user of [invited, deactivated]) {
      const response = await asAdmin.post(`/api/v1/users/${user.id}/password-reset-link`);
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    }
    expect(await prisma.authToken.count()).toBe(0);
  });
});
