import { callBack, sendQuote } from "@/features/tasks/tasks.fixtures";

import type { MyDashboard, TeamDashboard } from "./dashboard.types";

// A user with work in every section.
export const busy: MyDashboard = {
  openLeads: {
    total: 18,
    byStatus: [
      { status: "NEW", count: 10 },
      { status: "CONTACTED", count: 6 },
      { status: "QUALIFIED", count: 2 },
    ],
  },
  pipeline: {
    totalValue: 84500,
    stages: [
      { stage: { id: "stage-new", name: "New", kind: "OPEN" }, count: 6, totalValue: 14000 },
      {
        stage: { id: "stage-proposal", name: "Proposal", kind: "OPEN" },
        count: 4,
        totalValue: 70500,
      },
      {
        stage: { id: "stage-negotiation", name: "Negotiation", kind: "OPEN" },
        count: 0,
        totalValue: 0,
      },
    ],
  },
  tasks: { overdue: 2, today: 5, upcoming: 8 },
  tasksDue: [sendQuote, callBack],
  followUps: [
    {
      type: "LEAD",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      name: "Marcus Chen",
      at: "2026-10-05T09:00:00.000Z",
      note: "Ask about the budget",
    },
    {
      type: "OPPORTUNITY",
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
      name: "Northwind - Fleet Expansion",
      at: "2026-10-06T09:00:00.000Z",
      note: null,
    },
  ],
  wonThisMonth: { count: 3, totalValue: 58200 },
};

// A brand-new install: every number is zero and every list is empty.
export const empty: MyDashboard = {
  openLeads: {
    total: 0,
    byStatus: [
      { status: "NEW", count: 0 },
      { status: "CONTACTED", count: 0 },
      { status: "QUALIFIED", count: 0 },
    ],
  },
  pipeline: {
    totalValue: 0,
    stages: [{ stage: { id: "stage-new", name: "New", kind: "OPEN" }, count: 0, totalValue: 0 }],
  },
  tasks: { overdue: 0, today: 0, upcoming: 0 },
  tasksDue: [],
  followUps: [],
  wonThisMonth: { count: 0, totalValue: 0 },
};

export const team: TeamDashboard = {
  range: { from: "2026-10-01", to: "2026-10-10" },
  totals: {
    leadsCreated: 9,
    leadsHandled: 40,
    conversationsLogged: 87,
    opportunitiesWon: 9,
    opportunitiesLost: 3,
    wonValue: 43700,
    openPipelineValue: 150000,
    overdueTasks: 4,
  },
  reps: [
    {
      user: { id: "u-alex", name: "Alex Rivera", role: "SALES_REP", active: true },
      leadsCreated: 2,
      leadsHandled: 14,
      conversationsLogged: 31,
      opportunitiesWon: 2,
      opportunitiesLost: 2,
      wonValue: 8500,
      openPipelineValue: 30000,
      overdueTasks: 3,
    },
    {
      user: { id: "u-marcus", name: "Marcus Chen", role: "SALES_REP", active: true },
      leadsCreated: 4,
      leadsHandled: 22,
      conversationsLogged: 48,
      opportunitiesWon: 5,
      opportunitiesLost: 1,
      wonValue: 24500,
      openPipelineValue: 80000,
      overdueTasks: 1,
    },
    {
      user: { id: "u-zoe", name: "Zoe Old", role: "SALES_REP", active: false },
      leadsCreated: 3,
      leadsHandled: 4,
      conversationsLogged: 8,
      opportunitiesWon: 2,
      opportunitiesLost: 0,
      wonValue: 10700,
      openPipelineValue: 40000,
      overdueTasks: 0,
    },
  ],
};
