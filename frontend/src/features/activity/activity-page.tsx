"use client";

import { ArrowRightLeft, MessagesSquare, ShieldAlert, StickyNote } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";

import { FormAlert } from "@/components/shared/form-alert";
import { ListPagination, pageRange } from "@/components/shared/list-pagination";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { type ListUrlConfig, useListUrlState } from "@/components/shared/list-url-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageError, PageState } from "@/components/shared/page-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { selectAuth } from "@/features/auth/auth.slice";
import { TimelineEntryIcon } from "@/features/timeline/timeline-entry-icon";
import { describeApiError } from "@/lib/api/error-messages";
import { formatDayHeading, formatTime, toDateInputValue } from "@/lib/format";
import { initials } from "@/lib/user-labels";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

import {
  fetchActivity,
  fetchActivityAuthors,
  selectActivityAuthors,
  selectActivityList,
} from "./activity.slice";
import type { ActivityEntry, ActivityListQuery, ActivitySummary } from "./activity.types";
import {
  ACTIVITY_KINDS,
  ACTIVITY_RANGES,
  activityBadge,
  activityExcerpt,
  activityKindOptions,
  activityRangeOptions,
  activitySentence,
  dayEnd,
  dayStart,
  DEFAULT_RANGE_LABEL,
  rangeDates,
  recordHref,
  recordTypeLabel,
} from "./activity-labels";

const PAGE_SIZE = 25;
const SKELETON_ROWS = [0, 1, 2, 3];

type ActivityFilter = "userId" | "kind" | "range" | "from" | "to";

// What the feed keeps in the address: /activity?userId=...&kind=NOTE&range=30d&page=2.
// `from` and `to` are used by the custom range only. The feed is always newest first, so
// there is one sort and it never shows in the address.
const LIST_URL: ListUrlConfig<ActivityFilter, "occurredAt"> = {
  filters: { userId: null, kind: ACTIVITY_KINDS, range: ACTIVITY_RANGES, from: null, to: null },
  sorts: ["occurredAt"],
  defaultSort: "occurredAt",
  defaultOrder: "desc",
};

const linkClass =
  "text-primary rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

// Conversations N · Notes N · Status changes N, for everything the filters match on every
// page. The Type filter counts too: with "Notes" selected the other two are 0.
function SummaryStrip({ summary }: { summary: ActivitySummary }) {
  const items = [
    { label: "Conversations", count: summary.conversations, icon: MessagesSquare },
    { label: "Notes", count: summary.notes, icon: StickyNote },
    { label: "Status changes", count: summary.statusChanges, icon: ArrowRightLeft },
  ];
  return (
    <div className="bg-card flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border px-4 py-3 text-sm">
      <dl aria-label="Totals for these filters" className="flex flex-wrap gap-x-6 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <item.icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="font-semibold">{item.count}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-xs">Totals for these filters</p>
    </div>
  );
}

// One thing someone did: who, what, on which record (a link to its page), when, and a line
// or two of it.
function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const { before, after } = activitySentence(entry);
  const excerpt = activityExcerpt(entry);

  return (
    <li className="flex min-w-0 gap-3 p-4">
      <Avatar aria-hidden>
        <AvatarFallback className="text-xs">{initials(entry.author.name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p className="min-w-0 text-sm wrap-anywhere">
            <span className="font-medium">{entry.author.name}</span> {before}{" "}
            <Link href={recordHref(entry.record)} className={linkClass}>
              {entry.record.name}
            </Link>
            {after}
          </p>
          <time
            dateTime={entry.occurredAt}
            className="text-muted-foreground shrink-0 pt-0.5 text-xs whitespace-nowrap"
          >
            {formatTime(entry.occurredAt)}
          </time>
        </div>
        {/* What kind of record it is, what was done, and a line or two of it. On a phone the
            excerpt goes under the two badges, so it keeps the full width. */}
        <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:gap-2">
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="secondary" className="mt-px">
              {recordTypeLabel(entry.record)}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground mt-px">
              <TimelineEntryIcon entry={entry} />
              {activityBadge(entry)}
            </Badge>
          </div>
          {excerpt ? (
            <p className="text-muted-foreground line-clamp-2 min-w-0 text-sm wrap-anywhere">
              {excerpt}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

// Entries that follow each other on the same day (in the viewer's time zone) share a heading.
function groupByDay(entries: ActivityEntry[]): { day: string; entries: ActivityEntry[] }[] {
  const groups: { day: string; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const day = toDateInputValue(new Date(entry.occurredAt));
    const last = groups.at(-1);
    if (last?.day === day) {
      last.entries.push(entry);
    } else {
      groups.push({ day, entries: [entry] });
    }
  }
  return groups;
}

function ActivityFeed() {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector(selectActivityList);
  const { data: authors } = useAppSelector(selectActivityAuthors);
  const { state, isFiltered, setFilter, setFilters, setPage, clearFilters } =
    useListUrlState(LIST_URL);

  const { userId, kind, range, from, to } = state.filters;
  // The days the range covers, shown in the two date boxes whatever the preset.
  const dates = useMemo(() => rangeDates(range, from, to), [range, from, to]);

  const query = useMemo<ActivityListQuery>(
    () => ({
      ...(userId ? { userId } : {}),
      ...(kind ? { kind: kind as NonNullable<ActivityListQuery["kind"]> } : {}),
      ...(dates.from ? { from: dayStart(dates.from) } : {}),
      ...(dates.to ? { to: dayEnd(dates.to) } : {}),
      page: state.page,
      pageSize: PAGE_SIZE,
    }),
    [userId, kind, dates, state.page],
  );

  useEffect(() => {
    void dispatch(fetchActivity(query));
  }, [dispatch, query]);

  useEffect(() => {
    void dispatch(fetchActivityAuthors());
  }, [dispatch]);

  // A page past the end (the address was edited) goes to the last page that exists.
  const pastTheEnd =
    status === "succeeded" && data !== null && data.entries.length === 0 && data.total > 0;
  const lastPage = data ? pageRange(data.page, data.pageSize, data.total).pageCount : 1;
  useEffect(() => {
    if (pastTheEnd && state.page > lastPage) {
      setPage(lastPage);
    }
  }, [pastTheEnd, state.page, lastPage, setPage]);

  // Typing a date makes the range a custom one. The other box keeps the day it shows, and
  // is moved along when the two would otherwise be the wrong way round.
  function changeDate(end: "from" | "to", value: string) {
    const next = { ...dates, [end]: value };
    if (next.from && next.to && next.from > next.to) {
      next[end === "from" ? "to" : "from"] = value;
    }
    setFilters({ range: "custom", from: next.from, to: next.to });
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <ListToolbar
          filters={[
            {
              label: "Person",
              allLabel: "Everyone",
              value: userId,
              options: (authors ?? []).map((author) => ({ value: author.id, label: author.name })),
              onChange: (value) => {
                setFilter("userId", value);
              },
            },
            {
              label: "Type",
              allLabel: "All types",
              value: kind,
              options: activityKindOptions,
              onChange: (value) => {
                setFilter("kind", value);
              },
            },
            {
              label: "Dates",
              allLabel: DEFAULT_RANGE_LABEL,
              value: range,
              options: activityRangeOptions,
              onChange: (value) => {
                // A preset has no dates of its own; Custom starts from the days on screen.
                setFilters(
                  value === "custom"
                    ? { range: value, from: dates.from, to: dates.to }
                    : { range: value, from: "", to: "" },
                );
              },
            },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {(["from", "to"] as const).map((end) => (
            <label key={end} className="flex min-w-0 flex-col gap-1 text-xs font-medium">
              <span className="text-muted-foreground">{end === "from" ? "From" : "To"}</span>
              <Input
                type="date"
                value={dates[end]}
                max={end === "from" && dates.to ? dates.to : undefined}
                min={end === "to" && dates.from ? dates.from : undefined}
                onChange={(event) => {
                  changeDate(end, event.target.value);
                }}
                className="h-10 sm:w-40"
              />
            </label>
          ))}
        </div>
      </div>

      {data ? <SummaryStrip summary={data.summary} /> : null}

      {/* A failed reload keeps the last page on screen, so say that it is out of date. */}
      {data && status === "failed" && error ? (
        <FormAlert message={describeApiError(error)} />
      ) : null}

      {data === null ? (
        status === "failed" && error ? (
          <PageError error={error} onRetry={() => void dispatch(fetchActivity(query))} />
        ) : (
          <div role="status" aria-label="Loading activity" className="flex flex-col gap-3">
            {SKELETON_ROWS.map((row) => (
              <div key={row} className="bg-card flex gap-3 rounded-lg border p-4">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : data.entries.length === 0 ? (
        isFiltered ? (
          <PageState
            title="No activity matches these filters"
            description="Try a wider date range, another person or another type."
            action={
              <Button type="button" variant="outline" className="h-10 px-4" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <PageState
            title="No activity in the last 7 days"
            description="Conversations, notes and changes your team logs will show here."
          />
        )
      ) : (
        <div className="flex flex-col gap-6">
          {groupByDay(data.entries).map((group, index) => (
            <section
              key={`${group.day}-${String(index)}`}
              aria-label={formatDayHeading(group.entries[0]?.occurredAt ?? group.day)}
              className="flex flex-col gap-2"
            >
              <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {formatDayHeading(group.entries[0]?.occurredAt ?? group.day)}
              </h2>
              <ul className="bg-card flex min-w-0 flex-col divide-y rounded-lg border">
                {group.entries.map((entry) => (
                  <ActivityItem key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {data ? (
        <ListPagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      ) : null}
    </>
  );
}

// /activity: what each person on the team did and when (CONV-04). Admin and Sales Manager
// only. Everyone else gets a clear "no access" state, not a blank page; the API refuses
// them too (FORBIDDEN), so this is not the security boundary.
export function ActivityPage() {
  const { data: me } = useAppSelector(selectAuth);

  if (!me) {
    return null;
  }

  if (me.role !== "ADMIN" && me.role !== "SALES_MANAGER") {
    return (
      <PageState
        icon={ShieldAlert}
        title="You do not have access to Activity"
        description="Only an Admin or a Sales Manager can see what the team did."
        action={
          <Button asChild variant="outline" className="h-10 px-4">
            <Link href="/">Back to Home</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader title="Activity" description="What your team did and when." />
      <ActivityFeed />
    </>
  );
}
