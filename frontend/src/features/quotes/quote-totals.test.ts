import { describe, expect, it } from "vitest";

import { computeTotals } from "./quote-totals";
import type { QuoteDiscountType } from "./quotes.types";

// The same tables as the API's own (backend/src/lib/sales-documents.test.ts): the live
// preview in the editor must count exactly as the server does.

// [quantity, unit price, line discount %, tax rate %]
type Line = [number | string, number | string, number | string, number | string];

function toLines(lines: Line[]) {
  return lines.map(([quantity, unitPrice, discountPercent, taxRate]) => ({
    quantity,
    unitPrice,
    discountPercent,
    taxRate,
  }));
}

describe("a line total", () => {
  it.each<[string, Line, string]>([
    ["a whole quantity", [2, "29.00", 0, 0], "58.00"],
    ["a quantity with three decimals", ["0.333", "10.00", 0, 0], "3.33"],
    // 1.005 is the classic: binary floating point holds it as 1.00499..., which rounds down.
    ["half a cent, which rounds up", ["1.005", "1.00", 0, 0], "1.01"],
    ["half a cent given as a number", [1.005, 1, 0, 0], "1.01"],
    ["half a cent from a fraction", ["1.5", "0.33", 0, 0], "0.50"],
    ["just under half a cent, which rounds down", ["0.994", "1.00", 0, 0], "0.99"],
    ["a line discount", [10, "19.99", 12.5, 0], "174.91"],
    ["a line discount that lands on a whole cent", [1, "0.10", 50, 0], "0.05"],
    ["a line discount that lands on half a cent", [3, "0.01", 50, 0], "0.02"],
    ["a line discount of 100 percent", [5, "80.00", 100, 0], "0.00"],
    ["a price of zero", [7, "0", 10, 20], "0.00"],
    ["the tax rate, which is not part of a line total", [1, "100.00", 0, 25], "100.00"],
    [
      "the largest line a request can describe",
      ["9999999.999", "9999999999.99", 0, 0],
      "99999999989900000.00",
    ],
    // What a text box holds while it is being typed in.
    ["an empty quantity", ["", "10.00", 0, 0], "0.00"],
    ["a price that is not a number yet", [1, "abc", 0, 0], "0.00"],
    ["a quantity that ends in a point", ["2.", "10.00", "", ""], "20.00"],
  ])("counts %s", (_name, line, expected) => {
    const totals = computeTotals(toLines([line]), "NONE", 0);

    expect(totals.lineTotals.map((amount) => amount.toFixed(2))).toEqual([expected]);
  });
});

interface Case {
  name: string;
  lines: Line[];
  discount: [QuoteDiscountType, number | string];
  subtotal: string;
  discountTotal: string;
  // [rate, taxable amount, tax]
  taxes: [string, string, string][];
  taxTotal: string;
  total: string;
}

const CASES: Case[] = [
  {
    name: "no lines at all",
    lines: [],
    discount: ["NONE", 0],
    subtotal: "0.00",
    discountTotal: "0.00",
    taxes: [],
    taxTotal: "0.00",
    total: "0.00",
  },
  {
    name: "one taxed line, tax rounded up from 4.785",
    lines: [[2, "29.00", 0, 8.25]],
    discount: ["NONE", 0],
    subtotal: "58.00",
    discountTotal: "0.00",
    taxes: [["8.25", "58.00", "4.79"]],
    taxTotal: "4.79",
    total: "62.79",
  },
  {
    name: "a discount value is ignored when the type is NONE",
    lines: [[1, "100.00", 0, 0]],
    discount: ["NONE", 50],
    subtotal: "100.00",
    discountTotal: "0.00",
    taxes: [],
    taxTotal: "0.00",
    total: "100.00",
  },
  {
    name: "a percentage discount shared over two tax rates",
    lines: [
      [1, "100.00", 0, 10],
      [1, "50.00", 0, 20],
    ],
    discount: ["PERCENT", 10],
    subtotal: "150.00",
    discountTotal: "15.00",
    taxes: [
      ["10.00", "90.00", "9.00"],
      ["20.00", "45.00", "9.00"],
    ],
    taxTotal: "18.00",
    total: "153.00",
  },
  {
    name: "a percentage discount rounded up from 4.9995",
    lines: [[1, "33.33", 0, 0]],
    discount: ["PERCENT", 15],
    subtotal: "33.33",
    discountTotal: "5.00",
    taxes: [],
    taxTotal: "0.00",
    total: "28.33",
  },
  {
    name: "a percentage discount of 100",
    lines: [[3, "40.00", 0, 20]],
    discount: ["PERCENT", 100],
    subtotal: "120.00",
    discountTotal: "120.00",
    taxes: [["20.00", "0.00", "0.00"]],
    taxTotal: "0.00",
    total: "0.00",
  },
  {
    name: "an amount discount, taxed and untaxed lines",
    lines: [
      [1, "100.00", 0, 10],
      [1, "50.00", 0, 0],
    ],
    discount: ["AMOUNT", 30],
    subtotal: "150.00",
    discountTotal: "30.00",
    taxes: [["10.00", "80.00", "8.00"]],
    taxTotal: "8.00",
    total: "128.00",
  },
  {
    name: "an amount discount larger than the subtotal, which stops at the subtotal",
    lines: [[1, "40.00", 0, 10]],
    discount: ["AMOUNT", 100],
    subtotal: "40.00",
    discountTotal: "40.00",
    taxes: [["10.00", "0.00", "0.00"]],
    taxTotal: "0.00",
    total: "0.00",
  },
  {
    name: "a discount share that does not divide evenly (20 of 30 is two thirds)",
    lines: [
      [1, "10.00", 0, 7],
      [1, "20.00", 0, 7],
    ],
    discount: ["AMOUNT", 10],
    subtotal: "30.00",
    discountTotal: "10.00",
    taxes: [["7.00", "20.00", "1.40"]],
    taxTotal: "1.40",
    total: "21.40",
  },
  {
    name: "a discount share with a repeating decimal (one third of 10.00 at each rate)",
    lines: [
      [1, "10.00", 0, 10],
      [1, "10.00", 0, 20],
      [1, "10.00", 0, 0],
    ],
    discount: ["AMOUNT", 10],
    subtotal: "30.00",
    discountTotal: "10.00",
    // 6.666... at each rate: 0.666... and 1.333... of tax.
    taxes: [
      ["10.00", "6.67", "0.67"],
      ["20.00", "6.67", "1.33"],
    ],
    taxTotal: "2.00",
    total: "22.00",
  },
  {
    name: "tax rounded once per rate, not once per line",
    lines: [
      [1, "0.10", 0, 5],
      [1, "0.10", 0, 5],
      [1, "0.10", 0, 5],
    ],
    discount: ["NONE", 0],
    subtotal: "0.30",
    discountTotal: "0.00",
    // 0.015 for the three together; each line alone would round to 0.01.
    taxes: [["5.00", "0.30", "0.02"]],
    taxTotal: "0.02",
    total: "0.32",
  },
  {
    name: "line discounts, a quote discount and two rates together",
    lines: [
      [108, "29.00", 0, 8.25],
      [114, "149.00", 0, 8.25],
      [1, "1200.00", 0, 0],
      ["2.5", "180.00", 10, 8.25],
    ],
    discount: ["PERCENT", 5],
    // 3132.00 + 16986.00 + 1200.00 + 405.00
    subtotal: "21723.00",
    discountTotal: "1086.15",
    // (21723 - 1200) x 0.95 = 19496.85; x 8.25% = 1608.490125
    taxes: [["8.25", "19496.85", "1608.49"]],
    taxTotal: "1608.49",
    total: "22245.34",
  },
  {
    name: "the same rate written as 8.5 and as 8.50, which is one rate",
    lines: [
      [1, "10.00", 0, 8.5],
      [1, "10.00", 0, "8.50"],
    ],
    discount: ["NONE", 0],
    subtotal: "20.00",
    discountTotal: "0.00",
    taxes: [["8.50", "20.00", "1.70"]],
    taxTotal: "1.70",
    total: "21.70",
  },
  {
    name: "rates out of order, which are listed lowest first",
    lines: [
      [1, "100.00", 0, 20],
      [1, "100.00", 0, "5.5"],
    ],
    discount: ["NONE", 0],
    subtotal: "200.00",
    discountTotal: "0.00",
    taxes: [
      ["5.50", "100.00", "5.50"],
      ["20.00", "100.00", "20.00"],
    ],
    taxTotal: "25.50",
    total: "225.50",
  },
  {
    name: "amounts far beyond what floating point holds exactly",
    lines: [[1, "99999999999.99", 0, 100]],
    discount: ["PERCENT", 0.01],
    subtotal: "99999999999.99",
    // 9999999.999999 rounds up.
    discountTotal: "10000000.00",
    taxes: [["100.00", "99989999999.99", "99989999999.99"]],
    taxTotal: "99989999999.99",
    total: "199979999999.98",
  },
];

// Whole cents, so the checks below add up without a rounding tail of their own.
const cents = (amount: number) => Math.round(amount * 100);
const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + cents(amount), 0);

describe("computeTotals", () => {
  it.each(CASES)("counts $name", (example) => {
    const totals = computeTotals(toLines(example.lines), ...example.discount);

    expect(totals.subtotal.toFixed(2)).toBe(example.subtotal);
    expect(totals.discountTotal.toFixed(2)).toBe(example.discountTotal);
    expect(
      totals.taxes.map((tax) => [
        tax.rate.toFixed(2),
        tax.taxableAmount.toFixed(2),
        tax.taxAmount.toFixed(2),
      ]),
    ).toEqual(example.taxes);
    expect(totals.taxTotal.toFixed(2)).toBe(example.taxTotal);
    expect(totals.total.toFixed(2)).toBe(example.total);
  });

  it.each(CASES)("keeps the parts of $name adding up", (example) => {
    const totals = computeTotals(toLines(example.lines), ...example.discount);

    expect(totals.lineTotals).toHaveLength(example.lines.length);
    expect(sum(totals.lineTotals)).toBe(cents(totals.subtotal));
    expect(sum(totals.taxes.map((tax) => tax.taxAmount))).toBe(cents(totals.taxTotal));
    expect(cents(totals.subtotal) - cents(totals.discountTotal) + cents(totals.taxTotal)).toBe(
      cents(totals.total),
    );
    expect(totals.discountTotal).toBeLessThanOrEqual(totals.subtotal);
  });

  it("counts what the editor's text boxes hold, as text", () => {
    const totals = computeTotals(
      [{ quantity: "2.5", unitPrice: "180", discountPercent: "10", taxRate: "8.25" }],
      "AMOUNT",
      "5.00",
    );

    expect(totals).toEqual({
      lineTotals: [405],
      subtotal: 405,
      discountTotal: 5,
      taxes: [{ rate: 8.25, taxableAmount: 400, taxAmount: 33 }],
      taxTotal: 33,
      total: 433,
    });
  });
});
