import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/core/format/formatters.dart';

void main() {
  // Local times throughout, so the tests pass in any time zone.
  final now = DateTime(2026, 10, 16, 14, 30);

  group('dates', () {
    test('are written the en-US way', () {
      final moment = DateTime(2026, 10, 5, 9);

      expect(formatDate(moment), 'Oct 5, 2026');
      expect(formatTime(moment), '9:00 AM');
      expect(
        formatDateTime(DateTime(2026, 10, 5, 15, 45)),
        'Oct 5, 2026, 3:45 PM',
      );
      expect(formatLongDay(now), 'Friday, Oct 16');
    });

    test('a calendar day is not moved into a time zone', () {
      expect(formatDay('2026-11-15'), 'Nov 15, 2026');
      expect(formatDay('not a day'), 'not a day');
    });

    test('formatWeekday adds the year only when it is not this year', () {
      expect(formatWeekday(DateTime(2026, 10, 6), now: now), 'Tue, Oct 6');
      expect(
        formatWeekday(DateTime(2025, 10, 6), now: now),
        'Mon, Oct 6, 2025',
      );
    });
  });

  group('relative dates', () {
    test('daysAgo counts calendar days, not 24-hour spans', () {
      expect(daysAgo(DateTime(2026, 10, 16, 0, 5), now: now), 0);
      expect(daysAgo(DateTime(2026, 10, 15, 23, 55), now: now), 1);
      expect(daysAgo(DateTime(2026, 10, 17, 0, 5), now: now), -1);
    });

    test('formatRelativeDate', () {
      expect(formatRelativeDate(DateTime(2026, 10, 16, 8), now: now), 'Today');
      expect(
        formatRelativeDate(DateTime(2026, 10, 15, 8), now: now),
        'Yesterday',
      );
      expect(
        formatRelativeDate(DateTime(2026, 10, 13, 8), now: now),
        '3 days ago',
      );
      expect(
        formatRelativeDate(DateTime(2026, 10, 9, 8), now: now),
        'Oct 9, 2026',
      );
      expect(
        formatRelativeDate(DateTime(2026, 10, 18, 8), now: now),
        'Oct 18, 2026',
      );
    });

    test('formatRelativeTime', () {
      String at(Duration elapsed) {
        return formatRelativeTime(now.subtract(elapsed), now: now);
      }

      expect(at(const Duration(seconds: 20)), 'just now');
      expect(at(const Duration(minutes: 1)), '1 minute ago');
      expect(at(const Duration(minutes: 5)), '5 minutes ago');
      expect(at(const Duration(hours: 2)), '2 hours ago');
      expect(at(const Duration(hours: 30)), 'yesterday');
      expect(at(const Duration(days: 3)), '3 days ago');
      expect(at(const Duration(days: 10)), 'Oct 6, 2026');
      // A clock a little ahead is not "the future".
      expect(at(const Duration(minutes: -2)), 'just now');
    });

    test('formatNearDateTime', () {
      expect(
        formatNearDateTime(DateTime(2026, 10, 16, 14), now: now),
        'Today, 2:00 PM',
      );
      expect(
        formatNearDateTime(DateTime(2026, 10, 17, 10), now: now),
        'Tomorrow, 10:00 AM',
      );
      expect(
        formatNearDateTime(DateTime(2026, 10, 15, 16), now: now),
        'Yesterday, 4:00 PM',
      );
      expect(
        formatNearDateTime(DateTime(2026, 10, 20, 11), now: now),
        'Oct 20, 2026, 11:00 AM',
      );
    });
  });

  group('money and numbers', () {
    test('whole amounts have no cents; any other amount has both digits', () {
      expect(formatCurrency(48000), r'$48,000');
      expect(formatCurrency(1250.5), r'$1,250.50');
      expect(formatCurrency(0), r'$0');
      expect(formatCurrency(84500.0), r'$84,500');
    });

    test('a plain number keeps its decimals and has no currency sign', () {
      expect(formatNumber(12500.5), '12,500.5');
      expect(formatNumber(3), '3');
    });

    test('a rate is a number with a percent sign', () {
      expect(formatPercent(8), '8%');
      expect(formatPercent(12.5), '12.5%');
      expect(formatPercent(0), '0%');
    });
  });

  group('people', () {
    test('initials', () {
      expect(initials('Priya Shah'), 'PS');
      expect(initials('  ravi  '), 'R');
      expect(initials('Jean Luc de Picard'), 'JP');
      expect(initials(''), '?');
    });

    test('greeting follows the hour', () {
      expect(greeting(now: DateTime(2026, 1, 1, 8)), 'Good morning');
      expect(greeting(now: DateTime(2026, 1, 1, 13)), 'Good afternoon');
      expect(greeting(now: DateTime(2026, 1, 1, 20)), 'Good evening');
    });
  });

  group('what the API is sent', () {
    test('deviceTimeZone is the offset from UTC, such as +05:30', () {
      final zone = deviceTimeZone(now: now);
      final offset = now.timeZoneOffset;

      expect(zone, matches(RegExp(r'^[+-]\d{2}:\d{2}$')));
      expect(zone.startsWith('-'), offset.isNegative);
      expect(
        int.parse(zone.substring(1, 3)) * 60 + int.parse(zone.substring(4)),
        offset.inMinutes.abs(),
      );
    });

    test('toApiMoment is UTC ISO 8601', () {
      expect(
        toApiMoment(DateTime.utc(2026, 11, 15, 9, 30)),
        '2026-11-15T09:30:00.000Z',
      );
      expect(toApiMoment(DateTime(2026, 11, 15, 9, 30)), endsWith('Z'));
    });
  });
}
