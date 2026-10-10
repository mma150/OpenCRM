// The viewer's IANA time zone ("Asia/Kolkata"). The API needs it wherever it sorts tasks
// into days (overdue, due today) or counts "this month": send it as `tz` on every task and
// dashboard request. UTC when the browser cannot say.
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
