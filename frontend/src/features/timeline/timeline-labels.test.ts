import { describe, expect, it } from "vitest";

import {
  call,
  created,
  emailSent,
  emailWithQuote,
  INVOICE,
  invoiceStatus,
  QUOTE,
  quoteStatus,
} from "./timeline.fixtures";
import { emailOf, entryLink, entryText, entryTitle } from "./timeline-labels";

const title = (entry: Parameters<typeof entryTitle>[0]) => entryTitle(entry, "Opportunity");

describe("timeline labels: an email", () => {
  it("is titled with its subject", () => {
    expect(title(emailSent)).toBe("Email sent: Recap of our demo");
  });

  it("falls back to plain words without a subject", () => {
    expect(title({ ...emailSent, details: null })).toBe("Email sent");
  });

  it("says who it went to, and its text is the email as it was sent", () => {
    expect(emailOf(emailSent)).toEqual({
      subject: "Recap of our demo",
      to: ["marcus.chen@acme.example", "ops@acme.example"],
      cc: ["mia@example.com"],
      quote: null,
    });
    expect(entryText(emailSent)).toBe(emailSent.body);
  });

  it("links to the quote it carried, and to nothing without one", () => {
    expect(entryLink(emailWithQuote)).toEqual({
      href: `/quotes/${QUOTE.id}`,
      label: "Quote Q-0001",
    });
    expect(entryLink(emailSent)).toBeNull();
  });

  it("survives details that are not what the API promises", () => {
    const odd = { ...emailSent, details: { to: "a@x.example", cc: [1, "b@x.example"], quote: 7 } };
    expect(emailOf(odd)).toEqual({ subject: null, to: [], cc: ["b@x.example"], quote: null });
  });
});

describe("timeline labels: a quote's status", () => {
  it.each([
    [null, "DRAFT", "Quote Q-0001 created · $4,360.87"],
    ["DRAFT", "SENT", "Quote Q-0001 sent · $4,360.87"],
    ["DRAFT", "ACCEPTED", "Quote Q-0001 accepted · $4,360.87"],
    ["SENT", "ACCEPTED", "Quote Q-0001 accepted · $4,360.87"],
    ["DRAFT", "DECLINED", "Quote Q-0001 declined"],
    ["SENT", "DECLINED", "Quote Q-0001 declined"],
    ["SENT", "DRAFT", "Quote Q-0001 reopened"],
    ["ACCEPTED", "DRAFT", "Quote Q-0001 reopened"],
    ["DECLINED", "DRAFT", "Quote Q-0001 reopened"],
    ["DRAFT", null, "Quote Q-0001 deleted"],
    ["SENT", "SOMETHING_NEW", "Quote Q-0001 updated"],
  ])("from %s to %s reads '%s'", (from, to, sentence) => {
    expect(title(quoteStatus(from, to))).toBe(sentence);
  });

  it("links its number to the quote, except for a quote that was deleted", () => {
    expect(entryLink(quoteStatus("DRAFT", "SENT"))).toEqual({
      href: `/quotes/${QUOTE.id}`,
      label: "Q-0001",
    });
    expect(entryLink(quoteStatus("DRAFT", null))).toBeNull();
  });

  it("leaves the total out when the API sent none", () => {
    const entry = quoteStatus(null, "DRAFT");
    expect(title({ ...entry, details: { ...entry.details, total: null } })).toBe(
      "Quote Q-0001 created",
    );
  });

  it("still reads as a sentence without the quote's number", () => {
    expect(title({ ...quoteStatus("DRAFT", "SENT"), details: { from: "DRAFT", to: "SENT" } })).toBe(
      "Quote sent",
    );
  });
});

describe("timeline labels: an invoice's status", () => {
  it.each([
    [null, "DRAFT", "Invoice INV-0001 created · $4,360.87"],
    ["DRAFT", "SENT", "Invoice INV-0001 marked sent"],
    ["DRAFT", "PAID", "Invoice INV-0001 marked paid"],
    ["SENT", "PAID", "Invoice INV-0001 marked paid"],
    ["OVERDUE", "PAID", "Invoice INV-0001 marked paid"],
    ["SENT", "OVERDUE", "Invoice INV-0001 marked overdue"],
    ["PAID", "SENT", "Invoice INV-0001 marked unpaid"],
    ["OVERDUE", "SENT", "Invoice INV-0001 marked unpaid"],
    ["DRAFT", "VOID", "Invoice INV-0001 voided"],
    ["SENT", "VOID", "Invoice INV-0001 voided"],
    ["OVERDUE", "VOID", "Invoice INV-0001 voided"],
    ["VOID", "DRAFT", "Invoice INV-0001 restored"],
    ["SENT", "SOMETHING_NEW", "Invoice INV-0001 updated"],
  ])("from %s to %s reads '%s'", (from, to, sentence) => {
    expect(title(invoiceStatus(from, to))).toBe(sentence);
  });

  it("links its number to the invoice", () => {
    expect(entryLink(invoiceStatus("SENT", "PAID"))).toEqual({
      href: `/invoices/${INVOICE.id}`,
      label: "INV-0001",
    });
  });
});

describe("timeline labels: other entries", () => {
  it("have no link", () => {
    expect(entryLink(call)).toBeNull();
    expect(entryLink(created)).toBeNull();
  });
});
