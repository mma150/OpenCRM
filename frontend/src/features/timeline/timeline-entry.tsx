"use client";

import Link from "next/link";
import { useState } from "react";

import { daysAgo, formatDate, formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { RECORD_TYPES } from "./record-types";
import type { TimelineEntry } from "./timeline.types";
import { TimelineEntryIcon } from "./timeline-entry-icon";
import { emailOf, entryLink, entryText, entryTitle } from "./timeline-labels";

const linkClass =
  "text-primary rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

// A title whose quote or invoice number is a link to that document: "Quote Q-0001 sent".
// A title that does not hold the words of the link is shown as it is.
export function LinkedTitle({
  title,
  link,
}: {
  title: string;
  link: { href: string; label: string } | null;
}) {
  const at = link ? title.indexOf(link.label) : -1;
  if (!link || at === -1) {
    return title;
  }
  return (
    <>
      {title.slice(0, at)}
      <Link href={link.href} className={linkClass}>
        {link.label}
      </Link>
      {title.slice(at + link.label.length)}
    </>
  );
}

// Under the title of an email: who it went to, the quote it carried and the file attached.
function EmailFacts({ entry }: { entry: TimelineEntry }) {
  const { to, cc, attachment } = emailOf(entry);
  const link = entryLink(entry);
  return (
    <div className="text-muted-foreground flex min-w-0 flex-col gap-0.5 text-xs wrap-anywhere">
      {to.length > 0 ? <p>To: {to.join(", ")}</p> : null}
      {cc.length > 0 ? <p>Cc: {cc.join(", ")}</p> : null}
      {link ? (
        <p>
          With{" "}
          <Link href={link.href} className={linkClass}>
            {link.label}
          </Link>
        </p>
      ) : null}
      {attachment ? <p>Attached: {attachment}</p> : null}
    </div>
  );
}

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

// On the timeline of a contact, a company or an opportunity, an entry of the lead that was
// converted into it says so, and links to that lead.
function FromLead({ lead }: { lead: NonNullable<TimelineEntry["fromLead"]> }) {
  return (
    <p className="text-muted-foreground text-xs wrap-anywhere">
      From lead{" "}
      <Link href={`/${RECORD_TYPES.lead.path}/${lead.id}`} className={linkClass}>
        {lead.name}
      </Link>
    </p>
  );
}

// One entry of a timeline: an icon for its kind, the title, who made it and when, and its
// text. Entries are permanent, so there is nothing to edit or delete here. An entry of a
// converted lead (`fromLead`) is titled as the lead's ("Lead created") and labelled with it.
export function TimelineEntryItem({
  entry,
  recordLabel,
}: {
  entry: TimelineEntry;
  recordLabel: string;
}) {
  const text = entryText(entry);
  const isEmail = entry.kind === "EMAIL";
  const label = entry.fromLead ? RECORD_TYPES.lead.label : recordLabel;
  const relative = formatRelativeTime(entry.occurredAt);
  // A conversation written down on a later day than it happened says so.
  const loggedLater = daysAgo(entry.createdAt, new Date(entry.occurredAt)) < 0;

  return (
    <li className="flex min-w-0 gap-3 py-4 first:pt-0 last:pb-0">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          entry.kind === "CONVERSATION" || isEmail
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <TimelineEntryIcon entry={entry} className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium wrap-anywhere">
            {/* The link of an email is the line "With Quote Q-0001" below, not its title. */}
            <LinkedTitle
              title={entryTitle(entry, label)}
              link={isEmail ? null : entryLink(entry)}
            />
          </p>
          <p className="text-muted-foreground text-xs wrap-anywhere">
            {entry.author.name} ·{" "}
            <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
            {relative ? ` (${relative})` : null}
            {loggedLater ? ` · logged ${formatDate(entry.createdAt)}` : null}
          </p>
          {entry.fromLead ? <FromLead lead={entry.fromLead} /> : null}
        </div>
        {isEmail ? <EmailFacts entry={entry} /> : null}
        {text ? <EntryText text={text} /> : null}
      </div>
    </li>
  );
}
