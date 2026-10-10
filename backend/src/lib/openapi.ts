import {
  extendZodWithOpenApi,
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { ERROR_CODES } from "./app-error";

// The only place the Zod OpenAPI extension is switched on. Schema files import `z`
// from here so that `.openapi("Name")` is available on every schema.
extendZodWithOpenApi(z);
export { z };

// Route files add their paths here, beside the Express route they describe.
export const registry = new OpenAPIRegistry();

export const errorCodeSchema = registry.register("ErrorCode", z.enum(ERROR_CODES));

// One entry of `details` for VALIDATION_FAILED: which field, and what is wrong with it.
export const validationDetailSchema = registry.register(
  "ValidationDetail",
  z.object({ path: z.string(), message: z.string() }),
);

// The shape of every error response (D-11). `details` is always present:
// null, a list of validation details, or an object an AppError carries.
export const errorResponseSchema = registry.register(
  "ErrorResponse",
  z.object({
    error: z.object({
      code: errorCodeSchema,
      message: z.string(),
      details: z.union([
        z.null(),
        z.array(validationDetailSchema),
        z.record(z.string(), z.unknown()),
      ]),
    }),
  }),
);

// The shape of every success response (D-11): the payload under `data`, extras under `meta`.
export function envelope<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema, meta: z.record(z.string(), z.unknown()) });
}

// Shorthand for the route files, so each registerPath call stays readable.
export function jsonBody(schema: z.ZodType) {
  return { required: true, content: { "application/json": { schema } } };
}

export function jsonResponse(description: string, schema: z.ZodType) {
  return { description, content: { "application/json": { schema } } };
}

// `description` names the error codes this status can carry.
export function errorResponse(description: string) {
  return jsonResponse(description, errorResponseSchema);
}

// A signed-in route accepts the session token as a cookie (browser) or a Bearer header.
registry.registerComponent("securitySchemes", "sessionCookie", {
  type: "apiKey",
  in: "cookie",
  name: "opencrm_session",
});
registry.registerComponent("securitySchemes", "bearerToken", { type: "http", scheme: "bearer" });

export const sessionSecurity: Record<string, string[]>[] = [
  { sessionCookie: [] },
  { bearerToken: [] },
];

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "OpenCRM API", version: "1.0.0" },
    servers: [{ url: "/api/v1" }],
  });
}
