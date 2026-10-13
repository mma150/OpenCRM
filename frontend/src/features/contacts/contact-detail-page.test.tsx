import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { northwind } from "@/features/companies/companies.fixtures";
import { getEmailStatus } from "@/features/email-settings/email-settings.api";
import { listEmailTemplates } from "@/features/email-templates/email-templates.api";
import { getEmailDefaults } from "@/features/emails/emails.api";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listOpportunities } from "@/features/opportunities/opportunities.api";
import { fleet, opportunityList } from "@/features/opportunities/opportunities.fixtures";
import { listTasks } from "@/features/tasks/tasks.api";
import { taskList } from "@/features/tasks/tasks.fixtures";
import { addNote, listTimeline, logConversation } from "@/features/timeline/timeline.api";
import {
  call,
  created,
  reassigned,
  savedEntry,
  timelinePage,
} from "@/features/timeline/timeline.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import { formatRelativeDate } from "@/lib/format";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { ContactDetailPage } from "./contact-detail-page";
import { assignContact, deleteContact, getContact } from "./contacts.api";
import { liam, marcus } from "./contacts.fixtures";
import type { Contact } from "./contacts.types";

vi.mock("./contacts.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/opportunities/opportunities.api");
vi.mock("@/features/tasks/tasks.api");
vi.mock("@/features/timeline/timeline.api");
vi.mock("@/features/emails/emails.api");
vi.mock("@/features/email-settings/email-settings.api");
vi.mock("@/features/email-templates/email-templates.api");
vi.mock("sonner");

type TestUser = ReturnType<typeof renderWithStore>["user"];

const record = { type: "contact", id: marcus.id };

async function renderContact(contact: Contact = marcus, me: Me = adminUser) {
  vi.mocked(getContact).mockResolvedValue(contact);
  vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
  vi.mocked(listOpportunities).mockResolvedValue(opportunityList([fleet]));
  const view = renderWithStore(<ContactDetailPage id={contact.id} />, { me });
  await screen.findByRole("heading", { level: 1, name: contact.name });
  await screen.findByRole("list", { name: "Timeline entries" });
  await screen.findByRole("list", { name: "Opportunities" });
  return view;
}

// The card with this title: "Details" or "Notes".
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

describe("ContactDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The Tasks card of the record page loads on its own.
    vi.mocked(listTasks).mockResolvedValue(taskList([]));
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([call, created]));
    vi.mocked(listOpportunities).mockResolvedValue(opportunityList([fleet]));
    setMockLocation(`/contacts/${marcus.id}`);
  });

  it("shows the header: name, job title, a link to the company, and the owner", async () => {
    await renderContact();

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Director of Operations")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Northwind Logistics" })).toHaveAttribute(
      "href",
      `/companies/${northwind.id}`,
    );
    expect(within(header).getByText("Owner: Rob Rep")).toBeInTheDocument();
    expect(getContact).toHaveBeenCalledWith(marcus.id);
    expect(screen.getByRole("link", { name: "Back to contacts" })).toHaveAttribute(
      "href",
      "/contacts",
    );
  });

  it("shows the details, with email and phone as links, the company, and the notes", async () => {
    await renderContact();

    const details = within(card("Details"));
    expect(details.getByRole("link", { name: "m.chen@northwind.example" })).toHaveAttribute(
      "href",
      "mailto:m.chen@northwind.example",
    );
    expect(details.getByRole("link", { name: "+1 555 234 8901" })).toHaveAttribute(
      "href",
      "tel:+1 555 234 8901",
    );
    expect(details.getByRole("link", { name: "Northwind Logistics" })).toHaveAttribute(
      "href",
      `/companies/${northwind.id}`,
    );
    const value = (label: string) => details.getByText(label).nextElementSibling;
    expect(value("Owner")).toHaveTextContent("Rob Rep");
    expect(value("Last contact")).toHaveTextContent(formatRelativeDate(marcus.lastContactAt ?? ""));
    expect(value("Created")).toHaveTextContent("Oct 5, 2026");
    expect(value("Updated")).toHaveTextContent("Oct 6, 2026");
    expect(within(card("Notes")).getByText("Prefers a call before nine.")).toBeInTheDocument();
  });

  it("shows a dash for what a contact does not have, and says there are no notes", async () => {
    await renderContact(liam);

    const value = (label: string) => within(card("Details")).getByText(label).nextElementSibling;
    expect(value("Email")).toHaveTextContent("—");
    expect(value("Phone")).toHaveTextContent("—");
    expect(value("Company")).toHaveTextContent("—");
    expect(value("Last contact")).toHaveTextContent("Never");
    expect(screen.getByText("No notes yet.")).toBeInTheDocument();
    // No job title and no company: the header links to nothing but the edit form.
    const links = within(screen.getByRole("banner")).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Edit"]);
  });

  it("offers an Admin and a Sales Manager Edit, Reassign and Delete", async () => {
    const admin = await renderContact();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/contacts/${marcus.id}/edit`,
    );
    expect(await moreActionNames(admin.user)).toEqual(["Reassign", "Delete"]);
    admin.unmount();

    const manager = await renderContact(marcus, managerUser);
    expect(await moreActionNames(manager.user)).toEqual(["Reassign", "Delete"]);
  });

  it("gives a Sales Rep Edit and Delete, but no Reassign", async () => {
    const { user } = await renderContact(marcus, repUser);

    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
    expect(await moreActionNames(user)).toEqual(["Delete"]);
  });

  it("offers Send email to every role that may write, and opens the composer for the contact", async () => {
    for (const me of [managerUser, repUser]) {
      const { unmount } = await renderContact(marcus, me);
      expect(screen.getByRole("button", { name: "Send email" })).toBeInTheDocument();
      unmount();
    }
    expect(getEmailStatus).not.toHaveBeenCalled();

    vi.mocked(getEmailStatus).mockResolvedValue({ enabled: true });
    vi.mocked(listEmailTemplates).mockResolvedValue([]);
    vi.mocked(getEmailDefaults).mockResolvedValue({ recipients: [] });
    const { user } = await renderContact();
    await user.click(screen.getByRole("button", { name: "Send email" }));

    const dialog = await screen.findByRole("dialog", { name: "Send email" });
    expect(dialog).toHaveTextContent(marcus.name);
    expect(getEmailDefaults).toHaveBeenCalledWith({ type: "CONTACT", id: marcus.id });
    // A contact without an address still gets the composer, with To left to type.
    expect(within(dialog).getByLabelText("To")).toHaveValue("");
    expect(within(dialog).queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
  });

  it("gives a Read-only user no actions and no way to add to the timeline", async () => {
    await renderContact(marcus, readOnlyUser);

    expect(screen.queryByRole("button", { name: "Send email" })).not.toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save conversation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log conversation" })).not.toBeInTheDocument();
    // They still see everything.
    expect(screen.getByText("Prefers a call before nine.")).toBeInTheDocument();
    expect(timelineTitles()).toEqual(["Call", "Contact created"]);
  });

  it("loads the contact's own timeline and titles its entries", async () => {
    await renderContact();

    expect(listTimeline).toHaveBeenCalledWith(record, { page: 1, pageSize: 25 });
    expect(timelineTitles()).toEqual(["Call", "Contact created"]);
  });

  it("logs a conversation on the contact and moves Last contact forward", async () => {
    const occurredAt = new Date().toISOString();
    vi.mocked(logConversation).mockResolvedValue(
      savedEntry({ kind: "CONVERSATION", conversationType: "CALL", body: "Agreed.", occurredAt }),
    );
    const { user } = await renderContact();

    await user.type(screen.getByLabelText("What was discussed?"), "Agreed.");
    await user.click(screen.getByRole("button", { name: "Save conversation" }));

    await waitFor(() => {
      expect(logConversation).toHaveBeenCalledWith(
        record,
        expect.objectContaining({ type: "CALL", summary: "Agreed." }),
      );
    });
    await waitFor(() => {
      expect(timelineTitles()).toEqual(["Call", "Call", "Contact created"]);
    });
    const value = within(card("Details")).getByText("Last contact").nextElementSibling;
    expect(value).toHaveTextContent("Today");
  });

  it("adds a note to the contact", async () => {
    vi.mocked(addNote).mockResolvedValue(savedEntry({ kind: "NOTE", body: "Remember." }));
    const { user } = await renderContact();

    await user.click(screen.getByRole("button", { name: "Note" }));
    await user.type(screen.getByLabelText("Note"), "Remember.");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => {
      expect(addNote).toHaveBeenCalledWith(record, { body: "Remember." });
    });
  });

  it("reassigns the contact, then shows the new owner and the entry the API wrote", async () => {
    vi.mocked(assignContact).mockResolvedValue({
      ...marcus,
      owner: { id: managerUser.id, name: managerUser.name },
      updatedAt: "2026-10-09T09:00:00.000Z",
    });
    const { user } = await renderContact();
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([reassigned, call, created]));

    await user.click(within(await moreActions(user)).getByRole("menuitem", { name: "Reassign" }));
    const dialog = await screen.findByRole("dialog", { name: "Reassign Marcus Chen" });
    expect(dialog).toHaveClass("max-h-[90dvh]", "overflow-y-auto");
    await user.click(within(dialog).getByRole("combobox", { name: "New owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(within(dialog).getByRole("button", { name: "Reassign" }));

    await waitFor(() => {
      expect(assignContact).toHaveBeenCalledWith(marcus.id, managerUser.id);
    });
    expect(await screen.findByText("Owner: Mia Manager")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Marcus Chen was reassigned to Mia Manager.");
    await waitFor(() => {
      expect(timelineTitles()[0]).toBe("Reassigned from Ada Admin to Rob Rep");
    });
  });

  it("deletes the contact after asking, and goes back to the list", async () => {
    vi.mocked(deleteContact).mockResolvedValue();
    const { user } = await renderContact();

    await user.click(within(await moreActions(user)).getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Marcus Chen?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteContact).toHaveBeenCalledWith(marcus.id);
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/contacts");
    });
    expect(toast.success).toHaveBeenCalledWith("Marcus Chen was deleted.");
  });

  it("explains a refused delete in the dialog and stays on the page", async () => {
    vi.mocked(deleteContact).mockRejectedValue({
      code: "FORBIDDEN",
      message: "Server text",
      details: null,
    });
    const { user } = await renderContact();

    await user.click(within(await moreActions(user)).getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("says the contact was not found when it is missing or not the user's to see", async () => {
    vi.mocked(getContact).mockRejectedValue({
      code: "NOT_FOUND",
      message: "Server text",
      details: null,
    });
    renderWithStore(<ContactDetailPage id={marcus.id} />, { me: repUser });

    expect(await screen.findByText("Contact not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to contacts" })).toHaveAttribute(
      "href",
      "/contacts",
    );
    expect(listTimeline).not.toHaveBeenCalled();
  });

  it("shows any other load failure with Retry", async () => {
    vi.mocked(getContact)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(marcus);
    const { user } = renderWithStore(<ContactDetailPage id={marcus.id} />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Marcus Chen" }),
    ).toBeInTheDocument();
  });

  it("lists the contact's opportunities, with a way to add one with this contact", async () => {
    await renderContact();

    const opportunities = within(card("Opportunities"));
    expect(listOpportunities).toHaveBeenCalledWith({
      contactId: marcus.id,
      sort: "createdAt",
      order: "desc",
      page: 1,
      pageSize: 10,
    });
    expect(opportunities.getByRole("link", { name: "Fleet Expansion" })).toBeInTheDocument();
    expect(opportunities.getByRole("link", { name: "Add opportunity" })).toHaveAttribute(
      "href",
      `/opportunities/new?contactId=${marcus.id}&from=${encodeURIComponent(
        `/contacts/${marcus.id}`,
      )}`,
    );
  });

  it("offers a Read-only user no Add opportunity", async () => {
    await renderContact(marcus, readOnlyUser);

    expect(screen.queryByRole("link", { name: "Add opportunity" })).not.toBeInTheDocument();
  });

  it("names the lead a contact was converted from, with a link to it", async () => {
    await renderContact({
      ...marcus,
      convertedFromLead: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", name: "Marcus Chen (lead)" },
    });

    expect(screen.getByText("Converted from lead")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Marcus Chen (lead)" })).toHaveAttribute(
      "href",
      "/leads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
    );
  });

  it("shows one column at a time below lg: the timeline first, the details one tap away", async () => {
    const { user } = await renderContact();

    const sections = screen.getByRole("group", { name: "Section" });
    expect(
      within(sections)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Timeline", "Opportunities", "Details"]);
    const details = card("Details").parentElement;
    expect(details).toHaveClass("max-lg:hidden");
    await user.click(within(sections).getByRole("button", { name: "Details" }));
    expect(details).not.toHaveClass("max-lg:hidden");
  });
});
