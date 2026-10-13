import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fleet, vision } from "@/features/opportunities/opportunities.fixtures";
import type { ApiError } from "@/lib/api/http";

import { OpportunityQuotes } from "./opportunity-quotes";
import { listQuotes } from "./quotes.api";
import { draft, expired, invoiced, quoteList } from "./quotes.fixtures";

vi.mock("./quotes.api");

const cardQuery = {
  opportunityId: fleet.id,
  sort: "createdAt",
  order: "desc",
  page: 1,
  pageSize: 10,
};

describe("OpportunityQuotes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listQuotes).mockResolvedValue(quoteList([invoiced, expired, draft]));
  });

  it("lists the opportunity's quotes with status, total, valid until and the invoice", async () => {
    render(<OpportunityQuotes opportunityId={fleet.id} canWrite />);

    expect(screen.getByRole("status", { name: "Loading quotes" })).toBeInTheDocument();
    const list = within(await screen.findByRole("list", { name: "Quotes" }));
    expect(listQuotes).toHaveBeenCalledWith(cardQuery);
    expect(screen.getByText("3 total")).toBeInTheDocument();

    const items = list.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const first = within(items[0] as HTMLElement);
    expect(first.getByRole("link", { name: "Q-0005" })).toHaveAttribute(
      "href",
      `/quotes/${invoiced.id}`,
    );
    expect(first.getByText("Accepted")).toBeInTheDocument();
    expect(first.getByText("$2,003.78")).toBeInTheDocument();
    expect(first.getByText(/Valid until Nov 4, 2099/)).toBeInTheDocument();
    expect(first.getByRole("link", { name: "Invoice INV-0001" })).toHaveAttribute(
      "href",
      `/invoices/${invoiced.invoice?.id ?? ""}`,
    );
    // A quote without an invoice has no invoice link; an expired one says so in words.
    expect(within(items[1] as HTMLElement).getByText("Expired")).toBeInTheDocument();
    expect(
      within(items[2] as HTMLElement).queryByRole("link", { name: /Invoice/ }),
    ).not.toBeInTheDocument();
    // Everything is on the card, so there is nothing more to view.
    expect(screen.queryByRole("link", { name: /View all/ })).not.toBeInTheDocument();
  });

  it("offers New quote with the opportunity filled in, to a writer only", async () => {
    const { rerender } = render(<OpportunityQuotes opportunityId={fleet.id} canWrite />);
    await screen.findByRole("list", { name: "Quotes" });
    expect(screen.getByRole("link", { name: "New quote" })).toHaveAttribute(
      "href",
      `/quotes/new?opportunityId=${fleet.id}&from=${encodeURIComponent(`/opportunities/${fleet.id}`)}`,
    );

    rerender(<OpportunityQuotes opportunityId={fleet.id} canWrite={false} />);
    expect(screen.queryByRole("link", { name: "New quote" })).not.toBeInTheDocument();
  });

  it("links to the quotes list, filtered by the opportunity, when there are more", async () => {
    vi.mocked(listQuotes).mockResolvedValue(quoteList([draft], { total: 14 }));
    render(<OpportunityQuotes opportunityId={fleet.id} canWrite />);

    expect(await screen.findByRole("link", { name: "View all 14 quotes" })).toHaveAttribute(
      "href",
      `/quotes?opportunityId=${fleet.id}`,
    );
  });

  it("says when there are no quotes, in words that fit the role", async () => {
    vi.mocked(listQuotes).mockResolvedValue(quoteList([]));
    const { rerender } = render(<OpportunityQuotes opportunityId={fleet.id} canWrite />);

    expect(await screen.findByText("No quotes yet")).toBeInTheDocument();
    expect(screen.getByText(/Make a quote for this opportunity/)).toBeInTheDocument();

    rerender(<OpportunityQuotes opportunityId={fleet.id} canWrite={false} />);
    expect(screen.getByText(/will show in this list/)).toBeInTheDocument();
  });

  it("shows a failed load with Retry, and asks again", async () => {
    const failure: ApiError = { code: "NETWORK_ERROR", message: "offline", details: null };
    vi.mocked(listQuotes).mockRejectedValueOnce(failure);
    const user = userEvent.setup();
    render(<OpportunityQuotes opportunityId={fleet.id} canWrite />);

    expect(await screen.findByText(/cannot be reached/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("link", { name: "Q-0005" })).toBeInTheDocument();
    expect(listQuotes).toHaveBeenCalledTimes(2);
  });

  it("asks again for another opportunity and never shows the old quotes under it", async () => {
    const { rerender } = render(<OpportunityQuotes opportunityId={fleet.id} canWrite />);
    await screen.findByRole("link", { name: "Q-0005" });
    vi.mocked(listQuotes).mockReturnValue(new Promise(() => undefined));

    rerender(<OpportunityQuotes opportunityId={vision.id} canWrite />);

    expect(screen.queryByRole("link", { name: "Q-0005" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading quotes" })).toBeInTheDocument();
    expect(listQuotes).toHaveBeenLastCalledWith({ ...cardQuery, opportunityId: vision.id });
  });
});
