import type { Prisma } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
import {
  buildCsvExport,
  type CsvExport,
  enumLabel,
  type ExportColumn,
  exportWindow,
  momentFormatter,
} from "../../lib/csv-export";
import { type Page, pageWindow, searchWords } from "../../lib/list-query";
import { addNotification, notificationLinks } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import {
  type Actor,
  assertCanWrite,
  assignableUsers,
  visibleLiveRecords,
} from "../../lib/record-access";
import { isMoved } from "../../lib/reminders";
import { todayIn } from "../../lib/time-zone";
import { recordColumn, type RecordType } from "../../lib/timeline";
import type {
  ApiTask,
  CreateTaskBody,
  TaskDue,
  TaskListQuery,
  TaskRecordInput,
  TaskSummary,
  UpdateTaskBody,
} from "./tasks.schema";

// Tasks (TASK-01, TASK-02). A task is not an owned record: who may see it follows the
// person it is assigned to and the person who made it.
//
//   Admin, Read-only  every task (a Read-only user changes nothing)
//   Sales Manager     tasks assigned to or made by themselves, and tasks assigned to their team
//   Sales Rep         tasks assigned to or made by themselves
//
// Whoever may see a task may change it, complete it and delete it.

// The signed-in user; the name is for the notification that tells someone they were given
// a task. A Prisma `User` fits.
export interface TaskActor extends Actor {
  name: string;
}

const person = { select: { id: true, name: true } } as const;
const namedPerson = { id: true, firstName: true, lastName: true } as const;

// What every query that answers with a task includes: the two people, and the record only
// when the caller may see it. A deleted or hidden record comes back as null.
// For reads only, like a lead's include: a function that changes a task reads it again
// afterwards (getTask) for its answer.
function withDetails(actor: Actor) {
  const visible = visibleLiveRecords(actor);
  return {
    assignee: person,
    createdBy: person,
    lead: { where: visible, select: namedPerson },
    contact: { where: visible, select: namedPerson },
    company: { where: visible, select: { id: true, name: true } },
    opportunity: { where: visible, select: { id: true, name: true } },
  } satisfies Prisma.TaskInclude;
}

type TaskWithDetails = Prisma.TaskGetPayload<{ include: ReturnType<typeof withDetails> }>;

function recordOf(task: TaskWithDetails): ApiTask["record"] {
  const { lead, contact, company, opportunity } = task;
  if (lead) {
    return { type: "LEAD", id: lead.id, name: `${lead.firstName} ${lead.lastName}` };
  }
  if (contact) {
    return { type: "CONTACT", id: contact.id, name: `${contact.firstName} ${contact.lastName}` };
  }
  if (company) {
    return { type: "COMPANY", id: company.id, name: company.name };
  }
  if (opportunity) {
    return { type: "OPPORTUNITY", id: opportunity.id, name: opportunity.name };
  }
  return null;
}

function toApiTask(task: TaskWithDetails): ApiTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueAt: task.dueAt?.toISOString() ?? null,
    status: task.status,
    completedAt: task.completedAt?.toISOString() ?? null,
    assignee: task.assignee,
    createdBy: task.createdBy,
    record: recordOf(task),
    reminderAt: task.reminderAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

// Every query starts here: the tasks this user may see, never a deleted one.
function visibleTasks(actor: Actor): Prisma.TaskWhereInput {
  const mine = [{ assigneeId: actor.id }, { createdById: actor.id }];
  switch (actor.role) {
    case "ADMIN":
    case "READ_ONLY": {
      return { deletedAt: null };
    }
    case "SALES_MANAGER": {
      return { deletedAt: null, OR: [...mine, { assignee: { managerId: actor.id } }] };
    }
    case "SALES_REP": {
      return { deletedAt: null, OR: mine };
    }
  }
}

// A task the user may not see answers exactly like one that does not exist.
async function findTask(actor: Actor, id: string): Promise<TaskWithDetails> {
  const task = await prisma.task.findFirst({
    where: { AND: [{ id }, visibleTasks(actor)] },
    include: withDetails(actor),
  });
  if (!task) {
    throw new AppError("NOT_FOUND", 404, "Task not found");
  }
  return task;
}

// The assignee must be someone the caller may give work to: the same people they may make
// the owner of a record (a Sales Rep only themselves, a Sales Manager their team).
async function assertAssignee(actor: Actor, assigneeId: string): Promise<void> {
  const assignee = await prisma.user.findFirst({
    where: { AND: [{ id: assigneeId }, assignableUsers(actor)] },
  });
  if (!assignee) {
    throw fieldError("assigneeId", "Choose a user you can assign tasks to");
  }
}

// A task can only be linked to a record its user can see; one they cannot see answers
// exactly like one that does not exist.
async function assertRecordVisible(actor: Actor, record: TaskRecordInput): Promise<void> {
  const where = { id: record.id, ...visibleLiveRecords(actor) };
  let found: number;
  switch (record.type) {
    case "LEAD": {
      found = await prisma.lead.count({ where });
      break;
    }
    case "CONTACT": {
      found = await prisma.contact.count({ where });
      break;
    }
    case "COMPANY": {
      found = await prisma.company.count({ where });
      break;
    }
    case "OPPORTUNITY": {
      found = await prisma.opportunity.count({ where });
      break;
    }
  }
  if (found === 0) {
    throw fieldError("record.id", "Choose a record you can see");
  }
}

const NO_RECORD = { leadId: null, contactId: null, companyId: null, opportunityId: null };

// The four record columns for a task's record: the one that is named, and null in the rest.
function recordColumns(record: TaskRecordInput | null) {
  if (!record) {
    return NO_RECORD;
  }
  const type = record.type.toLowerCase() as RecordType;
  return { ...NO_RECORD, ...recordColumn({ type, id: record.id }) };
}

function toDate(moment: string | null | undefined): Date | null | undefined {
  return typeof moment === "string" ? new Date(moment) : moment;
}

// The Prisma `where` fragment for one of the due buckets. Days are the viewer's: a task is
// overdue when it was due before their today began.
export function dueIs(due: TaskDue, timeZone: string, now = new Date()): Prisma.TaskWhereInput {
  const today = todayIn(timeZone, now);
  switch (due) {
    case "overdue": {
      return { dueAt: { lt: today.start } };
    }
    case "today": {
      return { dueAt: { gte: today.start, lt: today.end } };
    }
    case "upcoming": {
      return { dueAt: { gte: today.end } };
    }
    case "none": {
      return { dueAt: null };
    }
  }
}

// `id` breaks ties, so a row never appears on two pages or on none.
function orderBy(query: TaskListQuery): Prisma.TaskOrderByWithRelationInput[] {
  const { sort, order } = query;
  const tieBreak = { id: order };
  // A task without a due date sorts last in both directions.
  if (sort === "dueAt") {
    return [{ dueAt: { sort: order, nulls: "last" } }, tieBreak];
  }
  return [{ [sort]: order }, tieBreak];
}

// The filter on a task's record. A record the caller cannot see never matches.
function recordIs(actor: Actor, type: TaskRecordInput["type"], id: string): Prisma.TaskWhereInput {
  const record = { id, ...visibleLiveRecords(actor) };
  switch (type) {
    case "LEAD": {
      return { lead: record };
    }
    case "CONTACT": {
      return { contact: record };
    }
    case "COMPANY": {
      return { company: record };
    }
    case "OPPORTUNITY": {
      return { opportunity: record };
    }
  }
}

// What the list and the export share: the tasks that match, in order, within `window`.
async function findTasks(
  actor: Actor,
  query: TaskListQuery,
  window: { skip: number; take: number },
): Promise<Page<ApiTask>> {
  // Every word typed must appear in the title.
  const search = searchWords(query.search).map((word) => ({
    title: { contains: word, mode: "insensitive" as const },
  }));
  const where: Prisma.TaskWhereInput = {
    AND: [
      visibleTasks(actor),
      { status: query.status, assigneeId: query.assigneeId },
      query.recordType && query.recordId ? recordIs(actor, query.recordType, query.recordId) : {},
      query.due ? dueIs(query.due, query.tz) : {},
      ...search,
    ],
  };

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: withDetails(actor),
      orderBy: orderBy(query),
      ...window,
    }),
    prisma.task.count({ where }),
  ]);
  return { items: tasks.map((task) => toApiTask(task)), total };
}

export function listTasks(actor: Actor, query: TaskListQuery): Promise<Page<ApiTask>> {
  return findTasks(actor, query, pageWindow(query));
}

// DATA-03: the list as a CSV file, for everyone who can see the list. The record is named
// only when the caller may see it, as in the list.
export async function exportTasks(actor: Actor, query: TaskListQuery): Promise<CsvExport> {
  const moment = momentFormatter(query.tz);
  const columns: ExportColumn<ApiTask>[] = [
    { header: "Title", value: (task) => task.title },
    { header: "Description", value: (task) => task.description },
    { header: "Due", value: (task) => moment(task.dueAt) },
    { header: "Status", value: (task) => enumLabel(task.status) },
    { header: "Completed", value: (task) => moment(task.completedAt) },
    { header: "Assignee", value: (task) => task.assignee.name },
    { header: "Created by", value: (task) => task.createdBy.name },
    { header: "Record type", value: (task) => task.record && enumLabel(task.record.type) },
    { header: "Record", value: (task) => task.record?.name ?? null },
    { header: "Reminder", value: (task) => moment(task.reminderAt) },
    { header: "Created", value: (task) => moment(task.createdAt) },
    { header: "Updated", value: (task) => moment(task.updatedAt) },
  ];
  return buildCsvExport(columns, await findTasks(actor, query, exportWindow));
}

// A person's own open tasks: the ones assigned to them that are not done.
function openTasksOf(userId: string): Prisma.TaskWhereInput {
  return { assigneeId: userId, status: "OPEN", deletedAt: null };
}

// TASK-02: the caller's own open tasks, counted by when they are due.
export async function getTaskSummary(actor: Actor, timeZone: string): Promise<TaskSummary> {
  const count = (due: TaskDue) =>
    prisma.task.count({ where: { AND: [openTasksOf(actor.id), dueIs(due, timeZone)] } });
  const [overdue, today, upcoming, noDueDate] = await Promise.all([
    count("overdue"),
    count("today"),
    count("upcoming"),
    count("none"),
  ]);
  return { overdue, today, upcoming, noDueDate };
}

// For the dashboard: the caller's own open tasks that are overdue or due today, the longest
// overdue first.
export async function listTasksDue(
  actor: Actor,
  timeZone: string,
  limit: number,
): Promise<ApiTask[]> {
  const tasks = await prisma.task.findMany({
    where: { ...openTasksOf(actor.id), dueAt: { lt: todayIn(timeZone, new Date()).end } },
    include: withDetails(actor),
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  return tasks.map((task) => toApiTask(task));
}

// For the team dashboard: how many open tasks each of these people has overdue.
export async function countOverdueTasks(
  userIds: string[],
  timeZone: string,
): Promise<Map<string, number>> {
  const rows = await prisma.task.groupBy({
    by: ["assigneeId"],
    where: {
      assigneeId: { in: userIds },
      status: "OPEN",
      deletedAt: null,
      ...dueIs("overdue", timeZone),
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.assigneeId, row._count._all]));
}

export async function getTask(actor: Actor, id: string): Promise<ApiTask> {
  return toApiTask(await findTask(actor, id));
}

// Tells someone that another person gave them a task. Nobody is told about a task they
// gave themselves.
async function notifyAssignee(
  tx: Prisma.TransactionClient,
  actor: TaskActor,
  task: { id: string; title: string; assigneeId: string },
): Promise<void> {
  if (task.assigneeId === actor.id) {
    return;
  }
  await addNotification(tx, {
    userId: task.assigneeId,
    kind: "TASK_ASSIGNED",
    title: `${actor.name} assigned you a task`,
    body: task.title,
    link: notificationLinks.task(task.id),
  });
}

// Creating a task writes nothing on its record's timeline: the timeline is the dated
// history of what was discussed, and the task shows on the record through the list filter.
export async function createTask(actor: TaskActor, input: CreateTaskBody): Promise<ApiTask> {
  assertCanWrite(actor);
  const { assigneeId = actor.id, record, dueAt, reminderAt, ...fields } = input;
  await assertAssignee(actor, assigneeId);
  if (record) {
    await assertRecordVisible(actor, record);
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        ...fields,
        dueAt: toDate(dueAt),
        reminderAt: toDate(reminderAt),
        ...recordColumns(record ?? null),
        assigneeId,
        createdById: actor.id,
      },
    });
    await notifyAssignee(tx, actor, created);
    return created;
  });
  return getTask(actor, task.id);
}

export async function updateTask(
  actor: TaskActor,
  id: string,
  input: UpdateTaskBody,
): Promise<ApiTask> {
  assertCanWrite(actor);
  const task = await findTask(actor, id);
  const { assigneeId, record, dueAt, reminderAt, ...fields } = input;
  // Only a new assignee is checked, so a task can be edited whoever it is assigned to.
  const reassigned = assigneeId !== undefined && assigneeId !== task.assigneeId;
  if (reassigned) {
    await assertAssignee(actor, assigneeId);
  }
  if (record) {
    await assertRecordVisible(actor, record);
  }
  // Moving the reminder arms it again; saving the same time does not.
  const reminder = toDate(reminderAt);
  const rearmed = reminder !== undefined && isMoved(task.reminderAt, reminder);

  await prisma.$transaction(async (tx) => {
    const changed = await tx.task.update({
      where: { id },
      data: {
        ...fields,
        assigneeId,
        dueAt: toDate(dueAt),
        ...(record === undefined ? {} : recordColumns(record)),
        ...(rearmed ? { reminderAt: reminder, reminderSentAt: null } : {}),
      },
    });
    if (reassigned) {
      await notifyAssignee(tx, actor, changed);
    }
  });
  return getTask(actor, id);
}

// Completing a task that is already done, or reopening an open one, changes nothing and
// answers with the task as it is: a second click on a checkbox is not an error.
export async function completeTask(actor: Actor, id: string): Promise<ApiTask> {
  assertCanWrite(actor);
  const task = await findTask(actor, id);
  if (task.status === "DONE") {
    return toApiTask(task);
  }
  await prisma.task.update({ where: { id }, data: { status: "DONE", completedAt: new Date() } });
  return getTask(actor, id);
}

export async function reopenTask(actor: Actor, id: string): Promise<ApiTask> {
  assertCanWrite(actor);
  const task = await findTask(actor, id);
  if (task.status === "OPEN") {
    return toApiTask(task);
  }
  await prisma.task.update({ where: { id }, data: { status: "OPEN", completedAt: null } });
  return getTask(actor, id);
}

// A soft delete, like a record's: the row stays, and no response ever shows it again.
export async function deleteTask(actor: Actor, id: string): Promise<void> {
  assertCanWrite(actor);
  await findTask(actor, id);
  await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
}
