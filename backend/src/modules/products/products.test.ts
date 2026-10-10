import type request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  resetDatabase,
  resetPipelineStages,
  resetRecords,
  signInAs,
  type ValidationDetail,
} from "../../../test/helpers";
import type { User } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unitPrice: number;
  taxRate: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const PRODUCTS = "/api/v1/products";
const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";

const app = createTestApp();

let admin: User;
let asAdmin: Agent;
let asManager: Agent;
let asRep: Agent;
let asViewer: Agent;

const licence = {
  name: "Fleet tracking licence",
  sku: "LIC-FLT-001",
  description: "Monthly subscription per registered vehicle",
  unitPrice: 29,
  taxRate: 8.25,
};

function productOf(response: request.Response): Product {
  return (response.body as Envelope<Product>).data;
}

function namesOf(response: request.Response): string[] {
  return (response.body as Envelope<Product[]>).data.map((product) => product.name);
}

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

async function make(body: Record<string, unknown> = {}): Promise<Product> {
  const response = await asAdmin.post(PRODUCTS).send({ ...licence, ...body });
  expect(response.status).toBe(201);
  return productOf(response);
}

// Puts the product on a line of a quote, straight in the database.
async function useOnQuote(productId: string): Promise<void> {
  const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { kind: "OPEN" } });
  const opportunity = await prisma.opportunity.create({
    data: { name: "Deal", stageId: stage.id, ownerId: admin.id, createdById: admin.id },
  });
  await prisma.quote.create({
    data: {
      number: "Q-0001",
      sequence: 1,
      opportunityId: opportunity.id,
      issueDate: new Date("2026-11-01"),
      createdById: admin.id,
      lines: {
        create: {
          position: 0,
          productId,
          description: "A line",
          quantity: 1,
          unitPrice: 29,
          lineTotal: 29,
        },
      },
    },
  });
}

beforeAll(async () => {
  await resetDatabase();
  await resetPipelineStages();
  admin = await createUser({ role: "ADMIN" });
  asAdmin = await signInAs(app, admin);
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

describe("POST /products", () => {
  it("adds a product", async () => {
    const response = await asAdmin.post(PRODUCTS).send(licence);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        id: expect.any(String) as string,
        ...licence,
        active: true,
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      },
      meta: {},
    });
  });

  it("needs only a name and a price", async () => {
    const response = await asAdmin.post(PRODUCTS).send({ name: "  Consulting day ", unitPrice: 0 });

    expect(productOf(response)).toMatchObject({
      name: "Consulting day",
      sku: null,
      description: null,
      unitPrice: 0,
      taxRate: null,
      active: true,
    });
  });

  it("keeps cents exactly", async () => {
    const product = await make({ unitPrice: 1234.56, taxRate: 0.01 });

    expect(product).toMatchObject({ unitPrice: 1234.56, taxRate: 0.01 });
    expect(productOf(await asRep.get(`${PRODUCTS}/${product.id}`)).unitPrice).toBe(1234.56);
  });

  it("refuses a SKU another product has, whatever the case, archived or not", async () => {
    const first = await make();
    await asAdmin.post(`${PRODUCTS}/${first.id}/archive`);

    const response = await asAdmin
      .post(PRODUCTS)
      .send({ ...licence, name: "Other", sku: "lic-flt-001" });

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual(["sku"]);
    expect((await asAdmin.post(PRODUCTS).send({ name: "No SKU", unitPrice: 1 })).status).toBe(201);
    expect(
      (await asAdmin.post(PRODUCTS).send({ name: "No SKU either", unitPrice: 1 })).status,
    ).toBe(201);
  });

  it.each([
    ["a missing name", { name: undefined }, "name"],
    ["a name of spaces", { name: "  " }, "name"],
    ["a name of 201 characters", { name: "n".repeat(201) }, "name"],
    ["a SKU of 61 characters", { sku: "s".repeat(61) }, "sku"],
    ["a missing price", { unitPrice: undefined }, "unitPrice"],
    ["a negative price", { unitPrice: -0.01 }, "unitPrice"],
    ["a price with three decimals", { unitPrice: 9.999 }, "unitPrice"],
    ["a price as text", { unitPrice: "29.00" }, "unitPrice"],
    ["a price too large to store", { unitPrice: 10_000_000_000 }, "unitPrice"],
    ["a tax rate below 0", { taxRate: -1 }, "taxRate"],
    ["a tax rate above 100", { taxRate: 100.5 }, "taxRate"],
    ["a tax rate with three decimals", { taxRate: 8.255 }, "taxRate"],
  ])("answers VALIDATION_FAILED for %s", async (_name, change, path) => {
    const response = await asAdmin.post(PRODUCTS).send({ ...licence, ...change });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await prisma.product.count()).toBe(0);
  });

  it("does not take active or a currency", async () => {
    for (const extra of [{ active: false }, { currency: "EUR" }]) {
      const response = await asAdmin.post(PRODUCTS).send({ ...licence, ...extra });

      expect(response.status).toBe(400);
    }
  });
});

describe("who may change the catalog", () => {
  it("lets only an Admin add, change, archive, restore and delete", async () => {
    const product = await make();

    for (const agent of [asManager, asRep, asViewer]) {
      const responses = await Promise.all([
        agent.post(PRODUCTS).send({ name: "Mine", unitPrice: 1 }),
        agent.patch(`${PRODUCTS}/${product.id}`).send({ unitPrice: 1 }),
        agent.post(`${PRODUCTS}/${product.id}/archive`),
        agent.post(`${PRODUCTS}/${product.id}/restore`),
        agent.delete(`${PRODUCTS}/${product.id}`),
      ]);

      expect(responses.map((response) => response.status)).toEqual([403, 403, 403, 403, 403]);
      expect(errorOf(responses[0]).code).toBe("FORBIDDEN");
    }
    expect(productOf(await asAdmin.get(`${PRODUCTS}/${product.id}`))).toEqual(product);
  });

  it("lets every role read the catalog", async () => {
    const product = await make();

    for (const agent of [asAdmin, asManager, asRep, asViewer]) {
      expect(namesOf(await agent.get(PRODUCTS))).toEqual(["Fleet tracking licence"]);
      expect(productOf(await agent.get(`${PRODUCTS}/${product.id}`))).toEqual(product);
    }
  });
});

describe("GET /products", () => {
  beforeEach(async () => {
    await make({ name: "GPS tracker hardware", sku: "HW-GPS-200", unitPrice: 149 });
    await make({ name: "Fleet tracking licence", sku: "LIC-FLT-001", unitPrice: 29 });
    await make({ name: "Onboarding package", sku: null, unitPrice: 1200, taxRate: 0 });
    const old = await make({ name: "Annual support plan", sku: "SUP-ANN-1", unitPrice: 990 });
    await asAdmin.post(`${PRODUCTS}/${old.id}/archive`);
  });

  it("lists every product by name, archived ones included, with the total", async () => {
    const response = await asRep.get(PRODUCTS);

    expect(response.status).toBe(200);
    expect(namesOf(response)).toEqual([
      "Annual support plan",
      "Fleet tracking licence",
      "GPS tracker hardware",
      "Onboarding package",
    ]);
    expect(response.body).toMatchObject({ meta: { page: 1, pageSize: 25, total: 4 } });
  });

  it("filters by active", async () => {
    expect(namesOf(await asRep.get(`${PRODUCTS}?active=true`))).toEqual([
      "Fleet tracking licence",
      "GPS tracker hardware",
      "Onboarding package",
    ]);
    expect(namesOf(await asRep.get(`${PRODUCTS}?active=false`))).toEqual(["Annual support plan"]);
  });

  it("searches the name and the SKU, every word, whatever the case", async () => {
    expect(namesOf(await asRep.get(`${PRODUCTS}?search=tracking`))).toEqual([
      "Fleet tracking licence",
    ]);
    expect(namesOf(await asRep.get(`${PRODUCTS}?search=hw-gps`))).toEqual(["GPS tracker hardware"]);
    expect(namesOf(await asRep.get(`${PRODUCTS}?search=fleet%20lic-flt`))).toEqual([
      "Fleet tracking licence",
    ]);
    expect(namesOf(await asRep.get(`${PRODUCTS}?search=fleet%20hardware`))).toEqual([]);
    expect(namesOf(await asRep.get(`${PRODUCTS}?search=%25`))).toEqual([]);
    expect(namesOf(await asRep.get(`${PRODUCTS}?search=support&active=true`))).toEqual([]);
  });

  it("sorts by price, by SKU with a product without one last, and by creation", async () => {
    expect(namesOf(await asRep.get(`${PRODUCTS}?sort=unitPrice&order=desc`))).toEqual([
      "Onboarding package",
      "Annual support plan",
      "GPS tracker hardware",
      "Fleet tracking licence",
    ]);
    expect(namesOf(await asRep.get(`${PRODUCTS}?sort=sku`))).toEqual([
      "GPS tracker hardware",
      "Fleet tracking licence",
      "Annual support plan",
      "Onboarding package",
    ]);
    expect(namesOf(await asRep.get(`${PRODUCTS}?sort=sku&order=desc`))).toEqual([
      "Annual support plan",
      "Fleet tracking licence",
      "GPS tracker hardware",
      "Onboarding package",
    ]);
    expect(namesOf(await asRep.get(`${PRODUCTS}?sort=createdAt&order=asc`))[0]).toBe(
      "GPS tracker hardware",
    );
  });

  it("pages", async () => {
    const second = await asRep.get(`${PRODUCTS}?pageSize=3&page=2`);

    expect(namesOf(second)).toEqual(["Onboarding package"]);
    expect(second.body).toMatchObject({ meta: { page: 2, pageSize: 3, total: 4 } });
    expect(namesOf(await asRep.get(`${PRODUCTS}?page=9`))).toEqual([]);
  });

  it.each([
    ["active=yes", "active"],
    ["sort=taxRate", "sort"],
    ["page=0", "page"],
    ["pageSize=101", "pageSize"],
  ])("answers VALIDATION_FAILED for %s", async (query, path) => {
    const response = await asRep.get(`${PRODUCTS}?${query}`);

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual([path]);
  });
});

describe("PATCH /products/:id", () => {
  it("changes only the keys sent, and null clears", async () => {
    const product = await make();

    const response = await asAdmin
      .patch(`${PRODUCTS}/${product.id}`)
      .send({ unitPrice: 31.5, sku: null, taxRate: null, description: "" });

    expect(response.status).toBe(200);
    expect(productOf(response)).toMatchObject({
      name: "Fleet tracking licence",
      unitPrice: 31.5,
      sku: null,
      taxRate: null,
      description: null,
      active: true,
    });
  });

  it("refuses another product's SKU but keeps its own", async () => {
    const first = await make();
    const second = await make({ name: "Second", sku: "SECOND-1" });

    const taken = await asAdmin.patch(`${PRODUCTS}/${second.id}`).send({ sku: "LIC-FLT-001" });
    const own = await asAdmin.patch(`${PRODUCTS}/${first.id}`).send({ sku: "lic-flt-001" });

    expect(taken.status).toBe(400);
    expect(detailPaths(taken)).toEqual(["sku"]);
    expect(productOf(own).sku).toBe("lic-flt-001");
  });

  it("answers NOT_FOUND for an unknown id, and does not take active", async () => {
    const product = await make();

    expect((await asAdmin.patch(`${PRODUCTS}/${UNKNOWN_ID}`).send({ name: "x" })).status).toBe(404);
    expect((await asAdmin.get(`${PRODUCTS}/${UNKNOWN_ID}`)).status).toBe(404);
    expect((await asAdmin.patch(`${PRODUCTS}/${product.id}`).send({ active: false })).status).toBe(
      400,
    );
  });
});

describe("archiving and restoring", () => {
  it("archives and restores, and answers unchanged when there is nothing to do", async () => {
    const product = await make();

    const archived = await asAdmin.post(`${PRODUCTS}/${product.id}/archive`);
    const again = await asAdmin.post(`${PRODUCTS}/${product.id}/archive`);
    const restored = await asAdmin.post(`${PRODUCTS}/${product.id}/restore`);

    expect(productOf(archived).active).toBe(false);
    expect(again.status).toBe(200);
    expect(productOf(again).active).toBe(false);
    expect(productOf(restored).active).toBe(true);
    expect((await asAdmin.post(`${PRODUCTS}/${UNKNOWN_ID}/archive`)).status).toBe(404);
    expect((await asAdmin.post(`${PRODUCTS}/${UNKNOWN_ID}/restore`)).status).toBe(404);
  });
});

describe("DELETE /products/:id", () => {
  it("deletes a product no quote uses", async () => {
    const product = await make();

    const response = await asAdmin.delete(`${PRODUCTS}/${product.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect(await prisma.product.count()).toBe(0);
    expect((await asAdmin.delete(`${PRODUCTS}/${product.id}`)).status).toBe(404);
  });

  it("answers PRODUCT_IN_USE for a product on a quote, which can be archived instead", async () => {
    const product = await make();
    await useOnQuote(product.id);

    const response = await asAdmin.delete(`${PRODUCTS}/${product.id}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "PRODUCT_IN_USE",
        message: "This product is on a quote, so it cannot be deleted. Archive it instead.",
        details: null,
      },
    });
    expect(await prisma.product.count()).toBe(1);
    expect(productOf(await asAdmin.post(`${PRODUCTS}/${product.id}/archive`)).active).toBe(false);
  });
});
