import type { Response } from "express";

import { type CsvValue, writeSpreadsheetCsv } from "./csv";
import type { CustomFieldRules, CustomFieldValues } from "./custom-fields";
import type { Page } from "./list-query";
import { dayIn } from "./time-zone";

// CSV export (DATA-03): what the export routes of the lists share. An export is the list
// itself, with the same search, filters, sort and visibility, without paging.

// The most rows one export holds. A list with more is cut off after this many, in the sort
// order asked for, and the response says so in the X-Export-Truncated header.
export const EXPORT_ROW_LIMIT = 10_000;

// The page window that reads a whole export.
export const exportWindow = { skip: 0, take: EXPORT_ROW_LIMIT };

export interface CsvExport {
  csv: string;
  // True when the list has more rows than the file.
  truncated: boolean;
}

// One column of an export: its header, and how to read its cell from a row.
export interface ExportColumn<Row> {
  header: string;
  value: (row: Row) => CsvValue;
}

export function buildCsvExport<Row>(columns: ExportColumn<Row>[], page: Page<Row>): CsvExport {
  const rows = [
    columns.map((column) => column.header),
    ...page.items.map((item) => columns.map((column) => column.value(item))),
  ];
  return { csv: writeSpreadsheetCsv(rows), truncated: page.total > page.items.length };
}

// One column per custom field in use, headed by its label, after the record's own columns.
export function customFieldColumns<Row extends { customFields: CustomFieldValues }>(
  fields: CustomFieldRules[],
): ExportColumn<Row>[] {
  return fields.map((field) => ({
    header: field.label,
    value: (row) => row.customFields[field.id] ?? null,
  }));
}

// "COLD_CALL" as people read it: "Cold call".
export function enumLabel(value: string): string {
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// An exact moment as a spreadsheet reads it, on the viewer's clock: "2026-11-15 14:30".
export function momentFormatter(timeZone: string): (moment: string | null) => string | null {
  // The Swedish format is year-month-day hour:minute.
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  });
  return (moment) => (moment === null ? null : format.format(new Date(moment)));
}

// Sends the file as a download named like "leads-2026-11-15.csv" (the viewer's today).
// A plain GET from a link works: the session cookie is all it needs.
export function sendCsv(res: Response, name: string, timeZone: string, file: CsvExport): void {
  const day = dayIn(timeZone, new Date());
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}-${day}.csv"`);
  res.setHeader("X-Export-Truncated", String(file.truncated));
  res.send(file.csv);
}
