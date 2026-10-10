import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

// The signed-in user's own figures: records they own, tasks assigned to them.
export type MyDashboard = Schemas["MyDashboard"];
export type DashboardFollowUp = Schemas["DashboardFollowUp"];

// What each person on the team did in a range of days, and everyone added together.
export type TeamDashboard = Schemas["TeamDashboard"];
export type TeamRep = Schemas["TeamRep"];
export type TeamFigures = Schemas["TeamFigures"];

// The first and last day of GET /dashboard/team ("2026-10-01"), both included. The API
// functions add `tz` themselves.
export type TeamDashboardQuery = { from: string; to: string };

// Response bodies: { data, meta }.
export type MyDashboardResponse =
  paths["/dashboard/me"]["get"]["responses"]["200"]["content"]["application/json"];
export type TeamDashboardResponse =
  paths["/dashboard/team"]["get"]["responses"]["200"]["content"]["application/json"];
