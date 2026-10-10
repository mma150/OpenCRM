import type { PipelineStage, Prisma } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
import { type Page, pageWindow, searchWords } from "../../lib/list-query";
import { prisma } from "../../lib/prisma";
import {
  type Actor,
  assertCanReassign,
  assertCanWrite,
  visibleLiveRecords,
} from "../../lib/record-access";
import type { FollowUpBody } from "../../lib/record-fields";
import { assertAssignable, withOwner } from "../../lib/record-owner";
import { followUpChange } from "../../lib/reminders";
import { addTimelineEntry } from "../../lib/timeline";
import {
  findClosedStage,
  findOpenStage,
  pipelineOrder,
  stageChange,
} from "../pipeline-stages/pipeline-stages.service";
import {
  type ApiOpportunity,
  BOARD_CARD_LIMIT,
  type BoardColumn,
  type BoardQuery,
  type CloseOpportunityBody,
  type CreateOpportunityBody,
  type OpportunityListQuery,
  type UpdateOpportunityBody,
} from "./opportunities.schema";

const person = { id: true, firstName: true, lastName: true } as const;

// What every query that answers with an opportunity includes: the owner and the stage, and
// the contact, the company and the lead it came from only when the caller may see them. A
// deleted or hidden one comes back as null.
// For reads only. On a write (which Prisma runs in a transaction) it would read this many
// relations side by side on one connection, which the database driver warns about; a
// function that changes an opportunity reads it again afterwards (getOpportunity) for its
// answer.
function withDetails(actor: Actor) {
  const visible = visibleLiveRecords(actor);
  return {
    ...withOwner,
    stage: { select: { id: true, name: true, kind: true } },
    contact: { where: visible, select: person },
    company: { where: visible, select: { id: true, name: true } },
    convertedLeads: { where: visible, select: person, take: 1 },
  } satisfies Prisma.OpportunityInclude;
}

type OpportunityWithDetails = Prisma.OpportunityGetPayload<{
  include: ReturnType<typeof withDetails>;
}>;

function toLink(record: { id: string; firstName: string; lastName: string } | null | undefined) {
  return record ? { id: record.id, name: `${record.firstName} ${record.lastName}` } : null;
}

// "2026-11-15" as the date the column stores; undefined (not sent) and null (cleared) pass
// through.
function toDate(day: string | null | undefined): Date | null | undefined {
  return typeof day === "string" ? new Date(day) : day;
}

function toApiOpportunity(opportunity: OpportunityWithDetails): ApiOpportunity {
  return {
    id: opportunity.id,
    name: opportunity.name,
    value: opportunity.value.toNumber(),
    expectedCloseDate: opportunity.expectedCloseDate?.toISOString().slice(0, 10) ?? null,
    stage: opportunity.stage,
    status: opportunity.stage.kind,
    closeReason: opportunity.closeReason,
    closedAt: opportunity.closedAt?.toISOString() ?? null,
    contact: toLink(opportunity.contact),
    company: opportunity.company,
    notes: opportunity.notes,
    owner: opportunity.owner,
    convertedFromLead: toLink(opportunity.convertedLeads[0]),
    lastContactAt: opportunity.lastContactAt?.toISOString() ?? null,
    followUpAt: opportunity.followUpAt?.toISOString() ?? null,
    followUpNote: opportunity.followUpNote,
    createdAt: opportunity.createdAt.toISOString(),
    updatedAt: opportunity.updatedAt.toISOString(),
  };
}

// Every query starts here: the opportunities this user may see, never a deleted one.
function visibleOpportunities(actor: Actor): Prisma.OpportunityWhereInput {
  return visibleLiveRecords(actor);
}

// An opportunity the user may not see answers exactly like one that does not exist.
// Exported for the timeline service, which applies the same rule to its entries.
export async function findOpportunity(actor: Actor, id: string): Promise<OpportunityWithDetails> {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, ...visibleOpportunities(actor) },
    include: withDetails(actor),
  });
  if (!opportunity) {
    throw new AppError("NOT_FOUND", 404, "Opportunity not found");
  }
  return opportunity;
}

// An opportunity can only be linked to a contact and a company its user can see; one they
// cannot see answers exactly like one that does not exist.
async function assertLinksVisible(
  actor: Actor,
  links: { contactId?: string | null; companyId?: string | null },
): Promise<void> {
  const visible = visibleLiveRecords(actor);
  if (links.contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: links.contactId, ...visible } });
    if (!contact) {
      throw fieldError("contactId", "Choose a contact you can see");
    }
  }
  if (links.companyId) {
    const company = await prisma.company.findFirst({ where: { id: links.companyId, ...visible } });
    if (!company) {
      throw fieldError("companyId", "Choose a company you can see");
    }
  }
}

// What the list and the board have in common: what the caller may see, narrowed by the
// search and the filters. A contact or company the caller cannot see never matches.
function matching(
  actor: Actor,
  query: Partial<
    Pick<
      OpportunityListQuery,
      "search" | "stageId" | "status" | "ownerId" | "companyId" | "contactId"
    >
  >,
): Prisma.OpportunityWhereInput {
  const visible = visibleLiveRecords(actor);
  // Every word typed must appear in the name, the company's name or the contact's name.
  const search = searchWords(query.search).map((word) => {
    const contains = { contains: word, mode: "insensitive" } as const;
    return {
      OR: [
        { name: contains },
        { company: { name: contains, ...visible } },
        { contact: { AND: [visible, { OR: [{ firstName: contains }, { lastName: contains }] }] } },
      ],
    };
  });
  return {
    AND: [
      visibleOpportunities(actor),
      { stageId: query.stageId, ownerId: query.ownerId },
      query.status ? { stage: { kind: query.status } } : {},
      query.companyId ? { company: { id: query.companyId, ...visible } } : {},
      query.contactId ? { contact: { id: query.contactId, ...visible } } : {},
      ...search,
    ],
  };
}

// `id` breaks ties, so a row never appears on two pages or on none.
function orderBy(query: OpportunityListQuery): Prisma.OpportunityOrderByWithRelationInput[] {
  const { sort, order } = query;
  const tieBreak = { id: order };
  switch (sort) {
    // By the stage's place in the pipeline: the open stages, then Won, then Lost.
    case "stage": {
      return [{ stage: { kind: order } }, { stage: { position: order } }, tieBreak];
    }
    // An opportunity without the date sorts last in both directions.
    case "expectedCloseDate":
    case "followUpAt": {
      return [{ [sort]: { sort: order, nulls: "last" } }, tieBreak];
    }
    default: {
      return [{ [sort]: order }, tieBreak];
    }
  }
}

export async function listOpportunities(
  actor: Actor,
  query: OpportunityListQuery,
): Promise<Page<ApiOpportunity>> {
  const where = matching(actor, query);
  const [opportunities, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: withDetails(actor),
      orderBy: orderBy(query),
      ...pageWindow(query),
    }),
    prisma.opportunity.count({ where }),
  ]);
  return { items: opportunities.map((opportunity) => toApiOpportunity(opportunity)), total };
}

// The pipeline as columns (OPP-02): every stage in order, Won and Lost included, each with
// its newest cards. The count and the total value cover the whole column, not only the cards.
export async function getBoard(actor: Actor, query: BoardQuery): Promise<BoardColumn[]> {
  const where = matching(actor, query);
  const [stages, totals] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: pipelineOrder }),
    prisma.opportunity.groupBy({
      by: ["stageId"],
      where,
      _count: { _all: true },
      _sum: { value: true },
    }),
  ]);
  const totalsByStage = new Map(totals.map((row) => [row.stageId, row]));

  return Promise.all(
    stages.map(async (stage, position) => {
      const cards = await prisma.opportunity.findMany({
        where: { AND: [where, { stageId: stage.id }] },
        include: withDetails(actor),
        // The card that was just moved or edited is on top.
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: BOARD_CARD_LIMIT,
      });
      const total = totalsByStage.get(stage.id);
      return {
        stage: { id: stage.id, name: stage.name, position, kind: stage.kind },
        count: total?._count._all ?? 0,
        totalValue: total?._sum.value?.toNumber() ?? 0,
        opportunities: cards.map((card) => toApiOpportunity(card)),
      };
    }),
  );
}

export async function getOpportunity(actor: Actor, id: string): Promise<ApiOpportunity> {
  return toApiOpportunity(await findOpportunity(actor, id));
}

export async function createOpportunity(
  actor: Actor,
  input: CreateOpportunityBody,
): Promise<ApiOpportunity> {
  assertCanWrite(actor);
  const { ownerId = actor.id, stageId, expectedCloseDate, ...fields } = input;
  await assertAssignable(actor, ownerId, "opportunities");
  await assertLinksVisible(actor, fields);
  const stage = await findOpenStage(stageId);

  // Every change the timeline records is made in one transaction with its entry.
  const opportunity = await prisma.$transaction(async (tx) => {
    const created = await tx.opportunity.create({
      data: {
        ...fields,
        expectedCloseDate: toDate(expectedCloseDate),
        stageId: stage.id,
        ownerId,
        createdById: actor.id,
      },
    });
    await addTimelineEntry(tx, {
      kind: "CREATED",
      authorId: actor.id,
      record: { type: "opportunity", id: created.id },
      occurredAt: created.createdAt,
    });
    return created;
  });
  return getOpportunity(actor, opportunity.id);
}

// Editing an opportunity's details is not history, so it writes no timeline entry. A closed
// opportunity can still be edited.
export async function updateOpportunity(
  actor: Actor,
  id: string,
  input: UpdateOpportunityBody,
): Promise<ApiOpportunity> {
  assertCanWrite(actor);
  await findOpportunity(actor, id);
  await assertLinksVisible(actor, input);
  const { expectedCloseDate, ...fields } = input;
  await prisma.opportunity.update({
    where: { id },
    data: { ...fields, expectedCloseDate: toDate(expectedCloseDate) },
  });
  return getOpportunity(actor, id);
}

// Puts the opportunity in a stage and writes the STATUS_CHANGE entry, in one transaction.
// `closed` is given when the stage is Won or Lost; any other move leaves the opportunity
// open, which clears the reason and time of an earlier close.
async function changeStage(
  actor: Actor,
  opportunity: OpportunityWithDetails,
  stage: PipelineStage,
  closed?: { reason: string | null },
): Promise<ApiOpportunity> {
  const { id } = opportunity;
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id },
      data: {
        stageId: stage.id,
        closeReason: closed?.reason ?? null,
        closedAt: closed ? new Date() : null,
      },
    });
    // The reason is kept here too: reopening the opportunity clears it on the opportunity.
    await addTimelineEntry(tx, {
      kind: "STATUS_CHANGE",
      authorId: actor.id,
      record: { type: "opportunity", id },
      details: {
        ...stageChange(opportunity.stage, stage),
        ...(closed ? { reason: closed.reason } : {}),
      },
    });
  });
  return getOpportunity(actor, id);
}

// OPP-02: a move between open stages. Moving a won or lost opportunity to an open stage
// reopens it. Won and Lost themselves are reached through closeOpportunity, which asks why.
export async function moveOpportunity(
  actor: Actor,
  id: string,
  stageId: string,
): Promise<ApiOpportunity> {
  assertCanWrite(actor);
  const opportunity = await findOpportunity(actor, id);
  const stage = await findOpenStage(stageId);
  // Moving an opportunity to the stage it is already in changes nothing, so it writes no entry.
  if (stage.id === opportunity.stageId) {
    return toApiOpportunity(opportunity);
  }
  return changeStage(actor, opportunity, stage);
}

// OPP-04. Closing an opportunity that is already closed the other way (won, now lost) is
// allowed and is a new close.
export async function closeOpportunity(
  actor: Actor,
  id: string,
  input: CloseOpportunityBody,
): Promise<ApiOpportunity> {
  assertCanWrite(actor);
  const opportunity = await findOpportunity(actor, id);
  const reason = input.reason ?? null;
  // Closing it the same way again only corrects the reason: nothing happened to the deal.
  if (opportunity.stage.kind === input.outcome) {
    await prisma.opportunity.update({ where: { id }, data: { closeReason: reason } });
    return getOpportunity(actor, id);
  }
  return changeStage(actor, opportunity, await findClosedStage(input.outcome), { reason });
}

// Back to an open stage: the one named, or the first.
export async function reopenOpportunity(
  actor: Actor,
  id: string,
  stageId: string | undefined,
): Promise<ApiOpportunity> {
  assertCanWrite(actor);
  const opportunity = await findOpportunity(actor, id);
  if (opportunity.stage.kind === "OPEN") {
    throw new AppError("VALIDATION_FAILED", 400, "Only a won or lost opportunity can be reopened");
  }
  return changeStage(actor, opportunity, await findOpenStage(stageId));
}

// The opportunity must be one the caller can see, and the new owner one they may assign to.
export async function assignOpportunity(
  actor: Actor,
  id: string,
  ownerId: string,
): Promise<ApiOpportunity> {
  assertCanReassign(actor);
  const opportunity = await findOpportunity(actor, id);
  await assertAssignable(actor, ownerId, "opportunities");
  // Assigning it to the owner it already has changes nothing, so it writes no entry.
  if (ownerId === opportunity.ownerId) {
    return toApiOpportunity(opportunity);
  }

  await prisma.$transaction(async (tx) => {
    const changed = await tx.opportunity.update({
      where: { id },
      data: { ownerId },
      include: withOwner,
    });
    await addTimelineEntry(tx, {
      kind: "ASSIGNMENT",
      authorId: actor.id,
      record: { type: "opportunity", id },
      details: { fromOwner: opportunity.owner, toOwner: changed.owner },
    });
  });
  return getOpportunity(actor, id);
}

// TASK-03: when to remind the owner about the opportunity, or (`at: null`) not at all. Moving
// the time arms the reminder again. A won or lost opportunity takes no new follow-up,
// because its reminder would never fire (lib/reminders.ts); clearing one always works.
export async function setOpportunityFollowUp(
  actor: Actor,
  id: string,
  input: FollowUpBody,
): Promise<ApiOpportunity> {
  assertCanWrite(actor);
  const opportunity = await findOpportunity(actor, id);
  if (input.at !== null && opportunity.stage.kind !== "OPEN") {
    throw new AppError(
      "VALIDATION_FAILED",
      400,
      "Reopen the opportunity before setting a follow-up",
    );
  }
  await prisma.opportunity.update({ where: { id }, data: followUpChange(opportunity, input) });
  return getOpportunity(actor, id);
}

// A soft delete: the row stays for history, and no response ever shows it again.
export async function deleteOpportunity(actor: Actor, id: string): Promise<void> {
  assertCanWrite(actor);
  await findOpportunity(actor, id);
  await prisma.opportunity.update({ where: { id }, data: { deletedAt: new Date() } });
}
