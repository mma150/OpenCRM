import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockRouter } from "@/test/navigation-mock";
import { adminUser, renderWithStore } from "@/test/render-with-store";

import { NotificationBell, UNREAD_POLL_MS } from "./notification-bell";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.api";
import { assigned, followUp, notificationList, reminder } from "./notifications.fixtures";

vi.mock("./notifications.api");
vi.mock("sonner");

// What the tab says about itself; jsdom calls it visible unless a test says otherwise.
let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.mocked(getUnreadCount).mockResolvedValue(2);
    vi.mocked(listNotifications).mockResolvedValue(
      notificationList([reminder, followUp, assigned]),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows how many notifications are unread, in its name too", async () => {
    renderWithStore(<NotificationBell />, { me: adminUser });

    const bell = await screen.findByRole("button", { name: "Notifications, 2 unread" });
    expect(bell).toHaveTextContent("2");
  });

  it("shows no number when everything is read", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(0);
    renderWithStore(<NotificationBell />, { me: adminUser });

    await waitFor(() => {
      expect(getUnreadCount).toHaveBeenCalled();
    });
    expect(await screen.findByRole("button", { name: "Notifications" })).toHaveTextContent("");
  });

  it("asks again every minute, so the number moves without a reload", async () => {
    vi.useFakeTimers();
    renderWithStore(<NotificationBell />, { me: adminUser });
    await flush();
    expect(getUnreadCount).toHaveBeenCalledTimes(1);

    vi.mocked(getUnreadCount).mockResolvedValue(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS);
    });

    expect(getUnreadCount).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toBeInTheDocument();
  });

  it("stops asking while the tab is hidden, and catches up when it is looked at again", async () => {
    vi.useFakeTimers();
    renderWithStore(<NotificationBell />, { me: adminUser });
    await flush();
    expect(getUnreadCount).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS * 5);
    });
    expect(getUnreadCount).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await flush();
    expect(getUnreadCount).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS);
    });
    expect(getUnreadCount).toHaveBeenCalledTimes(3);
  });

  it("asks again when the window gets the focus back", async () => {
    renderWithStore(<NotificationBell />, { me: adminUser });
    await screen.findByRole("button", { name: "Notifications, 2 unread" });

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(getUnreadCount).toHaveBeenCalledTimes(2);
    });
  });

  it("stops asking once it is gone", async () => {
    vi.useFakeTimers();
    const { unmount } = renderWithStore(<NotificationBell />, { me: adminUser });
    await flush();

    unmount();
    await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS * 3);

    expect(getUnreadCount).toHaveBeenCalledTimes(1);
  });

  it("opens a panel with the latest notifications, unread ones marked with a word", async () => {
    const { user } = renderWithStore(<NotificationBell />, { me: adminUser });

    await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));

    const items = await screen.findAllByRole("menuitem");
    expect(within(items[0] as HTMLElement).getByText(reminder.title)).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText("New")).toBeInTheDocument();
    expect(within(items[2] as HTMLElement).getByText(assigned.title)).toBeInTheDocument();
    expect(within(items[2] as HTMLElement).queryByText("New")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View all notifications" })).toHaveAttribute(
      "href",
      "/notifications",
    );
  });

  it("marks a notification as read and goes to what it is about", async () => {
    vi.mocked(markNotificationRead).mockResolvedValue({ ...reminder, readAt: "2026-10-10" });
    const { user } = renderWithStore(<NotificationBell />, { me: adminUser });

    await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
    await user.click(await screen.findByText(reminder.title));

    expect(markNotificationRead).toHaveBeenCalledWith(reminder.id);
    expect(mockRouter.push).toHaveBeenCalledWith(reminder.link);
    expect(
      await screen.findByRole("button", { name: "Notifications, 1 unread" }),
    ).toBeInTheDocument();
  });

  it("does not mark a read notification again", async () => {
    const { user } = renderWithStore(<NotificationBell />, { me: adminUser });

    await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
    await user.click(await screen.findByText(assigned.title));

    expect(markNotificationRead).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith(assigned.link);
  });

  it("never follows a link that leaves the app", async () => {
    vi.mocked(listNotifications).mockResolvedValue(
      notificationList([{ ...assigned, link: "https://evil.example/phish" }]),
    );
    const { user } = renderWithStore(<NotificationBell />, { me: adminUser });

    await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
    await user.click(await screen.findByText(assigned.title));

    expect(mockRouter.push).toHaveBeenCalledWith("/");
  });

  it("marks everything as read from the panel, which stays open", async () => {
    vi.mocked(markAllNotificationsRead).mockResolvedValue(2);
    const { user } = renderWithStore(<NotificationBell />, { me: adminUser });

    await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mark all as read" }));

    await waitFor(() => {
      expect(markAllNotificationsRead).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText("New")).not.toBeInTheDocument();
    });
    expect(screen.getByText(reminder.title)).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Mark all as read" })).not.toBeInTheDocument();
  });

  it("says so when there are no notifications", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(0);
    vi.mocked(listNotifications).mockResolvedValue(notificationList([]));
    const { user } = renderWithStore(<NotificationBell />, { me: adminUser });

    await user.click(await screen.findByRole("button", { name: "Notifications" }));

    expect(await screen.findByText(/No notifications yet/)).toBeInTheDocument();
  });
});
