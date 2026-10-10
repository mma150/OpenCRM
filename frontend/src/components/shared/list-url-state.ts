"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

export type SortOrder = "asc" | "desc";

// What a list keeps in the query string. Declare it once per list, as a constant outside
// the component, so the hook sees the same object on every render.
export type ListUrlConfig<Filter extends string, Sort extends string> = {
  // Each filter and the values it accepts, or null when any value is allowed (an id).
  filters: Record<Filter, readonly string[] | null>;
  sorts: readonly Sort[];
  defaultSort: Sort;
  defaultOrder: SortOrder;
  // Other parameters of the page that every change leaves as they are (the Board / List
  // switch of the opportunities page, `view`). They are not part of the list state.
  keep?: readonly string[];
};

// "" means "not set" for the search box and for every filter.
export type ListUrlState<Filter extends string, Sort extends string> = {
  search: string;
  filters: Record<Filter, string>;
  sort: Sort;
  order: SortOrder;
  page: number;
};

// Reads the list state from a query string. Anything missing or not allowed (an unknown
// status, page "abc") falls back to its default, so a hand-edited address cannot break a list.
export function readListState<Filter extends string, Sort extends string>(
  params: URLSearchParams,
  config: ListUrlConfig<Filter, Sort>,
): ListUrlState<Filter, Sort> {
  const filters = {} as Record<Filter, string>;
  for (const name of Object.keys(config.filters) as Filter[]) {
    const value = params.get(name) ?? "";
    const allowed = config.filters[name];
    filters[name] = allowed === null || allowed.includes(value) ? value : "";
  }

  const sort = config.sorts.find((candidate) => candidate === params.get("sort"));
  const order = params.get("order");
  const page = Number(params.get("page"));

  return {
    search: (params.get("search") ?? "").trim(),
    filters,
    sort: sort ?? config.defaultSort,
    // An order without a sort means nothing, so the pair falls back together.
    order: sort && (order === "asc" || order === "desc") ? order : config.defaultOrder,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

// The query string for a list state (without the "?"). Defaults are left out, so the
// plain address is the plain list.
export function writeListState<Filter extends string, Sort extends string>(
  state: ListUrlState<Filter, Sort>,
  config: ListUrlConfig<Filter, Sort>,
): string {
  const params = new URLSearchParams();
  if (state.search) {
    params.set("search", state.search);
  }
  for (const name of Object.keys(config.filters) as Filter[]) {
    if (state.filters[name]) {
      params.set(name, state.filters[name]);
    }
  }
  if (state.sort !== config.defaultSort || state.order !== config.defaultOrder) {
    params.set("sort", state.sort);
    params.set("order", state.order);
  }
  if (state.page > 1) {
    params.set("page", String(state.page));
  }
  return params.toString();
}

// URL-synced list state: the search text, filters, sort and page live in the query string,
// so a list view can be reloaded, shared as a link and returned to with Back.
// The address is replaced, not pushed: typing in the search box does not fill the history.
export function useListUrlState<Filter extends string, Sort extends string>(
  config: ListUrlConfig<Filter, Sort>,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => readListState(searchParams, config), [searchParams, config]);

  return useMemo(() => {
    const go = (next: ListUrlState<Filter, Sort>) => {
      const params = new URLSearchParams(writeListState(next, config));
      for (const name of config.keep ?? []) {
        const value = searchParams.get(name);
        if (value) {
          params.set(name, value);
        }
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };
    const noFilters = Object.fromEntries(
      Object.keys(config.filters).map((name) => [name, ""]),
    ) as Record<Filter, string>;

    return {
      state,
      // True when the search box or any filter narrows the list (sort and page do not).
      isFiltered: state.search !== "" || Object.values(state.filters).some((value) => value !== ""),
      // Every change except the page itself goes back to page 1.
      setSearch: (search: string) => {
        go({ ...state, search: search.trim(), page: 1 });
      },
      setFilter: (name: Filter, value: string) => {
        go({ ...state, filters: { ...state.filters, [name]: value }, page: 1 });
      },
      // Several filters in one step, for controls that belong together (a date range).
      // Two `setFilter` calls in a row would each start from the same address, and the
      // second would undo the first.
      setFilters: (changes: Partial<Record<Filter, string>>) => {
        go({ ...state, filters: { ...state.filters, ...changes }, page: 1 });
      },
      setSort: (sort: Sort, order: SortOrder) => {
        go({ ...state, sort, order, page: 1 });
      },
      setPage: (page: number) => {
        go({ ...state, page });
      },
      // Clears the search box and the filters; the sort order stays.
      clearFilters: () => {
        go({ ...state, search: "", filters: noFilters, page: 1 });
      },
    };
  }, [state, config, router, pathname, searchParams]);
}
