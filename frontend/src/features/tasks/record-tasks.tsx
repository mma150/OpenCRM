"use client";

import { ListChecks, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { PageError } from "@/components/shared/page-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { selectAuth } from "@/features/auth/auth.slice";
import type { RecordRef } from "@/features/timeline/record-types";
import type { ApiError } from "@/lib/api/http";
import { useAppSelector } from "@/store/hooks";

import { TaskDialog } from "./task-dialog";
import { isOverdue, taskRecordType } from "./task-labels";
import { TaskRow } from "./task-row";
import { listTasks } from "./tasks.api";
import { selectCompletedTaskIds, stillOpen } from "./tasks.slice";
import type { Task, TaskList } from "./tasks.types";
import { useTaskToggle } from "./use-task-toggle";

// How many tasks the card shows at first, and after "Show all".
const SHOWN = 5;
const SHOWN_ALL = 100;
const SKELETON_ROWS = [0, 1];

// What the request answered, with the record it was asked for.
type Answer = { key: string } & ({ list: TaskList } | { error: ApiError });

// What the card's dialog shows: a new task for this record, or one of its tasks.
type OpenDialog = { task: Task | null } | null;

// The Tasks card on a lead's, contact's, company's or opportunity's page: the open tasks
// linked to that record that the signed-in user may see, soonest first, each with its
// checkbox, and "Add task" with the record filled in. The answer does not enter the store:
// only this card shows it, and the tasks slice's own lists belong to the /tasks page.
//
//   <RecordTasks record={{ type: "lead", id: lead.id }} recordName={lead.name} canWrite />
export function RecordTasks({
  record,
  recordName,
  canWrite,
}: {
  record: RecordRef;
  recordName: string;
  // False for a Read-only user: no checkboxes and no "Add task".
  canWrite: boolean;
}) {
  const { data: me } = useAppSelector(selectAuth);
  const completed = useAppSelector(selectCompletedTaskIds);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Counts the reloads (Retry, and after a task was added, changed or ticked off).
  const [attempt, setAttempt] = useState(0);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const reload = () => {
    setAttempt((count) => count + 1);
  };
  const toggle = useTaskToggle(reload);

  const recordType = taskRecordType(record.type);
  const key = `${recordType}:${record.id}`;
  const pageSize = showAll ? SHOWN_ALL : SHOWN;

  useEffect(() => {
    let current = true;
    listTasks({
      recordType,
      recordId: record.id,
      status: "OPEN",
      sort: "dueAt",
      order: "asc",
      page: 1,
      pageSize,
    }).then(
      (list) => {
        if (current) {
          setAnswer({ key, list });
        }
      },
      (error: unknown) => {
        if (current) {
          // The axios interceptor already turned every failure into an ApiError.
          setAnswer({ key, error: error as ApiError });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [recordType, record.id, key, pageSize, attempt]);

  if (!me) {
    return null;
  }

  // Never show one record's tasks under another record.
  const mine = answer?.key === key ? answer : null;
  const list = mine && "list" in mine ? mine.list : null;
  const tasks = list ? stillOpen(list.tasks, completed) : [];
  const total = list ? list.total - (list.tasks.length - tasks.length) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <h2>Tasks</h2>
          {list ? (
            <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-xs font-medium">
              {total} open
            </span>
          ) : null}
        </CardTitle>
        {canWrite ? (
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4"
            onClick={() => {
              setDialog({ task: null });
            }}
          >
            <Plus aria-hidden />
            Add task
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {mine === null ? (
          <div role="status" aria-label="Loading tasks" className="flex flex-col gap-4">
            {SKELETON_ROWS.map((row) => (
              <div key={row} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : "error" in mine ? (
          <PageError error={mine.error} onRetry={reload} />
        ) : tasks.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <ListChecks aria-hidden className="size-4 shrink-0" />
            No open tasks.
          </p>
        ) : (
          <>
            {/* The rows bring their own padding; pull them out to the card's edge. */}
            <ul aria-label="Tasks" className="-mx-2 flex min-w-0 flex-col divide-y">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={{ ...task, record: null }}
                  overdue={isOverdue(task)}
                  meId={me.id}
                  canWrite={canWrite}
                  onToggle={() => void toggle.complete(task)}
                  onOpen={() => {
                    setDialog({ task });
                  }}
                />
              ))}
            </ul>
            {mine.list.total > mine.list.tasks.length ? (
              showAll ? (
                <p className="text-muted-foreground text-xs">
                  Showing the first {mine.list.tasks.length} of {mine.list.total}.
                </p>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 self-center px-4"
                  onClick={() => {
                    setShowAll(true);
                  }}
                >
                  Show all {mine.list.total} tasks
                </Button>
              )
            ) : null}
          </>
        )}
      </CardContent>

      {dialog ? (
        <TaskDialog
          task={dialog.task}
          record={{ type: recordType, id: record.id, name: recordName }}
          canWrite={canWrite}
          onClose={() => {
            setDialog(null);
          }}
          onSaved={reload}
          onDeleted={reload}
        />
      ) : null}
    </Card>
  );
}
