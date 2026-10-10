import { http } from "@/lib/api/http";

import type {
  ActivityAuthor,
  ActivityAuthorsResponse,
  ActivityList,
  ActivityListQuery,
  ActivityResponse,
} from "./activity.types";

// One page of what the team did, newest first. Admin and Sales Manager only; the API
// answers FORBIDDEN to everyone else. `summary` counts the whole filtered range.
export async function listActivity(query: ActivityListQuery): Promise<ActivityList> {
  const response = await http.get<ActivityResponse>("/activity", { params: query });
  return { entries: response.data.data, ...response.data.meta };
}

// The people the signed-in user may filter the feed by.
export async function listActivityAuthors(): Promise<ActivityAuthor[]> {
  const response = await http.get<ActivityAuthorsResponse>("/activity/authors");
  return response.data.data;
}
