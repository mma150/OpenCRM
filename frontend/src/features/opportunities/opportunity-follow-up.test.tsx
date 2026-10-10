import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { assignableUsers, readOnlyUser } from "@/features/leads/leads.fixtures";
import { listPipelineStages } from "@/features/pipeline-stages/pipeline-stages.api";
import { pipeline } from "@/features/pipeline-stages/pipeline-stages.fixtures";
import { listTasks } from "@/features/tasks/tasks.api";
import { prepareDeck, taskList } from "@/features/tasks/tasks.fixtures";
import { listTimeline } from "@/features/timeline/timeline.api";
import { created, timelinePage } from "@/features/timeline/timeline.fixtures";
import { listAssignableUsers } from "@/features/users/users.api";
import { adminUser, renderWithStore } from "@/test/render-with-store";

import { getOpportunity, setOpportunityFollowUp } from "./opportunities.api";
import { fleet, lostDeal, wonDeal } from "./opportunities.fixtures";
import type { Opportunity } from "./opportunities.types";
import { OpportunityDetailPage } from "./opportunity-detail-page";

vi.mock("./opportunities.api");
vi.mock("@/features/pipeline-stages/pipeline-stages.api");
vi.mock("@/features/users/users.api");
vi.mock("@/features/tasks/tasks.api");
vi.mock("@/features/timeline/timeline.api");
vi.mock("sonner");

const DAY = 24 * 60 * 60 * 1000;
const followUp = {
  followUpAt: new Date(Date.now() + 2 * DAY).toISOString(),
  followUpNote: "Send the revised numbers",
};

async function renderOpportunity(opportunity: Opportunity, me: Me = adminUser) {
  vi.mocked(getOpportunity).mockResolvedValue(opportunity);
  const view = renderWithStore(<OpportunityDetailPage id={opportunity.id} />, { me });
  await screen.findByRole("heading", { level: 1, name: opportunity.name });
  return view;
}

// The follow-up and the Tasks card on an opportunity's page. The page itself is covered by
// opportunity-detail-page.test.tsx, and the control by follow-up.test.tsx.
describe("an opportunity's follow-up and tasks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listPipelineStages).mockResolvedValue(pipeline);
    vi.mocked(listAssignableUsers).mockResolvedValue(assignableUsers);
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([created]));
    vi.mocked(listTasks).mockResolvedValue(taskList([prepareDeck]));
  });

  it("sets a follow-up on an open opportunity and shows it at once", async () => {
    vi.mocked(setOpportunityFollowUp).mockResolvedValue({ ...fleet, ...followUp });
    const { user } = await renderOpportunity(fleet);

    await user.click(screen.getByRole("button", { name: "Set follow-up" }));
    const dialog = await screen.findByRole("dialog", { name: "Set follow-up" });
    await user.click(within(dialog).getByRole("button", { name: "Save follow-up" }));

    await waitFor(() => {
      expect(setOpportunityFollowUp).toHaveBeenCalledWith(fleet.id, {
        at: expect.stringMatching(/Z$/) as string,
        note: null,
      });
    });
    const strip = await screen.findByRole("region", { name: "Follow-up" });
    expect(within(strip).getByText("Send the revised numbers")).toBeInTheDocument();
  });

  it("changes and clears the follow-up that is set", async () => {
    vi.mocked(setOpportunityFollowUp).mockResolvedValue(fleet);
    const { user } = await renderOpportunity({ ...fleet, ...followUp });
    const strip = within(screen.getByRole("region", { name: "Follow-up" }));
    expect(strip.getByRole("button", { name: "Change" })).toBeInTheDocument();

    await user.click(strip.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(setOpportunityFollowUp).toHaveBeenCalledWith(fleet.id, { at: null });
    });
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Follow-up" })).not.toBeInTheDocument();
    });
  });

  it("offers no new follow-up on a closed opportunity, but lets an old one be cleared", async () => {
    for (const closed of [wonDeal, lostDeal]) {
      const { unmount } = await renderOpportunity(closed);
      expect(screen.queryByRole("button", { name: "Set follow-up" })).not.toBeInTheDocument();
      unmount();
    }

    await renderOpportunity({ ...wonDeal, ...followUp });
    const strip = within(screen.getByRole("region", { name: "Follow-up" }));
    expect(strip.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(strip.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
  });

  it("offers a Read-only user nothing to change", async () => {
    await renderOpportunity(fleet, readOnlyUser);

    expect(screen.queryByRole("button", { name: "Set follow-up" })).not.toBeInTheDocument();
    expect(await screen.findByText(prepareDeck.title)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("lists the opportunity's open tasks in a Tasks card", async () => {
    await renderOpportunity(fleet);

    const list = await screen.findByRole("list", { name: "Tasks" });
    expect(within(list).getByText(prepareDeck.title)).toBeInTheDocument();
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ recordType: "OPPORTUNITY", recordId: fleet.id, status: "OPEN" }),
    );
  });
});
