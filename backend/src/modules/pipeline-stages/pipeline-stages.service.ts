import type { PipelineStage, Prisma, StageKind } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
import { escapeWildcards } from "../../lib/list-query";
import { lockPipelineStages, prisma } from "../../lib/prisma";
import { type Actor, visibleLiveRecords } from "../../lib/record-access";
import { addTimelineEntry } from "../../lib/timeline";
import { type ApiPipelineStage, MAX_OPEN_STAGES } from "./pipeline-stages.schema";

// The single sales pipeline (OPP-05). Reading it is for every signed-in user; the routes
// let only an Admin change it. Every change runs under lockPipelineStages, so two Admins
// cannot both delete "the other" open stage or give two stages one name.

// The open stages by position, then Won, then Lost: PostgreSQL sorts an enum in the order
// its values are declared, which is the order the pipeline reads in.
export const pipelineOrder: Prisma.PipelineStageOrderByWithRelationInput[] = [
  { kind: "asc" },
  { position: "asc" },
  { id: "asc" },
];

// What a timeline entry keeps of a stage change. Names, not ids, because a stage can be
// renamed or deleted later and history should read as it was.
export function stageChange(
  from: { name: string; kind: StageKind },
  to: { name: string; kind: StageKind },
) {
  return { from: from.name, to: to.name, fromKind: from.kind, toKind: to.kind };
}

// The whole pipeline in order. `opportunityCount` counts what the caller may see, which
// for an Admin is every opportunity that is not deleted.
export async function listStages(actor: Actor): Promise<ApiPipelineStage[]> {
  const stages = await prisma.pipelineStage.findMany({
    orderBy: pipelineOrder,
    include: { _count: { select: { opportunities: { where: visibleLiveRecords(actor) } } } },
  });
  return stages.map((stage, position) => ({
    id: stage.id,
    name: stage.name,
    position,
    kind: stage.kind,
    opportunityCount: stage._count.opportunities,
  }));
}

// The open stage a request names, or the first one when it names none. A stage that does
// not exist, or the Won or Lost stage, is a validation failure on the field (`path`).
// Exported for the opportunities and leads services.
export async function findOpenStage(
  stageId: string | undefined,
  path = "stageId",
): Promise<PipelineStage> {
  if (stageId === undefined) {
    // There is always one: the last open stage cannot be deleted.
    return prisma.pipelineStage.findFirstOrThrow({
      where: { kind: "OPEN" },
      orderBy: pipelineOrder,
    });
  }
  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
  if (!stage) {
    throw fieldError(path, "Choose a pipeline stage");
  }
  if (stage.kind !== "OPEN") {
    throw fieldError(path, "Choose an open stage; closing an opportunity marks it won or lost");
  }
  return stage;
}

// The one Won or Lost stage.
export async function findClosedStage(kind: "WON" | "LOST"): Promise<PipelineStage> {
  return prisma.pipelineStage.findFirstOrThrow({ where: { kind } });
}

async function findStage(tx: Prisma.TransactionClient, id: string): Promise<PipelineStage> {
  const stage = await tx.pipelineStage.findUnique({ where: { id } });
  if (!stage) {
    throw new AppError("NOT_FOUND", 404, "Pipeline stage not found");
  }
  return stage;
}

// Two stages with one name cannot be told apart on the board, whatever the case.
async function assertNameFree(
  tx: Prisma.TransactionClient,
  name: string,
  exceptId?: string,
): Promise<void> {
  const taken = await tx.pipelineStage.findFirst({
    where: { name: { equals: escapeWildcards(name), mode: "insensitive" }, id: { not: exceptId } },
  });
  if (taken) {
    throw fieldError("name", "Another stage already has this name");
  }
}

function openStages(tx: Prisma.TransactionClient): Promise<PipelineStage[]> {
  return tx.pipelineStage.findMany({ where: { kind: "OPEN" }, orderBy: pipelineOrder });
}

// A new stage goes last among the open stages, just before Won.
export async function createStage(actor: Actor, name: string): Promise<ApiPipelineStage[]> {
  await prisma.$transaction(async (tx) => {
    await lockPipelineStages(tx);
    await assertNameFree(tx, name);
    const open = await openStages(tx);
    if (open.length >= MAX_OPEN_STAGES) {
      throw new AppError(
        "VALIDATION_FAILED",
        400,
        `A pipeline can have at most ${String(MAX_OPEN_STAGES)} open stages`,
      );
    }
    const last = open.at(-1);
    await tx.pipelineStage.create({ data: { name, position: last ? last.position + 1 : 0 } });
  });
  return listStages(actor);
}

// Any stage can be renamed, Won and Lost included.
export async function renameStage(
  actor: Actor,
  id: string,
  name: string,
): Promise<ApiPipelineStage[]> {
  await prisma.$transaction(async (tx) => {
    await lockPipelineStages(tx);
    await findStage(tx, id);
    await assertNameFree(tx, name, id);
    await tx.pipelineStage.update({ where: { id }, data: { name } });
  });
  return listStages(actor);
}

// `ids` must be every open stage, once each; Won and Lost are not part of the order.
export async function reorderStages(actor: Actor, ids: string[]): Promise<ApiPipelineStage[]> {
  await prisma.$transaction(async (tx) => {
    await lockPipelineStages(tx);
    const open = await openStages(tx);
    const sent = new Set(ids);
    if (
      sent.size !== ids.length ||
      ids.length !== open.length ||
      !open.every((s) => sent.has(s.id))
    ) {
      throw fieldError("ids", "Send every open stage exactly once");
    }
    for (const [position, id] of ids.entries()) {
      await tx.pipelineStage.update({ where: { id }, data: { position } });
    }
  });
  return listStages(actor);
}

// Only an open stage can be deleted, and never the last one. Its opportunities move to
// `moveToStageId` in the same transaction, each with a STATUS_CHANGE entry on its timeline.
export async function deleteStage(
  actor: Actor,
  id: string,
  moveToStageId: string | undefined,
): Promise<ApiPipelineStage[]> {
  await prisma.$transaction(async (tx) => {
    await lockPipelineStages(tx);
    const stage = await findStage(tx, id);
    if (stage.kind !== "OPEN") {
      throw new AppError("VALIDATION_FAILED", 400, "The Won and Lost stages cannot be deleted");
    }
    const others = (await openStages(tx)).filter((other) => other.id !== id);
    const fallback = others[0];
    if (!fallback) {
      throw new AppError("VALIDATION_FAILED", 400, "A pipeline needs at least one open stage");
    }

    const target = moveToStageId ? others.find((other) => other.id === moveToStageId) : undefined;
    if (moveToStageId && !target) {
      throw fieldError("moveToStageId", "Choose another open stage");
    }
    const opportunities = await tx.opportunity.findMany({
      where: { stageId: id, deletedAt: null },
      select: { id: true },
    });
    if (opportunities.length > 0 && !target) {
      throw fieldError("moveToStageId", "Choose a stage to move its opportunities to");
    }

    // Deleted opportunities still point at the stage, so they move too (to any open stage
    // when the request names none); only the ones people can see get a timeline entry.
    const moveTo = target ?? fallback;
    await tx.opportunity.updateMany({ where: { stageId: id }, data: { stageId: moveTo.id } });
    for (const opportunity of opportunities) {
      await addTimelineEntry(tx, {
        kind: "STATUS_CHANGE",
        authorId: actor.id,
        record: { type: "opportunity", id: opportunity.id },
        details: stageChange(stage, moveTo),
      });
    }
    await tx.pipelineStage.delete({ where: { id } });

    // Close the gap, so positions stay 0, 1, 2, ...
    for (const [position, other] of others.entries()) {
      await tx.pipelineStage.update({ where: { id: other.id }, data: { position } });
    }
  });
  return listStages(actor);
}
