import type { NotificationKind, Prisma } from "../generated/prisma/client";

// In-app notifications: one row per message for one user. addNotification below is the only
// code that writes one; the notifications module lets the user read them and mark them read.

export interface NewNotification {
  // Who it is for.
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  // A path in the web app (see the links below), never a full address.
  link: string;
}

// Where a notification takes the user. The web app opens these paths as they are.
export const notificationLinks = {
  task: (id: string) => `/tasks?open=${id}`,
  lead: (id: string) => `/leads/${id}`,
  opportunity: (id: string) => `/opportunities/${id}`,
};

// Takes the transaction client on purpose: a notification is written in the same
// transaction as the change it reports (a task assigned, a reminder claimed), so there is
// never one without the other.
export async function addNotification(
  tx: Prisma.TransactionClient,
  notification: NewNotification,
): Promise<void> {
  await tx.notification.create({ data: notification });
}
