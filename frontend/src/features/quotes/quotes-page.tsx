"use client";

import { Plus, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ListActions } from "@/components/shared/list-actions";
import { type ListFilter, ListToolbar } from "@/components/shared/list-toolbar";
import {
  type ListUrlConfig,
  type SortOrder,
  useListUrlState,
} from "@/components/shared/list-url-state";
import { PageHeader } from "@/components/shared/page-header";
import { DeleteRecordDialog } from "@/components/shared/record-dialogs";
import { RecordList } from "@/components/shared/record-list";
import { RecordRowMenu } from "@/components/shared/record-menus";
import type { ListColumn } from "@/components/shared/responsive-list";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { selectAuth } from "@/features/auth/auth.slice";
import { CompanyFilter } from "@/features/companies/company-picker";
import { useOwnerFilter } from "@/features/users/use-owner-filter";
import { formatDay, formatMoney } from "@/lib/format";
import { useCurrentUrl, withReturnTo } from "@/lib/return-to";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { QUOTE_STATUSES, quoteAccess, quoteActions, quoteStatusOptions } from "./quote-labels";
import { QuoteOpportunityFilter } from "./quote-opportunity-filter";
import { QuoteStatusBadge } from "./quote-status-badge";
import { exportQuotes } from "./quotes.api";
import { deleteQuote, fetchQuotes, selectQuoteList } from "./quotes.slice";
import type { Quote, QuoteListQuery, QuoteSort, QuoteStatus } from "./quotes.types";

const PAGE_SIZE = 25;

// What the list keeps in the address:
//   /quotes?search=fleet&status=SENT&ownerId=...&companyId=...&sort=total&order=desc&page=2
// `opportunityId` is set by "View all" on an opportunity's Quotes card.
const LIST_URL: ListUrlConfig<"status" | "ownerId" | "companyId" | "opportunityId", QuoteSort> = {
  // Ids accept anything.
  filters: { status: QUOTE_STATUSES, ownerId: null, companyId: null, opportunityId: null },
  sorts: ["number", "issueDate", "validUntil", "total", "createdAt"],
  defaultSort: "createdAt",
  defaultOrder: "desc",
};

const sortOptions = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "number:desc", label: "Number: highest" },
  { value: "number:asc", label: "Number: lowest" },
  { value: "issueDate:desc", label: "Issue date: latest" },
  { value: "issueDate:asc", label: "Issue date: earliest" },
  { value: "validUntil:asc", label: "Valid until: soonest" },
  { value: "validUntil:desc", label: "Valid until: latest" },
  { value: "total:desc", label: "Total: highest" },
  { value: "total:asc", label: "Total: lowest" },
];

const linkClass =
  "hover:text-primary focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-3";

function Missing() {
  return <span className="text-muted-foreground">—</span>;
}

const columns: ListColumn<Quote>[] = [
  {
    header: "Number",
    className: "w-24",
    cell: (quote) => (
      <Link href={`/quotes/${quote.id}`} className={`${linkClass} block truncate font-medium`}>
        {quote.number}
      </Link>
    ),
  },
  {
    header: "Opportunity",
    cell: (quote) => (
      <div className="min-w-0">
        <Link
          href={`/opportunities/${quote.opportunity.id}`}
          className={`${linkClass} block truncate`}
        >
          {quote.opportunity.name}
        </Link>
        {/* The company has no column of its own below `lg`. */}
        {quote.company ? (
          <p className="text-muted-foreground truncate text-xs lg:hidden">{quote.company.name}</p>
        ) : null}
      </div>
    ),
  },
  {
    header: "Company",
    hideBelow: "lg",
    cell: (quote) =>
      quote.company ? (
        <Link href={`/companies/${quote.company.id}`} className={`${linkClass} block truncate`}>
          {quote.company.name}
        </Link>
      ) : (
        <Missing />
      ),
  },
  {
    header: "Status",
    className: "w-28",
    cell: (quote) => <QuoteStatusBadge status={quote.status} />,
  },
  {
    header: "Total",
    className: "w-32",
    cell: (quote) => (
      <span className="block truncate font-medium tabular-nums">{formatMoney(quote.total)}</span>
    ),
  },
  {
    header: "Valid until",
    className: "w-32",
    hideBelow: "xl",
    cell: (quote) => (quote.validUntil ? formatDay(quote.validUntil) : <Missing />),
  },
];

// The same quote as a stacked card, for phones.
function QuoteCard({ quote }: { quote: Quote }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link href={`/quotes/${quote.id}`} className={`${linkClass} min-w-0 font-medium`}>
            {quote.number}
          </Link>
          <QuoteStatusBadge status={quote.status} />
        </div>
        <Link
          href={`/opportunities/${quote.opportunity.id}`}
          className={`${linkClass} text-primary self-start text-sm wrap-anywhere`}
        >
          {quote.opportunity.name}
        </Link>
        {quote.company ? (
          <p className="text-muted-foreground text-sm wrap-anywhere">{quote.company.name}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold tabular-nums">{formatMoney(quote.total)}</span>
        <span className="text-muted-foreground text-xs">
          Valid until:{" "}
          <span className="text-foreground font-medium">
            {quote.validUntil ? formatDay(quote.validUntil) : "—"}
          </span>
        </span>
      </div>
    </div>
  );
}

// /quotes: every quote the signed-in user may see (the quotes of the opportunities they
// may see), with search, filters, sort and paging kept in the address, and the CSV export.
export function QuotesPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data, status, error } = useAppSelector(selectQuoteList);
  const { state, isFiltered, setSearch, setFilter, setSort, setPage, clearFilters } =
    useListUrlState(LIST_URL);
  const currentUrl = useCurrentUrl();
  const [deleting, setDeleting] = useState<Quote | null>(null);
  // For a user who sees more than their own opportunities.
  const ownerFilter = useOwnerFilter(state.filters.ownerId, (value) => {
    setFilter("ownerId", value);
  });

  const query = useMemo<QuoteListQuery>(
    () => ({
      ...(state.search ? { search: state.search } : {}),
      ...(state.filters.status ? { status: state.filters.status as QuoteStatus } : {}),
      ...(state.filters.ownerId ? { ownerId: state.filters.ownerId } : {}),
      ...(state.filters.companyId ? { companyId: state.filters.companyId } : {}),
      ...(state.filters.opportunityId ? { opportunityId: state.filters.opportunityId } : {}),
      sort: state.sort,
      order: state.order,
      page: state.page,
      pageSize: PAGE_SIZE,
    }),
    [state],
  );

  useEffect(() => {
    void dispatch(fetchQuotes(query));
  }, [dispatch, query]);

  if (!me) {
    return null;
  }
  const { canWrite } = quoteAccess(me.role);

  const newButton = (
    <Button asChild className="h-10 px-4">
      <Link
        href={
          isFiltered || state.page > 1 ? withReturnTo("/quotes/new", currentUrl) : "/quotes/new"
        }
      >
        <Plus aria-hidden />
        New quote
      </Link>
    </Button>
  );

  const filters: ListFilter[] = [
    {
      label: "Status",
      allLabel: "All",
      value: state.filters.status,
      options: quoteStatusOptions,
      onChange: (value) => {
        setFilter("status", value);
      },
    },
    ...ownerFilter,
  ];

  return (
    <>
      <PageHeader
        title="Quotes"
        description="What you have offered your customers, and what became of each offer."
        action={
          <>
            <ListActions onExport={() => exportQuotes(query)} />
            {canWrite ? newButton : null}
          </>
        }
      />

      <ListToolbar
        search={{
          value: state.search,
          placeholder: "Search by number, opportunity or company",
          maxLength: 100,
          onChange: setSearch,
        }}
        // A company is searched for, not picked from a select: there can be thousands. The
        // Opportunity filter shows only when a link set it (an opportunity's Quotes card).
        extra={
          <>
            <CompanyFilter
              of="quotes"
              companyId={state.filters.companyId}
              onChange={(companyId) => {
                setFilter("companyId", companyId);
              }}
            />
            {state.filters.opportunityId ? (
              <QuoteOpportunityFilter
                opportunityId={state.filters.opportunityId}
                onChange={(opportunityId) => {
                  setFilter("opportunityId", opportunityId);
                }}
              />
            ) : null}
          </>
        }
        filters={filters}
        sort={{
          value: `${state.sort}:${state.order}`,
          options: sortOptions,
          onChange: (value) => {
            const [sort, order] = value.split(":");
            setSort(sort as QuoteSort, order as SortOrder);
          },
        }}
      />

      <RecordList
        label="Quotes"
        plural="quotes"
        items={data?.quotes ?? null}
        meta={data}
        status={status}
        error={error}
        getKey={(quote) => quote.id}
        columns={columns}
        renderCard={(quote) => <QuoteCard quote={quote} />}
        rowActions={(quote) => {
          // Only a draft is changed or deleted.
          const draft = canWrite && quoteActions(quote).edit;
          return (
            <RecordRowMenu
              name={quote.number}
              viewHref={`/quotes/${quote.id}`}
              editHref={draft ? withReturnTo(`/quotes/${quote.id}/edit`, currentUrl) : undefined}
              onDelete={
                draft
                  ? () => {
                      setDeleting(quote);
                    }
                  : undefined
              }
            >
              <DropdownMenuItem asChild>
                <Link href={`/quotes/${quote.id}/print`}>
                  <Printer aria-hidden />
                  Print / PDF
                </Link>
              </DropdownMenuItem>
            </RecordRowMenu>
          );
        }}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyDescription={
          canWrite
            ? "Make your first quote from an opportunity."
            : "Quotes will show here once someone makes them."
        }
        createAction={canWrite ? newButton : undefined}
        page={state.page}
        onPageChange={setPage}
        onRetry={() => void dispatch(fetchQuotes(query))}
      />

      {deleting ? (
        <DeleteRecordDialog
          name={deleting.number}
          description="The draft is removed for everyone, and its number is not used again. The opportunity keeps a note of it on its timeline. This cannot be undone."
          onDelete={() => dispatch(deleteQuote(deleting.id)).unwrap()}
          onClose={() => {
            setDeleting(null);
          }}
        />
      ) : null}
    </>
  );
}
