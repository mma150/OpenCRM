import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/features/home/team_dashboard.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

void main() {
  _largeAmounts();

  group('the Team section', () {
    testWidgets(
      'a manager sees a card per person and the totals',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/dashboard/team', (request) => teamDashboardJson());
        await pumpApp(tester, api: api, user: manager);

        await scrollTo(tester, find.bySemanticsLabel('Team figures of Total'));
        expect(find.text('Team'), findsOneWidget);
        expect(
          find.text('What each person did from Oct 1, 2026 to Oct 13, 2026.'),
          findsOneWidget,
        );
        expect(
          find.bySemanticsLabel('Team figures of ${rep.name}'),
          findsOneWidget,
        );
        expect(find.text(r'$30,000'), findsOneWidget);
        expect(find.text('Open pipeline'), findsNWidgets(3));

        final sent = api.sent('GET', '/dashboard/team').single.query;
        final today = DateTime.now();
        expect(sent['from'], TeamRange.thisMonth.days(now: today).from);
        expect(sent['to'], TeamRange.thisMonth.days(now: today).to);
        expect(sent['tz'], matches(RegExp(r'^[+-]\d{2}:\d{2}$')));
      },
    );

    testWidgets('a range chip asks for its days', (tester) async {
      final api = FakeApi()
        ..on('GET', '/dashboard/team', (request) => teamDashboardJson());
      await pumpApp(tester, api: api, user: admin);

      await tapVisible(tester, find.widgetWithText(ChoiceChip, 'Last 7 days'));
      final days = TeamRange.last7Days.days();
      expect(api.sent('GET', '/dashboard/team').last.query['from'], days.from);
    });

    testWidgets('sorts the people by a figure', (tester) async {
      final api = FakeApi()
        ..on('GET', '/dashboard/team', (request) => teamDashboardJson());
      await pumpApp(tester, api: api, user: manager);

      // By name first: Riley before Sarah.
      await scrollTo(
        tester,
        find.bySemanticsLabel('Team figures of ${manager.name}'),
      );
      double top(String name) =>
          tester.getTopLeft(find.bySemanticsLabel('Team figures of $name')).dy;
      expect(top(rep.name), lessThan(top(manager.name)));

      await tapVisible(tester, find.text('Sort by: Name'));
      await tapVisible(tester, find.text('Won value (highest first)'));
      await scrollTo(
        tester,
        find.bySemanticsLabel('Team figures of ${manager.name}'),
      );
      expect(top(manager.name), lessThan(top(rep.name)));
    });

    testWidgets('a failure says why, with Retry', (tester) async {
      final api = FakeApi()
        ..on(
          'GET',
          '/dashboard/team',
          (request) => throw apiError('INTERNAL_ERROR'),
        );
      await pumpApp(tester, api: api, user: manager);

      final message = find.text(
        'The server ran into a problem. Try again in a moment.',
      );
      await scrollTo(tester, message);
      api.on(
        'GET',
        '/dashboard/team',
        (request) => teamDashboardJson(reps: []),
      );
      await tapVisible(tester, find.text('Retry'));
      await scrollTo(tester, find.text('No one on your team yet'));
    });

    testWidgets('a Read-only user sees the team too', variant: phones, (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET', '/dashboard/team', (request) => teamDashboardJson());
      await pumpApp(tester, api: api, user: readOnly);

      await scrollTo(tester, find.bySemanticsLabel('Team figures of Total'));
      expect(find.text('Team'), findsOneWidget);
      expect(api.sent('GET', '/dashboard/team'), hasLength(1));
    });

    for (final user in [rep]) {
      testWidgets('${user.role.label}: never asks for the team', (
        tester,
      ) async {
        // pumpApp gives this role no answer for /dashboard/team: a request would fail.
        final api = FakeApi();
        await pumpApp(tester, api: api, user: user);

        await scrollTo(tester, find.text('Open leads by status'));
        await tester.drag(
          find.byType(Scrollable).first,
          const Offset(0, -2000),
        );
        await tester.pumpAndSettle();
        expect(find.text('Team'), findsNothing);
        expect(api.sent('GET', '/dashboard/team'), isEmpty);
      });
    }
  });

  group('the tasks on Home', () {
    testWidgets(
      'a task due is ticked off from Home, with Undo',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on(
            'POST',
            '/tasks/task-1/complete',
            (request) => taskJson(status: 'DONE'),
          )
          ..on('POST', '/tasks/task-1/reopen', (request) => taskJson());
        await pumpApp(tester, api: api, user: rep);

        await tapVisible(
          tester,
          find.bySemanticsLabel('Complete Send revised pricing'),
        );
        expect(api.sent('POST', '/tasks/task-1/complete'), hasLength(1));
        expect(find.text('Task completed.'), findsOneWidget);
        // The figures load again.
        expect(api.sent('GET', '/dashboard/me'), hasLength(2));

        await tester.tap(find.widgetWithText(SnackBarAction, 'Undo'));
        await tester.pumpAndSettle();
        expect(api.sent('POST', '/tasks/task-1/reopen'), hasLength(1));
        await scrollTo(tester, find.text('Send revised pricing'));
      },
    );

    testWidgets('the task tiles open the matching group of the Tasks tab', (
      tester,
    ) async {
      final api = FakeApi();
      final app = await pumpApp(tester, api: api, user: rep);

      await tapVisible(tester, find.bySemanticsLabel('Overdue tasks: 2'));
      expect(app.location, Routes.tasks);
      final overdue = tester.widget<ChoiceChip>(
        find.widgetWithText(ChoiceChip, 'Overdue'),
      );
      expect(overdue.selected, isTrue);

      app.router.go(Routes.home);
      await tester.pumpAndSettle();
      await tapVisible(tester, find.bySemanticsLabel('Tasks due today: 5'));
      final today = tester.widget<ChoiceChip>(
        find.widgetWithText(ChoiceChip, 'Due today'),
      );
      expect(today.selected, isTrue);
    });

    testWidgets('a status of the open leads opens the list filtered by it', (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET', '/leads', (request) => page([leadJson()]));
      final app = await pumpApp(tester, api: api, user: rep);

      await scrollTo(tester, find.text('Contacted'));
      await tapVisible(tester, find.text('Contacted'));
      expect(app.location, Routes.leads);
      expect(api.sent('GET', '/leads').last.query['status'], 'CONTACTED');
    });
  });
}

/// The Pixel 8 (411 wide) with text at 130%: two figures to a row.
const _pixelLargeText = Surface(
  '411x914 dark, text 130%',
  Size(411, 914),
  dark: true,
  textScale: 1.3,
);

void _largeAmounts() {
  testWidgets('a large amount stays on one line', (tester) async {
    final api = FakeApi()
      ..on(
        'GET',
        '/dashboard/team',
        (request) => teamDashboardJson(
          totals: teamFiguresJson(openPipelineValue: 10000533551.74),
        ),
      );
    await pumpApp(tester, api: api, user: manager, surface: _pixelLargeText);

    final amount = find.text(r'$10,000,533,551.74');
    await scrollTo(tester, amount);
    // As tall as a short amount on another card: one line, not two.
    final oneLine = tester.getSize(find.text(r'$84,500').first).height;
    expect(tester.getSize(amount).height, lessThanOrEqualTo(oneLine + 0.5));
  });
}
