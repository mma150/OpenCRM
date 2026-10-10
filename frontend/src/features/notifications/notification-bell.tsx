"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { describeApiError } from "@/lib/api/error-messages";
import { useIsPhone } from "@/lib/use-is-phone";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { NotificationContent, useNotificationActions } from "./notification-item";
import {
  fetchNotifications,
  fetchUnreadCount,
  selectNotificationList,
  selectUnreadCount,
} from "./notifications.slice";

// How often the bell asks for the unread count while the tab is in view.
export const UNREAD_POLL_MS = 60_000;
// How many notifications the panel shows; the page has them all.
const PANEL_SIZE = 6;

// Keeps the unread count fresh without a reload: it is asked for when the bell appears,
// every minute after that, and whenever the window gets the focus back. While the tab is
// hidden nothing is asked; it catches up the moment the tab is looked at again.
function useUnreadPolling(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = () => {
      if (document.visibilityState === "visible") {
        void dispatch(fetchUnreadCount());
      }
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = setInterval(check, UNREAD_POLL_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        check();
        start();
      } else {
        stop();
      }
    };

    check();
    if (document.visibilityState === "visible") {
      start();
    }
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [dispatch]);
}

const bellClass =
  "hover:bg-muted focus-visible:ring-ring/50 relative flex size-11 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-3";

// The bell with its number. The number is text, so it is read out with the label.
function BellIcon({ count }: { count: number }) {
  return (
    <>
      <Bell aria-hidden className="size-5" />
      {count > 0 ? (
        <span
          aria-hidden
          className="bg-primary text-primary-foreground absolute top-1 right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[0.65rem] leading-none font-semibold"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </>
  );
}

// The latest notifications, inside the bell's menu. Each is a menu item, so the panel works
// with the arrow keys like every other menu.
function Panel() {
  const { data, status, error } = useAppSelector(selectNotificationList);
  const { data: unread } = useAppSelector(selectUnreadCount);
  const { open, markAllRead } = useNotificationActions();

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-2 py-1.5">
        <p className="text-sm font-semibold">Notifications</p>
        <p className="text-muted-foreground text-xs">{unread ?? 0} unread</p>
      </div>
      <DropdownMenuSeparator />
      {data === null ? (
        <p role="status" className="text-muted-foreground px-2 py-6 text-center text-sm">
          {status === "failed" && error ? describeApiError(error) : "Loading notifications..."}
        </p>
      ) : data.notifications.length === 0 ? (
        <p className="text-muted-foreground px-2 py-6 text-center text-sm">
          No notifications yet. Reminders and tasks you are given show here.
        </p>
      ) : (
        <div className="max-h-[60dvh] overflow-y-auto">
          {data.notifications.slice(0, PANEL_SIZE).map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="items-start py-2"
              onSelect={() => {
                open(notification);
              }}
            >
              <NotificationContent notification={notification} />
            </DropdownMenuItem>
          ))}
        </div>
      )}
      <DropdownMenuSeparator />
      <div className="flex items-center justify-between gap-2 p-1">
        <DropdownMenuItem asChild className="h-9 px-2 font-medium">
          <Link href="/notifications">View all notifications</Link>
        </DropdownMenuItem>
        {unread ? (
          <DropdownMenuItem
            className="text-primary h-9 px-2"
            // Stays open, so the list can be seen turning to "read".
            onSelect={(event) => {
              event.preventDefault();
              void markAllRead();
            }}
          >
            Mark all as read
          </DropdownMenuItem>
        ) : null}
      </div>
    </>
  );
}

// The bell in the top bar, at every width, with the number of unread notifications. From
// `md` it opens a panel with the latest ones; on a phone, where a panel would cover the
// screen anyway, it goes to the /notifications page.
export function NotificationBell() {
  const dispatch = useAppDispatch();
  const { data: unread } = useAppSelector(selectUnreadCount);
  const isPhone = useIsPhone();
  useUnreadPolling();

  const count = unread ?? 0;
  const label = count > 0 ? `Notifications, ${String(count)} unread` : "Notifications";

  if (isPhone) {
    return (
      <Link href="/notifications" aria-label={label} className={bellClass}>
        <BellIcon count={count} />
      </Link>
    );
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          void dispatch(fetchNotifications());
        }
      }}
    >
      <DropdownMenuTrigger aria-label={label} className={bellClass}>
        <BellIcon count={count} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-2rem)]">
        <Panel />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
