"use client";

import { BellOff, CheckCheck } from "lucide-react";
import { useEffect } from "react";

import { FormAlert } from "@/components/shared/form-alert";
import { PageHeader } from "@/components/shared/page-header";
import { PageError, PageState } from "@/components/shared/page-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeApiError } from "@/lib/api/error-messages";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { NotificationContent, useNotificationActions } from "./notification-item";
import {
  fetchMoreNotifications,
  fetchNotifications,
  selectNotificationList,
  selectUnreadCount,
} from "./notifications.slice";

const SKELETON_ROWS = [0, 1, 2, 3];

// /notifications: everything the signed-in user was told, newest first: reminders of tasks
// and follow-ups, and tasks someone gave them. Opening one marks it as read and goes to the
// task or the record it is about. The bell in the top bar leads here.
export function NotificationsPage() {
  const dispatch = useAppDispatch();
  const { data, status, error, more } = useAppSelector(selectNotificationList);
  const { data: unread } = useAppSelector(selectUnreadCount);
  const { open, markAllRead } = useNotificationActions();

  useEffect(() => {
    void dispatch(fetchNotifications());
  }, [dispatch]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          unread === null
            ? "Reminders, follow-ups and tasks you were given."
            : unread === 0
              ? "You have read everything."
              : `${String(unread)} unread`
        }
        action={
          unread ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
              onClick={() => void markAllRead()}
            >
              <CheckCheck aria-hidden />
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      {/* A failed reload keeps the last list on screen, so say that it is out of date. */}
      {data && status === "failed" && error ? (
        <FormAlert message={describeApiError(error)} />
      ) : null}

      {data === null ? (
        status === "failed" && error ? (
          <PageError error={error} onRetry={() => void dispatch(fetchNotifications())} />
        ) : (
          <div
            role="status"
            aria-label="Loading notifications"
            className="bg-card rounded-lg border"
          >
            {SKELETON_ROWS.map((row) => (
              <div key={row} className="flex gap-3 border-b p-4 last:border-b-0">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : data.notifications.length === 0 ? (
        <PageState
          icon={BellOff}
          title="No notifications yet"
          description="Reminders for your tasks and follow-ups, and tasks someone gives you, will show here."
        />
      ) : (
        <>
          <ul
            aria-label="Notifications"
            className="bg-card flex min-w-0 flex-col divide-y rounded-lg border"
          >
            {data.notifications.map((notification) => (
              <li key={notification.id} className="min-w-0">
                <button
                  type="button"
                  className="hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full min-w-0 p-4 outline-none focus-visible:ring-3"
                  onClick={() => {
                    open(notification);
                  }}
                >
                  <NotificationContent notification={notification} />
                </button>
              </li>
            ))}
          </ul>

          {more.status === "failed" && more.error ? (
            <FormAlert message={describeApiError(more.error)} />
          ) : null}
          {data.notifications.length < data.total ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 self-center px-4"
              disabled={more.status === "loading"}
              onClick={() => void dispatch(fetchMoreNotifications())}
            >
              {more.status === "loading" ? "Loading..." : "Load more"}
            </Button>
          ) : (
            <p className="text-muted-foreground text-center text-xs">
              {data.total === 1 ? "That is the only one." : `All ${String(data.total)} are shown.`}
            </p>
          )}
        </>
      )}
    </>
  );
}
