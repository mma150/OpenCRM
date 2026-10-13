import type { QuoteDiscountType } from "./quotes.types";

// The totals of a quote, counted in the browser for the LIVE preview in the editor only.
// A saved quote always shows the API's own numbers. This reproduces the API's rule
// (backend/src/lib/sales-documents.ts) exactly, rounding half up to cents at the same points:
//
//   1. line total     = quantity x unit price x (1 - line discount %), rounded
//   2. subtotal       = the sum of the line totals
//   3. discount total = NONE: 0; PERCENT: subtotal x discount %, rounded;
//                       AMOUNT: the amount, but never more than the subtotal
//   4. tax            = per tax rate: (the line totals at that rate, less their share of the
//                       discount) x rate, rounded once per rate. The discount is shared out
//                       in proportion to the line totals.
//   5. total          = subtotal - discount total + tax total
//
// JavaScript numbers cannot hold half a cent exactly (1.005 is 1.00499...), so everything is
// counted in whole numbers (BigInt): a quantity in thousandths, money in cents, a
// percentage in hundredths of a percent.

type Amount = number | string;

export type TotalsLine = {
  // Up to three decimals.
  quantity: Amount;
  // Up to two decimals.
  unitPrice: Amount;
  // Percentages, 0 to 100, up to two decimals.
  discountPercent: Amount;
  taxRate: Amount;
};

export type QuoteTotals = {
  // One per line, in the order given.
  lineTotals: number[];
  subtotal: number;
  discountTotal: number;
  // One per tax rate above 0 that a line uses, lowest rate first.
  taxes: { rate: number; taxableAmount: number; taxAmount: number }[];
  taxTotal: number;
  total: number;
};

const HUNDRED_PERCENT = 10_000n;

// "12.5" with scale 3 -> 12500n. The editor hands over what is in a text box, so anything
// that is not a plain number yet ("", "1.", "abc") counts as 0, and digits past the scale
// are dropped: the form itself refuses those before anything is saved.
function toScaled(value: Amount, scale: number): bigint {
  const text = typeof value === "number" ? value.toFixed(scale) : value.trim();
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) {
    return 0n;
  }
  const [, whole = "0", decimals = ""] = match;
  return BigInt(whole + decimals.slice(0, scale).padEnd(scale, "0"));
}

// A division of two whole numbers that are not negative, rounded half up.
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

// Cents back to a number of dollars, through text so that no digit is lost on the way.
function toMoney(cents: bigint): number {
  const text = cents.toString().padStart(3, "0");
  return Number(`${text.slice(0, -2)}.${text.slice(-2)}`);
}

function percentOf(value: Amount): bigint {
  const percent = toScaled(value, 2);
  return percent > HUNDRED_PERCENT ? HUNDRED_PERCENT : percent;
}

export function computeTotals(
  lines: TotalsLine[],
  discountType: QuoteDiscountType,
  discountValue: Amount,
): QuoteTotals {
  // 1. quantity (thousandths) x price (cents) x what is left after the discount (of 10,000).
  const lineCents = lines.map((line) =>
    divideRounded(
      toScaled(line.quantity, 3) *
        toScaled(line.unitPrice, 2) *
        (HUNDRED_PERCENT - percentOf(line.discountPercent)),
      1000n * HUNDRED_PERCENT,
    ),
  );
  // 2.
  const subtotal = lineCents.reduce((sum, cents) => sum + cents, 0n);
  // 3.
  let discountTotal = 0n;
  if (discountType === "PERCENT") {
    discountTotal = divideRounded(subtotal * percentOf(discountValue), HUNDRED_PERCENT);
  } else if (discountType === "AMOUNT") {
    const amount = toScaled(discountValue, 2);
    discountTotal = amount > subtotal ? subtotal : amount;
  }
  const afterDiscount = subtotal - discountTotal;

  // 4. The line totals per tax rate. "8.5" and "8.50" are one rate.
  const atRate = new Map<bigint, bigint>();
  for (const [index, line] of lines.entries()) {
    const rate = percentOf(line.taxRate);
    atRate.set(rate, (atRate.get(rate) ?? 0n) + (lineCents[index] ?? 0n));
  }
  const taxes = [...atRate.entries()]
    .filter(([rate]) => rate > 0n)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([rate, amount]) => {
      // The amount less its share of the discount is amount x afterDiscount / subtotal. It
      // is kept as a fraction until it is rounded, so a share such as two thirds stays exact.
      const share = subtotal === 0n ? 0n : amount * afterDiscount;
      const whole = subtotal === 0n ? 1n : subtotal;
      return {
        rate,
        taxableAmount: divideRounded(share, whole),
        taxAmount: divideRounded(share * rate, whole * HUNDRED_PERCENT),
      };
    });
  const taxTotal = taxes.reduce((sum, tax) => sum + tax.taxAmount, 0n);

  return {
    lineTotals: lineCents.map((cents) => toMoney(cents)),
    subtotal: toMoney(subtotal),
    discountTotal: toMoney(discountTotal),
    taxes: taxes.map((tax) => ({
      rate: toMoney(tax.rate),
      taxableAmount: toMoney(tax.taxableAmount),
      taxAmount: toMoney(tax.taxAmount),
    })),
    taxTotal: toMoney(taxTotal),
    // 5.
    total: toMoney(afterDiscount + taxTotal),
  };
}
