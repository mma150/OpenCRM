import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ListPagination, pageRange } from "./list-pagination";

describe("pageRange", () => {
  it("works out the first and last record of a page", () => {
    expect(pageRange(1, 25, 64)).toEqual({ page: 1, pageCount: 3, from: 1, to: 25 });
    expect(pageRange(2, 25, 64)).toEqual({ page: 2, pageCount: 3, from: 26, to: 50 });
  });

  it("ends the last page at the total", () => {
    expect(pageRange(3, 25, 64)).toEqual({ page: 3, pageCount: 3, from: 51, to: 64 });
    expect(pageRange(2, 25, 50)).toEqual({ page: 2, pageCount: 2, from: 26, to: 50 });
  });

  it("is one page when everything fits", () => {
    expect(pageRange(1, 25, 7)).toEqual({ page: 1, pageCount: 1, from: 1, to: 7 });
    expect(pageRange(1, 25, 25)).toEqual({ page: 1, pageCount: 1, from: 1, to: 25 });
  });

  it("is an empty single page when there is nothing", () => {
    expect(pageRange(1, 25, 0)).toEqual({ page: 1, pageCount: 1, from: 0, to: 0 });
  });

  it("treats a page past the end as the last page, and below 1 as the first", () => {
    expect(pageRange(9, 25, 64)).toEqual({ page: 3, pageCount: 3, from: 51, to: 64 });
    expect(pageRange(0, 25, 64).page).toBe(1);
  });
});

describe("ListPagination", () => {
  it("says which records are shown and moves a page at a time", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<ListPagination page={2} pageSize={25} total={64} onPageChange={onPageChange} />);

    expect(screen.getByRole("navigation", { name: "Pagination" })).toHaveTextContent(
      "Showing 26–50 of 64",
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it("disables Previous on the first page and Next on the last", () => {
    const view = render(
      <ListPagination page={1} pageSize={25} total={64} onPageChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    view.rerender(<ListPagination page={3} pageSize={25} total={64} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("navigation")).toHaveTextContent("Showing 51–64 of 64");
  });

  it("disables both buttons when everything fits on one page", () => {
    render(<ListPagination page={1} pageSize={25} total={7} onPageChange={vi.fn()} />);

    expect(screen.getByRole("navigation")).toHaveTextContent("Showing 1–7 of 7");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows nothing for an empty list", () => {
    render(<ListPagination page={1} pageSize={25} total={0} onPageChange={vi.fn()} />);

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
