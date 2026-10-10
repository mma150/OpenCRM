import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import type { AssignableUser } from "@/features/users/users.types";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { assignCompany, deleteCompany, listCompanies, listIndustries } from "./companies.api";
import {
  allCompanies,
  brightpath,
  companyList,
  defaultQuery,
  industries,
  kestrel,
  northwind,
} from "./companies.fixtures";
import type { Company } from "./companies.types";
import { CompaniesPage } from "./companies-page";

vi.mock("./companies.api");
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

function mockLists(me: Me, companies: Company[] | ReturnType<typeof companyList>) {
  vi.mocked(listCompanies).mockResolvedValue(
    Array.isArray(companies) ? companyList(companies) : companies,
  );
  vi.mocked(listIndustries).mockResolvedValue(industries);
  vi.mocked(listAssignableUsers).mockResolvedValue(assignableFor(me));
}

// The page renders the table and the phone cards together (CSS shows one), so the tests
// look inside the table.
async function renderCompanies(me: Me = adminUser, companies: Company[] = allCompanies) {
  mockLists(me, companies);
  const view = renderWithStore(<CompaniesPage />, { me });
  const table = await screen.findByRole("table", { name: "Companies" });
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

describe("CompaniesPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setMockLocation("/companies");
    followNavigation();
  });

  it("lists the companies with website, industry, number of contacts and owner", async () => {
    const { table } = await renderCompanies();

    const row = within(table).getByRole("row", { name: /Northwind Logistics/ });
    expect(within(row).getByRole("link", { name: "Northwind Logistics" })).toHaveAttribute(
      "href",
      `/companies/${northwind.id}`,
    );
    const website = within(row).getByRole("link", { name: "northwind.example" });
    expect(website).toHaveAttribute("href", "https://northwind.example/");
    expect(website).toHaveAttribute("target", "_blank");
    expect(website).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(row).getByText("Logistics")).toBeInTheDocument();
    expect(within(row).getByText("4 contacts")).toBeInTheDocument();
    expect(within(row).getByText("Rob Rep")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(allCompanies.length + 1);
    expect(listCompanies).toHaveBeenCalledWith(defaultQuery);
  });

  it("links a website typed without a scheme over https, and counts one contact in the singular", async () => {
    const { table } = await renderCompanies();

    const row = within(table).getByRole("row", { name: /Kestrel Robotics/ });
    expect(within(row).getByRole("link", { name: "kestrelrobotics.example" })).toHaveAttribute(
      "href",
      "https://kestrelrobotics.example/",
    );
    expect(within(row).getByText("1 contact")).toBeInTheDocument();
  });

  it("never turns a website that is not a web address into a link", async () => {
    const odd = { ...brightpath, website: "javascript:alert(1)" };
    const { table } = await renderCompanies(adminUser, [odd]);

    const row = within(table).getByRole("row", { name: /Brightpath Dental/ });
    expect(within(row).getByText("javascript:alert(1)")).toBeInTheDocument();
    expect(within(row).getAllByRole("link")).toHaveLength(1);
  });

  it("shows a dash for no industry, and no website line", async () => {
    const { table } = await renderCompanies();

    const row = within(table).getByRole("row", { name: /Brightpath Dental/ });
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).getByText("0 contacts")).toBeInTheDocument();
    expect(within(row).getAllByRole("link")).toHaveLength(1);
  });

  it("shows the same companies as cards for phones", async () => {
    await renderCompanies();

    const cards = screen.getByRole("list", { name: "Companies" });
    const items = within(cards).getAllByRole("listitem");
    expect(items).toHaveLength(allCompanies.length);
    const card = items.find((item) => item.textContent.includes("Northwind Logistics"));
    expect(card).toHaveTextContent("northwind.example");
    expect(card).toHaveTextContent("Logistics");
    expect(card).toHaveTextContent("4 contacts");
    expect(card).toHaveTextContent("Rob Rep");
  });

  it("offers an Admin every action, and the Industry and Owner filters", async () => {
    const { user, table } = await renderCompanies();

    expect(screen.getByRole("link", { name: "New company" })).toHaveAttribute(
      "href",
      "/companies/new",
    );
    expect(await menuItems(user, table, "Northwind Logistics")).toEqual([
      "View",
      "Edit",
      "Reassign",
      "Delete",
    ]);
    expect(await screen.findByRole("combobox", { name: "Industry" })).toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: "Owner" })).toBeInTheDocument();
  });

  it("offers a Sales Manager Reassign and the Owner filter", async () => {
    const { user, table } = await renderCompanies(managerUser);

    expect(await menuItems(user, table, "Northwind Logistics")).toContain("Reassign");
    expect(await screen.findByRole("combobox", { name: "Owner" })).toBeInTheDocument();
  });

  it("gives a Sales Rep no Reassign and no Owner filter", async () => {
    const { user, table } = await renderCompanies(repUser, [northwind]);

    expect(screen.getByRole("link", { name: "New company" })).toBeInTheDocument();
    expect(await menuItems(user, table, "Northwind Logistics")).toEqual(["View", "Edit", "Delete"]);
    await waitFor(() => {
      expect(listAssignableUsers).toHaveBeenCalled();
    });
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: "Industry" })).toBeInTheDocument();
  });

  it("gives a Read-only user View and nothing that changes a company", async () => {
    const { user, table } = await renderCompanies(readOnlyUser);

    expect(screen.queryByRole("link", { name: "New company" })).not.toBeInTheDocument();
    expect(await menuItems(user, table, "Northwind Logistics")).toEqual(["View"]);
  });

  it("says 'No companies yet' with a create action when there are none", async () => {
    mockLists(adminUser, []);
    vi.mocked(listIndustries).mockResolvedValue([]);
    renderWithStore(<CompaniesPage />, { me: adminUser });

    expect(await screen.findByText("No companies yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New company" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    // With no industry in use there is nothing to filter by.
    expect(screen.queryByRole("combobox", { name: "Industry" })).not.toBeInTheDocument();
  });

  it("gives a Read-only user no create action in the empty state", async () => {
    mockLists(readOnlyUser, []);
    renderWithStore(<CompaniesPage />, { me: readOnlyUser });

    expect(await screen.findByText("No companies yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New company" })).not.toBeInTheDocument();
  });

  it("says nothing matches when filters are on, and clears them", async () => {
    setMockLocation("/companies", "search=zzz&industry=Robotics");
    mockLists(adminUser, []);
    const { user } = renderWithStore(<CompaniesPage />, { me: adminUser });

    expect(await screen.findByText("No companies match your filters")).toBeInTheDocument();
    expect(listCompanies).toHaveBeenCalledWith({
      ...defaultQuery,
      search: "zzz",
      industry: "Robotics",
    });

    vi.mocked(listCompanies).mockResolvedValue(companyList());
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(mockRouter.replace).toHaveBeenLastCalledWith("/companies", { scroll: false });
    expect(await screen.findByRole("table", { name: "Companies" })).toBeInTheDocument();
    expect(listCompanies).toHaveBeenLastCalledWith(defaultQuery);
  });

  it("loads the list the address describes, even for an industry no longer in use", async () => {
    setMockLocation(
      "/companies",
      `industry=Mining&ownerId=${repUser.id}&sort=createdAt&order=desc&page=2`,
    );
    await renderCompanies();

    expect(listCompanies).toHaveBeenCalledWith({
      industry: "Mining",
      ownerId: repUser.id,
      sort: "createdAt",
      order: "desc",
      page: 2,
      pageSize: 25,
    });
    expect(await screen.findByRole("combobox", { name: "Industry" })).toHaveTextContent(
      "Industry:Mining",
    );
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveTextContent("Sort:Newest first");
  });

  it("filters by an industry in use and sorts through the toolbar", async () => {
    const { user } = await renderCompanies();

    await user.click(await screen.findByRole("combobox", { name: "Industry" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["All", "Logistics", "Robotics"]);
    await user.click(screen.getByRole("option", { name: "Robotics" }));
    await waitFor(() => {
      expect(listCompanies).toHaveBeenLastCalledWith({ ...defaultQuery, industry: "Robotics" });
    });

    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(await screen.findByRole("option", { name: "Name Z–A" }));
    await waitFor(() => {
      expect(listCompanies).toHaveBeenLastCalledWith({
        ...defaultQuery,
        industry: "Robotics",
        order: "desc",
      });
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      "/companies?industry=Robotics&sort=name&order=desc",
      {
        scroll: false,
      },
    );
  });

  it("puts a search in the address and reloads the list with it", async () => {
    const { user } = await renderCompanies();

    await user.type(screen.getByRole("searchbox"), "north");

    await waitFor(() => {
      expect(listCompanies).toHaveBeenLastCalledWith({ ...defaultQuery, search: "north" });
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/companies?search=north", {
      scroll: false,
    });
  });

  it("pages through the list, and steps back from a page past the end", async () => {
    mockLists(adminUser, companyList(allCompanies, { total: 64 }));
    const { user, unmount } = renderWithStore(<CompaniesPage />, { me: adminUser });

    const pagination = await screen.findByRole("navigation", { name: "Pagination" });
    expect(pagination).toHaveTextContent("Showing 1–25 of 64");
    vi.mocked(listCompanies).mockResolvedValue(companyList(allCompanies, { page: 2, total: 64 }));
    await user.click(within(pagination).getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(listCompanies).toHaveBeenLastCalledWith({ ...defaultQuery, page: 2 });
    });
    unmount();

    setMockLocation("/companies", "page=4");
    mockLists(adminUser, companyList([], { page: 4, total: 64 }));
    renderWithStore(<CompaniesPage />, { me: adminUser });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenLastCalledWith("/companies?page=3", { scroll: false });
    });
  });

  it("carries the current list address to the forms, so they can come back to it", async () => {
    setMockLocation("/companies", "search=north");
    const { user, table } = await renderCompanies();
    const from = encodeURIComponent("/companies?search=north");

    expect(screen.getByRole("link", { name: "New company" })).toHaveAttribute(
      "href",
      `/companies/new?from=${from}`,
    );
    await user.click(
      within(table).getByRole("button", { name: "Actions for Northwind Logistics" }),
    );
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toHaveAttribute(
      "href",
      `/companies/${northwind.id}/edit?from=${from}`,
    );
  });

  it("shows the load error with Retry", async () => {
    mockLists(adminUser, allCompanies);
    vi.mocked(listCompanies)
      .mockReset()
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(companyList());
    const { user } = renderWithStore(<CompaniesPage />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("table", { name: "Companies" })).toBeInTheDocument();
  });

  it("reassigns a company to someone else the user may assign to", async () => {
    vi.mocked(assignCompany).mockResolvedValue({
      ...northwind,
      owner: { id: managerUser.id, name: managerUser.name },
    });
    const { user, table } = await renderCompanies();

    await openAction(user, table, "Northwind Logistics", "Reassign");
    const dialog = await screen.findByRole("dialog", { name: "Reassign Northwind Logistics" });
    expect(dialog).toHaveTextContent("The company is owned by Rob Rep.");
    await user.click(within(dialog).getByRole("combobox", { name: "New owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(within(dialog).getByRole("button", { name: "Reassign" }));

    await waitFor(() => {
      expect(assignCompany).toHaveBeenCalledWith(northwind.id, managerUser.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("warns that the contacts stay without a company before deleting, then deletes", async () => {
    vi.mocked(deleteCompany).mockResolvedValue();
    const { user, table } = await renderCompanies();

    await openAction(user, table, "Northwind Logistics", "Delete");
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Northwind Logistics?" });
    expect(dialog).toHaveTextContent(
      "Its 4 contacts stay, but are no longer linked to a company. This cannot be undone.",
    );
    expect(deleteCompany).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteCompany).toHaveBeenCalledWith(northwind.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("words the warning for one contact, and for a company that shows none", async () => {
    const { user, table } = await renderCompanies();

    await openAction(user, table, "Kestrel Robotics", "Delete");
    let dialog = await screen.findByRole("alertdialog", { name: `Delete ${kestrel.name}?` });
    expect(dialog).toHaveTextContent("Its 1 contact stays, but is no longer linked to a company.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    await openAction(user, table, "Brightpath Dental", "Delete");
    dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Any contacts linked to it stay, but lose the link.");
    expect(deleteCompany).not.toHaveBeenCalled();
  });

  it("explains a refused delete in the dialog and keeps it open", async () => {
    vi.mocked(deleteCompany).mockRejectedValue({
      code: "FORBIDDEN",
      message: "Server text",
      details: null,
    });
    const { user, table } = await renderCompanies();

    await openAction(user, table, "Northwind Logistics", "Delete");
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
  });
});
