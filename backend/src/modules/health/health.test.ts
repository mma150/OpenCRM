import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app";
import { prisma } from "../../lib/prisma";

interface HealthEnvelope {
  data: {
    status: string;
    database: { connected: boolean; serverTime: string };
  };
  meta: Record<string, unknown>;
}

// Must match test.env.CORS_ORIGINS in vitest.config.ts.
const allowedOrigin = "http://localhost:3000";
const blockedOrigin = "http://evil.example";

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/v1/health", () => {
  it("returns the data/meta envelope with the database status", async () => {
    const response = await request(app).get("/api/v1/health");
    const body = response.body as HealthEnvelope;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
    expect(body.data.status).toBe("ok");
    expect(body.data.database.connected).toBe(true);

    const serverTime = new Date(body.data.database.serverTime);
    expect(Number.isNaN(serverTime.getTime())).toBe(false);
    expect(serverTime.toISOString()).toBe(body.data.database.serverTime);
  });

  it("allows a request from a configured origin", async () => {
    const response = await request(app).get("/api/v1/health").set("Origin", allowedOrigin);

    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
  });

  it("sends no allow-origin header to an origin that is not configured", async () => {
    const response = await request(app).get("/api/v1/health").set("Origin", blockedOrigin);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
