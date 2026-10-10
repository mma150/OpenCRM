import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { listContacts } from "@/features/contacts/contacts.api";
import { contactList, elena, liam, marcus } from "@/features/contacts/contacts.fixtures";
import type { ContactList } from "@/features/contacts/contacts.types";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listOpportunities } from "@/features/opportunities/opportunities.api";
import { fleet, opportunityList } from "@/features/opportunities/opportunities.fixtures";
import { listTasks } from "@/features/tasks/tasks.api";
import { taskList } from "@/features/tasks/tasks.fixtures";
import { addNote, listTimeline, logConversation } from "@/features/timeline/timeline.api";
import { call, created, savedEntry, timelinePage } from "@/features/timeline/timeline.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { assignCompany, deleteCompany, getCompany } from "./companies.api";
import { brightpath, kestrel, northwind } from "./companies.fixtures";
import type { Company } from "./companies.types";
import { CompanyDetailPage } from "./company-detail-page";

vi.mock("./companies.api");
vi.mock("@/features/contacts/contacts.api");
vi.mock("@/features/opportunities/opportunities.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/tasks/tasks.api");
vi.mock("@/features/timeline/timeline.api");
vi.mock("sonner");

type TestUser = ReturnType<typeof renderWithStore>["user"];

const record = { type: "company", id: northwind.id };
const addContactHref = `/contacts/new?companyId=${northwind.id}&from=${encodeURIComponent(
  `/companies/${northwind.id}`,
)}`;

async function renderCompany(
  company: Company = northwind,
  me: Me = adminUser,
  contacts: ContactList = contactList([elena, marcus]),
) {
  vi.mocked(getCompany).mockResolvedValue(company);
  vi.mocked(listContacts).mockResolvedValue(contacts);
  vi.mocked(listOpportunities).mockResolvedValue(opportunityList([fleet]));
  vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
  const view = renderWithStore(<CompanyDetailPage id={company.id} />, { me });
  await screen.findByRole("heading", { level: 1, name: company.name });
  await screen.findByRole("list", { name: "Timeline entries" });
  await waitFor(() => {
    expect(screen.queryByRole("status", { name: "Loading contacts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading opportunities" })).not.toBeInTheDocument();
  });
  return view;
}

// The card with this title: "Contacts", "Timeline", "Details" or "Notes".
function card(title: string) {
  const found = screen
    .getAllByText(title)
    .find((element) => element.closest("[data-slot=card-title]"))
    ?.closest<HTMLElement>("[data-slot=card]");
  if (!found) {
    throw new Error(`No card titled ${title}`);
  }
  return found;
}

const timelineTitles = () =>
  within(screen.getByRole("list", { name: "Timeline entries" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p")?.textContent);

async function moreActions(user: TestUser) {
  await user.click(screen.getByRole("button", { name: "More actions" }));
  return screen.findByRole("menu");
}

async function moreActionNames(user: TestUser) {
  const menu = await moreActions(user);
  const names = within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
  await user.keyboard("{Escape}");
  return names;
}

describe("CompanyDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The Tasks card of the record page loads on its own.
    vi.mocked(listTasks).mockResolvedValue(taskList([]));
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([call, created]));
    vi.mocked(listOpportunities).mockResolvedValue(opportunityList([fleet]));
    setMockLocation(`/companies/${northwind.id}`);
  });

  it("shows the header: name, industry, a link to the website, and the owner", async () => {
    await renderCompany();

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Logistics")).toBeInTheDocument();
    const website = within(header).getByRole("link", { name: "northwind.example" });
    expect(website).toHaveAttribute("href", "https://northwind.example/");
    expect(website).toHaveAttribute("target", "_blank");
    expect(within(header).getByText("Owner: Rob Rep")).toBeInTheDocument();
    expect(getCompany).toHaveBeenCalledWith(northwind.id);
  });

  it("shows the details: website, phone as a link, address with its line breaks, owner, dates", async () => {
    await renderCompany();

    const details = within(card("Details"));
    expect(details.getByRole("link", { name: "northwind.example" })).toBeInTheDocument();
    expect(details.getByRole("link", { name: "+1 555 234 8900" })).toHaveAttribute(
      "href",
      "tel:+1 555 234 8900",
    );
    const address = details.getByText(/4200 S Michigan Ave/);
    expect(address).toHaveClass("whitespace-pre-wrap");
    expect(address).toHaveTextContent("Chicago, IL 60653");
    const value = (label: string) => details.getByText(label).nextElementSibling;
    expect(value("Industry")).toHaveTextContent("Logistics");
    expect(value("Owner")).toHaveTextContent("Rob Rep");
    expect(value("Created")).toHaveTextContent("Oct 5, 2026");
    expect(value("Updated")).toHaveTextContent("Oct 6, 2026");
    expect(within(card("Notes")).getByText("Renewal comes up in spring.")).toBeInTheDocument();
  });

  it("shows a dash for what a company does not have, and says there are no notes", async () => {
    await renderCompany(brightpath, adminUser, contactList([]));

    const value = (label: string) => within(card("Details")).getByText(label).nextElementSibling;
    expect(value("Website")).toHaveTextContent("—");
    expect(value("Phone")).toHaveTextContent("—");
    expect(value("Industry")).toHaveTextContent("—");
    expect(value("Address")).toHaveTextContent("—");
    expect(screen.getByText("No notes yet.")).toBeInTheDocument();
  });

  it("lists the company's contacts by name, each a link, with job title, email and phone", async () => {
    await renderCompany();

    expect(listContacts).toHaveBeenCalledWith({
      companyId: northwind.id,
      sort: "name",
      order: "asc",
      page: 1,
      pageSize: 10,
    });
    const contacts = within(card("Contacts"));
    expect(card("Contacts")).toHaveTextContent("2 total");
    const items = contacts.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(contacts.getByRole("link", { name: "Marcus Chen" })).toHaveAttribute(
      "href",
      `/contacts/${marcus.id}`,
    );
    expect(contacts.getByText("Director of Operations")).toBeInTheDocument();
    expect(contacts.getByRole("link", { name: "m.chen@northwind.example" })).toHaveAttribute(
      "href",
      "mailto:m.chen@northwind.example",
    );
    expect(contacts.getByRole("link", { name: "+1 555 234 8901" })).toHaveAttribute(
      "href",
      "tel:+1 555 234 8901",
    );
    // Not everything fits a phone: long names and addresses wrap inside the card.
    expect(contacts.getByRole("link", { name: "Marcus Chen" })).toHaveClass("wrap-anywhere");
    expect(contacts.queryByRole("link", { name: /View all/ })).not.toBeInTheDocument();
  });

  it("links to the full, filtered contacts list when the company has more than it shows", async () => {
    await renderCompany(northwind, adminUser, contactList([elena, marcus], { total: 14 }));

    expect(card("Contacts")).toHaveTextContent("14 total");
    expect(screen.getByRole("link", { name: "View all 14 contacts" })).toHaveAttribute(
      "href",
      `/contacts?companyId=${northwind.id}`,
    );
  });

  it("says when the company has no contacts, and offers to add the first", async () => {
    await renderCompany(brightpath, adminUser, contactList([]));

    const contacts = within(card("Contacts"));
    expect(contacts.getByText("No contacts yet")).toBeInTheDocument();
    expect(contacts.getByText("Add the people you deal with at this company.")).toBeInTheDocument();
    expect(contacts.getByRole("link", { name: "Add contact" })).toBeInTheDocument();
  });

  it("explains when the contacts cannot be loaded, and tries again", async () => {
    vi.mocked(getCompany).mockResolvedValue(northwind);
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    vi.mocked(listContacts)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(contactList([liam]));
    const { user } = renderWithStore(<CompanyDetailPage id={northwind.id} />, { me: adminUser });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The server cannot be reached.");
    // The rest of the page is there all the same.
    expect(screen.getByRole("heading", { level: 1, name: northwind.name })).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("link", { name: "Liam Gallagher" })).toBeInTheDocument();
  });

  it("opens the new-contact form with this company filled in, from the header and the card", async () => {
    await renderCompany();

    const links = screen.getAllByRole("link", { name: "Add contact" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", addContactHref);
    }
  });

  it("offers an Admin and a Sales Manager Add contact, Edit, Reassign and Delete", async () => {
    const admin = await renderCompany();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/companies/${northwind.id}/edit`,
    );
    expect(await moreActionNames(admin.user)).toEqual(["Reassign", "Delete"]);
    admin.unmount();

    const manager = await renderCompany(northwind, managerUser);
    expect(await moreActionNames(manager.user)).toEqual(["Reassign", "Delete"]);
  });

  it("gives a Sales Rep Add contact, Edit and Delete, but no Reassign", async () => {
    const { user } = await renderCompany(northwind, repUser);

    expect(screen.getAllByRole("link", { name: "Add contact" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
    expect(await moreActionNames(user)).toEqual(["Delete"]);
  });

  it("gives a Read-only user no actions, and still shows the contacts and the timeline", async () => {
    await renderCompany(northwind, readOnlyUser);

    expect(screen.queryByRole("link", { name: "Add contact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save conversation" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Marcus Chen" })).toBeInTheDocument();
    expect(timelineTitles()).toEqual(["Call", "Company created"]);
  });

  it("tells a Read-only user plainly when a company has no contacts", async () => {
    await renderCompany(brightpath, readOnlyUser, contactList([]));

    expect(screen.getByText("Contacts linked to this company will show here.")).toBeInTheDocument();
  });

  it("puts the contacts above the timeline in the wide column, with Details and Notes beside them", async () => {
    await renderCompany();

    const side = card("Details").parentElement;
    const wide = card("Timeline").parentElement?.parentElement;
    expect(side?.parentElement).toHaveClass("grid", "lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(side).toHaveClass("lg:order-last");
    expect(card("Notes").parentElement).toBe(side);
    expect(card("Contacts").parentElement?.parentElement).toBe(wide);
    expect(wide?.firstElementChild).toBe(card("Contacts").parentElement);
  });

  it("lists the company's opportunities, with a way to add one in this company", async () => {
    await renderCompany();

    const opportunities = within(card("Opportunities"));
    expect(listOpportunities).toHaveBeenCalledWith({
      companyId: northwind.id,
      sort: "createdAt",
      order: "desc",
      page: 1,
      pageSize: 10,
    });
    expect(opportunities.getByRole("link", { name: "Fleet Expansion" })).toHaveAttribute(
      "href",
      `/opportunities/${fleet.id}`,
    );
    expect(opportunities.getByRole("link", { name: "Add opportunity" })).toHaveAttribute(
      "href",
      `/opportunities/new?companyId=${northwind.id}&from=${encodeURIComponent(
        `/companies/${northwind.id}`,
      )}`,
    );
  });

  it("offers a Read-only user no Add opportunity", async () => {
    await renderCompany(northwind, readOnlyUser);

    expect(within(card("Opportunities")).getByText("Fleet Expansion")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add opportunity" })).not.toBeInTheDocument();
  });

  it("shows one section at a time below lg: Timeline, Contacts, Opportunities or Details", async () => {
    const { user } = await renderCompany();

    const sections = within(screen.getByRole("group", { name: "Section" }));
    expect(sections.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Timeline",
      "Contacts",
      "Opportunities",
      "Details",
    ]);
    const timeline = card("Timeline").parentElement;
    const contacts = card("Contacts").parentElement;
    const details = card("Details").parentElement;
    expect(timeline).not.toHaveClass("max-lg:hidden");
    expect(contacts).toHaveClass("max-lg:hidden");
    expect(details).toHaveClass("max-lg:hidden");

    await user.click(sections.getByRole("button", { name: "Contacts" }));
    expect(contacts).not.toHaveClass("max-lg:hidden");
    expect(timeline).toHaveClass("max-lg:hidden");
    expect(details).toHaveClass("max-lg:hidden");

    await user.click(sections.getByRole("button", { name: "Details" }));
    expect(details).not.toHaveClass("max-lg:hidden");
    expect(contacts?.parentElement).toHaveClass("max-lg:hidden");
  });

  it("loads the company's own timeline, and logs a conversation and a note on it", async () => {
    vi.mocked(logConversation).mockResolvedValue(
      savedEntry({ kind: "CONVERSATION", conversationType: "CALL", body: "Agreed." }),
    );
    vi.mocked(addNote).mockResolvedValue({
      ...savedEntry({ kind: "NOTE", body: "Remember." }),
      id: "eeeeeeee-eeee-4eee-8eee-000000000098",
    });
    const { user } = await renderCompany();
    expect(listTimeline).toHaveBeenCalledWith(record, { page: 1, pageSize: 25 });
    expect(timelineTitles()).toEqual(["Call", "Company created"]);

    await user.type(screen.getByLabelText("What was discussed?"), "Agreed.");
    await user.click(screen.getByRole("button", { name: "Save conversation" }));
    await waitFor(() => {
      expect(logConversation).toHaveBeenCalledWith(
        record,
        expect.objectContaining({ type: "CALL", summary: "Agreed." }),
      );
    });

    await user.click(screen.getByRole("button", { name: "Note" }));
    await user.type(screen.getByLabelText("Note"), "Remember.");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => {
      expect(addNote).toHaveBeenCalledWith(record, { body: "Remember." });
    });
  });

  it("reassigns the company and shows the new owner", async () => {
    vi.mocked(assignCompany).mockResolvedValue({
      ...northwind,
      owner: { id: managerUser.id, name: managerUser.name },
      updatedAt: "2026-10-09T09:00:00.000Z",
    });
    const { user } = await renderCompany();

    await user.click(within(await moreActions(user)).getByRole("menuitem", { name: "Reassign" }));
    const dialog = await screen.findByRole("dialog", { name: "Reassign Northwind Logistics" });
    await user.click(within(dialog).getByRole("combobox", { name: "New owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(within(dialog).getByRole("button", { name: "Reassign" }));

    await waitFor(() => {
      expect(assignCompany).toHaveBeenCalledWith(northwind.id, managerUser.id);
    });
    expect(await screen.findByText("Owner: Mia Manager")).toBeInTheDocument();
    // The timeline is loaded again for the entry the API wrote.
    await waitFor(() => {
      expect(listTimeline).toHaveBeenCalledTimes(2);
    });
  });

  it("warns that the contacts lose the link, deletes after asking, and goes back to the list", async () => {
    vi.mocked(deleteCompany).mockResolvedValue();
    const { user } = await renderCompany(kestrel);

    await user.click(within(await moreActions(user)).getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Kestrel Robotics?" });
    expect(dialog).toHaveClass("max-h-[90dvh]", "overflow-y-auto");
    expect(dialog).toHaveTextContent("Its 1 contact stays, but is no longer linked to a company.");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteCompany).toHaveBeenCalledWith(kestrel.id);
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/companies");
    });
    expect(toast.success).toHaveBeenCalledWith("Kestrel Robotics was deleted.");
  });

  it("says the company was not found when it is missing or not the user's to see", async () => {
    vi.mocked(getCompany).mockRejectedValue({
      code: "NOT_FOUND",
      message: "Server text",
      details: null,
    });
    renderWithStore(<CompanyDetailPage id={northwind.id} />, { me: repUser });

    expect(await screen.findByText("Company not found")).toBeInTheDocument();
    expect(listTimeline).not.toHaveBeenCalled();
    expect(listContacts).not.toHaveBeenCalled();
  });
});
