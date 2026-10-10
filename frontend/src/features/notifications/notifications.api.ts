import { http } from "@/lib/api/http";

import type {
  MarkedReadResponse,
  Notification,
  NotificationList,
  NotificationListQuery,
  NotificationResponse,
  NotificationsResponse,
  UnreadCountResponse,
} from "./notifications.types";

// One page of the signed-in user's notifications, newest first.
export async function listNotifications(query: NotificationListQuery): Promise<NotificationList> {
  const response = await http.get<NotificationsResponse>("/notifications", { params: query });
  return { notifications: response.data.data, ...response.data.meta };
}

// How many the user has not read: the number on the bell.
export async function getUnreadCount(): Promise<number> {
  const response = await http.get<UnreadCountResponse>("/notifications/unread-count");
  return response.data.data.count;
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const response = await http.post<NotificationResponse>(`/notifications/${id}/read`);
  return response.data.data;
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await http.post<MarkedReadResponse>("/notifications/read-all");
  return response.data.data.marked;
}
