import type request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTestApp,
  createUser,
  type ErrorEnvelope,
  MAIL_SERVER_TEXT,
  resetDatabase,
  resetPipelineStages,
  resetRecords,
  signInAs,
  useFailingMailServer,
  useFakeMailServer,
  type ValidationDetail,
  zoneOnAnotherDay,
} from "../../../test/helpers";
import type { Company, Contact, Opportunity, Product, User } from "../../generated/prisma/client";
import { parseCsv } from "../../lib/csv";
import { prisma } from "../../lib/prisma";
import { addDays } from "../../lib/sales-documents";

interface Line {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  lineTotal: number;
}

interface Quote {
  id: string;
  number: string;
  opportunity: { id: string; name: string };
  contact: { id: string; name: string; email: string | null } | null;
  company: { id: string; name: string } | null;
  status: string;
  issueDate: string;
  validUntil: string | null;
  lines: Line[];
  discountType: string;
  discountValue: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  invoice: { id: string; number: string } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

interface TimelineEntry {
  kind: string;
  body: string | null;
  details: Record<string, unknown> | null;
  author: { id: string; name: string };
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;
type Status = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED";

const API = "/api/v1";
const QUOTES = `${API}/quotes`;
const UNKNOWN_ID = "01920000-0000-7000-8000-000000000000";
const TODAY = new Date().toISOString().slice(0, 10);

const app = createTestApp();

// Meera manages Ravi; Tara is a rep on no team.
let admin: User;
let meera: User;
let ravi: User;
let tara: User;
let asAdmin: Agent;
let asMeera: Agent;
let asRavi: Agent;
let asTara: Agent;
let asViewer: Agent;

// The company, the contact and the opportunity belong to Ravi.
let company: Company;
let contact: Contact;
let opportunity: Opportunity;
// 29.00 at 8.25% tax; 149.00 without a tax rate of its own.
let licence: Product;
let hardware: Product;

function quoteOf(response: request.Response): Quote {
  return (response.body as Envelope<Quote>).data;
}

function numbersOf(response: request.Response): string[] {
  return (response.body as Envelope<Quote[]>).data.map((quote) => quote.number);
}

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function details(response: request.Response): ValidationDetail[] {
  return errorOf(response).details as ValidationDetail[];
}

function detailPaths(response: request.Response): string[] {
  return details(response).map((detail) => detail.path);
}

const oneLine = [{ description: "Consulting day", quantity: 2, unitPrice: 500, taxRate: 10 }];

async function makeQuote(
  body: Record<string, unknown> = {},
  agent: Agent = asRavi,
): Promise<Quote> {
  const response = await agent
    .post(QUOTES)
    .send({ opportunityId: opportunity.id, lines: oneLine, ...body });
  expect(response.status).toBe(201);
  return quoteOf(response);
}

// A quote in the status asked for, reached through the routes.
async function quoteIn(status: Status, body: Record<string, unknown> = {}): Promise<Quote> {
  const quote = await makeQuote(body);
  if (status === "SENT" || status === "ACCEPTED") {
    expect((await asRavi.post(`${QUOTES}/${quote.id}/send`)).status).toBe(200);
  }
  if (status === "ACCEPTED") {
    expect((await asRavi.post(`${QUOTES}/${quote.id}/accept`)).status).toBe(200);
  }
  if (status === "DECLINED") {
    expect((await asRavi.post(`${QUOTES}/${quote.id}/decline`)).status).toBe(200);
  }
  return quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`));
}

// The opportunity's timeline, newest first.
async function timeline(kind = ""): Promise<TimelineEntry[]> {
  const query = kind ? `?kind=${kind}` : "";
  const response = await asAdmin.get(`${API}/opportunities/${opportunity.id}/timeline${query}`);
  expect(response.status).toBe(200);
  return (response.body as Envelope<TimelineEntry[]>).data;
}

async function statusChanges(): Promise<unknown[]> {
  return (await timeline("QUOTE_STATUS")).map((entry) => [entry.details?.from, entry.details?.to]);
}

beforeAll(async () => {
  await resetDatabase();
  await resetPipelineStages();
  admin = await createUser({ role: "ADMIN", name: "Asha Admin" });
  meera = await createUser({ role: "SALES_MANAGER", name: "Meera Manager" });
  ravi = await createUser({
    role: "SALES_REP",
    name: "Ravi Rep",
    email: "ravi@example.com",
    managerId: meera.id,
  });
  tara = await createUser({ role: "SALES_REP", name: "Tara Rep" });
  asAdmin = await signInAs(app, admin);
  asMeera = await signInAs(app, meera);
  asRavi = await signInAs(app, ravi);
  asTara = await signInAs(app, tara);
  asViewer = await signInAs(app, await createUser({ role: "READ_ONLY" }));
});

beforeEach(async () => {
  await resetRecords();
  const owned = { ownerId: ravi.id, createdById: ravi.id };
  company = await prisma.company.create({
    data: { ...owned, name: "Northwind Logistics", address: "1 Harbour Road, Bristol" },
  });
  contact = await prisma.contact.create({
    data: {
      ...owned,
      firstName: "Elena",
      lastName: "Rostova",
      email: "elena@northwind.example",
      companyId: company.id,
    },
  });
  const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { kind: "OPEN" } });
  opportunity = await prisma.opportunity.create({
    data: {
      ...owned,
      name: "Fleet tracking rollout",
      stageId: stage.id,
      contactId: contact.id,
      companyId: company.id,
    },
  });
  licence = await prisma.product.create({
    data: { name: "Fleet tracking licence", sku: "LIC-FLT-001", unitPrice: 29, taxRate: 8.25 },
  });
  hardware = await prisma.product.create({
    data: { name: "GPS tracker hardware", sku: "HW-GPS-200", unitPrice: 149 },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("POST /quotes", () => {
  it("creates a draft from nothing but the opportunity", async () => {
    const response = await asRavi.post(QUOTES).send({ opportunityId: opportunity.id });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        id: expect.any(String) as string,
        number: "Q-0001",
        opportunity: { id: opportunity.id, name: "Fleet tracking rollout" },
        contact: { id: contact.id, name: "Elena Rostova", email: "elena@northwind.example" },
        company: { id: company.id, name: "Northwind Logistics" },
        status: "DRAFT",
        issueDate: TODAY,
        validUntil: addDays(TODAY, 30),
        lines: [],
        discountType: "NONE",
        discountValue: 0,
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        total: 0,
        notes: null,
        terms: null,
        sentAt: null,
        acceptedAt: null,
        declinedAt: null,
        invoice: null,
        createdBy: { id: ravi.id, name: "Ravi Rep" },
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      },
      meta: {},
    });
    const quote = quoteOf(response);
    expect(await timeline()).toEqual([
      expect.objectContaining({
        kind: "QUOTE_STATUS",
        body: null,
        details: { quote: { id: quote.id, number: "Q-0001" }, from: null, to: "DRAFT", total: 0 },
        author: { id: ravi.id, name: "Ravi Rep" },
      }),
    ]);
  });

  it("copies name, price and tax rate from the product, and counts the totals", async () => {
    await prisma.organizationSettings.create({ data: { defaultTaxRate: 8.25 } });

    const quote = await makeQuote({
      lines: [
        { productId: licence.id, quantity: 108 },
        // No tax rate of its own: the organisation's default applies.
        { productId: hardware.id, quantity: 114 },
        { description: "Onboarding package", quantity: 1, unitPrice: 1200, taxRate: 0 },
      ],
      discountType: "PERCENT",
      discountValue: 5,
    });

    expect(quote.lines.map(({ id: _id, ...line }) => line)).toEqual([
      {
        productId: licence.id,
        description: "Fleet tracking licence",
        quantity: 108,
        unitPrice: 29,
        discountPercent: 0,
        taxRate: 8.25,
        lineTotal: 3132,
      },
      {
        productId: hardware.id,
        description: "GPS tracker hardware",
        quantity: 114,
        unitPrice: 149,
        discountPercent: 0,
        taxRate: 8.25,
        lineTotal: 16_986,
      },
      {
        productId: null,
        description: "Onboarding package",
        quantity: 1,
        unitPrice: 1200,
        discountPercent: 0,
        taxRate: 0,
        lineTotal: 1200,
      },
    ]);
    // 5% of 21318.00; then 8.25% of (3132 + 16986) x 0.95 = 19112.10, which is 1576.74825.
    expect(quote).toMatchObject({
      discountType: "PERCENT",
      discountValue: 5,
      subtotal: 21_318,
      discountTotal: 1065.9,
      taxTotal: 1576.75,
      total: 21_828.85,
    });
  });

  it("lets a line say something else than its product, and keeps three decimals of quantity", async () => {
    const quote = await makeQuote({
      lines: [
        {
          productId: licence.id,
          description: "Licence, first year",
          quantity: 1.005,
          unitPrice: 1,
          discountPercent: 0,
          taxRate: 0,
        },
        { productId: licence.id, quantity: 10, discountPercent: 12.5 },
      ],
    });

    expect(quote.lines[0]).toMatchObject({
      description: "Licence, first year",
      quantity: 1.005,
      unitPrice: 1,
      taxRate: 0,
      // Half a cent rounds up.
      lineTotal: 1.01,
    });
    expect(quote.lines[1]).toMatchObject({ discountPercent: 12.5, lineTotal: 253.75 });
    // 8.25% of 253.75 is 20.934375.
    expect(quote).toMatchObject({ subtotal: 254.76, taxTotal: 20.93, total: 275.69 });
  });

  it("counts an amount discount, which never exceeds the subtotal", async () => {
    const quote = await makeQuote({ discountType: "AMOUNT", discountValue: 250 });
    const tooMuch = await makeQuote({ discountType: "AMOUNT", discountValue: 5000 });

    // 1000.00 less 250.00; 10% tax on 750.00.
    expect(quote).toMatchObject({ subtotal: 1000, discountTotal: 250, taxTotal: 75, total: 825 });
    expect(tooMuch).toMatchObject({
      discountValue: 5000,
      subtotal: 1000,
      discountTotal: 1000,
      taxTotal: 0,
      total: 0,
    });
  });

  it("starts from the organisation's validity days and terms", async () => {
    await prisma.organizationSettings.create({
      data: { defaultValidityDays: 14, defaultQuoteTerms: "Payment within 14 days." },
    });

    const quote = await makeQuote({ issueDate: "2026-11-20" });
    const explicit = await makeQuote({
      issueDate: "2026-11-20",
      validUntil: null,
      terms: null,
      notes: "  Delivery in January.  ",
    });

    expect(quote).toMatchObject({
      issueDate: "2026-11-20",
      validUntil: "2026-12-04",
      terms: "Payment within 14 days.",
    });
    expect(explicit).toMatchObject({
      validUntil: null,
      terms: null,
      notes: "Delivery in January.",
    });
  });

  it("takes another contact and company the caller may see, or none", async () => {
    const other = await prisma.contact.create({
      data: { firstName: "Omar", lastName: "Haddad", ownerId: ravi.id, createdById: ravi.id },
    });

    const quote = await makeQuote({ contactId: other.id, companyId: null });
    const nobody = await makeQuote({ contactId: null, companyId: null });

    expect(quote).toMatchObject({
      contact: { id: other.id, name: "Omar Haddad", email: null },
      company: null,
    });
    expect(nobody).toMatchObject({ contact: null, company: null });
  });

  it("uses the viewer's today as the issue date", async () => {
    const zone = zoneOnAnotherDay();

    const response = await asRavi
      .post(`${QUOTES}?tz=${zone.timeZone}`)
      .send({ opportunityId: opportunity.id });

    const tomorrow = zone.timeZone === "Pacific/Kiritimati";
    expect(quoteOf(response).issueDate).toBe(addDays(TODAY, tomorrow ? 1 : -1));
  });

  it("gives ten quotes made at the same moment ten different numbers without a gap", async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        asRavi.post(QUOTES).send({ opportunityId: opportunity.id, lines: oneLine }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 10 }, () => 201),
    );
    expect(responses.map((response) => quoteOf(response).number).sort()).toEqual([
      "Q-0001",
      "Q-0002",
      "Q-0003",
      "Q-0004",
      "Q-0005",
      "Q-0006",
      "Q-0007",
      "Q-0008",
      "Q-0009",
      "Q-0010",
    ]);
    expect((await makeQuote()).number).toBe("Q-0011");
  });

  it("does not use a number for a request that is refused", async () => {
    await asRavi.post(QUOTES).send({ opportunityId: opportunity.id, lines: [{ quantity: 1 }] });
    await asViewer.post(QUOTES).send({ opportunityId: opportunity.id });

    expect((await makeQuote()).number).toBe("Q-0001");
  });

  describe("validation", () => {
    it("reports every problem with the lines at once, each on its own field", async () => {
      await prisma.product.update({ where: { id: hardware.id }, data: { active: false } });

      const response = await asRavi.post(QUOTES).send({
        opportunityId: opportunity.id,
        lines: [
          { productId: licence.id, quantity: 1 },
          { productId: UNKNOWN_ID, quantity: 1 },
          { productId: hardware.id, quantity: 1 },
          { quantity: 1 },
          { description: "No price", quantity: 1 },
        ],
      });

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(details(response)).toEqual([
        { path: "lines.1.productId", message: "Choose a product" },
        { path: "lines.1.description", message: "Describe the line" },
        { path: "lines.1.unitPrice", message: "Enter a price" },
        { path: "lines.2.productId", message: "This product is archived" },
        { path: "lines.3.description", message: "Describe the line" },
        { path: "lines.3.unitPrice", message: "Enter a price" },
        { path: "lines.4.unitPrice", message: "Enter a price" },
      ]);
      expect(await prisma.quote.count()).toBe(0);
    });

    it.each([
      ["no opportunity", { opportunityId: undefined }, "opportunityId"],
      ["a quantity of 0", { lines: [{ ...oneLine[0], quantity: 0 }] }, "lines.0.quantity"],
      ["a negative quantity", { lines: [{ ...oneLine[0], quantity: -1 }] }, "lines.0.quantity"],
      [
        "four decimals of quantity",
        { lines: [{ ...oneLine[0], quantity: 1.0005 }] },
        "lines.0.quantity",
      ],
      ["a quantity as text", { lines: [{ ...oneLine[0], quantity: "2" }] }, "lines.0.quantity"],
      ["a negative price", { lines: [{ ...oneLine[0], unitPrice: -1 }] }, "lines.0.unitPrice"],
      [
        "a price with three decimals",
        { lines: [{ ...oneLine[0], unitPrice: 1.005 }] },
        "lines.0.unitPrice",
      ],
      [
        "a line discount above 100",
        { lines: [{ ...oneLine[0], discountPercent: 101 }] },
        "lines.0.discountPercent",
      ],
      ["a tax rate above 100", { lines: [{ ...oneLine[0], taxRate: 100.01 }] }, "lines.0.taxRate"],
      [
        "an empty description",
        { lines: [{ ...oneLine[0], description: " " }] },
        "lines.0.description",
      ],
      ["a line total in a line", { lines: [{ ...oneLine[0], lineTotal: 1 }] }, "lines.0"],
      ["101 lines", { lines: Array.from({ length: 101 }, () => oneLine[0]) }, "lines"],
      ["an unknown discount type", { discountType: "FIXED" }, "discountType"],
      ["a negative discount", { discountType: "AMOUNT", discountValue: -5 }, "discountValue"],
      [
        "a percentage discount above 100",
        { discountType: "PERCENT", discountValue: 100.01 },
        "discountValue",
      ],
      ["an issue date that is not a day", { issueDate: "20/11/2026" }, "issueDate"],
      ["a day that does not exist", { validUntil: "2026-02-30" }, "validUntil"],
      [
        "a validUntil before the issue date",
        { issueDate: "2026-11-20", validUntil: "2026-11-19" },
        "validUntil",
      ],
      ["notes of 5001 characters", { notes: "n".repeat(5001) }, "notes"],
    ])("answers VALIDATION_FAILED for %s", async (_name, change, path) => {
      const response = await asRavi
        .post(QUOTES)
        .send({ opportunityId: opportunity.id, lines: oneLine, ...change });

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(detailPaths(response)).toEqual([path]);
      expect(await prisma.quote.count()).toBe(0);
    });

    it.each(["number", "status", "total", "subtotal", "taxTotal", "createdById", "sentAt"])(
      "does not let a request set %s",
      async (key) => {
        const response = await asRavi
          .post(QUOTES)
          .send({ opportunityId: opportunity.id, [key]: "Q-9999" });

        expect(response.status).toBe(400);
        expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      },
    );

    it("refuses a line too large to store, on its quantity", async () => {
      const response = await asRavi.post(QUOTES).send({
        opportunityId: opportunity.id,
        lines: [{ description: "Everything", quantity: 9_999_999, unitPrice: 9_999_999_999.99 }],
      });

      expect(response.status).toBe(400);
      expect(detailPaths(response)).toEqual(["lines.0.quantity"]);
    });

    it("refuses an opportunity, a contact or a company the caller may not see, on the field", async () => {
      const hidden = { ownerId: tara.id, createdById: tara.id };
      const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { kind: "OPEN" } });
      const theirs = await prisma.opportunity.create({
        data: { ...hidden, name: "Tara's deal", stageId: stage.id },
      });
      const theirContact = await prisma.contact.create({
        data: { ...hidden, firstName: "Zed", lastName: "Hidden" },
      });
      const theirCompany = await prisma.company.create({ data: { ...hidden, name: "Hidden Ltd" } });

      const cases: [Record<string, unknown>, string][] = [
        [{ opportunityId: theirs.id }, "opportunityId"],
        [{ opportunityId: UNKNOWN_ID }, "opportunityId"],
        [{ opportunityId: opportunity.id, contactId: theirContact.id }, "contactId"],
        [{ opportunityId: opportunity.id, contactId: UNKNOWN_ID }, "contactId"],
        [{ opportunityId: opportunity.id, companyId: theirCompany.id }, "companyId"],
      ];
      for (const [body, path] of cases) {
        const response = await asRavi.post(QUOTES).send(body);

        expect(response.status).toBe(400);
        expect(detailPaths(response)).toEqual([path]);
      }
      expect(await prisma.quote.count()).toBe(0);
    });
  });
});

describe("who may see and change a quote", () => {
  const WRITES: [
    string,
    "post" | "patch" | "delete",
    string,
    Record<string, unknown> | undefined,
  ][] = [
    ["PATCH", "patch", "", { notes: "Changed" }],
    ["send", "post", "/send", undefined],
    ["accept", "post", "/accept", undefined],
    ["decline", "post", "/decline", undefined],
    ["reopen", "post", "/reopen", undefined],
    ["duplicate", "post", "/duplicate", undefined],
    ["invoice", "post", "/invoice", undefined],
    ["DELETE", "delete", "", undefined],
  ];
  const READS = ["", "/document"];

  it("answers NOT_FOUND on every route for a quote of an opportunity outside the caller's reach", async () => {
    const quote = await makeQuote();

    for (const path of READS) {
      const response = await asTara.get(`${QUOTES}/${quote.id}${path}`);
      const unknown = await asTara.get(`${QUOTES}/${UNKNOWN_ID}${path}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual(unknown.body);
    }
    for (const [name, method, path, body] of WRITES) {
      const response = await asTara[method](`${QUOTES}/${quote.id}${path}`).send(body);

      expect(response.status, name).toBe(404);
      expect(errorOf(response).code, name).toBe("NOT_FOUND");
    }
    expect(quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`))).toEqual(quote);
    expect(numbersOf(await asTara.get(QUOTES))).toEqual([]);
  });

  it("lets a Read-only user read every quote and change none", async () => {
    const quote = await makeQuote();

    for (const path of READS) {
      expect((await asViewer.get(`${QUOTES}/${quote.id}${path}`)).status).toBe(200);
    }
    expect(numbersOf(await asViewer.get(QUOTES))).toEqual(["Q-0001"]);
    const create = await asViewer.post(QUOTES).send({ opportunityId: opportunity.id });
    expect(create.status).toBe(403);
    for (const [name, method, path, body] of WRITES) {
      const response = await asViewer[method](`${QUOTES}/${quote.id}${path}`).send(body);

      expect(response.status, name).toBe(403);
      expect(errorOf(response).code, name).toBe("FORBIDDEN");
    }
    expect(quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`))).toEqual(quote);
  });

  it("lets the owner's manager and an Admin work on the quote", async () => {
    const quote = await makeQuote();

    const byManager = await asMeera.patch(`${QUOTES}/${quote.id}`).send({ notes: "From Meera" });
    const byAdmin = await asAdmin.post(`${QUOTES}/${quote.id}/send`);
    const made = await makeQuote({}, asMeera);

    expect(quoteOf(byManager).notes).toBe("From Meera");
    expect(quoteOf(byAdmin).status).toBe("SENT");
    expect(made.createdBy).toEqual({ id: meera.id, name: "Meera Manager" });
    expect(numbersOf(await asMeera.get(`${QUOTES}?sort=number&order=asc`))).toEqual([
      "Q-0001",
      "Q-0002",
    ]);
  });

  it("follows the opportunity when it changes hands or is deleted", async () => {
    const quote = await makeQuote();

    await prisma.opportunity.update({ where: { id: opportunity.id }, data: { ownerId: tara.id } });
    expect((await asRavi.get(`${QUOTES}/${quote.id}`)).status).toBe(404);
    expect((await asTara.get(`${QUOTES}/${quote.id}`)).status).toBe(200);
    expect(numbersOf(await asTara.get(QUOTES))).toEqual(["Q-0001"]);

    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: { deletedAt: new Date() },
    });
    expect((await asTara.get(`${QUOTES}/${quote.id}`)).status).toBe(404);
    expect((await asAdmin.get(`${QUOTES}/${quote.id}`)).status).toBe(404);
    expect(numbersOf(await asAdmin.get(QUOTES))).toEqual([]);
  });
});

describe("PATCH /quotes/:id", () => {
  it("changes only the keys sent and counts the totals again", async () => {
    const quote = await makeQuote({ notes: "Keep me" });

    const response = await asRavi
      .patch(`${QUOTES}/${quote.id}`)
      .send({ discountType: "PERCENT", discountValue: 10, validUntil: null });

    expect(response.status).toBe(200);
    expect(quoteOf(response)).toMatchObject({
      number: "Q-0001",
      notes: "Keep me",
      validUntil: null,
      contact: { id: contact.id },
      // 1000.00 less 10%; 10% tax on 900.00.
      subtotal: 1000,
      discountTotal: 100,
      taxTotal: 90,
      total: 990,
    });
    // The lines were not sent, so they are the same rows.
    expect(quoteOf(response).lines).toEqual(quote.lines);
    // Editing is not history.
    expect(await statusChanges()).toEqual([[null, "DRAFT"]]);
  });

  it("replaces the whole list of lines", async () => {
    const quote = await makeQuote();

    const response = await asRavi.patch(`${QUOTES}/${quote.id}`).send({
      lines: [
        { productId: licence.id, quantity: 3 },
        { description: "Setup", quantity: 1, unitPrice: 100, taxRate: 0 },
      ],
    });

    expect(quoteOf(response).lines.map((line) => line.description)).toEqual([
      "Fleet tracking licence",
      "Setup",
    ]);
    expect(quoteOf(response)).toMatchObject({ subtotal: 187, taxTotal: 7.18, total: 194.18 });
    expect(await prisma.quoteLine.count()).toBe(2);

    const emptied = await asRavi.patch(`${QUOTES}/${quote.id}`).send({ lines: [] });
    expect(quoteOf(emptied)).toMatchObject({ lines: [], subtotal: 0, total: 0 });
  });

  it("forgets the discount value when the discount is switched off", async () => {
    const quote = await makeQuote({ discountType: "AMOUNT", discountValue: 100 });

    const off = await asRavi.patch(`${QUOTES}/${quote.id}`).send({ discountType: "NONE" });
    const percent = await asRavi.patch(`${QUOTES}/${quote.id}`).send({ discountType: "PERCENT" });

    expect(quoteOf(off)).toMatchObject({ discountValue: 0, discountTotal: 0, total: 1100 });
    expect(quoteOf(percent)).toMatchObject({ discountValue: 0, discountTotal: 0 });
  });

  it("does not follow a product that changes after the line was added", async () => {
    const quote = await makeQuote({ lines: [{ productId: licence.id, quantity: 10 }] });

    await prisma.product.update({
      where: { id: licence.id },
      data: { name: "Renamed", unitPrice: 99, taxRate: 20 },
    });
    const read = quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`));
    // The form sends the lines back as it got them, with one more.
    const saved = await asRavi.patch(`${QUOTES}/${quote.id}`).send({
      lines: [
        ...read.lines.map(({ id: _id, lineTotal: _lineTotal, ...line }) => line),
        { productId: licence.id, quantity: 1 },
      ],
    });

    expect(read.lines[0]).toMatchObject({
      description: "Fleet tracking licence",
      unitPrice: 29,
      taxRate: 8.25,
      lineTotal: 290,
    });
    expect(
      quoteOf(saved).lines.map((line) => [line.description, line.unitPrice, line.taxRate]),
    ).toEqual([
      ["Fleet tracking licence", 29, 8.25],
      // A line added now takes the product as it is now.
      ["Renamed", 99, 20],
    ]);
  });

  it("keeps an archived product on a line that has it, but does not add it to another quote", async () => {
    const quote = await makeQuote({ lines: [{ productId: licence.id, quantity: 1 }] });
    const other = await makeQuote();
    await prisma.product.update({ where: { id: licence.id }, data: { active: false } });

    const kept = await asRavi
      .patch(`${QUOTES}/${quote.id}`)
      .send({ lines: [{ productId: licence.id, quantity: 2 }] });
    const added = await asRavi
      .patch(`${QUOTES}/${other.id}`)
      .send({ lines: [{ productId: licence.id, quantity: 2 }] });

    expect(kept.status).toBe(200);
    expect(quoteOf(kept).lines[0]).toMatchObject({ productId: licence.id, quantity: 2 });
    expect(added.status).toBe(400);
    expect(detailPaths(added)).toEqual(["lines.0.productId"]);
  });

  it("does not take the opportunity, and checks what it takes like POST does", async () => {
    const quote = await makeQuote({ issueDate: "2026-11-20" });

    const moved = await asRavi
      .patch(`${QUOTES}/${quote.id}`)
      .send({ opportunityId: opportunity.id });
    const early = await asRavi.patch(`${QUOTES}/${quote.id}`).send({ validUntil: "2026-11-01" });
    const late = await asRavi.patch(`${QUOTES}/${quote.id}`).send({ issueDate: "2027-06-01" });
    const percent = await asRavi
      .patch(`${QUOTES}/${quote.id}`)
      .send({ discountType: "PERCENT", discountValue: 150 });

    expect(moved.status).toBe(400);
    expect(detailPaths(early)).toEqual(["validUntil"]);
    expect(detailPaths(late)).toEqual(["validUntil"]);
    expect(detailPaths(percent)).toEqual(["discountValue"]);
  });

  it.each(["SENT", "ACCEPTED", "DECLINED"] as const)(
    "answers QUOTE_NOT_EDITABLE for a quote that is %s, and for deleting it",
    async (status) => {
      const quote = await quoteIn(status);

      const patched = await asRavi.patch(`${QUOTES}/${quote.id}`).send({ notes: "Too late" });
      const deleted = await asRavi.delete(`${QUOTES}/${quote.id}`);

      for (const response of [patched, deleted]) {
        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          error: {
            code: "QUOTE_NOT_EDITABLE",
            message: "Only a draft quote can be changed or deleted. Reopen the quote first.",
            details: null,
          },
        });
      }
      expect(quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`))).toEqual(quote);
    },
  );
});

describe("DELETE /quotes/:id", () => {
  it("deletes a draft for real, leaves a trace on the timeline and does not reuse its number", async () => {
    const quote = await makeQuote();

    const response = await asRavi.delete(`${QUOTES}/${quote.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: null, meta: {} });
    expect(await prisma.quote.count()).toBe(0);
    expect(await prisma.quoteLine.count()).toBe(0);
    expect((await asRavi.get(`${QUOTES}/${quote.id}`)).status).toBe(404);
    expect((await timeline())[0]).toMatchObject({
      kind: "QUOTE_STATUS",
      details: { quote: { id: quote.id, number: "Q-0001" }, from: "DRAFT", to: null, total: 1100 },
    });
    expect((await makeQuote()).number).toBe("Q-0002");
  });
});

describe("POST /quotes/:id/duplicate", () => {
  it.each(["DRAFT", "SENT", "ACCEPTED", "DECLINED"] as const)(
    "makes a new draft from a quote that is %s",
    async (status) => {
      const quote = await quoteIn(status, {
        issueDate: "2026-01-10",
        validUntil: "2026-01-20",
        discountType: "PERCENT",
        discountValue: 10,
        notes: "Notes",
        terms: "Terms",
        lines: [{ productId: licence.id, quantity: 4, discountPercent: 5 }, ...oneLine],
      });

      const response = await asMeera.post(`${QUOTES}/${quote.id}/duplicate`);
      const copy = quoteOf(response);

      expect(response.status).toBe(201);
      expect(copy).toMatchObject({
        number: "Q-0002",
        status: "DRAFT",
        issueDate: TODAY,
        validUntil: addDays(TODAY, 30),
        sentAt: null,
        acceptedAt: null,
        declinedAt: null,
        invoice: null,
        createdBy: { id: meera.id },
        contact: quote.contact,
        company: quote.company,
        discountType: "PERCENT",
        discountValue: 10,
        subtotal: quote.subtotal,
        taxTotal: quote.taxTotal,
        total: quote.total,
        notes: "Notes",
        terms: "Terms",
      });
      expect(copy.id).not.toBe(quote.id);
      expect(copy.lines.map(({ id: _id, ...line }) => line)).toEqual(
        quote.lines.map(({ id: _id, ...line }) => line),
      );
      expect(copy.lines[0]?.id).not.toBe(quote.lines[0]?.id);
      // The original is left as it was.
      expect(quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`))).toEqual(quote);
    },
  );
});

describe("the status of a quote", () => {
  // What each action does to a quote in each status: the new status, or the refusal.
  const TABLE: [Status, string, Status | "INVALID_STATUS_CHANGE"][] = [
    ["DRAFT", "send", "SENT"],
    ["DRAFT", "accept", "ACCEPTED"],
    ["DRAFT", "decline", "DECLINED"],
    ["DRAFT", "reopen", "INVALID_STATUS_CHANGE"],
    ["SENT", "send", "INVALID_STATUS_CHANGE"],
    ["SENT", "accept", "ACCEPTED"],
    ["SENT", "decline", "DECLINED"],
    ["SENT", "reopen", "DRAFT"],
    ["ACCEPTED", "send", "INVALID_STATUS_CHANGE"],
    ["ACCEPTED", "accept", "INVALID_STATUS_CHANGE"],
    ["ACCEPTED", "decline", "INVALID_STATUS_CHANGE"],
    ["ACCEPTED", "reopen", "DRAFT"],
    ["DECLINED", "send", "INVALID_STATUS_CHANGE"],
    ["DECLINED", "accept", "INVALID_STATUS_CHANGE"],
    ["DECLINED", "decline", "INVALID_STATUS_CHANGE"],
    ["DECLINED", "reopen", "DRAFT"],
  ];

  it.each(TABLE)("%s, then %s: %s", async (from, action, outcome) => {
    const quote = await quoteIn(from);
    const before = await statusChanges();

    const response = await asRavi.post(`${QUOTES}/${quote.id}/${action}`);

    if (outcome === "INVALID_STATUS_CHANGE") {
      expect(response.status).toBe(409);
      expect(errorOf(response).code).toBe("INVALID_STATUS_CHANGE");
      expect(errorOf(response).details).toEqual({ status: from });
      expect(quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`))).toEqual(quote);
      expect(await statusChanges()).toEqual(before);
    } else {
      expect(response.status).toBe(200);
      expect(quoteOf(response).status).toBe(outcome);
      expect(await statusChanges()).toEqual([[from, outcome], ...before]);
    }
  });

  it("stamps each step, and clears the stamps when the quote is reopened", async () => {
    const quote = await makeQuote();

    const sent = quoteOf(await asRavi.post(`${QUOTES}/${quote.id}/send`));
    const accepted = quoteOf(await asRavi.post(`${QUOTES}/${quote.id}/accept`));
    const reopened = quoteOf(await asRavi.post(`${QUOTES}/${quote.id}/reopen`));
    const declined = quoteOf(await asRavi.post(`${QUOTES}/${quote.id}/decline`));

    expect(sent).toMatchObject({ sentAt: expect.any(String) as string, acceptedAt: null });
    expect(accepted).toMatchObject({
      sentAt: sent.sentAt,
      acceptedAt: expect.any(String) as string,
      declinedAt: null,
    });
    expect(reopened).toMatchObject({ sentAt: null, acceptedAt: null, declinedAt: null });
    expect(declined).toMatchObject({ acceptedAt: null, declinedAt: expect.any(String) as string });
    expect((await timeline("QUOTE_STATUS"))[0]).toMatchObject({
      details: {
        quote: { id: quote.id, number: "Q-0001" },
        from: "DRAFT",
        to: "DECLINED",
        total: 1100,
      },
      author: { id: ravi.id },
    });
    // The system filter of a timeline includes them.
    expect((await timeline("SYSTEM")).map((entry) => entry.kind)).toEqual(
      Array.from({ length: 5 }, () => "QUOTE_STATUS"),
    );
  });

  it("does not send or accept a quote without lines", async () => {
    const quote = await makeQuote({ lines: [] });

    for (const action of ["send", "accept"]) {
      const response = await asRavi.post(`${QUOTES}/${quote.id}/${action}`);

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
      expect(errorOf(response).details).toBeNull();
    }
    expect((await asRavi.post(`${QUOTES}/${quote.id}/decline`)).status).toBe(200);
  });

  it("does not close the opportunity when its quote is accepted", async () => {
    const quote = await quoteIn("ACCEPTED");

    const response = await asRavi.get(`${API}/opportunities/${opportunity.id}`);

    expect(quote.status).toBe("ACCEPTED");
    expect(response.body).toMatchObject({ data: { status: "OPEN", closedAt: null } });
  });

  it("lets one of two simultaneous answers win", async () => {
    const quote = await quoteIn("SENT");

    const responses = await Promise.all([
      asRavi.post(`${QUOTES}/${quote.id}/accept`),
      asMeera.post(`${QUOTES}/${quote.id}/decline`),
      asAdmin.post(`${QUOTES}/${quote.id}/accept`),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409]);
    expect(await statusChanges()).toHaveLength(3);
  });

  describe("EXPIRED", () => {
    it("is what a sent quote past its validUntil reads as, and nothing else", async () => {
      const yesterday = addDays(TODAY, -1);
      const body = { issueDate: addDays(TODAY, -10), validUntil: yesterday };
      const draft = await quoteIn("DRAFT", body);
      const sent = await quoteIn("SENT", body);
      const accepted = await quoteIn("ACCEPTED", body);
      const current = await quoteIn("SENT", { validUntil: TODAY });
      const open = await quoteIn("SENT", { validUntil: null });

      expect([draft, sent, accepted, current, open].map((quote) => quote.status)).toEqual([
        "DRAFT",
        "EXPIRED",
        "ACCEPTED",
        "SENT",
        "SENT",
      ]);
      expect(numbersOf(await asRavi.get(`${QUOTES}?status=EXPIRED`))).toEqual([sent.number]);
      expect(numbersOf(await asRavi.get(`${QUOTES}?status=SENT&sort=number&order=asc`))).toEqual([
        current.number,
        open.number,
      ]);
      const document = await asRavi.get(`${QUOTES}/${sent.id}/document`);
      expect(document.body).toMatchObject({ data: { status: "EXPIRED" } });
      // Nothing is stored.
      expect((await prisma.quote.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe(
        "SENT",
      );
    });

    it("goes by the viewer's calendar day", async () => {
      const zone = zoneOnAnotherDay();
      // In a zone that is a day ahead, a quote valid until the UTC today has run out; in a
      // zone that is a day behind, one that ran out yesterday (UTC) is still good.
      const ahead = zone.timeZone === "Pacific/Kiritimati";
      const quote = await quoteIn("SENT", {
        issueDate: addDays(TODAY, -10),
        validUntil: ahead ? TODAY : addDays(TODAY, -1),
      });

      const inUtc = quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`));
      const inZone = quoteOf(await asRavi.get(`${QUOTES}/${quote.id}?tz=${zone.timeZone}`));
      const listed = await asRavi.get(`${QUOTES}?status=EXPIRED&tz=${zone.timeZone}`);

      expect(inUtc.status).toBe(ahead ? "SENT" : "EXPIRED");
      expect(inZone.status).toBe(ahead ? "EXPIRED" : "SENT");
      expect(numbersOf(listed)).toEqual(ahead ? [quote.number] : []);
    });

    it("can still be accepted, declined or reopened", async () => {
      const body = { issueDate: addDays(TODAY, -10), validUntil: addDays(TODAY, -1) };
      const accepted = await quoteIn("SENT", body);
      const reopened = await quoteIn("SENT", body);

      expect(quoteOf(await asRavi.post(`${QUOTES}/${accepted.id}/accept`)).status).toBe("ACCEPTED");
      expect(quoteOf(await asRavi.post(`${QUOTES}/${reopened.id}/reopen`)).status).toBe("DRAFT");
    });

    it("answers VALIDATION_FAILED for a tz that is not a time zone, on every kind of route", async () => {
      const quote = await makeQuote();

      const responses = await Promise.all([
        asRavi.get(`${QUOTES}?tz=Mars/Olympus`),
        asRavi.get(`${QUOTES}/${quote.id}?tz=Mars/Olympus`),
        asRavi.post(`${QUOTES}/${quote.id}/send?tz=Mars/Olympus`),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(400);
        expect(detailPaths(response)).toEqual(["tz"]);
      }
      expect(quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`)).status).toBe("DRAFT");
    });
  });
});

describe("POST /quotes/:id/send with an email", () => {
  const email = {
    to: ["elena@northwind.example"],
    cc: ["office@northwind.example"],
    subject: "Quote {{quote.number}} for {{company.name}}",
    body: "Hi {{contact.firstName}},\n\nHere is our quote of {{quote.total}} for {{opportunity.name}}.\n\n{{sender.name}}",
  };

  async function makeQuoteToSend(): Promise<Quote> {
    return makeQuote({
      issueDate: "2026-11-01",
      validUntil: "2026-12-01",
      discountType: "AMOUNT",
      discountValue: 61,
      lines: [
        { productId: licence.id, quantity: 10, discountPercent: 10 },
        { description: "Onboarding package", quantity: 1.5, unitPrice: 1200, taxRate: 0 },
      ],
    });
  }

  it("emails the quote with its lines and totals as text, then marks it sent", async () => {
    const send = await useFakeMailServer();
    const quote = await makeQuoteToSend();

    const response = await asRavi.post(`${QUOTES}/${quote.id}/send`).send({ email });

    // 10 x 29.00 less 10% = 261.00; 1.5 x 1200.00 = 1800.00; subtotal 2061.00, discount
    // 61.00; 8.25% tax on 261.00 x 2000/2061 = 253.275..., which is 20.895....
    const text = [
      "Hi Elena,",
      "",
      "Here is our quote of $2,020.90 for Fleet tracking rollout.",
      "",
      "Ravi Rep",
      "",
      "Quote Q-0001",
      "Issued 2026-11-01, valid until 2026-12-01",
      "",
      "10 x Fleet tracking licence @ $29.00 (10% off): $261.00",
      "1.5 x Onboarding package @ $1,200.00: $1,800.00",
      "",
      "Subtotal: $2,061.00",
      "Discount: -$61.00",
      "Tax: $20.90",
      "Total: $2,020.90",
    ].join("\n");
    expect(response.status).toBe(200);
    expect(quoteOf(response)).toMatchObject({
      status: "SENT",
      sentAt: expect.any(String) as string,
      total: 2020.9,
    });
    expect(send).toHaveBeenCalledExactlyOnceWith({
      from: { name: "Ravi Rep", address: "test@opencrm.local" },
      replyTo: "ravi@example.com",
      to: ["elena@northwind.example"],
      cc: ["office@northwind.example"],
      subject: "Quote Q-0001 for Northwind Logistics",
      text,
    });
    // On the opportunity's timeline: the email, and the change of status.
    const entries = await timeline();
    expect(entries.map((entry) => entry.kind).sort()).toEqual([
      "EMAIL",
      "QUOTE_STATUS",
      "QUOTE_STATUS",
    ]);
    expect(entries.find((entry) => entry.kind === "EMAIL")).toMatchObject({
      body: text,
      details: {
        to: ["elena@northwind.example"],
        cc: ["office@northwind.example"],
        subject: "Quote Q-0001 for Northwind Logistics",
        status: "SENT",
        templateId: null,
        quote: { id: quote.id, number: "Q-0001" },
      },
      author: { id: ravi.id, name: "Ravi Rep" },
    });
    expect(await statusChanges()).toEqual([
      ["DRAFT", "SENT"],
      [null, "DRAFT"],
    ]);
    const after = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
    expect(after.lastContactAt).not.toBeNull();
  });

  it("emails a quote that was already sent again, without a second change of status", async () => {
    const send = await useFakeMailServer();
    const quote = await quoteIn("SENT");

    const response = await asRavi.post(`${QUOTES}/${quote.id}/send`).send({ email });

    expect(response.status).toBe(200);
    expect(quoteOf(response).status).toBe("SENT");
    expect(send).toHaveBeenCalledTimes(1);
    expect(await statusChanges()).toEqual([
      ["DRAFT", "SENT"],
      [null, "DRAFT"],
    ]);
    expect(await timeline("EMAIL")).toHaveLength(1);
  });

  it("leaves the quote a draft when email is off", async () => {
    const quote = await makeQuoteToSend();

    const response = await asRavi.post(`${QUOTES}/${quote.id}/send`).send({ email });

    expect(response.status).toBe(409);
    expect(errorOf(response).code).toBe("EMAIL_NOT_CONFIGURED");
    expect(quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`))).toEqual(quote);
    expect(await statusChanges()).toEqual([[null, "DRAFT"]]);
    // Marking it sent without an email still works.
    expect(quoteOf(await asRavi.post(`${QUOTES}/${quote.id}/send`)).status).toBe("SENT");
  });

  it("leaves the quote a draft and writes nothing when the mail server refuses", async () => {
    await useFakeMailServer();
    useFailingMailServer("ETIMEDOUT");
    const quote = await makeQuoteToSend();

    const response = await asRavi.post(`${QUOTES}/${quote.id}/send`).send({ email });

    expect(response.status).toBe(502);
    expect(errorOf(response).code).toBe("EMAIL_SEND_FAILED");
    expect(response.text).not.toContain(MAIL_SERVER_TEXT);
    expect(quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`))).toEqual(quote);
    expect(await timeline("EMAIL")).toEqual([]);
    expect(await statusChanges()).toEqual([[null, "DRAFT"]]);
  });

  it("sends nothing for a quote that cannot be sent", async () => {
    const send = await useFakeMailServer();
    const accepted = await quoteIn("ACCEPTED");
    const empty = await makeQuote({ lines: [] });

    const first = await asRavi.post(`${QUOTES}/${accepted.id}/send`).send({ email });
    const second = await asRavi.post(`${QUOTES}/${empty.id}/send`).send({ email });
    const outsider = await asTara.post(`${QUOTES}/${empty.id}/send`).send({ email });
    const viewer = await asViewer.post(`${QUOTES}/${empty.id}/send`).send({ email });

    expect([first.status, second.status, outsider.status, viewer.status]).toEqual([
      409, 400, 404, 403,
    ]);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["no recipient", { to: [] }, "email.to"],
    ["a recipient that is not an email", { to: ["elena"] }, "email.to.0"],
    ["an empty subject", { subject: "" }, "email.subject"],
    ["an empty body", { body: " " }, "email.body"],
    ["an attachment", { attachments: ["quote.pdf"] }, "email"],
  ])("answers VALIDATION_FAILED for %s", async (_name, change, path) => {
    const quote = await makeQuote();

    const response = await asRavi
      .post(`${QUOTES}/${quote.id}/send`)
      .send({ email: { ...email, ...change } });

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual([path]);
    expect(quoteOf(await asRavi.get(`${QUOTES}/${quote.id}`)).status).toBe("DRAFT");
  });
});

describe("GET /quotes", () => {
  let other: Opportunity;
  let first: Quote;
  let second: Quote;
  let third: Quote;

  // Q-0001 draft 1100.00 (Ravi, Northwind); Q-0002 sent 550.00 (Ravi, Northwind);
  // Q-0003 accepted 2200.00 on Tara's opportunity for Kestrel.
  beforeEach(async () => {
    const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { kind: "OPEN" } });
    const kestrel = await prisma.company.create({
      data: { name: "Kestrel Robotics", ownerId: tara.id, createdById: tara.id },
    });
    other = await prisma.opportunity.create({
      data: {
        name: "Vision platform",
        stageId: stage.id,
        companyId: kestrel.id,
        ownerId: tara.id,
        createdById: tara.id,
      },
    });
    first = await makeQuote({ issueDate: "2026-11-03", validUntil: "2099-01-01" });
    second = await quoteIn("SENT", {
      issueDate: "2026-11-01",
      validUntil: null,
      lines: [{ ...oneLine[0], quantity: 1 }],
    });
    const response = await asTara.post(QUOTES).send({
      opportunityId: other.id,
      issueDate: "2026-11-02",
      validUntil: "2098-01-01",
      lines: [{ ...oneLine[0], quantity: 4 }],
    });
    third = quoteOf(response);
    await asTara.post(`${QUOTES}/${third.id}/accept`);
  });

  it("lists what the caller may see, newest first, with the total", async () => {
    const forAdmin = await asAdmin.get(QUOTES);

    expect(forAdmin.status).toBe(200);
    expect(numbersOf(forAdmin)).toEqual(["Q-0003", "Q-0002", "Q-0001"]);
    expect(forAdmin.body).toMatchObject({ meta: { page: 1, pageSize: 25, total: 3 } });
    expect(numbersOf(await asRavi.get(QUOTES))).toEqual(["Q-0002", "Q-0001"]);
    expect(numbersOf(await asMeera.get(QUOTES))).toEqual(["Q-0002", "Q-0001"]);
    expect(numbersOf(await asTara.get(QUOTES))).toEqual(["Q-0003"]);
    expect(numbersOf(await asViewer.get(QUOTES))).toEqual(["Q-0003", "Q-0002", "Q-0001"]);
    expect((forAdmin.body as Envelope<Quote[]>).data[2]).toEqual(first);
  });

  it("filters by status, opportunity, owner of the opportunity and company", async () => {
    const list = async (query: string, agent = asAdmin) =>
      numbersOf(await agent.get(`${QUOTES}?sort=number&order=asc&${query}`));

    expect(await list("status=DRAFT")).toEqual(["Q-0001"]);
    expect(await list("status=SENT")).toEqual(["Q-0002"]);
    expect(await list("status=ACCEPTED")).toEqual(["Q-0003"]);
    expect(await list("status=DECLINED")).toEqual([]);
    expect(await list(`opportunityId=${opportunity.id}`)).toEqual(["Q-0001", "Q-0002"]);
    expect(await list(`ownerId=${tara.id}`)).toEqual(["Q-0003"]);
    expect(await list(`companyId=${company.id}`)).toEqual(["Q-0001", "Q-0002"]);
    expect(await list(`ownerId=${ravi.id}&status=SENT`)).toEqual(["Q-0002"]);
    // A filter narrows the list; it never shows what the caller may not see.
    expect(await list(`opportunityId=${other.id}`, asRavi)).toEqual([]);
    expect(await list(`ownerId=${tara.id}`, asRavi)).toEqual([]);
  });

  it("searches the number, the opportunity's name and the company's name", async () => {
    const search = async (text: string, agent = asAdmin) =>
      numbersOf(await agent.get(`${QUOTES}?sort=number&order=asc&search=${text}`));

    expect(await search("q-0002")).toEqual(["Q-0002"]);
    expect(await search("fleet")).toEqual(["Q-0001", "Q-0002"]);
    expect(await search("kestrel")).toEqual(["Q-0003"]);
    expect(await search("vision%20q-0003")).toEqual(["Q-0003"]);
    expect(await search("vision%20fleet")).toEqual([]);
    expect(await search("kestrel", asRavi)).toEqual([]);
    expect(await search("%25")).toEqual([]);
  });

  it("sorts by number, issue date, validUntil with none last, and total", async () => {
    const sorted = async (query: string) => numbersOf(await asAdmin.get(`${QUOTES}?${query}`));

    expect(await sorted("sort=number&order=asc")).toEqual(["Q-0001", "Q-0002", "Q-0003"]);
    expect(await sorted("sort=number&order=desc")).toEqual(["Q-0003", "Q-0002", "Q-0001"]);
    expect(await sorted("sort=issueDate&order=asc")).toEqual(["Q-0002", "Q-0003", "Q-0001"]);
    expect(await sorted("sort=total&order=desc")).toEqual(["Q-0003", "Q-0001", "Q-0002"]);
    expect(await sorted("sort=validUntil&order=asc")).toEqual(["Q-0003", "Q-0001", "Q-0002"]);
    expect(await sorted("sort=validUntil&order=desc")).toEqual(["Q-0001", "Q-0003", "Q-0002"]);
  });

  it("sorts ten or more numbers as numbers", async () => {
    await prisma.documentCounter.update({ where: { name: "quote" }, data: { value: 9999 } });
    const big = await makeQuote();

    expect(big.number).toBe("Q-10000");
    expect(numbersOf(await asRavi.get(`${QUOTES}?sort=number&order=desc`))).toEqual([
      "Q-10000",
      "Q-0002",
      "Q-0001",
    ]);
  });

  it("pages", async () => {
    const page = await asAdmin.get(`${QUOTES}?sort=number&order=asc&pageSize=2&page=2`);

    expect(numbersOf(page)).toEqual(["Q-0003"]);
    expect(page.body).toMatchObject({ meta: { page: 2, pageSize: 2, total: 3 } });
  });

  it.each([
    ["status=OPEN", "status"],
    ["sort=status", "sort"],
    ["opportunityId=7", "opportunityId"],
    ["ownerId=me", "ownerId"],
    ["page=0", "page"],
  ])("answers VALIDATION_FAILED for %s", async (query, path) => {
    const response = await asAdmin.get(`${QUOTES}?${query}`);

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual([path]);
  });

  it("exports the same list as a CSV file", async () => {
    const response = await asRavi.get(`${QUOTES}/export?sort=number&order=asc&status=SENT`);
    const rows = parseCsv(response.text.slice(1));

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="quotes-${TODAY}.csv"`,
    );
    expect(response.headers["x-export-truncated"]).toBe("false");
    expect(rows[0]).toEqual([
      "Number",
      "Opportunity",
      "Company",
      "Contact",
      "Status",
      "Issue date",
      "Valid until",
      "Subtotal",
      "Discount",
      "Tax",
      "Total",
      "Sent",
      "Accepted",
      "Declined",
      "Invoice",
      "Created by",
      "Created",
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.slice(0, 11)).toEqual([
      "Q-0002",
      "Fleet tracking rollout",
      "Northwind Logistics",
      "Elena Rostova",
      "Sent",
      "2026-11-01",
      "",
      "500",
      "0",
      "50",
      "550",
    ]);
    expect(rows[1]?.[15]).toBe("Ravi Rep");
    expect(second.total).toBe(550);
    expect((await asTara.get(`${QUOTES}/export`)).text).not.toContain("Q-0002");
  });
});

describe("GET /quotes/:id/document", () => {
  it("answers everything a print view needs", async () => {
    await prisma.organizationSettings.create({
      data: {
        name: "Acme Fleet Ltd",
        address: "5 Dock Street\nLeeds",
        email: "sales@acme.example",
        phone: "+44 113 496 0000",
        taxId: "GB 999",
      },
    });
    const quote = await makeQuote({
      issueDate: "2026-11-01",
      validUntil: "2026-12-01",
      discountType: "PERCENT",
      discountValue: 10,
      notes: "Delivery in January.",
      terms: "Payment within 30 days.",
      lines: [
        { productId: licence.id, quantity: 10 },
        { description: "Extended warranty", quantity: 2, unitPrice: 50, taxRate: 20 },
        { description: "Onboarding", quantity: 1, unitPrice: 300, taxRate: 0 },
      ],
    });

    const response = await asViewer.get(`${QUOTES}/${quote.id}/document`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        kind: "QUOTE",
        number: "Q-0001",
        status: "DRAFT",
        currency: "USD",
        issueDate: "2026-11-01",
        validUntil: "2026-12-01",
        dueDate: null,
        paymentTermsDays: null,
        quoteNumber: null,
        seller: {
          name: "Acme Fleet Ltd",
          address: "5 Dock Street\nLeeds",
          email: "sales@acme.example",
          phone: "+44 113 496 0000",
          taxId: "GB 999",
        },
        buyer: {
          contactName: "Elena Rostova",
          contactEmail: "elena@northwind.example",
          companyName: "Northwind Logistics",
          companyAddress: "1 Harbour Road, Bristol",
        },
        opportunityName: "Fleet tracking rollout",
        preparedBy: { name: "Ravi Rep", email: "ravi@example.com" },
        lines: quote.lines,
        subtotal: 690,
        discountType: "PERCENT",
        discountValue: 10,
        discountTotal: 69,
        // 290.00 and 100.00 less 10%, each at its own rate; the 0% line has no row.
        taxes: [
          { rate: 8.25, taxableAmount: 261, taxAmount: 21.53 },
          { rate: 20, taxableAmount: 90, taxAmount: 18 },
        ],
        taxTotal: 39.53,
        total: 660.53,
        notes: "Delivery in January.",
        terms: "Payment within 30 days.",
      },
      meta: {},
    });
    expect(quote).toMatchObject({
      subtotal: 690,
      discountTotal: 69,
      taxTotal: 39.53,
      total: 660.53,
    });
  });

  it("has an empty seller until the organisation is set up, and an empty buyer when there is none", async () => {
    const quote = await makeQuote({ contactId: null, companyId: null });

    const response = await asRavi.get(`${QUOTES}/${quote.id}/document`);

    expect(response.body).toMatchObject({
      data: {
        seller: { name: "", address: null, email: null, phone: null, taxId: null },
        buyer: { contactName: null, contactEmail: null, companyName: null, companyAddress: null },
        taxes: [{ rate: 10, taxableAmount: 1000, taxAmount: 100 }],
      },
    });
  });
});
