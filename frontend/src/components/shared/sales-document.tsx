import type { ReactNode } from "react";

import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { DocumentLine } from "@/lib/sales-document";
import { cn } from "@/lib/utils";

// The parts of a quote and an invoice that look the same on both pages: the lines and the
// totals box. The numbers are always the API's; nothing is added up here.

// The lines of a quote or an invoice: a table from `md`, one stacked card per line below,
// so a phone never scrolls sideways. A long description wraps.
export function DocumentLines({ lines, empty }: { lines: DocumentLine[]; empty?: string }) {
  if (lines.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty ?? "No line items."}</p>;
  }

  return (
    <>
      <table className="hidden w-full table-fixed text-sm md:table">
        <caption className="sr-only">Line items</caption>
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs font-medium tracking-wide uppercase">
            <th scope="col" className="py-2 pr-3 font-medium">
              Description
            </th>
            <th scope="col" className="w-16 px-2 py-2 text-right font-medium">
              Qty
            </th>
            <th scope="col" className="w-28 px-2 py-2 text-right font-medium">
              Unit price
            </th>
            <th scope="col" className="w-16 px-2 py-2 text-right font-medium">
              Disc.
            </th>
            <th scope="col" className="w-16 px-2 py-2 text-right font-medium">
              Tax
            </th>
            <th scope="col" className="w-32 py-2 pl-2 text-right font-medium">
              Line total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lines.map((line) => (
            <tr key={line.id} className="align-top">
              <td className="py-3 pr-3 wrap-anywhere whitespace-pre-wrap">{line.description}</td>
              <td className="px-2 py-3 text-right tabular-nums">{formatNumber(line.quantity)}</td>
              <td className="px-2 py-3 text-right tabular-nums">{formatMoney(line.unitPrice)}</td>
              <td className="px-2 py-3 text-right tabular-nums">
                {line.discountPercent > 0 ? formatPercent(line.discountPercent) : "—"}
              </td>
              <td className="px-2 py-3 text-right tabular-nums">{formatPercent(line.taxRate)}</td>
              <td className="py-3 pl-2 text-right font-medium tabular-nums">
                {formatMoney(line.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul aria-label="Line items" className="flex flex-col divide-y md:hidden">
        {lines.map((line) => (
          <li key={line.id} className="flex min-w-0 flex-col gap-1 py-3 first:pt-0 last:pb-0">
            <p className="text-sm font-medium wrap-anywhere whitespace-pre-wrap">
              {line.description}
            </p>
            <p className="text-muted-foreground text-sm">
              {formatNumber(line.quantity)} × {formatMoney(line.unitPrice)}
              {line.discountPercent > 0
                ? ` · ${formatPercent(line.discountPercent)} discount`
                : null}
              {` · ${formatPercent(line.taxRate)} tax`}
            </p>
            <p className="text-sm font-medium tabular-nums">{formatMoney(line.lineTotal)}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function TotalRow({
  label,
  children,
  strong,
}: {
  label: ReactNode;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4",
        strong ? "border-t pt-3 text-base font-semibold" : "text-sm",
      )}
    >
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

// The totals box of a quote or an invoice: subtotal, the discount when there is one, tax
// (one row per rate when `taxes` is given, as on a printed document) and the total.
export function DocumentTotals({
  subtotal,
  discountTotal,
  discountLabel = "Discount",
  taxes,
  taxTotal,
  total,
  note,
}: {
  subtotal: number;
  discountTotal: number;
  // "Discount (10%)" when the document says how the discount was given.
  discountLabel?: string;
  taxes?: { rate: number; taxableAmount: number; taxAmount: number }[];
  taxTotal: number;
  total: number;
  // A line under the box: the editor says there that the numbers are an estimate.
  note?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-2 sm:ml-auto sm:max-w-xs">
      <dl className="flex flex-col gap-2">
        <TotalRow label="Subtotal">{formatMoney(subtotal)}</TotalRow>
        {discountTotal > 0 ? (
          <TotalRow label={discountLabel}>−{formatMoney(discountTotal)}</TotalRow>
        ) : null}
        {taxes && taxes.length > 0 ? (
          taxes.map((tax) => (
            <TotalRow
              key={tax.rate}
              label={`Tax ${formatPercent(tax.rate)} on ${formatMoney(tax.taxableAmount)}`}
            >
              {formatMoney(tax.taxAmount)}
            </TotalRow>
          ))
        ) : (
          <TotalRow label="Tax">{formatMoney(taxTotal)}</TotalRow>
        )}
        <TotalRow label="Total" strong>
          {formatMoney(total)}
        </TotalRow>
      </dl>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );
}

// "Discount (10%)" for a percentage, "Discount" for an amount.
export function discountLabel(type: string | null, value: number | null): string {
  return type === "PERCENT" && value !== null ? `Discount (${formatPercent(value)})` : "Discount";
}
