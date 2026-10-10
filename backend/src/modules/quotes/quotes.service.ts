import { Prisma, type QuoteStatus } from "../../generated/prisma/client";
import { AppError, fieldError, notFoundAsFieldError } from "../../lib/app-error";
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
  addDays,
  computeTotals,
  type DiscountType,
  formatMoney,
  fromDay,
  MAX_DOCUMENT_TOTAL,
  nextDocumentNumber,
  type SalesDocument,
  taxRows,
  toApiLine,
  toDay,
} from "../../lib/sales-documents";
import type { Day } from "../../lib/time-zone";
import { addTimelineEntry } from "../../lib/timeline";
import { addEmailEntry, composeEmail, deliverEmail, type Sender } from "../emails/emails.service";
import { findOpportunity } from "../opportunities/opportunities.service";
import { findOrganization } from "../organization/organization.service";
import type {
  ApiQuote,
  ApiQuoteStatus,
  CreateQuoteBody,
  QuoteLineInput,
  QuoteListQuery,
  SendQuoteBody,
  UpdateQuoteBody,
} from "./quotes.schema";

// QUOT-02 and QUOT-03: quotes. A quote belongs to one opportunity, and who may see and
// change it follows that opportunity (lib/record-access.ts): see the opportunity, see its
// quotes; change it, change them. Outside the caller's reach is NOT_FOUND.
//
// Status:  DRAFT -> SENT -> ACCEPTED or DECLINED, and back to DRAFT by reopening (unless an
// invoice was made). Only a DRAFT is edited or deleted. Every change of status happens
// under a lock on the quote's row, with its entry on the opportunity's timeline in the same
// transaction.

const person = { id: true, firstName: true, lastName: true, email: true } as const;

// For reads only (see "A write answers with a fresh read" in docs/standards/backend.md).
const withDetails = {
  opportunity: { select: { id: true, name: true } },
  contact: { select: person },
  company: { select: { id: true, name: true, address: true } },
  lines: { orderBy: [{ position: "asc" }, { id: "asc" }] },
  invoice: { select: { id: true, number: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.QuoteInclude;

export type QuoteWithDetails = Prisma.QuoteGetPayload<{ include: typeof withDetails }>;

// A SENT quote past its last day of validity reads as EXPIRED. Nothing is stored.
function statusOn(
  quote: { status: QuoteStatus; validUntil: Date | null },
  today: Day,
): ApiQuoteStatus {
  const expired =
    quote.status === "SENT" && quote.validUntil !== null && toDay(quote.validUntil) < today;
  return expired ? "EXPIRED" : quote.status;
}

function toApiQuote(quote: QuoteWithDetails, today: Day): ApiQuote {
  const { contact, company } = quote;
  return {
    id: quote.id,
    number: quote.number,
    opportunity: quote.opportunity,
    contact: contact && {
      id: contact.id,
      name: `${contact.firstName} ${contact.lastName}`,
      email: contact.email,
    },
    company: company && { id: company.id, name: company.name },
    status: statusOn(quote, today),
    issueDate: toDay(quote.issueDate),
    validUntil: quote.validUntil ? toDay(quote.validUntil) : null,
    lines: quote.lines.map((line) => toApiLine(line)),
    discountType: quote.discountType,
    discountValue: quote.discountValue.toNumber(),
    subtotal: quote.subtotal.toNumber(),
    discountTotal: quote.discountTotal.toNumber(),
    taxTotal: quote.taxTotal.toNumber(),
    total: quote.total.toNumber(),
    notes: quote.notes,
    terms: quote.terms,
    sentAt: quote.sentAt?.toISOString() ?? null,
    acceptedAt: quote.acceptedAt?.toISOString() ?? null,
    declinedAt: quote.declinedAt?.toISOString() ?? null,
    invoice: quote.invoice,
    createdBy: { id: quote.createdBy.id, name: quote.createdBy.name },
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  };
}

// Every query starts here: the quotes of the opportunities this user may see.
function visibleQuotes(actor: Actor): Prisma.QuoteWhereInput {
  return { opportunity: visibleLiveRecords(actor) };
}

// A quote the user may not see answers exactly like one that does not exist.
// Exported for the invoices service, which makes an invoice from a quote.
export async function findQuote(actor: Actor, id: string): Promise<QuoteWithDetails> {
  const quote = await prisma.quote.findFirst({
    where: { id, ...visibleQuotes(actor) },
    include: withDetails,
  });
  if (!quote) {
    throw new AppError("NOT_FOUND", 404, "Quote not found");
  }
  return quote;
}

// Makes every other transaction that changes this quote's status, or makes its invoice,
// wait until this one is done. Call it first, then read the quote again and decide.
// Exported for the invoices service.
export async function lockQuote(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Quote" WHERE "id" = ${id} FOR UPDATE`;
}

function invalidStatus(message: string, status: string): AppError {
  return new AppError("INVALID_STATUS_CHANGE", 409, message, { status });
}

// The buyer of a quote must be a contact and a company the caller may see; one they cannot
// see answers exactly like one that does not exist.
async function assertBuyerVisible(
  actor: Actor,
  buyer: { contactId?: string | null; companyId?: string | null },
): Promise<void> {
  const visible = visibleLiveRecords(actor);
  if (buyer.contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: buyer.contactId, ...visible } });
    if (!contact) {
      throw fieldError("contactId", "Choose a contact you can see");
    }
  }
  if (buyer.companyId) {
    const company = await prisma.company.findFirst({ where: { id: buyer.companyId, ...visible } });
    if (!company) {
      throw fieldError("companyId", "Choose a company you can see");
    }
  }
}

// A line as it is stored, before it has a quote.
interface LineData {
  position: number;
  productId: string | null;
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

// Turns the lines of a request into stored lines. What a line leaves out is copied from its
// product as the product is now; after that the line stands on its own. `kept` holds the
// products already on the quote: an archived product may stay on a line, but not be added.
// Every problem is reported at once, each on its own field (lines.<index>.<field>).
async function buildLines(
  inputs: QuoteLineInput[],
  kept: Set<string>,
  defaultTaxRate: Prisma.Decimal,
): Promise<Omit<LineData, "lineTotal">[]> {
  const ids = [...new Set(inputs.flatMap((line) => (line.productId ? [line.productId] : [])))];
  const products = new Map(
    (await prisma.product.findMany({ where: { id: { in: ids } } })).map((product) => [
      product.id,
      product,
    ]),
  );

  const problems: { path: string; message: string }[] = [];
  const lines = inputs.map((input, position) => {
    const product = input.productId ? products.get(input.productId) : undefined;
    if (input.productId && !product) {
      problems.push({ path: `lines.${String(position)}.productId`, message: "Choose a product" });
    } else if (product && !product.active && !kept.has(product.id)) {
      problems.push({
        path: `lines.${String(position)}.productId`,
        message: "This product is archived",
      });
    }
    const description = input.description ?? product?.name;
    if (description === undefined) {
      problems.push({
        path: `lines.${String(position)}.description`,
        message: "Describe the line",
      });
    }
    const unitPrice = input.unitPrice ?? product?.unitPrice;
    if (unitPrice === undefined) {
      problems.push({ path: `lines.${String(position)}.unitPrice`, message: "Enter a price" });
    }
    return {
      position,
      productId: input.productId ?? null,
      description: description ?? "",
      quantity: new Prisma.Decimal(input.quantity),
      unitPrice: new Prisma.Decimal(unitPrice ?? 0),
      discountPercent: new Prisma.Decimal(input.discountPercent ?? 0),
      taxRate: new Prisma.Decimal(input.taxRate ?? product?.taxRate ?? defaultTaxRate),
    };
  });
  if (problems.length > 0) {
    throw new AppError("VALIDATION_FAILED", 400, "Request validation failed", problems);
  }
  return lines;
}

// The lines with their totals and the totals of the whole quote, counted by the one rule in
// lib/sales-documents.ts.
function price(
  lines: Omit<LineData, "lineTotal">[],
  discountType: DiscountType,
  discountValue: Prisma.Decimal,
) {
  if (discountType === "PERCENT" && discountValue.greaterThan(100)) {
    throw fieldError("discountValue", "A percentage discount is at most 100");
  }
  const totals = computeTotals(lines, discountType, discountValue);
  const tooLarge = totals.lineTotals.findIndex((total) => total.greaterThan(MAX_DOCUMENT_TOTAL));
  if (tooLarge !== -1) {
    throw fieldError(`lines.${String(tooLarge)}.quantity`, "This line is too large");
  }
  if (totals.total.greaterThan(MAX_DOCUMENT_TOTAL)) {
    throw fieldError("lines", "The quote's total is too large");
  }
  return {
    lines: lines.map((line, index) => ({
      ...line,
      lineTotal: totals.lineTotals[index] ?? new Prisma.Decimal(0),
    })),
    totals: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
    },
  };
}

function assertValidity(issueDate: string, validUntil: string | null): void {
  if (validUntil !== null && validUntil < issueDate) {
    throw fieldError("validUntil", "The quote cannot stop being valid before its issue date");
  }
}

// What a QUOTE_STATUS entry on the opportunity's timeline keeps. `from` is null when the
// quote was made, `to` is null when a draft was deleted.
function statusEntry(
  actor: Actor,
  quote: { id: string; number: string; opportunityId: string; total: Prisma.Decimal },
  from: QuoteStatus | null,
  to: QuoteStatus | null,
) {
  return {
    kind: "QUOTE_STATUS" as const,
    authorId: actor.id,
    record: { type: "opportunity" as const, id: quote.opportunityId },
    details: {
      quote: { id: quote.id, number: quote.number },
      from,
      to,
      total: quote.total.toNumber(),
    },
  };
}

// What the list and the export share: the quotes that match, in order, within `window`.
async function findQuotes(
  actor: Actor,
  query: QuoteListQuery,
  today: Day,
  window: { skip: number; take: number },
): Promise<Page<ApiQuote>> {
  const visible = visibleLiveRecords(actor);
  // Every word typed must appear in the number, the opportunity's name or the company's name.
  const search = searchWords(query.search).map((word) => {
    const contains = { contains: word, mode: "insensitive" } as const;
    return {
      OR: [
        { number: contains },
        { opportunity: { name: contains } },
        { company: { name: contains } },
      ],
    };
  });
  const startOfToday = fromDay(today);
  const byStatus: Record<ApiQuoteStatus, Prisma.QuoteWhereInput> = {
    DRAFT: { status: "DRAFT" },
    ACCEPTED: { status: "ACCEPTED" },
    DECLINED: { status: "DECLINED" },
    // A sent quote is one or the other, never both.
    SENT: { status: "SENT", OR: [{ validUntil: null }, { validUntil: { gte: startOfToday } }] },
    EXPIRED: { status: "SENT", validUntil: { lt: startOfToday } },
  };
  const where: Prisma.QuoteWhereInput = {
    AND: [
      // A filter narrows the list but never widens it: the opportunity must be visible, and
      // the owner filter is a second condition beside that, never a replacement for it.
      { opportunity: { AND: [visible, { ownerId: query.ownerId }] } },
      { opportunityId: query.opportunityId, companyId: query.companyId },
      query.status ? byStatus[query.status] : {},
      ...search,
    ],
  };

  const { sort, order } = query;
  const tieBreak = { id: order };
  const orderBy: Prisma.QuoteOrderByWithRelationInput[] =
    sort === "number"
      ? [{ sequence: order }]
      : sort === "validUntil"
        ? // A quote without the date sorts last in both directions.
          [{ validUntil: { sort: order, nulls: "last" } }, tieBreak]
        : [{ [sort]: order }, tieBreak];

  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({ where, include: withDetails, orderBy, ...window }),
    prisma.quote.count({ where }),
  ]);
  return { items: quotes.map((quote) => toApiQuote(quote, today)), total };
}

export async function listQuotes(
  actor: Actor,
  query: QuoteListQuery,
  today: Day,
): Promise<Page<ApiQuote>> {
  return findQuotes(actor, query, today, pageWindow(query));
}

// DATA-03: the list as a CSV file, for everyone who can see the list.
export async function exportQuotes(
  actor: Actor,
  query: QuoteListQuery,
  today: Day,
): Promise<CsvExport> {
  const moment = momentFormatter(query.tz);
  const columns: ExportColumn<ApiQuote>[] = [
    { header: "Number", value: (quote) => quote.number },
    { header: "Opportunity", value: (quote) => quote.opportunity.name },
    { header: "Company", value: (quote) => quote.company?.name ?? null },
    { header: "Contact", value: (quote) => quote.contact?.name ?? null },
    { header: "Status", value: (quote) => enumLabel(quote.status) },
    { header: "Issue date", value: (quote) => quote.issueDate },
    { header: "Valid until", value: (quote) => quote.validUntil },
    { header: "Subtotal", value: (quote) => quote.subtotal },
    { header: "Discount", value: (quote) => quote.discountTotal },
    { header: "Tax", value: (quote) => quote.taxTotal },
    { header: "Total", value: (quote) => quote.total },
    { header: "Sent", value: (quote) => moment(quote.sentAt) },
    { header: "Accepted", value: (quote) => moment(quote.acceptedAt) },
    { header: "Declined", value: (quote) => moment(quote.declinedAt) },
    { header: "Invoice", value: (quote) => quote.invoice?.number ?? null },
    { header: "Created by", value: (quote) => quote.createdBy.name },
    { header: "Created", value: (quote) => moment(quote.createdAt) },
  ];
  return buildCsvExport(columns, await findQuotes(actor, query, today, exportWindow));
}

export async function getQuote(actor: Actor, id: string, today: Day): Promise<ApiQuote> {
  return toApiQuote(await findQuote(actor, id), today);
}

// Writes a new draft with its lines and its QUOTE_STATUS entry, under the next number.
async function insertDraft(
  actor: Actor,
  data: Omit<Prisma.QuoteUncheckedCreateInput, "number" | "sequence" | "createdById">,
  lines: LineData[],
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const { number, sequence } = await nextDocumentNumber(tx, "quote");
    const quote = await tx.quote.create({
      data: { ...data, number, sequence, createdById: actor.id },
    });
    await tx.quoteLine.createMany({
      data: lines.map((line) => ({ ...line, quoteId: quote.id })),
    });
    await addTimelineEntry(tx, statusEntry(actor, quote, null, "DRAFT"));
    return quote.id;
  });
}

export async function createQuote(
  actor: Actor,
  input: CreateQuoteBody,
  today: Day,
): Promise<ApiQuote> {
  assertCanWrite(actor);
  // An opportunity the caller cannot see answers like one that does not exist, on the field.
  const opportunity = await findOpportunity(actor, input.opportunityId).catch(
    notFoundAsFieldError("opportunityId", "Choose an opportunity you can see"),
  );
  await assertBuyerVisible(actor, input);
  const organization = await findOrganization();

  const issueDate = input.issueDate ?? today;
  const validUntil =
    input.validUntil === undefined
      ? addDays(issueDate, organization.defaultValidityDays)
      : input.validUntil;
  assertValidity(issueDate, validUntil);
  const discountType = input.discountType ?? "NONE";
  const discountValue = new Prisma.Decimal(
    discountType === "NONE" ? 0 : (input.discountValue ?? 0),
  );
  const built = await buildLines(input.lines ?? [], new Set(), organization.defaultTaxRate);
  const { lines, totals } = price(built, discountType, discountValue);

  const id = await insertDraft(
    actor,
    {
      opportunityId: opportunity.id,
      // Left out: whoever the opportunity names (and the caller may see). null: nobody.
      contactId:
        input.contactId === undefined ? (opportunity.contact?.id ?? null) : input.contactId,
      companyId:
        input.companyId === undefined ? (opportunity.company?.id ?? null) : input.companyId,
      issueDate: fromDay(issueDate),
      validUntil: validUntil === null ? null : fromDay(validUntil),
      discountType,
      discountValue,
      ...totals,
      notes: input.notes ?? null,
      terms: input.terms === undefined ? organization.defaultQuoteTerms : input.terms,
    },
    lines,
  );
  return getQuote(actor, id, today);
}

function notEditable(): AppError {
  return new AppError(
    "QUOTE_NOT_EDITABLE",
    409,
    "Only a draft quote can be changed or deleted. Reopen the quote first.",
  );
}

// PATCH: only the keys sent change, but `lines` replaces the whole list. The totals are
// counted again whatever changed.
export async function updateQuote(
  actor: Actor,
  id: string,
  input: UpdateQuoteBody,
  today: Day,
): Promise<ApiQuote> {
  assertCanWrite(actor);
  const quote = await findQuote(actor, id);
  if (quote.status !== "DRAFT") {
    throw notEditable();
  }
  await assertBuyerVisible(actor, input);

  const issueDate = input.issueDate ?? toDay(quote.issueDate);
  const storedValidUntil = quote.validUntil ? toDay(quote.validUntil) : null;
  const validUntil = input.validUntil === undefined ? storedValidUntil : input.validUntil;
  assertValidity(issueDate, validUntil);
  const discountType = input.discountType ?? quote.discountType;
  const discountValue =
    discountType === "NONE"
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(input.discountValue ?? quote.discountValue);

  const kept = new Set(quote.lines.flatMap((line) => (line.productId ? [line.productId] : [])));
  const built = input.lines
    ? await buildLines(input.lines, kept, (await findOrganization()).defaultTaxRate)
    : quote.lines;
  const { lines, totals } = price(built, discountType, discountValue);

  await prisma.$transaction(async (tx) => {
    // Refused when the quote was sent in the meantime.
    const { count } = await tx.quote.updateMany({
      where: { id, status: "DRAFT" },
      data: {
        contactId: input.contactId,
        companyId: input.companyId,
        issueDate: fromDay(issueDate),
        validUntil: validUntil === null ? null : fromDay(validUntil),
        discountType,
        discountValue,
        ...totals,
        notes: input.notes,
        terms: input.terms,
      },
    });
    if (count === 0) {
      throw notEditable();
    }
    if (input.lines) {
      await tx.quoteLine.deleteMany({ where: { quoteId: id } });
      await tx.quoteLine.createMany({
        data: lines.map((line) => ({
          position: line.position,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          taxRate: line.taxRate,
          lineTotal: line.lineTotal,
          quoteId: id,
        })),
      });
    }
  });
  return getQuote(actor, id, today);
}

// A new draft with the same buyer, lines, discount, notes and terms, dated today. Whatever
// the status of the original: the way to revise a quote that was sent or declined.
export async function duplicateQuote(actor: Actor, id: string, today: Day): Promise<ApiQuote> {
  assertCanWrite(actor);
  const quote = await findQuote(actor, id);
  const organization = await findOrganization();
  const lines = quote.lines.map((line, position) => ({
    position,
    productId: line.productId,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    taxRate: line.taxRate,
    lineTotal: line.lineTotal,
  }));
  const copyId = await insertDraft(
    actor,
    {
      opportunityId: quote.opportunityId,
      contactId: quote.contactId,
      companyId: quote.companyId,
      issueDate: fromDay(today),
      validUntil: fromDay(addDays(today, organization.defaultValidityDays)),
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      taxTotal: quote.taxTotal,
      total: quote.total,
      notes: quote.notes,
      terms: quote.terms,
    },
    lines,
  );
  return getQuote(actor, copyId, today);
}

// Deleted for real, with its lines: a draft was never given to anyone. Its number is not
// used again.
export async function deleteQuote(actor: Actor, id: string): Promise<void> {
  assertCanWrite(actor);
  const quote = await findQuote(actor, id);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.quote.deleteMany({ where: { id, status: "DRAFT" } });
    if (count === 0) {
      throw notEditable();
    }
    await addTimelineEntry(tx, statusEntry(actor, quote, "DRAFT", null));
  });
}

// One change of status: under the row lock, check where the quote stands now, write the new
// status and the QUOTE_STATUS entry. Returns the status it had.
async function changeStatus(
  tx: Prisma.TransactionClient,
  actor: Actor,
  id: string,
  change: {
    from: QuoteStatus[];
    to: QuoteStatus;
    refusal: string;
    data: Prisma.QuoteUncheckedUpdateInput;
    // Sending and accepting need something to send or accept.
    needsLines?: boolean;
    // Reopening is refused once an invoice exists.
    withoutInvoice?: boolean;
  },
): Promise<QuoteStatus> {
  await lockQuote(tx, id);
  const quote = await tx.quote.findUniqueOrThrow({
    where: { id },
    include: {
      invoice: { select: { id: true, number: true } },
      _count: { select: { lines: true } },
    },
  });
  if (!change.from.includes(quote.status)) {
    throw invalidStatus(change.refusal, quote.status);
  }
  if (change.withoutInvoice && quote.invoice) {
    throw new AppError(
      "INVOICE_EXISTS",
      409,
      `Invoice ${quote.invoice.number} was made from this quote, so it cannot be reopened`,
      { invoice: quote.invoice },
    );
  }
  if (change.needsLines && quote._count.lines === 0) {
    throw new AppError("VALIDATION_FAILED", 400, "Add at least one line to the quote first");
  }
  await tx.quote.update({ where: { id }, data: { ...change.data, status: change.to } });
  if (quote.status !== change.to) {
    await addTimelineEntry(tx, statusEntry(actor, quote, quote.status, change.to));
  }
  return quote.status;
}

// The lines and totals of a quote as text, for the email that carries it (no PDF yet).
function quoteSummary(quote: QuoteWithDetails): string {
  const lines = quote.lines.map((line) => {
    const discount = line.discountPercent.isZero()
      ? ""
      : ` (${line.discountPercent.toString()}% off)`;
    return `${line.quantity.toString()} x ${line.description} @ ${formatMoney(line.unitPrice)}${discount}: ${formatMoney(line.lineTotal)}`;
  });
  const validity = quote.validUntil ? `, valid until ${toDay(quote.validUntil)}` : "";
  return [
    `Quote ${quote.number}`,
    `Issued ${toDay(quote.issueDate)}${validity}`,
    "",
    ...lines,
    "",
    `Subtotal: ${formatMoney(quote.subtotal)}`,
    ...(quote.discountTotal.isZero() ? [] : [`Discount: -${formatMoney(quote.discountTotal)}`]),
    `Tax: ${formatMoney(quote.taxTotal)}`,
    `Total: ${formatMoney(quote.total)}`,
  ].join("\n");
}

// Marks the quote as sent and, with `email`, also emails it through the same path as an
// email from a record: the message goes out first, and only then are the status and the
// EMAIL entry on the opportunity written. A quote that was already sent can be emailed again.
export async function sendQuote(
  sender: Sender,
  id: string,
  input: SendQuoteBody,
  today: Day,
): Promise<ApiQuote> {
  assertCanWrite(sender);
  const quote = await findQuote(sender, id);
  const alreadySent = "This quote was already sent. Send it again with an email, or reopen it.";
  if (quote.status !== "DRAFT" && (quote.status !== "SENT" || !input.email)) {
    throw invalidStatus(
      quote.status === "SENT" ? alreadySent : "Only a draft quote can be sent. Reopen it first.",
      quote.status,
    );
  }
  if (quote.lines.length === 0) {
    throw new AppError("VALIDATION_FAILED", 400, "Add at least one line to the quote first");
  }

  const email = input.email
    ? composeEmail(
        sender,
        { ...input.email, body: `${input.email.body}\n\n${quoteSummary(quote)}` },
        {
          "opportunity.name": quote.opportunity.name,
          "contact.firstName": quote.contact?.firstName,
          "contact.lastName": quote.contact?.lastName,
          "company.name": quote.company?.name,
          "quote.number": quote.number,
          "quote.total": formatMoney(quote.total),
        },
      )
    : null;
  if (email) {
    await deliverEmail(email.message);
  }

  await prisma.$transaction(async (tx) => {
    await changeStatus(tx, sender, id, {
      from: ["DRAFT", "SENT"],
      to: "SENT",
      refusal: "Only a draft quote can be sent. Reopen it first.",
      data: { sentAt: new Date() },
      needsLines: true,
    });
    if (email) {
      await addEmailEntry(tx, sender.id, { type: "opportunity", id: quote.opportunityId }, email, {
        quote: { id: quote.id, number: quote.number },
      });
    }
  });
  return getQuote(sender, id, today);
}

// The customer said yes. Straight from a draft is fine: not every quote is sent from here.
// It does not close the opportunity; that stays the user's own step.
export async function acceptQuote(actor: Actor, id: string, today: Day): Promise<ApiQuote> {
  assertCanWrite(actor);
  await findQuote(actor, id);
  await prisma.$transaction((tx) =>
    changeStatus(tx, actor, id, {
      from: ["DRAFT", "SENT"],
      to: "ACCEPTED",
      refusal: "Only a draft or a sent quote can be accepted. Reopen it first.",
      data: { acceptedAt: new Date(), declinedAt: null },
      needsLines: true,
    }),
  );
  return getQuote(actor, id, today);
}

export async function declineQuote(actor: Actor, id: string, today: Day): Promise<ApiQuote> {
  assertCanWrite(actor);
  await findQuote(actor, id);
  await prisma.$transaction((tx) =>
    changeStatus(tx, actor, id, {
      from: ["DRAFT", "SENT"],
      to: "DECLINED",
      refusal: "Only a draft or a sent quote can be declined. Reopen it first.",
      data: { declinedAt: new Date(), acceptedAt: null },
    }),
  );
  return getQuote(actor, id, today);
}

// Back to a draft, to change it or to undo a wrong click. Not once an invoice was made from
// it: the invoice is a copy of what was accepted.
export async function reopenQuote(actor: Actor, id: string, today: Day): Promise<ApiQuote> {
  assertCanWrite(actor);
  await findQuote(actor, id);
  await prisma.$transaction((tx) =>
    changeStatus(tx, actor, id, {
      from: ["SENT", "ACCEPTED", "DECLINED"],
      to: "DRAFT",
      refusal: "This quote is already a draft",
      data: { sentAt: null, acceptedAt: null, declinedAt: null },
      withoutInvoice: true,
    }),
  );
  return getQuote(actor, id, today);
}

// The quote as a sheet of paper (QUOT-03): seller, buyer, lines and totals, ready to print.
export async function getQuoteDocument(
  actor: Actor,
  id: string,
  today: Day,
): Promise<SalesDocument> {
  const quote = await findQuote(actor, id);
  const organization = await findOrganization();
  const { contact, company } = quote;
  return {
    kind: "QUOTE",
    number: quote.number,
    status: statusOn(quote, today),
    currency: "USD",
    issueDate: toDay(quote.issueDate),
    validUntil: quote.validUntil ? toDay(quote.validUntil) : null,
    dueDate: null,
    paymentTermsDays: null,
    quoteNumber: null,
    seller: {
      name: organization.name,
      address: organization.address,
      email: organization.email,
      phone: organization.phone,
      taxId: organization.taxId,
    },
    buyer: {
      contactName: contact ? `${contact.firstName} ${contact.lastName}` : null,
      contactEmail: contact?.email ?? null,
      companyName: company?.name ?? null,
      companyAddress: company?.address ?? null,
    },
    opportunityName: quote.opportunity.name,
    preparedBy: { name: quote.createdBy.name, email: quote.createdBy.email },
    lines: quote.lines.map((line) => toApiLine(line)),
    subtotal: quote.subtotal.toNumber(),
    discountType: quote.discountType,
    discountValue: quote.discountValue.toNumber(),
    discountTotal: quote.discountTotal.toNumber(),
    taxes: taxRows(quote.lines, quote.discountTotal),
    taxTotal: quote.taxTotal.toNumber(),
    total: quote.total.toNumber(),
    notes: quote.notes,
    terms: quote.terms,
  };
}
