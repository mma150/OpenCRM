import { type DownloadedFile, downloadExport } from "@/lib/api/download";
import { http } from "@/lib/api/http";

import type {
  ActivityAuthor,
  ActivityAuthorsResponse,
  ActivityList,
  ActivityListQuery,
  ActivityResponse,
} from "./activity.types";

// One page of what the team did, newest first. Admin, Sales Manager and Read-only; the API
// answers FORBIDDEN to a Sales Rep. `summary` counts the whole filtered range.
export async function listActivity(query: ActivityListQuery): Promise<ActivityList> {
  const response = await http.get<ActivityResponse>("/activity", { params: query });
  return { entries: response.data.data, ...response.data.meta };
}

// The feed as a CSV file: every entry the same person, dates and type match, not one page.
// `downloadExport` leaves out the page and adds the time zone.
export function exportActivity(query: ActivityListQuery): Promise<DownloadedFile> {
  return downloadExport("/activity/export", query, "activity.csv");
}

// The people the signed-in user may filter the feed by.
export async function listActivityAuthors(): Promise<ActivityAuthor[]> {
  const response = await http.get<ActivityAuthorsResponse>("/activity/authors");
  return response.data.data;
}
