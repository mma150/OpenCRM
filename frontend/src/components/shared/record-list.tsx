"use client";

import { type ReactNode, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";

import { FormAlert } from "./form-alert";
import { ListPagination, pageRange } from "./list-pagination";
import { type ListColumn, ResponsiveList } from "./responsive-list";

// Everything under the toolbar of a list page with search, filters and paging (leads,
// contacts, companies): the table and cards, the two empty states, the note that a failed
// reload left the last page on screen, and the paging row. The page keeps what is its own:
// the header, the toolbar, the columns and the row menu.
//
//   <RecordList label="Leads" plural="leads" items={data?.leads ?? null} meta={data}
//     status={status} error={error} columns={columns} ... />
export function RecordList<Item>({
  label,
  plural,
  items,
  meta,
  status,
  error,
  getKey,
  columns,
  renderCard,
  rowActions,
  isFiltered,
  onClearFilters,
  emptyDescription,
  createAction,
  page,
  onPageChange,
  onRetry,
}: {
  // What the list holds, for screen readers and the empty states: "Leads" and "leads".
  label: string;
  plural: string;
  // The slice's list: the records (null until first loaded), the `meta` of the response,
  // and the usual status and error.
  items: Item[] | null;
  meta: { page: number; pageSize: number; total: number } | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
  getKey: (item: Item) => string;
  columns: ListColumn<Item>[];
  renderCard: (item: Item) => ReactNode;
  rowActions: (item: Item) => ReactNode;
  // From `useListUrlState`: whether the search box or a filter narrows the list.
  isFiltered: boolean;
  onClearFilters: () => void;
  // "No leads yet" is followed by this sentence and, for a user who may create one, the button.
  emptyDescription: string;
  createAction?: ReactNode;
  // The page in the address, and how to change it.
  page: number;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}) {
  // A page past the end (the last record on it was deleted, or the address was edited) goes
  // to the last page that exists.
  const pastTheEnd =
    status === "succeeded" && items !== null && items.length === 0 && (meta?.total ?? 0) > 0;
  const lastPage = meta ? pageRange(meta.page, meta.pageSize, meta.total).pageCount : 1;
  useEffect(() => {
    if (pastTheEnd && page > lastPage) {
      onPageChange(lastPage);
    }
  }, [pastTheEnd, page, lastPage, onPageChange]);

  return (
    <>
      {/* A failed reload keeps the last page on screen, so say that it is out of date. */}
      {items && status === "failed" && error ? (
        <FormAlert message={describeApiError(error)} />
      ) : null}

      <ResponsiveList
        label={label}
        items={items}
        status={status}
        error={error}
        getKey={getKey}
        columns={columns}
        renderCard={renderCard}
        rowActions={rowActions}
        empty={
          isFiltered
            ? {
                title: `No ${plural} match your filters`,
                description: "Try a different search or remove a filter.",
                action: (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-4"
                    onClick={onClearFilters}
                  >
                    Clear filters
                  </Button>
                ),
              }
            : { title: `No ${plural} yet`, description: emptyDescription, action: createAction }
        }
        onRetry={onRetry}
      />

      {meta ? (
        <ListPagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          onPageChange={onPageChange}
        />
      ) : null}
    </>
  );
}
