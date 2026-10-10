import type { Notification } from "../../generated/prisma/client";
import { AppError } from "../../lib/app-error";
import { type Page, pageWindow } from "../../lib/list-query";
import { prisma } from "../../lib/prisma";
import type {
  ApiNotification,
  MarkedRead,
  NotificationListQuery,
  UnreadCount,
} from "./notifications.schema";

// A user's own notifications (TASK-04, TASK-06). Every function takes the signed-in user's
// id and never reaches another user's rows, whatever the role. Notifications are written
// elsewhere, by addNotification in lib/notifications.ts.

function toApiNotification(notification: Notification): ApiNotification {
  return {
    id: notification.id,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

// Newest first; `id` breaks ties.
export async function listNotifications(
  userId: string,
  query: NotificationListQuery,
): Promise<Page<ApiNotification>> {
  const where = { userId, ...(query.unread === "true" ? { readAt: null } : {}) };
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageWindow(query),
    }),
    prisma.notification.count({ where }),
  ]);
  return { items: notifications.map((item) => toApiNotification(item)), total };
}

export async function countUnread(userId: string): Promise<UnreadCount> {
  return { count: await prisma.notification.count({ where: { userId, readAt: null } }) };
}

// Another user's notification answers exactly like one that does not exist. Reading one
// that is already read keeps the time it was first read.
export async function markRead(userId: string, id: string): Promise<ApiNotification> {
  const notification = await prisma.notification.findFirst({ where: { id, userId } });
  if (!notification) {
    throw new AppError("NOT_FOUND", 404, "Notification not found");
  }
  if (notification.readAt) {
    return toApiNotification(notification);
  }
  return toApiNotification(
    await prisma.notification.update({ where: { id }, data: { readAt: new Date() } }),
  );
}

export async function markAllRead(userId: string): Promise<MarkedRead> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { marked: count };
}
