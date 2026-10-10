import { http } from "@/lib/api/http";

import type {
  ImportField,
  ImportFieldsResponse,
  ImportInput,
  ImportPreview,
  ImportPreviewResponse,
  ImportResponse,
  ImportResult,
  ImportType,
} from "./imports.types";

// A file of 5 MB takes longer to send, and 5,000 rows longer to save, than the usual
// 10 seconds allow.
const PREVIEW_TIMEOUT_MS = 60_000;
const IMPORT_TIMEOUT_MS = 300_000;

// The fields a column can be mapped to. A Read-only user gets FORBIDDEN on all three routes.
export async function listImportFields(type: ImportType): Promise<ImportField[]> {
  const response = await http.get<ImportFieldsResponse>("/imports/fields", { params: { type } });
  return response.data.data;
}

// Reads the file without saving anything: its columns, its first rows, how many rows it
// has, and which field each column looks like. `csv` is the text of the file.
export async function previewImport(type: ImportType, csv: string): Promise<ImportPreview> {
  const response = await http.post<ImportPreviewResponse>(
    "/imports/preview",
    { type, csv },
    { timeout: PREVIEW_TIMEOUT_MS },
  );
  return response.data.data;
}

// Imports the file. The rows that pass are saved; the rest come back with the reason.
export async function runImport(input: ImportInput): Promise<ImportResult> {
  const response = await http.post<ImportResponse>("/imports", input, {
    timeout: IMPORT_TIMEOUT_MS,
  });
  return response.data.data;
}
