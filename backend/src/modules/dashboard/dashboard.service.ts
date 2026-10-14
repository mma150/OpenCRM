import type { Prisma } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import type { Actor } from "../../lib/record-access";
import { daysBetween, firstOfMonth, startOfDay, todayIn } from "../../lib/time-zone";
import { ofLiveRecords } from "../activity/activity.service";
import { openLeadStatusSchema } from "../leads/leads.schema";
import { pipelineOrder } from "../pipeline-stages/pipeline-stages.service";
import { countOverdueTasks, getTaskSummary, listTasksDue } from "../tasks/tasks.service";
import {
  DASHBOARD_LIST_LIMIT,
  type DashboardFollowUp,
  MAX_RANGE_DAYS,
  type MyDashboard,
  type TeamDashboard,
  type TeamDashboardQuery,
  type TeamFigures,
  type TeamRep,
} from "./dashboard.schema";

// The dashboard figures (DASH-01 to DASH-03). Nothing is stored for them: every figure is
// counted from the records when it is asked for.

// Money is added up as numbers, so the sum is brought back to two decimals.
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

// A person's own open opportunities.
function openOpportunitiesOf(ownerId: string): Prisma.OpportunityWhereInput {
  return { ownerId, deletedAt: null, stage: { kind: "OPEN" } };
}

// The caller's open leads and opportunities whose follow-up is due today or overdue, the
// longest overdue first.
async function listFollowUps(ownerId: string, before: Date): Promise<DashboardFollowUp[]> {
  const due = { followUpAt: { lt: before } };
  const [leads, opportunities] = await Promise.all([
    prisma.lead.findMany({
      where: { ownerId, deletedAt: null, status: { in: openLeadStatusSchema.options }, ...due },
      orderBy: [{ followUpAt: "asc" }, { id: "asc" }],
      take: DASHBOARD_LIST_LIMIT,
    }),
    prisma.opportunity.findMany({
      where: { ...openOpportunitiesOf(ownerId), ...due },
      orderBy: [{ followUpAt: "asc" }, { id: "asc" }],
      take: DASHBOARD_LIST_LIMIT,
    }),
  ]);

  const followUps = [
    ...leads.map((lead) => ({
      type: "LEAD" as const,
      id: lead.id,
      name: `${lead.firstName} ${lead.lastName}`,
      at: lead.followUpAt,
      note: lead.followUpNote,
    })),
    ...opportunities.map((opportunity) => ({
      type: "OPPORTUNITY" as const,
      id: opportunity.id,
      name: opportunity.name,
      at: opportunity.followUpAt,
      note: opportunity.followUpNote,
    })),
  ];
  return followUps
    .flatMap((item) => (item.at ? [{ ...item, at: item.at.toISOString() }] : []))
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, DASHBOARD_LIST_LIMIT);
}

// DASH-01: the caller's own work. "Own" is the same for every role: records they own and
// tasks assigned to them. A Sales Manager's or an Admin's page is about themselves, not
// their team (that is the team dashboard), so nobody sees another person's numbers here.
export async function getMyDashboard(actor: Actor, timeZone: string): Promise<MyDashboard> {
  const ownerId = actor.id;
  const today = todayIn(timeZone, new Date());
  const monthStart = startOfDay(timeZone, firstOfMonth(today.day));

  const [leadCounts, stages, stageTotals, tasks, tasksDue, followUps, won] = await Promise.all([
    prisma.lead.groupBy({
      by: ["status"],
      where: { ownerId, deletedAt: null, status: { in: openLeadStatusSchema.options } },
      _count: { _all: true },
    }),
    prisma.pipelineStage.findMany({ where: { kind: "OPEN" }, orderBy: pipelineOrder }),
    prisma.opportunity.groupBy({
      by: ["stageId"],
      where: openOpportunitiesOf(ownerId),
      _count: { _all: true },
      _sum: { value: true },
    }),
    getTaskSummary(actor, timeZone),
    listTasksDue(actor, timeZone, DASHBOARD_LIST_LIMIT),
    listFollowUps(ownerId, today.end),
    prisma.opportunity.aggregate({
      where: { ownerId, deletedAt: null, stage: { kind: "WON" }, closedAt: { gte: monthStart } },
      _count: { _all: true },
      _sum: { value: true },
    }),
  ]);

  const leadsByStatus = new Map(leadCounts.map((row) => [row.status, row._count._all]));
  const byStatus = openLeadStatusSchema.options.map((status) => ({
    status,
    count: leadsByStatus.get(status) ?? 0,
  }));
  const totalsByStage = new Map(stageTotals.map((row) => [row.stageId, row]));
  const pipelineStages = stages.map((stage) => {
    const total = totalsByStage.get(stage.id);
    return {
      stage: { id: stage.id, name: stage.name, kind: stage.kind },
      count: total?._count._all ?? 0,
      totalValue: total?._sum.value?.toNumber() ?? 0,
    };
  });

  return {
    openLeads: { total: byStatus.reduce((sum, row) => sum + row.count, 0), byStatus },
    pipeline: {
      totalValue: money(pipelineStages.reduce((sum, row) => sum + row.totalValue, 0)),
      stages: pipelineStages,
    },
    tasks: { overdue: tasks.overdue, today: tasks.today, upcoming: tasks.upcoming },
    tasksDue,
    followUps,
    wonThisMonth: { count: won._count._all, totalValue: won._sum.value?.toNumber() ?? 0 },
  };
}

// The Prisma `where` fragment on User for "people whose figures this user may see": for an
// Admin and a Read-only user (the viewer role that sees every record) everyone who can own a
// record, so not Read-only users; for a Sales Manager themselves and their team. The route
// already turns a Sales Rep away; this keeps the rule in the service too.
function teamMembers(actor: Actor): Prisma.UserWhereInput {
  switch (actor.role) {
    case "ADMIN":
    case "READ_ONLY": {
      return { role: { not: "READ_ONLY" } };
    }
    case "SALES_MANAGER": {
      return { OR: [{ id: actor.id }, { managerId: actor.id }] };
    }
    case "SALES_REP": {
      throw new AppError("FORBIDDEN", 403, "You do not have access to this");
    }
  }
}

// The days the figures cover. Left out, `from` is the first day of the viewer's current
// month and `to` is their today.
function rangeOf(query: TeamDashboardQuery, today: string): { from: string; to: string } {
  const from = query.from ?? firstOfMonth(today);
  const to = query.to ?? today;
  if (to < from) {
    throw fieldError("to", "Choose an end day on or after the start day");
  }
  if (daysBetween(from, to) >= MAX_RANGE_DAYS) {
    throw fieldError("to", `Choose a range of at most ${String(MAX_RANGE_DAYS)} days`);
  }
  return { from, to };
}

const NO_FIGURES: TeamFigures = {
  leadsCreated: 0,
  leadsHandled: 0,
  conversationsLogged: 0,
  opportunitiesWon: 0,
  opportunitiesLost: 0,
  wonValue: 0,
  openPipelineValue: 0,
  overdueTasks: 0,
};

const FIGURE_NAMES = Object.keys(NO_FIGURES) as (keyof TeamFigures)[];

// DASH-02: one row of figures per person. docs/standards/backend.md says what each counts.
export async function getTeamDashboard(
  actor: Actor,
  query: TeamDashboardQuery,
): Promise<TeamDashboard> {
  const members = teamMembers(actor);
  const today = todayIn(query.tz, new Date());
  const range = rangeOf(query, today.day);
  // Both days are included, so the range ends where the day after `to` begins.
  const inRange = { gte: startOfDay(query.tz, range.from), lt: startOfDay(query.tz, range.to, 1) };

  const users = await prisma.user.findMany({
    where: members,
    select: { id: true, name: true, role: true, isActive: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const ids = users.map((user) => user.id);
  const owned = { ownerId: { in: ids }, deletedAt: null };
  const closedAs = (kind: "WON" | "LOST") =>
    prisma.opportunity.groupBy({
      by: ["ownerId"],
      where: { ...owned, stage: { kind }, closedAt: inRange },
      _count: { _all: true },
      _sum: { value: true },
    });

  const [created, handled, conversations, won, lost, openPipeline, overdueTasks] =
    await Promise.all([
      prisma.lead.groupBy({
        by: ["createdById"],
        where: { createdById: { in: ids }, deletedAt: null, createdAt: inRange },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["ownerId"],
        where: {
          ...owned,
          timelineEntries: {
            some: { kind: { in: ["CONVERSATION", "STATUS_CHANGE"] }, occurredAt: inRange },
          },
        },
        _count: { _all: true },
      }),
      prisma.timelineEntry.groupBy({
        by: ["authorId"],
        where: {
          authorId: { in: ids },
          kind: "CONVERSATION",
          occurredAt: inRange,
          ...ofLiveRecords,
        },
        _count: { _all: true },
      }),
      closedAs("WON"),
      closedAs("LOST"),
      prisma.opportunity.groupBy({
        by: ["ownerId"],
        where: { ...owned, stage: { kind: "OPEN" } },
        _sum: { value: true },
      }),
      countOverdueTasks(ids, query.tz),
    ]);

  const createdBy = new Map(created.map((row) => [row.createdById, row._count._all]));
  const handledBy = new Map(handled.map((row) => [row.ownerId, row._count._all]));
  const conversationsBy = new Map(conversations.map((row) => [row.authorId, row._count._all]));
  const wonBy = new Map(won.map((row) => [row.ownerId, row]));
  const lostBy = new Map(lost.map((row) => [row.ownerId, row._count._all]));
  const openValueBy = new Map(openPipeline.map((row) => [row.ownerId, row._sum.value]));

  const reps: TeamRep[] = users
    .map((user) => ({
      user: { id: user.id, name: user.name, role: user.role, active: user.isActive },
      leadsCreated: createdBy.get(user.id) ?? 0,
      leadsHandled: handledBy.get(user.id) ?? 0,
      conversationsLogged: conversationsBy.get(user.id) ?? 0,
      opportunitiesWon: wonBy.get(user.id)?._count._all ?? 0,
      opportunitiesLost: lostBy.get(user.id) ?? 0,
      wonValue: wonBy.get(user.id)?._sum.value?.toNumber() ?? 0,
      openPipelineValue: openValueBy.get(user.id)?.toNumber() ?? 0,
      overdueTasks: overdueTasks.get(user.id) ?? 0,
    }))
    // A deactivated person stays on the page only while there is something to show.
    .filter((rep) => rep.user.active || FIGURE_NAMES.some((name) => rep[name] !== 0));

  const totals = { ...NO_FIGURES };
  for (const rep of reps) {
    for (const name of FIGURE_NAMES) {
      totals[name] = money(totals[name] + rep[name]);
    }
  }
  return { range, totals, reps };
}
