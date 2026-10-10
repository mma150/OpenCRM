import { http } from "@/lib/api/http";
import { browserTimeZone } from "@/lib/time-zone";

import type {
  MyDashboard,
  MyDashboardResponse,
  TeamDashboard,
  TeamDashboardQuery,
  TeamDashboardResponse,
} from "./dashboard.types";

// The viewer's time zone goes with both requests: it decides what "today" and "this month" are.
export async function getMyDashboard(): Promise<MyDashboard> {
  const response = await http.get<MyDashboardResponse>("/dashboard/me", {
    params: { tz: browserTimeZone() },
  });
  return response.data.data;
}

// Admin and Sales Manager only; the API answers FORBIDDEN to everyone else.
export async function getTeamDashboard(query: TeamDashboardQuery): Promise<TeamDashboard> {
  const response = await http.get<TeamDashboardResponse>("/dashboard/team", {
    params: { ...query, tz: browserTimeZone() },
  });
  return response.data.data;
}
