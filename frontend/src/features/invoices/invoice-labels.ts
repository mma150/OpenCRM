import type { SelectOption } from "@/components/shared/select-control";
import type { Role } from "@/lib/user-labels";

import type { InvoiceAction, InvoiceStatus } from "./invoices.types";

// The words for an invoice's status. Never print the raw enum value.
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
};

export const INVOICE_STATUSES = Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[];

export const invoiceStatusOptions: SelectOption[] = INVOICE_STATUSES.map((status) => ({
  value: status,
  label: INVOICE_STATUS_LABELS[status],
}));

// What each status change is called on its button, and in the sentence that says it was done.
export const INVOICE_ACTION_LABELS: Record<InvoiceAction, string> = {
  "mark-sent": "Mark sent",
  "mark-paid": "Mark paid",
  "mark-overdue": "Mark overdue",
  "mark-unpaid": "Mark unpaid",
  void: "Void",
  restore: "Restore",
};

export const INVOICE_ACTION_DONE: Record<InvoiceAction, string> = {
  "mark-sent": "was marked as sent. Nothing was emailed.",
  "mark-paid": "was marked as paid.",
  "mark-overdue": "was marked as overdue.",
  "mark-unpaid": "was marked as unpaid. It is a sent invoice again.",
  void: "was voided.",
  restore: "was restored as a draft.",
};

// The status changes to offer for an invoice, the main one first.
//
// `status` is what the invoice READS as for the viewer, while the API goes by what is
// STORED. The two differ in one case: a SENT invoice whose due date has passed reads as
// OVERDUE. So an overdue invoice is offered "Mark unpaid" only while its due date has not
// passed: then it can only have been marked overdue by hand, and marking it unpaid makes it
// a sent invoice again. Once the due date has passed, "Mark unpaid" would either be refused
// (it is stored as SENT) or change nothing on screen (it would read as overdue again).
//
// `dueDate` and `today` are calendar days ("2026-11-15"); `today` is the viewer's.
export function invoiceActions(
  status: InvoiceStatus,
  dueDate: string,
  today: string,
): InvoiceAction[] {
  switch (status) {
    case "DRAFT":
      return ["mark-sent", "mark-paid", "void"];
    case "SENT":
      return ["mark-paid", "mark-overdue", "void"];
    case "OVERDUE":
      return dueDate < today ? ["mark-paid", "void"] : ["mark-paid", "mark-unpaid", "void"];
    case "PAID":
      return ["mark-unpaid"];
    case "VOID":
      return ["restore"];
  }
}

// Read-only users see invoices, export them and print them, and change nothing. Everyone
// else may change the invoices the API shows them (access follows the opportunity). The API
// enforces it; the UI only avoids offering what would be refused.
export function invoiceAccess(role: Role): { canWrite: boolean } {
  return { canWrite: role !== "READ_ONLY" };
}
