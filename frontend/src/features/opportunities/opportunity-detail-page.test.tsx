import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { northwind } from "@/features/companies/companies.fixtures";
import { marcus } from "@/features/contacts/contacts.fixtures";
import { getEmailStatus } from "@/features/email-settings/email-settings.api";
import { listEmailTemplates } from "@/features/email-templates/email-templates.api";
import { getEmailDefaults } from "@/features/emails/emails.api";
import { assignableUsers, managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listPipelineStages } from "@/features/pipeline-stages/pipeline-stages.api";
import {
  newStage,
  pipeline,
  proposalStage,
} from "@/features/pipeline-stages/pipeline-stages.fixtures";
import { listTasks } from "@/features/tasks/tasks.api";
import { taskList } from "@/features/tasks/tasks.fixtures";
import { addNote, listTimeline, logConversation } from "@/features/timeline/timeline.api";
import { call, created, savedEntry, timelinePage } from "@/features/timeline/timeline.fixtures";
import type { TimelineEntry } from "@/features/timeline/timeline.types";
import { listAssignableUsers } from "@/features/users/users.api";
import { mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import {
  assignOpportunity,
  closeOpportunity,
  deleteOpportunity,
  getOpportunity,
  moveOpportunity,
  reopenOpportunity,
} from "./opportunities.api";
import { fleet, inStage, lostDeal, walkIn, wonDeal } from "./opportunities.fixtures";
import type { Opportunity } from "./opportunities.types";
import { OpportunityDetailPage } from "./opportunity-detail-page";

vi.mock("./opportunities.api");
vi.mock("@/features/pipeline-stages/pipeline-stages.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/tasks/tasks.api");
vi.mock("@/features/timeline/timeline.api");
vi.mock("@/features/emails/emails.api");
vi.mock("@/features/email-settings/email-settings.api");
vi.mock("@/features/email-templates/email-templates.api");
vi.mock("sonner");

const record = { type: "opportunity", id: fleet.id };

async function renderOpportunity(opportunity: Opportunity = fleet, me: Me = adminUser) {
  vi.mocked(getOpportunity).mockResolvedValue(opportunity);
  const view = renderWithStore(<OpportunityDetailPage id={opportunity.id} />, { me });
  await screen.findByRole("heading", { level: 1, name: opportunity.name });
  await screen.findByRole("list", { name: "Timeline entries" });
  await screen.findByRole("navigation", { name: "Stage" });
  return view;
}

const stepper = () => within(screen.getByRole("navigation", { name: "Stage" }));

const timelineTitles = () =>
  within(screen.getByRole("list", { name: "Timeline entries" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p")?.textContent);

// An entry the API writes when an opportunity changes stage.
function stageChange(details: TimelineEntry["details"]): TimelineEntry {
  return { ...created, id: `stage-${JSON.stringify(details)}`, kind: "STATUS_CHANGE", details };
}

describe("OpportunityDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The Tasks card of the record page loads on its own.
    vi.mocked(listTasks).mockResolvedValue(taskList([]));
    vi.mocked(listPipelineStages).mockResolvedValue(pipeline);
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([call, created]));
    setMockLocation(`/opportunities/${fleet.id}`);
  });

  it("shows the header and the details: stage, company, value, close date, contact, owner", async () => {
    await renderOpportunity();

    const header = within(screen.getByRole("banner"));
    expect(header.getByText("New")).toBeInTheDocument();
    expect(header.getByRole("link", { name: "Northwind Logistics" })).toHaveAttribute(
      "href",
      `/companies/${northwind.id}`,
    );
    expect(header.getByText("Value: $48,000")).toBeInTheDocument();
    expect(header.getByText("Expected close: Nov 15, 2026")).toBeInTheDocument();
    expect(header.getByText("Owner: Rob Rep")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Marcus Chen" })).toHaveAttribute(
      "href",
      `/contacts/${marcus.id}`,
    );
    expect(screen.getByText("Wants a pilot first.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to opportunities" })).toHaveAttribute(
      "href",
      "/opportunities",
    );
    expect(screen.queryByRole("region", { name: "Outcome" })).not.toBeInTheDocument();
  });

  it("shows a dash for what an opportunity does not have, and $0 for no value", async () => {
    await renderOpportunity(walkIn);

    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByText("Value: $0")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.queryByText("Converted from lead")).not.toBeInTheDocument();
  });

  it("names the lead an opportunity was converted from, with a link to it", async () => {
    await renderOpportunity({
      ...fleet,
      convertedFromLead: { id: "lead-1", name: "Marcus (lead)" },
    });

    expect(screen.getByText("Converted from lead")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Marcus (lead)" })).toHaveAttribute(
      "href",
      "/leads/lead-1",
    );
  });

  it("shows the open stages as steps, with the current one marked", async () => {
    await renderOpportunity(inStage(fleet, proposalStage));

    const steps = stepper().getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "New",
      "Qualified",
      "3Proposal",
      "4Negotiation",
    ]);
    expect(stepper().getByText("Proposal").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "step",
    );
    // Every other step moves the opportunity there; the current one is not a button.
    expect(
      stepper()
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Move to New", "Move to Qualified", "Move to Negotiation"]);
  });

  it("moves the opportunity to the step that is chosen, and reloads the timeline", async () => {
    vi.mocked(moveOpportunity).mockResolvedValue({
      ...inStage(fleet, proposalStage),
      updatedAt: "2026-10-09T09:00:00.000Z",
    });
    const { user } = await renderOpportunity();
    vi.mocked(listTimeline).mockClear();

    await user.click(stepper().getByRole("button", { name: "Move to Proposal" }));

    await waitFor(() => {
      expect(moveOpportunity).toHaveBeenCalledWith(fleet.id, proposalStage.id);
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Fleet Expansion moved to Proposal.");
    });
    expect(stepper().queryByRole("button", { name: "Move to Proposal" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(listTimeline).toHaveBeenCalledWith(record, expect.anything());
    });
  });

  it("says so when the move is refused, and stays in the stage it was in", async () => {
    vi.mocked(moveOpportunity).mockRejectedValue({
      code: "FORBIDDEN",
      message: "x",
      details: null,
    });
    const { user } = await renderOpportunity();

    await user.click(stepper().getByRole("button", { name: "Move to Proposal" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Fleet Expansion could not be moved. You do not have permission to do that.",
      );
    });
    expect(stepper().getByRole("button", { name: "Move to Proposal" })).toBeInTheDocument();
  });

  it("closes as won with an optional reason, then shows the outcome", async () => {
    vi.mocked(closeOpportunity).mockResolvedValue({ ...wonDeal, id: fleet.id, name: fleet.name });
    const { user } = await renderOpportunity();

    await user.click(screen.getByRole("button", { name: "Close as won" }));
    const dialog = within(
      await screen.findByRole("dialog", { name: "Close Fleet Expansion as won" }),
    );
    expect(dialog.getByLabelText("Reason (optional)")).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Close as won" }));

    await waitFor(() => {
      expect(closeOpportunity).toHaveBeenCalledWith(fleet.id, { outcome: "WON" });
    });
    const outcome = within(await screen.findByRole("region", { name: "Outcome" }));
    expect(outcome.getByText("Closed as won on Oct 7, 2026")).toBeInTheDocument();
    expect(outcome.getByText("Signed after the pilot.")).toBeInTheDocument();
  });

  it("needs a reason to close as lost, and puts the API's reason error on the field", async () => {
    vi.mocked(closeOpportunity).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "x",
      details: [{ path: "reason", message: "Say why the opportunity was lost" }],
    });
    const { user } = await renderOpportunity();

    await user.click(screen.getByRole("button", { name: "Close as lost" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Close as lost" }));
    expect(await dialog.findByText("Say why the opportunity was lost.")).toBeInTheDocument();
    expect(closeOpportunity).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText("Reason"), "Price");
    await user.click(dialog.getByRole("button", { name: "Close as lost" }));
    expect(await dialog.findByText("Say why the opportunity was lost")).toBeInTheDocument();
    expect(dialog.getByLabelText("Reason")).toHaveValue("Price");
  });

  it("shows a lost opportunity's outcome, reason and date, with Reopen instead of Close", async () => {
    vi.mocked(reopenOpportunity).mockResolvedValue({
      ...inStage(lostDeal, newStage),
      closeReason: null,
      closedAt: null,
    });
    const { user } = await renderOpportunity(lostDeal);

    const outcome = within(screen.getByRole("region", { name: "Outcome" }));
    expect(outcome.getByText("Closed as lost on Oct 8, 2026")).toBeInTheDocument();
    expect(outcome.getByText("Chose a competitor.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close as won" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close as lost" })).not.toBeInTheDocument();
    // A closed opportunity has no current step and no step to move to.
    expect(stepper().queryByRole("button")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reopen" }));

    await waitFor(() => {
      expect(reopenOpportunity).toHaveBeenCalledWith(lostDeal.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Outcome" })).not.toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith("Document Vault was reopened in New.");
  });

  it("says when a won opportunity was closed without a reason", async () => {
    await renderOpportunity({ ...wonDeal, closeReason: null });

    expect(screen.getByText("No reason was given.")).toBeInTheDocument();
  });

  it("offers an Admin and a Sales Manager Reassign, and a Sales Rep only Delete", async () => {
    const admin = await renderOpportunity();
    await admin.user.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      within(await screen.findByRole("menu"))
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Reassign", "Delete"]);
    admin.unmount();

    const manager = await renderOpportunity(fleet, managerUser);
    await manager.user.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Reassign" }),
    ).toBeInTheDocument();
    manager.unmount();

    const rep = await renderOpportunity(fleet, repUser);
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/opportunities/${fleet.id}/edit`,
    );
    await rep.user.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      within(await screen.findByRole("menu"))
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Delete"]);
  });

  it("offers Send email to every role that may write, also on a closed opportunity", async () => {
    for (const [opportunity, me] of [
      [fleet, managerUser],
      [fleet, repUser],
      [wonDeal, adminUser],
      [lostDeal, adminUser],
    ] as const) {
      const { unmount } = await renderOpportunity(opportunity, me);
      expect(screen.getByRole("button", { name: "Send email" })).toBeInTheDocument();
      unmount();
    }
    expect(getEmailStatus).not.toHaveBeenCalled();

    vi.mocked(getEmailStatus).mockResolvedValue({ enabled: true });
    vi.mocked(listEmailTemplates).mockResolvedValue([]);
    vi.mocked(getEmailDefaults).mockResolvedValue({ recipients: [] });
    const { user } = await renderOpportunity();
    await user.click(screen.getByRole("button", { name: "Send email" }));

    const dialog = await screen.findByRole("dialog", { name: "Send email" });
    expect(dialog).toHaveTextContent(fleet.name);
    expect(getEmailDefaults).toHaveBeenCalledWith({ type: "OPPORTUNITY", id: fleet.id });
  });

  it("gives a Read-only user the record and its history, and no control that changes it", async () => {
    await renderOpportunity(fleet, readOnlyUser);

    expect(screen.queryByRole("button", { name: "Send email" })).not.toBeInTheDocument();

    for (const name of ["Close as won", "Close as lost", "Reopen", "More actions"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(stepper().queryByRole("button")).not.toBeInTheDocument();
    expect(stepper().getByText("New").closest("[aria-current]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Save conversation" })).not.toBeInTheDocument();
    expect(timelineTitles()).toEqual(["Call", "Opportunity created"]);
  });

  it("reassigns and deletes through the shared dialogs", async () => {
    vi.mocked(assignOpportunity).mockResolvedValue({
      ...fleet,
      owner: { id: managerUser.id, name: managerUser.name },
    });
    vi.mocked(deleteOpportunity).mockResolvedValue();
    const { user } = await renderOpportunity();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reassign" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Reassign Fleet Expansion" }));
    await user.click(await dialog.findByRole("combobox", { name: "New owner" }));
    await user.click(await screen.findByRole("option", { name: "Mia Manager" }));
    await user.click(dialog.getByRole("button", { name: "Reassign" }));
    await waitFor(() => {
      expect(assignOpportunity).toHaveBeenCalledWith(fleet.id, managerUser.id);
    });
    expect(await screen.findByText("Owner: Mia Manager")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => {
      expect(deleteOpportunity).toHaveBeenCalledWith(fleet.id);
    });
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/opportunities");
    });
  });

  it("loads the opportunity's own timeline, and logs a conversation and a note on it", async () => {
    vi.mocked(logConversation).mockResolvedValue(
      savedEntry({ kind: "CONVERSATION", conversationType: "CALL", body: "Agreed." }),
    );
    vi.mocked(addNote).mockResolvedValue({
      ...savedEntry({ kind: "NOTE", body: "Remember." }),
      id: "eeeeeeee-eeee-4eee-8eee-000000000098",
    });
    const { user } = await renderOpportunity();

    expect(listTimeline).toHaveBeenCalledWith(record, expect.anything());
    expect(timelineTitles()).toEqual(["Call", "Opportunity created"]);

    await user.type(screen.getByLabelText("What was discussed?"), "Agreed.");
    await user.click(screen.getByRole("button", { name: "Save conversation" }));
    await waitFor(() => {
      expect(logConversation).toHaveBeenCalledWith(
        record,
        expect.objectContaining({ summary: "Agreed." }),
      );
    });

    await user.click(screen.getByRole("button", { name: "Note" }));
    await user.type(screen.getByLabelText("Note"), "Remember.");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => {
      expect(addNote).toHaveBeenCalledWith(record, { body: "Remember." });
    });
  });

  it("words the timeline's stage changes by what happened: moved, won, lost, reopened", async () => {
    vi.mocked(listTimeline).mockResolvedValue(
      timelinePage([
        stageChange({ from: "Lost", to: "New", fromKind: "LOST", toKind: "OPEN" }),
        stageChange({
          from: "Proposal",
          to: "Lost",
          fromKind: "OPEN",
          toKind: "LOST",
          reason: "Chose a competitor.",
        }),
        stageChange({ from: "Proposal", to: "Deal done", fromKind: "OPEN", toKind: "WON" }),
        stageChange({ from: "New", to: "Proposal", fromKind: "OPEN", toKind: "OPEN" }),
        { ...created, details: { fromLead: { id: "lead-1", name: "Marcus Chen" } } },
      ]),
    );
    await renderOpportunity();

    expect(timelineTitles()).toEqual([
      "Reopened in New",
      "Closed as lost",
      "Closed as won",
      "Stage changed: New → Proposal",
      "Opportunity created from lead Marcus Chen",
    ]);
    // The reason is a sentence someone wrote: it is the entry's text, not part of the title.
    expect(screen.getByText("Chose a competitor.")).toBeInTheDocument();
  });

  it("says not found for an opportunity that does not exist or is out of reach", async () => {
    vi.mocked(getOpportunity).mockRejectedValue({ code: "NOT_FOUND", message: "x", details: null });
    renderWithStore(<OpportunityDetailPage id={fleet.id} />, { me: adminUser });

    expect(await screen.findByText("Opportunity not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to opportunities" })).toHaveAttribute(
      "href",
      "/opportunities",
    );
  });
});
