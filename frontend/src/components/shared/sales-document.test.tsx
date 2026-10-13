import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { sent } from "@/features/invoices/invoices.fixtures";

import { discountLabel, DocumentLines, DocumentTotals } from "./sales-document";

const rowsOfTotals = () =>
  screen
    .getAllByRole("term")
    .map((term) => `${term.textContent}: ${term.nextSibling?.textContent ?? ""}`);

describe("DocumentLines", () => {
  it("draws the lines as a table from `md`: description, quantity, price, discount, tax, total", () => {
    render(<DocumentLines lines={sent.lines} />);

    const table = screen.getByRole("table", { name: "Line items" });
    expect(table).toHaveClass("hidden", "md:table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Description", "Qty", "Unit price", "Disc.", "Tax", "Line total"]);
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      "Fleet tracking licence120$29.0010%8.25%$3,132.00",
      // No discount is a dash; a tax rate of 0 is still written.
      "On-site installation day2.5$850.00—0%$2,125.00",
    ]);
  });

  it("draws the same lines as stacked cards for a phone", () => {
    render(<DocumentLines lines={sent.lines} />);

    const list = screen.getByRole("list", { name: "Line items" });
    expect(list).toHaveClass("md:hidden");
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Fleet tracking licence120 × $29.00 · 10% discount · 8.25% tax$3,132.00",
      "On-site installation day2.5 × $850.00 · 0% tax$2,125.00",
    ]);
  });

  it("lets a long description wrap and keeps its line breaks, in both layouts", () => {
    const description = `${"Supercalifragilistic".repeat(8)}\nSecond line`;
    const [first] = sent.lines;
    render(<DocumentLines lines={first ? [{ ...first, description }] : []} />);

    const shown = screen.getAllByText((_text, element) => element?.textContent === description);
    expect(shown).toHaveLength(2);
    for (const element of shown) {
      expect(element).toHaveClass("wrap-anywhere", "whitespace-pre-wrap");
    }
    // A fixed table cannot be pushed wider than its card by one long word.
    expect(screen.getByRole("table")).toHaveClass("table-fixed", "w-full");
  });

  it("says so when there are no lines, in the caller's words when given", () => {
    const { rerender } = render(<DocumentLines lines={[]} />);
    expect(screen.getByText("No line items.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    rerender(<DocumentLines lines={[]} empty="Add a line to start the quote." />);
    expect(screen.getByText("Add a line to start the quote.")).toBeInTheDocument();
  });
});

describe("DocumentTotals", () => {
  it("shows subtotal, tax and total, and no discount row without a discount", () => {
    render(<DocumentTotals subtotal={5257} discountTotal={0} taxTotal={258.39} total={5515.39} />);

    expect(rowsOfTotals()).toEqual(["Subtotal: $5,257.00", "Tax: $258.39", "Total: $5,515.39"]);
  });

  it("shows the discount as an amount taken off, under the label it is given", () => {
    const { rerender } = render(
      <DocumentTotals subtotal={5257} discountTotal={250} taxTotal={246.1} total={5253.1} />,
    );
    expect(rowsOfTotals()).toEqual([
      "Subtotal: $5,257.00",
      "Discount: −$250.00",
      "Tax: $246.10",
      "Total: $5,253.10",
    ]);

    rerender(
      <DocumentTotals
        subtotal={5257}
        discountTotal={525.7}
        discountLabel={discountLabel("PERCENT", 10)}
        taxTotal={232.59}
        total={4963.89}
      />,
    );
    expect(rowsOfTotals()[1]).toBe("Discount (10%): −$525.70");
  });

  it("shows one tax row per rate when the rates are given, instead of the one Tax row", () => {
    render(
      <DocumentTotals
        subtotal={7657}
        discountTotal={0}
        taxes={[
          { rate: 8.25, taxableAmount: 3132, taxAmount: 258.39 },
          { rate: 20, taxableAmount: 2400, taxAmount: 480 },
        ]}
        taxTotal={738.39}
        total={8395.39}
      />,
    );

    expect(rowsOfTotals()).toEqual([
      "Subtotal: $7,657.00",
      "Tax 8.25% on $3,132.00: $258.39",
      "Tax 20% on $2,400.00: $480.00",
      "Total: $8,395.39",
    ]);
  });

  it("falls back to the one Tax row when no rate is above zero, and shows a note under the box", () => {
    render(
      <DocumentTotals
        subtotal={100}
        discountTotal={0}
        taxes={[]}
        taxTotal={0}
        total={100}
        note="Estimate: saved totals come from the server."
      />,
    );

    expect(rowsOfTotals()).toEqual(["Subtotal: $100.00", "Tax: $0.00", "Total: $100.00"]);
    expect(screen.getByText("Estimate: saved totals come from the server.")).toBeInTheDocument();
  });
});

describe("discountLabel", () => {
  it("names the percentage, and nothing more for an amount or no discount", () => {
    expect(discountLabel("PERCENT", 10)).toBe("Discount (10%)");
    expect(discountLabel("PERCENT", 12.5)).toBe("Discount (12.5%)");
    expect(discountLabel("AMOUNT", 250)).toBe("Discount");
    expect(discountLabel("NONE", 0)).toBe("Discount");
    expect(discountLabel(null, null)).toBe("Discount");
    expect(discountLabel("PERCENT", null)).toBe("Discount");
  });
});
