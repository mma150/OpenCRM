import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { listTasks } from "@/features/tasks/tasks.api";
import { sendQuote, taskList } from "@/features/tasks/tasks.fixtures";
import { listTimeline } from "@/features/timeline/timeline.api";
import { created, timelinePage } from "@/features/timeline/timeline.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { LeadDetailPage } from "./lead-detail-page";
import { getLead, setLeadFollowUp } from "./leads.api";
import { assignableUsers, converted, devon, marcus, readOnlyUser } from "./leads.fixtures";
import type { Lead } from "./leads.types";

vi.mock("./leads.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/tasks/tasks.api");
vi.mock("@/features/timeline/timeline.api");
vi.mock("sonner");

const DAY = 24 * 60 * 60 * 1000;
const followUp = {
  followUpAt: new Date(Date.now() + 2 * DAY).toISOString(),
  followUpNote: "Ask about the budget",
};

async function renderLead(lead: Lead, me: Me = adminUser) {
  vi.mocked(getLead).mockResolvedValue(lead);
  const view = renderWithStore(<LeadDetailPage id={lead.id} />, { me });
  await screen.findByRole("heading", { level: 1, name: lead.name });
  return view;
}

// The follow-up and the Tasks card on a lead's page. The page itself is covered by
// lead-detail-page.test.tsx, and the control by follow-up.test.tsx.
describe("a lead's follow-up and tasks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([created]));
    vi.mocked(listTasks).mockResolvedValue(taskList([sendQuote]));
  });

  it("sets a follow-up on an open lead and shows it at once", async () => {
    vi.mocked(setLeadFollowUp).mockResolvedValue({ ...marcus, ...followUp });
    const { user } = await renderLead(marcus);
    expect(screen.queryByRole("region", { name: "Follow-up" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Set follow-up" }));
    const dialog = await screen.findByRole("dialog", { name: "Set follow-up" });
    await user.type(within(dialog).getByLabelText("Note"), "Ask about the budget");
    await user.click(within(dialog).getByRole("button", { name: "Save follow-up" }));

    await waitFor(() => {
      expect(setLeadFollowUp).toHaveBeenCalledWith(marcus.id, {
        at: expect.stringMatching(/Z$/) as string,
        note: "Ask about the budget",
      });
    });
    const strip = await screen.findByRole("region", { name: "Follow-up" });
    expect(within(strip).getByText("Ask about the budget")).toBeInTheDocument();
  });

  it("clears the follow-up that is set", async () => {
    vi.mocked(setLeadFollowUp).mockResolvedValue(marcus);
    const { user } = await renderLead({ ...marcus, ...followUp });

    await user.click(
      within(screen.getByRole("region", { name: "Follow-up" })).getByRole("button", {
        name: "Clear",
      }),
    );

    await waitFor(() => {
      expect(setLeadFollowUp).toHaveBeenCalledWith(marcus.id, { at: null });
    });
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Follow-up" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Set follow-up" })).toBeInTheDocument();
  });

  it("offers no new follow-up on a lost or a converted lead, but lets an old one be cleared", async () => {
    for (const lead of [devon, converted]) {
      const { unmount } = await renderLead(lead);
      expect(screen.queryByRole("button", { name: "Set follow-up" })).not.toBeInTheDocument();
      unmount();
    }

    await renderLead({ ...devon, ...followUp });
    const strip = within(screen.getByRole("region", { name: "Follow-up" }));
    expect(strip.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(strip.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
  });

  it("shows a Read-only user the follow-up and the tasks, with nothing to change", async () => {
    await renderLead({ ...marcus, ...followUp }, readOnlyUser);

    const strip = within(screen.getByRole("region", { name: "Follow-up" }));
    expect(strip.getByText("Ask about the budget")).toBeInTheDocument();
    expect(strip.queryByRole("button")).not.toBeInTheDocument();
    expect(await screen.findByText(sendQuote.title)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
  });

  it("lists the lead's open tasks in a Tasks card, with Add task", async () => {
    await renderLead(marcus, repUser);

    const list = await screen.findByRole("list", { name: "Tasks" });
    expect(within(list).getByText(sendQuote.title)).toBeInTheDocument();
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ recordType: "LEAD", recordId: marcus.id, status: "OPEN" }),
    );
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });
});
