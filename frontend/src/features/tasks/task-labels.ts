import type { SelectOption } from "@/components/shared/select-control";
import { recordLabel, recordPath, type RecordType } from "@/features/timeline/record-types";
import { daysAgo, toDateTimeInputValue } from "@/lib/format";
import type { Role } from "@/lib/user-labels";

import type { DueGroup, Task, TaskRecordType } from "./tasks.types";

// The groups of the open view, in the order they are shown. The names are the API's (`due=`).
export const DUE_GROUPS: DueGroup[] = ["overdue", "today", "upcoming", "none"];

export const DUE_GROUP_LABELS: Record<DueGroup, string> = {
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Upcoming",
  none: "No due date",
};

export const dueGroupOptions: SelectOption[] = DUE_GROUPS.map((group) => ({
  value: group,
  label: DUE_GROUP_LABELS[group],
}));

// Read-only users see tasks and change nothing; everyone else may add and change the tasks
// the API shows them. The API enforces it; the UI only avoids offering what would be refused.
export function taskAccess(role: Role): { canWrite: boolean; seesTeam: boolean } {
  return {
    canWrite: role !== "READ_ONLY",
    // Who may look at other people's tasks: the Assignee filter is for them.
    seesTeam: role === "ADMIN" || role === "SALES_MANAGER",
  };
}

// The API names a linked record's type in capitals. This is the one place that turns it into
// the app's own record type; a new record type adds one line (TypeScript asks for it).
const RECORD_TYPE_OF: Record<TaskRecordType, RecordType> = {
  LEAD: "lead",
  CONTACT: "contact",
  COMPANY: "company",
  OPPORTUNITY: "opportunity",
};

export const TASK_RECORD_TYPES = Object.keys(RECORD_TYPE_OF) as TaskRecordType[];

// "Lead", "Contact", "Company", "Opportunity".
export function taskRecordLabel(type: TaskRecordType): string {
  return recordLabel(RECORD_TYPE_OF[type]);
}

// The page of the record a task is linked to: /leads/:id, /opportunities/:id.
export function taskRecordHref(record: NonNullable<Task["record"]>): string {
  return recordPath({ type: RECORD_TYPE_OF[record.type], id: record.id });
}

// The other way round, for a record page that lists its own tasks.
export function taskRecordType(type: RecordType): TaskRecordType {
  const found = TASK_RECORD_TYPES.find((candidate) => RECORD_TYPE_OF[candidate] === type);
  // Every record type is in the table above, so this is never reached.
  return found ?? "LEAD";
}

// True when a task was due before today began, in the viewer's time zone: the API's own rule
// for "overdue". The Tasks page does not need it (the API sorts the tasks into groups);
// shorter lists (Home, a record's card) mark their rows with it.
export function isOverdue(task: Pick<Task, "dueAt">, now: Date = new Date()): boolean {
  return task.dueAt !== null && daysAgo(task.dueAt, now) > 0;
}

// When to be reminded. The API stores one moment (`reminderAt`); the form offers the usual
// distances from the due date, and "Custom" for any other moment.
export const REMINDER_CHOICES = ["NONE", "AT_DUE", "HOUR_BEFORE", "DAY_BEFORE", "CUSTOM"] as const;
export type ReminderChoice = (typeof REMINDER_CHOICES)[number];

export const reminderOptions: SelectOption[] = [
  { value: "NONE", label: "None" },
  { value: "AT_DUE", label: "At due time" },
  { value: "HOUR_BEFORE", label: "1 hour before" },
  { value: "DAY_BEFORE", label: "1 day before" },
  { value: "CUSTOM", label: "Custom date and time" },
];

const HOUR = 60 * 60 * 1000;

// How long before the due date each relative choice reminds.
const REMINDER_OFFSET_MS: Record<Exclude<ReminderChoice, "NONE" | "CUSTOM">, number> = {
  AT_DUE: 0,
  HOUR_BEFORE: HOUR,
  DAY_BEFORE: 24 * HOUR,
};

function isRelative(choice: ReminderChoice): choice is keyof typeof REMINDER_OFFSET_MS {
  return choice in REMINDER_OFFSET_MS;
}

// True for the choices that count back from the due date, and so need one.
export function reminderNeedsDueDate(choice: ReminderChoice): boolean {
  return isRelative(choice);
}

// The moment to send as `reminderAt` (ISO), or null for no reminder. `dueAt` and `customAt`
// are the values of datetime-local inputs, in the viewer's time zone; "" is "not set".
export function reminderMoment(
  choice: ReminderChoice,
  dueAt: string,
  customAt: string,
): string | null {
  if (choice === "CUSTOM") {
    return customAt ? new Date(customAt).toISOString() : null;
  }
  if (isRelative(choice) && dueAt) {
    return new Date(new Date(dueAt).getTime() - REMINDER_OFFSET_MS[choice]).toISOString();
  }
  return null;
}

// The form's reminder fields for a task that is being edited: the choice that gives its
// `reminderAt`, or "Custom" with that moment when none does.
export function reminderOf(task: Pick<Task, "dueAt" | "reminderAt">): {
  reminder: ReminderChoice;
  reminderAt: string;
} {
  if (task.reminderAt === null) {
    return { reminder: "NONE", reminderAt: "" };
  }
  const at = new Date(task.reminderAt).getTime();
  if (task.dueAt !== null) {
    const before = new Date(task.dueAt).getTime() - at;
    const match = (Object.keys(REMINDER_OFFSET_MS) as (keyof typeof REMINDER_OFFSET_MS)[]).find(
      (choice) => REMINDER_OFFSET_MS[choice] === before,
    );
    if (match) {
      return { reminder: match, reminderAt: "" };
    }
  }
  return { reminder: "CUSTOM", reminderAt: toDateTimeInputValue(new Date(task.reminderAt)) };
}
