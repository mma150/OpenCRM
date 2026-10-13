"use client";

import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageError, PageState } from "@/components/shared/page-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api/http";
import { formatDay, formatMoney } from "@/lib/format";

import { QuoteStatusBadge } from "./quote-status-badge";
import { listQuotes } from "./quotes.api";
import type { QuoteList } from "./quotes.types";

// How many quotes the card shows. An opportunity with more links to the quotes list,
// filtered by this opportunity, where they can be searched and paged.
const SHOWN = 10;
const SKELETON_ROWS = [0, 1];

const linkClass =
  "hover:text-primary focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-3";

// What the request answered, with the opportunity it was asked for.
type Answer = { opportunityId: string } & ({ list: QuoteList } | { error: ApiError });

// The Quotes card on an opportunity's page: its quotes, newest first, each with its status,
// total and "valid until", and the invoice that was made from it. `canWrite` adds the
// "New quote" button, which opens the editor with this opportunity filled in. The answer
// does not enter the store: only this card shows it, and the quotes slice's own list
// belongs to the /quotes page.
//
//   <OpportunityQuotes opportunityId={opportunity.id} canWrite={access.canWrite} />
export function OpportunityQuotes({
  opportunityId,
  canWrite,
}: {
  opportunityId: string;
  canWrite: boolean;
}) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Counts the retries, so Retry asks again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    listQuotes({
      opportunityId,
      sort: "createdAt",
      order: "desc",
      page: 1,
      pageSize: SHOWN,
    }).then(
      (list) => {
        if (current) {
          setAnswer({ opportunityId, list });
        }
      },
      (error: unknown) => {
        if (current) {
          // The axios interceptor already turned every failure into an ApiError.
          setAnswer({ opportunityId, error: error as ApiError });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [opportunityId, attempt]);

  // Never show one opportunity's quotes under another opportunity.
  const mine = answer?.opportunityId === opportunityId ? answer : null;
  const list = mine && "list" in mine ? mine.list : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <h2>Quotes</h2>
          {list ? (
            <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-xs font-medium">
              {list.total} total
            </span>
          ) : null}
        </CardTitle>
        {canWrite ? (
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href={`/quotes/new?opportunityId=${opportunityId}`}>
              <Plus aria-hidden />
              New quote
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mine === null ? (
          <div role="status" aria-label="Loading quotes" className="flex flex-col gap-4">
            {SKELETON_ROWS.map((row) => (
              <div key={row} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : "error" in mine ? (
          <PageError
            error={mine.error}
            onRetry={() => {
              setAttempt(attempt + 1);
            }}
          />
        ) : mine.list.quotes.length === 0 ? (
          <PageState
            icon={FileText}
            title="No quotes yet"
            description={
              canWrite
                ? "Make a quote for this opportunity when you are ready to name a price."
                : "Quotes made for this opportunity will show in this list."
            }
          />
        ) : (
          <>
            <ul aria-label="Quotes" className="flex min-w-0 flex-col divide-y">
              {mine.list.quotes.map((quote) => (
                <li
                  key={quote.id}
                  className="flex min-w-0 flex-col gap-1 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                      href={`/quotes/${quote.id}`}
                      className={`${linkClass} text-sm font-medium`}
                    >
                      {quote.number}
                    </Link>
                    <QuoteStatusBadge status={quote.status} />
                  </div>
                  <p className="text-muted-foreground text-xs wrap-anywhere">
                    <span className="text-foreground font-medium tabular-nums">
                      {formatMoney(quote.total)}
                    </span>
                    {quote.validUntil ? ` · Valid until ${formatDay(quote.validUntil)}` : null}
                    {quote.invoice ? (
                      <>
                        {" · "}
                        <Link
                          href={`/invoices/${quote.invoice.id}`}
                          className={`${linkClass} text-primary font-medium`}
                        >
                          Invoice {quote.invoice.number}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
            {mine.list.total > mine.list.quotes.length ? (
              <Button asChild variant="outline" className="h-10 self-center px-4">
                <Link href={`/quotes?opportunityId=${opportunityId}`}>
                  View all {mine.list.total} quotes
                </Link>
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
