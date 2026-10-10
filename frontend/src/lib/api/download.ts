import { browserTimeZone } from "@/lib/time-zone";

import { http } from "./http";

// A file the API answered with: its bytes, the name the API gave it, and whether the list
// was longer than an export holds (`X-Export-Truncated`).
export type DownloadedFile = { blob: Blob; filename: string; truncated: boolean };

// A list can take a while to write out as a file; the usual 10 seconds are for JSON.
const EXPORT_TIMEOUT_MS = 60_000;

// Downloads the CSV export of a list: `path` is `/leads/export`, `query` the list's own
// query. The page and its size are left out (an export is every match, not one page) and the
// viewer's time zone is added, which decides how times are written in the file. The file is
// fetched instead of linked to, so the caller can read the headers and show progress.
export async function downloadExport(
  path: string,
  query: object,
  fallbackName: string,
): Promise<DownloadedFile> {
  const params: Record<string, unknown> = { ...query, tz: browserTimeZone() };
  delete params.page;
  delete params.pageSize;

  const response = await http.get<Blob>(path, {
    params,
    responseType: "blob",
    timeout: EXPORT_TIMEOUT_MS,
  });
  const disposition: unknown = response.headers["content-disposition"];
  const named = typeof disposition === "string" ? /filename="([^"]+)"/.exec(disposition) : null;
  return {
    blob: response.data,
    filename: named?.[1] ?? fallbackName,
    truncated: response.headers["x-export-truncated"] === "true",
  };
}
