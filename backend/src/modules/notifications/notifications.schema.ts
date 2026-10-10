import { listEnvelope, pageQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";

export const notificationKindSchema = z
  .enum(["TASK_REMINDER", "LEAD_FOLLOW_UP", "OPPORTUNITY_FOLLOW_UP", "TASK_ASSIGNED"])
  .openapi("NotificationKind");

export const notificationSchema = z
  .object({
    id: z.string(),
    kind: notificationKindSchema,
    title: z.string(),
    // A second line: a task's description or title, a follow-up's note. null when there is none.
    body: z.string().nullable(),
    // A path in the web app: /tasks?open=<id>, /leads/<id> or /opportunities/<id>.
    link: z.string(),
    // null until the user marks it read.
    readAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Notification");

// Named ApiNotification in code because `Notification` is the Prisma row.
export type ApiNotification = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = pageQuerySchema.extend({
  // unread=true leaves out the ones already read.
  unread: z.enum(["true", "false"]).optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const unreadCountSchema = z.object({ count: z.number().int() }).openapi("UnreadCount");

export type UnreadCount = z.infer<typeof unreadCountSchema>;

// How many notifications read-all marked as read.
export const markedReadSchema = z.object({ marked: z.number().int() }).openapi("MarkedRead");

export type MarkedRead = z.infer<typeof markedReadSchema>;

export const notificationResponseSchema = envelope(notificationSchema);
export const notificationListResponseSchema = listEnvelope(notificationSchema);
export const unreadCountResponseSchema = envelope(unreadCountSchema);
export const markedReadResponseSchema = envelope(markedReadSchema);
