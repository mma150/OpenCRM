import { readFileSync } from "node:fs";

import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { ERROR_CODES } from "./app-error";
import { buildOpenApiDocument } from "./openapi";
import { prisma } from "./prisma";

interface ResponseObject {
  content: {
    "application/json": { schema: Record<string, unknown> };
    "text/csv"?: { schema: Record<string, unknown> };
  };
  headers?: Record<string, unknown>;
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

  it("describes every route", () => {
    const paths = generated().paths;
    const operations = Object.entries(paths).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method} ${path}`),
    );

    expect(operations.sort()).toEqual([
      "delete /companies/{id}",
      "delete /contacts/{id}",
      "delete /custom-fields/{id}",
      "delete /email-templates/{id}",
      "delete /leads/{id}",
      "delete /opportunities/{id}",
      "delete /pipeline-stages/{id}",
      "delete /products/{id}",
      "delete /quotes/{id}",
      "delete /settings/email",
      "delete /tasks/{id}",
      "get /activity",
      "get /activity/authors",
      "get /auth/me",
      "get /auth/setup-status",
      "get /companies",
      "get /companies/export",
      "get /companies/industries",
      "get /companies/{id}",
      "get /companies/{id}/timeline",
      "get /contacts",
      "get /contacts/export",
      "get /contacts/{id}",
      "get /contacts/{id}/timeline",
      "get /custom-fields",
      "get /dashboard/me",
      "get /dashboard/team",
      "get /email-templates",
      "get /email-templates/placeholders",
      "get /email-templates/{id}",
      "get /emails/defaults",
      "get /health",
      "get /imports/fields",
      "get /invoices",
      "get /invoices/export",
      "get /invoices/summary",
      "get /invoices/{id}",
      "get /invoices/{id}/document",
      "get /leads",
      "get /leads/export",
      "get /leads/{id}",
      "get /leads/{id}/timeline",
      "get /notifications",
      "get /notifications/unread-count",
      "get /opportunities",
      "get /opportunities/board",
      "get /opportunities/export",
      "get /opportunities/{id}",
      "get /opportunities/{id}/timeline",
      "get /pipeline-stages",
      "get /products",
      "get /products/{id}",
      "get /quotes",
      "get /quotes/export",
      "get /quotes/{id}",
      "get /quotes/{id}/document",
      "get /settings/email",
      "get /settings/email/status",
      "get /settings/organization",
      "get /tasks",
      "get /tasks/export",
      "get /tasks/summary",
      "get /tasks/{id}",
      "get /users",
      "get /users/assignable",
      "patch /auth/me",
      "patch /companies/{id}",
      "patch /contacts/{id}",
      "patch /custom-fields/{id}",
      "patch /email-templates/{id}",
      "patch /invoices/{id}",
      "patch /leads/{id}",
      "patch /opportunities/{id}",
      "patch /pipeline-stages/{id}",
      "patch /products/{id}",
      "patch /quotes/{id}",
      "patch /tasks/{id}",
      "patch /users/{id}",
      "post /auth/accept-invite",
      "post /auth/change-password",
      "post /auth/forgot-password",
      "post /auth/invite-info",
      "post /auth/login",
      "post /auth/logout",
      "post /auth/reset-password",
      "post /auth/setup",
      "post /auth/token",
      "post /companies",
      "post /companies/{id}/assign",
      "post /companies/{id}/conversations",
      "post /companies/{id}/notes",
      "post /contacts",
      "post /contacts/{id}/assign",
      "post /contacts/{id}/conversations",
      "post /contacts/{id}/notes",
      "post /custom-fields",
      "post /custom-fields/{id}/archive",
      "post /custom-fields/{id}/restore",
      "post /email-templates",
      "post /emails",
      "post /emails/preview",
      "post /imports",
      "post /imports/preview",
      "post /invoices/{id}/mark-overdue",
      "post /invoices/{id}/mark-paid",
      "post /invoices/{id}/mark-sent",
      "post /invoices/{id}/mark-unpaid",
      "post /invoices/{id}/restore",
      "post /invoices/{id}/void",
      "post /leads",
      "post /leads/{id}/assign",
      "post /leads/{id}/conversations",
      "post /leads/{id}/convert",
      "post /leads/{id}/mark-lost",
      "post /leads/{id}/notes",
      "post /notifications/read-all",
      "post /notifications/{id}/read",
      "post /opportunities",
      "post /opportunities/{id}/assign",
      "post /opportunities/{id}/close",
      "post /opportunities/{id}/conversations",
      "post /opportunities/{id}/notes",
      "post /opportunities/{id}/reopen",
      "post /opportunities/{id}/stage",
      "post /pipeline-stages",
      "post /products",
      "post /products/{id}/archive",
      "post /products/{id}/restore",
      "post /quotes",
      "post /quotes/{id}/accept",
      "post /quotes/{id}/decline",
      "post /quotes/{id}/duplicate",
      "post /quotes/{id}/invoice",
      "post /quotes/{id}/reopen",
      "post /quotes/{id}/send",
      "post /settings/email/test",
      "post /tasks",
      "post /tasks/{id}/complete",
      "post /tasks/{id}/reopen",
      "post /users",
      "post /users/{id}/deactivate",
      "post /users/{id}/password-reset-link",
      "post /users/{id}/reactivate",
      "post /users/{id}/resend-invite",
      "put /custom-fields/order",
      "put /leads/{id}/follow-up",
      "put /opportunities/{id}/follow-up",
      "put /pipeline-stages/order",
      "put /settings/email",
      "put /settings/organization",
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
    expect(paths["/leads/{id}/follow-up"]?.put?.security).toEqual(session);
    expect(paths["/opportunities/{id}/follow-up"]?.put?.security).toEqual(session);
    expect(paths["/tasks"]?.get.security).toEqual(session);
    expect(paths["/tasks/summary"]?.get.security).toEqual(session);
    expect(paths["/tasks/{id}/complete"]?.post?.security).toEqual(session);
    expect(paths["/notifications"]?.get.security).toEqual(session);
    expect(paths["/notifications/unread-count"]?.get.security).toEqual(session);
    expect(paths["/notifications/read-all"]?.post?.security).toEqual(session);
    expect(paths["/notifications/{id}/read"]?.post?.security).toEqual(session);
    expect(paths["/dashboard/me"]?.get.security).toEqual(session);
    expect(paths["/dashboard/team"]?.get.security).toEqual(session);
    expect(paths["/custom-fields"]?.get.security).toEqual(session);
    expect(paths["/custom-fields/order"]?.put?.security).toEqual(session);
    expect(paths["/custom-fields/{id}/archive"]?.post?.security).toEqual(session);
    expect(paths["/leads/export"]?.get.security).toEqual(session);
    expect(paths["/tasks/export"]?.get.security).toEqual(session);
    expect(paths["/imports/fields"]?.get.security).toEqual(session);
    expect(paths["/imports/preview"]?.post?.security).toEqual(session);
    expect(paths["/imports"]?.post?.security).toEqual(session);
    expect(paths["/settings/email"]?.get.security).toEqual(session);
    expect(paths["/settings/email"]?.put?.security).toEqual(session);
    expect(paths["/settings/email"]?.delete?.security).toEqual(session);
    expect(paths["/settings/email/status"]?.get.security).toEqual(session);
    expect(paths["/settings/email/test"]?.post?.security).toEqual(session);
    expect(paths["/settings/organization"]?.put?.security).toEqual(session);
    expect(paths["/email-templates"]?.get.security).toEqual(session);
    expect(paths["/email-templates/placeholders"]?.get.security).toEqual(session);
    expect(paths["/emails"]?.post?.security).toEqual(session);
    expect(paths["/emails/defaults"]?.get.security).toEqual(session);
    expect(paths["/emails/preview"]?.post?.security).toEqual(session);
    expect(paths["/products"]?.get.security).toEqual(session);
    expect(paths["/products/{id}/archive"]?.post?.security).toEqual(session);
    expect(paths["/quotes"]?.get.security).toEqual(session);
    expect(paths["/quotes/{id}/send"]?.post?.security).toEqual(session);
    expect(paths["/quotes/{id}/document"]?.get.security).toEqual(session);
    expect(paths["/quotes/{id}/invoice"]?.post?.security).toEqual(session);
    expect(paths["/invoices"]?.get.security).toEqual(session);
    expect(paths["/invoices/summary"]?.get.security).toEqual(session);
    expect(paths["/invoices/{id}/mark-paid"]?.post?.security).toEqual(session);
    expect(paths["/invoices/{id}/document"]?.get.security).toEqual(session);
    expect(paths["/auth/login"]?.post?.security).toBeUndefined();
    expect(paths["/auth/token"]?.post?.security).toBeUndefined();
    expect(paths["/health"]?.get.security).toBeUndefined();
  });

  it.each(["leads", "contacts", "companies", "opportunities", "tasks", "quotes", "invoices"])(
    "describes /%s/export as a CSV download",
    (records) => {
      const ok = generated().paths[`/${records}/export`]?.get.responses["200"];

      expect(Object.keys(ok?.content ?? {})).toEqual(["text/csv"]);
      expect(ok?.content["text/csv"]?.schema).toEqual({ type: "string" });
      expect(Object.keys(ok?.headers ?? {})).toEqual(["Content-Disposition", "X-Export-Truncated"]);
    },
  );

  it("gives the four record types their custom field values", () => {
    const schemas = generated().components.schemas as unknown as Record<
      string,
      { properties: Record<string, unknown> }
    >;

    for (const name of ["Lead", "Contact", "Company", "Opportunity"]) {
      expect(schemas[name]?.properties.customFields, name).toEqual({
        $ref: "#/components/schemas/CustomFieldValues",
      });
    }
    for (const name of ["CreateLeadBody", "UpdateContactBody", "CreateCompanyBody"]) {
      expect(schemas[name]?.properties.customFields, name).toBeDefined();
    }
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
      "EMAIL",
      "QUOTE_STATUS",
      "INVOICE_STATUS",
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
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining([
        "Task",
        "TaskSummary",
        "CreateTaskBody",
        "UpdateTaskBody",
        "FollowUpBody",
        "Notification",
        "UnreadCount",
        "MarkedRead",
        "MyDashboard",
        "DashboardFollowUp",
        "TeamDashboard",
        "TeamFigures",
        "TeamRep",
      ]),
    );
    expect(schemas.TaskStatus?.enum).toEqual(["OPEN", "DONE"]);
    expect(schemas.TaskRecordType?.enum).toEqual(["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"]);
    expect(schemas.TaskDue?.enum).toEqual(["overdue", "today", "upcoming", "none"]);
    expect(schemas.NotificationKind?.enum).toEqual([
      "TASK_REMINDER",
      "LEAD_FOLLOW_UP",
      "OPPORTUNITY_FOLLOW_UP",
      "TASK_ASSIGNED",
    ]);
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining([
        "CustomField",
        "CustomFieldValues",
        "CreateCustomFieldBody",
        "UpdateCustomFieldBody",
        "ReorderCustomFieldsBody",
        "ImportField",
        "ImportPreviewBody",
        "ImportPreview",
        "ImportBody",
        "ImportResult",
        "ImportRowError",
      ]),
    );
    expect(schemas.CustomFieldRecordType?.enum).toEqual([
      "LEAD",
      "CONTACT",
      "COMPANY",
      "OPPORTUNITY",
    ]);
    expect(schemas.CustomFieldType?.enum).toEqual(["TEXT", "NUMBER", "DATE", "DROPDOWN"]);
    expect(schemas.ImportType?.enum).toEqual(["LEAD", "CONTACT", "COMPANY"]);
    expect(schemas.ImportFieldKind?.enum).toEqual(["TEXT", "EMAIL", "NUMBER", "DATE", "DROPDOWN"]);
    expect(schemas.Role?.enum).toEqual(["ADMIN", "SALES_MANAGER", "SALES_REP", "READ_ONLY"]);
    expect(schemas.UserStatus?.enum).toEqual(["ACTIVE", "INVITED", "DEACTIVATED"]);
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining([
        "EmailSettings",
        "UpdateEmailSettingsBody",
        "TestEmailBody",
        "TestEmailResult",
        "EmailStatus",
        "OrganizationSettings",
        "UpdateOrganizationBody",
        "EmailTemplate",
        "CreateEmailTemplateBody",
        "UpdateEmailTemplateBody",
        "EmailPlaceholder",
        "SendEmailBody",
        "PreviewEmailBody",
        "EmailPreview",
        "EmailDefaults",
        "Product",
        "CreateProductBody",
        "UpdateProductBody",
        "Quote",
        "QuoteLineInput",
        "CreateQuoteBody",
        "UpdateQuoteBody",
        "SendQuoteBody",
        "DocumentLine",
        "SalesDocument",
        "Invoice",
        "InvoiceSummary",
        "CreateInvoiceBody",
        "UpdateInvoiceBody",
        "MarkInvoicePaidBody",
      ]),
    );
    expect(schemas.EmailRecordType?.enum).toEqual(["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"]);
    expect(schemas.QuoteStatus?.enum).toEqual(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"]);
    expect(schemas.QuoteDiscountType?.enum).toEqual(["NONE", "PERCENT", "AMOUNT"]);
    expect(schemas.InvoiceStatus?.enum).toEqual(["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"]);
    // A line of a quote is not named "...Body", but it is part of one and as strict.
    expect(schemas.QuoteLineInput?.additionalProperties).toBe(false);
    expect(bodies.length).toBeGreaterThanOrEqual(56);
    for (const name of bodies) {
      expect(schemas[name]?.additionalProperties, name).toBe(false);
    }
  });

  it("never describes a password in an answer", () => {
    const schemas = generated().components.schemas as unknown as Record<
      string,
      { properties: Record<string, unknown> }
    >;

    expect(Object.keys(schemas.EmailSettings?.properties ?? {})).toEqual([
      "source",
      "host",
      "port",
      "secure",
      "username",
      "hasPassword",
      "fromName",
      "fromAddress",
      "replyTo",
      "updatedAt",
      "canStorePassword",
      "passwordUnreadable",
    ]);
    expect(Object.keys(schemas.UpdateEmailSettingsBody?.properties ?? {})).toContain("password");
  });

  it("describes a quote and an invoice as one print-ready document type", () => {
    const { paths } = generated();
    const documentOf = (path: string) =>
      (
        paths[path]?.get.responses["200"]?.content["application/json"].schema as {
          properties: { data: { $ref: string } };
        }
      ).properties.data.$ref;

    expect(documentOf("/quotes/{id}/document")).toBe("#/components/schemas/SalesDocument");
    expect(documentOf("/invoices/{id}/document")).toBe("#/components/schemas/SalesDocument");
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
