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
  _homeNarrowsToOwn();

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

    // A screen reader can open it too: the tile is a button with a tap action.
    expect(
      tester.getSemantics(find.bySemanticsLabel('Open leads: 7')),
      isSemantics(isButton: true, hasTapAction: true),
    );
    await tapVisible(tester, find.bySemanticsLabel('Open leads: 7'));
    expect(app.location, Routes.leads);

    app.router.go(Routes.home);
    await tester.pumpAndSettle();
    await _scrollTo(tester, find.text('Send the fleet pricing'));
    await tapVisible(tester, find.text('Send the fleet pricing'));
    expect(app.location, Routes.lead('lead-1'));
  });

  testWidgets('an opportunity follow-up opens the opportunity', (tester) async {
    final api = FakeApi()
      ..on(
        'GET',
        '/dashboard/me',
        (request) => dashboardJson(
          followUps: [
            {
              'type': 'OPPORTUNITY',
              'id': 'opp-1',
              'name': 'Fleet renewal',
              'at': '2026-10-02T09:00:00.000Z',
              'note': 'Confirm the rollout date',
            },
          ],
        ),
      )
      ..on('GET', '/opportunities/board', (request) => boardJson([]))
      ..on('GET', '/opportunities/opp-1', (request) => opportunityJson())
      ..on('GET', '/opportunities/opp-1/timeline', (request) => page([]))
      ..on('GET', '/pipeline-stages', (request) => pipelineStagesJson());
    final app = await pumpApp(tester, api: api, user: rep);

    await _scrollTo(tester, find.text('Confirm the rollout date'));
    await tapVisible(tester, find.text('Confirm the rollout date'));
    expect(app.location, Routes.opportunity('opp-1'));
  });
}

/// Home and the two lists a figure on it opens, for someone who sees the team.
FakeApi _teamApi() {
  return FakeApi()
    ..on('GET', '/dashboard/me', (request) => dashboardJson())
    ..on('GET', '/dashboard/team', (request) => teamDashboardJson())
    ..on('GET', '/leads', (request) => page([leadJson()]))
    ..on('GET', '/opportunities', (request) => page([opportunityJson()]))
    ..on('GET', '/opportunities/board', (request) => boardJson([]))
    ..on('GET', '/pipeline-stages', (request) => pipelineStagesJson());
}

void _homeNarrowsToOwn() {
  group('a figure opens the list it counts', () {
    testWidgets(
      'an Admin gets only their own leads, and can show everyone again',
      variant: phones,
      (tester) async {
        final api = _teamApi();
        final app = await pumpApp(tester, api: api, user: admin);

        await tapVisible(tester, find.bySemanticsLabel('Open leads: 7'));

        expect(app.location, Routes.leads);
        expect(api.sent('GET', '/leads').last.query['ownerId'], admin.id);
        expect(find.text('Only my leads'), findsOneWidget);

        await tapVisible(tester, find.byTooltip("Show everyone's leads"));

        expect(
          api.sent('GET', '/leads').last.query,
          isNot(contains('ownerId')),
        );
        expect(find.text('Only my leads'), findsNothing);
      },
    );

    testWidgets('a status row keeps the status and the owner', (tester) async {
      final api = _teamApi();
      await pumpApp(tester, api: api, user: manager);

      await _scrollTo(tester, find.text('Open leads by status'));
      await tapVisible(tester, find.text('Contacted'));

      final query = api.sent('GET', '/leads').last.query;
      expect(query['status'], 'CONTACTED');
      expect(query['ownerId'], manager.id);
    });

    testWidgets('a Sales Rep\'s list is already their own', (tester) async {
      final api = _teamApi();
      await pumpApp(tester, api: api, user: rep);

      await tapVisible(tester, find.bySemanticsLabel('Open leads: 7'));

      expect(api.sent('GET', '/leads').last.query, isNot(contains('ownerId')));
      expect(find.text('Only my leads'), findsNothing);
    });

    testWidgets(
      "the pipeline tile opens an Admin's own pipeline, and can show everyone "
      'again',
      (tester) async {
        final api = _teamApi();
        final app = await pumpApp(tester, api: api, user: admin);

        await tapVisible(tester, find.text('Pipeline value'));

        expect(app.location, Routes.opportunities);
        expect(
          api.sent('GET', '/opportunities/board').last.query['ownerId'],
          admin.id,
        );
        expect(find.text('Only my opportunities'), findsOneWidget);

        await tapVisible(
          tester,
          find.byTooltip("Show everyone's opportunities"),
        );

        expect(
          api.sent('GET', '/opportunities/board').last.query,
          isNot(contains('ownerId')),
        );
      },
    );

    testWidgets(
      'a stage row and the won tile open the opportunity list',
      variant: phones,
      (tester) async {
        final api = _teamApi();
        final app = await pumpApp(tester, api: api, user: admin);

        await _scrollTo(tester, find.text('Proposal'));
        await tapVisible(tester, find.text('Proposal'));

        expect(app.location, Routes.opportunities);
        var query = api.sent('GET', '/opportunities').last.query;
        expect(query['stageId'], 'stage-2');
        expect(query['ownerId'], admin.id);
        expect(find.text('Only my opportunities'), findsOneWidget);

        app.router.go(Routes.home);
        await tester.pumpAndSettle();
        await _scrollTo(
          tester,
          find.bySemanticsLabel(RegExp(r'^Won this month')),
        );
        await tapVisible(
          tester,
          find.bySemanticsLabel(RegExp(r'^Won this month')),
        );

        query = api.sent('GET', '/opportunities').last.query;
        expect(query['status'], 'WON');
        expect(query['ownerId'], admin.id);
        expect(query, isNot(contains('stageId')));
      },
    );
  });
}
