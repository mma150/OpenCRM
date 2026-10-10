import type { Prisma, TimelineEntry, TimelineKind } from "../generated/prisma/client";
import { z } from "./openapi";

// The timeline: one table (TimelineEntry) holds every dated thing that happens to a record,
// so a record page reads a single ordered stream and the activity feed reads the same rows.
//
// Entries are permanent (CONV-05). addTimelineEntry below is the only code that writes the
// table, and it only inserts: nothing updates or deletes an entry, and no route offers to.

export const timelineKindSchema = z
  .enum([
    "CONVERSATION",
    "NOTE",
    "CREATED",
    "STATUS_CHANGE",
    "ASSIGNMENT",
    "EMAIL",
    "QUOTE_STATUS",
    "INVOICE_STATUS",
  ])
  .openapi("TimelineKind");

export const conversationTypeSchema = z
  .enum(["CALL", "MEETING", "EMAIL", "MESSAGE"])
  .openapi("ConversationType");

// The entries the system writes itself when a record is created or changed, or when a quote
// or an invoice of an opportunity changes its status.
export const SYSTEM_KINDS: TimelineKind[] = [
  "CREATED",
  "STATUS_CHANGE",
  "ASSIGNMENT",
  "QUOTE_STATUS",
  "INVOICE_STATUS",
];

// The `kind` filter of a timeline or the activity feed: one kind, or SYSTEM for all of the
// system kinds together.
export const timelineKindFilterSchema = z
  .enum([...timelineKindSchema.options, "SYSTEM"])
  .openapi("TimelineKindFilter");

export type TimelineKindFilter = z.infer<typeof timelineKindFilterSchema>;

// The Prisma `where` fragment for that filter.
export function kindFilter(kind: TimelineKindFilter | undefined): Prisma.TimelineEntryWhereInput {
  if (kind === undefined) {
    return {};
  }
  return kind === "SYSTEM" ? { kind: { in: SYSTEM_KINDS } } : { kind };
}

export const timelineEntrySchema = z
  .object({
    id: z.string(),
    kind: timelineKindSchema,
    // Only a CONVERSATION has one. Written inline, not as a reference to ConversationType:
    // the generator drops "or null" from a reference, and null is the usual value here.
    conversationType: z.enum(conversationTypeSchema.options).nullable(),
    // What was discussed, the note, or the text of an email. null for system entries.
    body: z.string().nullable(),
    // An EMAIL: { to, cc, subject, status: "SENT", templateId, quote } (quote is { id, number }
    // when the email carried a quote, otherwise null). A QUOTE_STATUS or INVOICE_STATUS:
    // { quote | invoice: { id, number }, from, to, total }, where `from` is null when it was
    // created and `to` is null when a draft quote was deleted.
    // System entries: { from, to } for a lead's status change (plus { reason, note } when it
    // was marked lost, or { contact, company, opportunity } when it was converted);
    // { from, to, fromKind, toKind } for an opportunity's stage change (plus { reason } when
    // it was closed); { fromOwner, toOwner } (each { id, name }) for an assignment;
    // { fromLead } on the CREATED entry of a record made by converting a lead.
    details: z.record(z.string(), z.unknown()).nullable(),
    // When it happened; `createdAt` is when it was written down.
    occurredAt: z.string(),
    author: z.object({ id: z.string(), name: z.string() }),
    createdAt: z.string(),
  })
  .openapi("TimelineEntry");

export type ApiTimelineEntry = z.infer<typeof timelineEntrySchema>;

// Include this in every query whose rows go through toApiTimelineEntry.
export const withAuthor = { author: { select: { id: true, name: true } } } as const;

export type TimelineEntryWithAuthor = TimelineEntry & { author: { id: string; name: string } };

export function toApiTimelineEntry(entry: TimelineEntryWithAuthor): ApiTimelineEntry {
  return {
    id: entry.id,
    kind: entry.kind,
    conversationType: entry.conversationType,
    body: entry.body,
    details: entry.details as Record<string, unknown> | null,
    occurredAt: entry.occurredAt.toISOString(),
    author: entry.author,
    createdAt: entry.createdAt.toISOString(),
  };
}

// Newest first. `createdAt` and then `id` break ties, so an entry never appears on two
// pages or on none.
export const newestFirst: Prisma.TimelineEntryOrderByWithRelationInput[] = [
  { occurredAt: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
];

// The record types that have a timeline. Each has its own nullable id column on
// TimelineEntry, and every entry sets exactly one of them. To add a type, add it here and
// in recordColumn below; the compiler then points at every other place that must know it.
export const RECORD_TYPES = ["lead", "contact", "company", "opportunity"] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

// One record, of any type that has a timeline.
export interface RecordRef {
  type: RecordType;
  id: string;
}

// The TimelineEntry column that points at the record, with its id: what to write on a new
// entry, and the `where` fragment for "the entries of this record".
export function recordColumn(record: RecordRef) {
  switch (record.type) {
    case "lead": {
      return { leadId: record.id };
    }
    case "contact": {
      return { contactId: record.id };
    }
    case "company": {
      return { companyId: record.id };
    }
    case "opportunity": {
      return { opportunityId: record.id };
    }
  }
}

export interface NewTimelineEntry {
  kind: TimelineKind;
  // The signed-in user, from the session. Never from a request body.
  authorId: string;
  // The record the entry belongs to.
  record: RecordRef;
  conversationType?: TimelineEntry["conversationType"];
  body?: string;
  details?: Prisma.InputJsonObject;
  // Defaults to now. Only a conversation passes the time its user chose.
  occurredAt?: Date;
}

// The one way an entry is written. It takes the transaction client on purpose: a system
// entry (CREATED, STATUS_CHANGE, ASSIGNMENT) must be written in the same transaction as the
// change it records, so there is never a change without its entry or an entry without its
// change.
export async function addTimelineEntry(
  tx: Prisma.TransactionClient,
  entry: NewTimelineEntry,
): Promise<TimelineEntryWithAuthor> {
  const { record, ...fields } = entry;
  return tx.timelineEntry.create({
    data: { ...fields, ...recordColumn(record), occurredAt: fields.occurredAt ?? new Date() },
    include: withAuthor,
  });
}

// The CREATED entries of many records at once, for an import, where one insert per record
// would be thousands of statements. Like addTimelineEntry it only inserts, and it takes the
// transaction that created the records.
export async function addCreatedEntries(
  tx: Prisma.TransactionClient,
  authorId: string,
  type: RecordType,
  records: { id: string; createdAt: Date }[],
  details: Prisma.InputJsonObject,
): Promise<void> {
  await tx.timelineEntry.createMany({
    data: records.map((record) => ({
      kind: "CREATED" as const,
      authorId,
      ...recordColumn({ type, id: record.id }),
      occurredAt: record.createdAt,
      details,
    })),
  });
}
