import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

/// Scrolls Home down until [finder] is built and on screen.
Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('greets the user and shows their numbers', variant: phones, (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET', '/dashboard/me', (request) => dashboardJson());
    await pumpApp(tester, api: api, user: rep);

    expect(find.textContaining(', Riley'), findsOneWidget);
    expect(find.textContaining('Sales Rep · '), findsOneWidget);
    for (final label in [
      'Open leads: 7',
      r'Pipeline value: $84,500',
      'Tasks due today: 5',
      'Overdue tasks: 2',
    ]) {
      expect(find.bySemanticsLabel(label), findsOneWidget, reason: label);
    }
    await _scrollTo(
      tester,
      find.bySemanticsLabel(r'Won this month: $12,000.50, 1 opportunity'),
    );

    // "Today" and "this month" are the device's: its offset from UTC is sent.
    expect(
      api.sent('GET', '/dashboard/me').single.query['tz'],
      matches(RegExp(r'^[+-]\d{2}:\d{2}$')),
    );
  });

  testWidgets('lists the tasks and follow-ups that are due', variant: phones, (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET', '/dashboard/me', (request) => dashboardJson());
    await pumpApp(tester, api: api, user: rep);

    await _scrollTo(tester, find.text('Send revised pricing'));
    expect(find.text('Tasks due'), findsOneWidget);
    expect(find.textContaining('Overdue · Oct 1, 2026'), findsOneWidget);

    await _scrollTo(tester, find.text('Send the fleet pricing'));
    expect(find.text('Follow-ups due'), findsOneWidget);
    expect(find.textContaining('Overdue · Oct 2, 2026'), findsOneWidget);
  });

  testWidgets(
    'shows the pipeline and the open leads as bars with their values',
    variant: phones,
    (tester) async {
      final api = FakeApi()
        ..on('GET', '/dashboard/me', (request) => dashboardJson());
      await pumpApp(tester, api: api, user: rep);

      await _scrollTo(tester, find.text('Proposal'));
      expect(find.text('Pipeline by stage'), findsOneWidget);
      expect(find.text(r'$60,000 · 2 open'), findsOneWidget);
      expect(find.text(r'$24,500 · 1 open'), findsOneWidget);

      await _scrollTo(tester, find.text('Qualified').last);
      expect(find.text('Open leads by status'), findsOneWidget);
      expect(find.text('Contacted'), findsOneWidget);
      // The largest value fills its bar; the others are a share of it.
      final bars = tester
          .widgetList<LinearProgressIndicator>(
            find.byType(LinearProgressIndicator),
          )
          .map((bar) => bar.value)
          .toList();
      expect(bars, containsAll(<double>[1, 0.5, 0.25]));
    },
  );

  testWidgets(
    'says so when nothing is due (a Read-only user owns nothing)',
    variant: phones,
    (tester) async {
      final api = FakeApi()
        ..on('GET', '/dashboard/me', (request) {
          return dashboardJson(
            openLeads: 0,
            tasksDue: [],
            followUps: [],
            overdue: 0,
          );
        });
      await pumpApp(tester, api: api, user: readOnly);

      expect(find.textContaining('Read-only · '), findsOneWidget);
      expect(find.bySemanticsLabel('Open leads: 0'), findsOneWidget);
      await _scrollTo(tester, find.textContaining('No follow-ups are due'));
      expect(find.textContaining('Nothing is due today'), findsOneWidget);
    },
  );

  testWidgets('shows a placeholder while loading, under the greeting', (
    tester,
  ) async {
    final answer = Completer<Object?>();
    final api = FakeApi()
      ..on('GET', '/dashboard/me', (request) => answer.future);
    await pumpApp(tester, api: api, user: rep);

    expect(find.textContaining(', Riley'), findsOneWidget);
    expect(find.bySemanticsLabel('Loading your dashboard'), findsOneWidget);

    answer.complete(dashboardJson());
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Loading your dashboard'), findsNothing);
    expect(find.bySemanticsLabel('Open leads: 7'), findsOneWidget);
  });

  testWidgets(
    'a failure takes the place of the figures only, with Retry',
    variant: phones,
    (tester) async {
      final api = FakeApi()
        ..on(
          'GET',
          '/dashboard/me',
          (request) => throw apiError('SERVICE_UNAVAILABLE', status: 503),
        );
      await pumpApp(tester, api: api, user: rep);

      expect(find.textContaining(', Riley'), findsOneWidget);
      expect(
        find.text(
          'The service is temporarily unavailable. Try again in a moment.',
        ),
        findsOneWidget,
      );

      api.on('GET', '/dashboard/me', (request) => dashboardJson());
      await tapVisible(tester, find.text('Retry'));

      expect(find.bySemanticsLabel('Open leads: 7'), findsOneWidget);
      expect(api.sent('GET', '/dashboard/me'), hasLength(2));
    },
  );

  testWidgets(
    'pull to refresh reads the figures again and keeps the old ones meanwhile',
    (tester) async {
      final api = FakeApi()
        ..on('GET', '/dashboard/me', (request) => dashboardJson());
      await pumpApp(tester, api: api, user: rep);
      final answer = Completer<Object?>();
      api.on('GET', '/dashboard/me', (request) => answer.future);

      await tester.fling(
        find.textContaining(', Riley'),
        const Offset(0, 400),
        1000,
      );
      await tester.pump(const Duration(seconds: 1));
      expect(find.bySemanticsLabel('Open leads: 7'), findsOneWidget);

      answer.complete(dashboardJson(openLeads: 9));
      await tester.pumpAndSettle();
      expect(find.bySemanticsLabel('Open leads: 9'), findsOneWidget);
    },
  );

  testWidgets('the tiles and a follow-up lead somewhere', (tester) async {
    final api = FakeApi()
      ..on('GET', '/dashboard/me', (request) => dashboardJson())
      ..on('GET', '/leads', (request) => page([leadJson()]))
      ..on('GET', '/leads/lead-1', (request) => leadJson())
      ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
    final app = await pumpApp(tester, api: api, user: rep);

    await tapVisible(tester, find.bySemanticsLabel('Open leads: 7'));
    expect(app.location, Routes.leads);

    app.router.go(Routes.home);
    await tester.pumpAndSettle();
    await _scrollTo(tester, find.text('Send the fleet pricing'));
    await tapVisible(tester, find.text('Send the fleet pricing'));
    expect(app.location, Routes.lead('lead-1'));
  });
}
