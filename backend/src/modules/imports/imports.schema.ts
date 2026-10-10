import { envelope, z } from "../../lib/openapi";

// The record types a CSV file can be imported into (DATA-01).
export const importTypeSchema = z.enum(["LEAD", "CONTACT", "COMPANY"]).openapi("ImportType");

export type ImportType = z.infer<typeof importTypeSchema>;

// The largest file, measured as the UTF-8 bytes of its text, and the most data rows.
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
// The JSON body that carries the file. Higher than the file limit, because JSON writes
// every quote and line break of the file as two characters.
export const IMPORT_BODY_LIMIT = "12mb";
// The most failed rows a result lists in `errors`. `failedCsv` always holds all of them.
export const IMPORT_ERROR_LIMIT = 200;
// How many records one transaction writes.
export const IMPORT_BATCH_SIZE = 100;

// What a cell of a column must hold.
export const importFieldKindSchema = z
  .enum(["TEXT", "EMAIL", "NUMBER", "DATE", "DROPDOWN"])
  .openapi("ImportFieldKind");

// A field a column of the file can be mapped to.
export const importFieldSchema = z
  .object({
    // What a mapping names: "firstName", or "cf:<custom field id>" for a custom field.
    key: z.string(),
    label: z.string(),
    // A required field must have a column mapped to it, and a value in every row.
    required: z.boolean(),
    kind: importFieldKindSchema,
    // The values a DROPDOWN accepts, matched whatever the case.
    options: z.array(z.string()).optional(),
  })
  .openapi("ImportField");

export type ImportField = z.infer<typeof importFieldSchema>;

export const importFieldsQuerySchema = z.object({ type: importTypeSchema });

export const importPreviewBodySchema = z
  .strictObject({
    type: importTypeSchema,
    // The text of the file, as the browser read it.
    csv: z.string(),
  })
  .openapi("ImportPreviewBody");

export type ImportPreviewBody = z.infer<typeof importPreviewBodySchema>;

export const importPreviewSchema = z
  .object({
    // The column names from the first row of the file.
    headers: z.array(z.string()),
    // The first five data rows, each with one cell per header.
    sampleRows: z.array(z.array(z.string())),
    // The data rows in the file; empty rows are not counted.
    rowCount: z.number().int(),
    // For every header, the key of the field it looks like, or null.
    suggestedMapping: z.record(z.string(), z.string().nullable()),
  })
  .openapi("ImportPreview");

export type ImportPreview = z.infer<typeof importPreviewSchema>;

export const importBodySchema = z
  .strictObject({
    type: importTypeSchema,
    csv: z.string(),
    // Header to field key. A header mapped to null, or left out, is not imported.
    mapping: z.record(z.string(), z.string().nullable()),
    // Who owns the new records. Defaults to the caller; must be someone the caller may
    // assign records to.
    ownerId: z.uuid().optional(),
    // Leave out rows whose email (leads, contacts) or name (companies) a record the caller
    // may see already has, or an earlier row of the file. Defaults to false.
    skipDuplicates: z.boolean().optional(),
    // Contacts only: create a company for a "Company name" no visible company has.
    // Defaults to true; when false such a row fails.
    createCompanies: z.boolean().optional(),
  })
  .openapi("ImportBody");

export type ImportBody = z.infer<typeof importBodySchema>;

export const importRowErrorSchema = z
  .object({
    // The row's number as a spreadsheet shows it: the header row is 1, the first data row 2.
    row: z.number().int(),
    // The row as it was read: header to cell.
    values: z.record(z.string(), z.string()),
    messages: z.array(
      z.object({
        // The label of the field the problem is in ("Email"), and the header of the column
        // it was read from. Both null for a problem with the row as a whole.
        field: z.string().nullable(),
        column: z.string().nullable(),
        message: z.string(),
      }),
    ),
  })
  .openapi("ImportRowError");

export type ImportRowError = z.infer<typeof importRowErrorSchema>;

export const importResultSchema = z
  .object({
    // The data rows in the file: created + skipped + failed.
    total: z.number().int(),
    created: z.number().int(),
    // Rows left out by skipDuplicates.
    skipped: z.number().int(),
    failed: z.number().int(),
    // Contacts only: the companies made for a "Company name" that did not exist yet.
    companiesCreated: z.number().int(),
    // The failed rows in file order, at most 200; errorsTruncated says there are more.
    errors: z.array(importRowErrorSchema),
    errorsTruncated: z.boolean(),
    // A CSV file of every failed row with the file's own columns and an "Error" column
    // last, to correct and import again. null when no row failed.
    failedCsv: z.string().nullable(),
  })
  .openapi("ImportResult");

export type ImportResult = z.infer<typeof importResultSchema>;

export const importFieldsResponseSchema = envelope(z.array(importFieldSchema));
export const importPreviewResponseSchema = envelope(importPreviewSchema);
export const importResultResponseSchema = envelope(importResultSchema);
