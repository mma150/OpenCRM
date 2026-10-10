import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { getCompany, listCompanies } from "@/features/companies/companies.api";
import { companyList, northwind } from "@/features/companies/companies.fixtures";
import { getContact } from "@/features/contacts/contacts.api";
import { marcus } from "@/features/contacts/contacts.fixtures";
import { assignableUsers, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listPipelineStages } from "@/features/pipeline-stages/pipeline-stages.api";
import { pipeline, qualifiedStage } from "@/features/pipeline-stages/pipeline-stages.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import {
  closeOpportunity,
  deleteOpportunity,
  getBoard,
  listOpportunities,
  reopenOpportunity,
} from "./opportunities.api";
import {
  allOpportunities,
  board,
  defaultQuery,
  fleet,
  opportunityList,
  wonDeal,
} from "./opportunities.fixtures";
import { OpportunitiesPage } from "./opportunities-page";

vi.mock("./opportunities.api");
vi.mock("@/features/pipeline-stages/pipeline-stages.api");
vi.mock("@/features/companies/companies.api");
vi.mock("@/features/contacts/contacts.api");
vi.mock("@/features/users/users.api");
vi.mock("sonner");

type TestUser = ReturnType<typeof renderWithStore>["user"];

// The list view renders the table and the phone cards together (CSS shows one), so the
// tests look inside the table.
async function renderList(me: Me = adminUser, search = "view=list") {
  setMockLocation("/opportunities", search);
  const view = renderWithStore(<OpportunitiesPage />, { me });
  const table = await screen.findByRole("table", { name: "Opportunities" });
  return { ...view, table };
}

async function menuItems(user: TestUser, table: HTMLElement, name: string) {
  await user.click(within(table).getByRole("button", { name: `Actions for ${name}` }));
  const menu = await screen.findByRole("menu");
  const items = within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
  await user.keyboard("{Escape}");
  return items;
}

async function openAction(user: TestUser, table: HTMLElement, name: string, action: string) {
  await user.click(within(table).getByRole("button", { name: `Actions for ${name}` }));
  await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: action }));
}

async function choose(user: TestUser, filter: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: filter }));
  await user.click(await screen.findByRole("option", { name: option }));
}

const view = () => within(screen.getByRole("group", { name: "View" }));

describe("OpportunitiesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listPipelineStages).mockResolvedValue(pipeline);
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    vi.mocked(getCompany).mockResolvedValue(northwind);
    vi.mocked(getContact).mockResolvedValue(marcus);
    vi.mocked(listOpportunities).mockResolvedValue(opportunityList());
    vi.mocked(getBoard).mockResolvedValue(board());
    setMockLocation("/opportunities");
    followNavigation();
  });

  it("opens on the board, and asks only for the board", async () => {
    renderWithStore(<OpportunitiesPage />, { me: adminUser });

    expect(await screen.findByRole("region", { name: "Pipeline board" })).toBeInTheDocument();
    expect(view().getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true");
    expect(listOpportunities).not.toHaveBeenCalled();
    // The board has no sort and none of the list's filters.
    expect(screen.queryByRole("combobox", { name: "Sort" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Stage" })).not.toBeInTheDocument();
  });

  it("shows the list for view=list: name, company, stage, value, close date, contact, owner", async () => {
    const { table } = await renderList();

    expect(view().getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(listOpportunities).toHaveBeenCalledWith(defaultQuery);
    expect(getBoard).not.toHaveBeenCalled();
    const row = within(within(table).getByRole("row", { name: /Fleet Expansion/ }));
    expect(row.getByRole("link", { name: "Fleet Expansion" })).toHaveAttribute(
      "href",
      `/opportunities/${fleet.id}`,
    );
    expect(row.getByRole("link", { name: "Northwind Logistics" })).toHaveAttribute(
      "href",
      `/companies/${northwind.id}`,
    );
    expect(row.getByText("New")).toBeInTheDocument();
    expect(row.getByText("$48,000")).toBeInTheDocument();
    expect(row.getByText("Nov 15, 2026")).toBeInTheDocument();
    expect(row.getByRole("link", { name: "Marcus Chen" })).toBeInTheDocument();
    expect(row.getByText("Rob Rep")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(allOpportunities.length + 1);
  });

  it("keeps the search text and the owner when the view changes, and drops the rest", async () => {
    const { user } = await renderList(
      adminUser,
      `view=list&search=fleet&ownerId=${repUser.id}&stageId=${qualifiedStage.id}&sort=value&order=desc&page=2`,
    );

    await user.click(view().getByRole("button", { name: "Board" }));

    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      `/opportunities?search=fleet&ownerId=${repUser.id}`,
      { scroll: false },
    );
    await waitFor(() => {
      expect(getBoard).toHaveBeenCalledWith({ search: "fleet", ownerId: repUser.id });
    });

    await user.click(view().getByRole("button", { name: "List" }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      `/opportunities?view=list&search=fleet&ownerId=${repUser.id}`,
      { scroll: false },
    );
  });

  it("reads the filters, sort and page from the address", async () => {
    await renderList(
      adminUser,
      `view=list&stageId=${qualifiedStage.id}&status=OPEN&companyId=${northwind.id}&sort=value&order=desc&page=2`,
    );

    expect(listOpportunities).toHaveBeenCalledWith({
      stageId: qualifiedStage.id,
      status: "OPEN",
      companyId: northwind.id,
      sort: "value",
      order: "desc",
      page: 2,
      pageSize: 25,
    });
    expect(await screen.findByRole("combobox", { name: "Stage" })).toHaveTextContent(
      "Stage:Qualified",
    );
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Status:Open");
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveTextContent("Sort:Value: highest");
  });

  it("stays on the list when a filter or the sort changes", async () => {
    const { user } = await renderList();

    await choose(user, "Stage", "Qualified");
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      `/opportunities?stageId=${qualifiedStage.id}&view=list`,
      { scroll: false },
    );
    await waitFor(() => {
      expect(listOpportunities).toHaveBeenLastCalledWith({
        ...defaultQuery,
        stageId: qualifiedStage.id,
      });
    });

    await choose(user, "Status", "Won");
    await choose(user, "Sort", "Closing soonest");
    await waitFor(() => {
      expect(listOpportunities).toHaveBeenLastCalledWith({
        ...defaultQuery,
        stageId: qualifiedStage.id,
        status: "WON",
        sort: "expectedCloseDate",
        order: "asc",
      });
    });
    expect(view().getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  });

  it("names the company of the Company filter, and shows the Contact filter only when a link set it", async () => {
    const { unmount } = await renderList();
    expect(screen.getByRole("button", { name: "Company" })).toHaveTextContent("Company:All");
    expect(screen.queryByRole("button", { name: "Contact" })).not.toBeInTheDocument();
    unmount();

    await renderList(adminUser, `view=list&companyId=${northwind.id}&contactId=${marcus.id}`);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Company" })).toHaveTextContent(
        "Company:Northwind Logistics",
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Contact" })).toHaveTextContent(
        "Contact:Marcus Chen",
      );
    });
    expect(listOpportunities).toHaveBeenLastCalledWith({
      ...defaultQuery,
      companyId: northwind.id,
      contactId: marcus.id,
    });
  });

  it("offers an Admin every action that fits the opportunity's status", async () => {
    const { user, table } = await renderList();

    expect(screen.getByRole("link", { name: "New opportunity" })).toBeInTheDocument();
    expect(await menuItems(user, table, "Fleet Expansion")).toEqual([
      "View",
      "Edit",
      "Reassign",
      "Close as won",
      "Close as lost",
      "Delete",
    ]);
    expect(await menuItems(user, table, "Guest App")).toEqual([
      "View",
      "Edit",
      "Reassign",
      "Reopen",
      "Delete",
    ]);
  });

  it("gives a Sales Rep no Reassign and no Owner filter", async () => {
    const { user, table } = await renderList(repUser);

    expect(await menuItems(user, table, "Fleet Expansion")).toEqual([
      "View",
      "Edit",
      "Close as won",
      "Close as lost",
      "Delete",
    ]);
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });

  it("gives a Read-only user View and nothing that changes an opportunity", async () => {
    const { user, table } = await renderList(readOnlyUser);

    expect(screen.queryByRole("link", { name: "New opportunity" })).not.toBeInTheDocument();
    expect(await menuItems(user, table, "Fleet Expansion")).toEqual(["View"]);
    expect(await menuItems(user, table, "Guest App")).toEqual(["View"]);
  });

  it("closes an opportunity as lost from its row, with the reason", async () => {
    vi.mocked(closeOpportunity).mockResolvedValue({ ...fleet, status: "LOST" });
    const { user, table } = await renderList();

    await openAction(user, table, "Fleet Expansion", "Close as lost");
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Reason"), "No budget");
    await user.click(dialog.getByRole("button", { name: "Close as lost" }));

    await waitFor(() => {
      expect(closeOpportunity).toHaveBeenCalledWith(fleet.id, {
        outcome: "LOST",
        reason: "No budget",
      });
    });
  });

  it("reopens a closed opportunity and deletes one from the row menu", async () => {
    vi.mocked(reopenOpportunity).mockResolvedValue({ ...wonDeal, status: "OPEN" });
    vi.mocked(deleteOpportunity).mockResolvedValue();
    const { user, table } = await renderList();

    await openAction(user, table, "Guest App", "Reopen");
    await waitFor(() => {
      expect(reopenOpportunity).toHaveBeenCalledWith(wonDeal.id);
    });

    await openAction(user, table, "Fleet Expansion", "Delete");
    const dialog = within(await screen.findByRole("alertdialog"));
    expect(dialog.getByText(/Its contact and company are kept/)).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deleteOpportunity).toHaveBeenCalledWith(fleet.id);
    });
  });

  it("says when no opportunity matches, and clears the filters but stays on the list", async () => {
    vi.mocked(listOpportunities).mockResolvedValue(opportunityList([]));
    setMockLocation("/opportunities", "view=list&status=LOST");
    const { user } = renderWithStore(<OpportunitiesPage />, { me: adminUser });

    expect(await screen.findByText("No opportunities match your filters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(mockRouter.replace).toHaveBeenLastCalledWith("/opportunities?view=list", {
      scroll: false,
    });
  });
});
