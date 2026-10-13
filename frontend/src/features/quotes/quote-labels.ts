import type { SelectOption } from "@/components/shared/select-control";
import { recordAccess } from "@/lib/record-access";

import type { Quote, QuoteDiscountType, QuoteStatus } from "./quotes.types";

// The words for a quote's status. Never print the raw enum value. EXPIRED is what a sent
// quote reads as once its "valid until" day has passed; the API works that out.
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export const QUOTE_STATUSES: QuoteStatus[] = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"];

export const quoteStatusOptions: SelectOption[] = QUOTE_STATUSES.map((status) => ({
  value: status,
  label: QUOTE_STATUS_LABELS[status],
}));

export const QUOTE_DISCOUNT_TYPES: QuoteDiscountType[] = ["NONE", "PERCENT", "AMOUNT"];

export const quoteDiscountOptions: SelectOption[] = [
  { value: "NONE", label: "No discount" },
  { value: "PERCENT", label: "Percent" },
  { value: "AMOUNT", label: "Amount" },
];

// A quote follows its opportunity, so a role may change quotes exactly when it may change
// opportunities: everyone but Read-only.
export const quoteAccess = recordAccess;

// What the API will take for a quote in each status (the transition table in
// docs/standards/backend.md). An expired quote takes every action a sent one takes; a quote
// with an invoice, also a void one, cannot be reopened or invoiced again. The pages offer
// only these, so nobody is shown a button the API would refuse.
export function quoteActions(quote: Pick<Quote, "status" | "invoice">) {
  const { status } = quote;
  const sent = status === "SENT" || status === "EXPIRED";
  return {
    // Change and delete: a draft only.
    edit: status === "DRAFT",
    remove: status === "DRAFT",
    // DRAFT to SENT, with or without an email.
    send: status === "DRAFT",
    // A sent quote can be emailed again; it stays sent.
    sendAgain: sent,
    accept: status === "DRAFT" || sent,
    decline: status === "DRAFT" || sent,
    reopen: sent || status === "DECLINED" || (status === "ACCEPTED" && quote.invoice === null),
    createInvoice: status === "ACCEPTED" && quote.invoice === null,
  };
}
