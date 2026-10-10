import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.api";
import { assigned, followUp, notificationList, reminder } from "./notifications.fixtures";
import * as slice from "./notifications.slice";

vi.mock("./notifications.api");

const unavailable: ApiError = { code: "SERVICE_UNAVAILABLE", message: "Down", details: null };

// A promise the test resolves by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("notifications slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data and no error", () => {
    const { notifications } = makeStore().getState();
    expect(notifications.unread).toEqual({ data: null, status: "idle", error: null });
    expect(notifications.list).toEqual({
      data: null,
      status: "idle",
      error: null,
      more: { status: "idle", error: null },
    });
  });

  it("loads the unread count, and does not ask twice at once", async () => {
    const request = deferred<number>();
    vi.mocked(getUnreadCount).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(slice.fetchUnreadCount());
    expect(store.getState().notifications.unread.status).toBe("loading");
    await store.dispatch(slice.fetchUnreadCount());
    expect(getUnreadCount).toHaveBeenCalledTimes(1);

    request.resolve(3);
    await pending;
    expect(store.getState().notifications.unread).toEqual({
      data: 3,
      status: "succeeded",
      error: null,
    });
  });

  it("keeps the last count when asking again fails", async () => {
    vi.mocked(getUnreadCount).mockResolvedValueOnce(2).mockRejectedValue(unavailable);
    const store = makeStore();
    await store.dispatch(slice.fetchUnreadCount());

    await store.dispatch(slice.fetchUnreadCount());

    expect(store.getState().notifications.unread).toEqual({
      data: 2,
      status: "failed",
      error: unavailable,
    });
  });

  it("loads the first page, then adds the next without repeating a notification", async () => {
    vi.mocked(listNotifications)
      .mockResolvedValueOnce(notificationList([reminder, followUp], 3))
      .mockResolvedValueOnce(notificationList([followUp, assigned], 3, 2));
    const store = makeStore();

    await store.dispatch(slice.fetchNotifications());
    expect(listNotifications).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });
    await store.dispatch(slice.fetchMoreNotifications());

    expect(listNotifications).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });
    expect(store.getState().notifications.list.data?.notifications).toEqual([
      reminder,
      followUp,
      assigned,
    ]);
    expect(store.getState().notifications.list.status).toBe("succeeded");
  });

  it("does not load more when everything is loaded, and keeps the list when more fails", async () => {
    vi.mocked(listNotifications).mockResolvedValueOnce(notificationList([reminder]));
    const store = makeStore();
    await store.dispatch(slice.fetchNotifications());
    await store.dispatch(slice.fetchMoreNotifications());
    expect(listNotifications).toHaveBeenCalledTimes(1);

    vi.mocked(listNotifications)
      .mockResolvedValueOnce(notificationList([reminder], 2))
      .mockRejectedValueOnce(unavailable);
    await store.dispatch(slice.fetchNotifications());
    await store.dispatch(slice.fetchMoreNotifications());

    const { list } = store.getState().notifications;
    expect(list.status).toBe("succeeded");
    expect(list.data?.notifications).toEqual([reminder]);
    expect(list.more).toEqual({ status: "failed", error: unavailable });
  });

  it("goes failed and keeps the ApiError when the list cannot be loaded", async () => {
    vi.mocked(listNotifications).mockRejectedValue(unavailable);
    const store = makeStore();

    await store.dispatch(slice.fetchNotifications());

    expect(store.getState().notifications.list.status).toBe("failed");
    expect(store.getState().notifications.list.error).toEqual(unavailable);
  });

  it("marks one as read in the list and takes one off the bell", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(2);
    vi.mocked(listNotifications).mockResolvedValue(notificationList([reminder, assigned]));
    const read = { ...reminder, readAt: "2026-10-10T09:00:00.000Z" };
    vi.mocked(markNotificationRead).mockResolvedValue(read);
    const store = makeStore();
    await store.dispatch(slice.fetchUnreadCount());
    await store.dispatch(slice.fetchNotifications());

    await store.dispatch(slice.markNotificationRead(reminder.id));
    expect(store.getState().notifications.unread.data).toBe(1);
    expect(store.getState().notifications.list.data?.notifications[0]).toEqual(read);

    // One that the list says was read already does not move the number.
    vi.mocked(markNotificationRead).mockResolvedValue(assigned);
    await store.dispatch(slice.markNotificationRead(assigned.id));
    expect(store.getState().notifications.unread.data).toBe(1);
  });

  it("marks everything as read", async () => {
    vi.mocked(getUnreadCount).mockResolvedValue(2);
    vi.mocked(listNotifications).mockResolvedValue(notificationList([reminder, assigned]));
    vi.mocked(markAllNotificationsRead).mockResolvedValue(2);
    const store = makeStore();
    await store.dispatch(slice.fetchUnreadCount());
    await store.dispatch(slice.fetchNotifications());

    await store.dispatch(slice.markAllNotificationsRead());

    const { unread, list } = store.getState().notifications;
    expect(unread.data).toBe(0);
    expect(list.data?.notifications.every((item) => item.readAt !== null)).toBe(true);
    // One that was read before keeps its own moment.
    expect(list.data?.notifications[1]?.readAt).toBe(assigned.readAt);
  });

  it("loads a loaded list again when the count has gone up", async () => {
    vi.mocked(getUnreadCount).mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    vi.mocked(listNotifications).mockResolvedValue(notificationList([reminder]));
    const store = makeStore();
    await store.dispatch(slice.fetchUnreadCount());
    await store.dispatch(slice.fetchNotifications());

    await store.dispatch(slice.fetchUnreadCount());

    expect(listNotifications).toHaveBeenCalledTimes(2);
  });
});
