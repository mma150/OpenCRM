import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { renderWithStore, repUser } from "@/test/render-with-store";

import { LogConversationButton } from "./log-conversation-button";
import { logConversation } from "./timeline.api";
import { leadRecord, savedEntry } from "./timeline.fixtures";

vi.mock("./timeline.api");
vi.mock("sonner");

// jsdom has no screen, so the tests say how wide it is.
function setPhone(isPhone: boolean) {
  vi.stubGlobal("matchMedia", (query: string): Partial<MediaQueryList> => ({
    matches: isPhone,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function renderButton() {
  return renderWithStore(<LogConversationButton record={leadRecord} recordName="Marcus Chen" />, {
    me: repUser,
  });
}

describe("LogConversationButton", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing on a wide screen, where the timeline has the form inline", () => {
    setPhone(false);
    const { container } = renderButton();

    expect(container).toBeEmptyDOMElement();
  });

  it("opens a full-screen dialog on a phone, with the record's name and the cursor in the text box", async () => {
    setPhone(true);
    const { user } = renderButton();

    await user.click(screen.getByRole("button", { name: "Log conversation" }));

    const dialog = await screen.findByRole("dialog", { name: "Log conversation" });
    expect(within(dialog).getByText("Marcus Chen")).toBeInTheDocument();
    expect(dialog).toHaveClass("h-[var(--visible-height,100dvh)]", "max-w-none", "rounded-none");
    expect(within(dialog).getByRole("radio", { name: "Call" })).toBeChecked();
    await waitFor(() => {
      expect(within(dialog).getByLabelText("What was discussed?")).toHaveFocus();
    });
  });

  it("saves, closes the dialog and gives the focus back to the button", async () => {
    setPhone(true);
    vi.mocked(logConversation).mockResolvedValue(
      savedEntry({ kind: "CONVERSATION", conversationType: "CALL", body: "Quick call." }),
    );
    const { user } = renderButton();

    await user.click(screen.getByRole("button", { name: "Log conversation" }));
    await user.type(await screen.findByLabelText("What was discussed?"), "Quick call.");
    await user.click(screen.getByRole("button", { name: "Save conversation" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(logConversation).toHaveBeenCalledWith(
      leadRecord,
      expect.objectContaining({ type: "CALL", summary: "Quick call." }),
    );
    expect(screen.getByRole("button", { name: "Log conversation" })).toHaveFocus();
  });

  it("stays open with the text when the save fails", async () => {
    setPhone(true);
    vi.mocked(logConversation).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "Server text",
      details: null,
    } satisfies ApiError);
    const { user } = renderButton();

    await user.click(screen.getByRole("button", { name: "Log conversation" }));
    await user.type(await screen.findByLabelText("What was discussed?"), "Do not lose this.");
    await user.click(screen.getByRole("button", { name: "Save conversation" }));

    const dialog = screen.getByRole("dialog");
    expect(
      await within(dialog).findByText(
        "The server cannot be reached. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("What was discussed?")).toHaveValue("Do not lose this.");
  });
});
