"use client";

import { CircleCheck, CircleX, RotateCcw } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect } from "react";

import { RecordList } from "@/components/shared/record-list";
import { RecordRowMenu } from "@/components/shared/record-menus";
import type { ListColumn } from "@/components/shared/responsive-list";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDay } from "@/lib/format";
import { useCurrentUrl, withReturnTo } from "@/lib/return-to";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchOpportunities, selectOpportunityList } from "./opportunities.slice";
import type { Opportunity, OpportunityListQuery } from "./opportunities.types";
import type { OpportunityDialog } from "./opportunity-dialogs";
import { OpportunityStageBadge } from "./opportunity-stage-badge";
import { useOpportunityStage } from "./use-opportunity-stage";

const linkClass =
  "hover:text-primary focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-3";

function Missing() {
  return <span className="text-muted-foreground">—</span>;
}

function NameCell({ opportunity }: { opportunity: Opportunity }) {
  return (
    <div className="min-w-0">
      <Link
        href={`/opportunities/${opportunity.id}`}
        className={`${linkClass} block truncate font-medium`}
      >
        {opportunity.name}
      </Link>
      {opportunity.company ? (
        <Link
          href={`/companies/${opportunity.company.id}`}
          className={`${linkClass} text-muted-foreground block truncate text-xs`}
        >
          {opportunity.company.name}
        </Link>
      ) : null}
    </div>
  );
}

// The same opportunity as a stacked card, for phones.
function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={`/opportunities/${opportunity.id}`}
            className={`${linkClass} min-w-0 font-medium wrap-anywhere`}
          >
            {opportunity.name}
          </Link>
          <OpportunityStageBadge stage={opportunity.stage} />
        </div>
        {opportunity.company ? (
          <Link
            href={`/companies/${opportunity.company.id}`}
            className={`${linkClass} text-primary self-start text-sm wrap-anywhere`}
          >
            {opportunity.company.name}
          </Link>
        ) : null}
        {opportunity.contact ? (
          <Link
            href={`/contacts/${opportunity.contact.id}`}
            className={`${linkClass} text-muted-foreground self-start text-sm wrap-anywhere`}
          >
            {opportunity.contact.name}
          </Link>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{formatCurrency(opportunity.value)}</span>
        <span className="text-muted-foreground text-xs">
          Expected close:{" "}
          <span className="text-foreground font-medium">
            {opportunity.expectedCloseDate ? formatDay(opportunity.expectedCloseDate) : "—"}
          </span>
        </span>
      </div>
      <p className="text-muted-foreground border-t pt-3 text-xs">
        Owner: <span className="text-foreground font-medium">{opportunity.owner.name}</span>
      </p>
    </div>
  );
}

const columns: ListColumn<Opportunity>[] = [
  { header: "Name", cell: (opportunity) => <NameCell opportunity={opportunity} /> },
  {
    header: "Stage",
    className: "w-36",
    cell: (opportunity) => <OpportunityStageBadge stage={opportunity.stage} />,
  },
  {
    header: "Value",
    className: "w-32",
    cell: (opportunity) => (
      <span className="block truncate font-medium">{formatCurrency(opportunity.value)}</span>
    ),
  },
  {
    header: "Expected close",
    className: "w-36",
    hideBelow: "lg",
    cell: (opportunity) =>
      opportunity.expectedCloseDate ? formatDay(opportunity.expectedCloseDate) : <Missing />,
  },
  {
    header: "Contact",
    className: "w-40",
    hideBelow: "xl",
    cell: (opportunity) =>
      opportunity.contact ? (
        <Link
          href={`/contacts/${opportunity.contact.id}`}
          className={`${linkClass} block truncate`}
        >
          {opportunity.contact.name}
        </Link>
      ) : (
        <Missing />
      ),
  },
  {
    header: "Owner",
    className: "w-32",
    hideBelow: "lg",
    cell: (opportunity) => <p className="truncate">{opportunity.owner.name}</p>,
  },
];

// /opportunities?view=list: the opportunities as the shared record list (a table from `md`,
// cards below), under the page's toolbar. The page owns the list state in the address and
// hands over the query built from it.
export function OpportunityList({
  query,
  canWrite,
  canReassign,
  isFiltered,
  onClearFilters,
  createAction,
  page,
  onPageChange,
  onOpen,
}: {
  query: OpportunityListQuery;
  canWrite: boolean;
  canReassign: boolean;
  isFiltered: boolean;
  onClearFilters: () => void;
  createAction?: ReactNode;
  page: number;
  onPageChange: (page: number) => void;
  onOpen: (dialog: OpportunityDialog) => void;
}) {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectOpportunityList);
  const currentUrl = useCurrentUrl();
  const { reopen } = useOpportunityStage();

  useEffect(() => {
    void dispatch(fetchOpportunities(query));
  }, [dispatch, query]);

  return (
    <RecordList
      label="Opportunities"
      plural="opportunities"
      items={data?.opportunities ?? null}
      meta={data}
      status={status}
      error={error}
      getKey={(opportunity) => opportunity.id}
      columns={columns}
      renderCard={(opportunity) => <OpportunityCard opportunity={opportunity} />}
      rowActions={(opportunity) => (
        <RecordRowMenu
          name={opportunity.name}
          viewHref={`/opportunities/${opportunity.id}`}
          editHref={
            canWrite ? withReturnTo(`/opportunities/${opportunity.id}/edit`, currentUrl) : undefined
          }
          onReassign={
            canReassign
              ? () => {
                  onOpen({ kind: "reassign", opportunity });
                }
              : undefined
          }
          onDelete={
            canWrite
              ? () => {
                  onOpen({ kind: "delete", opportunity });
                }
              : undefined
          }
        >
          {canWrite && opportunity.status === "OPEN" ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  onOpen({ kind: "close", outcome: "WON", opportunity });
                }}
              >
                <CircleCheck aria-hidden />
                Close as won
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  onOpen({ kind: "close", outcome: "LOST", opportunity });
                }}
              >
                <CircleX aria-hidden />
                Close as lost
              </DropdownMenuItem>
            </>
          ) : null}
          {canWrite && opportunity.status !== "OPEN" ? (
            <DropdownMenuItem onSelect={() => void reopen(opportunity)}>
              <RotateCcw aria-hidden />
              Reopen
            </DropdownMenuItem>
          ) : null}
        </RecordRowMenu>
      )}
      isFiltered={isFiltered}
      onClearFilters={onClearFilters}
      emptyDescription={
        canWrite
          ? "Add your first opportunity to start your pipeline."
          : "Opportunities will show here once someone adds them."
      }
      createAction={createAction}
      page={page}
      onPageChange={onPageChange}
      onRetry={() => void dispatch(fetchOpportunities(query))}
    />
  );
}
