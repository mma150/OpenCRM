import { type LucideIcon, Mail, MessageSquare, Phone, Users } from "lucide-react";

import type { ConversationType, TimelineEntry, TimelineFilter } from "./timeline.types";

// The words and icons for timeline entries, on a record's timeline and in the activity feed.
export const CONVERSATION_TYPE_LABELS: Record<ConversationType, string> = {
  CALL: "Call",
  MEETING: "Meeting",
  EMAIL: "Email",
  MESSAGE: "Message",
};

export const CONVERSATION_TYPE_ICONS: Record<ConversationType, LucideIcon> = {
  CALL: Phone,
  MEETING: Users,
  EMAIL: Mail,
  MESSAGE: MessageSquare,
};

export const CONVERSATION_TYPES = Object.keys(CONVERSATION_TYPE_LABELS) as ConversationType[];

export const TIMELINE_FILTERS: { value: TimelineFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "CONVERSATION", label: "Conversations" },
  { value: "NOTE", label: "Notes" },
  { value: "SYSTEM", label: "Changes" },
];

// A status or a lost reason as words: "CHOSE_COMPETITOR" -> "Chose competitor". The
// timeline shows the changes of any kind of record, so it does not keep a list of every
// record's statuses; the API's names are plain words in capitals and read well this way.
export function humanize(value: string): string {
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function textOf(details: TimelineEntry["details"], key: string): string | null {
  const value = details?.[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function nameOf(details: TimelineEntry["details"], key: string): string | null {
  const value = details?.[key];
  return typeof value === "object" && value !== null && "name" in value
    ? textOf({ name: value.name }, "name")
    : null;
}

// What a STATUS_CHANGE entry says: the two statuses, and why when the record was lost.
export function statusChangeOf(entry: TimelineEntry) {
  return {
    from: textOf(entry.details, "from"),
    to: textOf(entry.details, "to"),
    reason: textOf(entry.details, "reason"),
    note: textOf(entry.details, "note"),
    // Only an opportunity's entry has these. Its `from` and `to` are the names of pipeline
    // stages, which an Admin chooses, so the kinds say whether it was closed or reopened.
    fromKind: textOf(entry.details, "fromKind"),
    toKind: textOf(entry.details, "toKind"),
  };
}

// The title of an opportunity's STATUS_CHANGE entry. Stage names are shown as they are.
function stageChangeTitle(change: ReturnType<typeof statusChangeOf>): string {
  const { from, to, fromKind, toKind } = change;
  if (toKind === "WON") {
    return "Closed as won";
  }
  if (toKind === "LOST") {
    return "Closed as lost";
  }
  if (fromKind === "WON" || fromKind === "LOST") {
    return to ? `Reopened in ${to}` : "Reopened";
  }
  if (from && to) {
    return `Stage changed: ${from} → ${to}`;
  }
  return to ? `Moved to ${to}` : "Stage changed";
}

// What an ASSIGNMENT entry says: the names of the old and the new owner.
export function assignmentOf(entry: TimelineEntry) {
  return { from: nameOf(entry.details, "fromOwner"), to: nameOf(entry.details, "toOwner") };
}

export function isMarkedLost(entry: TimelineEntry): boolean {
  return entry.kind === "STATUS_CHANGE" && statusChangeOf(entry).to === "LOST";
}

// The title of an entry: "Call", "Note", "Status changed: New → Contacted",
// "Marked as lost — Price", "Lost reason updated — No budget", "Stage changed: New → Proposal",
// "Closed as won", "Reassigned from Ada to Rob", "Lead created".
export function entryTitle(entry: TimelineEntry, recordLabel: string): string {
  switch (entry.kind) {
    case "CONVERSATION":
      return entry.conversationType
        ? CONVERSATION_TYPE_LABELS[entry.conversationType]
        : "Conversation";
    case "NOTE":
      return "Note";
    case "CREATED": {
      // A record made by converting a lead says which lead.
      const lead = nameOf(entry.details, "fromLead");
      return lead ? `${recordLabel} created from lead ${lead}` : `${recordLabel} created`;
    }
    case "STATUS_CHANGE": {
      const change = statusChangeOf(entry);
      const { from, to, reason } = change;
      if (change.toKind) {
        return stageChangeTitle(change);
      }
      if (to === "CONVERTED") {
        return "Converted";
      }
      // Marking a lost record as lost again only changes why it was lost.
      if (from === "LOST" && to === "LOST") {
        return reason ? `Lost reason updated — ${humanize(reason)}` : "Lost reason updated";
      }
      if (to === "LOST") {
        return reason ? `Marked as lost — ${humanize(reason)}` : "Marked as lost";
      }
      if (from && to) {
        return `Status changed: ${humanize(from)} → ${humanize(to)}`;
      }
      return to ? `Status changed to ${humanize(to)}` : "Status changed";
    }
    case "ASSIGNMENT": {
      const { from, to } = assignmentOf(entry);
      if (from && to) {
        return `Reassigned from ${from} to ${to}`;
      }
      return to ? `Assigned to ${to}` : "Reassigned";
    }
  }
}

// The text under the title: what was discussed, the note, the note given when the record
// was marked as lost, or why an opportunity was won or lost. Null when the entry has none.
export function entryText(entry: TimelineEntry): string | null {
  if (entry.kind === "STATUS_CHANGE") {
    const change = statusChangeOf(entry);
    // An opportunity's reason is a sentence someone wrote, not a code to put in the title.
    return change.toKind ? change.reason : change.note;
  }
  return entry.body === null || entry.body === "" ? null : entry.body;
}
