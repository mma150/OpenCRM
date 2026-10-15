import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  binaryBody,
  createTestApp,
  createUser,
  type ErrorEnvelope,
  pdfPageCount,
  pdfText,
  resetDatabase,
  resetPipelineStages,
  resetRecords,
  signInAs,
  type ValidationDetail,
  zoneOnAnotherDay,
} from "../../../test/helpers";
import type {
  Company,
  Contact,
  InvoiceStatus,
  Opportunity,
  Product,
  User,
} from "../../generated/prisma/client";
import { parseCsv } from "../../lib/csv";
import { prisma } from "../../lib/prisma";
import { addDays } from "../../lib/sales-documents";
import { createSession } from "../../lib/sessions";

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

interface Invoice {
  id: string;
  number: string;
  quote: { id: string; number: string };
  opportunity: { id: string; name: string };
  contact: { id: string; name: string; email: string | null } | null;
  company: { id: string; name: string } | null;
  status: string;
  issueDate: string;
  dueDate: string;
  lines: Line[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

interface QuoteLike {
  id: string;
  number: string;
  status: string;
  lines: Line[];
  total: number;
  invoice: { id: string; number: string } | null;
}

interface TimelineEntry {
  kind: string;
  details: Record<string, unknown> | null;
  author: { id: string; name: string };
}

interface Summary {
  outstandingTotal: number;
  overdueTotal: number;
  paidThisMonthTotal: number;
  counts: Record<string, number>;
}

interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

type Agent = Awaited<ReturnType<typeof signInAs>>;

const API = "/api/v1";
const QUOTES = `${API}/quotes`;
const INVOICES = `${API}/invoices`;
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
let licence: Product;

function invoiceOf(response: request.Response): Invoice {
  return (response.body as Envelope<Invoice>).data;
}

function numbersOf(response: request.Response): string[] {
  return (response.body as Envelope<Invoice[]>).data.map((invoice) => invoice.number);
}

function errorOf(response: request.Response) {
  return (response.body as ErrorEnvelope).error;
}

function detailPaths(response: request.Response): string[] {
  return (errorOf(response).details as ValidationDetail[]).map((detail) => detail.path);
}

// 2 x 500.00 at 10% tax: 1100.00.
const oneLine = [{ description: "Consulting day", quantity: 2, unitPrice: 500, taxRate: 10 }];

// An accepted quote on Ravi's opportunity (or on another one), made through the routes.
async function acceptedQuote(
  body: Record<string, unknown> = {},
  agent: Agent = asRavi,
): Promise<QuoteLike> {
  const created = await agent
    .post(QUOTES)
    .send({ opportunityId: opportunity.id, lines: oneLine, ...body });
  expect(created.status).toBe(201);
  const { id } = (created.body as Envelope<QuoteLike>).data;
  const accepted = await agent.post(`${QUOTES}/${id}/accept`);
  expect(accepted.status).toBe(200);
  return (accepted.body as Envelope<QuoteLike>).data;
}

async function makeInvoice(
  quoteBody: Record<string, unknown> = {},
  invoiceBody: Record<string, unknown> = {},
  agent: Agent = asRavi,
): Promise<Invoice> {
  const quote = await acceptedQuote(quoteBody, agent);
  const response = await agent.post(`${QUOTES}/${quote.id}/invoice`).send(invoiceBody);
  expect(response.status).toBe(201);
  return invoiceOf(response);
}

// An invoice stored in the status asked for, set straight in the database.
async function invoiceIn(
  status: InvoiceStatus,
  data: Record<string, unknown> = {},
): Promise<Invoice> {
  const invoice = await makeInvoice();
  await prisma.invoice.update({ where: { id: invoice.id }, data: { status, ...data } });
  return invoiceOf(await asRavi.get(`${INVOICES}/${invoice.id}`));
}

async function timeline(kind = "INVOICE_STATUS"): Promise<TimelineEntry[]> {
  const response = await asAdmin.get(
    `${API}/opportunities/${opportunity.id}/timeline?kind=${kind}`,
  );
  expect(response.status).toBe(200);
  return (response.body as Envelope<TimelineEntry[]>).data;
}

async function statusChanges(): Promise<unknown[]> {
  return (await timeline()).map((entry) => [entry.details?.from, entry.details?.to]);
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
    data: { name: "Fleet tracking licence", unitPrice: 29, taxRate: 8.25 },
  });
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

describe("POST /quotes/:id/invoice", () => {
  it("makes the invoice of an accepted quote as a copy of it", async () => {
    await prisma.organizationSettings.create({ data: { invoicePaymentTermsDays: 14 } });
    const quote = await acceptedQuote({
      discountType: "PERCENT",
      discountValue: 10,
      notes: "Delivery in January.",
      terms: "Payment within 14 days.",
      lines: [{ productId: licence.id, quantity: 10, discountPercent: 5 }, ...oneLine],
    });

    const response = await asRavi.post(`${QUOTES}/${quote.id}/invoice`);

    expect(response.status).toBe(201);
    // 275.50 + 1000.00 = 1275.50, less 10% = 127.55; tax 20.46 (8.25% of 247.95) + 90.00.
    expect(response.body).toEqual({
      data: {
        id: expect.any(String) as string,
        number: "INV-0001",
        quote: { id: quote.id, number: "Q-0001" },
        opportunity: { id: opportunity.id, name: "Fleet tracking rollout" },
        contact: { id: contact.id, name: "Elena Rostova", email: "elena@northwind.example" },
        company: { id: company.id, name: "Northwind Logistics" },
        status: "DRAFT",
        issueDate: TODAY,
        dueDate: addDays(TODAY, 14),
        lines: quote.lines.map((line) => ({ ...line, id: expect.any(String) as string })),
        subtotal: 1275.5,
        discountTotal: 127.55,
        taxTotal: 110.46,
        total: 1258.41,
        notes: "Delivery in January.",
        terms: "Payment within 14 days.",
        sentAt: null,
        paidAt: null,
        createdBy: { id: ravi.id, name: "Ravi Rep" },
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      },
      meta: {},
    });
    const invoice = invoiceOf(response);
    expect(invoice.lines[0]?.id).not.toBe(quote.lines[0]?.id);
    expect(invoice.total).toBe(quote.total);
    // The quote names its invoice, and the opportunity's timeline has the entry.
    expect((await asRavi.get(`${QUOTES}/${quote.id}`)).body).toMatchObject({
      data: { status: "ACCEPTED", invoice: { id: invoice.id, number: "INV-0001" } },
    });
    expect(await timeline()).toEqual([
      expect.objectContaining({
        kind: "INVOICE_STATUS",
        details: {
          invoice: { id: invoice.id, number: "INV-0001" },
          from: null,
          to: "DRAFT",
          total: 1258.41,
        },
        author: { id: ravi.id, name: "Ravi Rep" },
      }),
    ]);
  });

  it("takes its own dates and notes", async () => {
    const quote = await acceptedQuote({ notes: "From the quote" });

    const response = await asRavi
      .post(`${QUOTES}/${quote.id}/invoice`)
      .send({ issueDate: "2026-11-20", dueDate: "2026-11-20", notes: "PO 4417" });

    expect(invoiceOf(response)).toMatchObject({
      issueDate: "2026-11-20",
      dueDate: "2026-11-20",
      notes: "PO 4417",
    });
  });

  it("counts the due date from the issue date and the payment terms (30 days by default)", async () => {
    const invoice = await makeInvoice({}, { issueDate: "2026-12-15", notes: null });

    expect(invoice).toMatchObject({ issueDate: "2026-12-15", dueDate: "2027-01-14", notes: null });
  });

  it("uses the viewer's today as the issue date", async () => {
    const zone = zoneOnAnotherDay();
    const quote = await acceptedQuote();

    const response = await asRavi.post(`${QUOTES}/${quote.id}/invoice?tz=${zone.timeZone}`);

    const tomorrow = zone.timeZone === "Pacific/Kiritimati";
    expect(invoiceOf(response).issueDate).toBe(addDays(TODAY, tomorrow ? 1 : -1));
  });

  it.each([
    [
      "a dueDate before the issue date",
      { issueDate: "2026-11-20", dueDate: "2026-11-19" },
      "dueDate",
    ],
    ["an issue date that is not a day", { issueDate: "tomorrow" }, "issueDate"],
    ["a total", { total: 1 }, ""],
    ["a status", { status: "PAID" }, ""],
    ["lines", { lines: [] }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_name, body, path) => {
    const quote = await acceptedQuote();

    const response = await asRavi.post(`${QUOTES}/${quote.id}/invoice`).send(body);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    expect(detailPaths(response)).toEqual([path]);
    expect(await prisma.invoice.count()).toBe(0);
  });

  it.each(["DRAFT", "SENT", "DECLINED"])(
    "answers INVALID_STATUS_CHANGE for a quote that is %s",
    async (status) => {
      const created = await asRavi
        .post(QUOTES)
        .send({ opportunityId: opportunity.id, lines: oneLine });
      const { id } = (created.body as Envelope<QuoteLike>).data;
      if (status === "SENT") {
        await asRavi.post(`${QUOTES}/${id}/send`);
      }
      if (status === "DECLINED") {
        await asRavi.post(`${QUOTES}/${id}/decline`);
      }

      const response = await asRavi.post(`${QUOTES}/${id}/invoice`);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: {
          code: "INVALID_STATUS_CHANGE",
          message: "Only an accepted quote can be turned into an invoice",
          details: { status },
        },
      });
      expect(await prisma.invoice.count()).toBe(0);
    },
  );

  it("answers INVOICE_EXISTS the second time, naming the invoice", async () => {
    const quote = await acceptedQuote();
    const first = invoiceOf(await asRavi.post(`${QUOTES}/${quote.id}/invoice`));

    const response = await asMeera.post(`${QUOTES}/${quote.id}/invoice`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "INVOICE_EXISTS",
        message: "This quote already has invoice INV-0001",
        details: { invoice: { id: first.id, number: "INV-0001" } },
      },
    });
    expect(await prisma.invoice.count()).toBe(1);
  });

  it("makes one invoice when five requests arrive together, and wastes no number", async () => {
    const quote = await acceptedQuote();

    const responses = await Promise.all(
      [asRavi, asMeera, asAdmin, asRavi, asMeera].map((agent) =>
        agent.post(`${QUOTES}/${quote.id}/invoice`),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(
      responses
        .filter((response) => response.status === 409)
        .map((response) => errorOf(response).code),
    ).toEqual(Array.from({ length: 4 }, () => "INVOICE_EXISTS"));
    expect(await prisma.invoice.count()).toBe(1);
    expect(await statusChanges()).toEqual([[null, "DRAFT"]]);
    // The refused requests, and one for a quote that is not accepted, used no number.
    const draft = await asRavi.post(QUOTES).send({ opportunityId: opportunity.id, lines: oneLine });
    await asRavi.post(`${QUOTES}/${(draft.body as Envelope<QuoteLike>).data.id}/invoice`);
    expect((await makeInvoice()).number).toBe("INV-0002");
  });

  it("numbers the invoices of ten quotes made at the same moment 1 to 10", async () => {
    const quotes: QuoteLike[] = [];
    for (let index = 0; index < 10; index += 1) {
      quotes.push(await acceptedQuote());
    }

    const responses = await Promise.all(
      quotes.map((quote) => asRavi.post(`${QUOTES}/${quote.id}/invoice`)),
    );

    expect(responses.map((response) => invoiceOf(response).number).sort()).toEqual(
      Array.from({ length: 10 }, (_, index) => `INV-${String(index + 1).padStart(4, "0")}`),
    );
  });

  it("locks the quote: it can no longer be reopened, changed or deleted", async () => {
    const invoice = await makeInvoice();
    const quote = `${QUOTES}/${invoice.quote.id}`;

    const reopened = await asRavi.post(`${quote}/reopen`);
    const patched = await asRavi.patch(quote).send({ notes: "x" });
    const deleted = await asRavi.delete(quote);

    expect(reopened.status).toBe(409);
    expect(reopened.body).toEqual({
      error: {
        code: "INVOICE_EXISTS",
        message: "Invoice INV-0001 was made from this quote, so it cannot be reopened",
        details: { invoice: { id: invoice.id, number: "INV-0001" } },
      },
    });
    expect([patched.status, deleted.status]).toEqual([409, 409]);
    // Also when the invoice is void.
    await asRavi.post(`${INVOICES}/${invoice.id}/void`);
    expect((await asRavi.post(`${quote}/reopen`)).status).toBe(409);
    // A copy of the quote is the way on.
    expect((await asRavi.post(`${quote}/duplicate`)).status).toBe(201);
  });

  it("keeps the buyer, the lines and the totals when their sources change afterwards", async () => {
    const invoice = await makeInvoice({ lines: [{ productId: licence.id, quantity: 10 }] });

    await prisma.contact.update({
      where: { id: contact.id },
      data: { firstName: "Helena", email: "new@northwind.example" },
    });
    await prisma.company.update({
      where: { id: company.id },
      data: { name: "Northwind Group", address: "Elsewhere" },
    });
    await prisma.product.update({
      where: { id: licence.id },
      data: { name: "Renamed", unitPrice: 99, taxRate: 20 },
    });
    await prisma.organizationSettings.create({
      data: { defaultTaxRate: 25, invoicePaymentTermsDays: 7 },
    });
    await prisma.opportunity.update({ where: { id: opportunity.id }, data: { contactId: null } });

    const read = invoiceOf(await asRavi.get(`${INVOICES}/${invoice.id}`));
    const document = await asRavi.get(`${INVOICES}/${invoice.id}/document`);

    expect(read).toEqual(invoice);
    expect(read.lines[0]).toMatchObject({
      description: "Fleet tracking licence",
      unitPrice: 29,
      taxRate: 8.25,
    });
    expect(document.body).toMatchObject({
      data: {
        buyer: {
          contactName: "Elena Rostova",
          contactEmail: "elena@northwind.example",
          companyName: "Northwind Logistics",
          companyAddress: "1 Harbour Road, Bristol",
        },
        paymentTermsDays: 30,
        total: invoice.total,
      },
    });
  });

  it("makes an invoice without a buyer for a quote without one", async () => {
    const invoice = await makeInvoice({ contactId: null, companyId: null });

    expect(invoice).toMatchObject({ contact: null, company: null });
  });
});

describe("who may see and change an invoice", () => {
  const ACTIONS = ["mark-sent", "mark-paid", "mark-overdue", "mark-unpaid", "void", "restore"];
  const READS = ["", "/document", "/pdf"];

  it("answers NOT_FOUND on every route for an invoice outside the caller's reach", async () => {
    const invoice = await makeInvoice();

    for (const path of READS) {
      const response = await asTara.get(`${INVOICES}/${invoice.id}${path}`);
      const unknown = await asTara.get(`${INVOICES}/${UNKNOWN_ID}${path}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual(unknown.body);
    }
    const patched = await asTara.patch(`${INVOICES}/${invoice.id}`).send({ notes: "x" });
    expect(patched.status).toBe(404);
    for (const action of ACTIONS) {
      const response = await asTara.post(`${INVOICES}/${invoice.id}/${action}`);

      expect(response.status, action).toBe(404);
      expect(errorOf(response).code, action).toBe("NOT_FOUND");
    }
    expect(numbersOf(await asTara.get(INVOICES))).toEqual([]);
    expect(invoiceOf(await asRavi.get(`${INVOICES}/${invoice.id}`))).toEqual(invoice);
  });

  it("lets a Read-only user read every invoice and change none", async () => {
    const invoice = await makeInvoice();

    for (const path of READS) {
      expect((await asViewer.get(`${INVOICES}/${invoice.id}${path}`)).status).toBe(200);
    }
    expect(numbersOf(await asViewer.get(INVOICES))).toEqual(["INV-0001"]);
    expect((await asViewer.get(`${INVOICES}/summary`)).status).toBe(200);
    const patched = await asViewer.patch(`${INVOICES}/${invoice.id}`).send({ notes: "x" });
    expect(patched.status).toBe(403);
    for (const action of ACTIONS) {
      const response = await asViewer.post(`${INVOICES}/${invoice.id}/${action}`);

      expect(response.status, action).toBe(403);
      expect(errorOf(response).code, action).toBe("FORBIDDEN");
    }
    expect(invoiceOf(await asRavi.get(`${INVOICES}/${invoice.id}`))).toEqual(invoice);
  });

  it("lets the owner's manager and an Admin work on the invoice", async () => {
    const invoice = await makeInvoice();

    const sent = await asMeera.post(`${INVOICES}/${invoice.id}/mark-sent`);
    const paid = await asAdmin.post(`${INVOICES}/${invoice.id}/mark-paid`);

    expect(invoiceOf(sent).status).toBe("SENT");
    expect(invoiceOf(paid).status).toBe("PAID");
    expect((await timeline()).map((entry) => entry.author.name)).toEqual([
      "Asha Admin",
      "Meera Manager",
      "Ravi Rep",
    ]);
  });

  it("follows the opportunity when it changes hands or is deleted", async () => {
    const invoice = await makeInvoice();

    await prisma.opportunity.update({ where: { id: opportunity.id }, data: { ownerId: tara.id } });
    expect((await asRavi.get(`${INVOICES}/${invoice.id}`)).status).toBe(404);
    expect((await asTara.get(`${INVOICES}/${invoice.id}`)).status).toBe(200);

    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: { deletedAt: new Date() },
    });
    expect((await asAdmin.get(`${INVOICES}/${invoice.id}`)).status).toBe(404);
    expect(numbersOf(await asAdmin.get(INVOICES))).toEqual([]);
    expect((await asAdmin.get(`${INVOICES}/summary`)).body).toMatchObject({
      data: { outstandingTotal: 0, counts: { DRAFT: 0 } },
    });
  });
});

describe("the status of an invoice", () => {
  const STATUSES: InvoiceStatus[] = ["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"];
  // What each action does to an invoice stored in each status; anything not listed is
  // refused with INVALID_STATUS_CHANGE.
  const ALLOWED: Record<string, Partial<Record<InvoiceStatus, InvoiceStatus>>> = {
    "mark-sent": { DRAFT: "SENT" },
    "mark-paid": { DRAFT: "PAID", SENT: "PAID", OVERDUE: "PAID" },
    "mark-overdue": { SENT: "OVERDUE" },
    "mark-unpaid": { PAID: "SENT", OVERDUE: "SENT" },
    void: { DRAFT: "VOID", SENT: "VOID", OVERDUE: "VOID" },
    restore: { VOID: "DRAFT" },
  };
  const TABLE = Object.entries(ALLOWED).flatMap(([action, moves]) =>
    STATUSES.map((from) => [from, action, moves[from] ?? "INVALID_STATUS_CHANGE"] as const),
  );

  it.each(TABLE)("%s, then %s: %s", async (from, action, outcome) => {
    const invoice = await invoiceIn(from);

    const response = await asRavi.post(`${INVOICES}/${invoice.id}/${action}`);

    if (outcome === "INVALID_STATUS_CHANGE") {
      expect(response.status).toBe(409);
      expect(errorOf(response).code).toBe("INVALID_STATUS_CHANGE");
      expect(errorOf(response).details).toEqual({ status: from });
      expect(invoiceOf(await asRavi.get(`${INVOICES}/${invoice.id}`))).toEqual(invoice);
      expect(await statusChanges()).toEqual([[null, "DRAFT"]]);
    } else {
      expect(response.status).toBe(200);
      expect(invoiceOf(response).status).toBe(outcome);
      expect(await statusChanges()).toEqual([
        [from, outcome],
        [null, "DRAFT"],
      ]);
    }
  });

  it("stamps sentAt and paidAt, and clears them on the way back", async () => {
    const invoice = await makeInvoice();
    const act = async (action: string) =>
      invoiceOf(await asRavi.post(`${INVOICES}/${invoice.id}/${action}`));

    const sent = await act("mark-sent");
    const paid = await act("mark-paid");
    const unpaid = await act("mark-unpaid");
    const voided = await act("void");
    const restored = await act("restore");

    expect(sent).toMatchObject({ sentAt: expect.any(String) as string, paidAt: null });
    expect(paid).toMatchObject({ sentAt: sent.sentAt, paidAt: expect.any(String) as string });
    expect(unpaid).toMatchObject({ status: "SENT", sentAt: sent.sentAt, paidAt: null });
    expect(voided).toMatchObject({ status: "VOID", paidAt: null });
    expect(restored).toMatchObject({ status: "DRAFT", sentAt: null, paidAt: null });
    expect((await timeline())[0]).toMatchObject({
      kind: "INVOICE_STATUS",
      details: {
        invoice: { id: invoice.id, number: "INV-0001" },
        from: "VOID",
        to: "DRAFT",
        total: 1100,
      },
    });
  });

  it("takes the day the money came in", async () => {
    const invoice = await invoiceIn("SENT");

    const response = await asRavi
      .post(`${INVOICES}/${invoice.id}/mark-paid`)
      .send({ paidAt: "2026-10-01T09:30:00+05:30" });

    expect(invoiceOf(response)).toMatchObject({
      status: "PAID",
      paidAt: "2026-10-01T04:00:00.000Z",
    });
  });

  it.each([
    [
      "a payment in the future",
      { paidAt: new Date(Date.now() + 3_600_000).toISOString() },
      "paidAt",
    ],
    ["a payment day without a time", { paidAt: "2026-10-01" }, "paidAt"],
    ["an amount", { amount: 100 }, ""],
  ])("answers VALIDATION_FAILED for %s", async (_name, body, path) => {
    const invoice = await invoiceIn("SENT");

    const response = await asRavi.post(`${INVOICES}/${invoice.id}/mark-paid`).send(body);

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual([path]);
    expect(invoiceOf(await asRavi.get(`${INVOICES}/${invoice.id}`)).status).toBe("SENT");
  });

  it("lets one of several simultaneous clicks win", async () => {
    const invoice = await invoiceIn("DRAFT");

    const responses = await Promise.all([
      asRavi.post(`${INVOICES}/${invoice.id}/mark-sent`),
      asMeera.post(`${INVOICES}/${invoice.id}/mark-sent`),
      asAdmin.post(`${INVOICES}/${invoice.id}/mark-sent`),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409]);
    expect(await statusChanges()).toHaveLength(2);
  });

  describe("OVERDUE by the due date", () => {
    const past = {
      issueDate: new Date(addDays(TODAY, -40)),
      dueDate: new Date(addDays(TODAY, -1)),
    };

    it("is what a sent invoice past its due date reads as, without being stored", async () => {
      const draft = await invoiceIn("DRAFT", past);
      const sent = await invoiceIn("SENT", past);
      const paid = await invoiceIn("PAID", past);
      const dueToday = await invoiceIn("SENT", { dueDate: new Date(TODAY) });

      expect([draft, sent, paid, dueToday].map((invoice) => invoice.status)).toEqual([
        "DRAFT",
        "OVERDUE",
        "PAID",
        "SENT",
      ]);
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe(
        "SENT",
      );
      const document = await asRavi.get(`${INVOICES}/${sent.id}/document`);
      expect(document.body).toMatchObject({ data: { status: "OVERDUE" } });
      // Moving the due date makes it a sent invoice again.
      const moved = await asRavi
        .patch(`${INVOICES}/${sent.id}`)
        .send({ dueDate: addDays(TODAY, 7) });
      expect(invoiceOf(moved).status).toBe("SENT");
    });

    it("still takes the changes a sent invoice takes, by its stored status", async () => {
      const toPay = await invoiceIn("SENT", past);
      const toMark = await invoiceIn("SENT", past);
      const toUnpay = await invoiceIn("SENT", past);

      const paid = await asRavi.post(`${INVOICES}/${toPay.id}/mark-paid`);
      const marked = await asRavi.post(`${INVOICES}/${toMark.id}/mark-overdue`);
      const refused = await asRavi.post(`${INVOICES}/${toUnpay.id}/mark-unpaid`);

      expect(invoiceOf(paid).status).toBe("PAID");
      expect(invoiceOf(marked).status).toBe("OVERDUE");
      expect(refused.status).toBe(409);
      expect(errorOf(refused).details).toEqual({ status: "SENT" });
    });

    it("goes by the viewer's calendar day", async () => {
      const zone = zoneOnAnotherDay();
      const ahead = zone.timeZone === "Pacific/Kiritimati";
      const invoice = await invoiceIn("SENT", {
        issueDate: new Date(addDays(TODAY, -40)),
        dueDate: new Date(ahead ? TODAY : addDays(TODAY, -1)),
      });

      const inZone = invoiceOf(await asRavi.get(`${INVOICES}/${invoice.id}?tz=${zone.timeZone}`));
      const listed = await asRavi.get(`${INVOICES}?status=OVERDUE&tz=${zone.timeZone}`);
      const summary = await asRavi.get(`${INVOICES}/summary?tz=${zone.timeZone}`);

      expect(invoice.status).toBe(ahead ? "SENT" : "OVERDUE");
      expect(inZone.status).toBe(ahead ? "OVERDUE" : "SENT");
      expect(numbersOf(listed)).toEqual(ahead ? [invoice.number] : []);
      expect((summary.body as Envelope<Summary>).data.counts).toMatchObject(
        ahead ? { SENT: 0, OVERDUE: 1 } : { SENT: 1, OVERDUE: 0 },
      );
    });
  });
});

describe("PATCH /invoices/:id", () => {
  it("changes the due date and the notes, and nothing else", async () => {
    const invoice = await makeInvoice({}, { issueDate: "2026-11-01" });

    const response = await asRavi
      .patch(`${INVOICES}/${invoice.id}`)
      .send({ dueDate: "2026-11-15", notes: "PO 4417" });
    const cleared = await asRavi.patch(`${INVOICES}/${invoice.id}`).send({ notes: "" });

    expect(response.status).toBe(200);
    expect(invoiceOf(response)).toEqual({
      ...invoice,
      dueDate: "2026-11-15",
      notes: "PO 4417",
      updatedAt: expect.any(String) as string,
    });
    expect(invoiceOf(cleared)).toMatchObject({ dueDate: "2026-11-15", notes: null });
    // Not a change of status, so not history.
    expect(await statusChanges()).toEqual([[null, "DRAFT"]]);
  });

  it.each(["issueDate", "status", "total", "lines", "number", "contact", "paidAt", "terms"])(
    "does not take %s",
    async (key) => {
      const invoice = await makeInvoice();

      const response = await asRavi
        .patch(`${INVOICES}/${invoice.id}`)
        .send({ [key]: "2026-01-01" });

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe("VALIDATION_FAILED");
    },
  );

  it("refuses a due date before the issue date, on dueDate", async () => {
    const invoice = await makeInvoice({}, { issueDate: "2026-11-10" });

    const response = await asRavi
      .patch(`${INVOICES}/${invoice.id}`)
      .send({ dueDate: "2026-11-09" });

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual(["dueDate"]);
  });

  it("changes a paid invoice's notes, but nothing on a void one", async () => {
    const paid = await invoiceIn("PAID");
    const voided = await invoiceIn("VOID");

    const first = await asRavi.patch(`${INVOICES}/${paid.id}`).send({ notes: "Paid by transfer" });
    const second = await asRavi.patch(`${INVOICES}/${voided.id}`).send({ notes: "x" });

    expect(invoiceOf(first).notes).toBe("Paid by transfer");
    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      error: {
        code: "INVALID_STATUS_CHANGE",
        message: "A void invoice cannot be changed",
        details: { status: "VOID" },
      },
    });
  });
});

describe("GET /invoices and its summary", () => {
  let first: Invoice;
  let fourth: Invoice;

  // On Ravi's opportunity for Northwind: INV-0001 draft 1100.00, INV-0002 sent 550.00 and
  // not due yet, INV-0003 sent 2200.00 and past due, INV-0004 paid 330.00 today.
  // On Tara's opportunity for Kestrel: INV-0005 marked overdue 110.00, INV-0006 void 5500.00,
  // INV-0007 paid 770.00 two months ago.
  beforeEach(async () => {
    const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { kind: "OPEN" } });
    const kestrel = await prisma.company.create({
      data: { name: "Kestrel Robotics", ownerId: tara.id, createdById: tara.id },
    });
    const other = await prisma.opportunity.create({
      data: {
        name: "Vision platform",
        stageId: stage.id,
        companyId: kestrel.id,
        ownerId: tara.id,
        createdById: tara.id,
      },
    });
    const quantity = (count: number) => ({ lines: [{ ...oneLine[0], quantity: count }] });
    const theirs = (count: number) => ({ ...quantity(count), opportunityId: other.id });
    const store = (invoice: Invoice, data: Record<string, unknown>) =>
      prisma.invoice.update({ where: { id: invoice.id }, data });

    first = await makeInvoice(quantity(2), { issueDate: "2020-03-05", dueDate: "2020-04-05" });
    const second = await makeInvoice(quantity(1), { issueDate: "2020-03-01" });
    await store(second, { status: "SENT", dueDate: new Date(addDays(TODAY, 10)) });
    const third = await makeInvoice(quantity(4), { issueDate: "2020-03-02" });
    await store(third, { status: "SENT", dueDate: new Date(addDays(TODAY, -3)) });
    fourth = await makeInvoice(
      { lines: [{ ...oneLine[0], quantity: 0.6 }] },
      { issueDate: "2020-03-03" },
    );
    await store(fourth, { status: "PAID", paidAt: new Date(), dueDate: new Date("2020-03-20") });
    const fifth = await makeInvoice(theirs(0.2), { issueDate: "2020-03-04" }, asTara);
    await store(fifth, { status: "OVERDUE", dueDate: new Date(addDays(TODAY, 30)) });
    const sixth = await makeInvoice(theirs(10), { issueDate: "2020-03-06" }, asTara);
    await store(sixth, { status: "VOID", dueDate: new Date("2020-03-07") });
    const seventh = await makeInvoice(theirs(1.4), { issueDate: "2020-03-07" }, asTara);
    await store(seventh, {
      status: "PAID",
      paidAt: new Date(Date.now() - 62 * 86_400_000),
      dueDate: new Date("2020-03-08"),
    });
  });

  it("lists what the caller may see, the newest number first, with the total", async () => {
    const forAdmin = await asAdmin.get(INVOICES);

    expect(forAdmin.status).toBe(200);
    expect(numbersOf(forAdmin)).toEqual([
      "INV-0007",
      "INV-0006",
      "INV-0005",
      "INV-0004",
      "INV-0003",
      "INV-0002",
      "INV-0001",
    ]);
    expect(forAdmin.body).toMatchObject({ meta: { page: 1, pageSize: 25, total: 7 } });
    expect(numbersOf(await asRavi.get(INVOICES))).toEqual([
      "INV-0004",
      "INV-0003",
      "INV-0002",
      "INV-0001",
    ]);
    expect(numbersOf(await asMeera.get(INVOICES))).toHaveLength(4);
    expect(numbersOf(await asTara.get(INVOICES))).toEqual(["INV-0007", "INV-0006", "INV-0005"]);
    expect(numbersOf(await asViewer.get(INVOICES))).toHaveLength(7);
    expect((forAdmin.body as Envelope<Invoice[]>).data[6]).toEqual(first);
  });

  it("filters by what an invoice reads as, by opportunity and by company", async () => {
    const list = async (query: string, agent = asAdmin) =>
      numbersOf(await agent.get(`${INVOICES}?sort=number&order=asc&${query}`));

    expect(await list("status=DRAFT")).toEqual(["INV-0001"]);
    expect(await list("status=SENT")).toEqual(["INV-0002"]);
    expect(await list("status=OVERDUE")).toEqual(["INV-0003", "INV-0005"]);
    expect(await list("status=PAID")).toEqual(["INV-0004", "INV-0007"]);
    expect(await list("status=VOID")).toEqual(["INV-0006"]);
    expect(await list(`opportunityId=${opportunity.id}`)).toEqual([
      "INV-0001",
      "INV-0002",
      "INV-0003",
      "INV-0004",
    ]);
    expect(await list(`companyId=${company.id}&status=OVERDUE`)).toEqual(["INV-0003"]);
    // A filter narrows the list; it never shows what the caller may not see.
    expect(await list("status=VOID", asRavi)).toEqual([]);
    expect(await list("status=OVERDUE", asRavi)).toEqual(["INV-0003"]);
  });

  it("searches the number and the company's name as the invoice has it", async () => {
    const search = async (text: string, agent = asAdmin) =>
      numbersOf(await agent.get(`${INVOICES}?sort=number&order=asc&search=${text}`));

    expect(await search("inv-0003")).toEqual(["INV-0003"]);
    expect(await search("kestrel")).toEqual(["INV-0005", "INV-0006", "INV-0007"]);
    expect(await search("northwind%200002")).toEqual(["INV-0002"]);
    expect(await search("kestrel", asRavi)).toEqual([]);
    // The name on the invoice, not the company's name today.
    await prisma.company.update({ where: { id: company.id }, data: { name: "Renamed Group" } });
    expect(await search("northwind")).toHaveLength(4);
    expect(await search("renamed")).toEqual([]);
  });

  it("sorts by number, issue date, due date and total", async () => {
    const sorted = async (query: string) =>
      numbersOf(await asRavi.get(`${INVOICES}?${query}`)).map((number) => number.slice(-1));

    expect(await sorted("sort=number&order=asc")).toEqual(["1", "2", "3", "4"]);
    expect(await sorted("sort=issueDate&order=asc")).toEqual(["2", "3", "4", "1"]);
    expect(await sorted("sort=issueDate&order=desc")).toEqual(["1", "4", "3", "2"]);
    expect(await sorted("sort=dueDate&order=asc")).toEqual(["4", "1", "3", "2"]);
    expect(await sorted("sort=total&order=desc")).toEqual(["3", "1", "2", "4"]);
  });

  it("pages", async () => {
    const page = await asAdmin.get(`${INVOICES}?sort=number&order=asc&pageSize=3&page=3`);

    expect(numbersOf(page)).toEqual(["INV-0007"]);
    expect(page.body).toMatchObject({ meta: { page: 3, pageSize: 3, total: 7 } });
  });

  it.each([
    ["status=EXPIRED", "status"],
    ["sort=createdAt", "sort"],
    ["companyId=7", "companyId"],
    ["tz=Mars/Olympus", "tz"],
  ])("answers VALIDATION_FAILED for %s", async (query, path) => {
    const response = await asAdmin.get(`${INVOICES}?${query}`);

    expect(response.status).toBe(400);
    expect(detailPaths(response)).toEqual([path]);
  });

  it("adds up what is outstanding, overdue and paid this month, for what the caller may see", async () => {
    const forAdmin = await asAdmin.get(`${INVOICES}/summary`);

    expect(forAdmin.status).toBe(200);
    expect(forAdmin.body).toEqual({
      data: {
        // 550.00 + 2200.00 + 110.00
        outstandingTotal: 2860,
        // 2200.00 past due + 110.00 marked
        overdueTotal: 2310,
        // Only the one paid today.
        paidThisMonthTotal: 330,
        counts: { DRAFT: 1, SENT: 1, PAID: 2, OVERDUE: 2, VOID: 1 },
      },
      meta: {},
    });
    expect((await asRavi.get(`${INVOICES}/summary`)).body).toEqual({
      data: {
        outstandingTotal: 2750,
        overdueTotal: 2200,
        paidThisMonthTotal: 330,
        counts: { DRAFT: 1, SENT: 1, PAID: 1, OVERDUE: 1, VOID: 0 },
      },
      meta: {},
    });
    expect((await asMeera.get(`${INVOICES}/summary`)).body).toEqual(
      (await asRavi.get(`${INVOICES}/summary`)).body,
    );
    expect((await asTara.get(`${INVOICES}/summary`)).body).toEqual({
      data: {
        outstandingTotal: 110,
        overdueTotal: 110,
        paidThisMonthTotal: 0,
        counts: { DRAFT: 0, SENT: 0, PAID: 1, OVERDUE: 1, VOID: 1 },
      },
      meta: {},
    });
    expect((await asViewer.get(`${INVOICES}/summary`)).body).toEqual(forAdmin.body);
    expect(detailPaths(await asAdmin.get(`${INVOICES}/summary?tz=Nowhere`))).toEqual(["tz"]);
  });

  it("exports the same list as a CSV file", async () => {
    const response = await asRavi.get(`${INVOICES}/export?sort=number&order=asc&status=PAID`);
    const rows = parseCsv(response.text.slice(1));

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="invoices-${TODAY}.csv"`,
    );
    expect(rows[0]).toEqual([
      "Number",
      "Quote",
      "Opportunity",
      "Company",
      "Contact",
      "Status",
      "Issue date",
      "Due date",
      "Subtotal",
      "Discount",
      "Tax",
      "Total",
      "Sent",
      "Paid",
      "Created by",
      "Created",
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.slice(0, 12)).toEqual([
      "INV-0004",
      fourth.quote.number,
      "Fleet tracking rollout",
      "Northwind Logistics",
      "Elena Rostova",
      "Paid",
      "2020-03-03",
      "2020-03-20",
      "300",
      "0",
      "30",
      "330",
    ]);
    expect((await asTara.get(`${INVOICES}/export`)).text).not.toContain("INV-0004");
    // The overdue ones as they read, in the export too.
    const overdue = await asAdmin.get(`${INVOICES}/export?status=OVERDUE&sort=number&order=asc`);
    expect(parseCsv(overdue.text.slice(1)).map((row) => row[0])).toEqual([
      "Number",
      "INV-0003",
      "INV-0005",
    ]);
  });
});

describe("GET /invoices/:id/document", () => {
  it("answers everything a print view needs", async () => {
    await prisma.organizationSettings.create({
      data: { name: "Acme Fleet Ltd", address: "5 Dock Street\nLeeds", taxId: "GB 999" },
    });
    const invoice = await makeInvoice(
      {
        discountType: "AMOUNT",
        discountValue: 100,
        terms: "Payment within 30 days.",
        lines: [...oneLine, { description: "Travel", quantity: 1, unitPrice: 250, taxRate: 0 }],
      },
      { issueDate: "2026-11-01", dueDate: "2026-11-15", notes: "PO 4417" },
    );
    await asRavi.post(`${INVOICES}/${invoice.id}/mark-sent`);

    const response = await asViewer.get(`${INVOICES}/${invoice.id}/document?tz=UTC`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        kind: "INVOICE",
        number: "INV-0001",
        // Sent, and due in 2026.
        status: TODAY > "2026-11-15" ? "OVERDUE" : "SENT",
        currency: "USD",
        issueDate: "2026-11-01",
        validUntil: null,
        dueDate: "2026-11-15",
        paymentTermsDays: 14,
        quoteNumber: "Q-0001",
        seller: {
          name: "Acme Fleet Ltd",
          address: "5 Dock Street\nLeeds",
          email: null,
          phone: null,
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
        lines: invoice.lines,
        subtotal: 1250,
        discountType: null,
        discountValue: null,
        discountTotal: 100,
        // 1000.00 of 1250.00 is taxed: its share after the discount is 920.00.
        taxes: [{ rate: 10, taxableAmount: 920, taxAmount: 92 }],
        taxTotal: 92,
        total: 1242,
        notes: "PO 4417",
        terms: "Payment within 30 days.",
      },
      meta: {},
    });
    expect(invoice).toMatchObject({
      subtotal: 1250,
      discountTotal: 100,
      taxTotal: 92,
      total: 1242,
    });
  });
});

describe("GET /invoices/:id/pdf", () => {
  it("downloads the invoice as a PDF named after it, for every role that may read it", async () => {
    await prisma.organizationSettings.create({ data: { name: "Acme Fleet Ltd" } });
    const invoice = await makeInvoice(
      {
        discountType: "AMOUNT",
        discountValue: 100,
        lines: [...oneLine, { description: "Travel", quantity: 1, unitPrice: 250, taxRate: 0 }],
      },
      { issueDate: "2026-11-01", dueDate: "2026-11-15", notes: "PO 4417" },
    );
    await asRavi.post(`${INVOICES}/${invoice.id}/void`);

    const response = await asViewer
      .get(`${INVOICES}/${invoice.id}/pdf`)
      .buffer(true)
      .parse(binaryBody);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="INV-0001.pdf"');
    expect(response.headers["cache-control"]).toBe("no-store");
    const pdf = response.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdfPageCount(pdf)).toBe(1);
    const text = pdfText(pdf);
    for (const part of [
      "Invoice",
      "INV-0001",
      "Status: Void",
      "Nov 1, 2026",
      "Nov 15, 2026",
      "14 days",
      "Q-0001",
      "Acme Fleet Ltd",
      "BILL TO",
      "Northwind Logistics",
      "Consulting day",
      "Travel",
      "$1,250.00",
      "-$100.00",
      "Tax 10% on $920.00",
      "$92.00",
      "$1,242.00",
      "PO 4417",
      "Page 1 of 1",
    ]) {
      expect(text, part).toContain(part);
    }
  });

  it("works with a Bearer token, and answers JSON errors", async () => {
    const invoice = await makeInvoice();
    const token = await createSession(ravi.id);

    const bearer = await request(app)
      .get(`${INVOICES}/${invoice.id}/pdf`)
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse(binaryBody);
    const outsider = await asTara.get(`${INVOICES}/${invoice.id}/pdf`);

    expect(bearer.status).toBe(200);
    expect((bearer.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expect(outsider.status).toBe(404);
    expect(outsider.headers["content-type"]).toMatch(/^application\/json/);
    expect(errorOf(outsider).code).toBe("NOT_FOUND");
  });
});
