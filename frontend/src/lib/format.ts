// How dates and money are written, everywhere in the app. The locale and the currency are
// fixed here until an installation can choose them.
const LOCALE = "en-US";
const CURRENCY = "USD";

const dateFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" });

const currencyFormat = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  // Whole amounts are written without cents; any other amount with both digits.
  trailingZeroDisplay: "stripIfInteger",
});

// "2026-10-05T09:00:00.000Z" -> "Oct 5, 2026", in the viewer's time zone.
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

// A calendar day without a time ("2026-11-15", an expected close date) -> "Nov 15, 2026".
// It is the same day for every viewer: it is not moved into their time zone.
export function formatDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return dateFormat.format(new Date(year, month - 1, date));
}

// 48000 -> "$48,000", 1250.5 -> "$1,250.50".
export function formatCurrency(amount: number): string {
  return currencyFormat.format(amount);
}

// An amount on a quote or an invoice, always with cents so a column lines up:
// 48000 -> "$48,000.00".
const moneyFormat = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY });

export function formatMoney(amount: number): string {
  return moneyFormat.format(amount);
}

// A tax rate or a discount: 8.25 -> "8.25%".
export function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

// A plain number as people write it: 12500.5 -> "12,500.5". Not money: no currency sign.
const numberFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 10 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { timeStyle: "short" });
const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const dayWithYearFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "always" });

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "2026-10-05T09:00:00.000Z" -> "Oct 5, 2026, 9:00 AM", in the viewer's time zone.
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

// "2026-10-05T09:00:00.000Z" -> "9:00 AM", in the viewer's time zone.
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// How many calendar days ago a moment was, in the viewer's time zone: 0 is today, 1 is
// yesterday. Rounded, so a 23 or 25 hour day (a clock change) still counts as one.
export function daysAgo(iso: string, now: Date = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
}

// A date as a person would say it: "Today", "Yesterday", "3 days ago", then "Oct 5, 2026".
export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const days = daysAgo(iso, now);
  if (days <= 0) {
    return days === 0 ? "Today" : formatDate(iso);
  }
  if (days === 1) {
    return "Yesterday";
  }
  return days < 7 ? relativeFormat.format(-days, "day") : formatDate(iso);
}

// The hint beside a recent date and time: "just now", "5 minutes ago", "2 hours ago",
// "yesterday", "3 days ago". Null for anything a week old or more, or in the future.
export function formatRelativeTime(iso: string, now: Date = new Date()): string | null {
  const elapsed = now.getTime() - new Date(iso).getTime();
  // A few minutes ahead is a clock that runs fast, not a date in the future.
  if (elapsed < -5 * MINUTE) {
    return null;
  }
  if (elapsed < MINUTE) {
    return "just now";
  }
  if (elapsed < HOUR) {
    return relativeFormat.format(-Math.floor(elapsed / MINUTE), "minute");
  }
  if (elapsed < DAY) {
    return relativeFormat.format(-Math.floor(elapsed / HOUR), "hour");
  }
  const days = Math.max(1, daysAgo(iso, now));
  if (days === 1) {
    return "yesterday";
  }
  return days < 7 ? relativeFormat.format(-days, "day") : null;
}

// The heading over one day of a feed: "Today", "Yesterday", then "Tue, Oct 6"
// (with the year when it is not this year).
export function formatDayHeading(iso: string, now: Date = new Date()): string {
  const days = daysAgo(iso, now);
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  const date = new Date(iso);
  return date.getFullYear() === now.getFullYear()
    ? dayFormat.format(date)
    : dayWithYearFormat.format(date);
}

// True when a moment has passed: a follow-up or a reminder that is late.
export function isPast(iso: string, now: Date = new Date()): boolean {
  return new Date(iso).getTime() < now.getTime();
}

// A moment that is near, as a person would say it: "Today, 2:00 PM", "Tomorrow, 10:00 AM",
// "Yesterday, 4:00 PM", then "Oct 15, 2026, 11:00 AM". For due dates and reminders.
export function formatNearDateTime(iso: string, now: Date = new Date()): string {
  switch (daysAgo(iso, now)) {
    case 0:
      return `Today, ${formatTime(iso)}`;
    case 1:
      return `Yesterday, ${formatTime(iso)}`;
    case -1:
      return `Tomorrow, ${formatTime(iso)}`;
    default:
      return formatDateTime(iso);
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// The value of an <input type="date"> for a date, in the viewer's time zone: "2026-10-05".
export function toDateInputValue(date: Date): string {
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The value of an <input type="datetime-local">, in the viewer's time zone: "2026-10-05T09:30".
export function toDateTimeInputValue(date: Date): string {
  return `${toDateInputValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
