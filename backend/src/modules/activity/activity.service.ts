import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/app-error";
import { type Page, pageWindow } from "../../lib/list-query";
import { prisma } from "../../lib/prisma";
import type { Actor } from "../../lib/record-access";
import {
  kindFilter,
  newestFirst,
  type TimelineEntryWithAuthor,
  toApiTimelineEntry,
  withAuthor,
} from "../../lib/timeline";
import type {
  ActivityAuthor,
  ActivityEntry,
  ActivityQuery,
  ActivitySummary,
} from "./activity.schema";

// The team activity feed (CONV-04): what each person did, read from the same TimelineEntry
// rows a record's timeline shows. It is scoped by who WROTE an entry, not by who owns the
// record: an Admin sees everyone's entries, a Sales Manager their own and their team's.

// An entry belongs to exactly one record, so exactly one of these comes back set. A new
// record type is added here, in recordOf and in ofLiveRecords.
const person = { select: { id: true, firstName: true, lastName: true } } as const;

const withRecord = {
  ...withAuthor,
  lead: person,
  contact: person,
  company: { select: { id: true, name: true } },
  opportunity: { select: { id: true, name: true } },
} as const;

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

type EntryWithRecord = TimelineEntryWithAuthor & {
  lead: Person | null;
  contact: Person | null;
  company: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
};

function recordOf(entry: EntryWithRecord): ActivityEntry["record"] {
  const { lead, contact, company, opportunity } = entry;
  if (lead) {
    return { type: "LEAD", id: lead.id, name: `${lead.firstName} ${lead.lastName}` };
  }
  if (contact) {
    return { type: "CONTACT", id: contact.id, name: `${contact.firstName} ${contact.lastName}` };
  }
  if (company) {
    return { type: "COMPANY", id: company.id, name: company.name };
  }
  if (opportunity) {
    return { type: "OPPORTUNITY", id: opportunity.id, name: opportunity.name };
  }
  throw new Error(`Timeline entry ${entry.id} has no record`);
}

function toActivityEntry(entry: EntryWithRecord): ActivityEntry {
  return { ...toApiTimelineEntry(entry), record: recordOf(entry) };
}

// Entries of a deleted record stay in the table but are never shown.
// Exported for the dashboard, which counts the same entries.
export const ofLiveRecords: Prisma.TimelineEntryWhereInput = {
  OR: [
    { lead: { deletedAt: null } },
    { contact: { deletedAt: null } },
    { company: { deletedAt: null } },
    { opportunity: { deletedAt: null } },
  ],
};

// The Prisma `where` fragment on User for "people whose activity this user may see".
// The routes already turn the other two roles away; this keeps the rule in the service too.
function visibleAuthors(actor: Actor): Prisma.UserWhereInput {
  switch (actor.role) {
    case "ADMIN": {
      return {};
    }
    case "SALES_MANAGER": {
      return { OR: [{ id: actor.id }, { managerId: actor.id }] };
    }
    case "SALES_REP":
    case "READ_ONLY": {
      throw new AppError("FORBIDDEN", 403, "You do not have access to this");
    }
  }
}

// "2026-10-09" is a day, anything longer an exact moment.
function isDay(value: string): boolean {
  return value.length === 10;
}

// Both ends are inclusive. A day as `to` includes that whole day (UTC).
function occurredBetween(from?: string, to?: string): Prisma.DateTimeFilter {
  const filter: Prisma.DateTimeFilter = {};
  if (from) {
    filter.gte = new Date(from);
  }
  if (to && isDay(to)) {
    const nextDay = new Date(to);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    filter.lt = nextDay;
  } else if (to) {
    filter.lte = new Date(to);
  }
  return filter;
}

export async function listActivity(
  actor: Actor,
  query: ActivityQuery,
): Promise<Page<ActivityEntry> & { summary: ActivitySummary }> {
  const authors = visibleAuthors(actor);
  // A manager may only ask for themselves or someone on their team.
  if (query.userId && actor.role !== "ADMIN") {
    const author = await prisma.user.findFirst({ where: { AND: [{ id: query.userId }, authors] } });
    if (!author) {
      throw new AppError("VALIDATION_FAILED", 400, "Request validation failed", [
        { path: "userId", message: "Choose someone on your team" },
      ]);
    }
  }

  const where: Prisma.TimelineEntryWhereInput = {
    author: authors,
    authorId: query.userId,
    occurredAt: occurredBetween(query.from, query.to),
    ...kindFilter(query.kind),
    ...ofLiveRecords,
  };

  const [entries, total, countsByKind] = await Promise.all([
    prisma.timelineEntry.findMany({
      where,
      include: withRecord,
      orderBy: newestFirst,
      ...pageWindow(query),
    }),
    prisma.timelineEntry.count({ where }),
    prisma.timelineEntry.groupBy({ by: ["kind"], where, _count: { _all: true } }),
  ]);

  const counts = new Map(countsByKind.map((row) => [row.kind, row._count._all]));
  return {
    items: entries.map((entry) => toActivityEntry(entry)),
    total,
    summary: {
      conversations: counts.get("CONVERSATION") ?? 0,
      notes: counts.get("NOTE") ?? 0,
      statusChanges: counts.get("STATUS_CHANGE") ?? 0,
      emails: counts.get("EMAIL") ?? 0,
    },
  };
}

// The people the caller may filter the feed by. Deactivated users are included, because
// what they did still matters. A Read-only user cannot write an entry, so an Admin's list
// leaves them out.
export async function listActivityAuthors(actor: Actor): Promise<ActivityAuthor[]> {
  return prisma.user.findMany({
    where: { AND: [visibleAuthors(actor), { role: { not: "READ_ONLY" } }] },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
