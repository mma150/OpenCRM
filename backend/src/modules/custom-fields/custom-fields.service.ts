import { type CustomField, Prisma } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
import type { CustomFieldRecordType } from "../../lib/custom-fields";
import { escapeWildcards } from "../../lib/list-query";
import { lockCustomFields, prisma } from "../../lib/prisma";
import type { Actor } from "../../lib/record-access";
import {
  type ApiCustomField,
  type CreateCustomFieldBody,
  type CustomFieldListQuery,
  MAX_ACTIVE_CUSTOM_FIELDS,
  type ReorderCustomFieldsBody,
  type UpdateCustomFieldBody,
} from "./custom-fields.schema";

// The definitions of the custom fields (CF-01). Reading them is for every signed-in user,
// because every record form and record page needs them; the routes let only an Admin change
// them. Every change runs under lockCustomFields, so two Admins cannot give two fields one
// label or go past the cap together. The values live on the records (lib/custom-fields.ts).

// The table that holds the records of each type, for the one statement Prisma cannot write
// (removing a key from the JSON column). The names are these constants, never input.
const RECORD_TABLES: Record<CustomFieldRecordType, string> = {
  LEAD: "Lead",
  CONTACT: "Contact",
  COMPANY: "Company",
  OPPORTUNITY: "Opportunity",
};

// By record type, the fields in use before the archived ones, each group in its order.
const listOrder: Prisma.CustomFieldOrderByWithRelationInput[] = [
  { recordType: "asc" },
  { archived: "asc" },
  { position: "asc" },
  { id: "asc" },
];

function toApiCustomField(field: CustomField): ApiCustomField {
  return {
    id: field.id,
    recordType: field.recordType,
    label: field.label,
    type: field.type,
    options: field.options,
    required: field.required,
    position: field.position,
    archived: field.archived,
    createdAt: field.createdAt.toISOString(),
    updatedAt: field.updatedAt.toISOString(),
  };
}

export async function listCustomFields(
  actor: Actor,
  query: CustomFieldListQuery,
): Promise<ApiCustomField[]> {
  if (query.includeArchived && actor.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", 403, "Only an Admin can list archived fields");
  }
  const fields = await prisma.customField.findMany({
    where: {
      recordType: query.recordType,
      ...(query.includeArchived ? {} : { archived: false }),
    },
    orderBy: listOrder,
  });
  return fields.map((field) => toApiCustomField(field));
}

async function findField(tx: Prisma.TransactionClient, id: string): Promise<CustomField> {
  const field = await tx.customField.findUnique({ where: { id } });
  if (!field) {
    throw new AppError("NOT_FOUND", 404, "Custom field not found");
  }
  return field;
}

// Two fields of one record type with one label cannot be told apart on a form or in an
// export, whatever the case. Archived fields count, so restoring one never collides.
async function assertLabelFree(
  tx: Prisma.TransactionClient,
  recordType: CustomFieldRecordType,
  label: string,
  exceptId?: string,
): Promise<void> {
  const taken = await tx.customField.findFirst({
    where: {
      recordType,
      label: { equals: escapeWildcards(label), mode: "insensitive" },
      id: { not: exceptId },
    },
  });
  if (taken) {
    throw fieldError(
      "label",
      taken.archived
        ? "An archived field already has this label; rename or delete that one first"
        : "Another field already has this label",
    );
  }
}

// A dropdown needs choices, each once whatever the case; the other types have none.
function assertOptionsFit(type: CustomField["type"], options: string[]): void {
  if (type !== "DROPDOWN") {
    if (options.length > 0) {
      throw fieldError("options", "Only a dropdown field has options");
    }
    return;
  }
  if (options.length === 0) {
    throw fieldError("options", "Add at least one option");
  }
  const spellings = new Set(options.map((option) => option.toLowerCase()));
  if (spellings.size !== options.length) {
    throw fieldError("options", "Each option can appear only once");
  }
}

function activeFields(
  tx: Prisma.TransactionClient,
  recordType: CustomFieldRecordType,
): Promise<CustomField[]> {
  return tx.customField.findMany({
    where: { recordType, archived: false },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

// The place after the last field in use, if the record type has room for one more.
async function nextPosition(
  tx: Prisma.TransactionClient,
  recordType: CustomFieldRecordType,
): Promise<number> {
  const active = await activeFields(tx, recordType);
  if (active.length >= MAX_ACTIVE_CUSTOM_FIELDS) {
    throw new AppError(
      "VALIDATION_FAILED",
      400,
      `A record type can have at most ${String(MAX_ACTIVE_CUSTOM_FIELDS)} custom fields in use`,
    );
  }
  const last = active.at(-1);
  return last ? last.position + 1 : 0;
}

// A new field goes last. Records that exist keep working: they simply have no value yet,
// also when the field is required.
export async function createCustomField(input: CreateCustomFieldBody): Promise<ApiCustomField> {
  const { recordType, label, type, options = [], required = false } = input;
  assertOptionsFit(type, options);
  const field = await prisma.$transaction(async (tx) => {
    await lockCustomFields(tx);
    await assertLabelFree(tx, recordType, label);
    const position = await nextPosition(tx, recordType);
    return tx.customField.create({
      data: { recordType, label, type, options, required, position },
    });
  });
  return toApiCustomField(field);
}

// Removing an option does not touch the records that hold it: they keep showing the value,
// and it can be saved back unchanged, but it can no longer be chosen anew.
export async function updateCustomField(
  id: string,
  input: UpdateCustomFieldBody,
): Promise<ApiCustomField> {
  const field = await prisma.$transaction(async (tx) => {
    await lockCustomFields(tx);
    const existing = await findField(tx, id);
    if (input.label !== undefined) {
      await assertLabelFree(tx, existing.recordType, input.label, id);
    }
    if (input.options !== undefined) {
      assertOptionsFit(existing.type, input.options);
    }
    return tx.customField.update({ where: { id }, data: input });
  });
  return toApiCustomField(field);
}

// `ids` must be every field of the record type that is in use, once each. Answers with
// every field of that record type, archived ones last.
export async function reorderCustomFields(
  input: ReorderCustomFieldsBody,
): Promise<ApiCustomField[]> {
  const { recordType, ids } = input;
  await prisma.$transaction(async (tx) => {
    await lockCustomFields(tx);
    const active = await activeFields(tx, recordType);
    const sent = new Set(ids);
    if (
      sent.size !== ids.length ||
      ids.length !== active.length ||
      !active.every((field) => sent.has(field.id))
    ) {
      throw fieldError("ids", "Send every field of this record type that is in use exactly once");
    }
    for (const [position, id] of ids.entries()) {
      await tx.customField.update({ where: { id }, data: { position } });
    }
  });
  const fields = await prisma.customField.findMany({ where: { recordType }, orderBy: listOrder });
  return fields.map((field) => toApiCustomField(field));
}

// An archived field disappears from forms, record pages, filters, imports and exports. Its
// values stay on the records, so restoring it brings them back. Archiving a field that is
// archived already answers with it as it is.
export async function archiveCustomField(id: string): Promise<ApiCustomField> {
  const field = await prisma.$transaction(async (tx) => {
    await lockCustomFields(tx);
    await findField(tx, id);
    return tx.customField.update({ where: { id }, data: { archived: true } });
  });
  return toApiCustomField(field);
}

// A restored field goes last among the fields in use.
export async function restoreCustomField(id: string): Promise<ApiCustomField> {
  const field = await prisma.$transaction(async (tx) => {
    await lockCustomFields(tx);
    const existing = await findField(tx, id);
    if (!existing.archived) {
      return existing;
    }
    const position = await nextPosition(tx, existing.recordType);
    return tx.customField.update({ where: { id }, data: { archived: false, position } });
  });
  return toApiCustomField(field);
}

// For good: the field and every value records hold for it. Only an archived field can be
// deleted, so the click that loses data is never the first one.
export async function deleteCustomField(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCustomFields(tx);
    const field = await findField(tx, id);
    if (!field.archived) {
      throw new AppError("VALIDATION_FAILED", 400, "Archive the field before deleting it");
    }
    // Raw SQL, so the records' `updatedAt` does not move: nobody edited them.
    const table = Prisma.raw(`"${RECORD_TABLES[field.recordType]}"`);
    await tx.$executeRaw`UPDATE ${table} SET "customFields" = "customFields" - ${id}::text WHERE jsonb_exists("customFields", ${id}::text)`;
    await tx.customField.delete({ where: { id } });
  });
}
