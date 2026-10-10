import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { toDateTimeInputValue } from "@/lib/format";

import { FollowUp, type FollowUpInput } from "./follow-up";

vi.mock("sonner");

const DAY = 24 * 60 * 60 * 1000;
const inThreeDays = new Date(Date.now() + 3 * DAY).toISOString();
const twoDaysAgo = new Date(Date.now() - 2 * DAY).toISOString();

function renderFollowUp(
  props: Partial<Parameters<typeof FollowUp>[0]> = {},
  onSave = vi.fn<(input: FollowUpInput) => Promise<unknown>>().mockResolvedValue(undefined),
) {
  const user = userEvent.setup();
  render(<FollowUp at={null} note={null} canSet canClear onSave={onSave} {...props} />);
  return { user, onSave };
}

describe("FollowUp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("offers to set a follow-up, and saves the moment and the note", async () => {
    const { user, onSave } = renderFollowUp();

    await user.click(screen.getByRole("button", { name: "Set follow-up" }));
    const dialog = await screen.findByRole("dialog", { name: "Set follow-up" });
    // It starts from tomorrow morning, so one tap is enough for the usual case.
    expect(within(dialog).getByLabelText("Follow up on")).not.toHaveValue("");
    const when = toDateTimeInputValue(new Date(Date.now() + 5 * DAY));
    fireEvent.change(within(dialog).getByLabelText("Follow up on"), { target: { value: when } });
    await user.type(within(dialog).getByLabelText("Note"), "Ask about the budget");
    await user.click(within(dialog).getByRole("button", { name: "Save follow-up" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        at: new Date(when).toISOString(),
        note: "Ask about the budget",
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Follow-up set.");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("does not accept an empty or a past moment", async () => {
    const { user, onSave } = renderFollowUp();

    await user.click(screen.getByRole("button", { name: "Set follow-up" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Follow up on"), { target: { value: "" } });
    await user.click(within(dialog).getByRole("button", { name: "Save follow-up" }));
    expect(await within(dialog).findByText("Enter the date and time.")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Follow up on"), {
      target: { value: "2020-01-01T09:00" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Save follow-up" }));
    expect(
      await within(dialog).findByText("Choose a time that is still to come."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the follow-up that is set, with its note, Change and Clear", async () => {
    const { user, onSave } = renderFollowUp({ at: inThreeDays, note: "Call about the pilot" });

    const strip = screen.getByRole("region", { name: "Follow-up" });
    expect(within(strip).getByText(/^Follow up /)).toBeInTheDocument();
    expect(within(strip).getByText("Call about the pilot")).toBeInTheDocument();
    expect(within(strip).queryByText(/overdue/i)).not.toBeInTheDocument();

    await user.click(within(strip).getByRole("button", { name: "Change" }));
    const dialog = await screen.findByRole("dialog", { name: "Change follow-up" });
    expect(within(dialog).getByLabelText("Note")).toHaveValue("Call about the pilot");
    expect(within(dialog).getByLabelText("Follow up on")).toHaveValue(
      toDateTimeInputValue(new Date(inThreeDays)),
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.click(within(strip).getByRole("button", { name: "Clear" }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ at: null });
    });
    expect(toast.success).toHaveBeenCalledWith("Follow-up cleared.");
  });

  it("says in words when the follow-up is overdue", () => {
    renderFollowUp({ at: twoDaysAgo });

    expect(screen.getByText(/^Follow-up overdue · /)).toBeInTheDocument();
  });

  it("puts the server's message on the field, and any other error above the form", async () => {
    const validation: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Invalid",
      details: [{ path: "at", message: "Too far ahead" }],
    };
    const refused: ApiError = { code: "LEAD_CONVERTED", message: "Converted", details: null };
    const onSave = vi
      .fn<(input: FollowUpInput) => Promise<unknown>>()
      .mockRejectedValueOnce(validation)
      .mockRejectedValueOnce(refused);
    const { user } = renderFollowUp({}, onSave);

    await user.click(screen.getByRole("button", { name: "Set follow-up" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save follow-up" }));
    expect(await within(dialog).findByText("Too far ahead")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Save follow-up" }));
    expect(
      await within(dialog).findByText("This lead has been converted and can no longer be changed."),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("says so when clearing fails", async () => {
    const onSave = vi
      .fn<(input: FollowUpInput) => Promise<unknown>>()
      .mockRejectedValue({ code: "FORBIDDEN", message: "No", details: null });
    const { user } = renderFollowUp({ at: inThreeDays }, onSave);

    await user.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("You do not have permission to do that.");
    });
  });

  it("offers nothing to a user who may not change the record", () => {
    renderFollowUp({ at: inThreeDays, note: "Call", canSet: false, canClear: false });

    expect(screen.getByRole("region", { name: "Follow-up" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when there is no follow-up and none may be set", () => {
    const { container } = render(
      <FollowUp at={null} note={null} canSet={false} canClear onSave={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps Clear but not Change on a record that takes no new follow-up", () => {
    renderFollowUp({ at: inThreeDays, canSet: false, canClear: true });

    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change" })).not.toBeInTheDocument();
  });
});
