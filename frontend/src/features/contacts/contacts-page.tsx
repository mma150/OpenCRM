"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
import { selectAuth } from "@/features/auth/auth.slice";
import { CompanyFilter } from "@/features/companies/company-picker";
import { useOwnerFilter } from "@/features/users/use-owner-filter";
import { formatRelativeDate } from "@/lib/format";
import { recordAccess } from "@/lib/record-access";
import { useCurrentUrl, withReturnTo } from "@/lib/return-to";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { type ContactDialog, ContactDialogs } from "./contact-dialogs";
import { fetchContacts, selectContactList } from "./contacts.slice";
import type { Contact, ContactListQuery, ContactSort } from "./contacts.types";

const PAGE_SIZE = 25;

type ContactFilter = "companyId" | "ownerId";

// What the list keeps in the address: /contacts?search=chen&companyId=...&sort=lastContactAt&order=desc&page=2
const LIST_URL: ListUrlConfig<ContactFilter, ContactSort> = {
  // Both filters are ids, so they accept anything.
  filters: { companyId: null, ownerId: null },
  sorts: ["name", "company", "createdAt", "updatedAt", "lastContactAt"],
  defaultSort: "name",
  defaultOrder: "asc",
};

const sortOptions = [
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "company:asc", label: "Company A–Z" },
  { value: "lastContactAt:desc", label: "Last contact: newest" },
  { value: "lastContactAt:asc", label: "Last contact: oldest" },
  { value: "createdAt:desc", label: "Newest first" },
  { value: "updatedAt:desc", label: "Recently updated" },
];

const linkClass =
  "hover:text-primary focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-3";

function Missing() {
  return <span className="text-muted-foreground">—</span>;
}

function NameCell({ contact }: { contact: Contact }) {
  return (
    <div className="min-w-0">
      <Link href={`/contacts/${contact.id}`} className={`${linkClass} block truncate font-medium`}>
        {contact.name}
      </Link>
      {contact.jobTitle ? (
        <p className="text-muted-foreground truncate text-xs">{contact.jobTitle}</p>
      ) : null}
    </div>
  );
}

// "Today", "3 days ago", "Oct 5, 2026", or "Never" for a contact nobody has spoken to yet.
function lastContact(contact: Contact): string {
  return contact.lastContactAt ? formatRelativeDate(contact.lastContactAt) : "Never";
}

// The same contact as a stacked card, for phones.
function ContactCard({ contact }: { contact: Contact }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/contacts/${contact.id}`}
          className={`${linkClass} self-start font-medium wrap-anywhere`}
        >
          {contact.name}
        </Link>
        {contact.jobTitle ? (
          <p className="text-muted-foreground text-sm wrap-anywhere">{contact.jobTitle}</p>
        ) : null}
        {contact.company ? (
          <Link
            href={`/companies/${contact.company.id}`}
            className={`${linkClass} text-primary self-start text-sm wrap-anywhere`}
          >
            {contact.company.name}
          </Link>
        ) : null}
      </div>
      {contact.email || contact.phone ? (
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className={`${linkClass} self-start wrap-anywhere`}>
              {contact.email}
            </a>
          ) : null}
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className={`${linkClass} self-start wrap-anywhere`}>
              {contact.phone}
            </a>
          ) : null}
        </div>
      ) : null}
      <div className="text-muted-foreground flex items-center justify-between gap-3 border-t pt-3 text-xs">
        <span className="text-foreground min-w-0 truncate font-medium">{contact.owner.name}</span>
        <span className="shrink-0">
          Last contact: <span className="text-foreground font-medium">{lastContact(contact)}</span>
        </span>
      </div>
    </div>
  );
}

const columns: ListColumn<Contact>[] = [
  { header: "Name", cell: (contact) => <NameCell contact={contact} /> },
  {
    header: "Company",
    cell: (contact) =>
      contact.company ? (
        <Link
          href={`/companies/${contact.company.id}`}
          className={`${linkClass} text-primary block truncate`}
        >
          {contact.company.name}
        </Link>
      ) : (
        <Missing />
      ),
  },
  {
    header: "Email",
    hideBelow: "xl",
    cell: (contact) =>
      contact.email ? (
        <a href={`mailto:${contact.email}`} className={`${linkClass} block truncate`}>
          {contact.email}
        </a>
      ) : (
        <Missing />
      ),
  },
  {
    header: "Phone",
    className: "w-36",
    hideBelow: "xl",
    cell: (contact) =>
      contact.phone ? (
        <a href={`tel:${contact.phone}`} className={`${linkClass} block truncate`}>
          {contact.phone}
        </a>
      ) : (
        <Missing />
      ),
  },
  {
    header: "Owner",
    className: "w-32",
    cell: (contact) => <p className="truncate">{contact.owner.name}</p>,
  },
  {
    header: "Last contact",
    className: "w-32",
    hideBelow: "lg",
    cell: (contact) => (
      <span className={contact.lastContactAt ? undefined : "text-muted-foreground"}>
        {lastContact(contact)}
      </span>
    ),
  },
];

// /contacts: every contact the signed-in user may see, with search, filters, sorting and
// paging kept in the address (CONT-01, CONT-04).
export function ContactsPage() {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const { data, status, error } = useAppSelector(selectContactList);
  const { state, isFiltered, setSearch, setFilter, setSort, setPage, clearFilters } =
    useListUrlState(LIST_URL);
  const currentUrl = useCurrentUrl();
  const [dialog, setDialog] = useState<ContactDialog>(null);
  // For a user who sees more than their own contacts.
  const ownerFilter = useOwnerFilter(state.filters.ownerId, (value) => {
    setFilter("ownerId", value);
  });

  const query = useMemo<ContactListQuery>(
    () => ({
      ...(state.search ? { search: state.search } : {}),
      ...(state.filters.companyId ? { companyId: state.filters.companyId } : {}),
      ...(state.filters.ownerId ? { ownerId: state.filters.ownerId } : {}),
      sort: state.sort,
      order: state.order,
      page: state.page,
      pageSize: PAGE_SIZE,
    }),
    [state],
  );

  useEffect(() => {
    void dispatch(fetchContacts(query));
  }, [dispatch, query]);

  if (!me) {
    return null;
  }
  const { canWrite, canReassign } = recordAccess(me.role);
  const newContactHref =
    isFiltered || state.page > 1 ? withReturnTo("/contacts/new", currentUrl) : "/contacts/new";
  const newContactButton = (
    <Button asChild className="h-10 px-4">
      <Link href={newContactHref}>
        <Plus aria-hidden />
        New contact
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Contacts"
        description="The people you deal with, and when you last spoke."
        action={canWrite ? newContactButton : undefined}
      />

      <ListToolbar
        search={{
          value: state.search,
          placeholder: "Search by name, email or company",
          maxLength: 100,
          onChange: setSearch,
        }}
        // A company is searched for, not picked from a select: there can be thousands.
        extra={
          <CompanyFilter
            companyId={state.filters.companyId}
            onChange={(companyId) => {
              setFilter("companyId", companyId);
            }}
          />
        }
        filters={ownerFilter}
        sort={{
          value: `${state.sort}:${state.order}`,
          options: sortOptions,
          onChange: (value) => {
            const [sort, order] = value.split(":");
            setSort(sort as ContactSort, order as SortOrder);
          },
        }}
      />

      <RecordList
        label="Contacts"
        plural="contacts"
        items={data?.contacts ?? null}
        meta={data}
        status={status}
        error={error}
        getKey={(contact) => contact.id}
        columns={columns}
        renderCard={(contact) => <ContactCard contact={contact} />}
        rowActions={(contact) => (
          <RecordRowMenu
            name={contact.name}
            viewHref={`/contacts/${contact.id}`}
            editHref={
              canWrite ? withReturnTo(`/contacts/${contact.id}/edit`, currentUrl) : undefined
            }
            onReassign={
              canReassign
                ? () => {
                    setDialog({ kind: "reassign", contact });
                  }
                : undefined
            }
            onDelete={
              canWrite
                ? () => {
                    setDialog({ kind: "delete", contact });
                  }
                : undefined
            }
          />
        )}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyDescription={
          canWrite
            ? "Add your first contact to keep track of your conversations."
            : "Contacts will show here once someone adds them."
        }
        createAction={canWrite ? newContactButton : undefined}
        page={state.page}
        onPageChange={setPage}
        onRetry={() => void dispatch(fetchContacts(query))}
      />

      <ContactDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </>
  );
}
