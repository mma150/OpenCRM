import { readFileSync } from "node:fs";

import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { ERROR_CODES } from "./app-error";
import { buildOpenApiDocument } from "./openapi";
import { prisma } from "./prisma";

interface ResponseObject {
  content: { "application/json": { schema: Record<string, unknown> } };
}

interface OpenApiDocument {
  openapi: string;
  paths: Record<string, { get: { responses: Record<string, ResponseObject> } }>;
  components: { schemas: Record<string, { enum?: string[] }> };
}

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

// buildOpenApiDocument() reads what the route files registered when createApp imported them.
function generated() {
  return buildOpenApiDocument() as unknown as OpenApiDocument;
}

describe("GET /api/v1/openapi.json", () => {
  it("returns an OpenAPI 3.1.0 document with the /health path", async () => {
    const response = await request(app).get("/api/v1/openapi.json");
    const body = response.body as OpenApiDocument;

    expect(response.status).toBe(200);
    expect(response.type).toBe("application/json");
    expect(body.openapi).toBe("3.1.0");
    expect(Object.keys(body.paths)).toContain("/health");
  });

  it("serves the same document the generator builds", async () => {
    const response = await request(app).get("/api/v1/openapi.json");

    expect(response.body).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));
  });
});

describe("OpenAPI document content", () => {
  it("describes /health with the success envelope on 200 and ErrorResponse on 503", () => {
    const responses = generated().paths["/health"]?.get.responses;
    const ok = responses?.["200"]?.content["application/json"].schema as {
      properties: { data: { $ref: string }; meta: unknown };
    };
    const unavailable = responses?.["503"]?.content["application/json"].schema;

    expect(ok.properties.data.$ref).toBe("#/components/schemas/Health");
    expect(ok.properties.meta).toBeDefined();
    expect(unavailable).toEqual({ $ref: "#/components/schemas/ErrorResponse" });
  });

  it("has the Health, ErrorResponse and ErrorCode components", () => {
    const schemas = generated().components.schemas;

    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(["Health", "ErrorResponse", "ErrorCode"]),
    );
  });

  it("requires code, message and details on every error", () => {
    const errorSchema = generated().components.schemas.ErrorResponse as unknown as {
      properties: { error: { required: string[] } };
    };

    expect(errorSchema.properties.error.required.sort()).toEqual(["code", "details", "message"]);
  });

  it("lists exactly the codes in ERROR_CODES in the ErrorCode component", () => {
    expect(generated().components.schemas.ErrorCode?.enum).toEqual([...ERROR_CODES]);
  });
});

describe("committed backend/openapi/openapi.json", () => {
  const committed = readFileSync(new URL("../../openapi/openapi.json", import.meta.url), "utf8");

  it("matches the document the code generates (drift check)", () => {
    expect(JSON.parse(committed)).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));
  });

  it("is byte-identical to the generator output formatting", () => {
    expect(committed).toBe(`${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
  });

  it("serialises to identical text every time", () => {
    expect(JSON.stringify(buildOpenApiDocument())).toBe(JSON.stringify(buildOpenApiDocument()));
  });
});
