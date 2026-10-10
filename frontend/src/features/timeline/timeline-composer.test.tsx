import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { toDateTimeInputValue } from "@/lib/format";
import { renderWithStore, repUser } from "@/test/render-with-store";

import { addNote, logConversation } from "./timeline.api";
import { leadRecord, savedEntry } from "./timeline.fixtures";
import { TimelineComposer } from "./timeline-composer";

vi.mock("./timeline.api");
vi.mock("sonner");

const savedCall = savedEntry({ kind: "CONVERSATION", conversationType: "CALL", body: "Hello." });
const savedNote = savedEntry({ kind: "NOTE", body: "Remember." });

function renderComposer(onSaved?: () => void) {
  return renderWithStore(<TimelineComposer record={leadRecord} onSaved={onSaved} />, {
    me: repUser,
  });
}

const discussed = () => screen.getByLabelText("What was discussed?");
const dateField = () => screen.getByLabelText("Date and time");
const saveConversation = () => screen.getByRole("button", { name: "Save conversation" });

describe("TimelineComposer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts as a conversation: Call selected, the time set to now, an empty text box", () => {
    renderComposer();

    expect(screen.getByRole("button", { name: "Conversation" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("radio").map((radio) => radio.parentElement?.textContent)).toEqual([
      "Call",
      "Meeting",
      "Email",
      "Message",
    ]);
    expect(screen.getByRole("radio", { name: "Call" })).toBeChecked();
    // The minute may tick over between rendering and this line.
    const now = Date.now();
    expect([
      toDateTimeInputValue(new Date(now)),
      toDateTimeInputValue(new Date(now - 60_000)),
    ]).toContain((dateField() as HTMLInputElement).value);
    expect(discussed()).toHaveValue("");
  });

  it("logs a conversation with the type, the time as an ISO moment and the text", async () => {
    vi.mocked(logConversation).mockResolvedValue(savedCall);
    const onSaved = vi.fn();
    const { user } = renderComposer(onSaved);

    await user.click(screen.getByRole("radio", { name: "Meeting" }));
    fireEvent.change(dateField(), { target: { value: "2026-10-05T09:30" } });
    await user.type(discussed(), "  Talked about pricing.  ");
    await user.click(saveConversation());

    await waitFor(() => {
      expect(logConversation).toHaveBeenCalledWith(leadRecord, {
        type: "MEETING",
        occurredAt: new Date("2026-10-05T09:30").toISOString(),
        summary: "Talked about pricing.",
      });
    });
    expect(onSaved).toHaveBeenCalledWith(savedCall);
    expect(toast.success).toHaveBeenCalledWith("Conversation logged.");
  });

  it("clears the form after saving and puts the cursor back in the text box", async () => {
    vi.mocked(logConversation).mockResolvedValue(savedCall);
    const { user } = renderComposer();

    await user.click(screen.getByRole("radio", { name: "Email" }));
    await user.type(discussed(), "Sent the proposal.");
    await user.click(saveConversation());

    await waitFor(() => {
      expect(discussed()).toHaveValue("");
    });
    expect(screen.getByRole("radio", { name: "Call" })).toBeChecked();
    expect(discussed()).toHaveFocus();
  });

  it("adds a note with only its text", async () => {
    vi.mocked(addNote).mockResolvedValue(savedNote);
    const onSaved = vi.fn();
    const { user } = renderComposer(onSaved);

    await user.click(screen.getByRole("button", { name: "Note" }));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Date and time")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Note"), "Remember.");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => {
      expect(addNote).toHaveBeenCalledWith(leadRecord, { body: "Remember." });
    });
    expect(logConversation).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(savedNote);
    expect(toast.success).toHaveBeenCalledWith("Note added.");
    // The form stays in the mode that was used.
    expect(screen.getByRole("button", { name: "Save note" })).toBeInTheDocument();
  });

  it("keeps what was typed when the mode is switched", async () => {
    const { user } = renderComposer();

    await user.type(discussed(), "Half a thought");
    await user.click(screen.getByRole("button", { name: "Note" }));

    expect(screen.getByLabelText("Note")).toHaveValue("Half a thought");
  });

  it("asks for the text before sending anything, in both modes", async () => {
    const { user } = renderComposer();

    await user.type(discussed(), "   ");
    await user.click(saveConversation());
    expect(await screen.findByText("Write what was discussed.")).toBeInTheDocument();
    expect(discussed()).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: "Note" }));
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText("Write the note first.")).toBeInTheDocument();

    expect(logConversation).not.toHaveBeenCalled();
    expect(addNote).not.toHaveBeenCalled();
  });

  it("refuses text over 5000 characters, a missing date and a date in the future", async () => {
    const { user } = renderComposer();

    fireEvent.change(discussed(), { target: { value: "a".repeat(5001) } });
    fireEvent.change(dateField(), { target: { value: "" } });
    await user.click(saveConversation());
    expect(await screen.findByText("Use 5000 characters or fewer.")).toBeInTheDocument();
    expect(screen.getByText("Enter the date and time.")).toBeInTheDocument();

    fireEvent.change(discussed(), { target: { value: "Fine." } });
    fireEvent.change(dateField(), {
      target: { value: toDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)) },
    });
    await user.click(saveConversation());
    expect(
      await screen.findByText("The date and time cannot be in the future."),
    ).toBeInTheDocument();
    expect(logConversation).not.toHaveBeenCalled();
  });

  it("puts the server's occurredAt and summary errors on the date and the text box", async () => {
    const error: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Server text",
      details: [
        { path: "occurredAt", message: "Must not be in the future" },
        { path: "summary", message: "Too long for the server" },
      ],
    };
    vi.mocked(logConversation).mockRejectedValue(error);
    const { user } = renderComposer();

    await user.type(discussed(), "Talked.");
    await user.click(saveConversation());

    expect(await screen.findByText("Must not be in the future")).toBeInTheDocument();
    expect(dateField()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Too long for the server")).toBeInTheDocument();
    expect(discussed()).toHaveAttribute("aria-invalid", "true");
    // Every problem landed on a field, so there is no message above the form.
    expect(screen.queryByText(/Some of the details are not valid/)).not.toBeInTheDocument();
  });

  it("puts the server's body error on the note box", async () => {
    vi.mocked(addNote).mockRejectedValue({
      code: "VALIDATION_FAILED",
      message: "Server text",
      details: [{ path: "body", message: "Body is not acceptable" }],
    } satisfies ApiError);
    const { user } = renderComposer();

    await user.click(screen.getByRole("button", { name: "Note" }));
    await user.type(screen.getByLabelText("Note"), "A note.");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(await screen.findByText("Body is not acceptable")).toBeInTheDocument();
    expect(screen.getByLabelText("Note")).toHaveAttribute("aria-invalid", "true");
  });

  it.each([
    ["FORBIDDEN", "You do not have permission to do that."],
    ["NOT_FOUND", "This no longer exists. Reload the page and try again."],
    ["NETWORK_ERROR", "The server cannot be reached. Check your connection and try again."],
  ] as const)("explains %s above the form and keeps what was typed", async (code, message) => {
    vi.mocked(logConversation).mockRejectedValue({ code, message: "Server text", details: null });
    const onSaved = vi.fn();
    const { user } = renderComposer(onSaved);

    await user.click(screen.getByRole("radio", { name: "Message" }));
    await user.type(discussed(), "Do not lose this.");
    await user.click(saveConversation());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(discussed()).toHaveValue("Do not lose this.");
    expect(screen.getByRole("radio", { name: "Message" })).toBeChecked();
    expect(saveConversation()).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows the code and the server text for a failure it has no words for", async () => {
    vi.mocked(logConversation).mockRejectedValue({
      code: "INTERNAL_ERROR",
      message: "Server text",
      details: null,
    } satisfies ApiError);
    const { user } = renderComposer();

    await user.type(discussed(), "Talked.");
    await user.click(saveConversation());

    expect(await screen.findByText("INTERNAL_ERROR: Server text")).toBeInTheDocument();
  });
});
