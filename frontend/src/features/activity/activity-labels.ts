import { recordLabel, recordPath, type RecordType } from "@/features/timeline/record-types";
import {
  assignmentOf,
  CONVERSATION_TYPE_LABELS,
  entryText,
  humanize,
  isMarkedLost,
  statusChangeOf,
} from "@/features/timeline/timeline-labels";
import { toDateInputValue } from "@/lib/format";

import type { ActivityEntry } from "./activity.types";

// The date range presets. "" is the default, Last 7 days, and is left out of the address.
export const ACTIVITY_RANGES = ["today", "30d", "custom"] as const;
export const DEFAULT_RANGE_LABEL = "Last 7 days";
export const activityRangeOptions = [
  { value: "today", label: "Today" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
];

// The Type filter: the same groups as the tabs of a record's timeline.
export const ACTIVITY_KINDS = ["CONVERSATION", "NOTE", "SYSTEM"] as const;
export const activityKindOptions = [
  { value: "CONVERSATION", label: "Conversations" },
  { value: "NOTE", label: "Notes" },
  { value: "SYSTEM", label: "Changes" },
];

// The feed names a record's type in capitals. This is the one place that turns it into the
// app's own record type; a new record type adds one line (TypeScript asks for it).
const RECORD_TYPE_OF: Record<ActivityEntry["record"]["type"], RecordType> = {
  LEAD: "lead",
  CONTACT: "contact",
  COMPANY: "company",
  OPPORTUNITY: "opportunity",
};

// The page of the record an entry was made on: /leads/:id, /contacts/:id, /companies/:id.
export function recordHref(record: ActivityEntry["record"]): string {
  return recordPath({ type: RECORD_TYPE_OF[record.type], id: record.id });
}

// What kind of record it is, in words: "Lead", "Contact", "Company".
export function recordTypeLabel(record: ActivityEntry["record"]): string {
  return recordLabel(RECORD_TYPE_OF[record.type]);
}

function isDateInputValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function daysBefore(today: Date, days: number): string {
  return toDateInputValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
}

// The first and last day a range covers, as date input values ("2026-10-05") in the
// viewer's time zone. "" is an open end, which only a custom range can have.
export function rangeDates(
  range: string,
  customFrom: string,
  customTo: string,
  today: Date = new Date(),
): { from: string; to: string } {
  const to = toDateInputValue(today);
  switch (range) {
    case "today":
      return { from: to, to };
    case "30d":
      return { from: daysBefore(today, 29), to };
    case "custom":
      // An address edited by hand can hold anything; a value that is not a date is ignored.
      return {
        from: isDateInputValue(customFrom) ? customFrom : "",
        to: isDateInputValue(customTo) ? customTo : "",
      };
    default:
      return { from: daysBefore(today, 6), to };
  }
}

// A day in the viewer's time zone as the exact moments the API filters by: the start of
// the first day and the last millisecond of the last one.
export function dayStart(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

export function dayEnd(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

const CONVERSATION_VERBS: Record<NonNullable<ActivityEntry["conversationType"]>, string> = {
  CALL: "logged a call with",
  MEETING: "logged a meeting with",
  EMAIL: "logged an email with",
  MESSAGE: "logged a message with",
};

// What someone did, as the words around the record's name:
// "<author> logged a call with <record>", "<author> marked <record> as lost".
export function activitySentence(entry: ActivityEntry): { before: string; after: string } {
  switch (entry.kind) {
    case "CONVERSATION":
      return {
        before: entry.conversationType
          ? CONVERSATION_VERBS[entry.conversationType]
          : "logged a conversation with",
        after: "",
      };
    case "NOTE":
      return { before: "added a note on", after: "" };
    case "CREATED":
      return { before: "created", after: "" };
    case "STATUS_CHANGE": {
      const { from, to, fromKind, toKind } = statusChangeOf(entry);
      // An opportunity: `to` is the name of a pipeline stage, shown as it is.
      if (toKind === "WON" || toKind === "LOST") {
        return { before: "closed", after: toKind === "WON" ? " as won" : " as lost" };
      }
      if (toKind) {
        const verb = fromKind === "WON" || fromKind === "LOST" ? "reopened" : "moved";
        return { before: verb, after: to ? ` to ${to}` : "" };
      }
      if (to === "CONVERTED") {
        return { before: "converted", after: "" };
      }
      if (from === "LOST" && to === "LOST") {
        return { before: "updated the lost reason of", after: "" };
      }
      if (to === "LOST") {
        return { before: "marked", after: " as lost" };
      }
      return { before: "changed the status of", after: to ? ` to ${humanize(to)}` : "" };
    }
    case "ASSIGNMENT": {
      const { from, to } = assignmentOf(entry);
      if (from && to) {
        return { before: "reassigned", after: ` from ${from} to ${to}` };
      }
      return { before: "reassigned", after: to ? ` to ${to}` : "" };
    }
  }
}

// The word on an entry's badge.
export function activityBadge(entry: ActivityEntry): string {
  switch (entry.kind) {
    case "CONVERSATION":
      return entry.conversationType
        ? CONVERSATION_TYPE_LABELS[entry.conversationType]
        : "Conversation";
    case "NOTE":
      return "Note";
    case "CREATED":
      return "New";
    case "STATUS_CHANGE":
      return isMarkedLost(entry) ? "Lost" : "Status";
    case "ASSIGNMENT":
      return "Owner";
  }
}

// The line or two under the sentence: what was discussed, the note, or why it was lost.
export function activityExcerpt(entry: ActivityEntry): string | null {
  if (isMarkedLost(entry)) {
    const { reason, note } = statusChangeOf(entry);
    const parts = [reason ? humanize(reason) : null, note].filter((part) => part !== null);
    return parts.length > 0 ? parts.join(" — ") : null;
  }
  return entryText(entry);
}
