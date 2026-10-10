import type request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  resetRecords,
  signInAs,
  type ValidationDetail,
} from "../../../test/helpers";
import { prisma } from "../../lib/prisma";

type Agent = Awaited<ReturnType<typeof signInAs>>;

const ORGANIZATION = "/api/v1/settings/organization";

const app = createTestApp();

let asAdmin: Agent;
let asManager: Agent;
let asRep: Agent;
let asViewer: Agent;

const DEFAULTS = {
  name: "",
  address: null,
  email: null,
  phone: null,
  taxId: null,
  defaultQuoteTerms: null,
  defaultValidityDays: 30,
  defaultTaxRate: 0,
  invoicePaymentTermsDays: 30,
  updatedAt: null,
};

const full = {
  name: "  Northwind Fleet Ltd  ",
  address: "1 Harbour Road\nBristol BS1 4QA",
  email: "Billing@Northwind.example",
  phone: "+44 117 496 0000",
  taxId: "GB 123 4567 89",
  defaultQuoteTerms: "Payment within 14 days of the invoice date.",
  defaultValidityDays: 45,
  defaultTaxRate: 8.25,
  invoicePaymentTermsDays: 14,
};

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

beforeAll(async () => {
  await resetDatabase();
  asAdmin = await signInAs(app, await createUser({ role: "ADMIN" }));
  asManager = await signInAs(app, await createUser({ role: "SALES_MANAGER" }));
  asRep = await signInAs(app, await createUser({ role: "SALES_REP" }));
  asViewer = await signInAs(app, await createUser({ role: "READ_ONLY" }));
});

beforeEach(async () => {
  await resetRecords();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("GET /settings/organization", () => {
  it("answers the defaults to every role while nothing is saved", async () => {
    for (const agent of [asAdmin, asManager, asRep, asViewer]) {
      const response = await agent.get(ORGANIZATION);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: DEFAULTS, meta: {} });
    }
  });
});

describe("PUT /settings/organization", () => {
  it("saves everything, trimmed, for everyone to read", async () => {
    const response = await asAdmin.put(ORGANIZATION).send(full);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        ...full,
        name: "Northwind Fleet Ltd",
        email: "billing@northwind.example",
        updatedAt: expect.any(String) as string,
      },
      meta: {},
    });
    expect((await asViewer.get(ORGANIZATION)).body).toEqual(response.body);
    expect(await prisma.organizationSettings.count()).toBe(1);
  });

  it("replaces the settings: a text left out is cleared, a number goes back to its default", async () => {
    await asAdmin.put(ORGANIZATION).send(full);

    const response = await asAdmin.put(ORGANIZATION).send({ name: "Northwind", address: "" });

    expect(response.body).toMatchObject({
      data: { ...DEFAULTS, name: "Northwind", updatedAt: expect.any(String) as string },
    });
    expect(await prisma.organizationSettings.count()).toBe(1);
  });

  it("is for Admins only", async () => {
    for (const agent of [asManager, asRep, asViewer]) {
      const response = await agent.put(ORGANIZATION).send(full);

      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe("FORBIDDEN");
    }
    expect(await prisma.organizationSettings.count()).toBe(0);
  });

  it.each([
    ["a missing name", { name: undefined }, "name"],
    ["a name of 201 characters", { name: "n".repeat(201) }, "name"],
    ["an email that is not one", { email: "billing" }, "email"],
    ["0 validity days", { defaultValidityDays: 0 }, "defaultValidityDays"],
    ["366 validity days", { defaultValidityDays: 366 }, "defaultValidityDays"],
    ["half a validity day", { defaultValidityDays: 1.5 }, "defaultValidityDays"],
    ["a tax rate below 0", { defaultTaxRate: -1 }, "defaultTaxRate"],
    ["a tax rate above 100", { defaultTaxRate: 100.01 }, "defaultTaxRate"],
    ["a tax rate with three decimals", { defaultTaxRate: 8.255 }, "defaultTaxRate"],
    ["negative payment terms", { invoicePaymentTermsDays: -1 }, "invoicePaymentTermsDays"],
    ["terms of 5001 characters", { defaultQuoteTerms: "t".repeat(5001) }, "defaultQuoteTerms"],
  ])("answers VALIDATION_FAILED for %s", async (_name, change, path) => {
    const response = await asAdmin.put(ORGANIZATION).send({ ...full, ...change });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect((errorOf(response).details as ValidationDetail[]).map((detail) => detail.path)).toEqual([
      path,
    ]);
    expect(await prisma.organizationSettings.count()).toBe(0);
  });

  it("accepts an empty name, payment on receipt and a tax rate of 100", async () => {
    const response = await asAdmin
      .put(ORGANIZATION)
      .send({ name: "", invoicePaymentTermsDays: 0, defaultTaxRate: 100 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: { name: "", invoicePaymentTermsDays: 0, defaultTaxRate: 100 },
    });
  });
});
