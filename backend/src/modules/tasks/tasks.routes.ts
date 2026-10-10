import { Router } from "express";

import {
  errorResponse,
  jsonBody,
  jsonResponse,
  registry,
  sessionSecurity,
} from "../../lib/openapi";
import { deletedResponseSchema, recordIdParamsSchema } from "../../lib/record-fields";
import { authenticate } from "../../middleware/authenticate";
import {
  completeTaskHandler,
  createTaskHandler,
  deleteTaskHandler,
  getTaskHandler,
  getTaskSummaryHandler,
  listTasksHandler,
  reopenTaskHandler,
  updateTaskHandler,
} from "./tasks.controller";
import {
  createTaskBodySchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskResponseSchema,
  taskSummaryQuerySchema,
  taskSummaryResponseSchema,
  updateTaskBodySchema,
} from "./tasks.schema";

export const tasksRouter = Router();

// Any signed-in user. Which tasks each role may see and change is decided in the service,
// because it depends on who the task is assigned to and who made it.
tasksRouter.use(authenticate);

tasksRouter.get("/", listTasksHandler);
tasksRouter.post("/", createTaskHandler);
// Above /:id, or "summary" would be read as an id.
tasksRouter.get("/summary", getTaskSummaryHandler);
tasksRouter.get("/:id", getTaskHandler);
tasksRouter.patch("/:id", updateTaskHandler);
tasksRouter.delete("/:id", deleteTaskHandler);
tasksRouter.post("/:id/complete", completeTaskHandler);
tasksRouter.post("/:id/reopen", reopenTaskHandler);

// Documented beside the routes so the two cannot drift apart.
const tags = ["Tasks"];
const security = sessionSecurity;
const params = recordIdParamsSchema;
const unauthenticated = errorResponse("Not signed in (UNAUTHENTICATED)");
const readOnly = errorResponse("A Read-only user cannot change tasks (FORBIDDEN)");
const validationFailed = errorResponse("The request is not acceptable (VALIDATION_FAILED)");
const badLink = errorResponse(
  "VALIDATION_FAILED: bad input, an assigneeId the caller may not assign tasks to, or a record.id that is not a record the caller may see",
);
const notFound = errorResponse(
  "No task has this id, or it is not one the caller may see (NOT_FOUND)",
);

registry.registerPath({
  method: "get",
  path: "/tasks",
  tags,
  summary: "List the tasks the caller may see, with search, filters, sorting and paging",
  description:
    "A user sees the tasks assigned to them or made by them; a Sales Manager also those assigned to their team; an Admin and a Read-only user see every task. search matches the title. Sorted by due date, soonest first, unless asked otherwise; a task without a due date sorts last. due filters by the viewer's calendar day in the time zone tz: overdue (due before today), today, upcoming (after today) or none (no due date).",
  security,
  request: { query: taskListQuerySchema },
  responses: {
    200: jsonResponse("One page of tasks; meta.total counts every match", taskListResponseSchema),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "get",
  path: "/tasks/summary",
  tags,
  summary: "Count the caller's own open tasks: overdue, due today, upcoming and without a date",
  description:
    "Own means assigned to the caller. The days are the caller's, in the time zone tz (UTC when left out).",
  security,
  request: { query: taskSummaryQuerySchema },
  responses: {
    200: jsonResponse("The four counts", taskSummaryResponseSchema),
    400: validationFailed,
    401: unauthenticated,
  },
});

registry.registerPath({
  method: "post",
  path: "/tasks",
  tags,
  summary: "Create a task, assigned to the caller unless assigneeId says otherwise",
  description:
    "A Sales Rep may assign only to themselves, a Sales Manager to themselves and their team, an Admin to any active user who is not Read-only. An assignee other than the caller gets a TASK_ASSIGNED notification. record links the task to one record the caller may see.",
  security,
  request: { body: jsonBody(createTaskBodySchema) },
  responses: {
    201: jsonResponse("The new task", taskResponseSchema),
    400: badLink,
    401: unauthenticated,
    403: readOnly,
  },
});

registry.registerPath({
  method: "get",
  path: "/tasks/{id}",
  tags,
  summary: "Read one task",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The task", taskResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    404: notFound,
  },
});

registry.registerPath({
  method: "patch",
  path: "/tasks/{id}",
  tags,
  summary: "Change a task's details, assignee, record or reminder",
  description:
    "Only the keys sent are changed; null clears a field that can be empty. Moving reminderAt arms the reminder again. A new assignee other than the caller gets a TASK_ASSIGNED notification. The status is changed with the complete and reopen routes.",
  security,
  request: { params, body: jsonBody(updateTaskBodySchema) },
  responses: {
    200: jsonResponse("The updated task", taskResponseSchema),
    400: badLink,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "delete",
  path: "/tasks/{id}",
  tags,
  summary: "Delete a task (it is kept in the database but never shown again)",
  security,
  request: { params },
  responses: {
    200: jsonResponse("Deleted; data is null", deletedResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/tasks/{id}/complete",
  tags,
  summary: "Mark a task as done",
  description: "A task that is already done is answered as it is.",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The task, now DONE with completedAt set", taskResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/tasks/{id}/reopen",
  tags,
  summary: "Mark a done task as open again",
  description: "A task that is already open is answered as it is.",
  security,
  request: { params },
  responses: {
    200: jsonResponse("The task, now OPEN with completedAt cleared", taskResponseSchema),
    400: validationFailed,
    401: unauthenticated,
    403: readOnly,
    404: notFound,
  },
});
