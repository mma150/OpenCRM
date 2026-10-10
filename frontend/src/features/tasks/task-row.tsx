"use client";

import { Bell, CalendarClock, CircleAlert, User } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatNearDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { taskRecordHref, taskRecordLabel } from "./task-labels";
import type { Task } from "./tasks.types";

// What a row needs of a task. A list that holds less than the whole task (Home) can still
// use the row.
export type TaskRowItem = Pick<Task, "id" | "title" | "dueAt" | "record"> &
  Partial<Pick<Task, "assignee" | "reminderAt" | "status" | "completedAt">>;

// One task in a list: a large checkbox that completes it (or reopens it, when it is done),
// the title, the record it is linked to, when it is due and, when it is not the viewer's
// own, who it is assigned to. The title opens the task when `onOpen` is given.
//
// `overdue` marks the due date as late in the destructive colour and with the word
// "Overdue", never by colour alone.
export function TaskRow<Item extends TaskRowItem>({
  task,
  overdue = false,
  meId,
  canWrite,
  onToggle,
  onOpen,
}: {
  task: Item;
  overdue?: boolean;
  // The signed-in user: their own name is not repeated on every row.
  meId: string;
  // False for a Read-only user: the checkbox is left out.
  canWrite: boolean;
  onToggle: (task: Item) => void;
  onOpen?: (task: Item) => void;
}) {
  const done = task.status === "DONE";
  const titleClass = cn(
    "min-w-0 text-left text-sm font-medium wrap-anywhere",
    done && "text-muted-foreground line-through",
  );

  return (
    <li className="flex min-w-0 items-start gap-1 py-2 pr-3 pl-1 sm:gap-2 sm:pr-4 sm:pl-2">
      {canWrite ? (
        // The label is the hit area: 44px, around a 24px box.
        <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="accent-primary size-6 cursor-pointer rounded"
            checked={done}
            aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
            onChange={() => {
              onToggle(task);
            }}
          />
        </label>
      ) : (
        <span className="w-2 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-2.5">
        {onOpen ? (
          <button
            type="button"
            className={cn(
              titleClass,
              "hover:text-primary focus-visible:ring-ring/50 self-start rounded-sm outline-none focus-visible:ring-3",
            )}
            onClick={() => {
              onOpen(task);
            }}
          >
            {task.title}
          </button>
        ) : (
          <p className={titleClass}>{task.title}</p>
        )}
        <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {task.record ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Badge variant="secondary">{taskRecordLabel(task.record.type)}</Badge>
              <Link
                href={taskRecordHref(task.record)}
                className="text-primary focus-visible:ring-ring/50 min-w-0 rounded-sm underline-offset-4 outline-none wrap-anywhere hover:underline focus-visible:ring-3"
              >
                {task.record.name}
              </Link>
            </span>
          ) : null}
          {done && task.completedAt ? (
            <span>Completed {formatNearDateTime(task.completedAt)}</span>
          ) : task.dueAt ? (
            <span
              className={cn("flex items-center gap-1", overdue && "text-destructive font-medium")}
            >
              {overdue ? (
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
              ) : (
                <CalendarClock aria-hidden className="size-3.5 shrink-0" />
              )}
              <span>
                {overdue ? "Overdue · " : "Due "}
                {formatNearDateTime(task.dueAt)}
              </span>
            </span>
          ) : null}
          {task.reminderAt && !done ? (
            <span className="flex items-center gap-1">
              <Bell aria-hidden className="size-3.5 shrink-0" />
              <span>Reminder {formatNearDateTime(task.reminderAt)}</span>
            </span>
          ) : null}
          {task.assignee && task.assignee.id !== meId ? (
            <span className="flex min-w-0 items-center gap-1">
              <User aria-hidden className="size-3.5 shrink-0" />
              <span className="min-w-0 wrap-anywhere">{task.assignee.name}</span>
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
