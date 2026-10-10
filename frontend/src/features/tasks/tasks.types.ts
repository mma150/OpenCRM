import type { components, paths } from "@/lib/api/schema";

// Every type comes from the generated schema, so a change to the API contract
// shows up here as a compile error instead of a runtime surprise (D-02).
type Schemas = components["schemas"];

export type Task = Schemas["Task"];
// The kinds of record a task can be linked to: LEAD, CONTACT, COMPANY, OPPORTUNITY.
export type TaskRecordType = Schemas["TaskRecordType"];
// When a task is due, by the viewer's calendar day: overdue, today, upcoming or none.
export type DueGroup = Schemas["TaskDue"];

export type CreateTaskInput = Schemas["CreateTaskBody"];
export type UpdateTaskInput = Schemas["UpdateTaskBody"];

// Search, filters, sort and page of GET /tasks. The API functions add `tz` themselves.
export type TaskListQuery = Omit<NonNullable<paths["/tasks"]["get"]["parameters"]["query"]>, "tz">;

// Response bodies: { data, meta }.
export type TasksResponse =
  paths["/tasks"]["get"]["responses"]["200"]["content"]["application/json"];
export type CreateTaskResponse =
  paths["/tasks"]["post"]["responses"]["201"]["content"]["application/json"];
export type TaskResponse =
  paths["/tasks/{id}"]["get"]["responses"]["200"]["content"]["application/json"];

// What the slice keeps for a list: one page of tasks plus `meta` (page, pageSize, total).
export type TaskList = { tasks: Task[] } & Schemas["ListMeta"];
