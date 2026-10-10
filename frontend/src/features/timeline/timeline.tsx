"use client";

import { History } from "lucide-react";
import { useEffect, useMemo } from "react";

import { FormAlert } from "@/components/shared/form-alert";
import { PageError, PageState } from "@/components/shared/page-state";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { describeApiError } from "@/lib/api/error-messages";
import { useIsPhone } from "@/lib/use-is-phone";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { recordLabel } from "./record-types";
import {
  fetchMoreTimeline,
  fetchTimeline,
  refreshTimeline,
  sameRecord,
  selectTimeline,
} from "./timeline.slice";
import type { RecordRef, TimelineFilter } from "./timeline.types";
import { TimelineComposer } from "./timeline-composer";
import { TimelineEntryItem } from "./timeline-entry";
import { TIMELINE_FILTERS } from "./timeline-labels";

const SKELETON_ROWS = [0, 1, 2];

const EMPTY_TITLES: Record<TimelineFilter, string> = {
  ALL: "Nothing logged yet",
  CONVERSATION: "No conversations yet",
  NOTE: "No notes yet",
  SYSTEM: "No changes yet",
};

// The dated history of one record: conversations, notes and the record's own changes,
// newest first, with the form that adds to it. It is the same for every record type (a
// lead, a contact, a company). A record page mounts it in its wide column:
//
//   <Timeline record={{ type: "lead", id: lead.id }} canWrite={access.canWrite}
//             refreshKey={lead.updatedAt} />
//
// `canWrite` false (a Read-only user) leaves out the form. `refreshKey` is any value that
// changes when the record changes; the timeline then loads again, so a new status or owner
// shows as an entry without a reload. On a phone the form is not here: the page puts a
// `LogConversationButton` above the timeline, which opens it full-screen.
export function Timeline({
  record,
  canWrite,
  refreshKey,
}: {
  record: RecordRef;
  canWrite: boolean;
  refreshKey?: string;
}) {
  const dispatch = useAppDispatch();
  const timeline = useAppSelector(selectTimeline);
  const isPhone = useIsPhone();
  // The page hands over a new object on every render; the effects must not run for that.
  const { type, id } = record;
  const ref = useMemo<RecordRef>(() => ({ type, id }), [type, id]);

  useEffect(() => {
    void dispatch(fetchTimeline({ record: ref, filter: "ALL" }));
  }, [dispatch, ref]);

  // On the first render this is the request above and is skipped; after that it runs
  // when the record changed, and keeps the filter that is selected.
  useEffect(() => {
    dispatch(refreshTimeline(ref));
  }, [dispatch, ref, refreshKey]);

  // The store may still hold the timeline of the record that was open before this one.
  const mine = sameRecord(ref, timeline.query?.record);
  const filter = mine && timeline.query ? timeline.query.filter : "ALL";
  const data = mine ? timeline.data : null;
  const error = mine ? timeline.error : null;
  const failed = mine && timeline.status === "failed";
  const query = { record: ref, filter };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          <h2>Timeline</h2>
          {data ? (
            <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-xs font-medium">
              {data.total === 1 ? "1 entry" : `${String(data.total)} entries`}
            </span>
          ) : null}
        </CardTitle>
        <SegmentedControl
          label="Filter timeline"
          value={filter}
          options={TIMELINE_FILTERS}
          onChange={(next) => void dispatch(fetchTimeline({ record: ref, filter: next }))}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canWrite && !isPhone ? (
          <div className="bg-muted/40 rounded-lg border p-3 md:p-4">
            <TimelineComposer record={ref} />
          </div>
        ) : null}

        {/* A failed reload keeps the entries on screen, so say that they may be out of date. */}
        {data && failed && error ? <FormAlert message={describeApiError(error)} /> : null}

        {data === null ? (
          failed && error ? (
            <PageError error={error} onRetry={() => void dispatch(fetchTimeline(query))} />
          ) : (
            <div role="status" aria-label="Loading timeline" className="flex flex-col gap-4">
              {SKELETON_ROWS.map((row) => (
                <div key={row} className="flex gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : data.entries.length === 0 ? (
          <PageState
            icon={History}
            title={EMPTY_TITLES[filter]}
            description={
              canWrite
                ? "Log the first conversation to start this record's history."
                : "Conversations and notes will show here once someone logs them."
            }
          />
        ) : (
          <>
            <ol aria-label="Timeline entries" className="flex min-w-0 flex-col divide-y">
              {data.entries.map((entry) => (
                <TimelineEntryItem
                  key={entry.id}
                  entry={entry}
                  recordLabel={recordLabel(ref.type)}
                />
              ))}
            </ol>
            {timeline.more.status === "failed" && timeline.more.error ? (
              <FormAlert message={describeApiError(timeline.more.error)} />
            ) : null}
            {data.entries.length < data.total ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 self-center px-4"
                disabled={timeline.more.status === "loading"}
                onClick={() => void dispatch(fetchMoreTimeline(query))}
              >
                {timeline.more.status === "loading" ? "Loading..." : "Load more"}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
