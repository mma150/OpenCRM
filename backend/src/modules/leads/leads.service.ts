import type { Prisma } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
import { type Page, pageWindow, searchWords } from "../../lib/list-query";
import { prisma } from "../../lib/prisma";
import {
  type Actor,
  assertCanReassign,
  assertCanWrite,
  visibleLiveRecords,
} from "../../lib/record-access";
import { assertAssignable, withOwner } from "../../lib/record-owner";
import { addTimelineEntry } from "../../lib/timeline";
import { findOpenStage } from "../pipeline-stages/pipeline-stages.service";
import type {
  ApiLead,
  ConvertLeadBody,
  CreateLeadBody,
  LeadListQuery,
  MarkLeadLostBody,
  UpdateLeadBody,
} from "./leads.schema";

// What every query that answers with a lead includes: the owner, and what a converted lead
// became, each only when the caller may see it. A deleted or hidden one comes back as null.
// For reads only. On a write (which Prisma runs in a transaction) it would read this many
// relations side by side on one connection, which the database driver warns about; a
// function that changes a lead reads it again afterwards (getLead) for its answer.
function withOwnerAndConversion(actor: Actor) {
  const visible = visibleLiveRecords(actor);
  return {
    ...withOwner,
    convertedContact: { where: visible, select: { id: true, firstName: true, lastName: true } },
    convertedCompany: { where: visible, select: { id: true, name: true } },
    convertedOpportunity: { where: visible, select: { id: true, name: true } },
  } satisfies Prisma.LeadInclude;
}

type LeadWithOwner = Prisma.LeadGetPayload<{
  include: ReturnType<typeof withOwnerAndConversion>;
}>;

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

function toApiLead(lead: LeadWithOwner): ApiLead {
  const contact = lead.convertedContact;
  return {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    name: fullName(lead),
    company: lead.company,
    jobTitle: lead.jobTitle,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    owner: lead.owner,
    estimatedValue: lead.estimatedValue?.toNumber() ?? null,
    notes: lead.notes,
    lostReason: lead.lostReason,
    lostNote: lead.lostNote,
    lostAt: lead.lostAt?.toISOString() ?? null,
    lastContactAt: lead.lastContactAt?.toISOString() ?? null,
    convertedAt: lead.convertedAt?.toISOString() ?? null,
    convertedTo:
      lead.status === "CONVERTED"
        ? {
            contact: contact ? { id: contact.id, name: fullName(contact) } : null,
            company: lead.convertedCompany,
            opportunity: lead.convertedOpportunity,
          }
        : null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

// Every query starts here: the leads this user may see, never a deleted one.
function visibleLeads(actor: Actor): Prisma.LeadWhereInput {
  return visibleLiveRecords(actor);
}

// A lead the user may not see answers exactly like one that does not exist.
// Exported for the timeline service, which applies the same rule to a lead's entries.
export async function findLead(actor: Actor, id: string): Promise<LeadWithOwner> {
  const lead = await prisma.lead.findFirst({
    where: { id, ...visibleLeads(actor) },
    include: withOwnerAndConversion(actor),
  });
  if (!lead) {
    throw new AppError("NOT_FOUND", 404, "Lead not found");
  }
  return lead;
}

// A converted lead lives on as a contact and an opportunity. It stays readable, its owner
// can still be changed and it still takes conversations and notes, but its details and
// status are final: it cannot be edited, marked lost, deleted or converted again.
function assertNotConverted(lead: { status: LeadWithOwner["status"] }): void {
  if (lead.status === "CONVERTED") {
    throw new AppError("LEAD_CONVERTED", 409, "This lead has been converted and cannot change");
  }
}

// `id` breaks ties, so a row never appears on two pages or on none.
function orderBy(query: LeadListQuery): Prisma.LeadOrderByWithRelationInput[] {
  const { sort, order } = query;
  const tieBreak = { id: order };
  if (sort === "name") {
    return [{ firstName: order }, { lastName: order }, tieBreak];
  }
  // A lead without the value sorts last in both directions.
  if (sort === "company" || sort === "lastContactAt") {
    return [{ [sort]: { sort: order, nulls: "last" } }, tieBreak];
  }
  return [{ [sort]: order }, tieBreak];
}

export async function listLeads(actor: Actor, query: LeadListQuery): Promise<Page<ApiLead>> {
  // Every word typed must appear in the name, the company or the email.
  const search = searchWords(query.search).map((word) => {
    const contains = { contains: word, mode: "insensitive" } as const;
    return {
      OR: [
        { firstName: contains },
        { lastName: contains },
        { company: contains },
        { email: contains },
      ],
    };
  });
  const where: Prisma.LeadWhereInput = {
    AND: [
      visibleLeads(actor),
      { status: query.status, source: query.source, ownerId: query.ownerId },
      ...search,
    ],
  };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: withOwnerAndConversion(actor),
      orderBy: orderBy(query),
      ...pageWindow(query),
    }),
    prisma.lead.count({ where }),
  ]);
  return { items: leads.map((lead) => toApiLead(lead)), total };
}

export async function getLead(actor: Actor, id: string): Promise<ApiLead> {
  return toApiLead(await findLead(actor, id));
}

export async function createLead(actor: Actor, input: CreateLeadBody): Promise<ApiLead> {
  assertCanWrite(actor);
  const { ownerId = actor.id, ...fields } = input;
  await assertAssignable(actor, ownerId, "leads");

  // Every change the timeline records is made in one transaction with its entry.
  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.lead.create({ data: { ...fields, ownerId, createdById: actor.id } });
    await addTimelineEntry(tx, {
      kind: "CREATED",
      authorId: actor.id,
      record: { type: "lead", id: created.id },
      occurredAt: created.createdAt,
    });
    return created;
  });
  return getLead(actor, lead.id);
}

export async function updateLead(
  actor: Actor,
  id: string,
  input: UpdateLeadBody,
): Promise<ApiLead> {
  assertCanWrite(actor);
  const lead = await findLead(actor, id);
  assertNotConverted(lead);
  // Moving a lost lead back to an open status reopens it.
  const reopen = input.status && lead.status === "LOST";

  await prisma.$transaction(async (tx) => {
    const changed = await tx.lead.update({
      where: { id },
      data: { ...input, ...(reopen ? { lostReason: null, lostNote: null, lostAt: null } : {}) },
    });
    // Only a change of status is history; editing the other fields writes nothing.
    if (changed.status !== lead.status) {
      await addTimelineEntry(tx, {
        kind: "STATUS_CHANGE",
        authorId: actor.id,
        record: { type: "lead", id },
        details: { from: lead.status, to: changed.status },
      });
    }
  });
  return getLead(actor, id);
}

export async function markLeadLost(
  actor: Actor,
  id: string,
  input: MarkLeadLostBody,
): Promise<ApiLead> {
  assertCanWrite(actor);
  const lead = await findLead(actor, id);
  assertNotConverted(lead);
  const note = input.note ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id },
      data: { status: "LOST", lostReason: input.reason, lostNote: note, lostAt: new Date() },
    });
    // The reason and note are kept here too: reopening the lead clears them on the lead.
    await addTimelineEntry(tx, {
      kind: "STATUS_CHANGE",
      authorId: actor.id,
      record: { type: "lead", id },
      details: { from: lead.status, to: "LOST", reason: input.reason, note },
    });
  });
  return getLead(actor, id);
}

// LEAD-02: the lead must be one the caller can see, and the new owner one they may assign to.
export async function assignLead(actor: Actor, id: string, ownerId: string): Promise<ApiLead> {
  assertCanReassign(actor);
  const lead = await findLead(actor, id);
  await assertAssignable(actor, ownerId, "leads");
  // Assigning a lead to the owner it already has changes nothing, so it writes no entry.
  if (ownerId === lead.ownerId) {
    return toApiLead(lead);
  }

  await prisma.$transaction(async (tx) => {
    const changed = await tx.lead.update({
      where: { id },
      data: { ownerId },
      include: withOwner,
    });
    await addTimelineEntry(tx, {
      kind: "ASSIGNMENT",
      authorId: actor.id,
      record: { type: "lead", id },
      details: { fromOwner: lead.owner, toOwner: changed.owner },
    });
  });
  return getLead(actor, id);
}

// A soft delete: the row stays for history, and no response ever shows it again.
export async function deleteLead(actor: Actor, id: string): Promise<void> {
  assertCanWrite(actor);
  assertNotConverted(await findLead(actor, id));
  await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
}

// LEAD-04: the lead becomes a contact, and if asked a company and an opportunity, in one
// transaction. Nothing is copied or moved on the timeline: the lead keeps its history and
// stays readable, the lead's STATUS_CHANGE entry names what it became, and the CREATED entry
// of each new record names the lead. The new records belong to the lead's owner.
export async function convertLead(
  actor: Actor,
  id: string,
  input: ConvertLeadBody,
): Promise<ApiLead> {
  assertCanWrite(actor);
  const lead = await findLead(actor, id);
  assertNotConverted(lead);
  if (lead.status === "LOST") {
    throw new AppError("VALIDATION_FAILED", 400, "Reopen the lead before converting it");
  }

  // A company or contact the caller cannot see answers exactly like one that does not exist.
  const visible = visibleLiveRecords(actor);
  const existingCompany =
    input.company.mode === "existing"
      ? await prisma.company.findFirst({ where: { id: input.company.id, ...visible } })
      : null;
  if (input.company.mode === "existing" && !existingCompany) {
    throw fieldError("company.id", "Choose a company you can see");
  }
  const existingContact =
    input.contact.mode === "existing"
      ? await prisma.contact.findFirst({ where: { id: input.contact.id, ...visible } })
      : null;
  if (input.contact.mode === "existing" && !existingContact) {
    throw fieldError("contact.id", "Choose a contact you can see");
  }
  const stage = input.opportunity.create
    ? await findOpenStage(input.opportunity.stageId, "opportunity.stageId")
    : null;

  const fromLead = { id, name: fullName(lead) };
  const owned = { ownerId: lead.ownerId, createdById: actor.id };

  await prisma.$transaction(async (tx) => {
    // First, and only if the lead is not converted yet: a second request for the same lead
    // waits here for the first to finish, then finds nothing to change and stops.
    const claimed = await tx.lead.updateMany({
      where: { id, status: { not: "CONVERTED" } },
      data: { status: "CONVERTED", convertedAt: new Date() },
    });
    if (claimed.count === 0) {
      assertNotConverted({ status: "CONVERTED" });
    }

    let company = existingCompany;
    if (input.company.mode === "create") {
      company = await tx.company.create({ data: { name: input.company.name, ...owned } });
      await addTimelineEntry(tx, {
        kind: "CREATED",
        authorId: actor.id,
        record: { type: "company", id: company.id },
        details: { fromLead },
      });
    }

    let contact = existingContact;
    if (!contact) {
      contact = await tx.contact.create({
        data: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          jobTitle: lead.jobTitle,
          email: lead.email,
          phone: lead.phone,
          notes: lead.notes,
          lastContactAt: lead.lastContactAt,
          companyId: company?.id,
          ...owned,
        },
      });
      await addTimelineEntry(tx, {
        kind: "CREATED",
        authorId: actor.id,
        record: { type: "contact", id: contact.id },
        details: { fromLead },
      });
    }

    let opportunity: { id: string; name: string } | null = null;
    if (stage) {
      const { name, value, expectedCloseDate } = input.opportunity;
      opportunity = await tx.opportunity.create({
        data: {
          name: name ?? company?.name ?? fromLead.name,
          value: value ?? lead.estimatedValue ?? 0,
          expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
          stageId: stage.id,
          contactId: contact.id,
          companyId: company?.id,
          ...owned,
        },
      });
      await addTimelineEntry(tx, {
        kind: "CREATED",
        authorId: actor.id,
        record: { type: "opportunity", id: opportunity.id },
        details: { fromLead },
      });
    }

    await tx.lead.update({
      where: { id },
      data: {
        convertedContactId: contact.id,
        convertedCompanyId: company?.id,
        convertedOpportunityId: opportunity?.id,
      },
    });
    await addTimelineEntry(tx, {
      kind: "STATUS_CHANGE",
      authorId: actor.id,
      record: { type: "lead", id },
      details: {
        from: lead.status,
        to: "CONVERTED",
        contact: { id: contact.id, name: fullName(contact) },
        company: company ? { id: company.id, name: company.name } : null,
        opportunity: opportunity ? { id: opportunity.id, name: opportunity.name } : null,
      },
    });
  });
  return getLead(actor, id);
}
