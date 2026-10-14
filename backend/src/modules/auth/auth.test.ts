import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureMail,
  cookieFrom,
  createTestApp,
  createUser,
  type ErrorEnvelope,
  linkFromMail,
  ORIGIN,
  PASSWORD,
  resetDatabase,
  sessionCookie,
  sessionSetCookie,
  signInAs,
  tokenFromLink,
  type ValidationDetail,
} from "../../../test/helpers";
import { createAccountLink } from "../../lib/account-links";
import { prisma } from "../../lib/prisma";
import { createSession } from "../../lib/sessions";
import { hashToken } from "../../lib/tokens";

interface MeEnvelope {
  data: { id: string; name: string; email: string; role: string };
  meta: Record<string, unknown>;
}

const NEW_PASSWORD = "walnut-lantern-88-river";
const COMMON_PASSWORD = "qwertyuiop";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const app = createTestApp();

function login(email: string, password = PASSWORD) {
  return request(app).post("/api/v1/auth/login").send({ email, password });
}

function me(cookie: string) {
  return request(app).get("/api/v1/auth/me").set("Cookie", cookie);
}

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("first-run setup", () => {
  const admin = { name: "Asha Rao", email: "asha@example.com", password: PASSWORD };

  it("says setup is required only while no user exists", async () => {
    const before = await request(app).get("/api/v1/auth/setup-status");
    await createUser();
    const after = await request(app).get("/api/v1/auth/setup-status");

    expect(before.status).toBe(200);
    expect(before.body).toEqual({ data: { setupRequired: true }, meta: {} });
    expect(after.body).toEqual({ data: { setupRequired: false }, meta: {} });
  });

  it("creates the Admin, signs them in and closes setup", async () => {
    const response = await request(app).post("/api/v1/auth/setup").send(admin);
    const body = response.body as MeEnvelope;

    expect(response.status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
    expect(body.data).toEqual({
      id: expect.any(String) as string,
      name: "Asha Rao",
      email: "asha@example.com",
      role: "ADMIN",
    });

    const signedIn = await me(cookieFrom(response));
    expect(signedIn.status).toBe(200);
    expect((signedIn.body as MeEnvelope).data.email).toBe("asha@example.com");

    const again = await request(app)
      .post("/api/v1/auth/setup")
      .send({ ...admin, email: "second@example.com" });
    expect(again.status).toBe(409);
    expect(errorOf(again).code).toBe("SETUP_CLOSED");
    expect(await prisma.user.count()).toBe(1);
  });

  it("creates exactly one Admin when several first visitors submit at once", async () => {
    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        request(app)
          .post("/api/v1/auth/setup")
          .send({ ...admin, email: `visitor${String(n)}@example.com` }),
      ),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.user.count()).toBe(1);
  });

  it("applies the password rule", async () => {
    const short = await request(app)
      .post("/api/v1/auth/setup")
      .send({ ...admin, password: "too-short" });
    const common = await request(app)
      .post("/api/v1/auth/setup")
      .send({ ...admin, password: COMMON_PASSWORD });

    for (const response of [short, common]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["password"]);
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it("refuses unknown keys, so the role cannot be chosen", async () => {
    const response = await request(app)
      .post("/api/v1/auth/setup")
      .send({ ...admin, role: "READ_ONLY" });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
  });
});

describe("login", () => {
  it("signs in and sets an httpOnly, SameSite=Lax session cookie for 30 days", async () => {
    const user = await createUser({ name: "Ravi Shah", email: "ravi@example.com" });

    const response = await login("ravi@example.com");
    const cookie = sessionSetCookie(response) ?? "";

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { id: user.id, name: "Ravi Shah", email: "ravi@example.com", role: "SALES_REP" },
      meta: {},
    });
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${String(THIRTY_DAYS_MS / 1000)}`);
    expect(cookie).not.toContain("Domain=");
  });

  it("stores only a hash of the session token and never returns the token in the body", async () => {
    const user = await createUser();

    const response = await login(user.email);
    const token = cookieFrom(response).split("=")[1] ?? "";
    const sessions = await prisma.session.findMany({ where: { userId: user.id } });

    expect(response.text).not.toContain(token);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toBe(hashToken(token));
    expect(sessions[0]?.tokenHash).not.toBe(token);
  });

  it("ignores letter case and surrounding spaces in the email", async () => {
    await createUser({ email: "ravi@example.com" });

    const response = await login("  Ravi@Example.COM ");

    expect(response.status).toBe(200);
  });

  it("answers a wrong email and a wrong password identically", async () => {
    await createUser({ email: "ravi@example.com" });

    const wrongEmail = await login("nobody@example.com");
    const wrongPassword = await login("ravi@example.com", "not-the-password");

    expect(wrongEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(wrongEmail.body).toEqual(wrongPassword.body);
    expect(errorOf(wrongEmail)).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "Email or password is incorrect",
      details: null,
    });
    expect(sessionSetCookie(wrongPassword)).toBeUndefined();
  });

  it("treats an invited user without a password like an unknown email", async () => {
    await createUser({ email: "invited@example.com", invited: true });

    const response = await login("invited@example.com");

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe("INVALID_CREDENTIALS");
  });

  it("tells a deactivated user so only after the correct password", async () => {
    await createUser({ email: "gone@example.com", isActive: false });

    const wrong = await login("gone@example.com", "not-the-password");
    const right = await login("gone@example.com");

    expect(errorOf(wrong).code).toBe("INVALID_CREDENTIALS");
    expect(right.status).toBe(403);
    expect(errorOf(right).code).toBe("ACCOUNT_DEACTIVATED");
    expect(sessionSetCookie(right)).toBeUndefined();
  });

  it("gives each sign-in its own session, so several devices work at once", async () => {
    const user = await createUser();

    const first = cookieFrom(await login(user.email));
    const second = cookieFrom(await login(user.email));

    expect(first).not.toBe(second);
    expect((await me(first)).status).toBe(200);
    expect((await me(second)).status).toBe(200);
  });

  it("requires both fields", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response).sort()).toEqual(["email", "password"]);
  });
});

describe("login lock after repeated wrong passwords", () => {
  async function failTimes(email: string, times: number) {
    for (let attempt = 0; attempt < times; attempt += 1) {
      const response = await login(email, "not-the-password");
      expect(errorOf(response).code).toBe("INVALID_CREDENTIALS");
    }
  }

  it("locks the account for 15 minutes after 10 wrong passwords, even for the right one", async () => {
    const user = await createUser();

    await failTimes(user.email, 10);
    const locked = await login(user.email);
    const details = errorOf(locked).details as { retryAfterSeconds: number };

    expect(locked.status).toBe(423);
    expect(errorOf(locked).code).toBe("ACCOUNT_LOCKED");
    expect(details.retryAfterSeconds).toBeGreaterThan(14 * 60);
    expect(details.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it("does not lock after 9 wrong passwords, and a success clears the count", async () => {
    const user = await createUser();

    await failTimes(user.email, 9);
    const success = await login(user.email);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(success.status).toBe(200);
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it("neither counts attempts nor extends the lock while locked", async () => {
    const user = await createUser();
    await failTimes(user.email, 10);
    const lockedAt = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    await login(user.email, "not-the-password");
    await login(user.email, "not-the-password");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(after.lockedUntil).toEqual(lockedAt.lockedUntil);
    expect(after.failedLoginCount).toBe(0);
  });

  it("clears on its own: after the lock runs out the right password signs in", async () => {
    const user = await createUser();
    await failTimes(user.email, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    const response = await login(user.email);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(response.status).toBe(200);
    expect(after.lockedUntil).toBeNull();
  });

  it("starts a fresh count after the lock runs out, so one wrong guess does not lock again", async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 9, lockedUntil: new Date(Date.now() - 1000) },
    });

    const wrong = await login(user.email, "not-the-password");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(errorOf(wrong).code).toBe("INVALID_CREDENTIALS");
    expect(after.failedLoginCount).toBe(1);
    expect(after.lockedUntil).toBeNull();
    expect((await login(user.email)).status).toBe(200);
  });
});

describe("session", () => {
  it("answers UNAUTHENTICATED without a session, or with one that does not exist", async () => {
    const none = await request(app).get("/api/v1/auth/me");
    const unknown = await me(sessionCookie("no-such-token"));

    for (const response of [none, unknown]) {
      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe("UNAUTHENTICATED");
    }
  });

  it("accepts the same token as an Authorization: Bearer header", async () => {
    const user = await createUser();
    const token = await createSession(user.id);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect((response.body as MeEnvelope).data.id).toBe(user.id);
  });

  it("ends on logout: the cookie is cleared and the token stops working at once", async () => {
    const user = await createUser();
    const cookie = cookieFrom(await login(user.email));
    const otherDevice = cookieFrom(await login(user.email));

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect(sessionSetCookie(response)).toContain("Expires=Thu, 01 Jan 1970");
    expect((await me(cookie)).status).toBe(401);
    expect((await me(otherDevice)).status).toBe(200);
  });

  it("refuses a session that has expired", async () => {
    const user = await createUser();
    const token = await createSession(user.id);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await me(sessionCookie(token));

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe("UNAUTHENTICATED");
  });

  it("refuses the session of a user who has been deactivated", async () => {
    const user = await createUser();
    const token = await createSession(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const response = await me(sessionCookie(token));

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe("UNAUTHENTICATED");
  });

  it("slides the expiry forward when the session is used after more than an hour", async () => {
    const user = await createUser();
    const token = await createSession(user.id);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { lastUsedAt: twoHoursAgo, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const response = await me(sessionCookie(token));
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    const remaining = session.expiresAt.getTime() - Date.now();

    expect(response.status).toBe(200);
    expect(sessionSetCookie(response)).toContain(`Max-Age=${String(THIRTY_DAYS_MS / 1000)}`);
    expect(remaining).toBeGreaterThan(THIRTY_DAYS_MS - 60 * 1000);
    expect(session.lastUsedAt.getTime()).toBeGreaterThan(twoHoursAgo.getTime());
  });

  it("does not write to the session or resend the cookie on every request", async () => {
    const user = await createUser();
    const token = await createSession(user.id);
    const before = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });

    const response = await me(sessionCookie(token));
    const after = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });

    expect(response.status).toBe(200);
    expect(sessionSetCookie(response)).toBeUndefined();
    expect(after.expiresAt).toEqual(before.expiresAt);
  });

  it("removes the user's expired sessions when they sign in again", async () => {
    const user = await createUser();
    await createSession(user.id);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await login(user.email);

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe("token sign-in for a client without cookies", () => {
  interface TokenEnvelope {
    data: { user: MeEnvelope["data"]; token: string; expiresAt: string };
    meta: Record<string, unknown>;
  }

  function signInForToken(email: string, password = PASSWORD) {
    return request(app).post("/api/v1/auth/token").send({ email, password });
  }

  async function tokenFor(email: string): Promise<string> {
    return ((await signInForToken(email)).body as TokenEnvelope).data.token;
  }

  function meWithToken(token: string) {
    return request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
  }

  it("answers the user, a working token and its expiry, and sets no cookie at all", async () => {
    const user = await createUser({ name: "Ravi Shah", email: "ravi@example.com" });

    const response = await signInForToken(" Ravi@Example.com ");
    const body = response.body as TokenEnvelope;
    const remaining = new Date(body.data.expiresAt).getTime() - Date.now();

    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual(["data", "meta"]);
    expect(Object.keys(body.data).sort()).toEqual(["expiresAt", "token", "user"]);
    expect(body.data.user).toEqual({
      id: user.id,
      name: "Ravi Shah",
      email: "ravi@example.com",
      role: "SALES_REP",
    });
    expect(remaining).toBeGreaterThan(THIRTY_DAYS_MS - 60 * 1000);
    expect(remaining).toBeLessThanOrEqual(THIRTY_DAYS_MS);
    // Never as a cookie: this response must not be able to sign a browser in.
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect((await meWithToken(body.data.token)).status).toBe(200);
  });

  it("stores only a hash of the token", async () => {
    const user = await createUser();

    const token = await tokenFor(user.email);
    const sessions = await prisma.session.findMany({ where: { userId: user.id } });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toBe(hashToken(token));
  });

  it("answers a wrong email and a wrong password exactly like login", async () => {
    const user = await createUser();

    const wrongEmail = await signInForToken("nobody@example.com");
    const wrongPassword = await signInForToken(user.email, "not-the-password");
    const viaLogin = await login(user.email, "not-the-password");

    expect(wrongEmail.status).toBe(401);
    expect(wrongEmail.body).toEqual(wrongPassword.body);
    expect(wrongPassword.body).toEqual(viaLogin.body);
    expect(errorOf(wrongPassword).code).toBe("INVALID_CREDENTIALS");
    expect(wrongPassword.text).not.toContain("token");
  });

  it("tells a deactivated user so only after the correct password, without a token", async () => {
    await createUser({ email: "gone@example.com", isActive: false });

    const wrong = await signInForToken("gone@example.com", "not-the-password");
    const right = await signInForToken("gone@example.com");

    expect(errorOf(wrong).code).toBe("INVALID_CREDENTIALS");
    expect(right.status).toBe(403);
    expect(errorOf(right).code).toBe("ACCOUNT_DEACTIVATED");
    expect(Object.keys(right.body as object)).toEqual(["error"]);
    expect(await prisma.session.count()).toBe(0);
  });

  it("shares the lock with login: wrong passwords on either route count together", async () => {
    const user = await createUser();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await signInForToken(user.email, "not-the-password")).status).toBe(401);
      expect((await login(user.email, "not-the-password")).status).toBe(401);
    }
    const locked = await signInForToken(user.email);
    const details = errorOf(locked).details as { retryAfterSeconds: number };

    expect(locked.status).toBe(423);
    expect(errorOf(locked).code).toBe("ACCOUNT_LOCKED");
    expect(details.retryAfterSeconds).toBeGreaterThan(14 * 60);
    expect((await login(user.email)).status).toBe(423);
    expect(await prisma.session.count()).toBe(0);
  });

  it("requires both fields and refuses unknown keys", async () => {
    const missing = await request(app).post("/api/v1/auth/token").send({ email: "not-an-email" });
    const extra = await request(app)
      .post("/api/v1/auth/token")
      .send({ email: "ravi@example.com", password: PASSWORD, role: "ADMIN" });

    expect(missing.status).toBe(400);
    expect(detailPaths(missing).sort()).toEqual(["email", "password"]);
    expect(extra.status).toBe(400);
    expect(errorOf(extra).code).toBe("VALIDATION_FAILED");
  });

  it("ends on logout with the Bearer token, and only that session", async () => {
    const user = await createUser();
    const token = await tokenFor(user.email);
    const other = await tokenFor(user.email);

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);
    const after = await meWithToken(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect(after.status).toBe(401);
    expect(errorOf(after).code).toBe("UNAUTHENTICATED");
    expect((await meWithToken(other)).status).toBe(200);
  });

  it("slides the expiry forward for a Bearer session, without sending a cookie", async () => {
    const user = await createUser();
    const token = await tokenFor(user.email);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: {
        lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const response = await meWithToken(token);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(THIRTY_DAYS_MS - 60 * 1000);
  });

  it("refuses an expired Bearer session and one of a deactivated user", async () => {
    const user = await createUser();
    const token = await tokenFor(user.email);

    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await meWithToken(token);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const deactivated = await meWithToken(token);

    expect(errorOf(expired).code).toBe("UNAUTHENTICATED");
    expect(errorOf(deactivated).code).toBe("UNAUTHENTICATED");
  });
});

describe("password reset", () => {
  function forgot(email: string) {
    return request(app).post("/api/v1/auth/forgot-password").send({ email });
  }

  function reset(token: string, password = NEW_PASSWORD) {
    return request(app).post("/api/v1/auth/reset-password").send({ token, password });
  }

  it("answers the same whether or not the email has an account, and emails only a real one", async () => {
    const mail = captureMail();
    const user = await createUser({ name: "Ravi Shah", email: "ravi@example.com" });

    const unknown = await forgot("nobody@example.com");
    expect(mail).toHaveLength(0);
    const known = await forgot("Ravi@Example.com");

    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ data: null, meta: {} });
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(mail).toHaveLength(1);
    expect(mail[0]?.to).toBe(user.email);
    expect(linkFromMail(mail[0])).toMatch(
      /^http:\/\/localhost:3000\/reset-password\?token=[\w-]{43}$/,
    );
  });

  it("builds the link from APP_URL, not from the Host header of the request", async () => {
    const mail = captureMail();
    const user = await createUser();

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .set("Host", "evil.example")
      .send({ email: user.email });

    expect(linkFromMail(mail[0])).toMatch(/^http:\/\/localhost:3000\//);
  });

  it("sends nothing to a deactivated user or to one who has not accepted their invite", async () => {
    const mail = captureMail();
    const deactivated = await createUser({ isActive: false });
    const invited = await createUser({ invited: true });

    const responses = [await forgot(deactivated.email), await forgot(invited.email)];

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(mail).toHaveLength(0);
    expect(await prisma.authToken.count()).toBe(0);
  });

  it("sets the new password, ends every session and clears a lock", async () => {
    const mail = captureMail();
    const user = await createUser();
    const oldSession = cookieFrom(await login(user.email));
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 3, lockedUntil: new Date(Date.now() + 10 * 60 * 1000) },
    });
    await forgot(user.email);

    const response = await reset(tokenFromLink(linkFromMail(mail[0])));
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect(sessionSetCookie(response)).toBeUndefined();
    expect((await me(oldSession)).status).toBe(401);
    expect(after.lockedUntil).toBeNull();
    expect(after.failedLoginCount).toBe(0);
    expect(errorOf(await login(user.email)).code).toBe("INVALID_CREDENTIALS");
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
  });

  it("works once: a used link is INVALID_TOKEN", async () => {
    const user = await createUser();
    const token = tokenFromLink(await createAccountLink(user.id, "PASSWORD_RESET"));

    const first = await reset(token);
    const second = await reset(token, "another-fine-password-7");

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(errorOf(second).code).toBe("INVALID_TOKEN");
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
  });

  it("lets only one of two simultaneous requests redeem a link", async () => {
    const user = await createUser();
    const token = tokenFromLink(await createAccountLink(user.id, "PASSWORD_RESET"));

    const responses = await Promise.all([reset(token), reset(token, "another-fine-password-7")]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
  });

  it("lasts one hour", async () => {
    const user = await createUser();
    const token = tokenFromLink(await createAccountLink(user.id, "PASSWORD_RESET"));
    const row = await prisma.authToken.findFirstOrThrow({ where: { userId: user.id } });
    const lifetime = row.expiresAt.getTime() - row.createdAt.getTime();
    expect(Math.abs(lifetime - 60 * 60 * 1000)).toBeLessThan(5000);

    await prisma.authToken.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await reset(token);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("INVALID_TOKEN");
    expect((await login(user.email)).status).toBe(200);
  });

  it("cancels the earlier link when a new one is requested", async () => {
    const mail = captureMail();
    const user = await createUser();
    await forgot(user.email);
    await forgot(user.email);
    const [first, second] = mail.map((message) => tokenFromLink(linkFromMail(message)));

    expect(errorOf(await reset(first ?? "")).code).toBe("INVALID_TOKEN");
    expect((await reset(second ?? "")).status).toBe(200);
  });

  it("refuses an unknown token, an invite token, and a link of a deactivated user", async () => {
    const user = await createUser();
    const inviteToken = tokenFromLink(await createAccountLink(user.id, "INVITE"));
    const resetToken = tokenFromLink(await createAccountLink(user.id, "PASSWORD_RESET"));

    const unknown = await reset("no-such-token");
    const wrongKind = await reset(inviteToken);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const deactivated = await reset(resetToken);

    for (const response of [unknown, wrongKind, deactivated]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("INVALID_TOKEN");
    }
  });

  it("applies the password rule and leaves the link usable after a refusal", async () => {
    const user = await createUser();
    const token = tokenFromLink(await createAccountLink(user.id, "PASSWORD_RESET"));

    const short = await reset(token, "too-short");
    const common = await reset(token, COMMON_PASSWORD);

    for (const response of [short, common]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["password"]);
    }
    expect((await reset(token)).status).toBe(200);
  });

  it("stores only a hash of the link token", async () => {
    const user = await createUser();
    const token = tokenFromLink(await createAccountLink(user.id, "PASSWORD_RESET"));
    const row = await prisma.authToken.findFirstOrThrow({ where: { userId: user.id } });

    expect(row.tokenHash).toBe(hashToken(token));
  });
});

describe("accepting an invite", () => {
  function inviteInfo(token: string) {
    return request(app).post("/api/v1/auth/invite-info").send({ token });
  }

  function accept(token: string, password = NEW_PASSWORD) {
    return request(app).post("/api/v1/auth/accept-invite").send({ token, password });
  }

  async function invited() {
    const user = await createUser({
      name: "Meera Iyer",
      email: "meera@example.com",
      role: "SALES_MANAGER",
      invited: true,
    });
    return { user, token: tokenFromLink(await createAccountLink(user.id, "INVITE")) };
  }

  it("tells the invite page who the link is for", async () => {
    const { token } = await invited();

    const response = await inviteInfo(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { name: "Meera Iyer", email: "meera@example.com", role: "SALES_MANAGER" },
      meta: {},
    });
  });

  it("sets the password, signs the user in and uses the link up", async () => {
    const { user, token } = await invited();

    const response = await accept(token);

    expect(response.status).toBe(200);
    expect((response.body as MeEnvelope).data).toEqual({
      id: user.id,
      name: "Meera Iyer",
      email: "meera@example.com",
      role: "SALES_MANAGER",
    });
    expect((await me(cookieFrom(response))).status).toBe(200);
    expect((await login("meera@example.com", NEW_PASSWORD)).status).toBe(200);

    expect(errorOf(await accept(token)).code).toBe("INVALID_TOKEN");
    expect(errorOf(await inviteInfo(token)).code).toBe("INVALID_TOKEN");
  });

  it("lasts seven days", async () => {
    const { user, token } = await invited();
    const row = await prisma.authToken.findFirstOrThrow({ where: { userId: user.id } });
    const lifetime = row.expiresAt.getTime() - row.createdAt.getTime();
    expect(Math.abs(lifetime - 7 * 24 * 60 * 60 * 1000)).toBeLessThan(5000);

    await prisma.authToken.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    for (const response of [await inviteInfo(token), await accept(token)]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("INVALID_TOKEN");
    }
  });

  it("refuses an unknown token, a reset token, and the invite of a deactivated user", async () => {
    const { user, token } = await invited();
    const other = await createUser();
    const resetToken = tokenFromLink(await createAccountLink(other.id, "PASSWORD_RESET"));

    const unknown = await accept("no-such-token");
    const wrongKind = await accept(resetToken);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const deactivated = await accept(token);

    for (const response of [unknown, wrongKind, deactivated]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("INVALID_TOKEN");
    }
  });

  it("applies the password rule", async () => {
    const { token } = await invited();

    const short = await accept(token, "too-short");
    const common = await accept(token, COMMON_PASSWORD);

    for (const response of [short, common]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["password"]);
    }
    expect((await accept(token)).status).toBe(200);
  });
});

describe("profile", () => {
  it("returns the signed-in user", async () => {
    const user = await createUser({ name: "Ravi Shah", role: "READ_ONLY" });
    const agent = await signInAs(app, user);

    const response = await agent.get("/api/v1/auth/me");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { id: user.id, name: "Ravi Shah", email: user.email, role: "READ_ONLY" },
      meta: {},
    });
  });

  it("lets a user change their own name", async () => {
    const user = await createUser({ name: "Ravi Shah" });
    const agent = await signInAs(app, user);

    const response = await agent.patch("/api/v1/auth/me").send({ name: "  Ravi K. Shah " });

    expect(response.status).toBe(200);
    expect((response.body as MeEnvelope).data.name).toBe("Ravi K. Shah");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(
      "Ravi K. Shah",
    );
  });

  it.each([
    ["role", { name: "Ravi", role: "ADMIN" }],
    ["email", { name: "Ravi", email: "other@example.com" }],
    ["managerId", { name: "Ravi", managerId: null }],
  ])("refuses any other key (%s) and changes nothing", async (_key, body) => {
    const user = await createUser({ name: "Ravi Shah" });
    const agent = await signInAs(app, user);

    const response = await agent.patch("/api/v1/auth/me").send(body);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(after.name).toBe("Ravi Shah");
    expect(after.role).toBe("SALES_REP");
    expect(after.email).toBe(user.email);
  });

  it("refuses an empty name and one with control characters", async () => {
    const agent = await signInAs(app, await createUser());

    for (const name of ["   ", "Ravi\r\nBcc: x@example.com"]) {
      const response = await agent.patch("/api/v1/auth/me").send({ name });
      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["name"]);
    }
  });

  it("requires a session for every profile route", async () => {
    const responses = [
      await request(app).get("/api/v1/auth/me"),
      await request(app).patch("/api/v1/auth/me").send({ name: "Ravi" }),
      await request(app)
        .post("/api/v1/auth/change-password")
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
      await request(app).post("/api/v1/auth/logout"),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe("UNAUTHENTICATED");
    }
  });
});

describe("change password", () => {
  it("keeps this session, ends the user's others, and the new password works", async () => {
    const user = await createUser();
    const other = await createUser();
    const thisDevice = cookieFrom(await login(user.email));
    const otherDevice = cookieFrom(await login(user.email));
    const someoneElse = cookieFrom(await login(other.email));

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Cookie", thisDevice)
      .set("Origin", ORIGIN)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect((await me(thisDevice)).status).toBe(200);
    expect((await me(otherDevice)).status).toBe(401);
    expect((await me(someoneElse)).status).toBe(200);
    expect(errorOf(await login(user.email)).code).toBe("INVALID_CREDENTIALS");
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
  });

  it("reports a wrong current password on that field, not as a 401", async () => {
    const user = await createUser();
    const agent = await signInAs(app, user);

    const response = await agent
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: "not-the-password", newPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual(["currentPassword"]);
    expect((await login(user.email)).status).toBe(200);
  });

  it("applies the password rule to the new password", async () => {
    const user = await createUser();
    const agent = await signInAs(app, user);

    const short = await agent
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: PASSWORD, newPassword: "too-short" });
    const common = await agent
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: PASSWORD, newPassword: COMMON_PASSWORD });

    for (const response of [short, common]) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual(["newPassword"]);
    }
    expect((await login(user.email)).status).toBe(200);
  });
});
