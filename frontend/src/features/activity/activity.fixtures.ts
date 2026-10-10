import {
  call,
  created,
  lostReasonUpdated,
  markedLost,
  note,
  reassigned,
  statusChanged,
} from "@/features/timeline/timeline.fixtures";
import type { TimelineEntry } from "@/features/timeline/timeline.types";
import { adminUser, repUser } from "@/test/render-with-store";

import type {
  ActivityAuthor,
  ActivityEntry,
  ActivityList,
  ActivityListQuery,
} from "./activity.types";
import { dayEnd, dayStart, rangeDates } from "./activity-labels";

export const marcusRecord: ActivityEntry["record"] = {
  type: "LEAD",
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  name: "Marcus Chen",
};
const devonRecord: ActivityEntry["record"] = {
  type: "LEAD",
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  name: "Devon Vance",
};

export const authors: ActivityAuthor[] = [
  { id: adminUser.id, name: adminUser.name },
  { id: repUser.id, name: repUser.name },
];

// A moment on the day `days` before today, at the given hour, in the test's own time zone:
// the feed groups by the viewer's days, so the fixtures are built the same way.
export function daysAgoAt(days: number, hour: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour).toISOString();
}

function activity(
  entry: TimelineEntry,
  occurredAt: string,
  record: ActivityEntry["record"] = marcusRecord,
): ActivityEntry {
  return { ...entry, occurredAt, createdAt: occurredAt, record };
}

// Newest first: two today, three yesterday, one three days ago.
export const todayCall = activity(call, daysAgoAt(0, 2));
export const todayNote = activity(note, daysAgoAt(0, 1));
export const yesterdayLost = activity(markedLost, daysAgoAt(1, 16), devonRecord);
export const yesterdayStatus = activity(statusChanged, daysAgoAt(1, 11));
export const yesterdayReassigned = activity(reassigned, daysAgoAt(1, 9));
export const olderLostReason = activity(lostReasonUpdated, daysAgoAt(3, 9), devonRecord);

// Entries on the other record types, mixed with one on a lead.
export const elenaRecord: ActivityEntry["record"] = {
  type: "CONTACT",
  id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  name: "Elena Rostova",
};
export const northwindRecord: ActivityEntry["record"] = {
  type: "COMPANY",
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  name: "Northwind Logistics",
};

export const mixedActivity: ActivityEntry[] = [
  activity(call, daysAgoAt(0, 5), northwindRecord),
  activity(note, daysAgoAt(0, 4), elenaRecord),
  activity(created, daysAgoAt(0, 3), elenaRecord),
  activity(reassigned, daysAgoAt(0, 2), northwindRecord),
  activity(statusChanged, daysAgoAt(0, 1)),
];

export const allActivity: ActivityEntry[] = [
  todayCall,
  todayNote,
  yesterdayLost,
  yesterdayStatus,
  yesterdayReassigned,
  olderLostReason,
];

export const summary = { conversations: 12, notes: 5, statusChanges: 3, emails: 0 };

export function activityList(
  entries: ActivityEntry[] = allActivity,
  meta: Partial<ActivityList> = {},
): ActivityList {
  return { entries, page: 1, pageSize: 25, total: entries.length, summary, ...meta };
}

// The query the page sends for a range (the plain /activity address is the last 7 days).
export function queryFor(range = "", from = "", to = ""): ActivityListQuery {
  const dates = rangeDates(range, from, to);
  return {
    ...(dates.from ? { from: dayStart(dates.from) } : {}),
    ...(dates.to ? { to: dayEnd(dates.to) } : {}),
    page: 1,
    pageSize: 25,
  };
}
