import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { listAssignableUsers } from "@/features/users/users.api";
import type { AssignableUser } from "@/features/users/users.types";
import { formatRelativeDate } from "@/lib/format";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { assignLead, deleteLead, listLeads, markLeadLost, updateLead } from "./leads.api";
import {
  allLeads,
  assignableUsers,
  defaultQuery,
  devon,
  leadList,
  liam,
  managerUser,
  marcus,
  readOnlyUser,
} from "./leads.fixtures";
import type { Lead } from "./leads.types";
import { LeadsPage } from "./leads-page";

vi.mock("./leads.api");
vi.mock("@/features/users/users.api");

type TestUser = ReturnType<typeof renderWithStore>["user"];

const assignableFor = (me: Me): AssignableUser[] => {
  switch (me.role) {
    case "ADMIN":
      return assignableUsers;
    case "SALES_MANAGER":
      return assignableUsers.filter((user) => user.role !== "ADMIN");
    case "SALES_REP":
      return assignableUsers.filter((user) => user.id === me.id);
    case "READ_ONLY":
      return [];
  }
};

// The page renders the table and the phone cards together (CSS shows one), so the tests
// look inside the table.
async function renderLeads(me: Me = adminUser, leads: Lead[] = allLeads) {
  vi.mocked(listLeads).mockResolvedValue(leadList(leads));
  vi.mocked(listAssignableUsers).mockResolvedValue(assignableFor(me));
  const view = renderWithStore(<LeadsPage />, { me });
  const table = await screen.findByRole("table", { name: "Leads" });
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

describe("LeadsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setMockLocation("/leads");
    followNavigation();
  });

  it("lists the leads with company, status, source, owner and created date", async () => {
    const { table } = await renderLeads();

    const row = within(table).getByRole("row", { name: /Marcus Chen/ });
    expect(within(row).getByRole("link", { name: "Marcus Chen" })).toHaveAttribute(
      "href",
      `/leads/${marcus.id}`,
    );
    expect(within(row).getByText("Northwind Logistics")).toBeInTheDocument();
    expect(within(row).getByText("Contacted")).toBeInTheDocument();
    expect(within(row).getByText("Website")).toBeInTheDocument();
    expect(within(row).getByText("Rob Rep")).toBeInTheDocument();
    expect(within(row).getByText("Oct 5, 2026")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(allLeads.length + 1);
    expect(listLeads).toHaveBeenCalledWith(defaultQuery);
  });

  it("shows the same leads as cards for phones, with the lost reason", async () => {
    await renderLeads();

    const cards = screen.getByRole("list", { name: "Leads" });
    expect(within(cards).getAllByRole("listitem")).toHaveLength(allLeads.length);
    expect(within(cards).getByText("Lost: Chose competitor")).toBeInTheDocument();
  });

  it("shows when each lead was last contacted, or Never, in the table and on the cards", async () => {
    const today = { ...marcus, lastContactAt: new Date().toISOString() };
    const { table } = await renderLeads(adminUser, [today, liam, devon]);

    expect(within(table).getByRole("columnheader", { name: "Last contact" })).toBeInTheDocument();
    const cell = (name: RegExp) => within(table).getByRole("row", { name });
    expect(within(cell(/Marcus Chen/)).getByText("Today")).toBeInTheDocument();
    expect(within(cell(/Liam Gallagher/)).getByText("Never")).toBeInTheDocument();
    const devonContact = formatRelativeDate(devon.lastContactAt ?? "");
    expect(devonContact).toBe("Sep 15, 2026");
    expect(within(cell(/Devon Vance/)).getByText(devonContact)).toBeInTheDocument();

    const cards = within(screen.getByRole("list", { name: "Leads" })).getAllByRole("listitem");
    expect(cards.map((item) => /Last contact: (.*?)(Lost|$)/.exec(item.textContent)?.[1])).toEqual([
      "Today",
      "Never",
      "Sep 15, 2026",
    ]);
  });

  it("sorts by last contact", async () => {
    const { user } = await renderLeads();

    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(await screen.findByRole("option", { name: "Last contact: newest" }));
    await waitFor(() => {
      expect(listLeads).toHaveBeenLastCalledWith({
        ...defaultQuery,
        sort: "lastContactAt",
        order: "desc",
      });
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads?sort=lastContactAt&order=desc", {
      scroll: false,
    });

    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(await screen.findByRole("option", { name: "Last contact: oldest" }));
    await waitFor(() => {
      expect(listLeads).toHaveBeenLastCalledWith({
        ...defaultQuery,
        sort: "lastContactAt",
        order: "asc",
      });
    });
  });

  it("offers an Admin every action that fits the lead's status", async () => {
    const { user, table } = await renderLeads();

    expect(screen.getByRole("link", { name: "New lead" })).toHaveAttribute("href", "/leads/new");
    expect(await menuItems(user, table, "Marcus Chen")).toEqual([
      "View",
      "Edit",
      "Reassign",
      "Convert",
      "Mark as lost",
      "Delete",
    ]);
    expect(await menuItems(user, table, "Devon Vance")).toEqual([
      "View",
      "Edit",
      "Reassign",
      "Reopen",
      "Delete",
    ]);
    // A converted lead is final: it can only be opened and reassigned.
    expect(await menuItems(user, table, "Claire Beaumont")).toEqual(["View", "Reassign"]);
  });

  it("offers a Sales Manager Reassign and the Owner filter", async () => {
    const { user, table } = await renderLeads(managerUser);

    expect(await menuItems(user, table, "Marcus Chen")).toContain("Reassign");
    expect(await screen.findByRole("combobox", { name: "Owner" })).toBeInTheDocument();
  });

  it("gives a Sales Rep no Reassign and no Owner filter", async () => {
    const { user, table } = await renderLeads(repUser, [marcus, devon]);

    expect(screen.getByRole("link", { name: "New lead" })).toBeInTheDocument();
    expect(await menuItems(user, table, "Marcus Chen")).toEqual([
      "View",
      "Edit",
      "Convert",
      "Mark as lost",
      "Delete",
    ]);
    await waitFor(() => {
      expect(listAssignableUsers).toHaveBeenCalled();
    });
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Source" })).toBeInTheDocument();
  });

  it("gives a Read-only user View and nothing that changes a lead", async () => {
    const { user, table } = await renderLeads(readOnlyUser);

    expect(screen.queryByRole("link", { name: "New lead" })).not.toBeInTheDocument();
    expect(await menuItems(user, table, "Marcus Chen")).toEqual(["View"]);
    expect(await menuItems(user, table, "Devon Vance")).toEqual(["View"]);
  });

  it("says 'No leads yet' with a create action when there are none", async () => {
    vi.mocked(listLeads).mockResolvedValue(leadList([]));
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    renderWithStore(<LeadsPage />, { me: adminUser });

    expect(await screen.findByText("No leads yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New lead" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("gives a Read-only user no create action in the empty state", async () => {
    vi.mocked(listLeads).mockResolvedValue(leadList([]));
    vi.mocked(listAssignableUsers).mockResolvedValue([]);
    renderWithStore(<LeadsPage />, { me: readOnlyUser });

    expect(await screen.findByText("No leads yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New lead" })).not.toBeInTheDocument();
  });

  it("says nothing matches when filters are on, and clears them", async () => {
    setMockLocation("/leads", "search=zzz&status=LOST");
    vi.mocked(listLeads).mockResolvedValue(leadList([]));
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    const { user } = renderWithStore(<LeadsPage />, { me: adminUser });

    expect(await screen.findByText("No leads match your filters")).toBeInTheDocument();
    expect(screen.queryByText("No leads yet")).not.toBeInTheDocument();
    expect(listLeads).toHaveBeenCalledWith({ ...defaultQuery, search: "zzz", status: "LOST" });

    vi.mocked(listLeads).mockResolvedValue(leadList());
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads", { scroll: false });
    expect(await screen.findByRole("table", { name: "Leads" })).toBeInTheDocument();
    expect(listLeads).toHaveBeenLastCalledWith(defaultQuery);
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("loads the list the address describes", async () => {
    setMockLocation("/leads", `source=EVENT&ownerId=${repUser.id}&sort=name&order=asc&page=2`);
    await renderLeads();

    expect(listLeads).toHaveBeenCalledWith({
      source: "EVENT",
      ownerId: repUser.id,
      sort: "name",
      order: "asc",
      page: 2,
      pageSize: 25,
    });
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveTextContent("Source:Event");
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveTextContent("Sort:Name A–Z");
    expect(await screen.findByRole("combobox", { name: "Owner" })).toHaveTextContent(
      "Owner:Rob Rep",
    );
  });

  it("puts a search in the address and reloads the list with it", async () => {
    const { user } = await renderLeads();

    await user.type(screen.getByRole("searchbox"), "north");

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads?search=north", {
        scroll: false,
      });
    });
    await waitFor(() => {
      expect(listLeads).toHaveBeenLastCalledWith({ ...defaultQuery, search: "north" });
    });
  });

  it("filters by status and sorts through the toolbar", async () => {
    const { user } = await renderLeads();

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "Qualified" }));
    await waitFor(() => {
      expect(listLeads).toHaveBeenLastCalledWith({ ...defaultQuery, status: "QUALIFIED" });
    });

    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(await screen.findByRole("option", { name: "Company A–Z" }));
    await waitFor(() => {
      expect(listLeads).toHaveBeenLastCalledWith({
        status: "QUALIFIED",
        sort: "company",
        order: "asc",
        page: 1,
        pageSize: 25,
      });
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      "/leads?status=QUALIFIED&sort=company&order=asc",
      { scroll: false },
    );
  });

  it("pages through the list", async () => {
    vi.mocked(listLeads).mockResolvedValue(leadList(allLeads, { total: 64 }));
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    const { user } = renderWithStore(<LeadsPage />, { me: adminUser });

    const pagination = await screen.findByRole("navigation", { name: "Pagination" });
    expect(pagination).toHaveTextContent("Showing 1–25 of 64");

    vi.mocked(listLeads).mockResolvedValue(leadList(allLeads, { page: 2, total: 64 }));
    await user.click(within(pagination).getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(listLeads).toHaveBeenLastCalledWith({ ...defaultQuery, page: 2 });
    });
    await waitFor(() => {
      expect(pagination).toHaveTextContent("Showing 26–50 of 64");
    });
  });

  it("steps back to the last page when the current page is past the end", async () => {
    setMockLocation("/leads", "page=4");
    vi.mocked(listLeads).mockResolvedValue(leadList([], { page: 4, total: 64 }));
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    renderWithStore(<LeadsPage />, { me: adminUser });

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenLastCalledWith("/leads?page=3", { scroll: false });
    });
    expect(listLeads).toHaveBeenLastCalledWith({ ...defaultQuery, page: 3 });
  });

  it("carries the current list address to the forms, so they can come back to it", async () => {
    setMockLocation("/leads", "status=NEW");
    const { user, table } = await renderLeads();
    const from = encodeURIComponent("/leads?status=NEW");

    expect(screen.getByRole("link", { name: "New lead" })).toHaveAttribute(
      "href",
      `/leads/new?from=${from}`,
    );
    await user.click(within(table).getByRole("button", { name: "Actions for Marcus Chen" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toHaveAttribute(
      "href",
      `/leads/${marcus.id}/edit?from=${from}`,
    );
  });

  it("shows the load error with Retry", async () => {
    vi.mocked(listLeads)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(leadList());
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    const { user } = renderWithStore(<LeadsPage />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("table", { name: "Leads" })).toBeInTheDocument();
  });

  it("marks a lead as lost with a reason and a note", async () => {
    vi.mocked(markLeadLost).mockResolvedValue({ ...marcus, status: "LOST", lostReason: "PRICE" });
    const { user, table } = await renderLeads();

    await openAction(user, table, "Marcus Chen", "Mark as lost");
    const dialog = await screen.findByRole("dialog", { name: "Mark Marcus Chen as lost" });

    // A reason is required: nothing is sent without one.
    await user.click(within(dialog).getByRole("button", { name: "Mark as lost" }));
    expect(await within(dialog).findByText("Choose a reason.")).toBeInTheDocument();
    expect(markLeadLost).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("combobox", { name: "Reason" }));
    await user.click(await screen.findByRole("option", { name: "Price" }));
    await user.type(within(dialog).getByLabelText("Note (optional)"), "Too dear");
    await user.click(within(dialog).getByRole("button", { name: "Mark as lost" }));

    await waitFor(() => {
      expect(markLeadLost).toHaveBeenCalledWith(marcus.id, { reason: "PRICE", note: "Too dear" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // The list is reloaded after the change.
    expect(listLeads).toHaveBeenCalledTimes(2);
  });

  it("reassigns a lead to someone else the user may assign to", async () => {
    vi.mocked(assignLead).mockResolvedValue({
      ...marcus,
      owner: { id: managerUser.id, name: managerUser.name },
    });
    const { user, table } = await renderLeads();

    await openAction(user, table, "Marcus Chen", "Reassign");
    const dialog = await screen.findByRole("dialog", { name: "Reassign Marcus Chen" });
    await user.click(within(dialog).getByRole("combobox", { name: "New owner" }));
    // The current owner, Rob Rep, is not offered.
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["Ada Admin", "Mia Manager"]);
    await user.click(screen.getByRole("option", { name: "Mia Manager" }));
    await user.click(within(dialog).getByRole("button", { name: "Reassign" }));

    await waitFor(() => {
      expect(assignLead).toHaveBeenCalledWith(marcus.id, managerUser.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("explains a refused reassignment in the dialog and keeps it open", async () => {
    vi.mocked(assignLead).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "Server text",
      details: [{ path: "ownerId", message: "Choose someone on your team." }],
    });
    const { user, table } = await renderLeads();

    await openAction(user, table, "Marcus Chen", "Reassign");
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "New owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(within(dialog).getByRole("button", { name: "Reassign" }));

    expect(await within(dialog).findByText("Choose someone on your team.")).toBeInTheDocument();
  });

  it("reopens a lost lead straight from the menu", async () => {
    vi.mocked(updateLead).mockResolvedValue({ ...devon, status: "NEW", lostReason: null });
    const { user, table } = await renderLeads();

    await openAction(user, table, "Devon Vance", "Reopen");

    await waitFor(() => {
      expect(updateLead).toHaveBeenCalledWith(devon.id, { status: "NEW" });
    });
  });

  it("asks before deleting, then deletes", async () => {
    vi.mocked(deleteLead).mockResolvedValue();
    const { user, table } = await renderLeads();

    await openAction(user, table, "Marcus Chen", "Delete");
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Marcus Chen?" });
    expect(deleteLead).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteLead).toHaveBeenCalledWith(marcus.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("does nothing when the delete is cancelled, and explains a refusal", async () => {
    vi.mocked(deleteLead).mockRejectedValue({
      code: "FORBIDDEN",
      message: "Server text",
      details: null,
    });
    const { user, table } = await renderLeads();

    await openAction(user, table, "Marcus Chen", "Delete");
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(deleteLead).not.toHaveBeenCalled();

    await openAction(user, table, "Marcus Chen", "Delete");
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
  });
});
