import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { getCompany, listCompanies } from "@/features/companies/companies.api";
import { companyList, northwind } from "@/features/companies/companies.fixtures";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import type { AssignableUser } from "@/features/users/users.types";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { assignContact, deleteContact, listContacts } from "./contacts.api";
import { allContacts, contactList, defaultQuery, liam, marcus } from "./contacts.fixtures";
import type { Contact } from "./contacts.types";
import { ContactsPage } from "./contacts-page";

vi.mock("./contacts.api");
vi.mock("@/features/companies/companies.api");
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
async function renderContacts(me: Me = adminUser, contacts: Contact[] = allContacts) {
  vi.mocked(listContacts).mockResolvedValue(contactList(contacts));
  vi.mocked(listAssignableUsers).mockResolvedValue(assignableFor(me));
  const view = renderWithStore(<ContactsPage />, { me });
  const table = await screen.findByRole("table", { name: "Contacts" });
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

describe("ContactsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listCompanies).mockResolvedValue(companyList());
    setMockLocation("/contacts");
    followNavigation();
  });

  it("lists the contacts with job title, company, email, phone, owner and last contact", async () => {
    const { table } = await renderContacts();

    const row = within(table).getByRole("row", { name: /Marcus Chen/ });
    expect(within(row).getByRole("link", { name: "Marcus Chen" })).toHaveAttribute(
      "href",
      `/contacts/${marcus.id}`,
    );
    expect(within(row).getByText("Director of Operations")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Northwind Logistics" })).toHaveAttribute(
      "href",
      `/companies/${northwind.id}`,
    );
    expect(within(row).getByRole("link", { name: "m.chen@northwind.example" })).toHaveAttribute(
      "href",
      "mailto:m.chen@northwind.example",
    );
    expect(within(row).getByRole("link", { name: "+1 555 234 8901" })).toHaveAttribute(
      "href",
      "tel:+1 555 234 8901",
    );
    expect(within(row).getByText("Rob Rep")).toBeInTheDocument();
    expect(within(row).getByText("Sep 20, 2026")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(allContacts.length + 1);
    expect(listContacts).toHaveBeenCalledWith(defaultQuery);
  });

  it("shows a dash for what a contact does not have, and Never for no conversation", async () => {
    const { table } = await renderContacts();

    const row = within(table).getByRole("row", { name: /Liam Gallagher/ });
    expect(within(row).getAllByText("—")).toHaveLength(3);
    expect(within(row).getByText("Never")).toBeInTheDocument();
  });

  it("drops the lower-priority columns on narrower screens, and long text cannot widen a cell", async () => {
    const { table } = await renderContacts();

    const header = (name: string) => within(table).getByRole("columnheader", { name });
    expect(header("Email")).toHaveClass("hidden", "xl:table-cell");
    expect(header("Phone")).toHaveClass("hidden", "xl:table-cell");
    expect(header("Last contact")).toHaveClass("hidden", "lg:table-cell");
    expect(header("Name")).not.toHaveClass("hidden");
    expect(header("Company")).not.toHaveClass("hidden");
    expect(within(table).getByRole("link", { name: "m.chen@northwind.example" })).toHaveClass(
      "truncate",
    );
  });

  it("shows the same contacts as cards for phones, with everything the table hides", async () => {
    await renderContacts();

    const cards = screen.getByRole("list", { name: "Contacts" });
    const items = within(cards).getAllByRole("listitem");
    expect(items).toHaveLength(allContacts.length);
    const card = items.find((item) => item.textContent.includes("Marcus Chen"));
    expect(card).toHaveTextContent("Director of Operations");
    expect(card).toHaveTextContent("Northwind Logistics");
    expect(card).toHaveTextContent("m.chen@northwind.example");
    expect(card).toHaveTextContent("+1 555 234 8901");
    expect(card).toHaveTextContent("Last contact: Sep 20, 2026");
  });

  it("offers an Admin every action", async () => {
    const { user, table } = await renderContacts();

    expect(screen.getByRole("link", { name: "New contact" })).toHaveAttribute(
      "href",
      "/contacts/new",
    );
    expect(await menuItems(user, table, "Marcus Chen")).toEqual([
      "View",
      "Edit",
      "Reassign",
      "Delete",
    ]);
  });

  it("offers a Sales Manager Reassign and the Owner filter", async () => {
    const { user, table } = await renderContacts(managerUser);

    expect(await menuItems(user, table, "Marcus Chen")).toContain("Reassign");
    expect(await screen.findByRole("combobox", { name: "Owner" })).toBeInTheDocument();
  });

  it("gives a Sales Rep no Reassign and no Owner filter", async () => {
    const { user, table } = await renderContacts(repUser, [marcus]);

    expect(screen.getByRole("link", { name: "New contact" })).toBeInTheDocument();
    expect(await menuItems(user, table, "Marcus Chen")).toEqual(["View", "Edit", "Delete"]);
    await waitFor(() => {
      expect(listAssignableUsers).toHaveBeenCalled();
    });
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Company" })).toBeInTheDocument();
  });

  it("gives a Read-only user View and nothing that changes a contact", async () => {
    const { user, table } = await renderContacts(readOnlyUser);

    expect(screen.queryByRole("link", { name: "New contact" })).not.toBeInTheDocument();
    expect(await menuItems(user, table, "Marcus Chen")).toEqual(["View"]);
  });

  it("says 'No contacts yet' with a create action when there are none", async () => {
    vi.mocked(listContacts).mockResolvedValue(contactList([]));
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    renderWithStore(<ContactsPage />, { me: adminUser });

    expect(await screen.findByText("No contacts yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New contact" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("gives a Read-only user no create action in the empty state", async () => {
    vi.mocked(listContacts).mockResolvedValue(contactList([]));
    vi.mocked(listAssignableUsers).mockResolvedValue([]);
    renderWithStore(<ContactsPage />, { me: readOnlyUser });

    expect(await screen.findByText("No contacts yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New contact" })).not.toBeInTheDocument();
  });

  it("says nothing matches when filters are on, and clears them", async () => {
    setMockLocation("/contacts", "search=zzz");
    vi.mocked(listContacts).mockResolvedValue(contactList([]));
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    const { user } = renderWithStore(<ContactsPage />, { me: adminUser });

    expect(await screen.findByText("No contacts match your filters")).toBeInTheDocument();
    expect(listContacts).toHaveBeenCalledWith({ ...defaultQuery, search: "zzz" });

    vi.mocked(listContacts).mockResolvedValue(contactList());
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(mockRouter.replace).toHaveBeenLastCalledWith("/contacts", { scroll: false });
    expect(await screen.findByRole("table", { name: "Contacts" })).toBeInTheDocument();
    expect(listContacts).toHaveBeenLastCalledWith(defaultQuery);
  });

  it("loads the list the address describes, and names the company it is filtered by", async () => {
    vi.mocked(getCompany).mockResolvedValue(northwind);
    setMockLocation(
      "/contacts",
      `companyId=${northwind.id}&ownerId=${repUser.id}&sort=lastContactAt&order=desc&page=2`,
    );
    await renderContacts();

    expect(listContacts).toHaveBeenCalledWith({
      companyId: northwind.id,
      ownerId: repUser.id,
      sort: "lastContactAt",
      order: "desc",
      page: 2,
      pageSize: 25,
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Company" })).toHaveTextContent(
        "Company:Northwind Logistics",
      );
    });
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveTextContent(
      "Sort:Last contact: newest",
    );
    expect(await screen.findByRole("combobox", { name: "Owner" })).toHaveTextContent(
      "Owner:Rob Rep",
    );
  });

  it("filters by a company chosen in the picker, and keeps it in the address", async () => {
    const { user } = await renderContacts();

    await user.click(screen.getByRole("button", { name: "Company" }));
    await user.click(await screen.findByRole("button", { name: "Northwind Logistics" }));

    await waitFor(() => {
      expect(listContacts).toHaveBeenLastCalledWith({ ...defaultQuery, companyId: northwind.id });
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith(`/contacts?companyId=${northwind.id}`, {
      scroll: false,
    });
  });

  it("puts a search in the address and reloads the list with it", async () => {
    const { user } = await renderContacts();

    await user.type(screen.getByRole("searchbox"), "chen");

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenLastCalledWith("/contacts?search=chen", {
        scroll: false,
      });
    });
    await waitFor(() => {
      expect(listContacts).toHaveBeenLastCalledWith({ ...defaultQuery, search: "chen" });
    });
  });

  it("sorts through the toolbar", async () => {
    const { user } = await renderContacts();

    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(await screen.findByRole("option", { name: "Company A–Z" }));

    await waitFor(() => {
      expect(listContacts).toHaveBeenLastCalledWith({ ...defaultQuery, sort: "company" });
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/contacts?sort=company&order=asc", {
      scroll: false,
    });
  });

  it("pages through the list", async () => {
    vi.mocked(listContacts).mockResolvedValue(contactList(allContacts, { total: 64 }));
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    const { user } = renderWithStore(<ContactsPage />, { me: adminUser });

    const pagination = await screen.findByRole("navigation", { name: "Pagination" });
    expect(pagination).toHaveTextContent("Showing 1–25 of 64");

    vi.mocked(listContacts).mockResolvedValue(contactList(allContacts, { page: 2, total: 64 }));
    await user.click(within(pagination).getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(listContacts).toHaveBeenLastCalledWith({ ...defaultQuery, page: 2 });
    });
    await waitFor(() => {
      expect(pagination).toHaveTextContent("Showing 26–50 of 64");
    });
  });

  it("steps back to the last page when the current page is past the end", async () => {
    setMockLocation("/contacts", "page=4");
    vi.mocked(listContacts).mockResolvedValue(contactList([], { page: 4, total: 64 }));
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    renderWithStore(<ContactsPage />, { me: adminUser });

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenLastCalledWith("/contacts?page=3", { scroll: false });
    });
    expect(listContacts).toHaveBeenLastCalledWith({ ...defaultQuery, page: 3 });
  });

  it("carries the current list address to the forms, so they can come back to it", async () => {
    setMockLocation("/contacts", "search=chen");
    const { user, table } = await renderContacts();
    const from = encodeURIComponent("/contacts?search=chen");

    expect(screen.getByRole("link", { name: "New contact" })).toHaveAttribute(
      "href",
      `/contacts/new?from=${from}`,
    );
    await user.click(within(table).getByRole("button", { name: "Actions for Marcus Chen" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toHaveAttribute(
      "href",
      `/contacts/${marcus.id}/edit?from=${from}`,
    );
  });

  it("shows the load error with Retry", async () => {
    vi.mocked(listContacts)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(contactList());
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    const { user } = renderWithStore(<ContactsPage />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("table", { name: "Contacts" })).toBeInTheDocument();
  });

  it("reassigns a contact to someone else the user may assign to", async () => {
    vi.mocked(assignContact).mockResolvedValue({
      ...marcus,
      owner: { id: managerUser.id, name: managerUser.name },
    });
    const { user, table } = await renderContacts();

    await openAction(user, table, "Marcus Chen", "Reassign");
    const dialog = await screen.findByRole("dialog", { name: "Reassign Marcus Chen" });
    expect(dialog).toHaveTextContent("The contact is owned by Rob Rep.");
    await user.click(within(dialog).getByRole("combobox", { name: "New owner" }));
    // The current owner, Rob Rep, is not offered.
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["Ada Admin", "Mia Manager"]);
    await user.click(screen.getByRole("option", { name: "Mia Manager" }));
    await user.click(within(dialog).getByRole("button", { name: "Reassign" }));

    await waitFor(() => {
      expect(assignContact).toHaveBeenCalledWith(marcus.id, managerUser.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // The list is reloaded after the change.
    expect(listContacts).toHaveBeenCalledTimes(2);
  });

  it("explains a refused reassignment in the dialog and keeps it open", async () => {
    vi.mocked(assignContact).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "Server text",
      details: [{ path: "ownerId", message: "Choose someone on your team." }],
    });
    const { user, table } = await renderContacts();

    await openAction(user, table, "Marcus Chen", "Reassign");
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "New owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(within(dialog).getByRole("button", { name: "Reassign" }));

    expect(await within(dialog).findByText("Choose someone on your team.")).toBeInTheDocument();
  });

  it("asks before deleting, then deletes", async () => {
    vi.mocked(deleteContact).mockResolvedValue();
    const { user, table } = await renderContacts();

    await openAction(user, table, "Liam Gallagher", "Delete");
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Liam Gallagher?" });
    expect(dialog).toHaveTextContent("The contact and its timeline are removed for everyone.");
    expect(deleteContact).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteContact).toHaveBeenCalledWith(liam.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("does nothing when the delete is cancelled, and explains a refusal", async () => {
    vi.mocked(deleteContact).mockRejectedValue({
      code: "FORBIDDEN",
      message: "Server text",
      details: null,
    });
    const { user, table } = await renderContacts();

    await openAction(user, table, "Marcus Chen", "Delete");
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(deleteContact).not.toHaveBeenCalled();

    await openAction(user, table, "Marcus Chen", "Delete");
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
  });
});
