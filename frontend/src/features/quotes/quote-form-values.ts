import { z } from "zod";

import type { ApiError } from "@/lib/api/http";

import { QUOTE_DISCOUNT_TYPES } from "./quote-labels";
import type {
  CreateQuoteInput,
  Quote,
  QuoteLine,
  QuoteLineInput,
  UpdateQuoteInput,
} from "./quotes.types";

// What the quote editor keeps in its form, the checks it runs before anything is sent, and
// how the form becomes a request. Numbers are text in the form and JSON numbers in the request.

// The most lines one quote holds: the API's limit.
export const MAX_QUOTE_LINES = 100;

const tooLong = (max: number) => `Use ${String(max)} characters or fewer.`;

const QUANTITY = /^\d{1,7}(\.\d{1,3})?$/;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;

const isPercent = (text: string) => PERCENT.test(text) && Number(text) <= 100;

// A percentage box: empty means 0.
const percentText = z
  .string()
  .trim()
  .refine((text) => text === "" || isPercent(text), "Enter a percentage from 0 to 100.");

// The same limits as the API, to save a round trip. The server checks again.
const lineSchema = z.object({
  // The catalog product the line was made from, and its name for the picker; "" for a line
  // typed by hand. The line's own description, price and tax rate are what is sent and kept.
  productId: z.string(),
  productName: z.string(),
  description: z.string().trim().min(1, "Describe the line.").max(500, tooLong(500)),
  quantity: z
    .string()
    .trim()
    .refine(
      (text) => QUANTITY.test(text) && Number(text) > 0,
      "Enter a quantity above 0, such as 2 or 1.5.",
    ),
  unitPrice: z.string().trim().regex(MONEY, "Enter a price such as 29 or 29.50."),
  discountPercent: percentText,
  taxRate: percentText,
});

export const quoteFormSchema = z
  .object({
    // The ids of the picked contact and company; "" for none.
    contactId: z.string(),
    companyId: z.string(),
    // The values of date inputs: "2026-11-15". "Valid until" may be "" for none.
    issueDate: z.string().min(1, "Choose the issue date."),
    validUntil: z.string(),
    lines: z.array(lineSchema),
    discountType: z.enum(QUOTE_DISCOUNT_TYPES),
    discountValue: z.string().trim(),
    notes: z.string().trim().max(5000, tooLong(5000)),
    terms: z.string().trim().max(5000, tooLong(5000)),
  })
  .superRefine((values, context) => {
    if (values.validUntil && values.validUntil < values.issueDate) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Choose a day on or after the issue date.",
      });
    }
    if (values.discountType === "PERCENT" && !isPercent(values.discountValue)) {
      context.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Enter a percentage from 0 to 100.",
      });
    }
    if (values.discountType === "AMOUNT" && !MONEY.test(values.discountValue)) {
      context.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "Enter an amount such as 50 or 49.99.",
      });
    }
  });

export type QuoteFormValues = z.infer<typeof quoteFormSchema>;
export type QuoteFormLine = QuoteFormValues["lines"][number];

// The name of one field of one line, as react-hook-form and the API both write it:
// "lines.0.quantity".
export function lineField<Key extends keyof QuoteFormLine>(index: number, key: Key) {
  return `lines.${String(index)}.${key}` as `lines.${number}.${Key}`;
}

// The fields of a line the API reports validation problems on, as `lines.<index>.<field>`.
export const LINE_FIELDS = [
  "description",
  "quantity",
  "unitPrice",
  "discountPercent",
  "taxRate",
] as const;

const QUOTE_FORM_FIELDS = [
  "contactId",
  "companyId",
  "issueDate",
  "validUntil",
  "discountType",
  "discountValue",
  "notes",
  "terms",
] as const;

// Every field the API can name for a form with this many lines.
export function quoteFormFields(lineCount: number) {
  const lineFields = Array.from({ length: lineCount }, (_, index) =>
    LINE_FIELDS.map((field) => lineField(index, field)),
  ).flat();
  return [...QUOTE_FORM_FIELDS, ...lineFields];
}

// The API reports a product that cannot be used (archived, gone) on `lines.<i>.productId`.
// The form shows it under the line's description, beside the product picker.
export function forFormFields(error: ApiError): ApiError {
  if (!Array.isArray(error.details)) {
    return error;
  }
  const details = (error.details as unknown[]).map((detail) => {
    if (typeof detail !== "object" || detail === null || !("path" in detail)) {
      return detail;
    }
    return typeof detail.path === "string"
      ? { ...detail, path: detail.path.replace(/^(lines\.\d+)\.productId$/, "$1.description") }
      : detail;
  });
  return { ...error, details };
}

// A line the user has not filled in yet. `taxRate` starts at the organisation's default.
export function emptyLine(defaultTaxRate: number): QuoteFormLine {
  return {
    productId: "",
    productName: "",
    description: "",
    quantity: "1",
    unitPrice: "",
    discountPercent: "",
    taxRate: String(defaultTaxRate),
  };
}

// A stored line as the form holds it. A line made from a product does not carry the
// product's name, so the picker shows the first line of the description, which started as it.
export function toFormLine(line: QuoteLine): QuoteFormLine {
  return {
    productId: line.productId ?? "",
    productName: line.productId ? (line.description.split("\n")[0] ?? "") : "",
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: line.unitPrice.toFixed(2),
    discountPercent: line.discountPercent === 0 ? "" : String(line.discountPercent),
    taxRate: String(line.taxRate),
  };
}

// One line of a request. The description, price and tax rate are always sent, so the line
// is exactly what the user saw: the API copies from the product only what is left out.
function toLineInput(line: QuoteFormLine): QuoteLineInput {
  return {
    ...(line.productId ? { productId: line.productId } : {}),
    description: line.description,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    discountPercent: Number(line.discountPercent || 0),
    taxRate: Number(line.taxRate || 0),
  };
}

// The discount as the API stores it: no value without a type.
function discountValueOf(values: QuoteFormValues): number {
  return values.discountType === "NONE" ? 0 : Number(values.discountValue);
}

// A new quote sends everything the form shows. An empty buyer, "valid until", notes or terms
// is sent as null ("none"): left out, the API would fill it in again from the opportunity
// and the organisation's defaults, against what the user saw.
export function toCreateInput(opportunityId: string, values: QuoteFormValues): CreateQuoteInput {
  return {
    opportunityId,
    contactId: values.contactId || null,
    companyId: values.companyId || null,
    issueDate: values.issueDate,
    validUntil: values.validUntil || null,
    lines: values.lines.map((line) => toLineInput(line)),
    discountType: values.discountType,
    discountValue: discountValueOf(values),
    notes: values.notes || null,
    terms: values.terms || null,
  };
}

function sameLine(stored: QuoteLine, line: QuoteLineInput): boolean {
  return (
    stored.productId === (line.productId ?? null) &&
    stored.description === line.description &&
    stored.quantity === line.quantity &&
    stored.unitPrice === line.unitPrice &&
    stored.discountPercent === line.discountPercent &&
    stored.taxRate === line.taxRate
  );
}

// Only what the user actually changed is sent; an emptied field is sent as null. `lines` is
// the exception the API makes: it replaces the whole list, so when any line was changed,
// added, removed or moved, every line is sent.
export function changedFields(quote: Quote, values: QuoteFormValues): UpdateQuoteInput {
  const changes: UpdateQuoteInput = {};
  const contactId = values.contactId || null;
  if (contactId !== (quote.contact?.id ?? null)) {
    changes.contactId = contactId;
  }
  const companyId = values.companyId || null;
  if (companyId !== (quote.company?.id ?? null)) {
    changes.companyId = companyId;
  }
  if (values.issueDate !== quote.issueDate) {
    changes.issueDate = values.issueDate;
  }
  const validUntil = values.validUntil || null;
  if (validUntil !== quote.validUntil) {
    changes.validUntil = validUntil;
  }
  const lines = values.lines.map((line) => toLineInput(line));
  if (
    lines.length !== quote.lines.length ||
    quote.lines.some((stored, index) => {
      const line = lines[index];
      return !line || !sameLine(stored, line);
    })
  ) {
    changes.lines = lines;
  }
  if (values.discountType !== quote.discountType) {
    changes.discountType = values.discountType;
  }
  const discountValue = discountValueOf(values);
  if (discountValue !== quote.discountValue) {
    changes.discountValue = discountValue;
  }
  const notes = values.notes || null;
  if (notes !== quote.notes) {
    changes.notes = notes;
  }
  const terms = values.terms || null;
  if (terms !== quote.terms) {
    changes.terms = terms;
  }
  return changes;
}
