import { browserTimeZone } from "@/lib/time-zone";

import { http } from "./http";

// A file the API answered with: its bytes, the name the API gave it, and whether the list
// was longer than an export holds (`X-Export-Truncated`; always false for other files).
export type DownloadedFile = { blob: Blob; filename: string; truncated: boolean };

// A list or a long document can take a while to write out as a file; the usual 10 seconds
// are for JSON.
const EXPORT_TIMEOUT_MS = 60_000;

// Downloads a file the API makes, such as the PDF of a quote: `path` is `/quotes/<id>/pdf`.
// The viewer's time zone is added, which some files depend on (a quote's status). The file is
// fetched instead of linked to, so a refusal arrives as an ApiError the caller can show, and
// the name comes from the API's Content-Disposition header.
export async function downloadFile(
  path: string,
  params: Record<string, unknown>,
  fallbackName: string,
): Promise<DownloadedFile> {
  const response = await http.get<Blob>(path, {
    params: { ...params, tz: browserTimeZone() },
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

// Downloads the CSV export of a list: `path` is `/leads/export`, `query` the list's own
// query. The page and its size are left out (an export is every match, not one page).
export function downloadExport(
  path: string,
  query: object,
  fallbackName: string,
): Promise<DownloadedFile> {
  const params: Record<string, unknown> = { ...query };
  delete params.page;
  delete params.pageSize;
  return downloadFile(path, params, fallbackName);
}
