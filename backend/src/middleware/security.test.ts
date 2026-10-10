import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  ORIGIN,
  PASSWORD,
  resetDatabase,
  sessionCookie,
} from "../../test/helpers";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";
import { createSession } from "../lib/sessions";

const EVIL_ORIGIN = "http://evil.example";

const app = createTestApp();

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function wrongLogin(target: ReturnType<typeof createApp>, email: string) {
  return request(target).post("/api/v1/auth/login").send({ email, password: "not-the-password" });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("security headers", () => {
  it("sets the helmet baseline on API responses", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["strict-transport-security"]).toContain("max-age=");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("marks API responses, including errors, as never to be stored", async () => {
    const ok = await request(app).get("/api/v1/health");
    const unauthenticated = await request(app).get("/api/v1/auth/me");
    const missing = await request(app).get("/api/v1/no-such-route");

    for (const response of [ok, unauthenticated, missing]) {
      expect(response.headers["cache-control"]).toBe("no-store");
    }
  });

  it("leaves the OpenAPI document cacheable", async () => {
    const response = await request(app).get("/api/v1/openapi.json");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBeUndefined();
  });
});

describe("CORS", () => {
  it("allows a configured origin to send the session cookie", async () => {
    const response = await request(app).get("/api/v1/health").set("Origin", ORIGIN);

    expect(response.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-expose-headers"]).toContain("X-Request-Id");
  });

  it("answers the preflight for a configured origin and gives no permission to any other", async () => {
    const preflight = (origin: string) =>
      request(app)
        .options("/api/v1/auth/login")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "content-type");

    const allowed = await preflight(ORIGIN);
    const blocked = await preflight(EVIL_ORIGIN);

    expect(allowed.status).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(allowed.headers["access-control-max-age"]).toBe("600");
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("never answers with a wildcard origin", async () => {
    const response = await request(app).get("/api/v1/health").set("Origin", EVIL_ORIGIN);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("origin check", () => {
  async function signedIn() {
    const user = await createUser({ name: "Ravi Shah" });
    return { user, cookie: sessionCookie(await createSession(user.id)) };
  }

  it("refuses a state-changing request from another site and changes nothing", async () => {
    const { user, cookie } = await signedIn();

    const response = await request(app)
      .patch("/api/v1/auth/me")
      .set("Cookie", cookie)
      .set("Origin", EVIL_ORIGIN)
      .send({ name: "Changed By Attacker" });

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(
      "Ravi Shah",
    );
  });

  it("refuses a cookie request that carries no Origin at all", async () => {
    const { cookie } = await signedIn();

    const response = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect(await prisma.session.count()).toBe(1);
  });

  it("refuses another site even without a cookie", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", EVIL_ORIGIN)
      .send({ email: "ravi@example.com", password: PASSWORD });

    expect(response.status).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
  });

  it("accepts the web app's origin with the cookie", async () => {
    const { cookie } = await signedIn();

    const response = await request(app)
      .patch("/api/v1/auth/me")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ name: "Ravi K. Shah" });

    expect(response.status).toBe(200);
  });

  it("accepts a Bearer client that sends neither a cookie nor an Origin", async () => {
    const user = await createUser();
    const token = await createSession(user.id);

    const response = await request(app)
      .patch("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "From The Mobile App" });

    expect(response.status).toBe(200);
  });

  it("does not apply to reads", async () => {
    const { cookie } = await signedIn();

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", cookie)
      .set("Origin", EVIL_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("rate limiting on the public auth routes", () => {
  it("refuses with 429 RATE_LIMITED and Retry-After once one address has used its allowance", async () => {
    const limited = createApp({ rateLimit: { ipLimit: 2, emailLimit: 100, windowMs: 60_000 } });

    const first = await wrongLogin(limited, "a@example.com");
    const second = await wrongLogin(limited, "b@example.com");
    const third = await wrongLogin(limited, "c@example.com");
    const details = errorOf(third).details as { retryAfterSeconds: number };

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
    expect(Object.keys(third.body as object)).toEqual(["error"]);
    expect(errorOf(third).code).toBe("RATE_LIMITED");
    expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);
    expect(details.retryAfterSeconds).toBe(Number(third.headers["retry-after"]));
    expect(details.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("limits attempts on one email wherever they come from, without touching other emails", async () => {
    const limited = createApp({ rateLimit: { ipLimit: 100, emailLimit: 2, windowMs: 60_000 } });

    await wrongLogin(limited, "ravi@example.com");
    await wrongLogin(limited, " Ravi@Example.com ");
    const third = await wrongLogin(limited, "RAVI@example.com");
    const other = await wrongLogin(limited, "meera@example.com");

    expect(third.status).toBe(429);
    expect(errorOf(third).code).toBe("RATE_LIMITED");
    expect(other.status).toBe(401);
  });

  it("does not count successful sign-ins", async () => {
    const limited = createApp({ rateLimit: { ipLimit: 2, emailLimit: 2, windowMs: 60_000 } });
    const user = await createUser();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(limited)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: PASSWORD });
      expect(response.status).toBe(200);
    }
  });

  it("limits forgot-password per email", async () => {
    const limited = createApp({ rateLimit: { ipLimit: 100, emailLimit: 2, windowMs: 60_000 } });
    const forgot = (email: string) =>
      request(limited).post("/api/v1/auth/forgot-password").send({ email });

    await forgot("ravi@example.com");
    await forgot("ravi@example.com");
    const third = await forgot("ravi@example.com");

    expect(third.status).toBe(429);
    expect((await forgot("meera@example.com")).status).toBe(200);
  });

  it.each([
    ["setup", { name: "A", email: "a@example.com", password: PASSWORD }],
    ["reset-password", { token: "x", password: PASSWORD }],
    ["invite-info", { token: "x" }],
    ["accept-invite", { token: "x", password: PASSWORD }],
  ])("limits %s per address", async (route, body) => {
    await createUser();
    const limited = createApp({ rateLimit: { ipLimit: 1, windowMs: 60_000 } });
    const call = () => request(limited).post(`/api/v1/auth/${route}`).send(body);

    const first = await call();
    const second = await call();

    expect(first.status).not.toBe(429);
    expect(second.status).toBe(429);
    expect(errorOf(second).code).toBe("RATE_LIMITED");
  });

  it("limits the first-run check with its own, larger allowance", async () => {
    const limited = createApp({ rateLimit: { ipLimit: 1, statusLimit: 2, windowMs: 60_000 } });
    const call = () => request(limited).get("/api/v1/auth/setup-status");

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);
  });

  it("does not limit signed-in routes or other modules", async () => {
    const limited = createApp({ rateLimit: { ipLimit: 1, emailLimit: 1, statusLimit: 1 } });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await request(limited).get("/api/v1/health")).status).toBe(200);
      expect((await request(limited).get("/api/v1/auth/me")).status).toBe(401);
    }
  });
});

describe("request body size", () => {
  it("answers 413 PAYLOAD_TOO_LARGE for a JSON body over 100 kB", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ravi@example.com", password: "x".repeat(101 * 1024) });

    expect(response.status).toBe(413);
    expect(errorOf(response)).toEqual({
      code: "PAYLOAD_TOO_LARGE",
      message: "Request body is too large",
      details: null,
    });
  });

  it("accepts a body under the limit and validates it as usual", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ravi@example.com", password: "x".repeat(50 * 1024) });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
  });
});
