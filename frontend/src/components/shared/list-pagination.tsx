import { Button } from "@/components/ui/button";

// Which records a page shows: "Showing 26–50 of 64" is { from: 26, to: 50 }.
// A page past the end is treated as the last page.
export function pageRange(
  page: number,
  pageSize: number,
  total: number,
): { page: number; pageCount: number; from: number; to: number } {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    page: current,
    pageCount,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
  };
}

// The row under every list: "Showing X–Y of Z" with Previous and Next.
// It takes the `meta` of the list response; nothing is shown for an empty list.
export function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) {
    return null;
  }
  const range = pageRange(page, pageSize, total);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        Showing{" "}
        <span className="text-foreground font-medium">
          {range.from}–{range.to}
        </span>{" "}
        of <span className="text-foreground font-medium">{total}</span>
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={range.page <= 1}
          onClick={() => {
            onPageChange(range.page - 1);
          }}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={range.page >= range.pageCount}
          onClick={() => {
            onPageChange(range.page + 1);
          }}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
