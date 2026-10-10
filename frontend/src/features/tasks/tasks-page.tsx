"use client";

import { ListChecks, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { ListActions } from "@/components/shared/list-actions";
import { ListPagination, pageRange } from "@/components/shared/list-pagination";
import { type ListFilter, ListToolbar } from "@/components/shared/list-toolbar";
import { type ListUrlConfig, useListUrlState } from "@/components/shared/list-url-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageError, PageState } from "@/components/shared/page-state";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { selectAuth } from "@/features/auth/auth.slice";
import type { Me } from "@/features/auth/auth.types";
import {
  fetchAssignableUsers,
  selectAssignableUsers,
} from "@/features/users/assignable-users.slice";
import { describeApiError } from "@/lib/api/error-messages";
import type { ApiError } from "@/lib/api/http";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { TaskDialog } from "./task-dialog";
import { DUE_GROUP_LABELS, DUE_GROUPS, dueGroupOptions, taskAccess } from "./task-labels";
import { TaskRow } from "./task-row";
import { exportTasks, getTask } from "./tasks.api";
import {
  fetchDoneTasks,
  fetchOpenTasks,
  type OpenTasksQuery,
  selectCompletedTaskIds,
  selectDoneTasks,
  selectOpenTasks,
  stillOpen,
  type TaskGroups,
} from "./tasks.slice";
import type { DueGroup, Task, TaskListQuery } from "./tasks.types";
import { useTaskToggle } from "./use-task-toggle";

const DONE_PAGE_SIZE = 25;
const SKELETON_ROWS = [0, 1, 2, 3];

// The Assignee filter's value for "everyone I may see". Its default ("") is the viewer.
const EVERYONE = "everyone";

// What the page keeps in the address: /tasks?search=quote&assignee=<id>&due=overdue.
// `view=done` shows the completed tasks instead, and `open=<id>` opens one task's dialog
// (the link in a notification); both survive every change of the filters.
const LIST_URL: ListUrlConfig<"assignee" | "due", "dueAt"> = {
  filters: { assignee: null, due: DUE_GROUPS },
  sorts: ["dueAt"],
  defaultSort: "dueAt",
  defaultOrder: "asc",
  keep: ["view", "open"],
};

type View = "open" | "done";

const viewOptions = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
] as const;

// Whose tasks the lists show, as the API's `assigneeId` ("" for everyone the viewer may see).
// A Read-only user is never given a task, so "mine" would always be empty: they get everyone's.
function assigneeIdOf(me: Me, filter: string): string {
  if (me.role === "READ_ONLY" || filter === EVERYONE) {
    return "";
  }
  return filter || me.id;
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading tasks" className="bg-card rounded-lg border">
      {SKELETON_ROWS.map((row) => (
        <div key={row} className="flex items-center gap-3 border-b p-4 last:border-b-0">
          <Skeleton className="size-6 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// One group of the open view: its name, how many tasks it holds, and the tasks.
function TaskGroup({
  group,
  tasks,
  total,
  me,
  canWrite,
  onToggle,
  onOpen,
}: {
  group: DueGroup;
  tasks: Task[];
  // Every task of the group, also the ones past the first GROUP_PAGE_SIZE.
  total: number;
  me: Me;
  canWrite: boolean;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
}) {
  const label = DUE_GROUP_LABELS[group];
  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-2">
      <h2
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          group === "overdue" && total > 0 && "text-destructive",
        )}
      >
        {label}
        <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-xs font-medium">
          {total}
        </span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
          {group === "overdue" ? "Nothing is overdue." : "Nothing here."}
        </p>
      ) : (
        <ul aria-label={label} className="bg-card flex min-w-0 flex-col divide-y rounded-lg border">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              overdue={group === "overdue"}
              meId={me.id}
              canWrite={canWrite}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
      {total > tasks.length ? (
        <p className="text-muted-foreground text-xs">
          Showing the first {tasks.length} of {total}. Search to find the rest.
        </p>
      ) : null}
    </section>
  );
}

// The open tasks in their groups. A task that was just ticked off is left out at once
// (`completed`), and each count goes down with it.
function OpenTasks({
  groups,
  only,
  me,
  canWrite,
  onToggle,
  onOpen,
}: {
  groups: TaskGroups;
  // The Due filter: one group, or "" for all four.
  only: string;
  me: Me;
  canWrite: boolean;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
}) {
  const completed = useAppSelector(selectCompletedTaskIds);
  return (
    <div className="flex flex-col gap-6">
      {DUE_GROUPS.filter((group) => only === "" || only === group).map((group) => {
        const list = groups[group];
        const tasks = stillOpen(list.tasks, completed);
        return (
          <TaskGroup
            key={group}
            group={group}
            tasks={tasks}
            total={list.total - (list.tasks.length - tasks.length)}
            me={me}
            canWrite={canWrite}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        );
      })}
    </div>
  );
}

// The task named by `?open=<id>` (the link of a notification), loaded on its own because it
// may not be in the lists on screen. `close` takes the parameter out of the address again.
function useTaskFromAddress(): { task: Task | null; close: () => void } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = searchParams.get("open") ?? "";
  // What the lookup answered, with the id it was asked for; `task: null` when it failed.
  const [found, setFound] = useState<{ id: string; task: Task | null } | null>(null);

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("open");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  useEffect(() => {
    if (!id) {
      return;
    }
    let current = true;
    getTask(id).then(
      (task) => {
        if (current) {
          setFound({ id, task });
        }
      },
      (error: unknown) => {
        if (!current) {
          return;
        }
        // The axios interceptor already turned every failure into an ApiError.
        const apiError = error as ApiError;
        toast.error(
          apiError.code === "NOT_FOUND" || apiError.code === "VALIDATION_FAILED"
            ? "That task no longer exists, or is not yours to see."
            : describeApiError(apiError),
        );
        setFound({ id, task: null });
      },
    );
    return () => {
      current = false;
    };
  }, [id]);

  // A task that could not be opened leaves the address as well.
  const failed = id !== "" && found?.id === id && found.task === null;
  useEffect(() => {
    if (failed) {
      close();
    }
  }, [failed, close]);

  return { task: id && found?.id === id ? found.task : null, close };
}

// What the page's dialog shows: a new task, or one that was opened from a list.
type OpenDialog = { task: Task | null } | null;

// /tasks: the signed-in user's open tasks, grouped by when they are due, with a Done view.
// An Admin and a Sales Manager can look at a team member's tasks or everyone's.
export function TasksPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: me } = useAppSelector(selectAuth);
  const open = useAppSelector(selectOpenTasks);
  const done = useAppSelector(selectDoneTasks);
  const { data: assignable } = useAppSelector(selectAssignableUsers);
  const { state, isFiltered, setSearch, setFilter, setPage, clearFilters } =
    useListUrlState(LIST_URL);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const fromAddress = useTaskFromAddress();
  const toggle = useTaskToggle();

  const view: View = searchParams.get("view") === "done" ? "done" : "open";
  const seesTeam = me ? taskAccess(me.role).seesTeam : false;
  const assigneeId = me ? assigneeIdOf(me, state.filters.assignee) : "";

  const openQuery = useMemo<OpenTasksQuery>(
    () => ({ search: state.search, assigneeId }),
    [state.search, assigneeId],
  );
  const doneQuery = useMemo<TaskListQuery>(
    () => ({
      status: "DONE",
      ...(state.search ? { search: state.search } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      // The API has no "completed" sort; the newest tasks are the closest to it.
      sort: "createdAt",
      order: "desc",
      page: state.page,
      pageSize: DONE_PAGE_SIZE,
    }),
    [state.search, assigneeId, state.page],
  );

  useEffect(() => {
    if (!me) {
      return;
    }
    if (view === "done") {
      void dispatch(fetchDoneTasks(doneQuery));
    } else {
      void dispatch(fetchOpenTasks(openQuery));
    }
  }, [dispatch, me, view, openQuery, doneQuery]);

  useEffect(() => {
    if (seesTeam) {
      void dispatch(fetchAssignableUsers());
    }
  }, [dispatch, seesTeam]);

  // A page past the end (its last task was reopened) goes to the last page that exists.
  const doneData = done.data;
  const lastPage = doneData
    ? pageRange(doneData.page, doneData.pageSize, doneData.total).pageCount
    : 1;
  const pastTheEnd =
    view === "done" &&
    done.status === "succeeded" &&
    doneData !== null &&
    doneData.tasks.length === 0 &&
    doneData.total > 0;
  useEffect(() => {
    if (pastTheEnd && state.page > lastPage) {
      setPage(lastPage);
    }
  }, [pastTheEnd, state.page, lastPage, setPage]);

  if (!me) {
    return null;
  }
  const { canWrite } = taskAccess(me.role);

  function changeView(next: View) {
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    params.delete("due");
    if (next === "done") {
      params.set("view", "done");
    } else {
      params.delete("view");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const others = (assignable ?? []).filter((user) => user.id !== me.id);
  const filters: ListFilter[] = [
    ...(seesTeam
      ? [
          {
            label: "Assignee",
            allLabel: "Me",
            value: state.filters.assignee,
            options: [
              { value: EVERYONE, label: "Everyone" },
              ...others.map((user) => ({ value: user.id, label: user.name })),
            ],
            onChange: (value: string) => {
              setFilter("assignee", value);
            },
          },
        ]
      : []),
    ...(view === "open"
      ? [
          {
            label: "Due",
            allLabel: "Any time",
            value: state.filters.due,
            options: dueGroupOptions,
            onChange: (value: string) => {
              setFilter("due", value);
            },
          },
        ]
      : []),
  ];

  const newTaskButton = canWrite ? (
    <Button
      type="button"
      className="h-10 px-4"
      onClick={() => {
        setDialog({ task: null });
      }}
    >
      <Plus aria-hidden />
      New task
    </Button>
  ) : undefined;

  // The export holds what the view shows: the Done view's list, or the open tasks with the
  // same search, assignee and Due filter, soonest first like the groups.
  const exportQuery: TaskListQuery =
    view === "done"
      ? doneQuery
      : {
          status: "OPEN",
          ...(state.search ? { search: state.search } : {}),
          ...(assigneeId ? { assigneeId } : {}),
          ...(state.filters.due ? { due: state.filters.due as DueGroup } : {}),
          sort: "dueAt",
          order: "asc",
        };

  const current = view === "done" ? done : open;
  const openCount = open.data
    ? DUE_GROUPS.reduce((sum, group) => sum + (open.data?.[group].total ?? 0), 0)
    : 0;
  const shown = fromAddress.task ? { task: fromAddress.task } : dialog;

  return (
    <>
      <PageHeader
        title="Tasks"
        description={
          me.role === "READ_ONLY"
            ? "The team's follow-ups and to-dos."
            : "Your follow-ups and to-dos."
        }
        action={
          <>
            <ListActions onExport={() => exportTasks(exportQuery)} />
            {newTaskButton}
          </>
        }
      />

      <SegmentedControl
        label="Show"
        className="self-start"
        value={view}
        options={viewOptions}
        onChange={changeView}
      />

      <ListToolbar
        search={{
          value: state.search,
          placeholder: "Search tasks by title",
          maxLength: 100,
          onChange: setSearch,
        }}
        filters={filters}
      />

      {/* A failed reload keeps the last answer on screen, so say that it is out of date. */}
      {current.data && current.status === "failed" && current.error ? (
        <FormAlert message={describeApiError(current.error)} />
      ) : null}

      {current.data === null ? (
        current.status === "failed" && current.error ? (
          <PageError
            error={current.error}
            onRetry={() => {
              if (view === "done") {
                void dispatch(fetchDoneTasks(doneQuery));
              } else {
                void dispatch(fetchOpenTasks(openQuery));
              }
            }}
          />
        ) : (
          <ListSkeleton />
        )
      ) : view === "open" && open.data ? (
        openCount === 0 && !isFiltered ? (
          <PageState
            icon={ListChecks}
            title="No open tasks"
            description={
              canWrite
                ? "Add a task for anything you need to remember: a call back, a quote to send."
                : "Tasks the team adds will show here."
            }
            action={newTaskButton}
          />
        ) : openCount === 0 ? (
          <PageState
            title="No tasks match your filters"
            action={
              <Button type="button" variant="outline" className="h-10 px-4" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <OpenTasks
            groups={open.data}
            only={state.filters.due}
            me={me}
            canWrite={canWrite}
            onToggle={(task) => void toggle.complete(task)}
            onOpen={(task) => {
              setDialog({ task });
            }}
          />
        )
      ) : doneData ? (
        doneData.tasks.length === 0 ? (
          <PageState
            title={isFiltered ? "No completed tasks match your filters" : "No completed tasks yet"}
            description={isFiltered ? undefined : "Tasks you tick off are kept here."}
            action={
              isFiltered ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 px-4"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul
              aria-label="Completed tasks"
              className="bg-card flex min-w-0 flex-col divide-y rounded-lg border"
            >
              {doneData.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  meId={me.id}
                  canWrite={canWrite}
                  onToggle={(item) => void toggle.reopen(item)}
                  onOpen={(item) => {
                    setDialog({ task: item });
                  }}
                />
              ))}
            </ul>
            <ListPagination
              page={doneData.page}
              pageSize={doneData.pageSize}
              total={doneData.total}
              onPageChange={setPage}
            />
          </>
        )
      ) : null}

      {shown ? (
        <TaskDialog
          // A task opened from the address after one opened from the list is another form.
          key={shown.task?.id ?? "new"}
          task={shown.task}
          canWrite={canWrite}
          onClose={() => {
            setDialog(null);
            if (fromAddress.task) {
              fromAddress.close();
            }
          }}
        />
      ) : null}
    </>
  );
}
