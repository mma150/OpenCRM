/// How dates and money are written, everywhere in the app. The locale (en-US) and the
/// currency (USD) are fixed, exactly as in the web app (`frontend/src/lib/format.ts`),
/// until an installation can choose them. Every function that says "today" takes `now`
/// as an argument so tests can fix the clock.
library;

import 'package:intl/intl.dart';

const _locale = 'en_US';

// Written-out patterns, so the output does not change with the locale data of an intl
// release (newer data puts a narrow no-break space before "AM").
final _date = DateFormat('MMM d, y', _locale);
final _time = DateFormat('h:mm a', _locale);
final _weekday = DateFormat('EEE, MMM d', _locale);
final _weekdayWithYear = DateFormat('EEE, MMM d, y', _locale);
final _longDay = DateFormat('EEEE, MMM d', _locale);

final _wholeCurrency = NumberFormat.currency(
  locale: _locale,
  symbol: r'$',
  decimalDigits: 0,
);
final _centsCurrency = NumberFormat.currency(
  locale: _locale,
  symbol: r'$',
  decimalDigits: 2,
);
final _number = NumberFormat.decimalPattern(_locale)
  ..maximumFractionDigits = 10;

/// `Oct 5, 2026`, in the device's time zone.
String formatDate(DateTime moment) => _date.format(moment.toLocal());

/// `9:00 AM`.
String formatTime(DateTime moment) => _time.format(moment.toLocal());

/// `Oct 5, 2026, 9:00 AM`.
String formatDateTime(DateTime moment) =>
    '${formatDate(moment)}, ${formatTime(moment)}';

/// `Thursday, Oct 16`: the date under the greeting.
String formatLongDay(DateTime moment) => _longDay.format(moment.toLocal());

/// A calendar day without a time (`"2026-11-15"`, a custom date field) as `Nov 15, 2026`.
/// It is the same day for every viewer, so it is not moved into a time zone.
String formatDay(String day) {
  final parts = day.split('-').map(int.tryParse).toList();
  if (parts.length != 3 || parts.contains(null)) {
    return day;
  }
  return _date.format(DateTime(parts[0]!, parts[1]!, parts[2]!));
}

/// `$48,000` for a whole amount, `$1,250.50` for any other.
String formatCurrency(num amount) {
  return amount == amount.roundToDouble()
      ? _wholeCurrency.format(amount)
      : _centsCurrency.format(amount);
}

/// A plain number as people write it: `12,500.5`. Not money.
String formatNumber(num value) => _number.format(value);

DateTime _startOfDay(DateTime moment) {
  final local = moment.toLocal();
  return DateTime(local.year, local.month, local.day);
}

/// How many calendar days ago a moment was on this device: 0 is today, 1 yesterday,
/// -1 tomorrow. Rounded, so a 23 or 25 hour day (a clock change) still counts as one.
int daysAgo(DateTime moment, {DateTime? now}) {
  final today = _startOfDay(now ?? DateTime.now());
  return (today.difference(_startOfDay(moment)).inHours / 24).round();
}

String _ago(int count, String unit) =>
    '$count $unit${count == 1 ? '' : 's'} ago';

/// A date as a person would say it: `Today`, `Yesterday`, `3 days ago`, then `Oct 5, 2026`.
String formatRelativeDate(DateTime moment, {DateTime? now}) {
  final days = daysAgo(moment, now: now);
  if (days == 0) {
    return 'Today';
  }
  if (days == 1) {
    return 'Yesterday';
  }
  return days > 1 && days < 7 ? _ago(days, 'day') : formatDate(moment);
}

/// How long ago something happened: `just now`, `5 minutes ago`, `2 hours ago`,
/// `yesterday`, `3 days ago`, then the date.
String formatRelativeTime(DateTime moment, {DateTime? now}) {
  final elapsed = (now ?? DateTime.now()).difference(moment);
  // A few minutes ahead is a clock that runs fast, not a date in the future.
  if (elapsed < const Duration(minutes: -5)) {
    return formatDateTime(moment);
  }
  if (elapsed < const Duration(minutes: 1)) {
    return 'just now';
  }
  if (elapsed < const Duration(hours: 1)) {
    return _ago(elapsed.inMinutes, 'minute');
  }
  if (elapsed < const Duration(days: 1)) {
    return _ago(elapsed.inHours, 'hour');
  }
  final days = daysAgo(moment, now: now).clamp(1, 1 << 31);
  if (days == 1) {
    return 'yesterday';
  }
  return days < 7 ? _ago(days, 'day') : formatDate(moment);
}

/// A moment that is near, as a person would say it: `Today, 2:00 PM`,
/// `Tomorrow, 10:00 AM`, `Yesterday, 4:00 PM`, then `Oct 15, 2026, 11:00 AM`.
/// For due dates, follow-ups and timeline entries.
String formatNearDateTime(DateTime moment, {DateTime? now}) {
  switch (daysAgo(moment, now: now)) {
    case 0:
      return 'Today, ${formatTime(moment)}';
    case 1:
      return 'Yesterday, ${formatTime(moment)}';
    case -1:
      return 'Tomorrow, ${formatTime(moment)}';
    default:
      return formatDateTime(moment);
  }
}

/// `Tue, Oct 6`, with the year when it is not this year.
String formatWeekday(DateTime moment, {DateTime? now}) {
  final local = moment.toLocal();
  return local.year == (now ?? DateTime.now()).year
      ? _weekday.format(local)
      : _weekdayWithYear.format(local);
}

/// `Good morning`, `Good afternoon` or `Good evening`.
String greeting({DateTime? now}) {
  final hour = (now ?? DateTime.now()).hour;
  if (hour < 12) {
    return 'Good morning';
  }
  return hour < 18 ? 'Good afternoon' : 'Good evening';
}

/// "Priya Shah" as `PS`, for an avatar.
String initials(String name) {
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .toList();
  if (words.isEmpty) {
    return '?';
  }
  final first = words.first.substring(0, 1);
  final last = words.length > 1 ? words.last.substring(0, 1) : '';
  return '$first$last'.toUpperCase();
}

/// The `tz` the API is sent wherever it counts by day (the dashboard, tasks): the
/// device's current distance from UTC, such as `+05:30`.
///
/// The API documents an IANA name (`Asia/Kolkata`), but Dart cannot read the device's
/// zone name without a plugin, and the API accepts an offset too (pinned by
/// `backend/src/lib/time-zone.test.ts`). The offset is right for "today"; it is one hour
/// off only for a day on the other side of a clock change.
String deviceTimeZone({DateTime? now}) {
  final offset = (now ?? DateTime.now()).timeZoneOffset;
  final minutes = offset.inMinutes.abs();
  final hh = (minutes ~/ 60).toString().padLeft(2, '0');
  final mm = (minutes % 60).toString().padLeft(2, '0');
  return '${offset.isNegative ? '-' : '+'}$hh:$mm';
}

/// A moment as the API takes it: UTC, ISO 8601 (`2026-11-15T09:30:00.000Z`).
String toApiMoment(DateTime moment) => moment.toUtc().toIso8601String();

/// `2026-11-15`: a calendar day as the API takes it (an expected close date, a custom date
/// field). It is the day the user picked, not a moment, so it is not moved into UTC.
String toApiDay(DateTime day) {
  final month = day.month.toString().padLeft(2, '0');
  final date = day.day.toString().padLeft(2, '0');
  return '${day.year}-$month-$date';
}
