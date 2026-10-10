import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { PipelineSettingsPage } from "./pipeline-settings-page";
import {
  createPipelineStage,
  deletePipelineStage,
  listPipelineStages,
  renamePipelineStage,
  reorderPipelineStages,
} from "./pipeline-stages.api";
import {
  negotiationStage,
  newStage,
  pipeline,
  proposalStage,
  qualifiedStage,
  wonStage,
} from "./pipeline-stages.fixtures";
import type { PipelineStage } from "./pipeline-stages.types";

vi.mock("./pipeline-stages.api");
vi.mock("sonner");

async function renderSettings(stages: PipelineStage[] = pipeline) {
  vi.mocked(listPipelineStages).mockResolvedValue(stages);
  const view = renderWithStore(<PipelineSettingsPage />, { me: adminUser });
  await screen.findByRole("list", { name: "Pipeline stages" });
  return view;
}

const rows = () =>
  within(screen.getByRole("list", { name: "Pipeline stages" })).getAllByRole("listitem");
const rowNames = () => rows().map((row) => row.querySelector("p")?.firstChild?.textContent);

describe("PipelineSettingsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("tells anyone but an Admin they have no access, and does not ask the API", () => {
    for (const me of [managerUser, repUser, readOnlyUser]) {
      const { unmount } = renderWithStore(<PipelineSettingsPage />, { me });
      expect(screen.getByText("You do not have access to Pipeline")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add stage" })).not.toBeInTheDocument();
      unmount();
    }
    expect(listPipelineStages).not.toHaveBeenCalled();
  });

  it("lists the stages in order with their counts, Won and Lost last as fixed rows", async () => {
    await renderSettings();

    expect(rowNames()).toEqual(["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]);
    const [first, , , , won, lost] = rows();
    expect(within(first as HTMLElement).getByText("2 opportunities")).toBeInTheDocument();
    expect(within(rows()[1] as HTMLElement).getByText("1 opportunity")).toBeInTheDocument();
    // A fixed row can be renamed, and nothing else.
    for (const row of [won, lost]) {
      expect(
        within(row as HTMLElement)
          .getAllByRole("button")
          .map((button) => button.getAttribute("aria-label")),
      ).toEqual([expect.stringMatching(/^Rename /)]);
      expect(within(row as HTMLElement).getByText(/Fixed stage/)).toBeInTheDocument();
    }
    expect(within(won as HTMLElement).getByText("Closed as won")).toBeInTheDocument();
    expect(within(lost as HTMLElement).getByText("Closed as lost")).toBeInTheDocument();
  });

  it("cannot move the first stage up or the last open stage down", async () => {
    await renderSettings();

    expect(screen.getByRole("button", { name: "Move New up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move New down" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Negotiation down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Negotiation up" })).toBeEnabled();
  });

  it("moves a stage down and up with its buttons, sending every open stage in the new order", async () => {
    const reordered = [
      qualifiedStage,
      newStage,
      proposalStage,
      negotiationStage,
      ...pipeline.slice(4),
    ];
    vi.mocked(reorderPipelineStages).mockResolvedValue(reordered);
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Move New down" }));

    await waitFor(() => {
      expect(reorderPipelineStages).toHaveBeenCalledWith([
        qualifiedStage.id,
        newStage.id,
        proposalStage.id,
        negotiationStage.id,
      ]);
    });
    await waitFor(() => {
      expect(rowNames().slice(0, 2)).toEqual(["Qualified", "New"]);
    });

    // The button that was used keeps the focus, so the keyboard can move a stage on.
    expect(screen.getByRole("button", { name: "Move New down" })).toHaveFocus();

    vi.mocked(reorderPipelineStages).mockResolvedValue(pipeline);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Move New up" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(reorderPipelineStages).toHaveBeenLastCalledWith([
        newStage.id,
        qualifiedStage.id,
        proposalStage.id,
        negotiationStage.id,
      ]);
    });
    // New is first again and cannot go further up: the focus moves to its other button.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Move New down" })).toHaveFocus();
    });
  });

  it("says so when the new order is refused, and keeps the old one", async () => {
    vi.mocked(reorderPipelineStages).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "x",
      details: null,
    });
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Move Qualified up" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Qualified could not be moved. The server cannot be reached. Check your connection and try again.",
      );
    });
    expect(rowNames().slice(0, 2)).toEqual(["New", "Qualified"]);
  });

  it("adds a stage, and puts a taken name's error on the field", async () => {
    const demo: PipelineStage = { ...proposalStage, id: "demo", name: "Demo", opportunityCount: 0 };
    vi.mocked(createPipelineStage)
      .mockRejectedValueOnce({
        code: "VALIDATION_FAILED",
        message: "x",
        details: [{ path: "name", message: "Another stage has this name" }],
      })
      .mockResolvedValueOnce([...pipeline.slice(0, 4), demo, ...pipeline.slice(4)]);
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Add stage" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add a stage" }));
    await user.click(dialog.getByRole("button", { name: "Add stage" }));
    expect(await dialog.findByText("Enter a name.")).toBeInTheDocument();
    expect(createPipelineStage).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText("Stage name"), " Demo ");
    await user.click(dialog.getByRole("button", { name: "Add stage" }));
    expect(await dialog.findByText("Another stage has this name")).toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Add stage" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(createPipelineStage).toHaveBeenLastCalledWith("Demo");
    expect(rowNames()).toEqual([
      "New",
      "Qualified",
      "Proposal",
      "Negotiation",
      "Demo",
      "Won",
      "Lost",
    ]);
    expect(toast.success).toHaveBeenCalledWith("Demo was added to the pipeline.");
  });

  it("offers no more stages once the pipeline is full, and explains the API's refusal", async () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      ...newStage,
      id: `stage-${String(index)}`,
      name: `Stage ${String(index + 1)}`,
      position: index,
    }));
    const { unmount } = await renderSettings([...many, ...pipeline.slice(4)]);
    expect(screen.getByRole("button", { name: "Add stage" })).toBeDisabled();
    expect(screen.getByText(/20 open stages, the most it can hold/)).toBeInTheDocument();
    unmount();

    // Someone else added the twentieth meanwhile: the API refuses without naming a field.
    vi.mocked(createPipelineStage).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "x",
      details: null,
    });
    const { user } = await renderSettings();
    await user.click(screen.getByRole("button", { name: "Add stage" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Stage name"), "Demo");
    await user.click(dialog.getByRole("button", { name: "Add stage" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "A pipeline can have 20 open stages at most. Delete one first.",
    );
  });

  it("renames a stage, Won included, and sends nothing when the name is unchanged", async () => {
    vi.mocked(renamePipelineStage).mockResolvedValue(
      pipeline.map((stage) => (stage.id === wonStage.id ? { ...stage, name: "Signed" } : stage)),
    );
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Rename Won" }));
    let dialog = within(await screen.findByRole("dialog", { name: "Rename Won" }));
    const name = dialog.getByLabelText("Stage name");
    expect(name).toHaveValue("Won");
    await user.clear(name);
    await user.type(name, "Signed");
    await user.click(dialog.getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(renamePipelineStage).toHaveBeenCalledWith(wonStage.id, "Signed");
    });
    await waitFor(() => {
      expect(rowNames()).toContain("Signed");
    });

    await user.click(screen.getByRole("button", { name: "Rename New" }));
    dialog = within(await screen.findByRole("dialog", { name: "Rename New" }));
    await user.click(dialog.getByRole("button", { name: "Rename" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(renamePipelineStage).toHaveBeenCalledTimes(1);
  });

  it("deletes an empty stage after asking, without a stage to move to", async () => {
    vi.mocked(deletePipelineStage).mockResolvedValue(
      pipeline.filter((stage) => stage.id !== proposalStage.id),
    );
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Delete Proposal" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Delete Proposal?" }));
    expect(dialog.getByText(/holds no opportunities/)).toBeInTheDocument();
    expect(dialog.queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Delete stage" }));

    await waitFor(() => {
      expect(deletePipelineStage).toHaveBeenCalledWith(proposalStage.id, undefined);
    });
    await waitFor(() => {
      expect(rowNames()).toEqual(["New", "Qualified", "Negotiation", "Won", "Lost"]);
    });
  });

  it("asks where a stage's opportunities go before deleting it, and offers only other open stages", async () => {
    vi.mocked(deletePipelineStage).mockResolvedValue(
      pipeline.filter((stage) => stage.id !== newStage.id),
    );
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Delete New" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Delete New?" }));
    expect(dialog.getByText(/This stage holds 2 opportunities/)).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Delete stage" }));
    expect(await dialog.findByText("Choose the stage that takes them.")).toBeInTheDocument();
    expect(deletePipelineStage).not.toHaveBeenCalled();

    await user.click(dialog.getByRole("combobox", { name: "Move 2 opportunities to" }));
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "Qualified",
      "Proposal",
      "Negotiation",
    ]);
    await user.click(screen.getByRole("option", { name: "Qualified" }));
    await user.click(dialog.getByRole("button", { name: "Delete stage" }));

    await waitFor(() => {
      expect(deletePipelineStage).toHaveBeenCalledWith(newStage.id, qualifiedStage.id);
    });
    expect(toast.success).toHaveBeenCalledWith("New was deleted.");
  });

  it("explains a refused delete in the dialog: on the field, or above the form", async () => {
    vi.mocked(deletePipelineStage)
      .mockRejectedValueOnce({
        code: "VALIDATION_FAILED",
        message: "x",
        details: [{ path: "moveToStageId", message: "Choose another open stage" }],
      })
      .mockRejectedValueOnce({ code: "VALIDATION_FAILED", message: "x", details: null });
    const { user } = await renderSettings();

    await user.click(screen.getByRole("button", { name: "Delete Qualified" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("combobox", { name: "Move 1 opportunity to" }));
    await user.click(await screen.findByRole("option", { name: "New" }));
    await user.click(dialog.getByRole("button", { name: "Delete stage" }));
    expect(await dialog.findByText("Choose another open stage")).toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Delete stage" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "This stage cannot be deleted. A pipeline keeps at least one open stage.",
    );
  });

  it("does not offer to delete the last open stage", async () => {
    await renderSettings([newStage, ...pipeline.slice(4)]);

    expect(screen.getByRole("button", { name: "Delete New" })).toBeDisabled();
  });

  it("shows the load error with Retry", async () => {
    vi.mocked(listPipelineStages).mockRejectedValueOnce({
      code: "NETWORK_ERROR",
      message: "x",
      details: null,
    });
    const { user } = renderWithStore(<PipelineSettingsPage />, { me: adminUser });

    expect(await screen.findByRole("alert")).toHaveTextContent("The server cannot be reached.");
    vi.mocked(listPipelineStages).mockResolvedValue(pipeline);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("list", { name: "Pipeline stages" })).toBeInTheDocument();
  });
});
