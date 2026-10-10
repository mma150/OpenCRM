"use client";

import { BellRing, CircleAlert, ListChecks } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Me } from "@/features/auth/auth.types";
import { LEAD_STATUS_LABELS } from "@/features/leads/lead-labels";
import { isOverdue, taskAccess } from "@/features/tasks/task-labels";
import { TaskRow } from "@/features/tasks/task-row";
import { selectCompletedTaskIds, stillOpen } from "@/features/tasks/tasks.slice";
import { useTaskToggle } from "@/features/tasks/use-task-toggle";
import { formatCurrency, formatNearDateTime, isPast } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/store/hooks";

import type { DashboardFollowUp, MyDashboard } from "./dashboard.types";

const linkClass =
  "text-primary rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

// One headline number, as a link to the list it counts.
function StatTile({
  label,
  value,
  hint,
  href,
  alert = false,
  className,
}: {
  label: string;
  value: string;
  // A few words under the number: "3 deals".
  hint?: string;
  href: string;
  // Needs attention: the number is in the destructive colour, with an icon beside it.
  alert?: boolean;
  className?: string;
}) {
  return (
    <li className={cn("min-w-0", className)}>
      <Link
        href={href}
        className="bg-card hover:border-primary/40 focus-visible:ring-ring/50 flex h-full min-w-0 flex-col gap-1 rounded-lg border p-4 outline-none focus-visible:ring-3"
      >
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </span>
        <span
          className={cn(
            "flex items-center gap-1.5 text-2xl font-semibold tracking-tight wrap-anywhere",
            alert && "text-destructive",
          )}
        >
          {alert ? <CircleAlert aria-hidden className="size-5 shrink-0" /> : null}
          {value}
        </span>
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
      </Link>
    </li>
  );
}

// A horizontal bar: how much `value` is of `max`. It is drawn as SVG, without a chart
// library; the number it stands for is always written beside it, so the bar itself is
// decoration for a screen reader.
function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      className="h-2 w-full overflow-hidden rounded-full"
    >
      <rect width="100" height="8" className="fill-muted" />
      <rect width={width} height="8" className="fill-primary" />
    </svg>
  );
}

// One row of a bar list: a name (a link to the matching list), its figures, and the bar.
function BarRow({
  href,
  label,
  figures,
  value,
  max,
}: {
  href: string;
  label: string;
  figures: ReactNode;
  value: number;
  max: number;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <Link href={href} className={cn(linkClass, "text-foreground min-w-0 wrap-anywhere")}>
          {label}
        </Link>
        <span className="text-muted-foreground shrink-0 text-xs">{figures}</span>
      </div>
      <Bar value={value} max={max} />
    </li>
  );
}

function DashboardCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function EmptyLine({ icon: Icon, children }: { icon: typeof ListChecks; children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-start gap-2 text-sm">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function FollowUpRow({ followUp }: { followUp: DashboardFollowUp }) {
  const isLead = followUp.type === "LEAD";
  const overdue = isPast(followUp.at);
  return (
    <li className="flex min-w-0 flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant="secondary">{isLead ? "Lead" : "Opportunity"}</Badge>
        <Link
          href={`/${isLead ? "leads" : "opportunities"}/${followUp.id}`}
          className={cn(linkClass, "min-w-0 wrap-anywhere")}
        >
          {followUp.name}
        </Link>
      </div>
      <p
        className={cn(
          "text-xs",
          overdue ? "text-destructive font-medium" : "text-muted-foreground",
        )}
      >
        {overdue ? "Overdue · " : "Due "}
        {formatNearDateTime(followUp.at)}
      </p>
      {followUp.note ? (
        <p className="text-muted-foreground line-clamp-2 text-sm wrap-anywhere">{followUp.note}</p>
      ) : null}
    </li>
  );
}

// While the first answer is on its way: the shape of the tiles and the cards.
export function MyDashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading your dashboard" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((tile) => (
          <Skeleton key={tile} className="h-24 last:col-span-2 lg:last:col-span-1" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

// The signed-in user's own dashboard: headline numbers, the tasks and follow-ups that are
// due, the pipeline by stage and the open leads by status. Every number is a link to the
// list it counts. `onChanged` runs after a task was ticked off, to load the numbers again.
export function MyDashboardView({
  dashboard,
  me,
  onChanged,
}: {
  dashboard: MyDashboard;
  me: Me;
  onChanged: () => void;
}) {
  const router = useRouter();
  const completed = useAppSelector(selectCompletedTaskIds);
  const toggle = useTaskToggle(onChanged);
  const { canWrite, seesTeam } = taskAccess(me.role);
  const { openLeads, pipeline, tasks, wonThisMonth } = dashboard;

  // The figures are the user's own. Someone who sees other people's records too gets the
  // lists narrowed to their own; for everyone else the plain list is already that.
  const mine = seesTeam ? `ownerId=${me.id}` : "";
  const withMine = (href: string) =>
    mine ? `${href}${href.includes("?") ? "&" : "?"}${mine}` : href;

  const tasksDue = stillOpen(dashboard.tasksDue, completed);
  const maxStageValue = Math.max(0, ...pipeline.stages.map((row) => row.totalValue));
  const maxLeadCount = Math.max(0, ...openLeads.byStatus.map((row) => row.count));
  const openDeals = pipeline.stages.reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <ul aria-label="Your numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Open leads" value={String(openLeads.total)} href={withMine("/leads")} />
        <StatTile
          label="Pipeline value"
          value={formatCurrency(pipeline.totalValue)}
          hint={plural(openDeals, "open deal", "open deals")}
          href={withMine("/opportunities")}
        />
        <StatTile label="Tasks due today" value={String(tasks.today)} href="/tasks?due=today" />
        <StatTile
          label="Overdue tasks"
          value={String(tasks.overdue)}
          alert={tasks.overdue > 0}
          href="/tasks?due=overdue"
        />
        <StatTile
          label="Won this month"
          value={formatCurrency(wonThisMonth.totalValue)}
          hint={plural(wonThisMonth.count, "deal", "deals")}
          href={withMine("/opportunities?view=list&status=WON")}
          className="col-span-2 lg:col-span-1"
        />
      </ul>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <DashboardCard
            title="Tasks due"
            action={
              <Link href="/tasks" className={linkClass}>
                All tasks
              </Link>
            }
          >
            {tasksDue.length === 0 ? (
              <EmptyLine icon={ListChecks}>
                Nothing is due today.
                {tasks.upcoming > 0
                  ? ` ${plural(tasks.upcoming, "task is", "tasks are")} coming up.`
                  : null}
              </EmptyLine>
            ) : (
              // The rows bring their own padding; pull them out to the edge of the card.
              <ul aria-label="Tasks due" className="-mx-2 flex min-w-0 flex-col divide-y">
                {tasksDue.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    overdue={isOverdue(task)}
                    meId={me.id}
                    canWrite={canWrite}
                    onToggle={(item) => void toggle.complete(item)}
                    onOpen={(item) => {
                      router.push(`/tasks?open=${item.id}`);
                    }}
                  />
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard title="Follow-ups due">
            {dashboard.followUps.length === 0 ? (
              <EmptyLine icon={BellRing}>
                No follow-ups are due. Set one on a lead or an opportunity to be reminded.
              </EmptyLine>
            ) : (
              <ul aria-label="Follow-ups due" className="flex min-w-0 flex-col divide-y">
                {dashboard.followUps.map((followUp) => (
                  <FollowUpRow key={`${followUp.type}:${followUp.id}`} followUp={followUp} />
                ))}
              </ul>
            )}
          </DashboardCard>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <DashboardCard
            title="Pipeline by stage"
            action={
              <span className="text-muted-foreground text-xs">
                {plural(openDeals, "deal", "deals")} · {formatCurrency(pipeline.totalValue)}
              </span>
            }
          >
            {pipeline.stages.length === 0 ? (
              <p className="text-muted-foreground text-sm">The pipeline has no open stages.</p>
            ) : (
              <ul aria-label="Pipeline by stage" className="flex min-w-0 flex-col gap-4">
                {pipeline.stages.map((row) => (
                  <BarRow
                    key={row.stage.id}
                    href={withMine(`/opportunities?view=list&stageId=${row.stage.id}`)}
                    label={row.stage.name}
                    figures={
                      <>
                        {plural(row.count, "deal", "deals")} ·{" "}
                        <span className="text-foreground font-medium">
                          {formatCurrency(row.totalValue)}
                        </span>
                      </>
                    }
                    value={row.totalValue}
                    max={maxStageValue}
                  />
                ))}
              </ul>
            )}
            {openDeals === 0 && pipeline.stages.length > 0 ? (
              <p className="text-muted-foreground text-sm">
                No open opportunities yet. They show here as soon as you have one.
              </p>
            ) : null}
          </DashboardCard>

          <DashboardCard
            title="Open leads by status"
            action={
              <span className="text-muted-foreground text-xs">
                {plural(openLeads.total, "lead", "leads")}
              </span>
            }
          >
            <ul aria-label="Open leads by status" className="flex min-w-0 flex-col gap-4">
              {openLeads.byStatus.map((row) => (
                <BarRow
                  key={row.status}
                  href={withMine(`/leads?status=${row.status}`)}
                  label={LEAD_STATUS_LABELS[row.status]}
                  figures={
                    <span className="text-foreground font-medium">
                      {plural(row.count, "lead", "leads")}
                    </span>
                  }
                  value={row.count}
                  max={maxLeadCount}
                />
              ))}
            </ul>
          </DashboardCard>
        </div>
      </div>
    </>
  );
}
