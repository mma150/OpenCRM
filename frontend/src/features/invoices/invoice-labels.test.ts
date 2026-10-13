import { describe, expect, it } from "vitest";

import { invoiceAccess, invoiceActions } from "./invoice-labels";

const TODAY = "2026-10-13";

describe("invoiceActions", () => {
  it.each([
    ["DRAFT", "2026-11-12", ["mark-sent", "mark-paid", "void"]],
    ["SENT", "2026-11-12", ["mark-paid", "mark-overdue", "void"]],
    // Due today is not past due: a sent invoice still reads as SENT on its due date.
    ["SENT", TODAY, ["mark-paid", "mark-overdue", "void"]],
    // Reads as overdue before its due date has passed: it was marked by hand, so it is
    // stored as OVERDUE and can be marked unpaid.
    ["OVERDUE", "2026-11-12", ["mark-paid", "mark-unpaid", "void"]],
    ["OVERDUE", TODAY, ["mark-paid", "mark-unpaid", "void"]],
    // Past its due date: it may be stored as SENT, which "mark unpaid" does not start from.
    ["OVERDUE", "2026-10-12", ["mark-paid", "void"]],
    ["OVERDUE", "2025-12-31", ["mark-paid", "void"]],
    ["PAID", "2026-09-01", ["mark-unpaid"]],
    ["VOID", "2026-09-01", ["restore"]],
  ] as const)("%s, due %s", (status, dueDate, expected) => {
    expect(invoiceActions(status, dueDate, TODAY)).toEqual(expected);
  });
});

describe("invoiceAccess", () => {
  it("lets every role but Read-only change invoices", () => {
    expect(invoiceAccess("ADMIN").canWrite).toBe(true);
    expect(invoiceAccess("SALES_MANAGER").canWrite).toBe(true);
    expect(invoiceAccess("SALES_REP").canWrite).toBe(true);
    expect(invoiceAccess("READ_ONLY").canWrite).toBe(false);
  });
});
