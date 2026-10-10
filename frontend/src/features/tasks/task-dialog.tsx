"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { DeleteRecordDialog } from "@/components/shared/record-dialogs";
import { DetailItem, DetailLink, DetailList, EmptyValue } from "@/components/shared/record-layout";
import type { PickedRecord } from "@/components/shared/record-picker";
import { SelectControl } from "@/components/shared/select-control";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectAuth } from "@/features/auth/auth.slice";
import {
  fetchAssignableUsers,
  selectAssignableUsers,
} from "@/features/users/assignable-users.slice";
import type { ApiError } from "@/lib/api/http";
import { applyServerError } from "@/lib/form-errors";
import { formatDateTime, formatNearDateTime, toDateTimeInputValue } from "@/lib/format";
import { useIsPhone } from "@/lib/use-is-phone";
import { FULL_SCREEN_DIALOG, useVisibleHeight } from "@/lib/use-visible-height";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
  REMINDER_CHOICES,
  reminderMoment,
  reminderNeedsDueDate,
  reminderOf,
  reminderOptions,
  TASK_RECORD_TYPES,
  taskRecordHref,
  taskRecordLabel,
} from "./task-labels";
import { TaskRecordPicker } from "./task-record-picker";
import { createTask, deleteTask, updateTask } from "./tasks.slice";
import type { CreateTaskInput, Task, TaskRecordType, UpdateTaskInput } from "./tasks.types";

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

// The select needs a value for "not linked"; the request leaves the record out.
const NO_RECORD = "NONE";

const recordTypeOptions = [
  { value: NO_RECORD, label: "Nothing" },
  ...TASK_RECORD_TYPES.map((type) => ({ value: type, label: taskRecordLabel(type) })),
];

function isMoment(value: string): boolean {
  return value !== "" && !Number.isNaN(new Date(value).getTime());
}

// `dueAt` and `reminderAt` are the values of datetime-local inputs ("2026-10-05T09:30", in
// the user's time zone); "" is "not set".
const taskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Enter a title.")
      .max(MAX_TITLE, `Use ${String(MAX_TITLE)} characters or fewer.`),
    description: z
      .string()
      .trim()
      .max(MAX_DESCRIPTION, `Use ${String(MAX_DESCRIPTION)} characters or fewer.`),
    dueAt: z.string(),
    assigneeId: z.string().min(1, "Choose who does this."),
    recordType: z.enum([NO_RECORD, ...TASK_RECORD_TYPES]),
    recordId: z.string(),
    reminder: z.enum(REMINDER_CHOICES),
    reminderAt: z.string(),
  })
  .superRefine((values, context) => {
    if (values.dueAt !== "" && !isMoment(values.dueAt)) {
      context.addIssue({ code: "custom", path: ["dueAt"], message: "Enter a date and time." });
    }
    if (values.recordType !== NO_RECORD && values.recordId === "") {
      context.addIssue({
        code: "custom",
        path: ["recordId"],
        message: `Choose the ${taskRecordLabel(values.recordType).toLowerCase()}, or link the task to nothing.`,
      });
    }
    if (reminderNeedsDueDate(values.reminder) && !isMoment(values.dueAt)) {
      context.addIssue({
        code: "custom",
        path: ["reminder"],
        message: "Set a due date first, or choose a custom date and time.",
      });
    }
    if (values.reminder === "CUSTOM" && !isMoment(values.reminderAt)) {
      context.addIssue({
        code: "custom",
        path: ["reminderAt"],
        message: "Enter when to be reminded.",
      });
    }
  });

type TaskValues = z.infer<typeof taskSchema>;

// The record a new task starts linked to ("Add task" on a record's page).
export type TaskRecord = NonNullable<Task["record"]>;

function valuesOf(task: Task | null, record: TaskRecord | null, meId: string): TaskValues {
  if (!task) {
    return {
      title: "",
      description: "",
      dueAt: "",
      assigneeId: meId,
      recordType: record?.type ?? NO_RECORD,
      recordId: record?.id ?? "",
      reminder: "NONE",
      reminderAt: "",
    };
  }
  return {
    title: task.title,
    description: task.description ?? "",
    dueAt: task.dueAt ? toDateTimeInputValue(new Date(task.dueAt)) : "",
    assigneeId: task.assignee.id,
    recordType: task.record?.type ?? NO_RECORD,
    recordId: task.record?.id ?? "",
    ...reminderOf(task),
  };
}

// The request body for the form's values. Everything that can be empty is null when it is.
function inputOf(values: TaskValues): Required<CreateTaskInput> {
  const linked = values.recordType !== NO_RECORD && values.recordId !== "";
  return {
    title: values.title,
    description: values.description || null,
    dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null,
    assigneeId: values.assigneeId,
    record: linked ? { type: values.recordType as TaskRecordType, id: values.recordId } : null,
    reminderAt: reminderMoment(values.reminder, values.dueAt, values.reminderAt),
  };
}

// Only what the user changed: the fields whose value differs from the task as it was loaded.
function changesOf(before: Required<CreateTaskInput>, after: Required<CreateTaskInput>) {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof CreateTaskInput)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = after[key];
    }
  }
  return changes as UpdateTaskInput;
}

// A create request leaves out what is empty.
function withoutNulls(input: Required<CreateTaskInput>): CreateTaskInput {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null),
  ) as CreateTaskInput;
}

// The API names the linked record `record` (or `record.id`); the form's field is `recordId`.
// The reminder is one moment for the API and, unless it is a custom one, a select here.
function forFormFields(error: ApiError, reminder: TaskValues["reminder"]): ApiError {
  if (!Array.isArray(error.details)) {
    return error;
  }
  const details = (error.details as unknown[]).map((detail) => {
    if (typeof detail !== "object" || detail === null || !("path" in detail)) {
      return detail;
    }
    if (typeof detail.path === "string" && detail.path.startsWith("record")) {
      return { ...detail, path: "recordId" };
    }
    if (detail.path === "reminderAt" && reminder !== "CUSTOM") {
      return { ...detail, path: "reminder" };
    }
    return detail;
  });
  return { ...error, details };
}

const FIELDS = [
  "title",
  "description",
  "dueAt",
  "assigneeId",
  "recordId",
  "reminder",
  "reminderAt",
] as const;

// What a Read-only user gets instead of the form: the task, with nothing to change.
function TaskDetails({ task }: { task: Task }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <DetailList>
        <DetailItem label="Status">{task.status === "DONE" ? "Done" : "Open"}</DetailItem>
        <DetailItem label="Description">
          {task.description ? (
            <span className="whitespace-pre-wrap">{task.description}</span>
          ) : (
            <EmptyValue />
          )}
        </DetailItem>
        <DetailItem label="Due">
          {task.dueAt ? formatNearDateTime(task.dueAt) : <EmptyValue />}
        </DetailItem>
        <DetailItem label="Assignee">{task.assignee.name}</DetailItem>
        <DetailItem label="Linked to">
          {task.record ? (
            <>
              {taskRecordLabel(task.record.type)}:{" "}
              <DetailLink href={taskRecordHref(task.record)}>{task.record.name}</DetailLink>
            </>
          ) : (
            <EmptyValue />
          )}
        </DetailItem>
        <DetailItem label="Reminder">
          {task.reminderAt ? formatNearDateTime(task.reminderAt) : <EmptyValue />}
        </DetailItem>
        <DetailItem label="Created">
          {formatDateTime(task.createdAt)} by {task.createdBy.name}
        </DetailItem>
      </DetailList>
    </div>
  );
}

function TaskForm({
  task,
  record,
  meId,
  sheet,
  onClose,
  onSaved,
  onDelete,
}: {
  task: Task | null;
  record: TaskRecord | null;
  meId: string;
  sheet: boolean;
  onClose: () => void;
  onSaved?: (task: Task) => void;
  onDelete: () => void;
}) {
  const dispatch = useAppDispatch();
  const { data: assignable } = useAppSelector(selectAssignableUsers);
  const [formError, setFormError] = useState<string | null>(null);
  // The linked record's name, kept beside the id the form holds.
  const [picked, setPicked] = useState<PickedRecord | null>(
    (task?.record ?? record)
      ? { id: (task?.record ?? record)?.id ?? "", name: (task?.record ?? record)?.name ?? "" }
      : null,
  );
  const form = useForm<TaskValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: valuesOf(task, record, meId),
  });
  const recordType = useWatch({ control: form.control, name: "recordType" });
  const reminder = useWatch({ control: form.control, name: "reminder" });

  useEffect(() => {
    void dispatch(fetchAssignableUsers());
  }, [dispatch]);

  // The people the user may give a task to. The task's own assignee is always among the
  // choices, so opening a task someone else was given does not change who has it.
  const assignees = (assignable ?? []).map((user) => ({
    value: user.id,
    label: user.id === meId ? `${user.name} (you)` : user.name,
  }));
  if (task && !assignees.some((option) => option.value === task.assignee.id)) {
    assignees.push({ value: task.assignee.id, label: task.assignee.name });
  }
  if (!assignees.some((option) => option.value === meId) && !task) {
    assignees.unshift({ value: meId, label: "Me" });
  }

  async function onSubmit(values: TaskValues) {
    setFormError(null);
    const input = inputOf(values);
    try {
      let saved: Task;
      if (task) {
        const changes = changesOf(inputOf(valuesOf(task, null, meId)), input);
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        saved = await dispatch(updateTask({ id: task.id, changes })).unwrap();
        toast.success("Task saved.");
      } else {
        saved = await dispatch(createTask(withoutNulls(input))).unwrap();
        toast.success("Task added.");
      }
      onSaved?.(saved);
      onClose();
    } catch (error) {
      setFormError(
        applyServerError(forFormFields(error as ApiError, values.reminder), form.setError, FIELDS),
      );
    }
  }

  return (
    <form
      noValidate
      aria-label={task ? "Edit task" : "New task"}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto p-4">
        <FormAlert message={formError} />
        <FormField control={form.control} name="title" label="Title">
          {(field) => (
            <Input
              {...field}
              maxLength={MAX_TITLE}
              placeholder="What needs doing?"
              className={sheet ? "h-12" : "h-10"}
            />
          )}
        </FormField>
        <FormField control={form.control} name="description" label="Description">
          {(field) => <Textarea {...field} rows={3} className="max-h-60 min-h-20" />}
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="dueAt" label="Due date and time">
            {(field) => (
              <Input {...field} type="datetime-local" className={sheet ? "h-12" : "h-10"} />
            )}
          </FormField>
          <FormField control={form.control} name="assigneeId" label="Assignee">
            {({
              id,
              value,
              onChange,
              "aria-invalid": invalid,
              "aria-describedby": describedBy,
            }) => (
              <SelectControl
                id={id}
                value={value}
                onChange={onChange}
                invalid={invalid}
                describedBy={describedBy}
                options={assignees}
                placeholder="Choose a person"
              />
            )}
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <FormField control={form.control} name="recordType" label="Linked to">
            {({
              id,
              value,
              onChange,
              "aria-invalid": invalid,
              "aria-describedby": describedBy,
            }) => (
              <SelectControl
                id={id}
                value={value}
                onChange={(next) => {
                  onChange(next);
                  // A record of one type is not a record of another.
                  setPicked(null);
                  form.setValue("recordId", "");
                  form.clearErrors("recordId");
                }}
                invalid={invalid}
                describedBy={describedBy}
                options={recordTypeOptions}
              />
            )}
          </FormField>
          {recordType === NO_RECORD ? null : (
            <FormField control={form.control} name="recordId" label={taskRecordLabel(recordType)}>
              {({ id, onChange, "aria-invalid": invalid, "aria-describedby": describedBy }) => (
                <TaskRecordPicker
                  type={recordType}
                  id={id}
                  value={picked}
                  onChange={(next) => {
                    setPicked(next);
                    onChange(next?.id ?? "");
                  }}
                  invalid={invalid}
                  describedBy={describedBy}
                />
              )}
            </FormField>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="reminder"
            label="Reminder"
            description="The assignee gets a notification at that moment."
          >
            {({
              id,
              value,
              onChange,
              "aria-invalid": invalid,
              "aria-describedby": describedBy,
            }) => (
              <SelectControl
                id={id}
                value={value}
                onChange={onChange}
                invalid={invalid}
                describedBy={describedBy}
                options={reminderOptions}
              />
            )}
          </FormField>
          {reminder === "CUSTOM" ? (
            <FormField control={form.control} name="reminderAt" label="Remind at">
              {(field) => (
                <Input {...field} type="datetime-local" className={sheet ? "h-12" : "h-10"} />
              )}
            </FormField>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "bg-background flex flex-wrap items-center gap-2 border-t p-4",
          sheet ? "pb-[calc(1rem+env(safe-area-inset-bottom))]" : "rounded-b-xl",
        )}
      >
        {task ? (
          <Button
            type="button"
            variant="outline"
            className="text-destructive h-10 px-3"
            onClick={onDelete}
          >
            <Trash2 aria-hidden />
            Delete
          </Button>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" className="h-10 px-4" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="h-10 px-4" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving..." : task ? "Save changes" : "Add task"}
          </Button>
        </div>
      </div>
    </form>
  );
}

// The dialog that adds a task (`task` left out) or opens one: the form for a user who may
// change it, its details for a Read-only user. It is mounted only while it is open. On a
// phone it fills the screen, like the conversation logger, with Save in a bar at the bottom.
//
//   <TaskDialog task={task} canWrite={canWrite} onClose={close} />
//   <TaskDialog record={{ type: "LEAD", id, name }} canWrite onClose={close} onSaved={reload} />
export function TaskDialog({
  task = null,
  record = null,
  canWrite,
  onClose,
  onSaved,
  onDeleted,
}: {
  task?: Task | null;
  // The record a new task starts linked to.
  record?: TaskRecord | null;
  canWrite: boolean;
  onClose: () => void;
  // After a create or an edit the API accepted, for a list outside the tasks slice.
  onSaved?: (task: Task) => void;
  onDeleted?: () => void;
}) {
  const dispatch = useAppDispatch();
  const { data: me } = useAppSelector(selectAuth);
  const isPhone = useIsPhone();
  const [deleting, setDeleting] = useState(false);
  useVisibleHeight(isPhone);

  if (!me) {
    return null;
  }

  if (task && deleting) {
    return (
      <DeleteRecordDialog
        name={task.title}
        description="The task and its reminder are removed for everyone. This cannot be undone."
        onDelete={() => dispatch(deleteTask(task.id)).unwrap()}
        onClose={() => {
          setDeleting(false);
        }}
        onDeleted={() => {
          onDeleted?.();
          onClose();
        }}
      />
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className={
          isPhone ? FULL_SCREEN_DIALOG : "flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-xl"
        }
      >
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle className="text-lg wrap-anywhere">
            {task ? (canWrite ? "Edit task" : task.title) : "New task"}
          </DialogTitle>
          <DialogDescription>
            {task
              ? canWrite
                ? "Change what is to be done, when, and by whom."
                : "You can see this task but not change it."
              : "A to-do for you or someone on your team, with an optional reminder."}
          </DialogDescription>
        </DialogHeader>
        {canWrite ? (
          <TaskForm
            task={task}
            record={record}
            meId={me.id}
            sheet={isPhone}
            onClose={onClose}
            onSaved={onSaved}
            onDelete={() => {
              setDeleting(true);
            }}
          />
        ) : task ? (
          <TaskDetails task={task} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
