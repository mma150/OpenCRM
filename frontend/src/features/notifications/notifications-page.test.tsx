import { screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchUnreadCount } from "@/features/notifications/notifications.slice";
import type { ApiError } from "@/lib/api/http";
import { mockRouter } from "@/test/navigation-mock";
import { makeSignedInStore, renderWithStore, repUser } from "@/test/render-with-store";

import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.api";
import { assigned, followUp, notificationList, reminder } from "./notifications.fixtures";
import { NotificationsPage } from "./notifications-page";

vi.mock("./notifications.api");
vi.mock("sonner");

const unavailable: ApiError = { code: "SERVICE_UNAVAILABLE", message: "Down", details: null };

// The page inside a store whose bell has already counted, as it has in the app.
async function renderPage(unread = 2) {
  vi.mocked(getUnreadCount).mockResolvedValue(unread);
  const store = makeSignedInStore(repUser);
  await store.dispatch(fetchUnreadCount());
  return renderWithStore(<NotificationsPage />, { store });
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists the notifications newest first, with unread ones marked by a word", async () => {
    vi.mocked(listNotifications).mockResolvedValue(
      notificationList([reminder, followUp, assigned]),
    );
    await renderPage();

    const items = within(await screen.findByRole("list", { name: "Notifications" })).getAllByRole(
      "listitem",
    );
    expect(items.map((item) => within(item).queryByText("New") !== null)).toEqual([
      true,
      true,
      false,
    ]);
    expect(within(items[0] as HTMLElement).getByText(reminder.title)).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(/Task reminder/)).toBeInTheDocument();
    expect(
      within(items[0] as HTMLElement).getByText("Include the volume discount."),
    ).toBeInTheDocument();
    expect(screen.getByText("2 unread")).toBeInTheDocument();
  });

  it("marks one as read and goes to its link when it is opened", async () => {
    vi.mocked(listNotifications).mockResolvedValue(notificationList([reminder, followUp]));
    vi.mocked(markNotificationRead).mockResolvedValue({ ...followUp, readAt: "2026-10-10" });
    const { user } = await renderPage();

    await user.click(await screen.findByRole("button", { name: /Follow up with Marcus Chen/ }));

    expect(markNotificationRead).toHaveBeenCalledWith(followUp.id);
    expect(mockRouter.push).toHaveBeenCalledWith(followUp.link);
    expect(await screen.findByText("1 unread")).toBeInTheDocument();
  });

  it("marks everything as read", async () => {
    vi.mocked(listNotifications).mockResolvedValue(notificationList([reminder, followUp]));
    vi.mocked(markAllNotificationsRead).mockResolvedValue(2);
    const { user } = await renderPage();

    await user.click(await screen.findByRole("button", { name: "Mark all as read" }));

    await waitFor(() => {
      expect(screen.queryByText("New")).not.toBeInTheDocument();
    });
    expect(screen.getByText("You have read everything.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("All notifications are marked as read.");
  });

  it("says so when marking everything fails", async () => {
    vi.mocked(listNotifications).mockResolvedValue(notificationList([reminder]));
    vi.mocked(markAllNotificationsRead).mockRejectedValue(unavailable);
    const { user } = await renderPage();

    await user.click(await screen.findByRole("button", { name: "Mark all as read" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "The service is temporarily unavailable. Try again in a moment.",
      );
    });
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("loads more when there are more", async () => {
    vi.mocked(listNotifications)
      .mockResolvedValueOnce(notificationList([reminder, followUp], 3))
      .mockResolvedValueOnce(notificationList([assigned], 3, 2));
    const { user } = await renderPage();

    await user.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByText(assigned.title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(screen.getByText("All 3 are shown.")).toBeInTheDocument();
  });

  it("has an empty state", async () => {
    vi.mocked(listNotifications).mockResolvedValue(notificationList([]));
    await renderPage(0);

    expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument();
  });

  it("shows a failed load with Retry", async () => {
    vi.mocked(listNotifications)
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValue(notificationList([reminder]));
    const { user } = await renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The service is temporarily unavailable. Try again in a moment.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(reminder.title)).toBeInTheDocument();
  });
});
