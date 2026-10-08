import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../lib/app-error";
import { createHttpLogger } from "../lib/logger";
import { errorHandler } from "./error-handler";
import { notFound } from "./not-found";

interface ErrorBody {
  error: { code: string; message: string; details: unknown };
}

interface ValidationDetail {
  path: string;
  message: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const leakedText = "secret internal detail at /srv/app/lead.service.ts";

// A tiny app with the same pieces createApp uses, plus routes that fail on purpose.
// The validating route uses the same schema.parse call a real controller would.
const leadInput = z.object({ name: z.string().min(1), age: z.number().int() });

function buildTestApp(httpLogger = createHttpLogger()) {
  const app = express();
  app.use(httpLogger);
  app.use(express.json());

  app.post("/test/validate", (req, res) => {
    const input = leadInput.parse(req.body);
    res.json({ data: input, meta: {} });
  });
  app.get("/test/app-error", () => {
    throw new AppError("NOT_FOUND", 404, "Lead not found", { id: "42" });
  });
  app.get("/test/boom", () => {
    throw new Error(leakedText);
  });
  app.get("/test/ok", (_req, res) => {
    res.json({ data: { ok: true }, meta: {} });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const app = buildTestApp();

describe("error codes", () => {
  it("lists exactly the four Phase 1 codes", () => {
    expect([...ERROR_CODES].sort()).toEqual([
      "INTERNAL_ERROR",
      "NOT_FOUND",
      "SERVICE_UNAVAILABLE",
      "VALIDATION_FAILED",
    ]);
  });
});

describe("not found", () => {
  it("answers an unknown path with 404 NOT_FOUND in the error envelope", async () => {
    const response = await request(app).get("/api/v1/nope");
    const body = response.body as ErrorBody;

    expect(response.status).toBe(404);
    expect(response.type).toBe("application/json");
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("validation", () => {
  it("maps a ZodError from a controller parse to 400 VALIDATION_FAILED with field details", async () => {
    const response = await request(app).post("/test/validate").send({ name: "", age: "x" });
    const body = response.body as ErrorBody;
    const details = body.error.details as ValidationDetail[];

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(details.map((detail) => detail.path).sort()).toEqual(["age", "name"]);
    for (const detail of details) {
      expect(Object.keys(detail).sort()).toEqual(["message", "path"]);
      expect(detail.message.length).toBeGreaterThan(0);
    }
  });

  it("accepts valid input", async () => {
    const response = await request(app).post("/test/validate").send({ name: "Asha", age: 30 });

    expect(response.status).toBe(200);
  });

  it("maps a malformed JSON body to 400 VALIDATION_FAILED", async () => {
    const response = await request(app)
      .post("/test/validate")
      .set("Content-Type", "application/json")
      .send('{"name": "Asha",');
    const body = response.body as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("error mapping", () => {
  it("uses the status and code of an AppError", async () => {
    const response = await request(app).get("/test/app-error");
    const body = response.body as ErrorBody;

    expect(response.status).toBe(404);
    expect(body.error).toEqual({
      code: "NOT_FOUND",
      message: "Lead not found",
      details: { id: "42" },
    });
  });

  it("maps any other error to 500 INTERNAL_ERROR without a stack or the original text", async () => {
    const response = await request(app).get("/test/boom");
    const body = response.body as ErrorBody;
    const text = response.text;

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Internal server error");
    expect(text).not.toContain(leakedText);
    expect(text).not.toContain("lead.service");
    expect(text).not.toContain("at ");
    expect(text).not.toContain("stack");
  });

  it("gives every error body exactly the keys code, message and details under error", async () => {
    const responses = [
      await request(app).get("/api/v1/nope"),
      await request(app).post("/test/validate").send({}),
      await request(app).get("/test/app-error"),
      await request(app).get("/test/boom"),
    ];

    for (const response of responses) {
      const body = response.body as Record<string, unknown>;
      expect(Object.keys(body)).toEqual(["error"]);
      expect(Object.keys(body.error as object).sort()).toEqual(["code", "details", "message"]);
    }
  });
});

describe("request id", () => {
  it("sets X-Request-Id on success and error responses", async () => {
    const success = await request(app).get("/test/ok");
    const failure = await request(app).get("/test/boom");

    expect(success.headers["x-request-id"]).toMatch(uuidPattern);
    expect(failure.headers["x-request-id"]).toMatch(uuidPattern);
  });

  it("echoes a well-formed inbound id", async () => {
    const response = await request(app).get("/test/ok").set("X-Request-Id", "req-abc_123.XYZ");

    expect(response.headers["x-request-id"]).toBe("req-abc_123.XYZ");
  });

  it.each([
    ["too short", "abc"],
    ["too long", "a".repeat(65)],
    ["bad characters", "has spaces and <tags>"],
  ])("replaces a malformed inbound id (%s)", async (_label, inbound) => {
    const response = await request(app).get("/test/ok").set("X-Request-Id", inbound);

    expect(response.headers["x-request-id"]).not.toBe(inbound);
    expect(response.headers["x-request-id"]).toMatch(uuidPattern);
  });

  it("gives parallel requests different ids and keeps a failure to its own request", async () => {
    const [first, second, failing] = await Promise.all([
      request(app).get("/test/ok"),
      request(app).get("/test/ok"),
      request(app).get("/test/boom"),
    ]);

    expect(first.headers["x-request-id"]).not.toBe(second.headers["x-request-id"]);
    expect(failing.headers["x-request-id"]).not.toBe(first.headers["x-request-id"]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(failing.status).toBe(500);
  });
});

describe("request logging", () => {
  function captureLogs() {
    const lines: string[] = [];
    const stream = {
      write(chunk: string) {
        lines.push(chunk);
      },
    };
    return { lines, app: buildTestApp(createHttpLogger({ destination: stream, level: "info" })) };
  }

  function parse(lines: string[]) {
    return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  it("writes one JSON line per request that carries the same id as the response header", async () => {
    const { lines, app: loggedApp } = captureLogs();

    const response = await request(loggedApp).get("/test/ok");
    await expect.poll(() => lines.length).toBe(1);

    const entry = parse(lines)[0];
    const requestRecord = entry?.req as { id: string } | undefined;
    expect(requestRecord?.id).toBe(response.headers["x-request-id"]);
  });

  it("logs a failed request once, with the full error only in the log", async () => {
    const { lines, app: loggedApp } = captureLogs();

    const response = await request(loggedApp).get("/test/boom");
    await expect.poll(() => lines.length).toBe(1);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(leakedText);
    expect(response.text).not.toContain(leakedText);
  });

  it("redacts authorization and cookie headers and does not log request bodies", async () => {
    const { lines, app: loggedApp } = captureLogs();

    await request(loggedApp)
      .post("/test/validate")
      .set("Authorization", "Bearer super-secret-token")
      .set("Cookie", "session=super-secret-cookie")
      .send({ name: "Asha", age: 30, note: "body-marker-value" });
    await expect.poll(() => lines.length).toBe(1);

    const line = lines[0] ?? "";
    expect(line).not.toContain("super-secret-token");
    expect(line).not.toContain("super-secret-cookie");
    expect(line).not.toContain("body-marker-value");
  });
});
