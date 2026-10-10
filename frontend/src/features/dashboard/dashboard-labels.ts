import type { SelectOption } from "@/components/shared/select-control";
import { toDateInputValue } from "@/lib/format";
import type { Role } from "@/lib/user-labels";

import type { TeamDashboardQuery, TeamFigures } from "./dashboard.types";

// Who gets the Team section. The API refuses everyone else (FORBIDDEN), so the app never
// asks on their behalf.
export function seesTeamDashboard(role: Role): boolean {
  return role === "ADMIN" || role === "SALES_MANAGER";
}

// The Team section's date ranges. "This month" is the default.
export const TEAM_RANGES = ["this-month", "last-month", "7d", "30d", "custom"] as const;
export type TeamRange = (typeof TEAM_RANGES)[number];

export const teamRangeOptions: SelectOption[] = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
];

// The first and last day a range covers, as the days the API takes ("2026-10-05", both
// included), in the viewer's time zone. `custom` is what the two date boxes hold.
export function teamRangeDays(
  range: TeamRange,
  custom: TeamDashboardQuery,
  today: Date = new Date(),
): TeamDashboardQuery {
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  const to = toDateInputValue(today);
  switch (range) {
    case "this-month":
      return { from: toDateInputValue(new Date(year, month, 1)), to };
    case "last-month":
      return {
        from: toDateInputValue(new Date(year, month - 1, 1)),
        // Day 0 of this month is the last day of the one before.
        to: toDateInputValue(new Date(year, month, 0)),
      };
    case "7d":
      return { from: toDateInputValue(new Date(year, month, day - 6)), to };
    case "30d":
      return { from: toDateInputValue(new Date(year, month, day - 29)), to };
    case "custom":
      return custom;
  }
}

// The figures of the team table, in the order of its columns. `money` ones are amounts, and
// `hint` says what the API counts (the hover text of the column heading).
export const TEAM_FIGURES: {
  key: keyof TeamFigures;
  label: string;
  hint: string;
  money?: boolean;
}[] = [
  { key: "leadsCreated", label: "Leads created", hint: "Leads the person created in the range" },
  {
    key: "leadsHandled",
    label: "Leads handled",
    hint: "Leads they own that had a conversation or a status change in the range",
  },
  {
    key: "conversationsLogged",
    label: "Conversations logged",
    hint: "Conversations they logged in the range",
  },
  { key: "opportunitiesWon", label: "Won", hint: "Their opportunities closed as won in the range" },
  {
    key: "opportunitiesLost",
    label: "Lost",
    hint: "Their opportunities closed as lost in the range",
  },
  {
    key: "wonValue",
    label: "Won value",
    hint: "The value of the opportunities won in the range",
    money: true,
  },
  {
    key: "openPipelineValue",
    label: "Open pipeline",
    hint: "The value of their open opportunities right now, whatever the range",
    money: true,
  },
  {
    key: "overdueTasks",
    label: "Overdue tasks",
    hint: "Their open tasks that are overdue right now, whatever the range",
  },
];

// What the team table is sorted by: the person's name, or one of the figures.
export type TeamSortKey = "name" | keyof TeamFigures;
export type TeamSort = { key: TeamSortKey; order: "asc" | "desc" };

export const teamSortOptions: SelectOption[] = [
  { value: "name", label: "Name" },
  ...TEAM_FIGURES.map((figure) => ({ value: figure.key, label: figure.label })),
];
