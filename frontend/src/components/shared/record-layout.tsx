"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { SegmentedControl } from "./segmented-control";

// The link above a record or a form that leads back to its list.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -my-2 flex min-h-11 items-center gap-1.5 self-start rounded-md text-sm outline-none focus-visible:ring-3"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {label}
    </Link>
  );
}

// The top of a record page: the record's name as the h1 with its status badge, one line of
// facts under it, and the record's actions. The actions wrap under the name on phones.
export function RecordHeader({
  title,
  badge,
  meta,
  actions,
}: {
  title: string;
  badge?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="bg-card flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-start md:justify-between md:p-6">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight wrap-anywhere">{title}</h1>
          {badge}
        </div>
        {meta ? (
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">{meta}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

// One fact in a RecordHeader's `meta` line: an icon and a few words.
export function RecordFact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 [&_svg]:size-4 [&_svg]:shrink-0">
      {icon}
      <span className="min-w-0 wrap-anywhere">{children}</span>
    </span>
  );
}

// The page of one record (a lead, a contact, a company): the header, then a wide main
// column (the timeline) and a narrow side column of cards (the details). From `lg` the two
// sit side by side. Below it only one is shown at a time, chosen with the buttons under the
// header, so the details are one tap away instead of a long scroll past the timeline. The
// main column is shown first.
//
// A record with lists of its own (a company's contacts and opportunities) passes them as
// `extra`: from `lg` they sit above the timeline in the wide column, and below `lg` each gets
// a button of its own between the other two.
type ExtraSection = { label: string; content: ReactNode };

export function RecordLayout({
  header,
  main,
  aside,
  extra,
  mainLabel = "Timeline",
  asideLabel = "Details",
}: {
  header: ReactNode;
  main: ReactNode;
  aside: ReactNode;
  // One section, or several in the order they are shown.
  extra?: ExtraSection | ExtraSection[];
  // The names of the two columns on the buttons that switch between them below `lg`.
  mainLabel?: string;
  asideLabel?: string;
}) {
  // "main", "aside", or the label of an extra section.
  const [section, setSection] = useState("main");
  const extras = extra === undefined ? [] : Array.isArray(extra) ? extra : [extra];

  return (
    <>
      {header}
      <SegmentedControl
        label="Section"
        className="lg:hidden"
        value={section}
        options={[
          { value: "main", label: mainLabel },
          ...extras.map((item) => ({ value: item.label, label: item.label })),
          { value: "aside", label: asideLabel },
        ]}
        onChange={setSection}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div
          className={cn(
            "flex min-w-0 flex-col gap-6 lg:order-last",
            section !== "aside" && "max-lg:hidden",
          )}
        >
          {aside}
        </div>
        {extras.length > 0 ? (
          // The wide column holds every other section; below `lg` only the chosen one shows.
          <div
            className={cn("flex min-w-0 flex-col gap-6", section === "aside" && "max-lg:hidden")}
          >
            {extras.map((item) => (
              <div
                key={item.label}
                className={cn(
                  "flex min-w-0 flex-col gap-6",
                  section !== item.label && "max-lg:hidden",
                )}
              >
                {item.content}
              </div>
            ))}
            <div
              className={cn("flex min-w-0 flex-col gap-6", section !== "main" && "max-lg:hidden")}
            >
              {main}
            </div>
          </div>
        ) : (
          <div className={cn("flex min-w-0 flex-col gap-6", section !== "main" && "max-lg:hidden")}>
            {main}
          </div>
        )}
      </div>
    </>
  );
}

// Label and value pairs inside a card:
// <DetailList><DetailItem label="Email">ada@example.com</DetailItem></DetailList>
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col gap-4">{children}</dl>;
}

export function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide wrap-anywhere uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm wrap-anywhere">{children}</dd>
    </div>
  );
}

// What a DetailItem shows for a value the record does not have.
export function EmptyValue() {
  return <span className="text-muted-foreground">—</span>;
}

// A link among a record's details: another record, an email (`mailto:`), a phone number
// (`tel:`). `external` opens a website in a new tab.
export function DetailLink({
  href,
  external = false,
  children,
}: {
  href: string;
  external?: boolean;
  children: ReactNode;
}) {
  const className =
    "text-primary rounded-sm underline-offset-4 outline-none wrap-anywhere hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";
  // A record's page goes through the router; anything else is a plain link.
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

// The Notes card in a record page's side column: the record's own free text.
export function NotesCard({ notes }: { notes: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent>
        {notes ? (
          <p className="text-sm wrap-anywhere whitespace-pre-wrap">{notes}</p>
        ) : (
          <p className="text-muted-foreground text-sm">No notes yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
