"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/http";
import { formatDay, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { SalesDocument } from "@/lib/sales-document";

import { PageError, PageLoading, PageState } from "./page-state";
import { discountLabel } from "./sales-document";

// The print view of a quote or an invoice, drawn from the API's print-ready document
// (GET /quotes/:id/document, GET /invoices/:id/document). It is a page without the app
// frame: the browser's own print dialog turns it into paper or a PDF file ("Save as PDF").
// There is no generated PDF file yet.
//
// Paper is white with dark ink in both themes: the page carries the `paper` class, which
// gives everything inside it the light theme's tokens (globals.css), so a dark theme never
// prints light text.

const label = "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

function Party({ title, lines }: { title: string; lines: (string | null)[] }) {
  const shown = lines.filter((line): line is string => line !== null && line !== "");
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <h2 className={label}>{title}</h2>
      {shown.length === 0 ? (
        <p className="text-muted-foreground">—</p>
      ) : (
        shown.map((line, index) => (
          <p
            // The lines of one party never change places.
            key={`${String(index)}:${line}`}
            className={
              index === 0
                ? "font-semibold wrap-anywhere"
                : "wrap-anywhere whitespace-pre-wrap text-foreground/80"
            }
          >
            {line}
          </p>
        ))
      )}
    </section>
  );
}

function Fact({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 sm:justify-end print:justify-end">
      <dt className="text-muted-foreground">{name}</dt>
      <dd className="font-medium sm:min-w-28 sm:text-right print:min-w-28 print:text-right">
        {value}
      </dd>
    </div>
  );
}

function AmountRow({ name, value, strong }: { name: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        strong
          ? "flex justify-between gap-4 border-t border-foreground pt-2 text-base font-semibold"
          : "flex justify-between gap-4"
      }
    >
      <dt className={strong ? undefined : "text-muted-foreground"}>{name}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function humanize(value: string): string {
  return `${value.charAt(0)}${value.slice(1).toLowerCase()}`;
}

// The sheet itself. On a phone the lines are stacked blocks; from `sm`, and always on paper,
// they are a table.
export function PrintDocument({ document }: { document: SalesDocument }) {
  const isQuote = document.kind === "QUOTE";
  const { seller, buyer } = document;

  return (
    <article
      aria-label={`${isQuote ? "Quote" : "Invoice"} ${document.number}`}
      className="mx-auto flex w-full max-w-[210mm] flex-col gap-8 rounded-lg border bg-background p-5 text-sm text-foreground sm:p-10 print:max-w-none print:gap-6 print:rounded-none print:border-0 print:p-0"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-2xl font-semibold tracking-tight">{isQuote ? "Quote" : "Invoice"}</p>
          <p className="text-base font-medium wrap-anywhere">{document.number}</p>
          <p className="text-muted-foreground">Status: {humanize(document.status)}</p>
        </div>
        <dl className="flex flex-col gap-1">
          <Fact name="Issue date" value={formatDay(document.issueDate)} />
          {isQuote && document.validUntil ? (
            <Fact name="Valid until" value={formatDay(document.validUntil)} />
          ) : null}
          {document.dueDate ? <Fact name="Due date" value={formatDay(document.dueDate)} /> : null}
          {document.paymentTermsDays === null ? null : (
            <Fact
              name="Payment terms"
              value={
                document.paymentTermsDays === 0
                  ? "Due on receipt"
                  : `${String(document.paymentTermsDays)} days`
              }
            />
          )}
          {document.quoteNumber ? <Fact name="Quote" value={document.quoteNumber} /> : null}
        </dl>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2">
        <Party
          title="From"
          lines={[
            seller.name,
            seller.address,
            seller.email,
            seller.phone,
            seller.taxId ? `Tax ID: ${seller.taxId}` : null,
          ]}
        />
        <Party
          title={isQuote ? "Prepared for" : "Bill to"}
          lines={[
            buyer.companyName ?? buyer.contactName,
            buyer.companyName ? buyer.contactName : null,
            buyer.companyAddress,
            buyer.contactEmail,
          ]}
        />
      </div>

      <p className="wrap-anywhere text-foreground/80">
        <span className="text-muted-foreground">Regarding: </span>
        {document.opportunityName}
        <span className="text-muted-foreground"> · Prepared by </span>
        {document.preparedBy.name} ({document.preparedBy.email})
      </p>

      {document.lines.length === 0 ? (
        <p className="text-muted-foreground">No line items.</p>
      ) : (
        <>
          <table className="hidden w-full table-fixed sm:table print:table">
            <caption className="sr-only">Line items</caption>
            <thead>
              <tr className="border-b border-foreground text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Description
                </th>
                <th scope="col" className="w-[9%] px-2 py-2 text-right font-semibold">
                  Qty
                </th>
                <th scope="col" className="w-[17%] px-2 py-2 text-right font-semibold">
                  Unit price
                </th>
                <th scope="col" className="w-[9%] px-2 py-2 text-right font-semibold">
                  Disc.
                </th>
                <th scope="col" className="w-[9%] px-2 py-2 text-right font-semibold">
                  Tax
                </th>
                <th scope="col" className="w-[19%] py-2 pl-2 text-right font-semibold">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {document.lines.map((line) => (
                <tr key={line.id} className="break-inside-avoid border-b align-top">
                  <td className="py-2 pr-3 wrap-anywhere whitespace-pre-wrap">
                    {line.description}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatNumber(line.quantity)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatMoney(line.unitPrice)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {line.discountPercent > 0 ? formatPercent(line.discountPercent) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatPercent(line.taxRate)}
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums">
                    {formatMoney(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul
            aria-label="Line items"
            className="flex flex-col divide-y divide-border sm:hidden print:hidden"
          >
            {document.lines.map((line) => (
              <li key={line.id} className="flex min-w-0 flex-col gap-1 py-3 first:pt-0">
                <p className="font-medium wrap-anywhere whitespace-pre-wrap">{line.description}</p>
                <p className="text-muted-foreground">
                  {formatNumber(line.quantity)} × {formatMoney(line.unitPrice)}
                  {line.discountPercent > 0
                    ? ` · ${formatPercent(line.discountPercent)} discount`
                    : null}
                  {` · ${formatPercent(line.taxRate)} tax`}
                </p>
                <p className="font-medium tabular-nums">{formatMoney(line.lineTotal)}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="grid break-inside-avoid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2">
        {document.taxes.length > 0 ? (
          <section className="flex min-w-0 flex-col gap-1">
            <h2 className={label}>Tax breakdown</h2>
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1 font-medium">
                    Rate
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Taxable amount
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Tax
                  </th>
                </tr>
              </thead>
              <tbody>
                {document.taxes.map((tax) => (
                  <tr key={tax.rate} className="border-t">
                    <td className="py-1 tabular-nums">{formatPercent(tax.rate)}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatMoney(tax.taxableAmount)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{formatMoney(tax.taxAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <div />
        )}
        <dl className="flex flex-col gap-1.5">
          <AmountRow name="Subtotal" value={formatMoney(document.subtotal)} />
          {document.discountTotal > 0 ? (
            <AmountRow
              name={discountLabel(document.discountType, document.discountValue)}
              value={`−${formatMoney(document.discountTotal)}`}
            />
          ) : null}
          <AmountRow name="Tax" value={formatMoney(document.taxTotal)} />
          <AmountRow
            name={`Total (${document.currency})`}
            value={formatMoney(document.total)}
            strong
          />
        </dl>
      </div>

      {document.notes ? (
        <section className="flex break-inside-avoid flex-col gap-1">
          <h2 className={label}>Notes</h2>
          <p className="wrap-anywhere whitespace-pre-wrap text-foreground/80">{document.notes}</p>
        </section>
      ) : null}
      {document.terms ? (
        <section className="flex flex-col gap-1">
          <h2 className={label}>Terms</h2>
          <p className="wrap-anywhere whitespace-pre-wrap text-foreground/80">{document.terms}</p>
        </section>
      ) : null}
    </article>
  );
}

// /quotes/[id]/print and /invoices/[id]/print. `load` is the feature's own request for the
// document (`getQuoteDocument`, `getInvoiceDocument`: pass the function itself, not a new
// arrow on every render); its answer does not enter the store, because nothing else shows
// it. The bar with Back and Print is left off the paper.
export function PrintDocumentPage({
  id,
  load,
  backHref,
  backLabel,
}: {
  id: string;
  load: (id: string) => Promise<SalesDocument>;
  backHref: string;
  backLabel: string;
}) {
  const [answer, setAnswer] = useState<{ document: SalesDocument } | { error: ApiError } | null>(
    null,
  );
  // Counts the retries, so Retry asks again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    load(id).then(
      (document) => {
        if (current) {
          setAnswer({ document });
        }
      },
      (error: unknown) => {
        if (current) {
          // The axios interceptor already turned every failure into an ApiError.
          setAnswer({ error: error as ApiError });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [load, id, attempt]);

  return (
    <div className="paper bg-muted text-foreground flex min-h-dvh flex-col gap-4 p-4 sm:p-6 print:block print:min-h-0 print:bg-background print:p-0">
      <div className="mx-auto flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={backHref}
          className="flex min-h-11 items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {backLabel}
        </Link>
        <Button
          type="button"
          className="h-10 px-4"
          disabled={!answer || "error" in answer}
          onClick={() => {
            window.print();
          }}
        >
          <Printer aria-hidden />
          Print / Save as PDF
        </Button>
      </div>
      <p className="mx-auto w-full max-w-[210mm] text-xs text-muted-foreground print:hidden">
        This opens your browser&apos;s print dialog. To get a PDF file, choose &quot;Save as
        PDF&quot; as the printer there.
      </p>

      {answer === null ? (
        <PageLoading label="Loading document..." />
      ) : "error" in answer ? (
        <div className="mx-auto w-full max-w-md">
          {answer.error.code === "NOT_FOUND" ? (
            <PageState
              title="Document not found"
              description="It does not exist, or you do not have access to it."
            />
          ) : (
            <PageError
              error={answer.error}
              onRetry={() => {
                setAnswer(null);
                setAttempt(attempt + 1);
              }}
            />
          )}
        </div>
      ) : (
        <PrintDocument document={answer.document} />
      )}
    </div>
  );
}
