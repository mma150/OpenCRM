import type { Notification, NotificationList } from "./notifications.types";

// An unread reminder of a task; its link opens the task's dialog.
export const reminder: Notification = {
  id: "99999999-9999-4999-8999-999999999991",
  kind: "TASK_REMINDER",
  title: "Reminder: Send the revised quote",
  body: "Include the volume discount.",
  link: "/tasks?open=ffffffff-ffff-4fff-8fff-fffffffffff1",
  readAt: null,
  createdAt: "2026-10-05T08:00:00.000Z",
};

export const followUp: Notification = {
  id: "99999999-9999-4999-8999-999999999992",
  kind: "LEAD_FOLLOW_UP",
  title: "Follow up with Marcus Chen",
  body: null,
  link: "/leads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  readAt: null,
  createdAt: "2026-10-04T08:00:00.000Z",
};

// One that was read already.
export const assigned: Notification = {
  id: "99999999-9999-4999-8999-999999999993",
  kind: "TASK_ASSIGNED",
  title: "Mia Manager assigned you a task",
  body: "Call back about fleet pricing",
  link: "/tasks?open=ffffffff-ffff-4fff-8fff-fffffffffff2",
  readAt: "2026-10-03T09:00:00.000Z",
  createdAt: "2026-10-03T08:00:00.000Z",
};

export function notificationList(
  notifications: Notification[],
  total = notifications.length,
  page = 1,
): NotificationList {
  return { notifications, page, pageSize: 20, total };
}
