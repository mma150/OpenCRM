"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { selectAuth } from "@/features/auth/auth.slice";
import { useOwnerFilter } from "@/features/users/use-owner-filter";
import { recordAccess } from "@/lib/record-access";
import { useCurrentUrl, withReturnTo } from "@/lib/return-to";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
  fetchCompanies,
  fetchIndustries,
  selectCompanyList,
  selectIndustries,
} from "./companies.slice";
import type { Company, CompanyListQuery, CompanySort } from "./companies.types";
import { type CompanyDialog, CompanyDialogs } from "./company-dialogs";
import { contactCountLabel } from "./company-labels";
import { WebsiteLink } from "./company-website";

const PAGE_SIZE = 25;

type CompanyFilter = "industry" | "ownerId";

// What the list keeps in the address: /companies?search=north&industry=Logistics&sort=createdAt&order=desc&page=2
const LIST_URL: ListUrlConfig<CompanyFilter, CompanySort> = {
  // An industry is free text and an owner is an id, so both accept anything.
  filters: { industry: null, ownerId: null },
  sorts: ["name", "industry", "createdAt", "updatedAt"],
  defaultSort: "name",
  defaultOrder: "asc",
};

const sortOptions = [
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "industry:asc", label: "Industry A–Z" },
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "updatedAt:desc", label: "Recently updated" },
];

const nameLinkClass =
  "hover:text-primary focus-visible:ring-ring/50 rounded-sm font-medium outline-none focus-visible:ring-3";

function NameCell({ company }: { company: Company }) {
  return (
    <div className="min-w-0">
      <Link href={`/companies/${company.id}`} className={`${nameLinkClass} block truncate`}>
        {company.name}
      </Link>
      {company.website ? (
        <p className="truncate text-xs">
          <WebsiteLink website={company.website} />
        </p>
      ) : null}
    </div>
  );
}

function IndustryBadge({ industry }: { industry: string }) {
  return (
    <Badge variant="secondary" className="max-w-full">
      <span className="truncate">{industry}</span>
    </Badge>
  );
}

// The same company as a stacked card, for phones.
function CompanyCard({ company }: { company: Company }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={`/companies/${company.id}`} className={`${nameLinkClass} wrap-anywhere`}>
          {company.name}
        </Link>
        {company.website ? (
          <p className="text-sm">
            <WebsiteLink website={company.website} />
          </p>
        ) : null}
      </div>
      {company.industry ? (
        <div className="flex min-w-0">
          <IndustryBadge industry={company.industry} />
        </div>
      ) : null}
      <div className="text-muted-foreground flex items-center justify-between gap-3 border-t pt-3 text-xs">
        <span className="text-foreground min-w-0 truncate font-medium">{company.owner.name}</span>
        <span className="shrink-0">{contactCountLabel(company.contactCount)}</span>
      </div>
    </div>
  );
}

const columns: ListColumn<Company>[] = [
  { header: "Company", cell: (company) => <NameCell company={company} /> },
  {
    header: "Industry",
    className: "w-1/4",
    cell: (company) =>
      company.industry ? (
        <IndustryBadge industry={company.industry} />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    header: "Contacts",
    className: "w-28",
    cell: (company) => (
      <span className={company.contactCount === 0 ? "text-muted-foreground" : undefined}>
        {contactCountLabel(company.contactCount)}
      </span>
    ),
  },
  {
    header: "Owner",
    className: "w-36",
    cell: (company) => <p className="truncate">{company.owner.name}</p>,
  },
];

// /companies: every company the signed-in user may see, with search, filters, sorting and
// paging kept in the address (CONT-02, CONT-04).
export function CompaniesPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data, status, error } = useAppSelector(selectCompanyList);
  const { data: industries } = useAppSelector(selectIndustries);
  const { state, isFiltered, setSearch, setFilter, setSort, setPage, clearFilters } =
    useListUrlState(LIST_URL);
  const currentUrl = useCurrentUrl();
  const [dialog, setDialog] = useState<CompanyDialog>(null);
  // For a user who sees more than their own companies.
  const ownerFilter = useOwnerFilter(state.filters.ownerId, (value) => {
    setFilter("ownerId", value);
  });

  const query = useMemo<CompanyListQuery>(
    () => ({
      ...(state.search ? { search: state.search } : {}),
      ...(state.filters.industry ? { industry: state.filters.industry } : {}),
      ...(state.filters.ownerId ? { ownerId: state.filters.ownerId } : {}),
      sort: state.sort,
      order: state.order,
      page: state.page,
      pageSize: PAGE_SIZE,
    }),
    [state],
  );

  useEffect(() => {
    void dispatch(fetchCompanies(query));
  }, [dispatch, query]);

  useEffect(() => {
    void dispatch(fetchIndustries());
  }, [dispatch]);

  if (!me) {
    return null;
  }
  const { canWrite, canReassign } = recordAccess(me.role);
  const newCompanyHref =
    isFiltered || state.page > 1 ? withReturnTo("/companies/new", currentUrl) : "/companies/new";
  const newCompanyButton = (
    <Button asChild className="h-10 px-4">
      <Link href={newCompanyHref}>
        <Plus aria-hidden />
        New company
      </Link>
    </Button>
  );

  // The Industry filter offers the industries in use. One that is in the address but no
  // longer in use is still listed, so the control can show what the list is filtered by.
  const industryOptions = [
    ...new Set([
      ...(industries ?? []),
      ...(state.filters.industry ? [state.filters.industry] : []),
    ]),
  ].map((industry) => ({ value: industry, label: industry }));
  const filters: ListFilter[] = [
    ...(industryOptions.length > 0
      ? [
          {
            label: "Industry",
            allLabel: "All",
            value: state.filters.industry,
            options: industryOptions,
            onChange: (value: string) => {
              setFilter("industry", value);
            },
          },
        ]
      : []),
    ...ownerFilter,
  ];

  return (
    <>
      <PageHeader
        title="Companies"
        description="The organisations you sell to, and who works there."
        action={canWrite ? newCompanyButton : undefined}
      />

      <ListToolbar
        search={{
          value: state.search,
          placeholder: "Search by name, website or industry",
          maxLength: 100,
          onChange: setSearch,
        }}
        filters={filters}
        sort={{
          value: `${state.sort}:${state.order}`,
          options: sortOptions,
          onChange: (value) => {
            const [sort, order] = value.split(":");
            setSort(sort as CompanySort, order as SortOrder);
          },
        }}
      />

      <RecordList
        label="Companies"
        plural="companies"
        items={data?.companies ?? null}
        meta={data}
        status={status}
        error={error}
        getKey={(company) => company.id}
        columns={columns}
        renderCard={(company) => <CompanyCard company={company} />}
        rowActions={(company) => (
          <RecordRowMenu
            name={company.name}
            viewHref={`/companies/${company.id}`}
            editHref={
              canWrite ? withReturnTo(`/companies/${company.id}/edit`, currentUrl) : undefined
            }
            onReassign={
              canReassign
                ? () => {
                    setDialog({ kind: "reassign", company });
                  }
                : undefined
            }
            onDelete={
              canWrite
                ? () => {
                    setDialog({ kind: "delete", company });
                  }
                : undefined
            }
          />
        )}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyDescription={
          canWrite
            ? "Add your first company, then link its contacts to it."
            : "Companies will show here once someone adds them."
        }
        createAction={canWrite ? newCompanyButton : undefined}
        page={state.page}
        onPageChange={setPage}
        onRetry={() => void dispatch(fetchCompanies(query))}
      />

      <CompanyDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </>
  );
}
