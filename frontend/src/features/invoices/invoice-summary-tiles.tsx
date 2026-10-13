"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeApiError } from "@/lib/api/error-messages";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchInvoiceSummary, selectInvoiceSummary } from "./invoices.slice";
import type { InvoiceSummary } from "./invoices.types";

export type InvoiceTile = "outstanding" | "overdue" | "paid";

const ALL_TILES: InvoiceTile[] = ["outstanding", "overdue", "paid"];

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

type TileContent = { label: string; value: string; hint: string; href: string; alert: boolean };

// What each tile says. Outstanding is sent and overdue together, so it has no one status to
// filter by and links to the whole list; the other two link to the list with their status.
function tileContent(tile: InvoiceTile, summary: InvoiceSummary): TileContent {
  const { counts } = summary;
  switch (tile) {
    case "outstanding":
      return {
        label: "Outstanding",
        value: formatCurrency(summary.outstandingTotal),
        hint: `${String(counts.SENT)} sent · ${String(counts.OVERDUE)} overdue`,
        href: "/invoices",
        alert: false,
      };
    case "overdue":
      return {
        label: "Overdue",
        value: formatCurrency(summary.overdueTotal),
        hint: plural(counts.OVERDUE, "invoice", "invoices"),
        href: "/invoices?status=OVERDUE",
        alert: counts.OVERDUE > 0,
      };
    case "paid":
      return {
        label: "Paid this month",
        value: formatCurrency(summary.paidThisMonthTotal),
        hint: `${plural(counts.PAID, "paid invoice", "paid invoices")} in all`,
        href: "/invoices?status=PAID",
        alert: false,
      };
  }
}

// The totals of GET /invoices/summary as tiles, each a link to the list it counts: above the
// invoices list (all three) and on Home (outstanding and overdue). They are over the
// invoices the viewer may see. The tiles load on their own: while the answer is on its way
// they are skeletons, and a failure shows its own message with Retry and leaves the rest of
// the page alone.
export function InvoiceSummaryTiles({
  show = ALL_TILES,
  className,
}: {
  show?: InvoiceTile[];
  // The grid's columns: the list and Home lay the tiles out differently.
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectInvoiceSummary);

  useEffect(() => {
    void dispatch(fetchInvoiceSummary());
  }, [dispatch]);

  if (!data) {
    if (status === "failed" && error) {
      return (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm"
        >
          <p className="min-w-0 wrap-anywhere">
            The invoice totals could not be loaded. {describeApiError(error)}
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4"
            onClick={() => void dispatch(fetchInvoiceSummary())}
          >
            Retry
          </Button>
        </div>
      );
    }
    return (
      <div
        role="status"
        aria-label="Loading invoice totals"
        className={cn("grid gap-3", className)}
      >
        {show.map((tile) => (
          <Skeleton key={tile} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <ul aria-label="Invoice totals" className={cn("grid gap-3", className)}>
      {show.map((tile) => {
        const content = tileContent(tile, data);
        return (
          <li key={tile} className="min-w-0">
            <Link
              href={content.href}
              className="bg-card hover:border-primary/40 focus-visible:ring-ring/50 flex h-full min-w-0 flex-col gap-1 rounded-lg border p-4 outline-none focus-visible:ring-3"
            >
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {content.label}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1.5 text-2xl font-semibold tracking-tight wrap-anywhere",
                  content.alert && "text-destructive",
                )}
              >
                {content.alert ? <CircleAlert aria-hidden className="size-5 shrink-0" /> : null}
                {content.value}
              </span>
              <span className="text-muted-foreground text-xs">{content.hint}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
