import { z } from "./openapi";

// "Today" and "this month" depend on where the viewer is. The routes that count by day
// (tasks, the dashboard) take the viewer's IANA time zone as `tz` and turn it into exact
// moments here, with the time zone data built into Node (no library).

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// The `tz` query parameter: an IANA name such as "Asia/Kolkata". UTC when it is left out.
export const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isTimeZone, "Use an IANA time zone such as Europe/London")
  .default("UTC");

// A calendar day such as "2026-11-15".
export type Day = string;

// The calendar day it is in the time zone at this moment.
export function dayIn(timeZone: string, moment: Date): Day {
  // The Swedish format is year-month-day.
  return new Intl.DateTimeFormat("sv-SE", { timeZone, dateStyle: "short" }).format(moment);
}

// How far the time zone's clock is ahead of UTC at this moment, in milliseconds.
function offsetAt(timeZone: string, moment: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(moment);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const clock = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return clock - Math.floor(moment.getTime() / 1000) * 1000;
}

// The moment a calendar day starts in the time zone. `addDays` moves to a later or earlier
// day first (1 is the next day), which also works across the end of a month.
export function startOfDay(timeZone: string, day: Day, addDays = 0): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const asUtc = Date.UTC(year, month - 1, date + addDays);
  // The offset is looked up twice because it can differ on either side of a clock change.
  const guess = asUtc - offsetAt(timeZone, new Date(asUtc));
  return new Date(asUtc - offsetAt(timeZone, new Date(guess)));
}

// The first day of the month the day is in.
export function firstOfMonth(day: Day): Day {
  return `${day.slice(0, 8)}01`;
}

// Whole days from one calendar day to another (0 for the same day).
export function daysBetween(from: Day, to: Day): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

// Today for the viewer: `start` is the first moment of their day, `end` the first moment of
// the next one. Everything due before `start` is overdue; from `end` on it is upcoming.
export function todayIn(timeZone: string, now: Date): { day: Day; start: Date; end: Date } {
  const day = dayIn(timeZone, now);
  return { day, start: startOfDay(timeZone, day), end: startOfDay(timeZone, day, 1) };
}
