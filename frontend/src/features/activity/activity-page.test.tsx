import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@/features/auth/auth.types";
import { managerUser, readOnlyUser } from "@/features/leads/leads.fixtures";
import type { ApiError } from "@/lib/api/http";
import { formatDayHeading, formatTime, toDateInputValue } from "@/lib/format";
import { followNavigation, mockRouter, setMockLocation } from "@/test/navigation-mock";
import { adminUser, renderWithStore, repUser } from "@/test/render-with-store";

import { listActivity, listActivityAuthors } from "./activity.api";
import {
  activityList,
  allActivity,
  authors,
  daysAgoAt,
  elenaRecord,
  marcusRecord,
  mixedActivity,
  northwindRecord,
  olderLostReason,
  queryFor,
  todayCall,
} from "./activity.fixtures";
import type { ActivityList } from "./activity.types";
import { dayEnd, dayStart } from "./activity-labels";
import { ActivityPage } from "./activity-page";

vi.mock("./activity.api");

async function renderActivity(me: Me = adminUser, list: ActivityList = activityList()) {
  vi.mocked(listActivity).mockResolvedValue(list);
  vi.mocked(listActivityAuthors).mockResolvedValue(authors);
  const view = renderWithStore(<ActivityPage />, { me });
  await waitFor(() => {
    expect(screen.queryByRole("status", { name: "Loading activity" })).not.toBeInTheDocument();
  });
  return view;
}

const dayInput = (days: number) => toDateInputValue(new Date(daysAgoAt(days, 12)));
const fromBox = () => screen.getByLabelText("From");
const toBox = () => screen.getByLabelText("To");

type TestUser = ReturnType<typeof renderWithStore>["user"];

async function choose(user: TestUser, filter: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: filter }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("ActivityPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setMockLocation("/activity");
    followNavigation();
  });

  it.each([repUser, readOnlyUser])(
    "tells a $role they have no access and does not ask the API",
    (me) => {
      renderWithStore(<ActivityPage />, { me });

      expect(screen.getByText("You do not have access to Activity")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
      expect(screen.queryByRole("heading", { name: "Activity" })).not.toBeInTheDocument();
      expect(listActivity).not.toHaveBeenCalled();
      expect(listActivityAuthors).not.toHaveBeenCalled();
    },
  );

  it.each([adminUser, managerUser])("shows a $role the feed for the last 7 days", async (me) => {
    await renderActivity(me);

    expect(screen.getByRole("heading", { level: 1, name: "Activity" })).toBeInTheDocument();
    expect(screen.getByText("What your team did and when.")).toBeInTheDocument();
    expect(listActivity).toHaveBeenCalledWith({
      from: dayStart(dayInput(6)),
      to: dayEnd(dayInput(0)),
      page: 1,
      pageSize: 25,
    });
    expect(screen.getByRole("combobox", { name: "Dates" })).toHaveTextContent("Last 7 days");
    expect(fromBox()).toHaveValue(dayInput(6));
    expect(toBox()).toHaveValue(dayInput(0));
  });

  it("shows the loading state while the first page is on its way", () => {
    vi.mocked(listActivity).mockReturnValue(new Promise(() => undefined));
    vi.mocked(listActivityAuthors).mockResolvedValue(authors);
    renderWithStore(<ActivityPage />, { me: adminUser });

    expect(screen.getByRole("status", { name: "Loading activity" })).toBeInTheDocument();
  });

  it("shows the totals for the filtered range", async () => {
    await renderActivity();

    const totals = screen.getByLabelText("Totals for these filters");
    expect(totals).toHaveTextContent("Conversations12");
    expect(totals).toHaveTextContent("Notes5");
    expect(totals).toHaveTextContent("Status changes3");
  });

  it("groups the entries under Today, Yesterday and then the date", async () => {
    await renderActivity();

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Today", "Yesterday", formatDayHeading(olderLostReason.occurredAt)]);
    const count = (name: string) =>
      within(screen.getByRole("region", { name })).getAllByRole("listitem").length;
    expect(count("Today")).toBe(2);
    expect(count("Yesterday")).toBe(3);
  });

  it("says who did what on which record, when, with a short excerpt", async () => {
    await renderActivity();

    const items = screen
      .getAllByRole("listitem")
      .map((item) => item.querySelector("p")?.textContent);
    expect(items).toEqual([
      `${repUser.name} logged a call with Marcus Chen`,
      `${adminUser.name} added a note on Marcus Chen`,
      `${repUser.name} marked Devon Vance as lost`,
      `${repUser.name} changed the status of Marcus Chen to Contacted`,
      `${adminUser.name} reassigned Marcus Chen from ${adminUser.name} to ${repUser.name}`,
      `${repUser.name} updated the lost reason of Devon Vance`,
    ]);

    const first = screen.getAllByRole("listitem")[0];
    if (!first) {
      throw new Error("No entries");
    }
    expect(within(first).getByRole("link", { name: "Marcus Chen" })).toHaveAttribute(
      "href",
      `/leads/${marcusRecord.id}`,
    );
    expect(within(first).getByText(formatTime(todayCall.occurredAt))).toBeInTheDocument();
    const excerpt = within(first).getByText(/Discussed fleet pricing/);
    expect(excerpt).toHaveClass("line-clamp-2", "wrap-anywhere");
    // Two badges: what kind of record it is, then what was done.
    const badges = [...first.querySelectorAll("[data-slot=badge]")].map(
      (badge) => badge.textContent,
    );
    expect(badges).toEqual(["Lead", "Call"]);
    expect(screen.getByText("Price — Too expensive this year.")).toBeInTheDocument();
  });

  it("links each entry to the page of its record and says what kind of record it is", async () => {
    await renderActivity(adminUser, activityList(mixedActivity));

    const items = screen.getAllByRole("listitem");
    const seen = items.map((item) => ({
      sentence: item.querySelector("p")?.textContent,
      href: within(item).getByRole("link").getAttribute("href"),
      type: item.querySelector("[data-slot=badge]")?.textContent,
    }));
    expect(seen).toEqual([
      {
        sentence: `${repUser.name} logged a call with Northwind Logistics`,
        href: `/companies/${northwindRecord.id}`,
        type: "Company",
      },
      {
        sentence: `${adminUser.name} added a note on Elena Rostova`,
        href: `/contacts/${elenaRecord.id}`,
        type: "Contact",
      },
      {
        sentence: `${adminUser.name} created Elena Rostova`,
        href: `/contacts/${elenaRecord.id}`,
        type: "Contact",
      },
      {
        sentence: `${adminUser.name} reassigned Northwind Logistics from ${adminUser.name} to ${repUser.name}`,
        href: `/companies/${northwindRecord.id}`,
        type: "Company",
      },
      {
        sentence: `${repUser.name} changed the status of Marcus Chen to Contacted`,
        href: `/leads/${marcusRecord.id}`,
        type: "Lead",
      },
    ]);
    // On a phone the excerpt goes under the badges instead of beside them.
    const badgeRow = items[0]?.querySelector("[data-slot=badge]")?.parentElement?.parentElement;
    expect(badgeRow).toHaveClass("flex-col", "sm:flex-row");
  });

  it("filters by person and by type, and keeps both in the address", async () => {
    const { user } = await renderActivity();

    await user.click(screen.getByRole("combobox", { name: "Person" }));
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "Everyone",
      adminUser.name,
      repUser.name,
    ]);
    await user.click(screen.getByRole("option", { name: repUser.name }));
    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith({ ...queryFor(), userId: repUser.id });
    });

    await choose(user, "Type", "Notes");
    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith({
        ...queryFor(),
        userId: repUser.id,
        kind: "NOTE",
      });
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      `/activity?userId=${repUser.id}&kind=NOTE`,
      { scroll: false },
    );

    await choose(user, "Type", "Changes");
    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "SYSTEM", userId: repUser.id }),
      );
    });
  });

  it("offers Today and Last 30 days, and shows the days each covers", async () => {
    const { user } = await renderActivity();

    await choose(user, "Dates", "Today");
    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith(queryFor("today"));
    });
    expect(listActivity).toHaveBeenLastCalledWith({
      from: dayStart(dayInput(0)),
      to: dayEnd(dayInput(0)),
      page: 1,
      pageSize: 25,
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/activity?range=today", { scroll: false });
    expect(fromBox()).toHaveValue(dayInput(0));

    await choose(user, "Dates", "Last 30 days");
    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: dayStart(dayInput(29)), to: dayEnd(dayInput(0)) }),
      );
    });
    expect(fromBox()).toHaveValue(dayInput(29));

    await choose(user, "Dates", "Last 7 days");
    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith(queryFor());
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/activity", { scroll: false });
  });

  it("turns a typed date into a custom range, sent as the viewer's whole days", async () => {
    await renderActivity();

    fireEvent.change(fromBox(), { target: { value: "2026-09-01" } });

    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith({
        from: new Date("2026-09-01T00:00:00").toISOString(),
        to: dayEnd(dayInput(0)),
        page: 1,
        pageSize: 25,
      });
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      `/activity?range=custom&from=2026-09-01&to=${dayInput(0)}`,
      { scroll: false },
    );
    expect(screen.getByRole("combobox", { name: "Dates" })).toHaveTextContent("Custom");

    fireEvent.change(toBox(), { target: { value: "2026-09-10" } });
    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith({
        from: new Date("2026-09-01T00:00:00").toISOString(),
        to: new Date("2026-09-10T23:59:59.999").toISOString(),
        page: 1,
        pageSize: 25,
      });
    });
  });

  it("moves the other date along when the two would be the wrong way round", async () => {
    setMockLocation("/activity", "range=custom&from=2026-09-01&to=2026-09-10");
    await renderActivity();

    fireEvent.change(fromBox(), { target: { value: "2026-09-20" } });

    await waitFor(() => {
      expect(toBox()).toHaveValue("2026-09-20");
    });
    expect(fromBox()).toHaveValue("2026-09-20");
  });

  it("loads the feed the address describes, ignoring what is not a date or a known value", async () => {
    setMockLocation(
      "/activity",
      `userId=${repUser.id}&kind=NOTE&range=custom&from=2026-09-01&to=nonsense&page=2`,
    );
    await renderActivity(adminUser, activityList(allActivity, { page: 2, total: 31 }));

    expect(listActivity).toHaveBeenCalledWith({
      userId: repUser.id,
      kind: "NOTE",
      from: dayStart("2026-09-01"),
      page: 2,
      pageSize: 25,
    });
    expect(toBox()).toHaveValue("");
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Person" })).toHaveTextContent(repUser.name);
    });

    setMockLocation("/activity", "kind=EVERYTHING&range=forever");
    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith(queryFor());
    });
  });

  it("pages through the feed", async () => {
    const { user } = await renderActivity(adminUser, activityList(allActivity, { total: 60 }));

    expect(screen.getByText("1–25")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith({ ...queryFor(), page: 2 });
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/activity?page=2", { scroll: false });
  });

  it("says there was no activity in the last 7 days", async () => {
    await renderActivity(
      adminUser,
      activityList([], { summary: { conversations: 0, notes: 0, statusChanges: 0, emails: 0 } }),
    );

    expect(screen.getByText("No activity in the last 7 days")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("says nothing matches when filters are on, and clears them", async () => {
    setMockLocation("/activity", "kind=NOTE&range=today");
    const { user } = await renderActivity(adminUser, activityList([]));

    expect(screen.getByText("No activity matches these filters")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => {
      expect(listActivity).toHaveBeenLastCalledWith(queryFor());
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/activity", { scroll: false });
  });

  it.each([
    ["FORBIDDEN", "You do not have permission to do that."],
    ["NETWORK_ERROR", "The server cannot be reached. Check your connection and try again."],
    ["INTERNAL_ERROR", "INTERNAL_ERROR: Server text"],
  ] as const)("shows a failed load (%s) with the request id and Retry", async (code, message) => {
    vi.mocked(listActivity).mockRejectedValue({
      code,
      message: "Server text",
      details: null,
      requestId: "req-123",
    } satisfies ApiError);
    vi.mocked(listActivityAuthors).mockResolvedValue(authors);
    const { user } = renderWithStore(<ActivityPage />, { me: adminUser });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("Request id: req-123")).toBeInTheDocument();

    vi.mocked(listActivity).mockResolvedValue(activityList([todayCall]));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/logged a call with/)).toBeInTheDocument();
  });
});
