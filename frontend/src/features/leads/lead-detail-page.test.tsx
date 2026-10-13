import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { getEmailStatus } from "@/features/email-settings/email-settings.api";
import { listEmailTemplates } from "@/features/email-templates/email-templates.api";
import { getEmailDefaults } from "@/features/emails/emails.api";
import { listTasks } from "@/features/tasks/tasks.api";
import { taskList } from "@/features/tasks/tasks.fixtures";
import { addNote, listTimeline, logConversation } from "@/features/timeline/timeline.api";
import {
  call,
  created,
  savedEntry,
  statusChanged,
  timelinePage,
} from "@/features/timeline/timeline.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { LeadDetailPage } from "./lead-detail-page";
import { assignLead, deleteLead, getLead, markLeadLost, updateLead } from "./leads.api";
import {
  assignableUsers,
  claire,
  converted,
  devon,
  liam,
  managerUser,
  marcus,
  readOnlyUser,
} from "./leads.fixtures";
import type { Lead } from "./leads.types";

vi.mock("./leads.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/tasks/tasks.api");
vi.mock("@/features/timeline/timeline.api");
vi.mock("@/features/emails/emails.api");
vi.mock("@/features/email-settings/email-settings.api");
vi.mock("@/features/email-templates/email-templates.api");
vi.mock("sonner");

type TestUser = ReturnType<typeof renderWithStore>["user"];

async function renderLead(lead: Lead = marcus, me: Me = adminUser) {
  vi.mocked(getLead).mockResolvedValue(lead);
  vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
  vi.mocked(listTimeline).mockResolvedValue(timelinePage([call, created]));
  const view = renderWithStore(<LeadDetailPage id={lead.id} />, { me });
  await screen.findByRole("heading", { level: 1, name: lead.name });
  await screen.findByRole("list", { name: "Timeline entries" });
  return view;
}

// The card with this title: "Details", "Notes", "Timeline" or "Marked as lost".
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

// The header shows the status twice for a user who may change it: the badge and the control.
function statusBadge() {
  return screen.getByRole("banner").querySelector("[data-slot=badge]");
}

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

describe("LeadDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The Tasks card of the record page loads on its own.
    vi.mocked(listTasks).mockResolvedValue(taskList([]));
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([call, created]));
    setMockLocation(`/leads/${marcus.id}`);
  });

  it("shows the header: name, status, company, job title and owner", async () => {
    await renderLead();

    const header = screen.getByRole("banner");
    expect(statusBadge()).toHaveTextContent("Contacted");
    expect(within(header).getByText("Northwind Logistics")).toBeInTheDocument();
    expect(within(header).getByText("Director of Operations")).toBeInTheDocument();
    expect(within(header).getByText("Owner: Rob Rep")).toBeInTheDocument();
    expect(getLead).toHaveBeenCalledWith(marcus.id);
  });

  it("shows the details, with email and phone as links and the value as money", async () => {
    await renderLead();

    expect(screen.getByRole("link", { name: "m.chen@northwind.example" })).toHaveAttribute(
      "href",
      "mailto:m.chen@northwind.example",
    );
    expect(screen.getByRole("link", { name: "+1 555 234 8901" })).toHaveAttribute(
      "href",
      "tel:+1 555 234 8901",
    );
    const value = (label: string) => screen.getByText(label).nextElementSibling;
    expect(value("Source")).toHaveTextContent("Website");
    expect(value("Owner")).toHaveTextContent("Rob Rep");
    expect(value("Estimated value")).toHaveTextContent("$48,000");
    expect(value("Created")).toHaveTextContent("Oct 5, 2026");
    expect(value("Updated")).toHaveTextContent("Oct 6, 2026");
    expect(screen.getByText("Wants a fleet pricing proposal.")).toBeInTheDocument();
  });

  it("shows a dash for what a lead does not have, and says there are no notes", async () => {
    await renderLead(liam);

    const value = (label: string) => within(card("Details")).getByText(label).nextElementSibling;
    expect(value("Email")).toHaveTextContent("—");
    expect(value("Phone")).toHaveTextContent("—");
    expect(value("Estimated value")).toHaveTextContent("—");
    expect(value("Last contact")).toHaveTextContent("Never");
    expect(screen.getByText("No notes yet.")).toBeInTheDocument();
    expect(screen.queryByText("Marked as lost")).not.toBeInTheDocument();
  });

  it("offers an Admin the status control, Edit, Reassign, Mark as lost and Delete", async () => {
    const { user } = await renderLead();

    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Contacted");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/leads/${marcus.id}/edit`,
    );
    expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument();
    expect(await moreActionNames(user)).toEqual(["Reassign", "Mark as lost", "Delete"]);
  });

  it("offers a Sales Manager the same, including Reassign", async () => {
    const { user } = await renderLead(marcus, managerUser);

    expect(await moreActionNames(user)).toEqual(["Reassign", "Mark as lost", "Delete"]);
  });

  it("gives a Sales Rep no Reassign", async () => {
    const { user } = await renderLead(marcus, repUser);

    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
    expect(await moreActionNames(user)).toEqual(["Mark as lost", "Delete"]);
  });

  it("offers Send email to every role that may write, and opens the composer for the lead", async () => {
    for (const me of [managerUser, repUser]) {
      const { unmount } = await renderLead(marcus, me);
      expect(screen.getByRole("button", { name: "Send email" })).toBeInTheDocument();
      unmount();
    }
    // Nothing about email is asked until the button is pressed.
    expect(getEmailStatus).not.toHaveBeenCalled();

    vi.mocked(getEmailStatus).mockResolvedValue({ enabled: true });
    vi.mocked(listEmailTemplates).mockResolvedValue([]);
    vi.mocked(getEmailDefaults).mockResolvedValue({
      recipients: [{ name: marcus.name, email: marcus.email ?? "", contactId: null }],
    });
    const { user } = await renderLead();
    await user.click(screen.getByRole("button", { name: "Send email" }));

    const dialog = await screen.findByRole("dialog", { name: "Send email" });
    expect(dialog).toHaveTextContent(marcus.name);
    expect(getEmailDefaults).toHaveBeenCalledWith({ type: "LEAD", id: marcus.id });
    expect(
      await within(dialog).findByRole("button", { name: `Remove ${marcus.email ?? ""}` }),
    ).toBeInTheDocument();
  });

  it("keeps Send email on a lost and on a converted lead, which still take email", async () => {
    for (const [lead, me] of [
      [devon, adminUser],
      [claire, adminUser],
      [claire, repUser],
    ] as const) {
      const { unmount } = await renderLead(lead, me);
      expect(screen.getByRole("button", { name: "Send email" })).toBeInTheDocument();
      unmount();
    }
  });

  it("gives a Read-only user no actions at all", async () => {
    await renderLead(marcus, readOnlyUser);

    expect(screen.queryByRole("button", { name: "Send email" })).not.toBeInTheDocument();

    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument();
    // They still see everything.
    expect(screen.getByText("Wants a fleet pricing proposal.")).toBeInTheDocument();
  });

  it("changes the status to one of New, Contacted and Qualified", async () => {
    vi.mocked(updateLead).mockResolvedValue({ ...marcus, status: "QUALIFIED" });
    const { user } = await renderLead();

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["New", "Contacted", "Qualified"]);
    await user.click(screen.getByRole("option", { name: "Qualified" }));

    await waitFor(() => {
      expect(updateLead).toHaveBeenCalledWith(marcus.id, { status: "QUALIFIED" });
    });
    await waitFor(() => {
      expect(statusBadge()).toHaveTextContent("Qualified");
    });
  });

  it("shows why, when and with what note a lead was lost, and offers Reopen", async () => {
    const { user } = await renderLead(devon);

    const lost = screen.getByText("Marked as lost").closest("[data-slot=card]");
    expect(lost).toHaveTextContent("Chose competitor");
    expect(lost).toHaveTextContent("Went with FleetTrack.");
    expect(lost).toHaveTextContent("Oct 7, 2026");
    // A lost lead is reopened, not moved with the status control or marked lost again.
    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
    expect(await moreActionNames(user)).toEqual(["Reassign", "Delete"]);

    vi.mocked(updateLead).mockResolvedValue({
      ...devon,
      status: "NEW",
      lostReason: null,
      lostNote: null,
      lostAt: null,
    });
    await user.click(screen.getByRole("button", { name: "Reopen" }));

    await waitFor(() => {
      expect(updateLead).toHaveBeenCalledWith(devon.id, { status: "NEW" });
    });
    await waitFor(() => {
      expect(screen.queryByText("Marked as lost")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("New");
  });

  it("shows a lost lead to a Read-only user without Reopen", async () => {
    await renderLead(devon, readOnlyUser);

    expect(screen.getByText("Marked as lost")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument();
  });

  it("offers only Reassign on a converted lead, and keeps its timeline open for writing", async () => {
    await renderLead(claire);

    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
    for (const name of ["Reopen", "Convert", "More actions"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reassign" })).toBeInTheDocument();
    // People keep talking: the API still takes conversations and notes.
    expect(screen.getByRole("button", { name: "Save conversation" })).toBeInTheDocument();
  });

  it("gives a Sales Rep no action at all on a converted lead", async () => {
    await renderLead(claire, repUser);

    expect(screen.queryByRole("button", { name: "Reassign" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("says what a converted lead became, with a link to each record", async () => {
    await renderLead(converted);

    const banner = within(screen.getByRole("region", { name: "Converted" }));
    expect(banner.getByText("Converted on Oct 8, 2026")).toBeInTheDocument();
    expect(banner.getByRole("link", { name: "Marcus Chen" })).toHaveAttribute(
      "href",
      `/contacts/${converted.convertedTo?.contact?.id ?? ""}`,
    );
    expect(banner.getByRole("link", { name: "Northwind Logistics" })).toHaveAttribute(
      "href",
      `/companies/${converted.convertedTo?.company?.id ?? ""}`,
    );
    expect(banner.getByRole("link", { name: "Fleet Expansion" })).toHaveAttribute(
      "href",
      `/opportunities/${converted.convertedTo?.opportunity?.id ?? ""}`,
    );
  });

  it("leaves out of the banner what the lead did not become or the user may not see", async () => {
    await renderLead({
      ...converted,
      convertedTo: {
        contact: converted.convertedTo?.contact ?? null,
        company: null,
        opportunity: null,
      },
    });

    const banner = within(screen.getByRole("region", { name: "Converted" }));
    expect(banner.getAllByRole("link")).toHaveLength(1);
  });

  it("offers Convert on an open lead only, and not to a Read-only user", async () => {
    await renderLead(marcus);
    expect(screen.getByRole("button", { name: "Convert" })).toBeInTheDocument();
  });

  it("offers no Convert on a lost lead: it is reopened first", async () => {
    await renderLead(devon);
    expect(screen.queryByRole("button", { name: "Convert" })).not.toBeInTheDocument();
  });

  it("offers a Read-only user no Convert", async () => {
    await renderLead(marcus, readOnlyUser);
    expect(screen.queryByRole("button", { name: "Convert" })).not.toBeInTheDocument();
  });

  it("marks the lead as lost from the dialog and then shows the lost state", async () => {
    vi.mocked(markLeadLost).mockResolvedValue({
      ...marcus,
      status: "LOST",
      lostReason: "NO_BUDGET",
      lostNote: null,
      lostAt: "2026-10-09T09:00:00.000Z",
    });
    const { user } = await renderLead();

    await user.click(
      within(await moreActions(user)).getByRole("menuitem", { name: "Mark as lost" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Mark Marcus Chen as lost" });
    expect(dialog).toHaveClass("max-h-[90dvh]", "overflow-y-auto");
    await user.click(within(dialog).getByRole("combobox", { name: "Reason" }));
    const reasons = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(reasons).toEqual(["Price", "Chose competitor", "No budget", "No response", "Other"]);
    await user.click(screen.getByRole("option", { name: "No budget" }));
    await user.click(within(dialog).getByRole("button", { name: "Mark as lost" }));

    await waitFor(() => {
      // An empty note is not sent.
      expect(markLeadLost).toHaveBeenCalledWith(marcus.id, { reason: "NO_BUDGET" });
    });
    expect(await screen.findByText("Marked as lost")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains a refused mark-as-lost in the dialog and keeps it open", async () => {
    vi.mocked(markLeadLost).mockRejectedValue({
      code: "FORBIDDEN",
      message: "Server text",
      details: null,
    });
    const { user } = await renderLead();

    await user.click(
      within(await moreActions(user)).getByRole("menuitem", { name: "Mark as lost" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Reason" }));
    await user.click(await screen.findByRole("option", { name: "Other" }));
    await user.click(within(dialog).getByRole("button", { name: "Mark as lost" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You do not have permission to do that.",
    );
  });

  it("reassigns the lead and shows the new owner", async () => {
    vi.mocked(assignLead).mockResolvedValue({
      ...marcus,
      owner: { id: managerUser.id, name: managerUser.name },
    });
    const { user } = await renderLead();

    await user.click(within(await moreActions(user)).getByRole("menuitem", { name: "Reassign" }));
    const dialog = await screen.findByRole("dialog", { name: "Reassign Marcus Chen" });
    await user.click(await within(dialog).findByRole("combobox", { name: "New owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(within(dialog).getByRole("button", { name: "Reassign" }));

    await waitFor(() => {
      expect(assignLead).toHaveBeenCalledWith(marcus.id, managerUser.id);
    });
    expect(
      await within(screen.getByRole("banner")).findByText("Owner: Mia Manager"),
    ).toBeInTheDocument();
  });

  it("says so when there is nobody else to reassign to", async () => {
    const { user } = await renderLead();
    vi.mocked(listAssignableUsers).mockResolvedValue([
      { id: repUser.id, name: repUser.name, role: "SALES_REP" },
    ]);

    await user.click(within(await moreActions(user)).getByRole("menuitem", { name: "Reassign" }));
    const dialog = await screen.findByRole("dialog");

    expect(
      await within(dialog).findByText("There is nobody else you can assign this lead to."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Reassign" })).toBeDisabled();
  });

  it("asks before deleting, then deletes and goes back to the list", async () => {
    vi.mocked(deleteLead).mockResolvedValue();
    const { user } = await renderLead();

    await user.click(within(await moreActions(user)).getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Marcus Chen?" });
    expect(deleteLead).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteLead).toHaveBeenCalledWith(marcus.id);
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/leads");
    });
  });

  it("says the lead was not found when it is missing or not the user's to see", async () => {
    vi.mocked(getLead).mockRejectedValue({
      code: "NOT_FOUND",
      message: "Server text",
      details: null,
    });
    renderWithStore(<LeadDetailPage id={marcus.id} />, { me: repUser });

    expect(await screen.findByText("Lead not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to leads" })).toHaveAttribute("href", "/leads");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("treats an address that is not a lead id as not found", async () => {
    vi.mocked(getLead).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "Server text",
      details: [{ path: "id", message: "Invalid UUID" }],
    });
    renderWithStore(<LeadDetailPage id="nonsense" />, { me: adminUser });

    expect(await screen.findByText("Lead not found")).toBeInTheDocument();
  });

  it("shows any other load failure with Retry", async () => {
    vi.mocked(getLead)
      .mockRejectedValueOnce({ code: "NETWORK_ERROR", message: "Server text", details: null })
      .mockResolvedValueOnce(marcus);
    const { user } = renderWithStore(<LeadDetailPage id={marcus.id} />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Marcus Chen" }),
    ).toBeInTheDocument();
  });

  it("puts the timeline in the wide column, with Details and Notes beside it", async () => {
    await renderLead();

    const side = card("Details").parentElement;
    const main = card("Timeline").parentElement;
    expect(side?.parentElement).toHaveClass("grid", "lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(side).toHaveClass("lg:order-last");
    expect(card("Notes").parentElement).toBe(side);
    expect(main).not.toHaveClass("lg:order-last");
    expect(listTimeline).toHaveBeenCalledWith(
      { type: "lead", id: marcus.id },
      { page: 1, pageSize: 25 },
    );
    expect(timelineTitles()).toEqual(["Call", "Lead created"]);
  });

  it("shows one column at a time below lg: the timeline first, Details one tap away", async () => {
    const { user } = await renderLead();

    const side = card("Details").parentElement;
    const main = card("Timeline").parentElement;
    const sections = within(screen.getByRole("group", { name: "Section" }));
    expect(sections.getByRole("button", { name: "Timeline" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(side).toHaveClass("max-lg:hidden");
    expect(main).not.toHaveClass("max-lg:hidden");

    await user.click(sections.getByRole("button", { name: "Details" }));
    expect(side).not.toHaveClass("max-lg:hidden");
    expect(main).toHaveClass("max-lg:hidden");
  });

  it("shows when the lead was last contacted, and moves it when a conversation is logged", async () => {
    const saved = savedEntry({ kind: "CONVERSATION", conversationType: "CALL", body: "Hello." });
    vi.mocked(logConversation).mockResolvedValue(saved);
    const { user } = await renderLead();
    const lastContact = () => within(card("Details")).getByText("Last contact").nextElementSibling;
    expect(lastContact()).toHaveTextContent("Sep 20, 2026");

    await user.type(screen.getByLabelText("What was discussed?"), "Hello.");
    await user.click(screen.getByRole("button", { name: "Save conversation" }));

    await waitFor(() => {
      expect(lastContact()).toHaveTextContent("Today");
    });
    expect(logConversation).toHaveBeenCalledWith(
      { type: "lead", id: marcus.id },
      expect.objectContaining({ type: "CALL", summary: "Hello." }),
    );
    expect(timelineTitles()).toEqual(["Call", "Call", "Lead created"]);
    // The lead itself was not loaded again.
    expect(getLead).toHaveBeenCalledTimes(1);
  });

  it("adds a note from the lead page", async () => {
    vi.mocked(addNote).mockResolvedValue(savedEntry({ kind: "NOTE", body: "Remember." }));
    const { user } = await renderLead();

    await user.click(screen.getByRole("button", { name: "Note" }));
    await user.type(screen.getByLabelText("Note"), "Remember.");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => {
      expect(timelineTitles()).toEqual(["Note", "Call", "Lead created"]);
    });
    expect(addNote).toHaveBeenCalledWith({ type: "lead", id: marcus.id }, { body: "Remember." });
  });

  it("loads the timeline again after a status change, so the new entry shows", async () => {
    const { user } = await renderLead();
    expect(listTimeline).toHaveBeenCalledTimes(1);

    vi.mocked(updateLead).mockResolvedValue({
      ...marcus,
      status: "QUALIFIED",
      updatedAt: "2026-10-09T10:00:00.000Z",
    });
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([statusChanged, call, created]));
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "Qualified" }));

    await waitFor(() => {
      expect(timelineTitles()).toEqual(["Status changed: New → Contacted", "Call", "Lead created"]);
    });
    expect(listTimeline).toHaveBeenCalledTimes(2);
  });

  it("loads the timeline again after the lead is marked as lost or reassigned", async () => {
    const { user } = await renderLead();

    vi.mocked(markLeadLost).mockResolvedValue({
      ...marcus,
      status: "LOST",
      lostReason: "PRICE",
      lostAt: "2026-10-09T10:00:00.000Z",
      updatedAt: "2026-10-09T10:00:00.000Z",
    });
    await user.click(
      await within(await moreActions(user)).findByRole("menuitem", { name: "Mark as lost" }),
    );
    const lostDialog = await screen.findByRole("dialog");
    await user.click(within(lostDialog).getByRole("combobox", { name: "Reason" }));
    await user.click(await screen.findByRole("option", { name: "Price" }));
    await user.click(within(lostDialog).getByRole("button", { name: "Mark as lost" }));
    await waitFor(() => {
      expect(listTimeline).toHaveBeenCalledTimes(2);
    });

    vi.mocked(assignLead).mockResolvedValue({
      ...marcus,
      status: "LOST",
      owner: { id: managerUser.id, name: managerUser.name },
      updatedAt: "2026-10-09T11:00:00.000Z",
    });
    await user.click(
      await within(await moreActions(user)).findByRole("menuitem", { name: "Reassign" }),
    );
    const reassignDialog = await screen.findByRole("dialog");
    await user.click(await within(reassignDialog).findByRole("combobox", { name: "New owner" }));
    await user.click(await screen.findByRole("option", { name: managerUser.name }));
    await user.click(within(reassignDialog).getByRole("button", { name: "Reassign" }));
    await waitFor(() => {
      expect(listTimeline).toHaveBeenCalledTimes(3);
    });
  });

  it("gives a Sales Manager and a Sales Rep the form that adds to the timeline", async () => {
    for (const me of [managerUser, repUser]) {
      const { unmount } = await renderLead(marcus, me);
      expect(screen.getByRole("form", { name: "Add to timeline" })).toBeInTheDocument();
      unmount();
    }
  });

  it("shows a Read-only user the timeline without the form", async () => {
    await renderLead(marcus, readOnlyUser);

    expect(timelineTitles()).toEqual(["Call", "Lead created"]);
    expect(screen.queryByRole("form", { name: "Add to timeline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log conversation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
  });
});
