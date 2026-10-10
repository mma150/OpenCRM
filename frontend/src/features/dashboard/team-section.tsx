"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, Users } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { FormAlert } from "@/components/shared/form-alert";
import { PageError, PageState } from "@/components/shared/page-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describeApiError } from "@/lib/api/error-messages";
import { formatCurrency, formatDay } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/user-labels";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchTeamDashboard, selectTeamDashboard } from "./dashboard.slice";
import type { TeamDashboardQuery, TeamFigures, TeamRep } from "./dashboard.types";
import {
  TEAM_FIGURES,
  type TeamRange,
  teamRangeDays,
  teamRangeOptions,
  type TeamSort,
  type TeamSortKey,
  teamSortOptions,
} from "./dashboard-labels";

function figureText(figures: TeamFigures, figure: (typeof TEAM_FIGURES)[number]): string {
  const value = figures[figure.key];
  return figure.money ? formatCurrency(value) : String(value);
}

// The people in the order the table is sorted by. The API sends them by name.
function sortReps(reps: TeamRep[], sort: TeamSort): TeamRep[] {
  const direction = sort.order === "asc" ? 1 : -1;
  const { key } = sort;
  return [...reps].sort((a, b) => {
    const byName = a.user.name.localeCompare(b.user.name);
    if (key === "name") {
      return direction * byName;
    }
    // People with the same figure stay in name order.
    return direction * (a[key] - b[key]) || byName;
  });
}

function RepName({ rep }: { rep: TeamRep }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="min-w-0 font-medium wrap-anywhere">{rep.user.name}</span>
      <span className="text-muted-foreground text-xs">
        {ROLE_LABELS[rep.user.role]}
        {rep.user.active ? null : " · Deactivated"}
      </span>
    </span>
  );
}

// A column heading that sorts the table: a button, with the direction said to a screen
// reader through `aria-sort` on its cell.
function SortHeader({
  label,
  hint,
  sortKey,
  sort,
  onSort,
  numeric = false,
}: {
  label: string;
  // What the figure counts, as the hover text of the heading.
  hint?: string;
  sortKey: TeamSortKey;
  sort: TeamSort;
  onSort: (key: TeamSortKey) => void;
  numeric?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.order === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <TableHead
      aria-sort={active ? (sort.order === "asc" ? "ascending" : "descending") : "none"}
      className={cn("h-auto px-2 py-2 align-bottom whitespace-normal", numeric && "text-right")}
    >
      <button
        type="button"
        className={cn(
          "hover:text-foreground focus-visible:ring-ring/50 inline-flex items-end gap-1 rounded-sm text-xs font-medium wrap-normal outline-none focus-visible:ring-3",
          numeric && "flex-row-reverse text-right",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        title={hint}
        onClick={() => {
          onSort(sortKey);
        }}
      >
        {label}
        <Icon aria-hidden className="mb-0.5 size-3 shrink-0" />
      </button>
    </TableHead>
  );
}

// One person, or the totals, as a card: the same figures as a row of the table.
function FiguresCard({
  heading,
  figures,
  strong = false,
}: {
  heading: ReactNode;
  figures: TeamFigures;
  strong?: boolean;
}) {
  return (
    <li
      className={cn(
        "bg-card flex min-w-0 flex-col gap-3 rounded-lg border p-4",
        strong && "bg-muted/50",
      )}
    >
      <div className="text-sm">{heading}</div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {TEAM_FIGURES.map((figure) => (
          <div key={figure.key} className="min-w-0">
            <dt className="text-muted-foreground text-xs">{figure.label}</dt>
            <dd className="text-sm font-medium wrap-anywhere">{figureText(figures, figure)}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

// The Team section of Home, for an Admin and a Sales Manager: what each person on the team
// did in a range of days, with the totals. It is a table from `lg` and cards below, and is
// sorted in the browser, by a column heading or (for the cards) the "Sort by" select. It is
// only ever rendered for those two roles, so nobody else asks the API for it.
export function TeamSection() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectTeamDashboard);
  const [range, setRange] = useState<TeamRange>("this-month");
  // What the two date boxes hold while the range is a custom one.
  const [custom, setCustom] = useState<TeamDashboardQuery>({ from: "", to: "" });
  const [sort, setSort] = useState<TeamSort>({ key: "name", order: "asc" });

  const days = useMemo(() => teamRangeDays(range, custom), [range, custom]);
  // A custom range needs both of its days before it is asked for.
  const complete = days.from !== "" && days.to !== "";

  useEffect(() => {
    if (complete) {
      void dispatch(fetchTeamDashboard(days));
    }
  }, [dispatch, days, complete]);

  // Typing a date makes the range a custom one. The other box keeps the day it shows, and
  // is moved along when the two would otherwise be the wrong way round.
  function changeDate(end: "from" | "to", value: string) {
    const next = { ...days, [end]: value };
    if (next.from && next.to && next.from > next.to) {
      next[end === "from" ? "to" : "from"] = value;
    }
    setCustom(next);
    setRange("custom");
  }

  // A name sorts A to Z first; a figure, the highest first.
  function changeSort(key: TeamSortKey) {
    setSort((current) =>
      current.key === key
        ? { key, order: current.order === "asc" ? "desc" : "asc" }
        : { key, order: key === "name" ? "asc" : "desc" },
    );
  }

  const reps = data ? sortReps(data.reps, sort) : [];

  return (
    <section aria-label="Team" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Team</h2>
          <p className="text-muted-foreground text-sm">
            {data
              ? `What each person did from ${formatDay(data.range.from)} to ${formatDay(data.range.to)}.`
              : "What each person on your team did."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          <Select
            value={range}
            onValueChange={(value) => {
              // Custom starts from the days on screen.
              if (value === "custom") {
                setCustom(days);
              }
              setRange(value as TeamRange);
            }}
          >
            <SelectTrigger
              aria-label="Date range"
              className="col-span-2 w-full min-w-0 data-[size=default]:h-10 sm:w-auto"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teamRangeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(["from", "to"] as const).map((end) => (
            <label key={end} className="flex min-w-0 flex-col gap-1 text-xs font-medium">
              <span className="text-muted-foreground">{end === "from" ? "From" : "To"}</span>
              <Input
                type="date"
                value={days[end]}
                max={end === "from" && days.to ? days.to : undefined}
                min={end === "to" && days.from ? days.from : undefined}
                onChange={(event) => {
                  changeDate(end, event.target.value);
                }}
                className="h-10 sm:w-40"
              />
            </label>
          ))}
        </div>
      </div>

      {/* A failed reload keeps the last answer on screen, so say that it is out of date. */}
      {data && status === "failed" && error ? (
        <FormAlert message={describeApiError(error)} />
      ) : null}

      {data === null ? (
        status === "failed" && error ? (
          <PageError
            error={error}
            onRetry={() => {
              if (complete) {
                void dispatch(fetchTeamDashboard(days));
              }
            }}
          />
        ) : (
          <div role="status" aria-label="Loading team figures" className="flex flex-col gap-2">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-12" />
            ))}
          </div>
        )
      ) : reps.length === 0 ? (
        <PageState
          icon={Users}
          title="No one on your team yet"
          description="People show here once they are invited and, for a Sales Manager, added to the team."
        />
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            Open pipeline and overdue tasks are as of now; every other figure covers the range.
          </p>
          <div className="bg-card hidden overflow-hidden rounded-lg border lg:block">
            <Table aria-label="Team figures" className="min-w-[46rem]">
              <TableHeader>
                <TableRow>
                  <SortHeader label="Person" sortKey="name" sort={sort} onSort={changeSort} />
                  {TEAM_FIGURES.map((figure) => (
                    <SortHeader
                      key={figure.key}
                      label={figure.label}
                      hint={figure.hint}
                      sortKey={figure.key}
                      sort={sort}
                      onSort={changeSort}
                      numeric
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {reps.map((rep) => (
                  <TableRow
                    key={rep.user.id}
                    className={rep.user.active ? undefined : "opacity-70"}
                  >
                    <TableCell className="px-2 whitespace-normal">
                      <RepName rep={rep} />
                    </TableCell>
                    {TEAM_FIGURES.map((figure) => (
                      <TableCell key={figure.key} className="px-2 text-right tabular-nums">
                        {figureText(rep, figure)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="px-2 font-semibold">Total</TableCell>
                  {TEAM_FIGURES.map((figure) => (
                    <TableCell
                      key={figure.key}
                      className="px-2 text-right font-semibold tabular-nums"
                    >
                      {figureText(data.totals, figure)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <div className="flex flex-col gap-3 lg:hidden">
            <div className="flex min-w-0 gap-2">
              <Select
                value={sort.key}
                onValueChange={(value) => {
                  if (value !== sort.key) {
                    changeSort(value as TeamSortKey);
                  }
                }}
              >
                <SelectTrigger
                  aria-label="Sort by"
                  className="min-w-0 flex-1 data-[size=default]:h-10 sm:flex-none"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="text-muted-foreground">Sort by:</span>
                    <span className="truncate">
                      <SelectValue />
                    </span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {teamSortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 px-3"
                onClick={() => {
                  changeSort(sort.key);
                }}
              >
                {sort.order === "asc" ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
                {sort.order === "asc" ? "Low to high" : "High to low"}
              </Button>
            </div>
            <ul aria-label="Team figures" className="flex min-w-0 flex-col gap-3">
              {reps.map((rep) => (
                <FiguresCard key={rep.user.id} heading={<RepName rep={rep} />} figures={rep} />
              ))}
              <FiguresCard
                heading={<span className="font-semibold">Total</span>}
                figures={data.totals}
                strong
              />
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
