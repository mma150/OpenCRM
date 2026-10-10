import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiError } from "@/lib/api/http";
import { cn } from "@/lib/utils";

import { PageError, PageState } from "./page-state";

export type ListColumn<Item> = {
  header: string;
  cell: (item: Item) => ReactNode;
  // Tailwind width class for the column, such as "w-40". Columns without one share the rest.
  className?: string;
  // Drop the column where the table is narrower: "lg" on tablets, "xl" also on a small laptop.
  hideBelow?: "lg" | "xl";
};

type ResponsiveListProps<Item> = {
  // What the list holds, for screen readers: "Users".
  label: string;
  // The slice's three keys: items (null until first loaded), status and error.
  items: Item[] | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: ApiError | null;
  getKey: (item: Item) => string;
  columns: ListColumn<Item>[];
  // The same item as a stacked card, for phones.
  renderCard: (item: Item) => ReactNode;
  // The actions menu: the last table cell, and the top right corner of the card.
  rowActions?: (item: Item) => ReactNode;
  // Rows shown dimmed, such as deactivated users.
  isDimmed?: (item: Item) => boolean;
  empty: { title: string; description?: string; action?: ReactNode };
  onRetry: () => void;
};

const SKELETON_ROWS = [0, 1, 2, 3];

// The one list pattern (D-16): a table from `md` up, stacked cards below, and the same
// loading, empty and error states at every width. The table has a fixed layout and its
// cells clip, so it can never scroll sideways: long text must truncate inside the cell.
export function ResponsiveList<Item>({
  label,
  items,
  status,
  error,
  getKey,
  columns,
  renderCard,
  rowActions,
  isDimmed,
  empty,
  onRetry,
}: ResponsiveListProps<Item>) {
  if (items === null) {
    if (status === "failed" && error) {
      return <PageError error={error} onRetry={onRetry} />;
    }
    return <ListSkeleton label={label} />;
  }

  if (items.length === 0) {
    return <PageState title={empty.title} description={empty.description} action={empty.action} />;
  }

  const hidden = (column: ListColumn<Item>) => {
    switch (column.hideBelow) {
      case "lg":
        return "hidden lg:table-cell";
      case "xl":
        return "hidden xl:table-cell";
      default:
        return undefined;
    }
  };

  // Only one of the two blocks is displayed at a time; `hidden` also removes the other
  // from the accessibility tree.
  return (
    <>
      <div className="bg-card hidden overflow-hidden rounded-lg border md:block">
        <Table aria-label={label} className="table-fixed">
          <TableHeader className="bg-muted/50">
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.header}
                  className={cn(
                    "text-muted-foreground px-4 text-xs font-medium tracking-wide uppercase",
                    column.className,
                    hidden(column),
                  )}
                >
                  {column.header}
                </TableHead>
              ))}
              {rowActions ? (
                <TableHead className="w-14 px-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={getKey(item)}>
                {columns.map((column) => (
                  <TableCell
                    key={column.header}
                    className={cn(
                      "overflow-hidden px-4 py-3",
                      isDimmed?.(item) && "opacity-60",
                      hidden(column),
                    )}
                  >
                    {column.cell(item)}
                  </TableCell>
                ))}
                {rowActions ? (
                  <TableCell className="px-4 py-3 text-right">{rowActions(item)}</TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label={label} className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={getKey(item)} className="bg-card flex items-start gap-2 rounded-lg border p-4">
            <div className={cn("min-w-0 flex-1", isDimmed?.(item) && "opacity-60")}>
              {renderCard(item)}
            </div>
            {rowActions ? <div className="-mt-1 -mr-2 shrink-0">{rowActions(item)}</div> : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={`Loading ${label}`} className="flex flex-col gap-3">
      {SKELETON_ROWS.map((row) => (
        <div key={row} className="bg-card flex flex-col gap-2 rounded-lg border p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
