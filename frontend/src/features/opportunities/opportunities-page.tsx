"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { type ListFilter, ListToolbar } from "@/components/shared/list-toolbar";
import {
  type ListUrlConfig,
  type SortOrder,
  useListUrlState,
} from "@/components/shared/list-url-state";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { selectAuth } from "@/features/auth/auth.slice";
import { CompanyFilter } from "@/features/companies/company-picker";
import { ContactFilter } from "@/features/contacts/contact-picker";
import { stageOptions } from "@/features/pipeline-stages/stage-labels";
import { usePipelineStages } from "@/features/pipeline-stages/use-pipeline-stages";
import { useOwnerFilter } from "@/features/users/use-owner-filter";
import { useCurrentUrl, withReturnTo } from "@/lib/return-to";
import { useAppSelector } from "@/store/hooks";

import type {
  BoardQuery,
  OpportunityListQuery,
  OpportunitySort,
  OpportunityStatus,
} from "./opportunities.types";
import { OpportunityBoard } from "./opportunity-board";
import { type OpportunityDialog, OpportunityDialogs } from "./opportunity-dialogs";
import {
  OPPORTUNITY_STATUSES,
  opportunityAccess,
  opportunityStatusOptions,
} from "./opportunity-labels";
import { OpportunityList } from "./opportunity-list";

const PAGE_SIZE = 25;

type View = "board" | "list";
type OpportunityFilter = "stageId" | "status" | "ownerId" | "companyId" | "contactId";

// What the page keeps in the address:
//   /opportunities?search=fleet&ownerId=...                       the board
//   /opportunities?view=list&stageId=...&sort=value&order=desc    the list
// The search text and the owner are shared by the two views; the other filters, the sort and
// the page belong to the list. `view` is kept through every change (the board is the default
// and is left out).
const LIST_URL: ListUrlConfig<OpportunityFilter, OpportunitySort> = {
  // Ids accept anything.
  filters: {
    stageId: null,
    status: OPPORTUNITY_STATUSES,
    ownerId: null,
    companyId: null,
    contactId: null,
  },
  sorts: ["name", "value", "expectedCloseDate", "createdAt", "stage"],
  defaultSort: "createdAt",
  defaultOrder: "desc",
  keep: ["view"],
};

const viewOptions = [
  { value: "board", label: "Board" },
  { value: "list", label: "List" },
] as const;

const sortOptions = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "stage:asc", label: "Stage" },
  { value: "value:desc", label: "Value: highest" },
  { value: "value:asc", label: "Value: lowest" },
  { value: "expectedCloseDate:asc", label: "Closing soonest" },
  { value: "expectedCloseDate:desc", label: "Closing latest" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
];

// /opportunities: the pipeline as a board (OPP-02) or as a list (OPP-01), with a switch that
// is kept in the address.
export function OpportunitiesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: me } = useAppSelector(selectAuth);
  const { data: stages } = usePipelineStages();
  const { state, isFiltered, setSearch, setFilter, setSort, setPage, clearFilters } =
    useListUrlState(LIST_URL);
  const currentUrl = useCurrentUrl();
  const [dialog, setDialog] = useState<OpportunityDialog>(null);
  // For a user who sees more than their own opportunities.
  const ownerFilter = useOwnerFilter(state.filters.ownerId, (value) => {
    setFilter("ownerId", value);
  });
  const view: View = searchParams.get("view") === "list" ? "list" : "board";

  const boardQuery = useMemo<BoardQuery>(
    () => ({
      ...(state.search ? { search: state.search } : {}),
      ...(state.filters.ownerId ? { ownerId: state.filters.ownerId } : {}),
    }),
    [state.search, state.filters.ownerId],
  );
  const listQuery = useMemo<OpportunityListQuery>(
    () => ({
      ...(state.search ? { search: state.search } : {}),
      ...(state.filters.stageId ? { stageId: state.filters.stageId } : {}),
      ...(state.filters.status ? { status: state.filters.status as OpportunityStatus } : {}),
      ...(state.filters.ownerId ? { ownerId: state.filters.ownerId } : {}),
      ...(state.filters.companyId ? { companyId: state.filters.companyId } : {}),
      ...(state.filters.contactId ? { contactId: state.filters.contactId } : {}),
      sort: state.sort,
      order: state.order,
      page: state.page,
      pageSize: PAGE_SIZE,
    }),
    [state],
  );

  if (!me) {
    return null;
  }
  const { canWrite, canReassign } = opportunityAccess(me.role);

  // Changing the view keeps what both views understand (the search text and the owner) and
  // drops the rest, so the board is never narrowed by a filter it cannot show.
  function changeView(next: View) {
    const params = new URLSearchParams();
    if (next === "list") {
      params.set("view", "list");
    }
    if (state.search) {
      params.set("search", state.search);
    }
    if (state.filters.ownerId) {
      params.set("ownerId", state.filters.ownerId);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const boardIsFiltered = state.search !== "" || state.filters.ownerId !== "";
  const narrowed = view === "list" ? isFiltered || state.page > 1 : boardIsFiltered;
  const newHref =
    narrowed || view === "list"
      ? withReturnTo("/opportunities/new", currentUrl)
      : "/opportunities/new";
  const newButton = (
    <Button asChild className="h-10 px-4">
      <Link href={newHref}>
        <Plus aria-hidden />
        New opportunity
      </Link>
    </Button>
  );

  const listFilters: ListFilter[] = [
    {
      label: "Stage",
      allLabel: "All stages",
      value: state.filters.stageId,
      options: stageOptions(stages ?? []),
      onChange: (value) => {
        setFilter("stageId", value);
      },
    },
    {
      label: "Status",
      allLabel: "All",
      value: state.filters.status,
      options: opportunityStatusOptions,
      onChange: (value) => {
        setFilter("status", value);
      },
    },
    ...ownerFilter,
  ];

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Every deal in your pipeline, and the stage it has reached."
        action={canWrite ? newButton : undefined}
      />

      <SegmentedControl
        label="View"
        className="self-start max-sm:self-stretch"
        value={view}
        options={viewOptions}
        onChange={changeView}
      />

      <ListToolbar
        search={{
          value: state.search,
          placeholder: "Search by name, company or contact",
          maxLength: 100,
          onChange: setSearch,
        }}
        // A company or a contact is searched for, not picked from a select: there can be
        // thousands. The Contact filter shows only when a link set it (a contact's page).
        extra={
          view === "list" ? (
            <>
              <CompanyFilter
                of="opportunities"
                companyId={state.filters.companyId}
                onChange={(companyId) => {
                  setFilter("companyId", companyId);
                }}
              />
              {state.filters.contactId ? (
                <ContactFilter
                  of="opportunities"
                  contactId={state.filters.contactId}
                  onChange={(contactId) => {
                    setFilter("contactId", contactId);
                  }}
                />
              ) : null}
            </>
          ) : undefined
        }
        filters={view === "list" ? listFilters : ownerFilter}
        sort={
          view === "list"
            ? {
                value: `${state.sort}:${state.order}`,
                options: sortOptions,
                onChange: (value) => {
                  const [sort, order] = value.split(":");
                  setSort(sort as OpportunitySort, order as SortOrder);
                },
              }
            : undefined
        }
      />

      {view === "list" ? (
        <OpportunityList
          query={listQuery}
          canWrite={canWrite}
          canReassign={canReassign}
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
          createAction={canWrite ? newButton : undefined}
          page={state.page}
          onPageChange={setPage}
          onOpen={setDialog}
        />
      ) : (
        <OpportunityBoard
          query={boardQuery}
          canWrite={canWrite}
          isFiltered={boardIsFiltered}
          onClearFilters={clearFilters}
          createAction={canWrite ? newButton : undefined}
          onOpen={setDialog}
        />
      )}

      <OpportunityDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </>
  );
}
