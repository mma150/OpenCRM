import { z } from "./openapi";

// The contract every list endpoint shares: search, sort, order, page and pageSize in the
// query string, and { page, pageSize, total } in `meta`. A module adds its own filters with
// `listQuerySchema(...).extend({ ... })`.

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// The paging half on its own, for a list with one fixed order (a timeline, the activity feed).
// Query-string values arrive as text, so the numbers are coerced before they are checked.
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export function listQuerySchema<const Sort extends [string, ...string[]]>(
  sortFields: Sort,
  defaultSort: Sort[number],
  // Newest first suits a list sorted by date; a list sorted by name passes "asc".
  defaultOrder: "asc" | "desc" = "desc",
) {
  return pageQuerySchema.extend({
    search: z.string().trim().max(100).optional(),
    sort: z.enum(sortFields).default(defaultSort),
    order: z.enum(["asc", "desc"]).default(defaultOrder),
  });
}

// `total` counts every match, not only the rows on this page.
export const listMetaSchema = z
  .object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int() })
  .openapi("ListMeta");

export type ListMeta = z.infer<typeof listMetaSchema>;

// The success envelope of a list endpoint.
export function listEnvelope<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: listMetaSchema });
}

// What a service returns for a list; the controller sends `items` as data and `total` in meta.
export interface Page<T> {
  items: T[];
  total: number;
}

// Prisma's `skip` and `take` for the requested page.
export function pageWindow(query: { page: number; pageSize: number }) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

// Prisma passes % and _ to the database as wildcards in `contains` and in a case-insensitive
// `equals`, so text from a request is escaped first: a search for "%" must find a literal
// percent sign, not every row.
export function escapeWildcards(text: string): string {
  return text.replaceAll(/[\\%_]/g, String.raw`\$&`);
}

// The words of a search box, for a service to match against its own columns with Prisma's
// `contains`.
export function searchWords(search: string | undefined): string[] {
  const words = search ? search.split(/\s+/).filter(Boolean) : [];
  return words.map((word) => escapeWildcards(word));
}
