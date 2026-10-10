import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  signInAs,
  type ValidationDetail,
} from "../../test/helpers";
import { registry } from "../lib/openapi";
import { prisma } from "../lib/prisma";

// Every route in the OpenAPI registry is checked here, so a new route cannot ship without
// validating its input and (when it is documented as signed-in) requiring a session.

// Routes that take no body and no path parameter. A new route must either validate
// something or be added here on purpose.
const ROUTES_WITHOUT_INPUT = [
  "get /activity",
  "get /activity/authors",
  "get /auth/me",
  "get /auth/setup-status",
  "get /companies",
  "get /companies/export",
  "get /companies/industries",
  "get /contacts",
  "get /contacts/export",
  "get /custom-fields",
  "get /dashboard/me",
  "get /dashboard/team",
  "get /health",
  "get /imports/fields",
  "get /leads",
  "get /leads/export",
  "get /notifications",
  "get /notifications/unread-count",
  "get /opportunities",
  "get /opportunities/board",
  "get /opportunities/export",
  "get /pipeline-stages",
  "get /tasks",
  "get /tasks/export",
  "get /tasks/summary",
  "get /users",
  "get /users/assignable",
  "post /auth/logout",
  "post /notifications/read-all",
];

// Routes whose body may be left out, because every key in it is optional. They still
// refuse an unknown key and malformed JSON.
const ROUTES_WITH_OPTIONAL_BODY = new Set([
  "delete /pipeline-stages/{id}",
  "post /opportunities/{id}/reopen",
]);

const SOME_ID = "01920000-0000-7000-8000-000000000000";

const app = createTestApp();

// createTestApp imported every route file, so the registry is complete.
const routes = registry.definitions.flatMap((definition) =>
  definition.type === "route"
    ? [
        {
          key: `${definition.route.method} ${definition.route.path}`,
          method: definition.route.method as "get" | "post" | "patch" | "put" | "delete",
          path: definition.route.path,
          signedIn: definition.route.security !== undefined,
          hasBody: definition.route.request?.body !== undefined,
          hasParams: definition.route.request?.params !== undefined,
        },
      ]
    : [],
);

const signedInRoutes = routes.filter((route) => route.signedIn);
const bodyRoutes = routes.filter((route) => route.hasBody);
const requiredBodyRoutes = bodyRoutes.filter((route) => !ROUTES_WITH_OPTIONAL_BODY.has(route.key));
const paramRoutes = routes.filter((route) => route.hasParams);

function urlFor(path: string, id = SOME_ID): string {
  return `/api/v1${path.replaceAll(/\{\w+\}/g, id)}`;
}

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

let asAdmin: Awaited<ReturnType<typeof signInAs>>;

beforeAll(async () => {
  await resetDatabase();
  asAdmin = await signInAs(app, await createUser({ role: "ADMIN" }));
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("endpoint contract", () => {
  it("covers the auth, users, record, pipeline, timeline, activity, task, notification, dashboard, custom field, export and import routes", () => {
    expect(routes.length).toBeGreaterThanOrEqual(101);
    expect(signedInRoutes.length).toBeGreaterThanOrEqual(93);
    expect(routes.map((route) => route.key)).toEqual(
      expect.arrayContaining([
        "get /leads/{id}/timeline",
        "post /leads/{id}/conversations",
        "post /leads/{id}/notes",
        "get /contacts",
        "post /contacts",
        "get /contacts/{id}",
        "patch /contacts/{id}",
        "delete /contacts/{id}",
        "post /contacts/{id}/assign",
        "get /contacts/{id}/timeline",
        "post /contacts/{id}/conversations",
        "post /contacts/{id}/notes",
        "get /companies",
        "get /companies/industries",
        "post /companies",
        "get /companies/{id}",
        "patch /companies/{id}",
        "delete /companies/{id}",
        "post /companies/{id}/assign",
        "get /companies/{id}/timeline",
        "post /companies/{id}/conversations",
        "post /companies/{id}/notes",
        "get /activity",
        "get /activity/authors",
        "post /leads/{id}/convert",
        "get /pipeline-stages",
        "post /pipeline-stages",
        "put /pipeline-stages/order",
        "patch /pipeline-stages/{id}",
        "delete /pipeline-stages/{id}",
        "get /opportunities",
        "get /opportunities/board",
        "post /opportunities",
        "get /opportunities/{id}",
        "patch /opportunities/{id}",
        "delete /opportunities/{id}",
        "post /opportunities/{id}/stage",
        "post /opportunities/{id}/close",
        "post /opportunities/{id}/reopen",
        "post /opportunities/{id}/assign",
        "get /opportunities/{id}/timeline",
        "post /opportunities/{id}/conversations",
        "post /opportunities/{id}/notes",
        "put /leads/{id}/follow-up",
        "put /opportunities/{id}/follow-up",
        "get /tasks",
        "get /tasks/summary",
        "post /tasks",
        "get /tasks/{id}",
        "patch /tasks/{id}",
        "delete /tasks/{id}",
        "post /tasks/{id}/complete",
        "post /tasks/{id}/reopen",
        "get /notifications",
        "get /notifications/unread-count",
        "post /notifications/read-all",
        "post /notifications/{id}/read",
        "get /dashboard/me",
        "get /dashboard/team",
        "get /custom-fields",
        "post /custom-fields",
        "put /custom-fields/order",
        "patch /custom-fields/{id}",
        "delete /custom-fields/{id}",
        "post /custom-fields/{id}/archive",
        "post /custom-fields/{id}/restore",
        "get /leads/export",
        "get /contacts/export",
        "get /companies/export",
        "get /opportunities/export",
        "get /tasks/export",
        "get /imports/fields",
        "post /imports/preview",
        "post /imports",
      ]),
    );
  });

  it("lists exactly the routes that take no input", () => {
    const withoutInput = routes
      .filter((route) => !route.hasBody && !route.hasParams)
      .map((route) => route.key)
      .sort();

    expect(withoutInput).toEqual(ROUTES_WITHOUT_INPUT);
  });

  it.each(signedInRoutes)("$key answers 401 UNAUTHENTICATED without a session", async (route) => {
    const response = await request(app)[route.method](urlFor(route.path));

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe("UNAUTHENTICATED");
  });

  it.each(bodyRoutes)("$key answers 400 VALIDATION_FAILED for an unknown key", async (route) => {
    const client = route.signedIn ? asAdmin : request(app);

    const response = await client[route.method](urlFor(route.path)).send({ notAField: true });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect((errorOf(response).details as ValidationDetail[]).length).toBeGreaterThan(0);
  });

  it("lists only real routes as taking an optional body", () => {
    const keys = new Set(bodyRoutes.map((route) => route.key));

    expect([...ROUTES_WITH_OPTIONAL_BODY].filter((key) => !keys.has(key))).toEqual([]);
  });

  it.each(requiredBodyRoutes)(
    "$key answers 400 VALIDATION_FAILED for a missing body",
    async (route) => {
      const client = route.signedIn ? asAdmin : request(app);

      const response = await client[route.method](urlFor(route.path));

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    },
  );

  it.each(bodyRoutes)("$key answers 400 VALIDATION_FAILED for malformed JSON", async (route) => {
    const client = route.signedIn ? asAdmin : request(app);

    const response = await client[route.method](urlFor(route.path))
      .set("Content-Type", "application/json")
      .send('{"name": ');

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
  });

  it.each(paramRoutes)("$key answers 400 VALIDATION_FAILED for a malformed id", async (route) => {
    const client = route.signedIn ? asAdmin : request(app);

    const response = await client[route.method](urlFor(route.path, "not-a-uuid")).send({});

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect((errorOf(response).details as ValidationDetail[])[0]?.path).toBe("id");
  });
});
