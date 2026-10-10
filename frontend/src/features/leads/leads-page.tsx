"use client";

import { ArrowRightLeft, Plus, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  CustomFieldFilterButton,
  CustomFieldFilterChips,
} from "@/components/shared/custom-fields-filter";
import { ListActions } from "@/components/shared/list-actions";
import { type ListFilter, ListToolbar } from "@/components/shared/list-toolbar";
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
import { useCustomFields } from "@/features/custom-fields/use-custom-fields";
import { useOwnerFilter } from "@/features/users/use-owner-filter";
import { formatDate, formatRelativeDate } from "@/lib/format";
import { useCurrentUrl, withReturnTo } from "@/lib/return-to";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { type LeadDialog, LeadDialogs } from "./lead-dialogs";
import {
  isConverted,
  isOpenLeadStatus,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  leadAccess,
  leadSourceOptions,
  leadStatusOptions,
  LOST_REASON_LABELS,
} from "./lead-labels";
import { LeadStatusBadge } from "./lead-status-badge";
import { exportLeads } from "./leads.api";
import { fetchLeads, selectLeadList } from "./leads.slice";
import type { Lead, LeadListQuery, LeadSort, LeadSource, LeadStatus } from "./leads.types";
import { useChangeLeadStatus } from "./use-change-lead-status";

const PAGE_SIZE = 25;

type LeadFilter = "status" | "source" | "ownerId";

// What the list keeps in the address: /leads?search=acme&status=NEW&sort=name&order=asc&page=2
const LIST_URL: ListUrlConfig<LeadFilter, LeadSort> = {
  filters: { status: LEAD_STATUSES, source: LEAD_SOURCES, ownerId: null },
  sorts: ["name", "company", "status", "createdAt", "updatedAt", "lastContactAt"],
  defaultSort: "createdAt",
  defaultOrder: "desc",
  customFilters: true,
};

const sortOptions = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "lastContactAt:desc", label: "Last contact: newest" },
  { value: "lastContactAt:asc", label: "Last contact: oldest" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "company:asc", label: "Company A–Z" },
  { value: "status:asc", label: "Status" },
];

// The mark of a converted lead in the list: the contact it became, as a link.
function ConvertedTo({ lead, className }: { lead: Lead; className: string }) {
  const contact = lead.convertedTo?.contact;
  if (!contact) {
    return null;
  }
  return (
    <p className={`text-muted-foreground text-xs ${className}`}>
      Now contact{" "}
      <Link
        href={`/contacts/${contact.id}`}
        className="text-primary focus-visible:ring-ring/50 rounded-sm outline-none hover:underline focus-visible:ring-3"
      >
        {contact.name}
      </Link>
    </p>
  );
}

function NameCell({ lead }: { lead: Lead }) {
  return (
    <div className="min-w-0">
      <Link
        href={`/leads/${lead.id}`}
        className="hover:text-primary focus-visible:ring-ring/50 block truncate rounded-sm font-medium outline-none focus-visible:ring-3"
      >
        {lead.name}
      </Link>
      {lead.company ? (
        <p className="text-muted-foreground truncate text-xs">{lead.company}</p>
      ) : null}
      <ConvertedTo lead={lead} className="truncate" />
    </div>
  );
}

// "Today", "3 days ago", "Oct 5, 2026", or "Never" for a lead nobody has spoken to yet.
function lastContact(lead: Lead): string {
  return lead.lastContactAt ? formatRelativeDate(lead.lastContactAt) : "Never";
}

// The same lead as a stacked card, for phones.
function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={`/leads/${lead.id}`}
            className="hover:text-primary min-w-0 rounded-sm font-medium wrap-anywhere outline-none focus-visible:ring-3"
          >
            {lead.name}
          </Link>
          <LeadStatusBadge status={lead.status} />
        </div>
        {lead.company ? (
          <p className="text-muted-foreground text-sm wrap-anywhere">{lead.company}</p>
        ) : null}
      </div>
      <div className="text-muted-foreground flex items-center justify-between gap-3 border-t pt-3 text-xs">
        <span className="text-foreground min-w-0 truncate font-medium">{lead.owner.name}</span>
        <span className="shrink-0">
          {LEAD_SOURCE_LABELS[lead.source]} · {formatDate(lead.createdAt)}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        Last contact: <span className="text-foreground font-medium">{lastContact(lead)}</span>
      </p>
      {lead.status === "LOST" && lead.lostReason ? (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
          Lost: {LOST_REASON_LABELS[lead.lostReason]}
        </p>
      ) : null}
      <ConvertedTo lead={lead} className="bg-muted rounded-md px-3 py-2 wrap-anywhere" />
    </div>
  );
}

// The row menu: the shared View, Edit, Reassign and Delete, each only for a user who may
// use it, plus what only a lead has (Convert, Reopen, Mark as lost).
function LeadActionsMenu({
  lead,
  canWrite,
  canReassign,
  editHref,
  onOpen,
}: {
  lead: Lead;
  canWrite: boolean;
  canReassign: boolean;
  editHref: string;
  onOpen: (dialog: LeadDialog) => void;
}) {
  const changeStatus = useChangeLeadStatus();
  // A converted lead is final: it is not edited, marked lost, converted again or deleted.
  const canChange = canWrite && !isConverted(lead);

  return (
    <RecordRowMenu
      name={lead.name}
      viewHref={`/leads/${lead.id}`}
      editHref={canChange ? editHref : undefined}
      onReassign={
        canReassign
          ? () => {
              onOpen({ kind: "reassign", lead });
            }
          : undefined
      }
      onDelete={
        canChange
          ? () => {
              onOpen({ kind: "delete", lead });
            }
          : undefined
      }
    >
      {canWrite && isOpenLeadStatus(lead.status) ? (
        <DropdownMenuItem
          onSelect={() => {
            onOpen({ kind: "convert", lead });
          }}
        >
          <ArrowRightLeft aria-hidden />
          Convert
        </DropdownMenuItem>
      ) : null}
      {canWrite && lead.status === "LOST" ? (
        <DropdownMenuItem onSelect={() => void changeStatus(lead, "NEW")}>
          <RotateCcw aria-hidden />
          Reopen
        </DropdownMenuItem>
      ) : null}
      {canWrite && isOpenLeadStatus(lead.status) ? (
        <DropdownMenuItem
          onSelect={() => {
            onOpen({ kind: "mark-lost", lead });
          }}
        >
          <XCircle aria-hidden />
          Mark as lost
        </DropdownMenuItem>
      ) : null}
    </RecordRowMenu>
  );
}

const columns: ListColumn<Lead>[] = [
  { header: "Name", cell: (lead) => <NameCell lead={lead} /> },
  {
    header: "Status",
    className: "w-32",
    cell: (lead) => <LeadStatusBadge status={lead.status} />,
  },
  {
    header: "Source",
    className: "w-28",
    hideBelow: "xl",
    cell: (lead) => LEAD_SOURCE_LABELS[lead.source],
  },
  {
    header: "Owner",
    className: "w-36",
    cell: (lead) => <p className="truncate">{lead.owner.name}</p>,
  },
  {
    header: "Last contact",
    className: "w-32",
    hideBelow: "lg",
    cell: (lead) => (
      <span className={lead.lastContactAt ? undefined : "text-muted-foreground"}>
        {lastContact(lead)}
      </span>
    ),
  },
  {
    header: "Created",
    className: "w-28",
    hideBelow: "xl",
    cell: (lead) => <span className="text-muted-foreground">{formatDate(lead.createdAt)}</span>,
  },
];

// /leads: every lead the signed-in user may see, with search, filters, sorting and paging
// kept in the address (LEAD-03).
export function LeadsPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data, status, error } = useAppSelector(selectLeadList);
  const { state, isFiltered, setSearch, setFilter, setCustom, setSort, setPage, clearFilters } =
    useListUrlState(LIST_URL);
  const { data: customFields } = useCustomFields("LEAD");
  const currentUrl = useCurrentUrl();
  const [dialog, setDialog] = useState<LeadDialog>(null);
  // For a user who sees more than their own leads.
  const ownerFilter = useOwnerFilter(state.filters.ownerId, (value) => {
    setFilter("ownerId", value);
  });

  const query = useMemo<LeadListQuery>(
    () => ({
      ...(state.search ? { search: state.search } : {}),
      ...(state.filters.status ? { status: state.filters.status as LeadStatus } : {}),
      ...(state.filters.source ? { source: state.filters.source as LeadSource } : {}),
      ...(state.filters.ownerId ? { ownerId: state.filters.ownerId } : {}),
      ...state.custom,
      sort: state.sort,
      order: state.order,
      page: state.page,
      pageSize: PAGE_SIZE,
    }),
    [state],
  );

  useEffect(() => {
    void dispatch(fetchLeads(query));
  }, [dispatch, query]);

  if (!me) {
    return null;
  }
  const { canWrite, canReassign } = leadAccess(me.role);
  const newLeadHref =
    isFiltered || state.page > 1 ? withReturnTo("/leads/new", currentUrl) : "/leads/new";
  const newLeadButton = (
    <Button asChild className="h-10 px-4">
      <Link href={newLeadHref}>
        <Plus aria-hidden />
        New lead
      </Link>
    </Button>
  );

  const filters: ListFilter[] = [
    {
      label: "Status",
      allLabel: "All",
      value: state.filters.status,
      options: leadStatusOptions,
      onChange: (value) => {
        setFilter("status", value);
      },
    },
    {
      label: "Source",
      allLabel: "All sources",
      value: state.filters.source,
      options: leadSourceOptions,
      onChange: (value) => {
        setFilter("source", value);
      },
    },
    ...ownerFilter,
  ];

  return (
    <>
      <PageHeader
        title="Leads"
        description="Track every lead and what happens next."
        action={
          <>
            <ListActions
              importHref={canWrite ? "/import?type=leads" : undefined}
              onExport={() => exportLeads(query)}
            />
            {canWrite ? newLeadButton : null}
          </>
        }
      />

      <ListToolbar
        search={{
          value: state.search,
          placeholder: "Search by name, company or email",
          maxLength: 100,
          onChange: setSearch,
        }}
        filters={filters}
        sort={{
          value: `${state.sort}:${state.order}`,
          options: sortOptions,
          onChange: (value) => {
            const [sort, order] = value.split(":");
            setSort(sort as LeadSort, order as SortOrder);
          },
        }}
        more={
          <CustomFieldFilterButton
            fields={customFields ?? []}
            values={state.custom}
            onApply={setCustom}
          />
        }
      />
      <CustomFieldFilterChips
        fields={customFields}
        values={state.custom}
        onChange={setCustom}
        error={error}
      />

      <RecordList
        label="Leads"
        plural="leads"
        items={data?.leads ?? null}
        meta={data}
        status={status}
        error={error}
        getKey={(lead) => lead.id}
        columns={columns}
        renderCard={(lead) => <LeadCard lead={lead} />}
        rowActions={(lead) => (
          <LeadActionsMenu
            lead={lead}
            canWrite={canWrite}
            canReassign={canReassign}
            editHref={withReturnTo(`/leads/${lead.id}/edit`, currentUrl)}
            onOpen={setDialog}
          />
        )}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyDescription={
          canWrite
            ? "Add your first lead to start tracking it."
            : "Leads will show here once someone adds them."
        }
        createAction={canWrite ? newLeadButton : undefined}
        page={state.page}
        onPageChange={setPage}
        onRetry={() => void dispatch(fetchLeads(query))}
      />

      <LeadDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </>
  );
}
