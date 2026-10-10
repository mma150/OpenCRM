import type { Prisma } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
import { escapeWildcards } from "../../lib/list-query";
import { prisma } from "../../lib/prisma";
import { type Actor, assertCanWrite } from "../../lib/record-access";
import {
  type ApiEmailTemplate,
  type ApiPlaceholder,
  type CreateEmailTemplateBody,
  MAX_TEMPLATES_PER_USER,
  type PlaceholderKey,
  PLACEHOLDERS,
  type UpdateEmailTemplateBody,
} from "./email-templates.schema";

// MAIL-04: reusable emails. A template is its owner's alone unless it is shared; a shared
// one is offered to everyone. Sharing is for Admins and Sales Managers. A template is
// changed and deleted by its owner; an Admin may also change or delete any shared one.

const withOwner = { owner: { select: { id: true, name: true } } } as const;

type TemplateWithOwner = Prisma.EmailTemplateGetPayload<{ include: typeof withOwner }>;

function canEdit(actor: Actor, template: { ownerId: string; shared: boolean }): boolean {
  if (actor.role === "READ_ONLY") {
    return false;
  }
  return template.ownerId === actor.id || (template.shared && actor.role === "ADMIN");
}

function toApiTemplate(actor: Actor, template: TemplateWithOwner): ApiEmailTemplate {
  return {
    id: template.id,
    name: template.name,
    subject: template.subject,
    body: template.body,
    shared: template.shared,
    owner: template.owner,
    editable: canEdit(actor, template),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

// The caller's own templates and every shared one.
function visibleTemplates(actor: Actor): Prisma.EmailTemplateWhereInput {
  return { OR: [{ ownerId: actor.id }, { shared: true }] };
}

// Another user's private template answers exactly like one that does not exist.
// Exported for the emails service, which checks the template an email names.
export async function findTemplate(actor: Actor, id: string): Promise<TemplateWithOwner> {
  const template = await prisma.emailTemplate.findFirst({
    where: { id, ...visibleTemplates(actor) },
    include: withOwner,
  });
  if (!template) {
    throw new AppError("NOT_FOUND", 404, "Email template not found");
  }
  return template;
}

function assertCanShare(actor: Actor): void {
  if (actor.role !== "ADMIN" && actor.role !== "SALES_MANAGER") {
    throw new AppError("FORBIDDEN", 403, "Only an Admin or a Sales Manager can share a template");
  }
}

// A shared template the caller can see but does not own, unless the caller is an Admin.
function assertCanEdit(actor: Actor, template: TemplateWithOwner): void {
  if (!canEdit(actor, template)) {
    throw new AppError("FORBIDDEN", 403, "Only its owner or an Admin can change this template");
  }
}

// Two of one person's templates with one name cannot be told apart in a picker.
async function assertNameFree(ownerId: string, name: string, exceptId?: string): Promise<void> {
  const taken = await prisma.emailTemplate.findFirst({
    where: {
      ownerId,
      name: { equals: escapeWildcards(name), mode: "insensitive" },
      id: { not: exceptId },
    },
  });
  if (taken) {
    throw fieldError("name", "You already have a template with this name");
  }
}

// By name. Short enough to stay unpaged: a user owns at most 200.
export async function listTemplates(actor: Actor): Promise<ApiEmailTemplate[]> {
  const templates = await prisma.emailTemplate.findMany({
    where: visibleTemplates(actor),
    include: withOwner,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return templates.map((template) => toApiTemplate(actor, template));
}

export async function getTemplate(actor: Actor, id: string): Promise<ApiEmailTemplate> {
  return toApiTemplate(actor, await findTemplate(actor, id));
}

export async function createTemplate(
  actor: Actor,
  input: CreateEmailTemplateBody,
): Promise<ApiEmailTemplate> {
  assertCanWrite(actor);
  if (input.shared) {
    assertCanShare(actor);
  }
  await assertNameFree(actor.id, input.name);
  if (
    (await prisma.emailTemplate.count({ where: { ownerId: actor.id } })) >= MAX_TEMPLATES_PER_USER
  ) {
    throw new AppError(
      "VALIDATION_FAILED",
      400,
      `You can have at most ${String(MAX_TEMPLATES_PER_USER)} templates`,
    );
  }
  const template = await prisma.emailTemplate.create({
    data: { ...input, shared: input.shared ?? false, ownerId: actor.id },
    include: withOwner,
  });
  return toApiTemplate(actor, template);
}

export async function updateTemplate(
  actor: Actor,
  id: string,
  input: UpdateEmailTemplateBody,
): Promise<ApiEmailTemplate> {
  assertCanWrite(actor);
  const template = await findTemplate(actor, id);
  assertCanEdit(actor, template);
  // Sharing a template that was private needs the role; leaving it as it is does not.
  if (input.shared && !template.shared) {
    assertCanShare(actor);
  }
  if (input.name !== undefined) {
    await assertNameFree(template.ownerId, input.name, id);
  }
  const changed = await prisma.emailTemplate.update({
    where: { id },
    data: input,
    include: withOwner,
  });
  return toApiTemplate(actor, changed);
}

// Deleted for real: a template is a convenience, and the emails sent with it keep their own
// text on the timeline.
export async function deleteTemplate(actor: Actor, id: string): Promise<void> {
  assertCanWrite(actor);
  assertCanEdit(actor, await findTemplate(actor, id));
  await prisma.emailTemplate.delete({ where: { id } });
}

export function listPlaceholders(): ApiPlaceholder[] {
  return PLACEHOLDERS.map((placeholder) => ({
    ...placeholder,
    token: `{{${placeholder.key}}}`,
  }));
}

export type PlaceholderValues = Partial<Record<PlaceholderKey, string | null>>;

export interface RenderedText {
  text: string;
  // Placeholders that are not on the list. They are left in the text exactly as typed.
  unknown: string[];
  // Known placeholders this record has no value for. They are replaced by nothing.
  empty: string[];
}

const KNOWN_KEYS = new Set<string>(PLACEHOLDERS.map((placeholder) => placeholder.key));

// Fills in the {{placeholders}} of a subject or a body. Spaces inside the brackets are
// fine ({{ contact.firstName }}). Pure, so it is also what a preview runs.
export function renderPlaceholders(text: string, values: PlaceholderValues): RenderedText {
  const unknown = new Set<string>();
  const empty = new Set<string>();
  const rendered = text.replaceAll(/\{\{\s*([A-Za-z][\w.]*)\s*\}\}/g, (typed, key: string) => {
    if (!KNOWN_KEYS.has(key)) {
      unknown.add(key);
      return typed;
    }
    const value = values[key as PlaceholderKey];
    if (!value) {
      empty.add(key);
      return "";
    }
    return value;
  });
  return { text: rendered, unknown: [...unknown], empty: [...empty] };
}
