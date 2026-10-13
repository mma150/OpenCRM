"use client";

import { FileText, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";

import { ListActions } from "@/components/shared/list-actions";
import { ListToolbar } from "@/components/shared/list-toolbar";
import {
  type ListUrlConfig,
  type SortOrder,
  useListUrlState,
} from "@/components/shared/list-url-state";
import { PageHeader } from "@/components/shared/page-header";
import { RecordList } from "@/components/shared/record-list";
import { RecordRowMenu } from "@/components/shared/record-menus";
import type { ListColumn } from "@/components/shared/responsive-list";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { selectAuth } from "@/features/auth/auth.slice";
import { CompanyFilter } from "@/features/companies/company-picker";
import { formatDay, formatMoney } from "@/lib/format";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { INVOICE_STATUSES, invoiceStatusOptions } from "./invoice-labels";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import { InvoiceSummaryTiles } from "./invoice-summary-tiles";
import { exportInvoices } from "./invoices.api";
import { fetchInvoices, selectInvoiceList } from "./invoices.slice";
import type { Invoice, InvoiceListQuery, InvoiceSort, InvoiceStatus } from "./invoices.types";

const PAGE_SIZE = 25;

// What the list keeps in the address:
// /invoices?search=northwind&status=OVERDUE&companyId=...&sort=dueDate&order=asc&page=2
const LIST_URL: ListUrlConfig<"status" | "companyId", InvoiceSort> = {
  // A company id accepts anything.
  filters: { status: INVOICE_STATUSES, companyId: null },
  sorts: ["number", "issueDate", "dueDate", "total"],
  defaultSort: "number",
  defaultOrder: "desc",
};

const sortOptions = [
  { value: "number:desc", label: "Number: newest first" },
  { value: "number:asc", label: "Number: oldest first" },
  { value: "issueDate:desc", label: "Issued: latest" },
  { value: "issueDate:asc", label: "Issued: earliest" },
  { value: "dueDate:asc", label: "Due: soonest" },
  { value: "dueDate:desc", label: "Due: latest" },
  { value: "total:desc", label: "Total: highest" },
  { value: "total:asc", label: "Total: lowest" },
];

const linkClass =
  "hover:text-primary focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-3";

function Missing() {
  return <span className="text-muted-foreground">—</span>;
}

// The due date of an invoice. One that is overdue says so in words, never by colour alone.
function DueDate({ invoice }: { invoice: Invoice }) {
  if (invoice.status === "OVERDUE") {
    return (
      <span className="text-destructive font-medium">Overdue · {formatDay(invoice.dueDate)}</span>
    );
  }
  return <>{formatDay(invoice.dueDate)}</>;
}

// The same invoice as a stacked card, for phones.
function InvoiceCard({ invoice }: { invoice: Invoice }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={`/invoices/${invoice.id}`}
            className={`${linkClass} min-w-0 font-medium wrap-anywhere`}
          >
            {invoice.number}
          </Link>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
        <p className="text-muted-foreground text-sm wrap-anywhere">
          {invoice.company?.name ?? invoice.contact?.name ?? "No company"}
        </p>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{formatMoney(invoice.total)}</span>
        <span className="text-muted-foreground text-xs">
          Due:{" "}
          <span className="text-foreground font-medium">
            <DueDate invoice={invoice} />
          </span>
        </span>
      </div>
      <p className="text-muted-foreground border-t pt-3 text-xs">
        Issued: <span className="text-foreground font-medium">{formatDay(invoice.issueDate)}</span>
      </p>
    </div>
  );
}

const columns: ListColumn<Invoice>[] = [
  {
    header: "Number",
    className: "w-28",
    cell: (invoice) => (
      <Link href={`/invoices/${invoice.id}`} className={`${linkClass} block truncate font-medium`}>
        {invoice.number}
      </Link>
    ),
  },
  {
    // The company's name as the invoice has it: it does not follow the company afterwards.
    header: "Company",
    cell: (invoice) =>
      invoice.company ? <p className="truncate">{invoice.company.name}</p> : <Missing />,
  },
  {
    header: "Status",
    className: "w-24 lg:w-28",
    cell: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
  },
  {
    header: "Total",
    className: "w-28 lg:w-32",
    cell: (invoice) => (
      <span className="block truncate font-medium">{formatMoney(invoice.total)}</span>
    ),
  },
  {
    header: "Issue date",
    className: "w-32",
    hideBelow: "lg",
    cell: (invoice) => formatDay(invoice.issueDate),
  },
  {
    // On a tablet "Overdue · Sep 19, 2026" takes two lines, which leaves the company room.
    header: "Due date",
    className: "w-32 lg:w-44",
    cell: (invoice) => (
      <span className="block whitespace-normal">
        <DueDate invoice={invoice} />
      </span>
    ),
  },
];

// /invoices: the totals that matter (outstanding, overdue, paid this month) and every
// invoice the signed-in user may see, with search, filters, sorting and paging kept in the
// address. There is no "New" button: an invoice is only made from an accepted quote.
export function InvoicesPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data, status, error } = useAppSelector(selectInvoiceList);
  const { state, isFiltered, setSearch, setFilter, setSort, setPage, clearFilters } =
    useListUrlState(LIST_URL);

  const query = useMemo<InvoiceListQuery>(
    () => ({
      ...(state.search ? { search: state.search } : {}),
      ...(state.filters.status ? { status: state.filters.status as InvoiceStatus } : {}),
      ...(state.filters.companyId ? { companyId: state.filters.companyId } : {}),
      sort: state.sort,
      order: state.order,
      page: state.page,
      pageSize: PAGE_SIZE,
    }),
    [state],
  );

  useEffect(() => {
    void dispatch(fetchInvoices(query));
  }, [dispatch, query]);

  if (!me) {
    return null;
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        description="What you have billed, and what is still to be paid. OpenCRM takes no payments: you keep each invoice up to date."
        action={<ListActions onExport={() => exportInvoices(query)} />}
      />

      <InvoiceSummaryTiles className="grid-cols-1 sm:grid-cols-3" />

      <ListToolbar
        search={{
          value: state.search,
          placeholder: "Search by number or company",
          maxLength: 100,
          onChange: setSearch,
        }}
        // A company is searched for, not picked from a select: there can be thousands.
        extra={
          <CompanyFilter
            of="invoices"
            companyId={state.filters.companyId}
            onChange={(companyId) => {
              setFilter("companyId", companyId);
            }}
          />
        }
        filters={[
          {
            label: "Status",
            allLabel: "All",
            value: state.filters.status,
            options: invoiceStatusOptions,
            onChange: (value) => {
              setFilter("status", value);
            },
          },
        ]}
        sort={{
          value: `${state.sort}:${state.order}`,
          options: sortOptions,
          onChange: (value) => {
            const [sort, order] = value.split(":");
            setSort(sort as InvoiceSort, order as SortOrder);
          },
        }}
      />

      <RecordList
        label="Invoices"
        plural="invoices"
        items={data?.invoices ?? null}
        meta={data}
        status={status}
        error={error}
        getKey={(invoice) => invoice.id}
        columns={columns}
        renderCard={(invoice) => <InvoiceCard invoice={invoice} />}
        rowActions={(invoice) => (
          <RecordRowMenu name={invoice.number} viewHref={`/invoices/${invoice.id}`}>
            <DropdownMenuItem asChild>
              <Link href={`/invoices/${invoice.id}/print`}>
                <Printer aria-hidden />
                Print / PDF
              </Link>
            </DropdownMenuItem>
          </RecordRowMenu>
        )}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyDescription="An invoice is made from an accepted quote: open the quote and choose to create its invoice."
        createAction={
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/quotes">
              <FileText aria-hidden />
              Go to quotes
            </Link>
          </Button>
        }
        page={state.page}
        onPageChange={setPage}
        onRetry={() => void dispatch(fetchInvoices(query))}
      />
    </>
  );
}
