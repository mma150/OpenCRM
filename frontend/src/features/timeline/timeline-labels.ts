import { type LucideIcon, Mail, MessageSquare, Phone, Users } from "lucide-react";

import { formatMoney } from "@/lib/format";

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

function listOf(details: TimelineEntry["details"], key: string): string[] {
  const value = details?.[key];
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

// The quote or invoice an entry names: `{ id, number }`.
function documentOf(
  details: TimelineEntry["details"],
  key: "quote" | "invoice",
): { id: string; number: string } | null {
  const value = details?.[key];
  if (typeof value !== "object" || value === null || !("id" in value) || !("number" in value)) {
    return null;
  }
  const { id, number } = value;
  return typeof id === "string" && typeof number === "string" ? { id, number } : null;
}

// The name of the file an email carried: `{ filename }`, or null. Older entries have no key.
function attachmentOf(details: TimelineEntry["details"]): string | null {
  const value = details?.attachment;
  if (typeof value !== "object" || value === null || !("filename" in value)) {
    return null;
  }
  return typeof value.filename === "string" ? value.filename : null;
}

// What an EMAIL entry says: the subject, who it went to, the quote it carried (if any) and
// the file attached to it (a quote's PDF). The text of the email as it was sent is the
// entry's `body`.
export function emailOf(entry: TimelineEntry) {
  return {
    subject: textOf(entry.details, "subject"),
    to: listOf(entry.details, "to"),
    cc: listOf(entry.details, "cc"),
    quote: documentOf(entry.details, "quote"),
    attachment: attachmentOf(entry.details),
  };
}

// What happened to a quote, from the statuses before and after. `from` is null when the
// quote was made and `to` is null when a draft was deleted.
function quoteChange(from: string | null, to: string | null): { verb: string; total: boolean } {
  if (to === null) {
    return { verb: "deleted", total: false };
  }
  if (from === null) {
    return { verb: "created", total: true };
  }
  switch (to) {
    case "SENT":
      return { verb: "sent", total: true };
    case "ACCEPTED":
      return { verb: "accepted", total: true };
    case "DECLINED":
      return { verb: "declined", total: false };
    case "DRAFT":
      return { verb: "reopened", total: false };
    default:
      return { verb: "updated", total: false };
  }
}

// The same for an invoice. Nothing is emailed or paid through the app: a person marks it.
function invoiceChange(from: string | null, to: string | null): { verb: string; total: boolean } {
  if (from === null) {
    return { verb: "created", total: true };
  }
  switch (to) {
    case "SENT":
      // Back from paid or overdue is the way out of a wrong click.
      return { verb: from === "DRAFT" ? "marked sent" : "marked unpaid", total: false };
    case "PAID":
      return { verb: "marked paid", total: false };
    case "OVERDUE":
      return { verb: "marked overdue", total: false };
    case "VOID":
      return { verb: "voided", total: false };
    case "DRAFT":
      return { verb: "restored", total: false };
    default:
      return { verb: "updated", total: false };
  }
}

// What a QUOTE_STATUS or INVOICE_STATUS entry says: which document, what happened to it in
// a word or two ("sent", "marked paid"), and its total when the sentence carries one.
export function documentChangeOf(entry: TimelineEntry) {
  const isQuote = entry.kind === "QUOTE_STATUS";
  const document = documentOf(entry.details, isQuote ? "quote" : "invoice");
  const from = textOf(entry.details, "from");
  const to = textOf(entry.details, "to");
  const change = isQuote ? quoteChange(from, to) : invoiceChange(from, to);
  const total = entry.details?.total;
  return {
    noun: isQuote ? "Quote" : "Invoice",
    document,
    verb: change.verb,
    // A deleted quote has no page any more.
    deleted: isQuote && to === null,
    total: change.total && typeof total === "number" ? total : null,
  };
}

function documentTitle(entry: TimelineEntry): string {
  const { noun, document, verb, total } = documentChangeOf(entry);
  const sentence = document ? `${noun} ${document.number} ${verb}` : `${noun} ${verb}`;
  return total === null ? sentence : `${sentence} · ${formatMoney(total)}`;
}

// Where an entry leads, when it names a quote or an invoice: the words to turn into a link
// and the page they open. The words of a status entry are part of its title ("Q-0001" in
// "Quote Q-0001 sent"); those of an email are a line of their own ("Quote Q-0001").
export function entryLink(entry: TimelineEntry): { href: string; label: string } | null {
  switch (entry.kind) {
    case "EMAIL": {
      const { quote } = emailOf(entry);
      return quote ? { href: `/quotes/${quote.id}`, label: `Quote ${quote.number}` } : null;
    }
    case "QUOTE_STATUS":
    case "INVOICE_STATUS": {
      const { document, deleted } = documentChangeOf(entry);
      if (!document || deleted) {
        return null;
      }
      const path = entry.kind === "QUOTE_STATUS" ? "quotes" : "invoices";
      return { href: `/${path}/${document.id}`, label: document.number };
    }
    default:
      return null;
  }
}

// The title of an entry: "Call", "Note", "Status changed: New → Contacted",
// "Marked as lost — Price", "Lost reason updated — No budget", "Stage changed: New → Proposal",
// "Closed as won", "Reassigned from Ada to Rob", "Lead created", "Email sent: Our proposal",
// "Quote Q-0001 sent · $4,360.87", "Invoice INV-0001 marked paid".
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
    case "EMAIL": {
      const { subject } = emailOf(entry);
      return subject ? `Email sent: ${subject}` : "Email sent";
    }
    case "QUOTE_STATUS":
    case "INVOICE_STATUS":
      return documentTitle(entry);
  }
}

// The text under the title: what was discussed, the note, the email as it was sent, the
// note given when the record was marked as lost, or why an opportunity was won or lost.
// Null when the entry has none.
export function entryText(entry: TimelineEntry): string | null {
  if (entry.kind === "STATUS_CHANGE") {
    const change = statusChangeOf(entry);
    // An opportunity's reason is a sentence someone wrote, not a code to put in the title.
    return change.toKind ? change.reason : change.note;
  }
  return entry.body === null || entry.body === "" ? null : entry.body;
}
