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

interface Operation {
  responses: Record<string, ResponseObject>;
  security?: Record<string, string[]>[];
}

interface OpenApiDocument {
  openapi: string;
  paths: Record<
    string,
    Partial<Record<"get" | "post" | "patch" | "put" | "delete", Operation>> & { get: Operation }
  >;
  components: {
    schemas: Record<string, { enum?: string[]; additionalProperties?: boolean }>;
    securitySchemes: Record<string, unknown>;
  };
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

  it("describes every auth, users, record, pipeline, timeline and activity route", () => {
    const paths = generated().paths;
    const operations = Object.entries(paths).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method} ${path}`),
    );

    expect(operations.sort()).toEqual([
      "delete /companies/{id}",
      "delete /contacts/{id}",
      "delete /leads/{id}",
      "delete /opportunities/{id}",
      "delete /pipeline-stages/{id}",
      "get /activity",
      "get /activity/authors",
      "get /auth/me",
      "get /auth/setup-status",
      "get /companies",
      "get /companies/industries",
      "get /companies/{id}",
      "get /companies/{id}/timeline",
      "get /contacts",
      "get /contacts/{id}",
      "get /contacts/{id}/timeline",
      "get /health",
      "get /leads",
      "get /leads/{id}",
      "get /leads/{id}/timeline",
      "get /opportunities",
      "get /opportunities/board",
      "get /opportunities/{id}",
      "get /opportunities/{id}/timeline",
      "get /pipeline-stages",
      "get /users",
      "get /users/assignable",
      "patch /auth/me",
      "patch /companies/{id}",
      "patch /contacts/{id}",
      "patch /leads/{id}",
      "patch /opportunities/{id}",
      "patch /pipeline-stages/{id}",
      "patch /users/{id}",
      "post /auth/accept-invite",
      "post /auth/change-password",
      "post /auth/forgot-password",
      "post /auth/invite-info",
      "post /auth/login",
      "post /auth/logout",
      "post /auth/reset-password",
      "post /auth/setup",
      "post /companies",
      "post /companies/{id}/assign",
      "post /companies/{id}/conversations",
      "post /companies/{id}/notes",
      "post /contacts",
      "post /contacts/{id}/assign",
      "post /contacts/{id}/conversations",
      "post /contacts/{id}/notes",
      "post /leads",
      "post /leads/{id}/assign",
      "post /leads/{id}/conversations",
      "post /leads/{id}/convert",
      "post /leads/{id}/mark-lost",
      "post /leads/{id}/notes",
      "post /opportunities",
      "post /opportunities/{id}/assign",
      "post /opportunities/{id}/close",
      "post /opportunities/{id}/conversations",
      "post /opportunities/{id}/notes",
      "post /opportunities/{id}/reopen",
      "post /opportunities/{id}/stage",
      "post /pipeline-stages",
      "post /users",
      "post /users/{id}/deactivate",
      "post /users/{id}/password-reset-link",
      "post /users/{id}/reactivate",
      "post /users/{id}/resend-invite",
      "put /pipeline-stages/order",
    ]);
  });

  it("marks signed-in routes with the session security schemes and public ones without", () => {
    const { paths, components } = generated();
    const session = [{ sessionCookie: [] }, { bearerToken: [] }];

    expect(Object.keys(components.securitySchemes).sort()).toEqual([
      "bearerToken",
      "sessionCookie",
    ]);
    expect(paths["/auth/me"]?.get.security).toEqual(session);
    expect(paths["/users"]?.get.security).toEqual(session);
    expect(paths["/users/{id}"]?.patch?.security).toEqual(session);
    expect(paths["/leads"]?.get.security).toEqual(session);
    expect(paths["/leads/{id}"]?.delete?.security).toEqual(session);
    expect(paths["/users/assignable"]?.get.security).toEqual(session);
    expect(paths["/leads/{id}/timeline"]?.get.security).toEqual(session);
    expect(paths["/leads/{id}/conversations"]?.post?.security).toEqual(session);
    expect(paths["/leads/{id}/notes"]?.post?.security).toEqual(session);
    expect(paths["/activity"]?.get.security).toEqual(session);
    expect(paths["/activity/authors"]?.get.security).toEqual(session);
    expect(paths["/pipeline-stages"]?.get.security).toEqual(session);
    expect(paths["/pipeline-stages/order"]?.put?.security).toEqual(session);
    expect(paths["/opportunities/board"]?.get.security).toEqual(session);
    expect(paths["/opportunities/{id}/close"]?.post?.security).toEqual(session);
    expect(paths["/leads/{id}/convert"]?.post?.security).toEqual(session);
    expect(paths["/auth/login"]?.post?.security).toBeUndefined();
    expect(paths["/health"]?.get.security).toBeUndefined();
  });

  it("names the shared types and makes every request body strict", () => {
    const schemas = generated().components.schemas;
    const bodies = Object.keys(schemas).filter((name) => name.endsWith("Body"));

    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(["Me", "User", "Role", "UserStatus", "LinkResult"]),
    );
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(["Lead", "LeadStatus", "LeadSource", "LostReason", "ListMeta"]),
    );
    expect(schemas.LeadStatus?.enum).toEqual([
      "NEW",
      "CONTACTED",
      "QUALIFIED",
      "CONVERTED",
      "LOST",
    ]);
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(["TimelineEntry", "ActivityEntry", "ActivityMeta", "ActivitySummary"]),
    );
    expect(schemas.TimelineKind?.enum).toEqual([
      "CONVERSATION",
      "NOTE",
      "CREATED",
      "STATUS_CHANGE",
      "ASSIGNMENT",
    ]);
    expect(schemas.TimelineKindFilter?.enum).toEqual([
      ...(schemas.TimelineKind?.enum ?? []),
      "SYSTEM",
    ]);
    expect(schemas.ConversationType?.enum).toEqual(["CALL", "MEETING", "EMAIL", "MESSAGE"]);
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(["Opportunity", "PipelineStage", "PipelineBoardColumn", "StageKind"]),
    );
    expect(schemas.StageKind?.enum).toEqual(["OPEN", "WON", "LOST"]);
    expect(schemas.OpenLeadStatus?.enum).toEqual(["NEW", "CONTACTED", "QUALIFIED"]);
    expect(schemas.Role?.enum).toEqual(["ADMIN", "SALES_MANAGER", "SALES_REP", "READ_ONLY"]);
    expect(schemas.UserStatus?.enum).toEqual(["ACTIVE", "INVITED", "DEACTIVATED"]);
    expect(bodies.length).toBeGreaterThanOrEqual(27);
    for (const name of bodies) {
      expect(schemas[name]?.additionalProperties, name).toBe(false);
    }
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
