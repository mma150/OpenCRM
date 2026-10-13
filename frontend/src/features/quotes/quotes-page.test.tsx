import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { getCompany, listCompanies } from "@/features/companies/companies.api";
import { companyList, northwind } from "@/features/companies/companies.fixtures";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { getOpportunity } from "@/features/opportunities/opportunities.api";
import { fleet } from "@/features/opportunities/opportunities.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import type { DownloadedFile } from "@/lib/api/download";
import type { ApiError } from "@/lib/api/http";
import { saveFile } from "@/lib/save-file";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { deleteQuote, exportQuotes, listQuotes } from "./quotes.api";
import { allQuotes, defaultQuery, draft, expired, quoteList, sent } from "./quotes.fixtures";
import { QuotesPage } from "./quotes-page";

vi.mock("./quotes.api");
vi.mock("@/features/companies/companies.api");
vi.mock("@/features/opportunities/opportunities.api");
vi.mock("@/features/users/users.api");
vi.mock("@/lib/save-file");
vi.mock("sonner");

type TestUser = ReturnType<typeof renderWithStore>["user"];

const file: DownloadedFile = { blob: new Blob(["x"]), filename: "quotes.csv", truncated: false };
const everyRole: Me[] = [adminUser, managerUser, repUser, readOnlyUser];

async function renderPage(me: Me = adminUser, search = "") {
  setMockLocation("/quotes", search);
  const view = renderWithStore(<QuotesPage />, { me });
  const table = await screen.findByRole("table", { name: "Quotes" });
  await within(table).findAllByRole("row");
  return { ...view, table };
}

async function choose(user: TestUser, filter: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: filter }));
  await user.click(await screen.findByRole("option", { name: option }));
}

async function openMenu(user: TestUser, table: HTMLElement, number: string) {
  await user.click(within(table).getByRole("button", { name: `Actions for ${number}` }));
  return within(await screen.findByRole("menu"));
}

describe("QuotesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    vi.mocked(getCompany).mockResolvedValue(northwind);
    vi.mocked(getOpportunity).mockResolvedValue(fleet);
    vi.mocked(listQuotes).mockResolvedValue(quoteList());
    followNavigation();
  });

  it("lists the quotes: number, opportunity, company, status in words, total, valid until", async () => {
    const { table } = await renderPage();

    expect(listQuotes).toHaveBeenCalledWith(defaultQuery);
    expect(within(table).getAllByRole("row")).toHaveLength(allQuotes.length + 1);
    const row = within(within(table).getByRole("row", { name: /Q-0001/ }));
    expect(row.getByRole("link", { name: "Q-0001" })).toHaveAttribute(
      "href",
      `/quotes/${draft.id}`,
    );
    expect(row.getByRole("link", { name: "Fleet Expansion" })).toHaveAttribute(
      "href",
      `/opportunities/${fleet.id}`,
    );
    expect(row.getByRole("link", { name: "Northwind Logistics" })).toHaveAttribute(
      "href",
      `/companies/${northwind.id}`,
    );
    expect(row.getByText("Draft")).toBeInTheDocument();
    expect(row.getByText("$2,003.78")).toBeInTheDocument();
    expect(row.getByText("Nov 4, 2099")).toBeInTheDocument();
    // A sent quote past its day reads "Expired": the word, not only a colour.
    expect(
      within(within(table).getByRole("row", { name: /Q-0003/ })).getByText("Expired"),
    ).toBeInTheDocument();
  });

  it("shows the loading state, then an empty list with the way to make a quote", async () => {
    vi.mocked(listQuotes).mockResolvedValue(quoteList([]));
    setMockLocation("/quotes");
    renderWithStore(<QuotesPage />, { me: adminUser });

    expect(await screen.findByText("No quotes yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New quote" })[0]).toHaveAttribute(
      "href",
      "/quotes/new",
    );
  });

  it("shows a failed load with Retry", async () => {
    const failure: ApiError = { code: "SERVICE_UNAVAILABLE", message: "Down", details: null };
    vi.mocked(listQuotes).mockRejectedValueOnce(failure);
    setMockLocation("/quotes");
    const { user } = renderWithStore(<QuotesPage />, { me: adminUser });

    expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    // The table and the phone's cards are both in the page.
    expect(await screen.findAllByRole("link", { name: "Q-0001" })).not.toHaveLength(0);
  });

  it("reads search, filters, sort and page from the address", async () => {
    await renderPage(
      adminUser,
      `search=fleet&status=EXPIRED&ownerId=${repUser.id}&companyId=${northwind.id}&opportunityId=${fleet.id}&sort=total&order=asc&page=2`,
    );

    expect(listQuotes).toHaveBeenCalledWith({
      search: "fleet",
      status: "EXPIRED",
      ownerId: repUser.id,
      companyId: northwind.id,
      opportunityId: fleet.id,
      sort: "total",
      order: "asc",
      page: 2,
      pageSize: 25,
    });
    // The filters that hold an id show the record's name.
    expect(await screen.findByRole("button", { name: "Company" })).toHaveTextContent(
      "Northwind Logistics",
    );
    expect(await screen.findByRole("button", { name: "Opportunity" })).toHaveTextContent(
      "Fleet Expansion",
    );
  });

  it("writes a status, an owner and a sort order into the address and asks again", async () => {
    const { user } = await renderPage();
    // The Opportunity filter is offered only when a link set it.
    expect(screen.queryByRole("button", { name: "Opportunity" })).not.toBeInTheDocument();

    await choose(user, "Status", "Sent");
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/quotes?status=SENT", { scroll: false });
    await waitFor(() => {
      expect(listQuotes).toHaveBeenLastCalledWith({ ...defaultQuery, status: "SENT" });
    });

    await choose(user, "Owner", "Rob Rep");
    await choose(user, "Sort", "Valid until: soonest");
    await waitFor(() => {
      expect(listQuotes).toHaveBeenLastCalledWith({
        ...defaultQuery,
        status: "SENT",
        ownerId: repUser.id,
        sort: "validUntil",
        order: "asc",
      });
    });
  });

  it("offers no Owner filter to a Sales Rep, who only has their own opportunities", async () => {
    vi.mocked(listAssignableUsers).mockResolvedValue([
      { id: repUser.id, name: repUser.name, role: "SALES_REP" },
    ]);
    await renderPage(repUser);

    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("says when no quote matches the filters, and clears them", async () => {
    vi.mocked(listQuotes).mockResolvedValue(quoteList([]));
    setMockLocation("/quotes", "status=DECLINED");
    const { user } = renderWithStore(<QuotesPage />, { me: adminUser });

    expect(await screen.findByText("No quotes match your filters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(mockRouter.replace).toHaveBeenLastCalledWith("/quotes", { scroll: false });
  });

  it.each(everyRole)("exports the list as it is filtered, for $role", async (me) => {
    vi.mocked(exportQuotes).mockResolvedValue(file);
    const { user } = await renderPage(me, "status=SENT&search=fleet");

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(exportQuotes).toHaveBeenCalledWith({
        ...defaultQuery,
        status: "SENT",
        search: "fleet",
      });
    });
    await waitFor(() => {
      expect(saveFile).toHaveBeenCalledWith(file.blob, "quotes.csv");
    });
    // Quotes are not imported.
    expect(screen.queryByRole("link", { name: "Import" })).not.toBeInTheDocument();
  });

  it("lets a writer edit and delete a draft only, and print any quote", async () => {
    vi.mocked(listQuotes).mockResolvedValue(quoteList([draft, sent, expired]));
    const { user, table } = await renderPage();
    expect(screen.getByRole("link", { name: "New quote" })).toBeInTheDocument();

    let menu = await openMenu(user, table, "Q-0002");
    expect(menu.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(menu.getByRole("menuitem", { name: "Print / PDF" })).toHaveAttribute(
      "href",
      `/quotes/${sent.id}/print`,
    );
    expect(menu.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    expect(menu.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    menu = await openMenu(user, table, "Q-0001");
    expect(menu.getByRole("menuitem", { name: "Edit" })).toHaveAttribute(
      "href",
      `/quotes/${draft.id}/edit?from=%2Fquotes`,
    );
    vi.mocked(deleteQuote).mockResolvedValue();
    // The list is asked for again after the delete.
    vi.mocked(listQuotes).mockResolvedValue(quoteList([sent, expired]));
    await user.click(menu.getByRole("menuitem", { name: "Delete" }));
    const dialog = within(await screen.findByRole("alertdialog", { name: "Delete Q-0001?" }));
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteQuote).toHaveBeenCalledWith(draft.id);
    });
    await waitFor(() => {
      expect(within(table).queryByRole("link", { name: "Q-0001" })).not.toBeInTheDocument();
    });
  });

  it("gives a Read-only user the list, View and Print, and nothing that changes a quote", async () => {
    vi.mocked(listQuotes).mockResolvedValue(quoteList([draft]));
    const { user, table } = await renderPage(readOnlyUser);

    expect(screen.queryByRole("link", { name: "New quote" })).not.toBeInTheDocument();
    const menu = await openMenu(user, table, "Q-0001");
    expect(menu.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(menu.getByRole("menuitem", { name: "Print / PDF" })).toBeInTheDocument();
    expect(menu.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    expect(menu.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });
});
