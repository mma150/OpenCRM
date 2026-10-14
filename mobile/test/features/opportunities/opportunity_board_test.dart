import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/auth/user.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

final _qualified = pipelineStages[1];
final _won = pipelineStages[3];
final _lost = pipelineStages[4];

/// The pipeline with these cards.
FakeApi _api(
  List<Map<String, Object?>> cards, {
  Map<String, int> counts = const {},
}) {
  return FakeApi()..on(
    'GET',
    '/opportunities/board',
    (request) => boardJson(cards, counts: counts),
  );
}

Finder _stage(String label) => find.widgetWithText(ChoiceChip, label);

Future<void> _open(WidgetTester tester, FakeApi api, {User user = rep}) {
  return pumpApp(tester, api: api, user: user, location: Routes.opportunities);
}

void main() {
  group('what it shows', () {
    testWidgets(
      'the stages with their counts, one stage at a time',
      variant: phones,
      (tester) async {
        final api = _api([
          opportunityJson(),
          opportunityJson(
            id: 'opp-2',
            name: 'An Exceptionally Long Opportunity Name For The Whole Fleet',
            value: 1250.5,
            expectedCloseDate: null,
            company: null,
            owner: manager,
          ),
          opportunityJson(
            id: 'opp-3',
            name: 'Warehouse sensors',
            value: 9000,
            stage: _qualified,
          ),
          opportunityJson(id: 'opp-4', name: 'Old deal', stage: _won),
        ]);
        await _open(tester, api, user: manager);

        // The open stages in order, then Won and Lost.
        expect(_stage('New · 2'), findsOneWidget);
        expect(_stage('Qualified · 1'), findsOneWidget);
        expect(_stage('Proposal · 0'), findsOneWidget);
        expect(tester.widget<ChoiceChip>(_stage('New · 2')).selected, true);
        // The first stage: its total, count and cards.
        expect(find.text(r'$49,250.50 total'), findsOneWidget);
        expect(find.text('2 opportunities'), findsOneWidget);
        expect(find.text('Fleet renewal'), findsOneWidget);
        expect(find.text('Northwind Logistics'), findsOneWidget);
        expect(find.text(r'$48,000'), findsOneWidget);
        expect(find.text('Expected close: Nov 15, 2026'), findsOneWidget);
        expect(find.text('Warehouse sensors'), findsNothing);
        // The owner is named only when it is someone else's.
        expect(find.text('Riley Rep'), findsOneWidget);
        expect(find.text('Sarah Jenkins'), findsNothing);
        await scrollTo(tester, find.text(r'$1,250.50'));
        expect(find.textContaining('Exceptionally Long'), findsOneWidget);

        await tapVisible(tester, _stage('Qualified · 1'));
        expect(find.text('Warehouse sensors'), findsOneWidget);
        expect(find.text(r'$9,000 total'), findsOneWidget);
        expect(find.text('1 opportunity'), findsOneWidget);
        expect(find.text('Fleet renewal'), findsNothing);

        await tapVisible(tester, _stage('Proposal · 0'));
        expect(find.text('No opportunities in this stage.'), findsOneWidget);

        await tapVisible(tester, _stage('Won · 1'));
        expect(find.text('Old deal'), findsOneWidget);
        // A closed card is reopened, not moved.
        expect(find.text('Move to stage'), findsNothing);
        expect(find.text('Reopen'), findsOneWidget);
      },
    );

    testWidgets(
      'says so when there are no opportunities, by role',
      variant: phones,
      (tester) async {
        await _open(tester, _api([]));

        expect(find.text('No opportunities yet'), findsOneWidget);
        expect(
          find.text('Add your first opportunity to start your pipeline.'),
          findsOneWidget,
        );
        expect(find.byTooltip('New opportunity'), findsOneWidget);
      },
    );

    testWidgets('a Read-only user gets nothing that writes', variant: phones, (
      tester,
    ) async {
      final api = _api([
        opportunityJson(),
        opportunityJson(id: 'opp-2', stage: _lost),
      ]);
      await _open(tester, api, user: readOnly);

      expect(find.text('Fleet renewal'), findsOneWidget);
      expect(find.text('Move to stage'), findsNothing);
      expect(find.byTooltip('New opportunity'), findsNothing);
      await tapVisible(tester, _stage('Lost · 1'));
      expect(find.text('Reopen'), findsNothing);
    });

    testWidgets('an empty pipeline tells a Read-only user what to expect', (
      tester,
    ) async {
      await _open(tester, _api([]), user: readOnly);

      expect(
        find.text('Opportunities will show here once someone adds them.'),
        findsOneWidget,
      );
    });

    testWidgets('shows a placeholder while the pipeline loads', (tester) async {
      final answer = Completer<Object?>();
      final api = FakeApi()
        ..on('GET', '/opportunities/board', (request) => answer.future);
      final app = await pumpApp(tester, api: api, user: rep);
      app.router.go(Routes.opportunities);
      await tester.pump();
      await tester.pump();

      expect(find.bySemanticsLabel('Loading pipeline'), findsOneWidget);

      answer.complete(boardJson([opportunityJson()]));
      await tester.pumpAndSettle();
      expect(find.text('Fleet renewal'), findsOneWidget);
    });

    testWidgets(
      'a pipeline that fails to load says why and can be retried',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on(
            'GET',
            '/opportunities/board',
            (request) => throw apiError(ApiError.network),
          );
        await _open(tester, api);

        expect(
          find.text(
            'The server cannot be reached. Check your connection and try again.',
          ),
          findsOneWidget,
        );

        api.on(
          'GET',
          '/opportunities/board',
          (request) => boardJson([opportunityJson()]),
        );
        await tapVisible(tester, find.text('Retry'));

        expect(find.text('Fleet renewal'), findsOneWidget);
      },
    );

    testWidgets('pull to refresh reads the pipeline again', (tester) async {
      final api = _api([opportunityJson()]);
      await _open(tester, api);
      api.on(
        'GET',
        '/opportunities/board',
        (request) => boardJson([opportunityJson(name: 'Fleet renewal 2027')]),
      );

      await tester.fling(
        find.text('Fleet renewal'),
        const Offset(0, 400),
        1000,
      );
      await tester.pumpAndSettle();

      expect(find.text('Fleet renewal 2027'), findsOneWidget);
      expect(api.sent('GET', '/opportunities/board'), hasLength(2));
    });

    testWidgets('a refresh that fails keeps the cards and says so', (
      tester,
    ) async {
      final api = _api([opportunityJson()]);
      await _open(tester, api);
      api.on(
        'GET',
        '/opportunities/board',
        (request) => throw apiError(ApiError.network),
      );

      await tester.fling(
        find.text('Fleet renewal'),
        const Offset(0, 400),
        1000,
      );
      await tester.pumpAndSettle();

      expect(find.text('Fleet renewal'), findsOneWidget);
      expect(
        find.text(
          'The server cannot be reached. Check your connection and try again.',
        ),
        findsOneWidget,
      );
    });

    testWidgets(
      'a stage with more than the board carries links to the list',
      variant: phones,
      (tester) async {
        final api = _api([opportunityJson()], counts: {'stage-new': 132})
          ..on('GET', '/pipeline-stages', (request) => pipelineStagesJson())
          ..on(
            'GET',
            '/opportunities',
            (request) => page([opportunityJson()], total: 132),
          );
        await _open(tester, api);

        expect(_stage('New · 132'), findsOneWidget);
        await scrollTo(tester, find.text('Showing 1 of 132.'));
        await tapVisible(tester, find.text('View all in the list'));

        // The list, showing that stage and nothing else.
        final query = api.sent('GET', '/opportunities').single.query;
        expect(query, containsPair('stageId', 'stage-new'));
        expect(query.containsKey('status'), false);
        expect(find.text('132 opportunities'), findsOneWidget);
        expect(
          tester
              .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'New'))
              .selected,
          true,
        );
      },
    );

    testWidgets('a card opens the opportunity', (tester) async {
      final api = _api([opportunityJson()])
        ..on('GET', '/opportunities/opp-1', (request) => opportunityJson())
        ..on('GET', '/opportunities/opp-1/timeline', (request) => page([]));
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.opportunities,
      );

      await tapVisible(tester, find.text('Fleet renewal'));

      expect(app.location, Routes.opportunity('opp-1'));
    });
  });

  group('moving a card', () {
    testWidgets('to another open stage, at once', variant: phones, (
      tester,
    ) async {
      final answer = Completer<Object?>();
      final api = _api([opportunityJson()])
        ..on('POST', '/opportunities/opp-1/stage', (request) => answer.future);
      await _open(tester, api);

      await tapVisible(tester, find.text('Move to stage'));
      // Every other stage: the open ones by name, Won and Lost as the two ways to close.
      expect(find.widgetWithText(ListTile, 'New'), findsNothing);
      expect(find.text('Qualified'), findsOneWidget);
      expect(find.text('Proposal'), findsOneWidget);
      expect(find.text('Close as won'), findsOneWidget);
      expect(find.text('Close as lost'), findsOneWidget);
      await tapVisible(tester, find.text('Qualified'));

      expect(api.sent('POST', '/opportunities/opp-1/stage').single.json, {
        'stageId': 'stage-qualified',
      });
      // The card has moved before the server answered.
      expect(_stage('New · 0'), findsOneWidget);
      expect(_stage('Qualified · 1'), findsOneWidget);
      expect(find.text('Fleet renewal'), findsNothing);
      expect(find.text('No opportunities in this stage.'), findsOneWidget);

      answer.complete(opportunityJson(stage: _qualified));
      await tester.pumpAndSettle();

      expect(find.text('Fleet renewal moved to Qualified.'), findsOneWidget);
      expect(_stage('Qualified · 1'), findsOneWidget);
      // The board was not read again: the answer is the card.
      expect(api.sent('GET', '/opportunities/board'), hasLength(1));
      await tapVisible(tester, _stage('Qualified · 1'));
      expect(find.text('Fleet renewal'), findsOneWidget);
      expect(find.text(r'$48,000 total'), findsOneWidget);
    });

    testWidgets('a move the API refuses is undone and said', variant: phones, (
      tester,
    ) async {
      final api =
          _api([
            opportunityJson(id: 'opp-0', name: 'Depot upgrade', value: 1000),
            opportunityJson(),
            opportunityJson(id: 'opp-2', name: 'Route planner', value: 500),
          ])..on(
            'POST',
            '/opportunities/opp-1/stage',
            (request) => throw apiError('FORBIDDEN', status: 403),
          );
      await _open(tester, api);

      await tapVisible(
        tester,
        find.descendant(
          of: find.widgetWithText(Card, 'Fleet renewal'),
          matching: find.text('Move to stage'),
        ),
      );
      await tapVisible(tester, find.text('Proposal'));

      expect(
        find.text(
          'Fleet renewal could not be moved. You do not have permission to do that.',
        ),
        findsOneWidget,
      );
      // Back where it was: the same stage, count, total and place.
      expect(_stage('New · 3'), findsOneWidget);
      expect(_stage('Proposal · 0'), findsOneWidget);
      // The message covers the middle of a small phone until it goes away.
      await tester.pump(const Duration(seconds: 7));
      await tester.pumpAndSettle();
      await scrollTo(tester, find.text(r'$49,500 total'));
      await scrollTo(tester, find.text('Fleet renewal'));
      await scrollTo(tester, find.text('Route planner'));
      expect(
        tester.getTopLeft(find.text('Fleet renewal')).dy,
        lessThan(tester.getTopLeft(find.text('Route planner')).dy),
      );
    });

    testWidgets(
      'choosing Lost asks for the reason, then closes it',
      variant: phones,
      (tester) async {
        final api = _api([opportunityJson()])
          ..on(
            'POST',
            '/opportunities/opp-1/close',
            (request) => opportunityJson(
              stage: _lost,
              closeReason: 'Went with Acme',
              closedAt: '2026-10-06T10:00:00.000Z',
            ),
          );
        await _open(tester, api);

        await tapVisible(tester, find.text('Move to stage'));
        await tapVisible(tester, find.text('Close as lost'));
        expect(
          find.text(
            'Record why Fleet renewal was not won. You can reopen it later.',
          ),
          findsOneWidget,
        );

        // Without a reason nothing is sent.
        await tapVisible(
          tester,
          find.widgetWithText(FilledButton, 'Close as lost'),
        );
        expect(find.text('Say why the opportunity was lost.'), findsOneWidget);
        expect(api.sent('POST', '/opportunities/opp-1/close'), isEmpty);

        await enterField(tester, 'Reason', ' Went with Acme ');
        await tapVisible(
          tester,
          find.widgetWithText(FilledButton, 'Close as lost'),
        );

        expect(api.sent('POST', '/opportunities/opp-1/close').single.json, {
          'outcome': 'LOST',
          'reason': 'Went with Acme',
        });
        expect(find.text('Fleet renewal was closed as lost.'), findsOneWidget);
        expect(_stage('New · 0'), findsOneWidget);
        expect(_stage('Lost · 1'), findsOneWidget);
      },
    );

    testWidgets('choosing Won closes it, with or without a reason', (
      tester,
    ) async {
      final api = _api([opportunityJson()])
        ..on(
          'POST',
          '/opportunities/opp-1/close',
          (request) => opportunityJson(stage: _won),
        );
      await _open(tester, api);

      await tapVisible(tester, find.text('Move to stage'));
      await tapVisible(tester, find.text('Close as won'));
      expect(find.text('Reason (optional)'), findsOneWidget);
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Close as won'),
      );

      expect(api.sent('POST', '/opportunities/opp-1/close').single.json, {
        'outcome': 'WON',
      });
      expect(find.text('Fleet renewal was closed as won.'), findsOneWidget);
      expect(_stage('Won · 1'), findsOneWidget);
    });

    testWidgets('a close the API refuses is said in the sheet', (tester) async {
      final api = _api([opportunityJson()])
        ..on(
          'POST',
          '/opportunities/opp-1/close',
          (request) => throw validationError({'reason': 'Too short'}),
        );
      await _open(tester, api);

      await tapVisible(tester, find.text('Move to stage'));
      await tapVisible(tester, find.text('Close as lost'));
      await enterField(tester, 'Reason', 'No');
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Close as lost'),
      );

      expect(find.text('Too short'), findsOneWidget);
      // The sheet is still open and the card has not moved.
      expect(
        find.widgetWithText(FilledButton, 'Close as lost'),
        findsOneWidget,
      );
      expect(_stage('New · 1'), findsOneWidget);
    });

    testWidgets(
      'a closed card is reopened into the first stage',
      variant: phones,
      (tester) async {
        final api = _api([opportunityJson(stage: _lost, closeReason: 'Price')])
          ..on(
            'POST',
            '/opportunities/opp-1/reopen',
            (request) => opportunityJson(),
          );
        await _open(tester, api);

        await tapVisible(tester, _stage('Lost · 1'));
        await tapVisible(tester, find.text('Reopen'));

        expect(
          api.sent('POST', '/opportunities/opp-1/reopen').single.json,
          <String, Object?>{},
        );
        expect(find.text('Fleet renewal was reopened in New.'), findsOneWidget);
        expect(_stage('Lost · 0'), findsOneWidget);
        expect(_stage('New · 1'), findsOneWidget);
      },
    );
  });
}
