import type { ImportField, ImportType } from "./imports.types";

// The record types that can be imported, in the order of the page's choices.
export const IMPORT_TYPES = ["LEAD", "CONTACT", "COMPANY"] as const;

// How each is named: on a button ("Leads"), in a sentence and in the address ("leads"),
// for one record ("lead"), and what "skip duplicates" compares.
export const IMPORT_TYPE_WORDS: Record<
  ImportType,
  { label: string; plural: string; singular: string; duplicateBy: string }
> = {
  LEAD: { label: "Leads", plural: "leads", singular: "lead", duplicateBy: "email" },
  CONTACT: { label: "Contacts", plural: "contacts", singular: "contact", duplicateBy: "email" },
  COMPANY: { label: "Companies", plural: "companies", singular: "company", duplicateBy: "name" },
};

export const importTypeOptions = IMPORT_TYPES.map((value) => ({
  value,
  label: IMPORT_TYPE_WORDS[value].label,
}));

// /import?type=contacts -> CONTACT. Anything else is leads.
export function importTypeFromAddress(named: string | null): ImportType {
  return IMPORT_TYPES.find((type) => IMPORT_TYPE_WORDS[type].plural === named) ?? "LEAD";
}

// The API's limits on a file, repeated here so the page can say them before the upload.
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_ROWS = 5000;

// One cell of a CSV file: quoted when it holds a comma, a quote or a line break.
function csvCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// An empty file to fill in: one row with the name of every field, which the import then
// recognises on its own. It starts with a byte order mark, as Excel needs for UTF-8.
export function importTemplate(fields: ImportField[]): string {
  return `\uFEFF${fields.map((field) => csvCell(field.label)).join(",")}\r\n`;
}

// "12 KB", "3.4 MB"
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "1 row", "248 rows"
export function rowCount(count: number): string {
  return count === 1 ? "1 row" : `${count.toLocaleString("en-US")} rows`;
}
