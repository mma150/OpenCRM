import { describe, expect, it } from "vitest";

import { pdfPageCount, pdfText } from "../../test/helpers";
import { renderSalesDocumentPdf, salesDocumentFilename, toWinAnsi } from "./sales-document-pdf";
import type { SalesDocument } from "./sales-documents";

type Line = SalesDocument["lines"][number];

function line(index: number, description: string): Line {
  return {
    id: `line-${String(index)}`,
    productId: null,
    description,
    quantity: 10,
    unitPrice: 1234.5,
    discountPercent: 10,
    taxRate: 8.25,
    lineTotal: 11_110.5,
  };
}

const QUOTE: SalesDocument = {
  kind: "QUOTE",
  number: "Q-0007",
  status: "DRAFT",
  currency: "USD",
  issueDate: "2026-11-01",
  validUntil: "2026-12-01",
  dueDate: null,
  paymentTermsDays: null,
  quoteNumber: null,
  seller: {
    name: "Acme Fleet Solutions",
    address: "12 Market Street\nBristol BS1 4DJ",
    email: "sales@acme.example",
    phone: "+44 117 555 0100",
    taxId: "GB123456789",
  },
  buyer: {
    contactName: "Elena Rostova",
    contactEmail: "elena@northwind.example",
    companyName: "Northwind Logistics",
    companyAddress: "1 Harbour Road, Bristol",
  },
  opportunityName: "Fleet tracking rollout",
  preparedBy: { name: "Ravi Rep", email: "ravi@example.com" },
  lines: [
    line(1, "Fleet tracking licence"),
    { ...line(2, "Onboarding package"), quantity: 1.5, discountPercent: 0, taxRate: 20 },
  ],
  subtotal: 2061,
  discountType: "PERCENT",
  discountValue: 10,
  discountTotal: 206.1,
  taxes: [
    { rate: 8.25, taxableAmount: 234.9, taxAmount: 19.38 },
    { rate: 20, taxableAmount: 1620, taxAmount: 324 },
  ],
  taxTotal: 343.38,
  total: 2198.28,
  notes: "Thank you for your business.",
  terms: "Payment within 30 days.",
};

const INVOICE: SalesDocument = {
  ...QUOTE,
  kind: "INVOICE",
  number: "INV-0003",
  status: "SENT",
  validUntil: null,
  dueDate: "2026-12-01",
  paymentTermsDays: 30,
  quoteNumber: "Q-0007",
  discountType: null,
  discountValue: null,
};

// Uncompressed, so the text can be read back.
function render(document: SalesDocument): Promise<Buffer> {
  return renderSalesDocumentPdf(document, { compress: false });
}

describe("toWinAnsi", () => {
  it("keeps Latin-1, the WinAnsi extras and line breaks", () => {
    expect(toWinAnsi("Café Ørsted, 5 × 3 = 15 · “Quote” – €10 … ™\nnext")).toBe(
      "Café Ørsted, 5 × 3 = 15 · “Quote” – €10 … ™\nnext",
    );
  });

  it("composes accents, and writes what the standard fonts cannot as ?", () => {
    expect(toWinAnsi("Café")).toBe("Café");
    expect(toWinAnsi("Иван 王 😀 👍🏽 ok")).toBe("???? ? ? ? ok");
    expect(toWinAnsi("a\tb\r\nc\u0007d​e")).toBe("a    b\ncde");
  });
});

describe("salesDocumentFilename", () => {
  it("names the file after the document", () => {
    expect(salesDocumentFilename({ number: "Q-0001" })).toBe("Q-0001.pdf");
    expect(salesDocumentFilename({ number: "INV-0012" })).toBe("INV-0012.pdf");
    expect(salesDocumentFilename({ number: 'Q-1"; x' })).toBe("Q-1x.pdf");
  });
});

describe("renderSalesDocumentPdf", () => {
  it("draws a quote on one A4 page, in the order of the print view", async () => {
    const pdf = await render(QUOTE);
    const text = pdfText(pdf);

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf.toString("latin1")).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(pdfPageCount(pdf)).toBe(1);
    const expected = [
      "Quote",
      "Q-0007",
      "Issue date",
      "Nov 1, 2026",
      "Valid until",
      "Dec 1, 2026",
      "FROM",
      "PREPARED FOR",
      "Acme Fleet Solutions",
      "Northwind Logistics",
      "12 Market Street",
      "Elena Rostova",
      "Tax ID: GB123456789",
      "Regarding",
      "Fleet tracking rollout",
      "Ravi Rep (ravi@example.com)",
      "DESCRIPTION",
      "Fleet tracking licence",
      "Onboarding package",
      "Subtotal",
      "$2,061.00",
      "Discount (10%)",
      "-$206.10",
      "Tax 8.25% on $234.90",
      "$19.38",
      "Tax 20% on $1,620.00",
      "$324.00",
      "Total (USD)",
      "$2,198.28",
      "NOTES",
      "Thank you for your business.",
      "TERMS",
      "Payment within 30 days.",
      "Quote Q-0007",
      "Page 1 of 1",
    ];
    let position = -1;
    for (const part of expected) {
      const found = text.indexOf(part, position + 1);
      expect(found, part).toBeGreaterThan(position);
      position = found;
    }
    // The line's own numbers, written as the web writes them.
    expect(text).toContain("$1,234.50");
    expect(text).toContain("$11,110.50");
    expect(text).toContain("1.5");
    // A draft carries no status.
    expect(text).not.toContain("Status");
  });

  it("prints a status other than draft and sent", async () => {
    expect(pdfText(await render({ ...QUOTE, status: "SENT" }))).not.toContain("Status");
    expect(pdfText(await render({ ...QUOTE, status: "ACCEPTED" }))).toContain("Status: Accepted");
    expect(pdfText(await render({ ...QUOTE, status: "EXPIRED" }))).toContain("Status: Expired");
    expect(pdfText(await render({ ...INVOICE, status: "VOID" }))).toContain("Status: Void");
  });

  it("draws an invoice with its due date, payment terms and quote", async () => {
    const text = pdfText(await render(INVOICE));

    for (const part of [
      "Invoice",
      "INV-0003",
      "Due date",
      "Payment terms",
      "30 days",
      "Q-0007",
      "BILL TO",
      "Invoice INV-0003",
    ]) {
      expect(text, part).toContain(part);
    }
    // An invoice keeps the discount total only.
    expect(text).toContain("Discount\n");
    expect(text).not.toContain("Valid until");
    expect(pdfText(await render({ ...INVOICE, paymentTermsDays: 0 }))).toContain("Due on receipt");
  });

  it("writes a single Tax row, a dash for an empty party and nothing for empty notes", async () => {
    const text = pdfText(
      await render({
        ...QUOTE,
        buyer: { contactName: null, contactEmail: null, companyName: null, companyAddress: null },
        lines: [],
        subtotal: 0,
        discountTotal: 0,
        taxes: [],
        taxTotal: 0,
        total: 0,
        notes: null,
        terms: "  ",
      }),
    );

    expect(text).toContain("No line items.");
    expect(text).toContain("Tax\n$0.00");
    expect(text).not.toContain("Discount");
    expect(text).not.toContain("NOTES");
    expect(text).not.toContain("TERMS");
  });

  it("goes onto more pages for 100 lines, repeating the table header, and loses no line", async () => {
    const lines = Array.from({ length: 100 }, (_, index) =>
      line(
        index + 1,
        index % 10 === 0
          ? `Item ${String(index + 1)} ${"with a long description that wraps ".repeat(8)}`
          : `Item ${String(index + 1)}`,
      ),
    );
    const one = await render({ ...QUOTE, lines: lines.slice(0, 10) });
    const pdf = await render({ ...QUOTE, lines });
    const text = pdfText(pdf);
    const pages = pdfPageCount(pdf);

    expect(pdfPageCount(one)).toBe(1);
    expect(pages).toBeGreaterThanOrEqual(4);
    // On every page with lines; the totals may start a page of their own.
    expect(text.match(/^DESCRIPTION$/gm)?.length).toBeGreaterThanOrEqual(pages - 1);
    for (let page = 1; page <= pages; page += 1) {
      expect(text).toContain(`Page ${String(page)} of ${String(pages)}`);
    }
    // Every line once, in order.
    const items = [...text.matchAll(/^Item (\d+)/gm)].map((match) => Number(match[1]));
    expect(items).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
  });

  it("splits only a line taller than a page, and long notes, across pages", async () => {
    const tall = Array.from({ length: 90 }, (_, index) => `part ${String(index + 1)}`).join("\n");
    const pdf = await render({
      ...QUOTE,
      lines: [line(1, "First"), line(2, tall), line(3, "Last")],
      notes: "A long note. ".repeat(600),
    });
    const text = pdfText(pdf);

    expect(pdfPageCount(pdf)).toBeGreaterThanOrEqual(3);
    const parts = [...text.matchAll(/^part (\d+)$/gm)].map((match) => Number(match[1]));
    expect(parts).toEqual(Array.from({ length: 90 }, (_, index) => index + 1));
    expect(text.indexOf("Last")).toBeGreaterThan(text.indexOf("part 90"));
  });

  it("does not fail on characters outside WinAnsi", async () => {
    const pdf = await render({
      ...QUOTE,
      buyer: { ...QUOTE.buyer, contactName: "Иван Петров 😀", companyName: "北京公司" },
      lines: [line(1, "Café ✓ 👍🏽")],
    });
    const text = pdfText(pdf);

    expect(text).toContain("???? ??????");
    expect(text).toContain("????");
    expect(text).toContain("Café ? ?");
  });

  it("compresses its content by default", async () => {
    const compressed = await renderSalesDocumentPdf(QUOTE);

    expect(compressed.toString("latin1")).toContain("/FlateDecode");
    expect(pdfText(compressed)).toContain("Total (USD)");
  });
});
