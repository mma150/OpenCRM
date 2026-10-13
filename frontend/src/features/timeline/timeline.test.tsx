import { screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { formatDateTime } from "@/lib/format";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { Timeline } from "./timeline";
import { addNote, listTimeline, logConversation } from "./timeline.api";
import {
  allEntries,
  call,
  created,
  emailSent,
  emailWithQuote,
  INVOICE,
  invoiceStatus,
  leadRecord,
  meeting,
  note,
  QUOTE,
  quoteStatus,
  savedEntry,
  timelinePage,
} from "./timeline.fixtures";
import type { TimelineEntry, TimelinePage } from "./timeline.types";

vi.mock("./timeline.api");
vi.mock("sonner");

async function renderTimeline(
  page: TimelinePage = timelinePage(),
  props: { canWrite?: boolean; refreshKey?: string } = {},
) {
  vi.mocked(listTimeline).mockResolvedValue(page);
  const view = renderWithStore(
    <Timeline
      record={leadRecord}
      canWrite={props.canWrite ?? true}
      refreshKey={props.refreshKey}
    />,
    { me: repUser },
  );
  await waitFor(() => {
    expect(screen.queryByRole("status", { name: "Loading timeline" })).not.toBeInTheDocument();
  });
  return view;
}

const entries = () => within(screen.getByRole("list", { name: "Timeline entries" }));
const titles = () =>
  entries()
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p")?.textContent);

describe("Timeline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the loading state while the first page is on its way", () => {
    vi.mocked(listTimeline).mockReturnValue(new Promise(() => undefined));
    renderWithStore(<Timeline record={leadRecord} canWrite />, { me: repUser });
    expect(screen.getByRole("status", { name: "Loading timeline" })).toBeInTheDocument();
  });

  it("titles every kind of entry", async () => {
    await renderTimeline();

    expect(titles()).toEqual([
      "Call",
      "Meeting",
      "Note",
      "Marked as lost — Price",
      "Lost reason updated — No budget",
      `Reassigned from ${adminUser.name} to ${repUser.name}`,
      "Status changed: New → Contacted",
      "Lead created",
    ]);
    expect(screen.getByText("8 entries")).toBeInTheDocument();
    expect(listTimeline).toHaveBeenCalledWith(leadRecord, { page: 1, pageSize: 25 });
  });

  it("shows who made an entry and when, and its text with the line breaks kept", async () => {
    await renderTimeline(timelinePage([call]));

    const item = entries().getByRole("listitem");
    expect(item).toHaveTextContent(`${repUser.name} · ${formatDateTime(call.occurredAt)}`);
    const text = within(item).getByText(/Discussed fleet pricing/);
    expect(text.textContent).toBe("Discussed fleet pricing.\nSend the proposal on Friday.");
    expect(text).toHaveClass("whitespace-pre-wrap", "wrap-anywhere");
    expect(screen.getByText("1 entry")).toBeInTheDocument();
  });

  it("shows the note given when a record was marked as lost", async () => {
    await renderTimeline();

    const lost = screen.getByText("Marked as lost — Price").closest("li");
    expect(lost).toHaveTextContent("Too expensive this year.");
  });

  it("adds a relative hint to a recent entry, and says when one was logged on a later day", async () => {
    const recent = savedEntry({ kind: "NOTE", body: "Fresh." });
    const backdated: TimelineEntry = {
      ...call,
      occurredAt: "2026-10-01T10:00:00.000Z",
      createdAt: "2026-10-04T10:00:00.000Z",
    };
    await renderTimeline(timelinePage([recent, backdated]));

    const [first, second] = entries().getAllByRole("listitem");
    expect(first).toHaveTextContent("(just now)");
    expect(second).toHaveTextContent("logged Oct 4, 2026");
    expect(second).not.toHaveTextContent("ago)");
  });

  it("cuts a very long text short until Show more is pressed", async () => {
    const long = { ...note, body: "Long text. ".repeat(100) };
    const { user } = await renderTimeline(timelinePage([long]));

    const text = screen.getByText(/Long text\./);
    expect(text).toHaveClass("line-clamp-6");
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(text).not.toHaveClass("line-clamp-6");
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows an email with its subject, who it went to, and its text", async () => {
    await renderTimeline(timelinePage([emailSent, created]));

    const [email] = entries().getAllByRole("listitem");
    expect(titles()[0]).toBe("Email sent: Recap of our demo");
    expect(email).toHaveTextContent("To: marcus.chen@acme.example, ops@acme.example");
    expect(email).toHaveTextContent("Cc: mia@example.com");
    expect(within(email as HTMLElement).getByText(/Here is the recap of our demo/)).toHaveClass(
      "whitespace-pre-wrap",
    );
    // No quote went with it, so there is nothing to open.
    expect(within(email as HTMLElement).queryByRole("link")).not.toBeInTheDocument();
  });

  it("leaves out Cc when there is none, and links an email to the quote it carried", async () => {
    await renderTimeline(timelinePage([emailWithQuote]));

    const email = within(entries().getAllByRole("listitem")[0] as HTMLElement);
    expect(email.queryByText(/^Cc:/)).not.toBeInTheDocument();
    expect(email.getByRole("link", { name: "Quote Q-0001" })).toHaveAttribute(
      "href",
      `/quotes/${QUOTE.id}`,
    );
  });

  it("cuts a long email short until Show more is pressed", async () => {
    const long = { ...emailSent, body: "A long email. ".repeat(100) };
    const { user } = await renderTimeline(timelinePage([long]));

    expect(screen.getByText(/A long email\./)).toHaveClass("line-clamp-6");
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByText(/A long email\./)).not.toHaveClass("line-clamp-6");
  });

  it("links the number of a quote and of an invoice to its page", async () => {
    await renderTimeline(
      timelinePage([invoiceStatus("SENT", "PAID"), quoteStatus("DRAFT", "SENT"), created]),
    );

    expect(titles().slice(0, 2)).toEqual([
      "Invoice INV-0001 marked paid",
      "Quote Q-0001 sent · $4,360.87",
    ]);
    expect(entries().getByRole("link", { name: "INV-0001" })).toHaveAttribute(
      "href",
      `/invoices/${INVOICE.id}`,
    );
    expect(entries().getByRole("link", { name: "Q-0001" })).toHaveAttribute(
      "href",
      `/quotes/${QUOTE.id}`,
    );
  });

  it("names a deleted quote without a link: it is gone", async () => {
    await renderTimeline(timelinePage([quoteStatus("DRAFT", null)]));

    expect(titles()).toEqual(["Quote Q-0001 deleted"]);
    expect(entries().queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers no way to edit or delete an entry", async () => {
    await renderTimeline();

    expect(entries().queryByRole("button")).not.toBeInTheDocument();
    expect(entries().queryByRole("link")).not.toBeInTheDocument();
  });

  it("filters with the tabs: All, Conversations, Notes and Changes", async () => {
    const { user } = await renderTimeline();
    const filter = within(screen.getByRole("group", { name: "Filter timeline" }));
    expect(filter.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "All",
      "Conversations",
      "Notes",
      "Changes",
    ]);
    expect(filter.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

    vi.mocked(listTimeline).mockResolvedValue(timelinePage([call, meeting]));
    await user.click(filter.getByRole("button", { name: "Conversations" }));
    await waitFor(() => {
      expect(titles()).toEqual(["Call", "Meeting"]);
    });
    expect(listTimeline).toHaveBeenLastCalledWith(leadRecord, {
      kind: "CONVERSATION",
      page: 1,
      pageSize: 25,
    });
    expect(filter.getByRole("button", { name: "Conversations" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(filter.getByRole("button", { name: "Notes" }));
    await waitFor(() => {
      expect(listTimeline).toHaveBeenLastCalledWith(leadRecord, {
        kind: "NOTE",
        page: 1,
        pageSize: 25,
      });
    });
    await user.click(filter.getByRole("button", { name: "Changes" }));
    await waitFor(() => {
      expect(listTimeline).toHaveBeenLastCalledWith(leadRecord, {
        kind: "SYSTEM",
        page: 1,
        pageSize: 25,
      });
    });
  });

  it("loads more entries under the list until all are shown", async () => {
    const { user } = await renderTimeline(timelinePage([call, meeting], { total: 3 }));
    expect(screen.getByText("3 entries")).toBeInTheDocument();

    vi.mocked(listTimeline).mockResolvedValue(timelinePage([created], { page: 2, total: 3 }));
    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(titles()).toEqual(["Call", "Meeting", "Lead created"]);
    });
    expect(listTimeline).toHaveBeenLastCalledWith(leadRecord, { page: 2, pageSize: 25 });
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("keeps the list and explains when loading more fails", async () => {
    const { user } = await renderTimeline(timelinePage([call], { total: 3 }));

    vi.mocked(listTimeline).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "Server text",
      details: null,
    } satisfies ApiError);
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(
      await screen.findByText("The server cannot be reached. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(titles()).toEqual(["Call"]);
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
  });

  it("says nothing is logged yet and nudges towards the first conversation", async () => {
    await renderTimeline(timelinePage([]));

    expect(screen.getByText("Nothing logged yet")).toBeInTheDocument();
    expect(
      screen.getByText("Log the first conversation to start this record's history."),
    ).toBeInTheDocument();
    expect(screen.getByText("0 entries")).toBeInTheDocument();
  });

  it("names what is missing under a filter tab", async () => {
    const { user } = await renderTimeline();

    vi.mocked(listTimeline).mockResolvedValue(timelinePage([]));
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(await screen.findByText("No notes yet")).toBeInTheDocument();
  });

  it.each([
    ["NETWORK_ERROR", "The server cannot be reached. Check your connection and try again."],
    ["SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Try again in a moment."],
    ["INTERNAL_ERROR", "INTERNAL_ERROR: Server text"],
  ] as const)("shows a failed load (%s) with the request id and Retry", async (code, message) => {
    vi.mocked(listTimeline).mockRejectedValue({
      code,
      message: "Server text",
      details: null,
      requestId: "req-123",
    } satisfies ApiError);
    const { user } = renderWithStore(<Timeline record={leadRecord} canWrite />, { me: repUser });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("Request id: req-123")).toBeInTheDocument();

    vi.mocked(listTimeline).mockResolvedValue(timelinePage([call]));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(titles()).toEqual(["Call"]);
    });
  });

  it("shows a saved conversation at the top at once", async () => {
    const saved = savedEntry({ kind: "CONVERSATION", conversationType: "EMAIL", body: "Sent it." });
    vi.mocked(logConversation).mockResolvedValue(saved);
    const { user } = await renderTimeline(timelinePage([call, created]));
    vi.mocked(listTimeline).mockClear();

    await user.click(screen.getByRole("radio", { name: "Email" }));
    await user.type(screen.getByLabelText("What was discussed?"), "Sent it.");
    await user.click(screen.getByRole("button", { name: "Save conversation" }));

    await waitFor(() => {
      expect(titles()).toEqual(["Email", "Call", "Lead created"]);
    });
    expect(screen.getByText("3 entries")).toBeInTheDocument();
    // The entry came from the save itself; the list was not loaded again.
    expect(listTimeline).not.toHaveBeenCalled();
  });

  it("goes back to All when a note is saved while Conversations is selected", async () => {
    const saved = savedEntry({ kind: "NOTE", body: "Remember." });
    vi.mocked(addNote).mockResolvedValue(saved);
    const { user } = await renderTimeline();
    vi.mocked(listTimeline).mockResolvedValue(timelinePage([call]));
    await user.click(screen.getByRole("button", { name: "Conversations" }));
    await waitFor(() => {
      expect(titles()).toEqual(["Call"]);
    });

    vi.mocked(listTimeline).mockResolvedValue(timelinePage([saved, call]));
    await user.click(screen.getByRole("button", { name: "Note" }));
    await user.type(screen.getByLabelText("Note"), "Remember.");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => {
      expect(titles()).toEqual(["Note", "Call"]);
    });
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the list without the form to someone who may not write", async () => {
    await renderTimeline(timelinePage(allEntries), { canWrite: false });

    expect(titles()).toHaveLength(allEntries.length);
    expect(screen.queryByRole("form", { name: "Add to timeline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
  });

  it("does not nudge someone who may not write towards logging", async () => {
    await renderTimeline(timelinePage([]), { canWrite: false });

    expect(screen.getByText("Nothing logged yet")).toBeInTheDocument();
    expect(
      screen.getByText("Conversations and notes will show here once someone logs them."),
    ).toBeInTheDocument();
  });

  it("loads again, with the tab that is selected, when the refresh key changes", async () => {
    const { user, store, rerender } = await renderTimeline(timelinePage(), { refreshKey: "v1" });
    expect(listTimeline).toHaveBeenCalledTimes(1);

    vi.mocked(listTimeline).mockResolvedValue(timelinePage([created]));
    await user.click(screen.getByRole("button", { name: "Changes" }));
    await waitFor(() => {
      expect(titles()).toEqual(["Lead created"]);
    });
    expect(listTimeline).toHaveBeenCalledTimes(2);

    // The same key, and a new object for the same record, change nothing.
    const withKey = (key: string) => (
      <Provider store={store}>
        <Timeline record={{ ...leadRecord }} canWrite refreshKey={key} />
      </Provider>
    );
    rerender(withKey("v1"));
    expect(listTimeline).toHaveBeenCalledTimes(2);

    rerender(withKey("v2"));
    await waitFor(() => {
      expect(listTimeline).toHaveBeenCalledTimes(3);
    });
    expect(listTimeline).toHaveBeenLastCalledWith(leadRecord, {
      kind: "SYSTEM",
      page: 1,
      pageSize: 25,
    });
  });
});
