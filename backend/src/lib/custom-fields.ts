import type { CustomField, Prisma } from "../generated/prisma/client";
import { AppError, fieldError } from "./app-error";
import { escapeWildcards } from "./list-query";
import { z } from "./openapi";
import { prisma } from "./prisma";
import { daySchema } from "./record-fields";

// Custom fields (CF-01 to CF-03): what the four record services share. An Admin defines the
// fields (modules/custom-fields); a record keeps its values in the JSON column
// `customFields`, keyed by the field's id:
//
//   TEXT      a string, trimmed, up to 500 characters
//   NUMBER    a JSON number
//   DATE      a day as a string, "2026-11-15"
//   DROPDOWN  one of the field's options, as a string
//
// A field without a value has no key in the column. The values of an archived field stay
// in the column, but no response shows them and no request can set or filter on them.

export const customFieldRecordTypeSchema = z
  .enum(["LEAD", "CONTACT", "COMPANY", "OPPORTUNITY"])
  .openapi("CustomFieldRecordType");

export type CustomFieldRecordType = z.infer<typeof customFieldRecordTypeSchema>;

export const customFieldTypeSchema = z
  .enum(["TEXT", "NUMBER", "DATE", "DROPDOWN"])
  .openapi("CustomFieldType");

export const CUSTOM_TEXT_MAX_LENGTH = 500;
// Far inside what a JSON number holds exactly.
const NUMBER_LIMIT = 1_000_000_000_000_000;

// A record's custom field values in a response: one key for every field of its type that is
// not archived, in no particular order, and null where the record has no value.
export const customFieldValuesSchema = z
  .record(z.string(), z.union([z.string(), z.number()]).nullable())
  .openapi("CustomFieldValues");

export type CustomFieldValues = z.infer<typeof customFieldValuesSchema>;

// The same object in a create or PATCH body. On PATCH only the keys sent are changed, and
// null (or an empty string) clears a value. The rules of each field are checked in the
// service, which knows the fields.
export const customFieldInputSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.null()]))
  .optional();

export type CustomFieldInput = Record<string, string | number | null>;

// What the JSON column holds.
export type StoredCustomFields = Record<string, string | number>;

// The part of a field the rules below need. A Prisma `CustomField` fits.
export type CustomFieldRules = Pick<CustomField, "id" | "label" | "type" | "options" | "required">;

// The fields of one record type that are in use, in the order the Admin gave them.
export function listActiveCustomFields(recordType: CustomFieldRecordType): Promise<CustomField[]> {
  return prisma.customField.findMany({
    where: { recordType, archived: false },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

// The JSON column as the object it is. Anything unexpected in it is left out.
export function storedCustomFields(column: Prisma.JsonValue): StoredCustomFields {
  if (column === null || typeof column !== "object" || Array.isArray(column)) {
    return {};
  }
  const values: StoredCustomFields = {};
  for (const [id, value] of Object.entries(column)) {
    if (typeof value === "string" || typeof value === "number") {
      values[id] = value;
    }
  }
  return values;
}

// What a response shows: every active field, with null where there is no value. A dropdown
// value whose option was removed later is still shown as it was stored.
export function toApiCustomFields(
  fields: CustomFieldRules[],
  column: Prisma.JsonValue,
): CustomFieldValues {
  const stored = storedCustomFields(column);
  return Object.fromEntries(fields.map((field) => [field.id, stored[field.id] ?? null]));
}

export interface CustomFieldProblem {
  fieldId: string;
  message: string;
}

// One value against its field's rules: the value to store, or what is wrong with it.
// `kept` is the value the record already has: a dropdown value whose option was removed
// stays acceptable, so a form that sends every field back unchanged still saves.
function checkValue(
  field: CustomFieldRules,
  value: string | number,
  kept: string | number | undefined,
): { value: string | number } | { problem: string } {
  switch (field.type) {
    case "TEXT": {
      if (typeof value !== "string") {
        return { problem: "Enter text" };
      }
      return value.length > CUSTOM_TEXT_MAX_LENGTH
        ? { problem: `Use at most ${String(CUSTOM_TEXT_MAX_LENGTH)} characters` }
        : { value };
    }
    case "NUMBER": {
      return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= NUMBER_LIMIT
        ? { value }
        : { problem: "Enter a number" };
    }
    case "DATE": {
      return typeof value === "string" && daySchema.safeParse(value).success
        ? { value }
        : { problem: "Enter a date such as 2026-11-15" };
    }
    case "DROPDOWN": {
      return typeof value === "string" && (field.options.includes(value) || value === kept)
        ? { value }
        : { problem: "Choose one of the options" };
    }
  }
}

// Checks the values a request sends against the fields. `current` is what the record holds
// now, or null for a record that is being created. Returns the changes to make (null clears
// a value) and every problem found. Pure, so the import can check thousands of rows against
// one read of the fields.
//
// `required` is checked on create, and on a change only for the keys that are sent: a field
// that became required later never blocks an edit of something else.
export function checkCustomFieldValues(
  fields: CustomFieldRules[],
  input: CustomFieldInput,
  current: StoredCustomFields | null,
): { changes: CustomFieldInput; problems: CustomFieldProblem[] } {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const changes: CustomFieldInput = {};
  const problems: CustomFieldProblem[] = [];

  for (const [fieldId, raw] of Object.entries(input)) {
    const field = byId.get(fieldId);
    if (!field) {
      problems.push({ fieldId, message: "This is not a custom field of this kind of record" });
      continue;
    }
    const sent = typeof raw === "string" ? raw.trim() : raw;
    if (sent === null || sent === "") {
      if (field.required) {
        problems.push({ fieldId, message: "This field is required" });
      } else {
        changes[fieldId] = null;
      }
      continue;
    }
    const checked = checkValue(field, sent, current?.[fieldId]);
    if ("problem" in checked) {
      problems.push({ fieldId, message: checked.problem });
    } else {
      changes[fieldId] = checked.value;
    }
  }

  if (current === null) {
    for (const field of fields) {
      if (field.required && !(field.id in input)) {
        problems.push({ fieldId: field.id, message: "This field is required" });
      }
    }
  }
  return { changes, problems };
}

// The stored values with the changes applied.
export function applyCustomFieldChanges(
  stored: StoredCustomFields,
  changes: CustomFieldInput,
): StoredCustomFields {
  const next: StoredCustomFields = {};
  for (const [fieldId, value] of Object.entries({ ...stored, ...changes })) {
    if (value !== null) {
      next[fieldId] = value;
    }
  }
  return next;
}

function assertNoProblems(problems: CustomFieldProblem[]): void {
  if (problems.length > 0) {
    throw new AppError(
      "VALIDATION_FAILED",
      400,
      "Request validation failed",
      problems.map(({ fieldId, message }) => ({ path: `customFields.${fieldId}`, message })),
    );
  }
}

// For a create: the column for the new record. Throws VALIDATION_FAILED naming
// `customFields.<field id>` for every value that breaks a rule and every required field
// that is missing.
export function customFieldsForCreate(
  fields: CustomFieldRules[],
  input: CustomFieldInput | undefined,
): StoredCustomFields {
  const { changes, problems } = checkCustomFieldValues(fields, input ?? {}, null);
  assertNoProblems(problems);
  return applyCustomFieldChanges({}, changes);
}

// For a PATCH: the column with the sent keys merged in, or undefined (leave the column
// alone) when the request sent no custom fields.
export async function customFieldsForUpdate(
  recordType: CustomFieldRecordType,
  column: Prisma.JsonValue,
  input: CustomFieldInput | undefined,
): Promise<StoredCustomFields | undefined> {
  if (input === undefined) {
    return undefined;
  }
  const stored = storedCustomFields(column);
  const fields = await listActiveCustomFields(recordType);
  const { changes, problems } = checkCustomFieldValues(fields, input, stored);
  assertNoProblems(problems);
  return applyCustomFieldChanges(stored, changes);
}

// Filtering a list by custom field values (CF-03). The query string says
//
//   cf.<field id>=text         TEXT: contains, whatever the case. DROPDOWN: is exactly.
//   cf.<field id>.min=10       NUMBER: at least        cf.<field id>.max=20   at most
//   cf.<field id>.from=<day>   DATE: on or after       cf.<field id>.to=<day> on or before
//
// A record without a value for the field never matches.

const FILTER_KEY = /^cf\.([^.]+)(?:\.(min|max|from|to))?$/;
const FILTER_HELP =
  "Use cf.<field id>=value, cf.<field id>.min / .max for a number, or .from / .to for a date";

export interface CustomFieldFilter {
  // The query parameter as it was sent, for error messages.
  key: string;
  fieldId: string;
  op: "is" | "min" | "max" | "from" | "to";
  value: string;
}

// The custom field filters in a query string (`req.query`), checked for shape only. A
// parameter that is sent empty is ignored, like a filter box that was cleared.
export function parseCustomFieldFilters(query: Record<string, unknown>): CustomFieldFilter[] {
  const filters: CustomFieldFilter[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith("cf.")) {
      continue;
    }
    const match = FILTER_KEY.exec(key);
    const fieldId = match?.[1];
    if (!fieldId || !z.uuid().safeParse(fieldId).success) {
      throw fieldError(key, FILTER_HELP);
    }
    if (typeof value !== "string" || value.length > 100) {
      throw fieldError(key, "Send one value of at most 100 characters");
    }
    if (value.trim() !== "") {
      const op = (match[2] ?? "is") as CustomFieldFilter["op"];
      filters.push({ key, fieldId, op, value: value.trim() });
    }
  }
  return filters;
}

// The Prisma `where` fragments for those filters, for a model with the `customFields`
// column. The field id is only ever used after it matched a real, active field of this
// record type, and Prisma sends it and the value to PostgreSQL as parameters.
export function customFieldWhere(
  fields: Pick<CustomField, "id" | "type">[],
  filters: CustomFieldFilter[],
): { customFields: Prisma.JsonFilter }[] {
  return filters.map(({ key, fieldId, op, value }) => {
    const field = fields.find((candidate) => candidate.id === fieldId);
    if (!field) {
      throw fieldError(key, "This is not a custom field of this kind of record");
    }
    const path = [field.id];
    switch (field.type) {
      case "TEXT": {
        if (op !== "is") {
          throw fieldError(key, "Filter a text field with cf.<field id>=text");
        }
        const contains = { string_contains: escapeWildcards(value), mode: "insensitive" } as const;
        return { customFields: { path, ...contains } };
      }
      case "DROPDOWN": {
        if (op !== "is") {
          throw fieldError(key, "Filter a dropdown field with cf.<field id>=option");
        }
        return { customFields: { path, equals: value } };
      }
      case "NUMBER": {
        const number = Number(value);
        if (op !== "min" && op !== "max") {
          throw fieldError(key, "Filter a number field with cf.<field id>.min and .max");
        }
        if (!Number.isFinite(number)) {
          throw fieldError(key, "Enter a number");
        }
        return { customFields: { path, ...(op === "min" ? { gte: number } : { lte: number }) } };
      }
      case "DATE": {
        if (op !== "from" && op !== "to") {
          throw fieldError(key, "Filter a date field with cf.<field id>.from and .to");
        }
        if (!daySchema.safeParse(value).success) {
          throw fieldError(key, "Enter a date such as 2026-11-15");
        }
        return { customFields: { path, ...(op === "from" ? { gte: value } : { lte: value }) } };
      }
    }
  });
}
