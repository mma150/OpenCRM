import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invoiceDocument, quoteDocument } from "@/features/invoices/invoices.fixtures";
import type { ApiError } from "@/lib/api/http";
import type { SalesDocument } from "@/lib/sales-document";

import { PrintDocument, PrintDocumentPage } from "./print-document";

// The block under a heading such as "From" or "Bill to".
function block(title: string) {
  const section = screen.getByRole("heading", { name: title }).closest("section");
  if (!section) {
    throw new Error(`No block titled ${title}`);
  }
  return within(section);
}

// The value beside a name in the document's facts and totals.
const valueOf = (name: string) => screen.getByText(name, { selector: "dt" }).nextSibling;

describe("PrintDocument", () => {
  it("draws an invoice: who it is from and for, its dates and the payment terms", () => {
    render(<PrintDocument document={invoiceDocument} />);

    const sheet = within(screen.getByRole("article", { name: "Invoice INV-0003" }));
    expect(sheet.getByText("Invoice")).toBeInTheDocument();
    expect(sheet.getByText("INV-0003")).toBeInTheDocument();
    expect(sheet.getByText("Status: Sent")).toBeInTheDocument();
    expect(valueOf("Issue date")).toHaveTextContent("Oct 5, 2026");
    expect(valueOf("Due date")).toHaveTextContent("Nov 4, 2026");
    expect(valueOf("Payment terms")).toHaveTextContent("30 days");
    expect(valueOf("Quote")).toHaveTextContent("Q-0003");
    expect(screen.queryByText("Valid until")).not.toBeInTheDocument();

    const seller = block("From");
    expect(seller.getByText("Northwind Fleet Solutions, Inc.")).toBeInTheDocument();
    expect(seller.getByText(/4200 Commerce Park Drive\s+Austin, TX 78744/)).toBeInTheDocument();
    expect(seller.getByText("sales@northwindfleet.example")).toBeInTheDocument();
    expect(seller.getByText("+1 (512) 555-0148")).toBeInTheDocument();
    expect(seller.getByText("Tax ID: EIN 74-1234567")).toBeInTheDocument();

    const buyer = block("Bill to");
    expect(buyer.getByText("Northwind Logistics")).toBeInTheDocument();
    expect(buyer.getByText("Marcus Chen")).toBeInTheDocument();
    expect(buyer.getByText(/12 Harbour Road\s+Rotterdam/)).toBeInTheDocument();
    expect(buyer.getByText("m.chen@northwind.example")).toBeInTheDocument();

    expect(sheet.getByText(/Regarding:/).parentElement).toHaveTextContent(
      "Regarding: Fleet Expansion · Prepared by Ada Admin (ada@example.com)",
    );
  });

  it("draws the lines as a table, and as stacked blocks for a phone", () => {
    render(<PrintDocument document={invoiceDocument} />);

    const table = within(screen.getByRole("table", { name: "Line items" }));
    expect(table.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Description",
      "Qty",
      "Unit price",
      "Disc.",
      "Tax",
      "Amount",
    ]);
    const rows = table.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Fleet tracking licence120$29.0010%8.25%$3,132.00",
      "On-site installation day2.5$850.00—0%$2,125.00",
      "Premium support plan1$2,400.00—20%$2,400.00",
    ]);

    const cards = within(screen.getByRole("list", { name: "Line items" })).getAllByRole("listitem");
    expect(cards.map((card) => card.textContent)).toEqual([
      "Fleet tracking licence120 × $29.00 · 10% discount · 8.25% tax$3,132.00",
      "On-site installation day2.5 × $850.00 · 0% tax$2,125.00",
      "Premium support plan1 × $2,400.00 · 20% tax$2,400.00",
    ]);
  });

  it("is a table on paper and from `sm`, and blocks only on a phone screen", () => {
    render(<PrintDocument document={invoiceDocument} />);

    const table = screen.getByRole("table", { name: "Line items" });
    expect(table).toHaveClass("hidden", "sm:table", "print:table");
    expect(screen.getByRole("list", { name: "Line items" })).toHaveClass(
      "sm:hidden",
      "print:hidden",
    );
    // The sheet loses its border and padding on paper.
    expect(screen.getByRole("article")).toHaveClass("print:border-0", "print:p-0");
  });

  it("breaks the tax down by rate and shows the totals, the notes and the terms", () => {
    render(<PrintDocument document={invoiceDocument} />);

    const taxes = block("Tax breakdown");
    expect(
      taxes
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(["8.25%$3,029.74$249.95", "20%$2,321.64$464.33"]);

    expect(valueOf("Subtotal")).toHaveTextContent("$7,657.00");
    // An invoice keeps only the amount of the discount.
    expect(valueOf("Discount")).toHaveTextContent("−$250.00");
    expect(valueOf("Tax")).toHaveTextContent("$714.28");
    expect(valueOf("Total (USD)")).toHaveTextContent("$8,121.28");
    expect(block("Notes").getByText("Please quote PO 4417.")).toBeInTheDocument();
    expect(block("Terms").getByText("Payment is due within 30 days.")).toBeInTheDocument();
  });

  it("draws a quote: prepared for, valid until, the discount with its percentage, no payment terms", () => {
    render(<PrintDocument document={quoteDocument} />);

    const sheet = within(screen.getByRole("article", { name: "Quote Q-0003" }));
    expect(sheet.getByText("Quote")).toBeInTheDocument();
    expect(sheet.getByText("Status: Accepted")).toBeInTheDocument();
    expect(valueOf("Valid until")).toHaveTextContent("Nov 4, 2026");
    expect(screen.queryByText("Due date")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment terms")).not.toBeInTheDocument();
    expect(screen.queryByText("Quote", { selector: "dt" })).not.toBeInTheDocument();
    expect(block("Prepared for").getByText("Northwind Logistics")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bill to" })).not.toBeInTheDocument();
    expect(valueOf("Discount (10%)")).toHaveTextContent("−$765.70");
  });

  it('says "Due on receipt" for payment terms of no days', () => {
    render(<PrintDocument document={{ ...invoiceDocument, paymentTermsDays: 0 }} />);

    expect(valueOf("Payment terms")).toHaveTextContent("Due on receipt");
  });

  it("leaves out what a document does not have", () => {
    const bare: SalesDocument = {
      ...invoiceDocument,
      seller: { name: "", address: null, email: null, phone: null, taxId: null },
      buyer: {
        contactName: "Marcus Chen",
        contactEmail: null,
        companyName: null,
        companyAddress: null,
      },
      lines: [],
      taxes: [],
      discountTotal: 0,
      notes: null,
      terms: null,
    };
    render(<PrintDocument document={bare} />);

    // A seller nobody filled in yet is a dash, not an empty block.
    expect(block("From").getByText("—")).toBeInTheDocument();
    // Without a company the contact is the first line of the buyer.
    expect(block("Bill to").getByText("Marcus Chen")).toHaveClass("font-semibold");
    expect(screen.getByText("No line items.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Line items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tax breakdown" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Discount/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Notes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Terms" })).not.toBeInTheDocument();
  });
});

describe("PrintDocumentPage", () => {
  const print = vi.fn();
  const originalPrint = window.print.bind(window);

  beforeEach(() => {
    print.mockReset();
    window.print = print;
  });

  afterEach(() => {
    window.print = originalPrint;
  });

  function renderPage(load: (id: string) => Promise<SalesDocument>) {
    const user = userEvent.setup();
    render(
      <PrintDocumentPage
        id="invoice-1"
        load={load}
        backHref="/invoices/invoice-1"
        backLabel="Back to invoice"
      />,
    );
    return { user };
  }

  it("loads the document by id and prints it with the browser's own dialog", async () => {
    const load = vi.fn().mockResolvedValue(invoiceDocument);
    const { user } = renderPage(load);

    expect(screen.getByText("Loading document...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeDisabled();

    expect(await screen.findByRole("article", { name: "Invoice INV-0003" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("invoice-1");
    expect(load).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Print / Save as PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("keeps the bar with Back and Print, and the hint, off the paper", async () => {
    renderPage(vi.fn().mockResolvedValue(invoiceDocument));
    await screen.findByRole("article");

    const back = screen.getByRole("link", { name: "Back to invoice" });
    expect(back).toHaveAttribute("href", "/invoices/invoice-1");
    const bar = back.parentElement;
    expect(bar).toHaveClass("print:hidden");
    expect(bar).toContainElement(screen.getByRole("button", { name: "Print / Save as PDF" }));
    expect(screen.getByText(/choose "Save as PDF" as the printer/)).toHaveClass("print:hidden");
    // Nothing of the bar is inside the sheet.
    expect(screen.getByRole("article")).not.toContainElement(back);
  });

  it("is white paper with dark ink in both themes", async () => {
    renderPage(vi.fn().mockResolvedValue(invoiceDocument));

    const sheet = await screen.findByRole("article");
    // `.paper` gives everything inside it the light theme's tokens (globals.css).
    expect(sheet.closest(".paper")).not.toBeNull();
    expect(sheet).toHaveClass("bg-background", "text-foreground");
  });

  it("says not found for a document that does not exist or is out of reach", async () => {
    const notFound: ApiError = { code: "NOT_FOUND", message: "x", details: null };
    renderPage(vi.fn().mockRejectedValue(notFound));

    expect(await screen.findByText("Document not found")).toBeInTheDocument();
    expect(
      screen.getByText("It does not exist, or you do not have access to it."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Back to invoice" })).toBeInTheDocument();
  });

  it("shows any other failure with Retry, which asks again", async () => {
    const unavailable: ApiError = {
      code: "SERVICE_UNAVAILABLE",
      message: "Down",
      details: null,
      requestId: "req-42",
    };
    const load = vi.fn().mockRejectedValueOnce(unavailable).mockResolvedValue(quoteDocument);
    const { user } = renderPage(load);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "The service is temporarily unavailable. Try again in a moment.",
    );
    expect(alert).toHaveTextContent("Request id: req-42");
    expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeDisabled();

    await user.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("article", { name: "Quote Q-0003" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeEnabled();
  });
});
