import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";

import {
  type ListUrlConfig,
  readListState,
  useListUrlState,
  writeListState,
} from "./list-url-state";

const config: ListUrlConfig<"status" | "ownerId", "name" | "createdAt"> = {
  filters: { status: ["NEW", "LOST"], ownerId: null },
  sorts: ["name", "createdAt"],
  defaultSort: "createdAt",
  defaultOrder: "desc",
};

const defaults = {
  search: "",
  filters: { status: "", ownerId: "" },
  sort: "createdAt",
  order: "desc",
  page: 1,
};

describe("readListState", () => {
  it("gives the defaults for an empty query string", () => {
    expect(readListState(new URLSearchParams(), config)).toEqual(defaults);
  });

  it("reads search, filters, sort and page", () => {
    const params = new URLSearchParams(
      "search=acme&status=LOST&ownerId=u1&sort=name&order=asc&page=3",
    );

    expect(readListState(params, config)).toEqual({
      search: "acme",
      filters: { status: "LOST", ownerId: "u1" },
      sort: "name",
      order: "asc",
      page: 3,
    });
  });

  it("falls back to the default for anything a hand-edited address gets wrong", () => {
    const params = new URLSearchParams("status=NOPE&sort=price&order=asc&page=-2");

    expect(readListState(params, config)).toEqual(defaults);
    expect(readListState(new URLSearchParams("page=abc"), config).page).toBe(1);
    expect(readListState(new URLSearchParams("page=1.5"), config).page).toBe(1);
  });
});

describe("writeListState", () => {
  it("leaves the defaults out, so the plain address is the plain list", () => {
    expect(writeListState(readListState(new URLSearchParams(), config), config)).toBe("");
  });

  it("round-trips a full state", () => {
    const query = "search=acme+corp&status=NEW&ownerId=u1&sort=name&order=asc&page=2";

    expect(writeListState(readListState(new URLSearchParams(query), config), config)).toBe(query);
  });
});

function Harness() {
  const list = useListUrlState(config);
  return (
    <div>
      <output>{JSON.stringify({ ...list.state, isFiltered: list.isFiltered })}</output>
      <button
        type="button"
        onClick={() => {
          list.setSearch("  acme ");
        }}
      >
        search
      </button>
      <button
        type="button"
        onClick={() => {
          list.setFilter("status", "NEW");
        }}
      >
        filter
      </button>
      <button
        type="button"
        onClick={() => {
          list.setFilters({ status: "LOST", ownerId: "abc" });
        }}
      >
        filters
      </button>
      <button
        type="button"
        onClick={() => {
          list.setSort("name", "asc");
        }}
      >
        sort
      </button>
      <button
        type="button"
        onClick={() => {
          list.setPage(4);
        }}
      >
        page
      </button>
      <button type="button" onClick={list.clearFilters}>
        clear
      </button>
    </div>
  );
}

function shown() {
  return JSON.parse(screen.getByRole("status").textContent) as typeof defaults & {
    isFiltered: boolean;
  };
}

describe("useListUrlState", () => {
  it("reads the state from the address, so a reloaded or shared link shows the same list", () => {
    setMockLocation("/leads", "status=LOST&page=2");
    render(<Harness />);

    expect(shown()).toMatchObject({ filters: { status: "LOST", ownerId: "" }, page: 2 });
    expect(shown().isFiltered).toBe(true);
  });

  it("writes each change to the address by replacing it, without scrolling", async () => {
    setMockLocation("/leads");
    followNavigation();
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "search" }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads?search=acme", { scroll: false });
    expect(shown().search).toBe("acme");

    await user.click(screen.getByRole("button", { name: "filter" }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads?search=acme&status=NEW", {
      scroll: false,
    });

    await user.click(screen.getByRole("button", { name: "sort" }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      "/leads?search=acme&status=NEW&sort=name&order=asc",
      { scroll: false },
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("goes back to page 1 when the search, a filter or the sort changes", async () => {
    setMockLocation("/leads", "page=3");
    followNavigation();
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "page" }));
    expect(shown().page).toBe(4);

    await user.click(screen.getByRole("button", { name: "filter" }));
    expect(shown().page).toBe(1);
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads?status=NEW", { scroll: false });
  });

  it("changes several filters in one step, keeping the others", async () => {
    setMockLocation("/leads", "search=acme&status=NEW&page=3");
    followNavigation();
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "filters" }));

    expect(shown()).toMatchObject({
      search: "acme",
      filters: { status: "LOST", ownerId: "abc" },
      page: 1,
    });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it("clears the search and the filters but keeps the sort", async () => {
    setMockLocation("/leads", "search=acme&status=NEW&ownerId=u1&sort=name&order=asc&page=2");
    followNavigation();
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "clear" }));

    expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads?sort=name&order=asc", {
      scroll: false,
    });
    expect(shown().isFiltered).toBe(false);
  });

  it("does not count the sort or the page as a filter", () => {
    setMockLocation("/leads", "sort=name&order=asc&page=2");
    render(<Harness />);

    expect(shown().isFiltered).toBe(false);
  });
});
