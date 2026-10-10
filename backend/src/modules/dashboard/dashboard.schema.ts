import { envelope, z } from "../../lib/openapi";
import { daySchema } from "../../lib/record-fields";
import { timeZoneSchema } from "../../lib/time-zone";
import { roleSchema } from "../../lib/user-fields";
import { openLeadStatusSchema } from "../leads/leads.schema";
import { stageKindSchema } from "../pipeline-stages/pipeline-stages.schema";
import { taskSchema } from "../tasks/tasks.schema";

// The most tasks and the most follow-ups the dashboard lists.
export const DASHBOARD_LIST_LIMIT = 10;

export const myDashboardQuerySchema = z.object({ tz: timeZoneSchema });

// A follow-up that is due today or overdue, on one of the caller's own open leads or
// opportunities.
export const dashboardFollowUpSchema = z
  .object({
    type: z.enum(["LEAD", "OPPORTUNITY"]),
    id: z.string(),
    name: z.string(),
    at: z.string(),
    note: z.string().nullable(),
  })
  .openapi("DashboardFollowUp");

export type DashboardFollowUp = z.infer<typeof dashboardFollowUpSchema>;

// DASH-01. Everything here is the caller's own: records they own, tasks assigned to them.
export const myDashboardSchema = z
  .object({
    // Leads that are neither converted nor lost. `byStatus` always names all three statuses.
    openLeads: z.object({
      total: z.number().int(),
      byStatus: z.array(z.object({ status: openLeadStatusSchema, count: z.number().int() })),
    }),
    // The open stages in pipeline order, each with the caller's opportunities in it.
    pipeline: z.object({
      totalValue: z.number(),
      stages: z.array(
        z.object({
          stage: z.object({ id: z.string(), name: z.string(), kind: stageKindSchema }),
          count: z.number().int(),
          totalValue: z.number(),
        }),
      ),
    }),
    // Open tasks by the viewer's calendar day.
    tasks: z.object({
      overdue: z.number().int(),
      today: z.number().int(),
      upcoming: z.number().int(),
    }),
    // At most 10 open tasks that are overdue or due today, the longest overdue first.
    tasksDue: z.array(taskSchema),
    // At most 10, the longest overdue first.
    followUps: z.array(dashboardFollowUpSchema),
    // Opportunities closed as won since the month began for the viewer.
    wonThisMonth: z.object({ count: z.number().int(), totalValue: z.number() }),
  })
  .openapi("MyDashboard");

export type MyDashboard = z.infer<typeof myDashboardSchema>;

// The longest range the team figures cover, in days.
export const MAX_RANGE_DAYS = 366;

export const teamDashboardQuerySchema = z.object({
  // Both are days in the time zone `tz` and both are included. Left out, they are the
  // first day of the current month and today.
  from: daySchema.optional(),
  to: daySchema.optional(),
  tz: timeZoneSchema,
});

export type TeamDashboardQuery = z.infer<typeof teamDashboardQuerySchema>;

// The figures of one person, or of everyone listed added together. What each one counts is
// written down in docs/standards/backend.md ("The dashboard").
const figures = {
  leadsCreated: z.number().int(),
  leadsHandled: z.number().int(),
  conversationsLogged: z.number().int(),
  opportunitiesWon: z.number().int(),
  opportunitiesLost: z.number().int(),
  wonValue: z.number(),
  openPipelineValue: z.number(),
  overdueTasks: z.number().int(),
};

export const teamFiguresSchema = z.object(figures).openapi("TeamFigures");

export type TeamFigures = z.infer<typeof teamFiguresSchema>;

export const teamRepSchema = z
  .object({
    user: z.object({ id: z.string(), name: z.string(), role: roleSchema, active: z.boolean() }),
    ...figures,
  })
  .openapi("TeamRep");

export type TeamRep = z.infer<typeof teamRepSchema>;

// DASH-02.
export const teamDashboardSchema = z
  .object({
    // The days the figures cover, both included.
    range: z.object({ from: z.string(), to: z.string() }),
    totals: teamFiguresSchema,
    // By name.
    reps: z.array(teamRepSchema),
  })
  .openapi("TeamDashboard");

export type TeamDashboard = z.infer<typeof teamDashboardSchema>;

export const myDashboardResponseSchema = envelope(myDashboardSchema);
export const teamDashboardResponseSchema = envelope(teamDashboardSchema);
