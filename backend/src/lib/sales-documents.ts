import { Prisma } from "../generated/prisma/client";
import { z } from "./openapi";

// What quotes and invoices share: the arithmetic, the numbering, the shape of a line and the
// print-ready document. An invoice is a copy of a quote, so both must count the same way.

type Decimal = Prisma.Decimal;
// The same decimal type with room for 40 significant digits instead of 20, so that no product
// or quotient of two amounts is ever cut short before it is rounded to cents.
const Decimal = Prisma.Decimal.clone({ precision: 40 });
type DecimalValue = Prisma.Decimal | number | string;

// ---------------------------------------------------------------------------------------
// Arithmetic
//
// All money is counted with exact decimals (never JavaScript numbers) and rounded half up
// to cents, at exactly these points:
//
//   1. line total     = quantity x unit price x (1 - line discount %), rounded
//   2. subtotal       = the sum of the line totals
//   3. discount total = NONE: 0; PERCENT: subtotal x discount %, rounded;
//                       AMOUNT: the amount, but never more than the subtotal
//   4. tax            = per tax rate: (the line totals at that rate, less their share of the
//                       discount) x rate, rounded. The discount is shared out in proportion
//                       to the line totals. The tax total is the sum over the rates.
//   5. total          = subtotal - discount total + tax total
//
// A line's own total is before tax and before the quote's discount.
// ---------------------------------------------------------------------------------------

export const DISCOUNT_TYPES = ["NONE", "PERCENT", "AMOUNT"] as const;

export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export interface LineAmounts {
  quantity: DecimalValue;
  unitPrice: DecimalValue;
  discountPercent: DecimalValue;
  taxRate: DecimalValue;
}

export interface TaxLine {
  // Percent.
  rate: Decimal;
  // What the rate applies to: the lines at this rate after the discount, rounded for display.
  taxableAmount: Decimal;
  taxAmount: Decimal;
}

export interface Totals {
  // One per line, in the order given.
  lineTotals: Decimal[];
  subtotal: Decimal;
  discountTotal: Decimal;
  // One per tax rate above 0 that a line uses, lowest rate first.
  taxes: TaxLine[];
  taxTotal: Decimal;
  total: Decimal;
}

function toCents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function lineTotal(line: LineAmounts): Decimal {
  const gross = new Decimal(line.quantity).times(line.unitPrice);
  return toCents(gross.times(new Decimal(100).minus(line.discountPercent)).dividedBy(100));
}

function discountOf(subtotal: Decimal, type: DiscountType, value: DecimalValue): Decimal {
  switch (type) {
    case "NONE": {
      return new Decimal(0);
    }
    case "PERCENT": {
      return toCents(subtotal.times(value).dividedBy(100));
    }
    case "AMOUNT": {
      return Decimal.min(toCents(new Decimal(value)), subtotal);
    }
  }
}

export function computeTotals(
  lines: LineAmounts[],
  discountType: DiscountType,
  discountValue: DecimalValue,
): Totals {
  const lineTotals = lines.map((line) => lineTotal(line));
  const subtotal = Decimal.sum(0, ...lineTotals);
  const discountTotal = discountOf(subtotal, discountType, discountValue);
  const afterDiscount = subtotal.minus(discountTotal);

  // The line totals per tax rate.
  const atRate = new Map<string, Decimal>();
  for (const [index, line] of lines.entries()) {
    const rate = new Decimal(line.taxRate).toFixed(2);
    atRate.set(rate, (atRate.get(rate) ?? new Decimal(0)).plus(lineTotals[index] ?? 0));
  }
  const taxes = [...atRate.entries()]
    .map(([rate, amount]) => ({
      rate: new Decimal(rate),
      // The amount less its share of the discount. Multiplied before it is divided, so a
      // share that comes out even stays exact.
      taxable: subtotal.isZero() ? amount : amount.times(afterDiscount).dividedBy(subtotal),
    }))
    .filter((tax) => tax.rate.greaterThan(0))
    .sort((a, b) => a.rate.comparedTo(b.rate))
    .map(({ rate, taxable }) => ({
      rate,
      taxableAmount: toCents(taxable),
      taxAmount: toCents(taxable.times(rate).dividedBy(100)),
    }));
  const taxTotal = Decimal.sum(0, ...taxes.map((tax) => tax.taxAmount));

  return {
    lineTotals,
    subtotal,
    discountTotal,
    taxes,
    taxTotal,
    total: afterDiscount.plus(taxTotal),
  };
}

// The most a total may be: what fits the Decimal(16, 2) columns with room to spare.
export const MAX_DOCUMENT_TOTAL = new Decimal("99999999999.99");

// "$1,234.50", for the text of an email. The app is single-currency (US dollars) for now.
export function formatMoney(amount: DecimalValue): string {
  const fixed = new Decimal(amount).toFixed(2);
  const [whole = "0", cents = "00"] = fixed.split(".");
  return `$${whole.replaceAll(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

// ---------------------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------------------

const NUMBER_PREFIX = { quote: "Q", invoice: "INV" } as const;

// The next number of the series: 1, 2, 3, ... per installation. Call it inside the
// transaction that creates the document. The counter row is locked until that transaction
// ends, so two requests never get the same number, and a create that fails rolls its
// number back, so the series has no gap from a failure.
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  series: keyof typeof NUMBER_PREFIX,
): Promise<{ sequence: number; number: string }> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "DocumentCounter" ("name", "value") VALUES (${series}, 1)
    ON CONFLICT ("name") DO UPDATE SET "value" = "DocumentCounter"."value" + 1
    RETURNING "value"`;
  const sequence = rows[0]?.value ?? 1;
  return {
    sequence,
    number: `${NUMBER_PREFIX[series]}-${String(sequence).padStart(4, "0")}`,
  };
}

// ---------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------

// A day column ("2026-11-15") as the API answers with it, and back.
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromDay(day: string): Date {
  return new Date(day);
}

export function addDays(day: string, days: number): string {
  const date = fromDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
}

// A percentage from 0 to 100 with at most two decimals (a tax rate, a discount).
export const percentSchema = z
  .number()
  .min(0)
  .max(100)
  .multipleOf(0.01, "Use at most two decimal places");

// A line as a quote and an invoice answer with it. Numbers are JSON numbers.
export const documentLineSchema = z
  .object({
    id: z.string(),
    // The product the line was made from, if any. Its name, price and tax rate were copied
    // when the line was added; changing the product later does not change the line.
    productId: z.string().nullable(),
    description: z.string(),
    // Up to three decimals.
    quantity: z.number(),
    unitPrice: z.number(),
    // Percent, 0 to 100.
    discountPercent: z.number(),
    taxRate: z.number(),
    // quantity x unitPrice less the line discount, before tax and before the quote's discount.
    lineTotal: z.number(),
  })
  .openapi("DocumentLine");

export type ApiDocumentLine = z.infer<typeof documentLineSchema>;

export interface StoredLine {
  id: string;
  productId: string | null;
  description: string;
  quantity: Decimal;
  unitPrice: Decimal;
  discountPercent: Decimal;
  taxRate: Decimal;
  lineTotal: Decimal;
}

export function toApiLine(line: StoredLine): ApiDocumentLine {
  return {
    id: line.id,
    productId: line.productId,
    description: line.description,
    quantity: line.quantity.toNumber(),
    unitPrice: line.unitPrice.toNumber(),
    discountPercent: line.discountPercent.toNumber(),
    taxRate: line.taxRate.toNumber(),
    lineTotal: line.lineTotal.toNumber(),
  };
}

// Who a quote or an invoice is for.
export const documentContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
});

// A quote or an invoice as a sheet of paper: everything a print view or a PDF renderer
// needs, with nothing left to look up or to count.
export const salesDocumentSchema = z
  .object({
    kind: z.enum(["QUOTE", "INVOICE"]),
    number: z.string(),
    status: z.string(),
    // Always "USD" for now.
    currency: z.string(),
    issueDate: z.string(),
    // A quote's last day of validity; null on an invoice or when the quote has none.
    validUntil: z.string().nullable(),
    // An invoice's due date and the payment terms it was counted from; null on a quote.
    dueDate: z.string().nullable(),
    paymentTermsDays: z.number().int().nullable(),
    // The quote an invoice was made from; null on a quote.
    quoteNumber: z.string().nullable(),
    seller: z.object({
      name: z.string(),
      address: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      taxId: z.string().nullable(),
    }),
    buyer: z.object({
      contactName: z.string().nullable(),
      contactEmail: z.string().nullable(),
      companyName: z.string().nullable(),
      companyAddress: z.string().nullable(),
    }),
    opportunityName: z.string(),
    // The person who made the document.
    preparedBy: z.object({ name: z.string(), email: z.string() }),
    lines: z.array(documentLineSchema),
    subtotal: z.number(),
    // What the discount is: NONE, a percentage or an amount. null on an invoice, which only
    // keeps the discount total.
    discountType: z.enum(DISCOUNT_TYPES).nullable(),
    discountValue: z.number().nullable(),
    discountTotal: z.number(),
    // One row per tax rate above 0, lowest first; their taxAmount adds up to taxTotal.
    taxes: z.array(
      z.object({ rate: z.number(), taxableAmount: z.number(), taxAmount: z.number() }),
    ),
    taxTotal: z.number(),
    total: z.number(),
    notes: z.string().nullable(),
    terms: z.string().nullable(),
  })
  .openapi("SalesDocument");

export type SalesDocument = z.infer<typeof salesDocumentSchema>;

// The tax rows of a stored document, counted again from its lines and its discount total.
export function taxRows(lines: StoredLine[], discountTotal: Decimal): SalesDocument["taxes"] {
  return computeTotals(lines, "AMOUNT", discountTotal).taxes.map((tax) => ({
    rate: tax.rate.toNumber(),
    taxableAmount: tax.taxableAmount.toNumber(),
    taxAmount: tax.taxAmount.toNumber(),
  }));
}
