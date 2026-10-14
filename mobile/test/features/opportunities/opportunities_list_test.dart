import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/status_badge.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

List<Object?> _opportunities(int from, int count) {
  return [
    for (var index = from; index < from + count; index += 1)
      opportunityJson(id: 'opp-$index', name: 'Deal number $index'),
  ];
}

/// The screen's two other requests: the pipeline it opens on, and the stages of the
/// filter.
FakeApi _api() {
  return FakeApi()
    ..on('GET', '/opportunities/board', (request) => boardJson([]))
    ..on('GET', '/pipeline-stages', (request) => pipelineStagesJson());
}

/// Answers `/opportunities` with as many pages of 25 as [total] needs.
FakeApi _paged(int total) {
  return _api()..on('GET', '/opportunities', (request) {
    final number = int.parse(request.query['page']!);
    final from = (number - 1) * 25 + 1;
    final count = (total - from + 1).clamp(0, 25);
    return page(_opportunities(from, count), total: total, page: number);
  });
}

/// Opens the Opportunities screen and switches it to the list.
Future<TestApp> _openList(
  WidgetTester tester,
  FakeApi api, {
  User user = rep,
}) async {
  final app = await pumpApp(
    tester,
    api: api,
    user: user,
    location: Routes.opportunities,
  );
  await tapVisible(tester, find.text('List'));
  return app;
}

Finder _chip(String label) => find.widgetWithText(ChoiceChip, label);

Map<String, String> _lastQuery(FakeApi api) =>
    api.sent('GET', '/opportunities').last.query;

void main() {
  _chipsStartAtTheLeft();

  testWidgets(
    'shows each opportunity with its stage, company, value and owner',
    variant: phones,
    (tester) async {
      final api = _api()
        ..on('GET', '/opportunities', (request) {
          return page([
            opportunityJson(),
            opportunityJson(
              id: 'opp-2',
              name:
                  'An Exceptionally Long Opportunity Name For The Whole Fleet',
              value: 1250.5,
              expectedCloseDate: null,
              contact: null,
              company: null,
              owner: manager,
              stage: stageJson(
                id: 'stage-long',
                name: 'Waiting for the procurement committee',
              ),
            ),
            opportunityJson(
              id: 'opp-3',
              name: 'Old deal',
              stage: pipelineStages[4],
            ),
          ], total: 3);
        });
      await _openList(tester, api);

      expect(find.text('3 opportunities'), findsOneWidget);
      expect(find.text('Fleet renewal'), findsOneWidget);
      expect(find.text('Northwind Logistics · Marcus Chen'), findsWidgets);
      expect(find.text(r'$48,000'), findsWidgets);
      expect(find.text('Expected close: Nov 15, 2026'), findsWidgets);
      // The stage is a badge on the card.
      expect(find.widgetWithText(StatusBadge, 'New'), findsWidgets);
      // The owner is named only when it is someone else's.
      expect(find.text('Riley Rep'), findsNothing);

      await tester.scrollUntilVisible(
        find.text('Old deal'),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.textContaining('Exceptionally Long'), findsOneWidget);
      expect(find.text(r'$1,250.50'), findsOneWidget);
      expect(find.text('Sarah Jenkins'), findsOneWidget);
      expect(
        find.text('Waiting for the procurement committee'),
        findsOneWidget,
      );
    },
  );

  testWidgets('the pipeline is first, and the switch remembers the list', (
    tester,
  ) async {
    final api = _paged(2);
    final app = await pumpApp(
      tester,
      api: api,
      user: rep,
      location: Routes.opportunities,
    );

    // The pipeline: the list was not asked for, and there is nothing to sort.
    expect(api.sent('GET', '/opportunities'), isEmpty);
    expect(find.byTooltip('Sort opportunities'), findsNothing);

    await tapVisible(tester, find.text('List'));
    expect(find.text('Deal number 1'), findsOneWidget);
    expect(find.byTooltip('Sort opportunities'), findsOneWidget);

    // Still the list after leaving the screen and coming back.
    app.router.go(Routes.more);
    await tester.pumpAndSettle();
    app.router.go(Routes.opportunities);
    await tester.pumpAndSettle();
    expect(find.text('Deal number 1'), findsOneWidget);

    await tapVisible(tester, find.text('Pipeline'));
    expect(find.text('No opportunities yet'), findsOneWidget);
  });

  testWidgets(
    'says so when there are no opportunities, by role',
    variant: phones,
    (tester) async {
      final api = _api()..on('GET', '/opportunities', (request) => page([]));
      await _openList(tester, api);

      expect(find.text('No opportunities yet'), findsOneWidget);
      expect(
        find.text('Add your first opportunity to start your pipeline.'),
        findsOneWidget,
      );
      expect(find.byTooltip('New opportunity'), findsOneWidget);
    },
  );

  testWidgets('a Read-only user gets no way to add an opportunity', (
    tester,
  ) async {
    final api = _api()..on('GET', '/opportunities', (request) => page([]));
    await _openList(tester, api, user: readOnly);

    expect(
      find.text('Opportunities will show here once someone adds them.'),
      findsOneWidget,
    );
    expect(find.byTooltip('New opportunity'), findsNothing);
  });

  testWidgets('shows a placeholder while the first page loads', (tester) async {
    final answer = Completer<Object?>();
    final api = _api()..on('GET', '/opportunities', (request) => answer.future);
    await pumpApp(tester, api: api, user: rep, location: Routes.opportunities);
    await tester.tap(find.text('List'));
    await tester.pump();
    await tester.pump();

    expect(find.bySemanticsLabel('Loading opportunities'), findsOneWidget);

    answer.complete(page(_opportunities(1, 1)));
    await tester.pumpAndSettle();
    expect(find.text('Deal number 1'), findsOneWidget);
  });

  testWidgets(
    'a list that fails to load says why and can be retried',
    variant: phones,
    (tester) async {
      final api = _api()
        ..on(
          'GET',
          '/opportunities',
          (request) => throw apiError(ApiError.network),
        );
      await _openList(tester, api);

      expect(
        find.text(
          'The server cannot be reached. Check your connection and try again.',
        ),
        findsOneWidget,
      );

      api.on('GET', '/opportunities', (request) => page(_opportunities(1, 2)));
      await tapVisible(tester, find.text('Retry'));

      expect(find.text('Deal number 1'), findsOneWidget);
    },
  );

  testWidgets('searches a moment after the typing stops', variant: phones, (
    tester,
  ) async {
    final api = _api()
      ..on('GET', '/opportunities', (request) {
        return request.query['search'] == 'fleet'
            ? page([opportunityJson()])
            : page(_opportunities(1, 3));
      });
    await _openList(tester, api);
    expect(api.sent('GET', '/opportunities'), hasLength(1));

    await tester.enterText(find.byType(TextField), 'fle');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(TextField), 'fleet');
    await tester.pump(const Duration(milliseconds: 100));
    // Still typing: nothing was asked yet.
    expect(api.sent('GET', '/opportunities'), hasLength(1));

    await tester.pump(SearchField.debounce);
    await tester.pumpAndSettle();

    expect(api.sent('GET', '/opportunities'), hasLength(2));
    expect(_lastQuery(api)['search'], 'fleet');
    expect(_lastQuery(api)['page'], '1');
    expect(find.text('Fleet renewal'), findsOneWidget);
    expect(find.text('1 opportunity'), findsOneWidget);

    await tapVisible(tester, find.byTooltip('Clear search'));
    expect(_lastQuery(api).containsKey('search'), false);
    expect(find.text('Deal number 1'), findsOneWidget);
  });

  testWidgets('a search without a match says so', (tester) async {
    final api = _api()
      ..on('GET', '/opportunities', (request) {
        return request.query.containsKey('search')
            ? page([])
            : page(_opportunities(1, 3));
      });
    await _openList(tester, api);

    await tester.enterText(find.byType(TextField), 'zzz');
    await tester.pump(SearchField.debounce);
    await tester.pumpAndSettle();

    expect(find.text('No opportunities match'), findsOneWidget);
    expect(
      find.text('Try a different search or remove a filter.'),
      findsOneWidget,
    );
  });

  testWidgets('filters by stage and by status, and sorts', variant: phones, (
    tester,
  ) async {
    final api = _paged(2);
    await _openList(tester, api);
    expect(_lastQuery(api), containsPair('sort', 'createdAt'));
    expect(_lastQuery(api), containsPair('order', 'desc'));
    expect(_lastQuery(api).containsKey('stageId'), false);
    expect(_lastQuery(api).containsKey('status'), false);
    expect(api.sent('GET', '/pipeline-stages'), hasLength(1));

    // Every stage of the pipeline, in order.
    await tapVisible(tester, _chip('Qualified'));
    expect(_lastQuery(api), containsPair('stageId', 'stage-qualified'));
    expect(_lastQuery(api), containsPair('page', '1'));

    await tapVisible(tester, _chip('Won').first);
    expect(_lastQuery(api), containsPair('stageId', 'stage-won'));
    expect(_lastQuery(api).containsKey('status'), false);

    await tapVisible(tester, _chip('All stages'));
    expect(_lastQuery(api).containsKey('stageId'), false);

    await tapVisible(tester, _chip('Open'));
    expect(_lastQuery(api), containsPair('status', 'OPEN'));
    await tapVisible(tester, _chip('Lost').last);
    expect(_lastQuery(api), containsPair('status', 'LOST'));
    await tapVisible(tester, _chip('Any status'));
    expect(_lastQuery(api).containsKey('status'), false);

    await tapVisible(tester, find.byTooltip('Sort opportunities'));
    expect(find.text('Newest first'), findsOneWidget);
    await tapVisible(tester, find.text('Value: highest'));
    expect(_lastQuery(api), containsPair('sort', 'value'));
    expect(_lastQuery(api), containsPair('order', 'desc'));

    await tapVisible(tester, find.byTooltip('Sort opportunities'));
    await tapVisible(tester, find.text('Closing soonest'));
    expect(_lastQuery(api), containsPair('sort', 'expectedCloseDate'));
    expect(_lastQuery(api), containsPair('order', 'asc'));
  });

  testWidgets('the stage filter falls back to the stages of the pipeline', (
    tester,
  ) async {
    // The stages cannot be read; the board, which was, still names them.
    final api = _paged(2)
      ..on(
        'GET',
        '/pipeline-stages',
        (request) => throw apiError(ApiError.network),
      );
    await _openList(tester, api);

    await tapVisible(tester, _chip('Proposal'));

    expect(_lastQuery(api), containsPair('stageId', 'stage-proposal'));
  });

  testWidgets('loads the next page as the end comes near', (tester) async {
    final api = _paged(30);
    await _openList(tester, api);
    expect(find.text('30 opportunities'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Deal number 30'),
      400,
      scrollable: find.byType(Scrollable).last,
      maxScrolls: 100,
    );
    await tester.pumpAndSettle();

    expect(find.text('Deal number 30'), findsOneWidget);
    expect(
      api.sent('GET', '/opportunities').map((request) => request.query['page']),
      ['1', '2'],
    );
  });

  testWidgets('a next page that fails keeps the rows, with Retry', (
    tester,
  ) async {
    final api = _paged(30);
    await _openList(tester, api);
    api.on('GET', '/opportunities', (request) {
      throw apiError(ApiError.network);
    });

    await tester.scrollUntilVisible(
      find.text('Retry'),
      400,
      scrollable: find.byType(Scrollable).last,
      maxScrolls: 100,
    );
    expect(find.text('Deal number 25'), findsOneWidget);

    api.on('GET', '/opportunities', (request) {
      return page(_opportunities(26, 5), total: 30, page: 2);
    });
    await tapVisible(tester, find.text('Retry'));
    await tester.scrollUntilVisible(
      find.text('Deal number 30'),
      400,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Deal number 30'), findsOneWidget);
  });

  testWidgets('pull to refresh reads the first page again', (tester) async {
    final api = _paged(2);
    await _openList(tester, api);
    api.on('GET', '/opportunities', (request) => page(_opportunities(7, 1)));

    await tester.fling(find.text('Deal number 1'), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Deal number 7'), findsOneWidget);
    expect(find.text('Deal number 1'), findsNothing);
  });

  testWidgets('a refresh that fails keeps the rows and says so', (
    tester,
  ) async {
    final api = _paged(2);
    await _openList(tester, api);
    api.on(
      'GET',
      '/opportunities',
      (request) => throw apiError(ApiError.network),
    );

    await tester.fling(find.text('Deal number 1'), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Deal number 1'), findsOneWidget);
    expect(
      find.text(
        'The server cannot be reached. Check your connection and try again.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('opens an opportunity, and "New" opens the form', (tester) async {
    final api = _paged(1)
      ..on(
        'GET',
        '/opportunities/opp-1',
        (request) => opportunityJson(name: 'Deal number 1'),
      )
      ..on('GET', '/opportunities/opp-1/timeline', (request) => page([]));
    final app = await _openList(tester, api);

    await tapVisible(tester, find.text('Deal number 1'));
    expect(app.location, Routes.opportunity('opp-1'));

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(app.location, Routes.opportunities);

    await tapVisible(tester, find.byTooltip('New opportunity'));
    expect(app.location, Routes.newOpportunity);
    expect(find.text('Create opportunity'), findsOneWidget);
    // A form covers the bottom bar.
    expect(find.byType(NavigationBar).hitTestable(), findsNothing);
  });

  testWidgets('is reached from the More tab', (tester) async {
    final api = _api();
    final app = await pumpApp(tester, api: api, user: rep);

    await tapVisible(tester, find.text('More'));
    await tapVisible(tester, find.text('Opportunities'));

    expect(app.location, Routes.opportunities);
    expect(find.text('Pipeline'), findsOneWidget);
  });

  testWidgets('the Home tile "Pipeline value" opens the pipeline', (
    tester,
  ) async {
    final api = _api();
    final app = await pumpApp(tester, api: api, user: rep);

    await tapVisible(tester, find.text('Pipeline value'));

    expect(app.location, Routes.opportunities);
  });
}

void _chipsStartAtTheLeft() {
  testWidgets('on a tablet a row of chips that fits starts at the left, under '
      'the search box', (tester) async {
    final api = _paged(1);
    await pumpApp(
      tester,
      api: api,
      user: rep,
      location: Routes.opportunities,
      surface: tablet,
    );
    await tapVisible(tester, find.text('List'));

    final search = tester.getTopLeft(find.byType(SearchField));
    final firstChip = tester.getTopLeft(_chip('Any status'));
    expect(firstChip.dx, closeTo(search.dx, 1));
  });
}
