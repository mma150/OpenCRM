import { http } from "@/lib/api/http";

import { recordPath } from "./record-types";
import type {
  AddNoteInput,
  LogConversationInput,
  RecordRef,
  TimelineEntry,
  TimelineEntryResponse,
  TimelineListQuery,
  TimelinePage,
  TimelineResponse,
} from "./timeline.types";

// One page of a record's timeline, newest first. `meta.total` counts every match.
export async function listTimeline(
  record: RecordRef,
  query: TimelineListQuery,
): Promise<TimelinePage> {
  const response = await http.get<TimelineResponse>(`${recordPath(record)}/timeline`, {
    params: query,
  });
  return { entries: response.data.data, ...response.data.meta };
}

export async function logConversation(
  record: RecordRef,
  input: LogConversationInput,
): Promise<TimelineEntry> {
  const response = await http.post<TimelineEntryResponse>(
    `${recordPath(record)}/conversations`,
    input,
  );
  return response.data.data;
}

export async function addNote(record: RecordRef, input: AddNoteInput): Promise<TimelineEntry> {
  const response = await http.post<TimelineEntryResponse>(`${recordPath(record)}/notes`, input);
  return response.data.data;
}
