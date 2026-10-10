"use client";

import { CircleDollarSign, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageError, PageState } from "@/components/shared/page-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api/http";
import { formatCurrency, formatDay } from "@/lib/format";

import { listOpportunities } from "./opportunities.api";
import type { OpportunityList } from "./opportunities.types";
import { OpportunityStageBadge } from "./opportunity-stage-badge";

// How many opportunities the card shows. A record with more links to the opportunities
// list, filtered by this record, where they can be searched and paged.
const SHOWN = 10;
const SKELETON_ROWS = [0, 1, 2];

// The record whose opportunities the card lists: the filter of GET /opportunities it uses.
type Of = { companyId: string } | { contactId: string };

// What the request answered, with the record it was asked for.
type Answer = { key: string } & ({ list: OpportunityList } | { error: ApiError });

// The Opportunities card on a company's or a contact's page: the opportunities linked to it
// that the signed-in user may see, newest first, each a link to the opportunity. `addHref`
// is the new-opportunity form with this record filled in; leave it out for a user who may
// not add one. The answer does not enter the store: only this card shows it, and the
// opportunities slice's own list belongs to the /opportunities page.
//
//   <RecordOpportunities of={{ companyId: company.id }} addHref={...} />
export function RecordOpportunities({ of, addHref }: { of: Of; addHref?: string }) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Counts the retries, so Retry asks again.
  const [attempt, setAttempt] = useState(0);
  const [param, id] = "companyId" in of ? ["companyId", of.companyId] : ["contactId", of.contactId];
  const key = `${param}=${id}`;

  useEffect(() => {
    let current = true;
    listOpportunities({
      ...(param === "companyId" ? { companyId: id } : { contactId: id }),
      sort: "createdAt",
      order: "desc",
      page: 1,
      pageSize: SHOWN,
    }).then(
      (list) => {
        if (current) {
          setAnswer({ key, list });
        }
      },
      (error: unknown) => {
        if (current) {
          // The axios interceptor already turned every failure into an ApiError.
          setAnswer({ key, error: error as ApiError });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [param, id, key, attempt]);

  // Never show one record's opportunities under another record.
  const mine = answer?.key === key ? answer : null;
  const list = mine && "list" in mine ? mine.list : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <h2>Opportunities</h2>
          {list ? (
            <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-xs font-medium">
              {list.total} total
            </span>
          ) : null}
        </CardTitle>
        {addHref ? (
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href={addHref}>
              <Plus aria-hidden />
              Add opportunity
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mine === null ? (
          <div role="status" aria-label="Loading opportunities" className="flex flex-col gap-4">
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
        ) : mine.list.opportunities.length === 0 ? (
          <PageState
            icon={CircleDollarSign}
            title="No opportunities yet"
            description={
              addHref
                ? "Add the deals you are working on here."
                : "Opportunities linked here will show in this list."
            }
          />
        ) : (
          <>
            <ul aria-label="Opportunities" className="flex min-w-0 flex-col divide-y">
              {mine.list.opportunities.map((opportunity) => (
                <li
                  key={opportunity.id}
                  className="flex min-w-0 flex-col gap-1 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                      href={`/opportunities/${opportunity.id}`}
                      className="hover:text-primary focus-visible:ring-ring/50 min-w-0 rounded-sm text-sm font-medium wrap-anywhere outline-none focus-visible:ring-3"
                    >
                      {opportunity.name}
                    </Link>
                    <OpportunityStageBadge stage={opportunity.stage} />
                  </div>
                  <p className="text-muted-foreground text-xs wrap-anywhere">
                    <span className="text-foreground font-medium">
                      {formatCurrency(opportunity.value)}
                    </span>
                    {opportunity.expectedCloseDate
                      ? ` · Expected close ${formatDay(opportunity.expectedCloseDate)}`
                      : null}
                    {` · ${opportunity.owner.name}`}
                  </p>
                </li>
              ))}
            </ul>
            {mine.list.total > mine.list.opportunities.length ? (
              <Button asChild variant="outline" className="h-10 self-center px-4">
                <Link href={`/opportunities?view=list&${key}`}>
                  View all {mine.list.total} opportunities
                </Link>
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
