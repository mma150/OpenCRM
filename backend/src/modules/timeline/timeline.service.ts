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

// LEAD-04: a lead converted into a contact, a company or an opportunity lives on as that
// record, so the record's timeline also shows the lead's entries (as Salesforce does). The
// entries are not copied or moved: they stay the lead's, and the lead keeps its own
// timeline. The Prisma `where` fragment for "the entries of the leads converted into this
// record"; a lead's own timeline has none. Seeing the record is enough to see this history,
// whoever owns the lead now.
function convertedLeadEntries(record: RecordRef): Prisma.TimelineEntryWhereInput[] {
  const live = { deletedAt: null };
  switch (record.type) {
    case "lead": {
      return [];
    }
    case "contact": {
      return [{ lead: { convertedContactId: record.id, ...live } }];
    }
    case "company": {
      return [{ lead: { convertedCompanyId: record.id, ...live } }];
    }
    case "opportunity": {
      return [{ lead: { convertedOpportunityId: record.id, ...live } }];
    }
  }
}

const withLead = {
  ...withAuthor,
  lead: { select: { id: true, firstName: true, lastName: true } },
} as const;

// The record's own entries and those of the leads converted into it, merged into one list,
// newest first, so the kind filter and the paging work over both.
export async function listTimeline(
  actor: Actor,
  record: RecordRef,
  query: TimelineQuery,
): Promise<Page<ApiTimelineEntry>> {
  await findRecord[record.type](actor, record.id);
  const where: Prisma.TimelineEntryWhereInput = {
    AND: [{ OR: [recordColumn(record), ...convertedLeadEntries(record)] }, kindFilter(query.kind)],
  };

  const [entries, total] = await Promise.all([
    prisma.timelineEntry.findMany({
      where,
      include: withLead,
      orderBy: newestFirst,
      ...pageWindow(query),
    }),
    prisma.timelineEntry.count({ where }),
  ]);
  return {
    items: entries.map(({ lead, ...entry }) =>
      toApiTimelineEntry(
        entry,
        // On a lead's own timeline its entries are its own.
        lead && record.type !== "lead"
          ? { id: lead.id, name: `${lead.firstName} ${lead.lastName}` }
          : null,
      ),
    ),
    total,
  };
}

// Exported for the emails service: an email that was sent counts like a conversation.
// A lead, a contact and an opportunity remember when they were last spoken to; a company
// does not. Exported for the emails service: an email that was sent counts like a conversation.
// Raw SQL so the comparison happens in the database (two conversations logged at once
// cannot move the date backwards) and `updatedAt` is left alone: the record was not edited.
export async function moveLastContactAt(
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
