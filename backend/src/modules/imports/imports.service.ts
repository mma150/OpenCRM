import type { CustomField, Prisma } from "../../generated/prisma/client";
import { AppError, fieldError } from "../../lib/app-error";
import { CsvError, parseCsv, restoreFormula, writeSpreadsheetCsv } from "../../lib/csv";
import { enumLabel } from "../../lib/csv-export";
import {
  applyCustomFieldChanges,
  checkCustomFieldValues,
  type CustomFieldInput,
  listActiveCustomFields,
  type StoredCustomFields,
} from "../../lib/custom-fields";
import { escapeWildcards } from "../../lib/list-query";
import { logger } from "../../lib/logger";
import type { z } from "../../lib/openapi";
import { prisma } from "../../lib/prisma";
import { type Actor, assertCanWrite, visibleLiveRecords } from "../../lib/record-access";
import { assertAssignable } from "../../lib/record-owner";
import { addCreatedEntries, addTimelineEntry, type RecordType } from "../../lib/timeline";
import {
  companyNameSchema,
  type CreateCompanyBody,
  createCompanyBodySchema,
} from "../companies/companies.schema";
import { type CreateContactBody, createContactBodySchema } from "../contacts/contacts.schema";
import { type CreateLeadBody, createLeadBodySchema, leadSourceSchema } from "../leads/leads.schema";
import {
  IMPORT_BATCH_SIZE,
  IMPORT_ERROR_LIMIT,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportBody,
  type ImportField,
  type ImportPreview,
  type ImportPreviewBody,
  type ImportResult,
  type ImportRowError,
  type ImportType,
} from "./imports.schema";

// CSV import (DATA-01, DATA-02). The browser reads the file and sends its text; the user
// maps its columns to fields; every row is then checked with the rules of the record's own
// create route and saved or reported on its own, so one bad row never loses the good ones.

// ---------------------------------------------------------------------------------------
// The fields a column can be mapped to

// A field with the other names a column for it commonly has, for the suggested mapping.
interface TargetField extends ImportField {
  names: string[];
}

// Contacts only: not a column of the contact but the name of its company.
const COMPANY_NAME = "companyName";
const CUSTOM_PREFIX = "cf:";

const NAMES = {
  firstName: ["first", "given name", "forename"],
  lastName: ["last", "surname", "family name"],
  company: ["company name", "organisation", "organization", "account", "employer"],
  jobTitle: ["title", "position", "role"],
  email: ["e-mail", "email address", "mail", "work email"],
  phone: ["phone number", "telephone", "tel", "mobile", "mobile number", "cell"],
  notes: ["note", "comments", "comment", "description"],
};

function text(key: string, label: string, names: string[], required = false): TargetField {
  return { key, label, required, kind: "TEXT", names };
}

const EMAIL: TargetField = {
  key: "email",
  label: "Email",
  required: false,
  kind: "EMAIL",
  names: NAMES.email,
};
const PHONE = text("phone", "Phone", NAMES.phone);
const JOB_TITLE = text("jobTitle", "Job title", NAMES.jobTitle);
const NOTES = text("notes", "Notes", NAMES.notes);

const RECORD_FIELDS: Record<ImportType, TargetField[]> = {
  LEAD: [
    text("firstName", "First name", NAMES.firstName, true),
    text("lastName", "Last name", NAMES.lastName, true),
    text("company", "Company", NAMES.company),
    JOB_TITLE,
    EMAIL,
    PHONE,
    {
      key: "source",
      label: "Source",
      // The create route needs a source; a row without one is given OTHER.
      required: false,
      kind: "DROPDOWN",
      options: [...leadSourceSchema.options],
      names: ["lead source"],
    },
    {
      key: "estimatedValue",
      label: "Estimated value",
      required: false,
      kind: "NUMBER",
      names: ["value", "deal value", "amount", "budget"],
    },
    NOTES,
  ],
  CONTACT: [
    text("firstName", "First name", NAMES.firstName, true),
    text("lastName", "Last name", NAMES.lastName, true),
    JOB_TITLE,
    EMAIL,
    PHONE,
    text(COMPANY_NAME, "Company name", ["company", ...NAMES.company]),
    NOTES,
  ],
  COMPANY: [
    text("name", "Name", ["company", ...NAMES.company], true),
    text("website", "Website", ["url", "web", "site", "domain"]),
    text("industry", "Industry", ["sector"]),
    PHONE,
    text("address", "Address", ["location"]),
    NOTES,
  ],
};

function customFieldId(field: ImportField): string | null {
  return field.key.startsWith(CUSTOM_PREFIX) ? field.key.slice(CUSTOM_PREFIX.length) : null;
}

function targetFields(type: ImportType, customFields: CustomField[]): TargetField[] {
  const custom = customFields.map((field): TargetField => ({
    key: `${CUSTOM_PREFIX}${field.id}`,
    label: field.label,
    required: field.required,
    kind: field.type,
    ...(field.type === "DROPDOWN" ? { options: field.options } : {}),
    names: [],
  }));
  return [...RECORD_FIELDS[type], ...custom];
}

function toImportField({ key, label, required, kind, options }: TargetField): ImportField {
  return { key, label, required, kind, ...(options ? { options } : {}) };
}

// The custom fields of contacts, companies and leads are those record types' own.
export async function listImportFields(type: ImportType): Promise<ImportField[]> {
  const fields = targetFields(type, await listActiveCustomFields(type));
  return fields.map((field) => toImportField(field));
}

// ---------------------------------------------------------------------------------------
// Reading the file

interface DataRow {
  // The row's number as a spreadsheet shows it: the header row is 1.
  row: number;
  cells: string[];
}

interface CsvFile {
  headers: string[];
  rows: DataRow[];
}

function isBlank(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

// A name as people would call it the same: "E-mail", "e mail" and "EMAIL" are one.
function normalise(name: string): string {
  return name.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, "");
}

// The header row and the data rows of the file, or the reason it cannot be imported.
function readFile(csv: string): CsvFile {
  if (Buffer.byteLength(csv, "utf8") > IMPORT_MAX_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", 413, "The file is larger than 5 MB");
  }
  let records: string[][];
  try {
    records = parseCsv(csv);
  } catch (error) {
    if (error instanceof CsvError) {
      throw fieldError("csv", "The file is not valid CSV: a quoted cell is never closed");
    }
    throw error;
  }
  if (records.every((cells) => isBlank(cells))) {
    throw fieldError("csv", "The file is empty");
  }

  const headers = (records[0] ?? []).map((header) => header.trim());
  // Spreadsheets sometimes write empty cells after the last column.
  while (headers.at(-1) === "") {
    headers.pop();
  }
  if (headers.length === 0) {
    throw fieldError("csv", "The first row must hold the column names");
  }
  const seen = new Set<string>();
  for (const [index, header] of headers.entries()) {
    if (header === "") {
      throw fieldError("csv", `Column ${String(index + 1)} has no name in the first row`);
    }
    if (seen.has(header.toLowerCase())) {
      throw fieldError("csv", `The column "${header}" appears more than once`);
    }
    seen.add(header.toLowerCase());
  }

  const rows = records
    .map((cells, index) => ({ row: index + 1, cells }))
    .slice(1)
    .filter(({ cells }) => !isBlank(cells));
  if (rows.length === 0) {
    throw fieldError("csv", "The file has no rows below the column names");
  }
  if (rows.length > IMPORT_MAX_ROWS) {
    throw fieldError(
      "csv",
      `The file has ${String(rows.length)} rows; import at most ${String(IMPORT_MAX_ROWS)} at a time`,
    );
  }
  return { headers, rows };
}

// For each header, the field it names: by the field's label or one of its other names.
// A field is suggested once, for the first column that fits.
function suggestMapping(headers: string[], fields: TargetField[]): Record<string, string | null> {
  const taken = new Set<string>();
  return Object.fromEntries(
    headers.map((header) => {
      const name = normalise(header);
      const match = fields.find(
        (field) =>
          !taken.has(field.key) &&
          [field.label, field.key, ...field.names].some((known) => normalise(known) === name),
      );
      if (match) {
        taken.add(match.key);
      }
      return [header, match?.key ?? null];
    }),
  );
}

// DATA-01: what the mapping step shows. Nothing is saved.
export async function previewImport(input: ImportPreviewBody): Promise<ImportPreview> {
  const file = readFile(input.csv);
  const fields = targetFields(input.type, await listActiveCustomFields(input.type));
  return {
    headers: file.headers,
    sampleRows: file.rows
      .slice(0, 5)
      .map(({ cells }) => file.headers.map((_, index) => cells[index] ?? "")),
    rowCount: file.rows.length,
    suggestedMapping: suggestMapping(file.headers, fields),
  };
}

// ---------------------------------------------------------------------------------------
// The mapping

// A column of the file that is imported, and the field it goes to.
interface Column {
  index: number;
  header: string;
  field: TargetField;
}

// The columns the mapping imports. Every problem with the mapping is reported together, as
// VALIDATION_FAILED on `mapping.<header>` (or on `mapping` for a required field left out).
function mappedColumns(
  headers: string[],
  fields: TargetField[],
  mapping: Record<string, string | null>,
): Column[] {
  const columns: Column[] = [];
  const problems: { path: string; message: string }[] = [];

  for (const [header, key] of Object.entries(mapping)) {
    const path = `mapping.${header}`;
    const index = headers.indexOf(header);
    if (index === -1) {
      problems.push({ path, message: "The file has no column with this name" });
      continue;
    }
    if (key === null) {
      continue;
    }
    const field = fields.find((candidate) => candidate.key === key);
    const earlier = columns.find((column) => column.field.key === key);
    if (!field) {
      problems.push({ path, message: "This is not a field that can be imported" });
    } else if (earlier) {
      const message = `"${field.label}" is already mapped to the column "${earlier.header}"`;
      problems.push({ path, message });
    } else {
      columns.push({ index, header, field });
    }
  }
  for (const field of fields) {
    if (field.required && !columns.some((column) => column.field.key === field.key)) {
      problems.push({ path: "mapping", message: `Map a column to "${field.label}"` });
    }
  }
  if (problems.length > 0) {
    throw new AppError("VALIDATION_FAILED", 400, "Request validation failed", problems);
  }
  return columns;
}

// ---------------------------------------------------------------------------------------
// Checking a row

type Message = ImportRowError["messages"][number];

// A row that passed every check and is ready to be saved.
interface ReadyRow<Data> extends DataRow {
  data: Data;
  customFields: StoredCustomFields;
  // Contacts only: the company the row names, if any.
  companyName: string | null;
}

interface FailedRow extends DataRow {
  messages: Message[];
}

// "1200", "1200.50" and "1,200.50". Anything else ("1,5", "12k") is refused rather than
// guessed at.
function parseNumber(cell: string): number | null {
  if (!/^-?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/.test(cell)) {
    return null;
  }
  return Number(cell.replaceAll(",", ""));
}

// The value of one cell for its field, or what is wrong with it. Text, emails and dates
// pass through: the create schema and the custom field rules check them.
function readCell(
  field: TargetField,
  cell: string,
): { value: string | number } | { problem: string } {
  if (field.kind === "NUMBER") {
    const number = parseNumber(cell);
    return number === null ? { problem: "Enter a number such as 1200.50" } : { value: number };
  }
  if (field.kind === "DROPDOWN" && field.options) {
    const option = field.options.find((candidate) => normalise(candidate) === normalise(cell));
    if (option === undefined) {
      const choices = field.key === "source" ? field.options.map(enumLabel) : field.options;
      return { problem: `Use one of: ${choices.join(", ")}` };
    }
    return { value: option };
  }
  return { value: cell };
}

// Checks one row: each mapped cell for its field, then the record as a whole with the
// create route's own schema and the custom field rules.
function checkRow<Data>(
  type: ImportType,
  schema: z.ZodType<Data>,
  columns: Column[],
  customFields: CustomField[],
  headerCount: number,
  { row, cells }: DataRow,
): ReadyRow<Data> | FailedRow {
  const messages: Message[] = [];
  const record: Record<string, string | number> = {};
  const custom: CustomFieldInput = {};
  let companyName: string | null = null;

  if (cells.slice(headerCount).some((cell) => cell.trim() !== "")) {
    const message = "This row has more cells than there are columns";
    messages.push({ field: null, column: null, message });
  }
  if (cells.some((cell) => cell.includes("\u0000"))) {
    messages.push({ field: null, column: null, message: "Remove the NUL characters" });
  }

  for (const { index, header, field } of columns) {
    // Undo the apostrophe an export puts before "+44 ..." (lib/csv.ts).
    const cell = restoreFormula(cells[index] ?? "").trim();
    const customId = customFieldId(field);
    const isText = field.kind === "TEXT" || field.kind === "EMAIL";
    // An empty cell is no value. For a text field of the record it is passed on, so that
    // a missing name gets the create route's own message.
    if (cell === "" && (customId !== null || !isText || field.key === COMPANY_NAME)) {
      continue;
    }
    const read = readCell(field, cell);
    if ("problem" in read) {
      messages.push({ field: field.label, column: header, message: read.problem });
    } else if (customId !== null) {
      custom[customId] = read.value;
    } else if (field.key === COMPANY_NAME) {
      const name = companyNameSchema.safeParse(read.value);
      if (name.success) {
        companyName = name.data;
      } else {
        const message = name.error.issues[0]?.message ?? "Enter a company name";
        messages.push({ field: field.label, column: header, message });
      }
    } else {
      record[field.key] = read.value;
    }
  }
  if (type === "LEAD" && !("source" in record)) {
    record.source = "OTHER";
  }

  const columnOf = (key: string) => columns.find((column) => column.field.key === key);
  const parsed = schema.safeParse(record);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const column = columnOf(String(issue.path[0]));
      messages.push({
        field: column?.field.label ?? null,
        column: column?.header ?? null,
        message: issue.message,
      });
    }
  }
  const checked = checkCustomFieldValues(customFields, custom, null);
  for (const { fieldId, message } of checked.problems) {
    const column = columnOf(`${CUSTOM_PREFIX}${fieldId}`);
    messages.push({ field: column?.field.label ?? null, column: column?.header ?? null, message });
  }

  if (!parsed.success || messages.length > 0) {
    return { row, cells, messages };
  }
  const stored = applyCustomFieldChanges({}, checked.changes);
  return { row, cells, data: parsed.data, customFields: stored, companyName };
}

// ---------------------------------------------------------------------------------------
// Saving

interface Owned {
  ownerId: string;
  createdById: string;
}

type Created = { id: string; createdAt: Date }[];
const created = { id: true, createdAt: true } as const;

// What differs between the three record types.
interface Kind<Data> {
  type: ImportType;
  record: RecordType;
  schema: z.ZodType<Data>;
  // What makes two rows the same record for skipDuplicates; null when the row has none.
  duplicateKey: (data: Data) => string | null;
  // Which of these keys a record the caller may see already has.
  existingKeys: (actor: Actor, keys: string[]) => Promise<Set<string>>;
  insert: (
    tx: Prisma.TransactionClient,
    rows: (ReadyRow<Data> & { companyId: string | null })[],
    owned: Owned,
  ) => Promise<Created>;
}

function chunks<Item>(items: Item[], size: number): Item[][] {
  const result: Item[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

// The companies the caller may see that have one of these names, whatever the case: the
// name in lower case to the company's id. Of two companies with one name, the older wins.
async function findCompaniesByName(actor: Actor, names: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const chunk of chunks([...new Set(names)], 200)) {
    const companies = await prisma.company.findMany({
      where: {
        AND: [
          visibleLiveRecords(actor),
          {
            OR: chunk.map((name) => ({
              name: { equals: escapeWildcards(name), mode: "insensitive" as const },
            })),
          },
        ],
      },
      select: { id: true, name: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const company of companies) {
      const key = company.name.toLowerCase();
      if (!found.has(key)) {
        found.set(key, company.id);
      }
    }
  }
  return found;
}

// Emails are stored in lower case, so the comparison is exact.
async function existingEmails(
  emails: string[],
  find: (where: { email: { in: string[] } }) => Promise<{ email: string | null }[]>,
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const chunk of chunks(emails, 1000)) {
    for (const { email } of await find({ email: { in: chunk } })) {
      if (email) {
        found.add(email);
      }
    }
  }
  return found;
}

const leadKind: Kind<CreateLeadBody> = {
  type: "LEAD",
  record: "lead",
  schema: createLeadBodySchema,
  duplicateKey: (data) => data.email ?? null,
  existingKeys: (actor, keys) =>
    existingEmails(keys, (where) =>
      prisma.lead.findMany({
        where: { ...visibleLiveRecords(actor), ...where },
        select: { email: true },
      }),
    ),
  insert: (tx, rows, owned) =>
    tx.lead.createManyAndReturn({
      data: rows.map(({ data, customFields }) => ({ ...data, customFields, ...owned })),
      select: created,
    }),
};

const contactKind: Kind<CreateContactBody> = {
  type: "CONTACT",
  record: "contact",
  schema: createContactBodySchema,
  duplicateKey: (data) => data.email ?? null,
  existingKeys: (actor, keys) =>
    existingEmails(keys, (where) =>
      prisma.contact.findMany({
        where: { ...visibleLiveRecords(actor), ...where },
        select: { email: true },
      }),
    ),
  insert: (tx, rows, owned) =>
    tx.contact.createManyAndReturn({
      data: rows.map(({ data, customFields, companyId }) => ({
        ...data,
        customFields,
        companyId,
        ...owned,
      })),
      select: created,
    }),
};

const companyKind: Kind<CreateCompanyBody> = {
  type: "COMPANY",
  record: "company",
  schema: createCompanyBodySchema,
  duplicateKey: (data) => data.name.toLowerCase(),
  existingKeys: async (actor, keys) => new Set((await findCompaniesByName(actor, keys)).keys()),
  insert: (tx, rows, owned) =>
    tx.company.createManyAndReturn({
      data: rows.map(({ data, customFields }) => ({ ...data, customFields, ...owned })),
      select: created,
    }),
};

// One line for the "Error" column of the failed rows file.
function errorText(messages: Message[]): string {
  return messages
    .map(({ field, message }) => (field ? `${field}: ${message}` : message))
    .join("; ");
}

// The failed rows as a file to correct and import again: the file's own columns, and the
// reason in a column called "Error" (reused if the file has one, from an earlier attempt).
function failedRowsCsv(headers: string[], failures: FailedRow[]): string {
  const existing = headers.findIndex((header) => normalise(header) === "error");
  const errorIndex = existing === -1 ? headers.length : existing;
  const rows = failures.map(({ cells, messages }) => {
    const row = headers.map((_, index) => cells[index] ?? "");
    row[errorIndex] = errorText(messages);
    return row;
  });
  return writeSpreadsheetCsv([existing === -1 ? [...headers, "Error"] : headers, ...rows]);
}

async function importRecords<Data>(
  kind: Kind<Data>,
  actor: Actor,
  input: ImportBody,
): Promise<ImportResult> {
  assertCanWrite(actor);
  const owned: Owned = { ownerId: input.ownerId ?? actor.id, createdById: actor.id };
  await assertAssignable(actor, owned.ownerId, "records");

  const file = readFile(input.csv);
  const customFields = await listActiveCustomFields(kind.type);
  const fields = targetFields(kind.type, customFields);
  const columns = mappedColumns(file.headers, fields, input.mapping);

  let ready: ReadyRow<Data>[] = [];
  const failures: FailedRow[] = [];
  for (const row of file.rows) {
    const checked = checkRow(
      kind.type,
      kind.schema,
      columns,
      customFields,
      file.headers.length,
      row,
    );
    if ("messages" in checked) {
      failures.push(checked);
    } else {
      ready.push(checked);
    }
  }

  // A contact's company: one the caller may see with that name, or else a new one.
  const companyColumn = columns.find((column) => column.field.key === COMPANY_NAME);
  const companyNames = ready.flatMap((row) => (row.companyName ? [row.companyName] : []));
  const companyIds = await findCompaniesByName(actor, companyNames);
  if (input.createCompanies === false) {
    const known = (row: ReadyRow<Data>) =>
      row.companyName === null || companyIds.has(row.companyName.toLowerCase());
    for (const row of ready.filter((candidate) => !known(candidate))) {
      const message = `No company called "${row.companyName ?? ""}" was found`;
      const field = companyColumn?.field.label ?? null;
      const column = companyColumn?.header ?? null;
      failures.push({ row: row.row, cells: row.cells, messages: [{ field, column, message }] });
    }
    ready = ready.filter((row) => known(row));
  }

  let skipped = 0;
  if (input.skipDuplicates) {
    const keys = ready.flatMap((row) => kind.duplicateKey(row.data) ?? []);
    const taken = await kind.existingKeys(actor, [...new Set(keys)]);
    ready = ready.filter((row) => {
      const key = kind.duplicateKey(row.data);
      if (key === null) {
        return true;
      }
      if (taken.has(key)) {
        skipped += 1;
        return false;
      }
      // A later row with the same key is a duplicate of this one.
      taken.add(key);
      return true;
    });
  }

  // One transaction per batch: its records, the companies they need and the CREATED entry
  // of each, all or none.
  let companiesCreated = 0;
  const saveBatch = async (rows: ReadyRow<Data>[]): Promise<void> => {
    const newCompanies = new Map<string, string>();
    await prisma.$transaction(
      async (tx) => {
        const withCompany = [];
        for (const row of rows) {
          const key = row.companyName?.toLowerCase();
          let companyId = key ? (companyIds.get(key) ?? newCompanies.get(key)) : undefined;
          if (row.companyName && key && !companyId) {
            const company = await tx.company.create({ data: { name: row.companyName, ...owned } });
            await addTimelineEntry(tx, {
              kind: "CREATED",
              authorId: actor.id,
              record: { type: "company", id: company.id },
              occurredAt: company.createdAt,
              details: { import: true },
            });
            newCompanies.set(key, company.id);
            companyId = company.id;
          }
          withCompany.push({ ...row, companyId: companyId ?? null });
        }
        const records = await kind.insert(tx, withCompany, owned);
        await addCreatedEntries(tx, actor.id, kind.record, records, { import: true });
      },
      { timeout: 30_000 },
    );
    for (const [key, id] of newCompanies) {
      companyIds.set(key, id);
    }
    companiesCreated += newCompanies.size;
  };

  let createdCount = 0;
  for (const batch of chunks(ready, IMPORT_BATCH_SIZE)) {
    try {
      await saveBatch(batch);
      createdCount += batch.length;
    } catch (error) {
      // Something the checks did not foresee. The rows are tried one at a time, so only
      // the row at fault is lost. The error is logged by name only: its text can quote
      // the row.
      logger.warn(
        { error: error instanceof Error ? error.name : "unknown" },
        "import batch failed",
      );
      for (const row of batch) {
        try {
          await saveBatch([row]);
          createdCount += 1;
        } catch {
          const message = "This row could not be saved";
          failures.push({
            row: row.row,
            cells: row.cells,
            messages: [{ field: null, column: null, message }],
          });
        }
      }
    }
  }

  failures.sort((a, b) => a.row - b.row);
  return {
    total: file.rows.length,
    created: createdCount,
    skipped,
    failed: failures.length,
    companiesCreated,
    errors: failures.slice(0, IMPORT_ERROR_LIMIT).map(({ row, cells, messages }) => ({
      row,
      values: Object.fromEntries(file.headers.map((header, index) => [header, cells[index] ?? ""])),
      messages,
    })),
    errorsTruncated: failures.length > IMPORT_ERROR_LIMIT,
    failedCsv: failures.length > 0 ? failedRowsCsv(file.headers, failures) : null,
  };
}

// DATA-01 and DATA-02. Records belong to the caller, or to `ownerId` when the caller may
// assign records to that user (the rule of the create routes).
export function runImport(actor: Actor, input: ImportBody): Promise<ImportResult> {
  switch (input.type) {
    case "LEAD": {
      return importRecords(leadKind, actor, input);
    }
    case "CONTACT": {
      return importRecords(contactKind, actor, input);
    }
    case "COMPANY": {
      return importRecords(companyKind, actor, input);
    }
  }
}
