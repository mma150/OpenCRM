"use client";

import { AlarmClock, BellRing, ClipboardList, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { formatNearDateTime, formatRelativeTime } from "@/lib/format";
import { safeNextPath } from "@/lib/safe-next";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/store/hooks";

import { markAllNotificationsRead, markNotificationRead } from "./notifications.slice";
import type { Notification, NotificationKind } from "./notifications.types";

const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  TASK_REMINDER: AlarmClock,
  LEAD_FOLLOW_UP: BellRing,
  OPPORTUNITY_FOLLOW_UP: BellRing,
  TASK_ASSIGNED: ClipboardList,
};

// What kind of notification it is, in words. Never print the raw enum value.
const KIND_LABELS: Record<NotificationKind, string> = {
  TASK_REMINDER: "Task reminder",
  LEAD_FOLLOW_UP: "Lead follow-up",
  OPPORTUNITY_FOLLOW_UP: "Opportunity follow-up",
  TASK_ASSIGNED: "Task assigned",
};

// What one notification says: an icon for its kind, the title, a second line, and when.
// An unread one has a bolder title and the word "New" beside it, never colour alone.
export function NotificationContent({ notification }: { notification: Notification }) {
  const Icon = KIND_ICONS[notification.kind];
  const unread = notification.readAt === null;
  return (
    <span className="flex min-w-0 flex-1 items-start gap-3 text-left">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          unread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span
            className={cn(
              "min-w-0 text-sm wrap-anywhere",
              unread ? "text-foreground font-semibold" : "text-foreground font-normal",
            )}
          >
            {notification.title}
          </span>
          {unread ? <Badge className="mt-0.5 shrink-0">New</Badge> : null}
        </span>
        {notification.body ? (
          <span className="text-muted-foreground line-clamp-2 min-w-0 text-sm wrap-anywhere">
            {notification.body}
          </span>
        ) : null}
        <span className="text-muted-foreground text-xs">
          {KIND_LABELS[notification.kind]} ·{" "}
          <time dateTime={notification.createdAt}>
            {formatRelativeTime(notification.createdAt) ??
              formatNearDateTime(notification.createdAt)}
          </time>
        </span>
      </span>
    </span>
  );
}

// What the bell's panel and the notifications page do with a notification: opening one marks
// it as read and goes to what it is about. `link` comes from the API, but only a path inside
// this app is ever followed.
export function useNotificationActions(): {
  open: (notification: Notification) => void;
  markAllRead: () => Promise<void>;
} {
  const dispatch = useAppDispatch();
  const router = useRouter();

  return {
    open: (notification) => {
      if (notification.readAt === null) {
        // Not worth stopping for: it stays unread and can be opened again.
        dispatch(markNotificationRead(notification.id))
          .unwrap()
          .catch(() => undefined);
      }
      router.push(safeNextPath(notification.link));
    },
    markAllRead: async () => {
      try {
        await dispatch(markAllNotificationsRead()).unwrap();
        toast.success("All notifications are marked as read.");
      } catch (error) {
        toast.error(describeApiError(error as ApiError));
      }
    },
  };
}
