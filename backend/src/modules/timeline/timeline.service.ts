import type { Prisma } from "../../generated/prisma/client";
import { type Page, pageWindow } from "../../lib/list-query";
import { prisma } from "../../lib/prisma";
import { type Actor, assertCanWrite } from "../../lib/record-access";
import {
  addTimelineEntry,
  type ApiTimelineEntry,
  kindFilter,
  newestFirst,
  recordColumn,
  type RecordRef,
  type RecordType,
  toApiTimelineEntry,
  withAuthor,
} from "../../lib/timeline";
import { findCompany } from "../companies/companies.service";
import { findContact } from "../contacts/contacts.service";
import { findLead } from "../leads/leads.service";
import { findOpportunity } from "../opportunities/opportunities.service";
import type { AddNoteBody, LogConversationBody, TimelineQuery } from "./timeline.schema";

// There is no update and no delete here on purpose: an entry is permanent once written
// (CONV-05).

// Who may read or add to a record's timeline follows the record itself, so each type is
// looked up through its own service: every one of these answers NOT_FOUND for a record the
// caller may not see, deleted ones included. A new record type adds its line here.
const findRecord: Record<RecordType, (actor: Actor, id: string) => Promise<unknown>> = {
  lead: findLead,
  contact: findContact,
  company: findCompany,
  opportunity: findOpportunity,
};

export async function listTimeline(
  actor: Actor,
  record: RecordRef,
  query: TimelineQuery,
): Promise<Page<ApiTimelineEntry>> {
  await findRecord[record.type](actor, record.id);
  const where = { ...recordColumn(record), ...kindFilter(query.kind) };

  const [entries, total] = await Promise.all([
    prisma.timelineEntry.findMany({
      where,
      include: withAuthor,
      orderBy: newestFirst,
      ...pageWindow(query),
    }),
    prisma.timelineEntry.count({ where }),
  ]);
  return { items: entries.map((entry) => toApiTimelineEntry(entry)), total };
}

// A lead, a contact and an opportunity remember when they were last spoken to; a company
// does not.
// Raw SQL so the comparison happens in the database (two conversations logged at once
// cannot move the date backwards) and `updatedAt` is left alone: the record was not edited.
async function moveLastContactAt(
  tx: Prisma.TransactionClient,
  record: RecordRef,
  occurredAt: Date,
): Promise<void> {
  switch (record.type) {
    case "lead": {
      await tx.$executeRaw`
        UPDATE "Lead" SET "lastContactAt" = ${occurredAt}
        WHERE "id" = ${record.id} AND ("lastContactAt" IS NULL OR "lastContactAt" < ${occurredAt})`;
      return;
    }
    case "contact": {
      await tx.$executeRaw`
        UPDATE "Contact" SET "lastContactAt" = ${occurredAt}
        WHERE "id" = ${record.id} AND ("lastContactAt" IS NULL OR "lastContactAt" < ${occurredAt})`;
      return;
    }
    case "opportunity": {
      await tx.$executeRaw`
        UPDATE "Opportunity" SET "lastContactAt" = ${occurredAt}
        WHERE "id" = ${record.id} AND ("lastContactAt" IS NULL OR "lastContactAt" < ${occurredAt})`;
      return;
    }
    case "company": {
      return;
    }
  }
}

// A converted or lost lead still accepts conversations and notes: people keep talking.
export async function logConversation(
  actor: Actor,
  record: RecordRef,
  input: LogConversationBody,
): Promise<ApiTimelineEntry> {
  assertCanWrite(actor);
  await findRecord[record.type](actor, record.id);
  const occurredAt = new Date(input.occurredAt);

  const entry = await prisma.$transaction(async (tx) => {
    await moveLastContactAt(tx, record, occurredAt);
    return addTimelineEntry(tx, {
      kind: "CONVERSATION",
      authorId: actor.id,
      record,
      conversationType: input.type,
      body: input.summary,
      occurredAt,
    });
  });
  return toApiTimelineEntry(entry);
}

export async function addNote(
  actor: Actor,
  record: RecordRef,
  input: AddNoteBody,
): Promise<ApiTimelineEntry> {
  assertCanWrite(actor);
  await findRecord[record.type](actor, record.id);

  const entry = await addTimelineEntry(prisma, {
    kind: "NOTE",
    authorId: actor.id,
    record,
    body: input.body,
  });
  return toApiTimelineEntry(entry);
}
