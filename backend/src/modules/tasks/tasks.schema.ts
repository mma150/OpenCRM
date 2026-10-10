import { listEnvelope, listQuerySchema } from "../../lib/list-query";
import { envelope, z } from "../../lib/openapi";
import { momentSchema, optionalText } from "../../lib/record-fields";
import { timeZoneSchema } from "../../lib/time-zone";

export const taskStatusSchema = z.enum(["OPEN", "DONE"]).openapi("TaskStatus");

// The kinds of record a task can belong to.
export const taskRecordTypeSchema = z
  .enum(["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"])
  .openapi("TaskRecordType");

export type TaskRecordType = z.infer<typeof taskRecordTypeSchema>;

const personSchema = z.object({ id: z.string(), name: z.string() });

export const taskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    // An exact moment, or null for a task without a due date.
    dueAt: z.string().nullable(),
    status: taskStatusSchema,
    // Set while the task is DONE.
    completedAt: z.string().nullable(),
    assignee: personSchema,
    createdBy: personSchema,
    // The record the task belongs to. null when there is none, or it is one the caller may
    // not see (or it was deleted). Written inline because the generator drops "or null"
    // from a reference.
    record: z
      .object({
        type: z.enum(taskRecordTypeSchema.options),
        id: z.string(),
        name: z.string(),
      })
      .nullable(),
    // When the assignee is reminded; null for no reminder.
    reminderAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Task");

// Named ApiTask in code because `Task` is the Prisma row.
export type ApiTask = z.infer<typeof taskSchema>;

// Control characters are refused so a title can never break an email subject.
const titleSchema = z
  .string()
  .trim()
  .min(1, "Enter a title")
  .max(200)
  .regex(/^\P{Cc}*$/u, "Remove the control characters from the title");

// Must be a record the caller may see.
const recordSchema = z.strictObject({ type: taskRecordTypeSchema, id: z.uuid() });

export type TaskRecordInput = z.infer<typeof recordSchema>;

const taskFields = {
  description: optionalText(5000),
  dueAt: momentSchema.nullable().optional(),
  // null means the task belongs to no record.
  record: recordSchema.nullable().optional(),
  // The reminder goes to the assignee, in the app and by email. null means none.
  reminderAt: momentSchema.nullable().optional(),
};

export const createTaskBodySchema = z
  .strictObject({
    title: titleSchema,
    ...taskFields,
    // Defaults to the caller. Must be someone the caller may assign work to.
    assigneeId: z.uuid().optional(),
  })
  .openapi("CreateTaskBody");

export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;

// Only the keys that are sent are changed; null clears a field that can be empty. The
// status is changed with the complete and reopen routes.
export const updateTaskBodySchema = z
  .strictObject({
    title: titleSchema.optional(),
    ...taskFields,
    assigneeId: z.uuid().optional(),
  })
  .openapi("UpdateTaskBody");

export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>;

// When a task is due, by the viewer's calendar day (the `tz` parameter): before today,
// today, after today, or without a due date.
export const taskDueSchema = z.enum(["overdue", "today", "upcoming", "none"]).openapi("TaskDue");

export type TaskDue = z.infer<typeof taskDueSchema>;

export const taskListQuerySchema = listQuerySchema(["dueAt", "createdAt", "title"], "dueAt", "asc")
  .extend({
    status: taskStatusSchema.optional(),
    assigneeId: z.uuid().optional(),
    // The tasks of one record. The two are sent together.
    recordType: taskRecordTypeSchema.optional(),
    recordId: z.uuid().optional(),
    due: taskDueSchema.optional(),
    tz: timeZoneSchema,
  })
  .refine((query) => (query.recordType === undefined) === (query.recordId === undefined), {
    path: ["recordId"],
    message: "Send recordType and recordId together",
  });

export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskSummaryQuerySchema = z.object({ tz: timeZoneSchema });

// The caller's own open tasks, counted by when they are due.
export const taskSummarySchema = z
  .object({
    overdue: z.number().int(),
    today: z.number().int(),
    upcoming: z.number().int(),
    noDueDate: z.number().int(),
  })
  .openapi("TaskSummary");

export type TaskSummary = z.infer<typeof taskSummarySchema>;

export const taskResponseSchema = envelope(taskSchema);
export const taskListResponseSchema = listEnvelope(taskSchema);
export const taskSummaryResponseSchema = envelope(taskSummarySchema);
