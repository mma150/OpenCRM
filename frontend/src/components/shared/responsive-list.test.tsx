import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";

import { type ListColumn, ResponsiveList } from "./responsive-list";

type Lead = { id: string; name: string; owner: string; closed: boolean };

const leads: Lead[] = [
  { id: "1", name: "Northwind", owner: "Ada", closed: false },
  { id: "2", name: "Brightpath", owner: "Rob", closed: true },
];

const columns: ListColumn<Lead>[] = [
  { header: "Name", cell: (lead) => lead.name },
  { header: "Owner", cell: (lead) => lead.owner, hideBelow: "lg" },
];

function renderList(props: {
  items: Lead[] | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: ApiError;
  onRetry?: () => void;
}) {
  return render(
    <ResponsiveList
      label="Leads"
      items={props.items}
      status={props.status}
      error={props.error ?? null}
      getKey={(lead) => lead.id}
      columns={columns}
      renderCard={(lead) => <p>Card for {lead.name}</p>}
      rowActions={(lead) => <button type="button">Open {lead.name}</button>}
      isDimmed={(lead) => lead.closed}
      empty={{ title: "No leads yet", description: "Add the first one." }}
      onRetry={props.onRetry ?? vi.fn()}
    />,
  );
}

describe("ResponsiveList", () => {
  it("renders a table for wide screens and cards for phones from the same items", () => {
    renderList({ items: leads, status: "succeeded" });

    const table = screen.getByRole("table", { name: "Leads" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("Northwind")).toBeInTheDocument();
    // The table block shows from md up, the card list only below md.
    expect(table.closest("div.hidden")).toHaveClass("md:block");

    const cards = screen.getByRole("list", { name: "Leads" });
    expect(cards).toHaveClass("md:hidden");
    expect(within(cards).getAllByRole("listitem")).toHaveLength(2);
    expect(within(cards).getByText("Card for Brightpath")).toBeInTheDocument();
  });

  it("puts the row actions in both layouts and hides lg-only columns on tablets", () => {
    renderList({ items: leads, status: "succeeded" });

    expect(screen.getAllByRole("button", { name: "Open Northwind" })).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Owner" })).toHaveClass(
      "hidden",
      "lg:table-cell",
    );
  });

  it("never lets the table scroll sideways: fixed layout and clipped cells", () => {
    renderList({ items: leads, status: "succeeded" });

    expect(screen.getByRole("table", { name: "Leads" })).toHaveClass("table-fixed");
    expect(screen.getByRole("cell", { name: "Northwind" })).toHaveClass("overflow-hidden");
  });

  it("dims the rows the caller marks", () => {
    renderList({ items: leads, status: "succeeded" });

    expect(screen.getByRole("cell", { name: "Brightpath" })).toHaveClass("opacity-60");
    expect(screen.getByRole("cell", { name: "Northwind" })).not.toHaveClass("opacity-60");
  });

  it("shows skeletons while the first load is running", () => {
    renderList({ items: null, status: "loading" });

    expect(screen.getByRole("status", { name: "Loading Leads" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps showing the last items while a reload is running", () => {
    renderList({ items: leads, status: "loading" });

    expect(screen.getByRole("table", { name: "Leads" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the empty state when there is nothing to list", () => {
    renderList({ items: [], status: "succeeded" });

    expect(screen.getByText("No leads yet")).toBeInTheDocument();
    expect(screen.getByText("Add the first one.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the error in words with the request id, and retries", async () => {
    const onRetry = vi.fn();
    renderList({
      items: null,
      status: "failed",
      error: {
        code: "NETWORK_ERROR",
        message: "Could not reach the server",
        details: null,
        requestId: "req-42",
      },
      onRetry,
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The server cannot be reached.");
    expect(alert).toHaveTextContent("Request id: req-42");

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
