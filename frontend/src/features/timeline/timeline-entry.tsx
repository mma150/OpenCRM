"use client";

import { useState } from "react";

import { daysAgo, formatDate, formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { TimelineEntry } from "./timeline.types";
import { TimelineEntryIcon } from "./timeline-entry-icon";
import { entryText, entryTitle } from "./timeline-labels";

// Longer text than this is shown cut short with a "Show more" button, so one long
// conversation does not push the rest of the history off the screen.
const LONG_TEXT = 600;

function EntryText({ text }: { text: string }) {
  const long = text.length > LONG_TEXT || text.split("\n").length > 8;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {/* Line breaks are kept, and a long word or link wraps inside the card. */}
      <p
        className={cn(
          "max-w-full text-sm wrap-anywhere whitespace-pre-wrap",
          long && !expanded && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          aria-expanded={expanded}
          className="text-primary focus-visible:ring-ring/50 -my-1 min-h-9 rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

// One entry of a timeline: an icon for its kind, the title, who made it and when, and its
// text. Entries are permanent, so there is nothing to edit or delete here.
export function TimelineEntryItem({
  entry,
  recordLabel,
}: {
  entry: TimelineEntry;
  recordLabel: string;
}) {
  const text = entryText(entry);
  const relative = formatRelativeTime(entry.occurredAt);
  // A conversation written down on a later day than it happened says so.
  const loggedLater = daysAgo(entry.createdAt, new Date(entry.occurredAt)) < 0;

  return (
    <li className="flex min-w-0 gap-3 py-4 first:pt-0 last:pb-0">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          entry.kind === "CONVERSATION"
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <TimelineEntryIcon entry={entry} className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium wrap-anywhere">{entryTitle(entry, recordLabel)}</p>
          <p className="text-muted-foreground text-xs wrap-anywhere">
            {entry.author.name} ·{" "}
            <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
            {relative ? ` (${relative})` : null}
            {loggedLater ? ` · logged ${formatDate(entry.createdAt)}` : null}
          </p>
        </div>
        {text ? <EntryText text={text} /> : null}
      </div>
    </li>
  );
}
