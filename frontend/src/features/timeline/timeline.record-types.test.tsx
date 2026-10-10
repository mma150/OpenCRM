import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithStore, repUser } from "@/test/render-with-store";

import { LogConversationButton } from "./log-conversation-button";
import { Timeline } from "./timeline";
import { addNote, listTimeline, logConversation } from "./timeline.api";
import {
  call,
  companyRecord,
  contactRecord,
  created,
  leadRecord,
  reassigned,
  savedEntry,
  timelinePage,
} from "./timeline.fixtures";
import type { RecordRef } from "./timeline.types";

vi.mock("./timeline.api");
vi.mock("sonner");

const titles = () =>
  within(screen.getByRole("list", { name: "Timeline entries" }))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p")?.textContent);

// The same Timeline, composer and phone dialog serve every record type.
describe.each<[string, RecordRef, string]>([
  ["a lead", leadRecord, "Lead created"],
  ["a contact", contactRecord, "Contact created"],
  ["a company", companyRecord, "Company created"],
])("Timeline of %s", (_, record, createdTitle) => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([call, reassigned, created]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads that record's entries and names the record in 'created'", async () => {
    renderWithStore(<Timeline record={record} canWrite />, { me: repUser });

    await waitFor(() => {
      expect(titles()).toEqual(["Call", "Reassigned from Ada Admin to Rob Rep", createdTitle]);
    });
    expect(listTimeline).toHaveBeenCalledWith(record, { page: 1, pageSize: 25 });
  });

  it("saves a conversation and a note on that record from the inline form", async () => {
    vi.mocked(logConversation).mockResolvedValue(
      savedEntry({ kind: "CONVERSATION", conversationType: "CALL", body: "Agreed." }),
    );
    vi.mocked(addNote).mockResolvedValue({
      ...savedEntry({ kind: "NOTE", body: "Remember." }),
      id: "eeeeeeee-eeee-4eee-8eee-000000000098",
    });
    const { user } = renderWithStore(<Timeline record={record} canWrite />, { me: repUser });
    await screen.findByRole("list", { name: "Timeline entries" });

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

  it("saves a conversation on that record from the phone dialog", async () => {
    // A phone: the button and its full-screen dialog are rendered only there.
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.mocked(logConversation).mockResolvedValue(
      savedEntry({ kind: "CONVERSATION", conversationType: "CALL", body: "Agreed." }),
    );
    const { user } = renderWithStore(
      <LogConversationButton record={record} recordName="Northwind" />,
      { me: repUser },
    );

    await user.click(screen.getByRole("button", { name: "Log conversation" }));
    const dialog = await screen.findByRole("dialog", { name: "Log conversation" });
    await user.type(within(dialog).getByLabelText("What was discussed?"), "Agreed.");
    await user.click(within(dialog).getByRole("button", { name: "Save conversation" }));

    await waitFor(() => {
      expect(logConversation).toHaveBeenCalledWith(
        record,
        expect.objectContaining({ summary: "Agreed." }),
      );
    });
  });
});
