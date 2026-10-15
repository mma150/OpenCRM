import type { InvoiceStatus, Prisma } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
import {
  buildCsvExport,
  type CsvExport,
  enumLabel,
  type ExportColumn,
  exportWindow,
  momentFormatter,
} from "../../lib/csv-export";
import { type Page, pageWindow, searchWords } from "../../lib/list-query";
import { prisma } from "../../lib/prisma";
import { type Actor, assertCanWrite, visibleLiveRecords } from "../../lib/record-access";
import {
  type PdfFile,
  renderSalesDocumentPdf,
  salesDocumentFilename,
} from "../../lib/sales-document-pdf";
import {
  addDays,
  fromDay,
  nextDocumentNumber,
  type SalesDocument,
  taxRows,
  toApiLine,
  toDay,
} from "../../lib/sales-documents";
import { type Day, daysBetween, firstOfMonth, startOfDay } from "../../lib/time-zone";
import { addTimelineEntry } from "../../lib/timeline";
import { findOrganization } from "../organization/organization.service";
import { findQuote, lockQuote } from "../quotes/quotes.service";
import type {
  ApiInvoice,
  ApiInvoiceStatus,
  CreateInvoiceBody,
  InvoiceListQuery,
  InvoiceSummary,
  MarkPaidBody,
  UpdateInvoiceBody,
} from "./invoices.schema";

// QUOT-04 and QUOT-05: invoices. An invoice is made from an accepted quote, once, and is a
// copy of it: the buyer, the lines and the totals never change afterwards. It is a record
// only (the app takes no payments): a user marks it sent, paid, overdue or void. Who may
// see and change it follows the opportunity, as for quotes.

// For reads only (see "A write answers with a fresh read" in docs/standards/backend.md).
const withDetails = {
  quote: { select: { id: true, number: true } },
  opportunity: { select: { id: true, name: true } },
  lines: { orderBy: [{ position: "asc" }, { id: "asc" }] },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithDetails = Prisma.InvoiceGetPayload<{ include: typeof withDetails }>;

// A SENT invoice past its due date reads as OVERDUE, whether or not anyone marked it.
function statusOn(invoice: { status: InvoiceStatus; dueDate: Date }, today: Day): ApiInvoiceStatus {
  return invoice.status === "SENT" && toDay(invoice.dueDate) < today ? "OVERDUE" : invoice.status;
}

function toApiInvoice(invoice: InvoiceWithDetails, today: Day): ApiInvoice {
  return {
    id: invoice.id,
    number: invoice.number,
    quote: invoice.quote,
    opportunity: invoice.opportunity,
    contact:
      invoice.contactId !== null && invoice.contactName !== null
        ? { id: invoice.contactId, name: invoice.contactName, email: invoice.contactEmail }
        : null,
    company:
      invoice.companyId !== null && invoice.companyName !== null
        ? { id: invoice.companyId, name: invoice.companyName }
        : null,
    status: statusOn(invoice, today),
    issueDate: toDay(invoice.issueDate),
    dueDate: toDay(invoice.dueDate),
    lines: invoice.lines.map((line) => toApiLine(line)),
    subtotal: invoice.subtotal.toNumber(),
    discountTotal: invoice.discountTotal.toNumber(),
    taxTotal: invoice.taxTotal.toNumber(),
    total: invoice.total.toNumber(),
    notes: invoice.notes,
    terms: invoice.terms,
    sentAt: invoice.sentAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    createdBy: { id: invoice.createdBy.id, name: invoice.createdBy.name },
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

// Every query starts here: the invoices of the opportunities this user may see.
function visibleInvoices(actor: Actor): Prisma.InvoiceWhereInput {
  return { opportunity: visibleLiveRecords(actor) };
}

async function findInvoice(actor: Actor, id: string): Promise<InvoiceWithDetails> {
  const invoice = await prisma.invoice.findFirst({
    where: { id, ...visibleInvoices(actor) },
    include: withDetails,
  });
  if (!invoice) {
    throw new AppError("NOT_FOUND", 404, "Invoice not found");
  }
  return invoice;
}

// The `where` fragment for each status as it reads on the viewer's day: a sent invoice is
// SENT or OVERDUE, never both.
function readingAs(today: Day): Record<ApiInvoiceStatus, Prisma.InvoiceWhereInput> {
  const startOfToday = fromDay(today);
  return {
    DRAFT: { status: "DRAFT" },
    PAID: { status: "PAID" },
    VOID: { status: "VOID" },
    SENT: { status: "SENT", dueDate: { gte: startOfToday } },
    OVERDUE: { OR: [{ status: "OVERDUE" }, { status: "SENT", dueDate: { lt: startOfToday } }] },
  };
}

// What an INVOICE_STATUS entry on the opportunity's timeline keeps. `from` is null when the
// invoice was made.
function statusEntry(
  actor: Actor,
  invoice: { id: string; number: string; opportunityId: string; total: Prisma.Decimal },
  from: InvoiceStatus | null,
  to: InvoiceStatus,
) {
  return {
    kind: "INVOICE_STATUS" as const,
    authorId: actor.id,
    record: { type: "opportunity" as const, id: invoice.opportunityId },
    details: {
      invoice: { id: invoice.id, number: invoice.number },
      from,
      to,
      total: invoice.total.toNumber(),
    },
  };
}

function assertDueDate(issueDate: string, dueDate: string): void {
  if (dueDate < issueDate) {
    throw fieldError("dueDate", "An invoice cannot be due before its issue date");
  }
}

// What the list and the export share: the invoices that match, in order, within `window`.
async function findInvoices(
  actor: Actor,
  query: InvoiceListQuery,
  today: Day,
  window: { skip: number; take: number },
): Promise<Page<ApiInvoice>> {
  // Every word typed must appear in the number or the company's name as the invoice has it.
  const search = searchWords(query.search).map((word) => {
    const contains = { contains: word, mode: "insensitive" } as const;
    return { OR: [{ number: contains }, { companyName: contains }] };
  });
  const where: Prisma.InvoiceWhereInput = {
    AND: [
      visibleInvoices(actor),
      { opportunityId: query.opportunityId, companyId: query.companyId },
      query.status ? readingAs(today)[query.status] : {},
      ...search,
    ],
  };
  const { sort, order } = query;
  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] =
    sort === "number" ? [{ sequence: order }] : [{ [sort]: order }, { id: order }];

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({ where, include: withDetails, orderBy, ...window }),
    prisma.invoice.count({ where }),
  ]);
  return { items: invoices.map((invoice) => toApiInvoice(invoice, today)), total };
}

export async function listInvoices(
  actor: Actor,
  query: InvoiceListQuery,
  today: Day,
): Promise<Page<ApiInvoice>> {
  return findInvoices(actor, query, today, pageWindow(query));
}

// DATA-03: the list as a CSV file, for everyone who can see the list.
export async function exportInvoices(
  actor: Actor,
  query: InvoiceListQuery,
  today: Day,
): Promise<CsvExport> {
  const moment = momentFormatter(query.tz);
  const columns: ExportColumn<ApiInvoice>[] = [
    { header: "Number", value: (invoice) => invoice.number },
    { header: "Quote", value: (invoice) => invoice.quote.number },
    { header: "Opportunity", value: (invoice) => invoice.opportunity.name },
    { header: "Company", value: (invoice) => invoice.company?.name ?? null },
    { header: "Contact", value: (invoice) => invoice.contact?.name ?? null },
    { header: "Status", value: (invoice) => enumLabel(invoice.status) },
    { header: "Issue date", value: (invoice) => invoice.issueDate },
    { header: "Due date", value: (invoice) => invoice.dueDate },
    { header: "Subtotal", value: (invoice) => invoice.subtotal },
    { header: "Discount", value: (invoice) => invoice.discountTotal },
    { header: "Tax", value: (invoice) => invoice.taxTotal },
    { header: "Total", value: (invoice) => invoice.total },
    { header: "Sent", value: (invoice) => moment(invoice.sentAt) },
    { header: "Paid", value: (invoice) => moment(invoice.paidAt) },
    { header: "Created by", value: (invoice) => invoice.createdBy.name },
    { header: "Created", value: (invoice) => moment(invoice.createdAt) },
  ];
  return buildCsvExport(columns, await findInvoices(actor, query, today, exportWindow));
}

// The figures above the list, over every invoice the caller may see.
export async function getInvoiceSummary(
  actor: Actor,
  timeZone: string,
  today: Day,
): Promise<InvoiceSummary> {
  const visible = visibleInvoices(actor);
  const reading = readingAs(today);
  const sum = async (where: Prisma.InvoiceWhereInput) => {
    const result = await prisma.invoice.aggregate({
      where: { AND: [visible, where] },
      _sum: { total: true },
    });
    return result._sum.total?.toNumber() ?? 0;
  };
  const count = (status: ApiInvoiceStatus) =>
    prisma.invoice.count({ where: { AND: [visible, reading[status]] } });

  const [outstandingTotal, overdueTotal, paidThisMonthTotal, DRAFT, SENT, PAID, OVERDUE, VOID] =
    await Promise.all([
      sum({ status: { in: ["SENT", "OVERDUE"] } }),
      sum(reading.OVERDUE),
      sum({ status: "PAID", paidAt: { gte: startOfDay(timeZone, firstOfMonth(today)) } }),
      count("DRAFT"),
      count("SENT"),
      count("PAID"),
      count("OVERDUE"),
      count("VOID"),
    ]);
  return {
    outstandingTotal,
    overdueTotal,
    paidThisMonthTotal,
    counts: { DRAFT, SENT, PAID, OVERDUE, VOID },
  };
}

export async function getInvoice(actor: Actor, id: string, today: Day): Promise<ApiInvoice> {
  return toApiInvoice(await findInvoice(actor, id), today);
}

// QUOT-04: the invoice of an accepted quote. One per quote: the check and the insert run
// under a lock on the quote's row, so two requests cannot both make one, and the number is
// taken inside the same transaction, so a refused request uses none.
export async function createInvoice(
  actor: Actor,
  quoteId: string,
  input: CreateInvoiceBody,
  today: Day,
): Promise<ApiInvoice> {
  assertCanWrite(actor);
  const quote = await findQuote(actor, quoteId);
  const organization = await findOrganization();
  const issueDate = input.issueDate ?? today;
  const dueDate = input.dueDate ?? addDays(issueDate, organization.invoicePaymentTermsDays);
  assertDueDate(issueDate, dueDate);

  const id = await prisma.$transaction(async (tx) => {
    await lockQuote(tx, quoteId);
    const current = await tx.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: { invoice: { select: { id: true, number: true } } },
    });
    if (current.invoice) {
      throw new AppError(
        "INVOICE_EXISTS",
        409,
        `This quote already has invoice ${current.invoice.number}`,
        { invoice: current.invoice },
      );
    }
    if (current.status !== "ACCEPTED") {
      throw new AppError(
        "INVALID_STATUS_CHANGE",
        409,
        "Only an accepted quote can be turned into an invoice",
        { status: current.status },
      );
    }

    const { number, sequence } = await nextDocumentNumber(tx, "invoice");
    const { contact, company } = quote;
    const invoice = await tx.invoice.create({
      data: {
        number,
        sequence,
        quoteId,
        opportunityId: quote.opportunityId,
        contactId: contact?.id ?? null,
        contactName: contact ? `${contact.firstName} ${contact.lastName}` : null,
        contactEmail: contact?.email ?? null,
        companyId: company?.id ?? null,
        companyName: company?.name ?? null,
        companyAddress: company?.address ?? null,
        issueDate: fromDay(issueDate),
        dueDate: fromDay(dueDate),
        subtotal: current.subtotal,
        discountTotal: current.discountTotal,
        taxTotal: current.taxTotal,
        total: current.total,
        notes: input.notes === undefined ? current.notes : input.notes,
        terms: current.terms,
        createdById: actor.id,
      },
    });
    // The lines as they are now, under the lock: an accepted quote cannot be edited.
    const lines = await tx.quoteLine.findMany({ where: { quoteId } });
    await tx.invoiceLine.createMany({
      data: lines.map((line) => ({
        invoiceId: invoice.id,
        position: line.position,
        productId: line.productId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxRate: line.taxRate,
        lineTotal: line.lineTotal,
      })),
    });
    await addTimelineEntry(tx, statusEntry(actor, invoice, null, "DRAFT"));
    return invoice.id;
  });
  return getInvoice(actor, id, today);
}

function invalidStatus(message: string, status: InvoiceStatus): AppError {
  return new AppError("INVALID_STATUS_CHANGE", 409, message, { status });
}

// Only the due date and the notes; everything else on an invoice is a copy of the quote.
export async function updateInvoice(
  actor: Actor,
  id: string,
  input: UpdateInvoiceBody,
  today: Day,
): Promise<ApiInvoice> {
  assertCanWrite(actor);
  const invoice = await findInvoice(actor, id);
  if (invoice.status === "VOID") {
    throw invalidStatus("A void invoice cannot be changed", invoice.status);
  }
  if (input.dueDate !== undefined) {
    assertDueDate(toDay(invoice.issueDate), input.dueDate);
  }
  await prisma.invoice.update({
    where: { id },
    data: {
      dueDate: input.dueDate === undefined ? undefined : fromDay(input.dueDate),
      notes: input.notes,
    },
  });
  return getInvoice(actor, id, today);
}

// The changes of status a user can make (QUOT-05). `from` is what the invoice is stored
// as: a SENT invoice that reads as OVERDUE because of its due date is still SENT here.
const CHANGES = {
  "mark-sent": { from: ["DRAFT"], to: "SENT" },
  "mark-paid": { from: ["DRAFT", "SENT", "OVERDUE"], to: "PAID" },
  "mark-overdue": { from: ["SENT"], to: "OVERDUE" },
  // The way back from a wrong click on paid or overdue.
  "mark-unpaid": { from: ["PAID", "OVERDUE"], to: "SENT" },
  void: { from: ["DRAFT", "SENT", "OVERDUE"], to: "VOID" },
  // The way back from a wrong click on void.
  restore: { from: ["VOID"], to: "DRAFT" },
} as const satisfies Record<string, { from: InvoiceStatus[]; to: InvoiceStatus }>;

export type InvoiceChange = keyof typeof CHANGES;

const REFUSALS: Record<InvoiceChange, string> = {
  "mark-sent": "Only a draft invoice can be marked as sent",
  "mark-paid": "Only a draft, sent or overdue invoice can be marked as paid",
  "mark-overdue": "Only a sent invoice can be marked as overdue",
  "mark-unpaid": "Only a paid or overdue invoice can be marked as unpaid",
  void: "A paid invoice cannot be voided; mark it as unpaid first",
  restore: "Only a void invoice can be restored",
};

// One change of status, under a lock on the invoice's row and with its INVOICE_STATUS entry
// on the opportunity's timeline in the same transaction.
export async function changeInvoiceStatus(
  actor: Actor,
  id: string,
  change: InvoiceChange,
  input: MarkPaidBody,
  today: Day,
): Promise<ApiInvoice> {
  assertCanWrite(actor);
  await findInvoice(actor, id);
  const { from, to } = CHANGES[change];

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${id} FOR UPDATE`;
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
    if (!(from as readonly InvoiceStatus[]).includes(invoice.status)) {
      throw invalidStatus(REFUSALS[change], invoice.status);
    }
    const now = new Date();
    await tx.invoice.update({
      where: { id },
      data: {
        status: to,
        // An invoice that is sent, or back to sent, was sent at some point; a restored one
        // starts again as a draft.
        sentAt: to === "SENT" ? (invoice.sentAt ?? now) : to === "DRAFT" ? null : undefined,
        paidAt: to === "PAID" ? (input.paidAt ? new Date(input.paidAt) : now) : null,
      },
    });
    await addTimelineEntry(tx, statusEntry(actor, invoice, invoice.status, to));
  });
  return getInvoice(actor, id, today);
}

// The invoice as a sheet of paper: seller, buyer, lines and totals, ready to print.
export async function getInvoiceDocument(
  actor: Actor,
  id: string,
  today: Day,
): Promise<SalesDocument> {
  const invoice = await findInvoice(actor, id);
  const organization = await findOrganization();
  return {
    kind: "INVOICE",
    number: invoice.number,
    status: statusOn(invoice, today),
    currency: "USD",
    issueDate: toDay(invoice.issueDate),
    validUntil: null,
    dueDate: toDay(invoice.dueDate),
    // As this invoice has it, whatever the organisation settings say today.
    paymentTermsDays: daysBetween(toDay(invoice.issueDate), toDay(invoice.dueDate)),
    quoteNumber: invoice.quote.number,
    seller: {
      name: organization.name,
      address: organization.address,
      email: organization.email,
      phone: organization.phone,
      taxId: organization.taxId,
    },
    buyer: {
      contactName: invoice.contactName,
      contactEmail: invoice.contactEmail,
      companyName: invoice.companyName,
      companyAddress: invoice.companyAddress,
    },
    opportunityName: invoice.opportunity.name,
    preparedBy: { name: invoice.createdBy.name, email: invoice.createdBy.email },
    lines: invoice.lines.map((line) => toApiLine(line)),
    subtotal: invoice.subtotal.toNumber(),
    discountType: null,
    discountValue: null,
    discountTotal: invoice.discountTotal.toNumber(),
    taxes: taxRows(invoice.lines, invoice.discountTotal),
    taxTotal: invoice.taxTotal.toNumber(),
    total: invoice.total.toNumber(),
    notes: invoice.notes,
    terms: invoice.terms,
  };
}

// The same document as a PDF file named like the invoice ("INV-0001.pdf").
export async function getInvoicePdf(actor: Actor, id: string, today: Day): Promise<PdfFile> {
  const document = await getInvoiceDocument(actor, id, today);
  return {
    filename: salesDocumentFilename(document),
    content: await renderSalesDocumentPdf(document),
  };
}
