import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/app-error";
import {
  buildCsvExport,
  type CsvExport,
  enumLabel,
  type ExportColumn,
  exportWindow,
  momentFormatter,
} from "../../lib/csv-export";
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
  ActivityExportQuery,
  ActivityQuery,
  ActivitySummary,
} from "./activity.schema";

// The team activity feed (CONV-04): what each person did, read from the same TimelineEntry
// rows a record's timeline shows. It is scoped by who WROTE an entry, not by who owns the
// record: an Admin and a Read-only user see everyone's entries, a Sales Manager their own
// and their team's. A Sales Rep has no feed.

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
// Read-only is the viewer role that sees every record, so it sees what an Admin sees. The
// routes already turn a Sales Rep away; this keeps the rule in the service too.
function visibleAuthors(actor: Actor): Prisma.UserWhereInput {
  switch (actor.role) {
    case "ADMIN":
    case "READ_ONLY": {
      return {};
    }
    case "SALES_MANAGER": {
      return { OR: [{ id: actor.id }, { managerId: actor.id }] };
    }
    case "SALES_REP": {
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

// The entries the caller may see that match the filters: what the feed and its export share.
async function activityWhere(
  actor: Actor,
  query: ActivityQuery,
): Promise<Prisma.TimelineEntryWhereInput> {
  const authors = visibleAuthors(actor);
  // A manager may only ask for themselves or someone on their team.
  if (query.userId && actor.role === "SALES_MANAGER") {
    const author = await prisma.user.findFirst({ where: { AND: [{ id: query.userId }, authors] } });
    if (!author) {
      throw new AppError("VALIDATION_FAILED", 400, "Request validation failed", [
        { path: "userId", message: "Choose someone on your team" },
      ]);
    }
  }

  return {
    author: authors,
    authorId: query.userId,
    occurredAt: occurredBetween(query.from, query.to),
    ...kindFilter(query.kind),
    ...ofLiveRecords,
  };
}

// The matching entries, newest first, within `window`.
async function findActivity(
  where: Prisma.TimelineEntryWhereInput,
  window: { skip: number; take: number },
): Promise<Page<ActivityEntry>> {
  const [entries, total] = await Promise.all([
    prisma.timelineEntry.findMany({ where, include: withRecord, orderBy: newestFirst, ...window }),
    prisma.timelineEntry.count({ where }),
  ]);
  return { items: entries.map((entry) => toActivityEntry(entry)), total };
}

export async function listActivity(
  actor: Actor,
  query: ActivityQuery,
): Promise<Page<ActivityEntry> & { summary: ActivitySummary }> {
  const where = await activityWhere(actor, query);
  const [page, countsByKind] = await Promise.all([
    findActivity(where, pageWindow(query)),
    prisma.timelineEntry.groupBy({ by: ["kind"], where, _count: { _all: true } }),
  ]);

  const counts = new Map(countsByKind.map((row) => [row.kind, row._count._all]));
  return {
    ...page,
    summary: {
      conversations: counts.get("CONVERSATION") ?? 0,
      notes: counts.get("NOTE") ?? 0,
      statusChanges: counts.get("STATUS_CHANGE") ?? 0,
      emails: counts.get("EMAIL") ?? 0,
    },
  };
}

// A value of an entry's details as text, or null when it is not text.
function textAt(details: Record<string, unknown> | null, key: string): string | null {
  const value = details?.[key];
  return typeof value === "string" ? value : null;
}

// The `name` (or `number`) of an { id, name } value in an entry's details.
function labelAt(
  details: Record<string, unknown> | null,
  key: string,
  field: "name" | "number",
): string | null {
  const value = details?.[key];
  if (typeof value !== "object" || value === null || !(field in value)) {
    return null;
  }
  const label = (value as Record<string, unknown>)[field];
  return typeof label === "string" ? label : null;
}

function fromTo(from: string | null, to: string | null): string | null {
  if (from === null && to === null) {
    return null;
  }
  return `${from ?? "-"} → ${to ?? "-"}`;
}

// What a system entry or an email says, as one line for the Details column of the export:
// "New → Contacted", "Ada → Rob", "Q-0001: Draft → Sent", "To: a@b.example · Our proposal".
function entryDetails(entry: ActivityEntry): string | null {
  const { details } = entry;
  switch (entry.kind) {
    case "STATUS_CHANGE": {
      // A lead's statuses are codes; an opportunity's stages are names an Admin chose.
      const isStage = textAt(details, "toKind") !== null;
      const label = (value: string | null) => (value && !isStage ? enumLabel(value) : value);
      const change = fromTo(label(textAt(details, "from")), label(textAt(details, "to")));
      const reason = textAt(details, "reason");
      const why = reason && !isStage ? enumLabel(reason) : reason;
      return [change, why].filter(Boolean).join(" · ") || null;
    }
    case "ASSIGNMENT": {
      return fromTo(labelAt(details, "fromOwner", "name"), labelAt(details, "toOwner", "name"));
    }
    case "CREATED": {
      const lead = labelAt(details, "fromLead", "name");
      return lead ? `From lead ${lead}` : null;
    }
    case "EMAIL": {
      const to = details?.to;
      const recipients = Array.isArray(to) ? to.filter((item) => typeof item === "string") : [];
      const parts = [
        recipients.length > 0 ? `To: ${recipients.join(", ")}` : null,
        textAt(details, "subject"),
      ];
      return parts.filter(Boolean).join(" · ") || null;
    }
    case "QUOTE_STATUS":
    case "INVOICE_STATUS": {
      const document = entry.kind === "QUOTE_STATUS" ? "quote" : "invoice";
      const number = labelAt(details, document, "number");
      const label = (value: string | null) => value && enumLabel(value);
      const change = fromTo(label(textAt(details, "from")), label(textAt(details, "to")));
      return [number, change].filter(Boolean).join(": ") || null;
    }
    case "CONVERSATION":
    case "NOTE": {
      return null;
    }
  }
}

// DATA-03: the feed as a CSV file, for everyone who can see the feed, with the same filters
// and scope. Newest first, like the feed.
export async function exportActivity(actor: Actor, query: ActivityExportQuery): Promise<CsvExport> {
  const moment = momentFormatter(query.tz);
  const columns: ExportColumn<ActivityEntry>[] = [
    { header: "When", value: (entry) => moment(entry.occurredAt) },
    { header: "Person", value: (entry) => entry.author.name },
    { header: "Type", value: (entry) => enumLabel(entry.kind) },
    {
      header: "Conversation type",
      value: (entry) => entry.conversationType && enumLabel(entry.conversationType),
    },
    { header: "Record type", value: (entry) => enumLabel(entry.record.type) },
    { header: "Record", value: (entry) => entry.record.name },
    { header: "Details", value: (entry) => entryDetails(entry) },
    { header: "Text", value: (entry) => entry.body },
    { header: "Logged", value: (entry) => moment(entry.createdAt) },
  ];
  return buildCsvExport(
    columns,
    await findActivity(await activityWhere(actor, query), exportWindow),
  );
}

// The people the caller may filter the feed by. Deactivated users are included, because
// what they did still matters. A Read-only user cannot write an entry, so the list of an
// Admin or a Read-only user leaves them out.
export async function listActivityAuthors(actor: Actor): Promise<ActivityAuthor[]> {
  return prisma.user.findMany({
    where: { AND: [visibleAuthors(actor), { role: { not: "READ_ONLY" } }] },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
