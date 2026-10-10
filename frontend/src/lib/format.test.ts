import { describe, expect, it } from "vitest";

import {
  daysAgo,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDay,
  formatDayHeading,
  formatRelativeDate,
  formatRelativeTime,
  formatTime,
  toDateInputValue,
  toDateTimeInputValue,
} from "./format";

// Local moments, so the tests mean the same in any time zone.
const now = new Date(2026, 9, 9, 14, 30);
const at = (day: number, hour = 12, minute = 0, month = 9, year = 2026) =>
  new Date(year, month, day, hour, minute).toISOString();

describe("format", () => {
  it("writes money with a currency sign and thousands separators, cents only when there are any", () => {
    expect(formatCurrency(48000)).toBe("$48,000");
    expect(formatCurrency(1250.5)).toBe("$1,250.50");
    expect(formatCurrency(0)).toBe("$0");
    expect(formatCurrency(9999999999.99)).toBe("$9,999,999,999.99");
  });

  it("writes a calendar day as it is, whatever the time zone", () => {
    expect(formatDay("2026-11-15")).toBe("Nov 15, 2026");
    expect(formatDay("2027-01-01")).toBe("Jan 1, 2027");
  });

  it("writes a date as month, day and year", () => {
    expect(formatDate("2026-10-05T12:00:00.000Z")).toBe("Oct 5, 2026");
  });
});

describe("format: dates and times of a timeline", () => {
  it("writes a date with its time, and a time alone", () => {
    expect(formatDateTime(at(5, 9, 5))).toBe("Oct 5, 2026, 9:05 AM");
    expect(formatTime(at(5, 15, 45))).toBe("3:45 PM");
  });

  it("counts calendar days, not 24 hour blocks", () => {
    expect(daysAgo(at(9, 0, 1), now)).toBe(0);
    expect(daysAgo(at(8, 23, 59), now)).toBe(1);
    expect(daysAgo(at(2), now)).toBe(7);
    expect(daysAgo(at(10), now)).toBe(-1);
  });

  it("says a date as a person would: Today, Yesterday, days ago, then the date", () => {
    expect(formatRelativeDate(at(9, 8), now)).toBe("Today");
    expect(formatRelativeDate(at(8, 23), now)).toBe("Yesterday");
    expect(formatRelativeDate(at(6), now)).toBe("3 days ago");
    expect(formatRelativeDate(at(3), now)).toBe("6 days ago");
    expect(formatRelativeDate(at(2), now)).toBe("Oct 2, 2026");
    expect(formatRelativeDate(at(12), now)).toBe("Oct 12, 2026");
  });

  it("adds a relative hint to recent moments only", () => {
    expect(formatRelativeTime(at(9, 14, 30), now)).toBe("just now");
    expect(formatRelativeTime(at(9, 14, 25), now)).toBe("5 minutes ago");
    expect(formatRelativeTime(at(9, 13, 29), now)).toBe("1 hour ago");
    expect(formatRelativeTime(at(9, 9, 0), now)).toBe("5 hours ago");
    expect(formatRelativeTime(at(8, 10), now)).toBe("yesterday");
    expect(formatRelativeTime(at(6), now)).toBe("3 days ago");
    expect(formatRelativeTime(at(2), now)).toBeNull();
    // A clock a few minutes fast is "just now"; a real future date gets no hint.
    expect(formatRelativeTime(at(9, 14, 33), now)).toBe("just now");
    expect(formatRelativeTime(at(10), now)).toBeNull();
  });

  it("heads a day of a feed with Today, Yesterday, then the weekday and date", () => {
    expect(formatDayHeading(at(9, 1), now)).toBe("Today");
    expect(formatDayHeading(at(8, 23), now)).toBe("Yesterday");
    expect(formatDayHeading(at(6), now)).toBe("Tue, Oct 6");
    expect(formatDayHeading(at(31, 12, 0, 11, 2025), now)).toBe("Wed, Dec 31, 2025");
  });

  it("writes the values of date and datetime-local inputs in local time", () => {
    expect(toDateInputValue(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(toDateTimeInputValue(new Date(2026, 9, 5, 9, 3))).toBe("2026-10-05T09:03");
  });
});
