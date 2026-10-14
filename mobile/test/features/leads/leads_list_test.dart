import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/widgets/list_controls.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

List<Object?> _leads(int from, int count) {
  return [
    for (var index = from; index < from + count; index += 1)
      leadJson(id: 'lead-$index', firstName: 'Lead', lastName: 'Number $index'),
  ];
}

/// Answers `/leads` with as many pages of 25 as [total] needs.
FakeApi _paged(int total) {
  return FakeApi()..on('GET', '/leads', (request) {
    final number = int.parse(request.query['page']!);
    final from = (number - 1) * 25 + 1;
    final count = (total - from + 1).clamp(0, 25);
    return page(_leads(from, count), total: total, page: number);
  });
}

void main() {
  testWidgets(
    'shows each lead with its status, company, owner and follow-up',
    variant: phones,
    (tester) async {
      final soon = DateTime.now().add(const Duration(days: 3)).toUtc();
      final api = FakeApi()
        ..on('GET', '/leads', (request) {
          return page([
            leadJson(status: 'QUALIFIED', followUpAt: soon.toIso8601String()),
            leadJson(
              id: 'lead-2',
              firstName: 'Bartholomew Maximilian',
              lastName: 'Featherstonehaugh-Cholmondeley',
              company:
                  'An Exceptionally Long Company Name Incorporated and Sons',
              status: 'CONTACTED',
              owner: manager,
              followUpAt: '2026-10-01T09:00:00.000Z',
            ),
            leadJson(
              id: 'lead-3',
              firstName: 'Devon',
              lastName: 'Vance',
              status: 'LOST',
            ),
          ], total: 3);
        });
      await pumpApp(tester, api: api, user: manager, location: Routes.leads);

      expect(find.text('3 leads'), findsOneWidget);
      expect(find.text('Marcus Chen'), findsOneWidget);
      expect(find.text('Northwind Logistics'), findsWidgets);
      expect(
        find.text('Qualified'),
        findsNWidgets(2),
      ); // the filter chip and the badge
      expect(find.textContaining('Next follow-up: '), findsOneWidget);
      expect(find.text('No contact yet'), findsWidgets);

      await tester.scrollUntilVisible(
        find.textContaining('Overdue follow-up: Oct 1, 2026'),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.textContaining('Featherstonehaugh'), findsOneWidget);
      expect(find.text('Sarah Jenkins'), findsOneWidget);
    },
  );

  testWidgets('says so when there are no leads, by role', variant: phones, (
    tester,
  ) async {
    final api = FakeApi()..on('GET', '/leads', (request) => page([]));
    await pumpApp(tester, api: api, user: rep, location: Routes.leads);

    expect(find.text('No leads yet'), findsOneWidget);
    expect(
      find.text('Add the first lead to start tracking it.'),
      findsOneWidget,
    );
    expect(find.text('New lead'), findsOneWidget);
  });

  testWidgets('a Read-only user gets no way to add a lead', (tester) async {
    final api = FakeApi()..on('GET', '/leads', (request) => page([]));
    await pumpApp(tester, api: api, user: readOnly, location: Routes.leads);

    expect(
      find.text('Leads will show here once someone adds them.'),
      findsOneWidget,
    );
    expect(find.text('New lead'), findsNothing);
  });

  testWidgets('shows a placeholder while the first page loads', (tester) async {
    final answer = Completer<Object?>();
    final api = FakeApi()..on('GET', '/leads', (request) => answer.future);
    final app = await pumpApp(tester, api: api, user: rep);
    app.router.go(Routes.leads);
    await tester.pump();
    await tester.pump();

    expect(find.bySemanticsLabel('Loading leads'), findsOneWidget);

    answer.complete(page(_leads(1, 1)));
    await tester.pumpAndSettle();
    expect(find.text('Lead Number 1'), findsOneWidget);
  });

  testWidgets(
    'a list that fails to load says why and can be retried',
    variant: phones,
    (tester) async {
      final api = FakeApi()
        ..on('GET', '/leads', (request) => throw apiError(ApiError.network));
      await pumpApp(tester, api: api, user: rep, location: Routes.leads);

      expect(
        find.text(
          'The server cannot be reached. Check your connection and try again.',
        ),
        findsOneWidget,
      );

      api.on('GET', '/leads', (request) => page(_leads(1, 2)));
      await tapVisible(tester, find.text('Retry'));

      expect(find.text('Lead Number 1'), findsOneWidget);
    },
  );

  testWidgets('searches a moment after the typing stops', variant: phones, (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET', '/leads', (request) {
        return request.query['search'] == 'north'
            ? page([leadJson()])
            : page(_leads(1, 3));
      });
    await pumpApp(tester, api: api, user: rep, location: Routes.leads);
    expect(api.sent('GET', '/leads'), hasLength(1));

    await tester.enterText(find.byType(TextField), 'nor');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(TextField), 'north');
    await tester.pump(const Duration(milliseconds: 100));
    // Still typing: nothing was asked yet.
    expect(api.sent('GET', '/leads'), hasLength(1));

    await tester.pump(SearchField.debounce);
    await tester.pumpAndSettle();

    expect(api.sent('GET', '/leads'), hasLength(2));
    expect(api.requests.last.query['search'], 'north');
    expect(api.requests.last.query['page'], '1');
    expect(find.text('Marcus Chen'), findsOneWidget);
    expect(find.text('1 lead'), findsOneWidget);

    await tapVisible(tester, find.byTooltip('Clear search'));
    expect(api.requests.last.query.containsKey('search'), false);
    expect(find.text('Lead Number 1'), findsOneWidget);
  });

  testWidgets('a search without a match says so', (tester) async {
    final api = FakeApi()
      ..on('GET', '/leads', (request) {
        return request.query.containsKey('search')
            ? page([])
            : page(_leads(1, 3));
      });
    await pumpApp(tester, api: api, user: rep, location: Routes.leads);

    await tester.enterText(find.byType(TextField), 'zzz');
    await tester.pump(SearchField.debounce);
    await tester.pumpAndSettle();

    expect(find.text('No leads match'), findsOneWidget);
    expect(find.text('Try another search or status.'), findsOneWidget);
  });

  testWidgets('filters by status and sorts', variant: phones, (tester) async {
    final api = FakeApi()..on('GET', '/leads', (request) => page(_leads(1, 2)));
    await pumpApp(tester, api: api, user: rep, location: Routes.leads);
    expect(api.requests.last.query, containsPair('sort', 'createdAt'));
    expect(api.requests.last.query, containsPair('order', 'desc'));
    expect(api.requests.last.query.containsKey('status'), false);

    await tapVisible(tester, find.widgetWithText(ChoiceChip, 'Contacted'));
    expect(api.requests.last.query, containsPair('status', 'CONTACTED'));

    await tapVisible(tester, find.byTooltip('Sort leads'));
    expect(find.byIcon(Icons.check), findsOneWidget);
    await tapVisible(tester, find.text('Name (A to Z)'));
    expect(api.requests.last.query, containsPair('sort', 'name'));
    expect(api.requests.last.query, containsPair('order', 'asc'));
    // The filter stays while the order changes.
    expect(api.requests.last.query, containsPair('status', 'CONTACTED'));

    await tapVisible(tester, find.widgetWithText(ChoiceChip, 'All'));
    expect(api.requests.last.query.containsKey('status'), false);
  });

  testWidgets('loads the next page as the end comes near', variant: phones, (
    tester,
  ) async {
    final api = _paged(60);
    await pumpApp(tester, api: api, user: rep, location: Routes.leads);
    expect(find.text('60 leads'), findsOneWidget);
    expect(api.sent('GET', '/leads'), hasLength(1));

    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(
      find.text('Lead Number 30'),
      400,
      scrollable: list,
    );
    await tester.pumpAndSettle();
    expect(api.sent('GET', '/leads').map((request) => request.query['page']), [
      '1',
      '2',
    ]);

    await tester.scrollUntilVisible(
      find.text('Lead Number 60'),
      400,
      scrollable: list,
    );
    await tester.pumpAndSettle();
    expect(api.sent('GET', '/leads'), hasLength(3));

    // The end: scrolling further asks for nothing.
    await tester.drag(list, const Offset(0, -800));
    await tester.pumpAndSettle();
    expect(api.sent('GET', '/leads'), hasLength(3));
  });

  testWidgets('a next page that fails keeps the rows and offers Retry', (
    tester,
  ) async {
    var fail = true;
    final api = FakeApi()
      ..on('GET', '/leads', (request) {
        if (request.query['page'] == '1') {
          return page(_leads(1, 25), total: 30);
        }
        if (fail) {
          throw apiError(ApiError.timeout);
        }
        return page(_leads(26, 5), total: 30, page: 2);
      });
    await pumpApp(tester, api: api, user: rep, location: Routes.leads);

    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(
      find.text('The server took too long to answer. Try again.'),
      400,
      scrollable: list,
    );
    expect(find.text('Lead Number 25'), findsOneWidget);

    fail = false;
    await tapVisible(tester, find.text('Retry'));
    await tester.scrollUntilVisible(
      find.text('Lead Number 30'),
      400,
      scrollable: list,
    );
    expect(find.text('Lead Number 30'), findsOneWidget);
  });

  testWidgets('pull to refresh reads the first page again', (tester) async {
    final api = FakeApi()..on('GET', '/leads', (request) => page(_leads(1, 2)));
    await pumpApp(tester, api: api, user: rep, location: Routes.leads);
    api.on('GET', '/leads', (request) => page(_leads(7, 1)));

    await tester.fling(find.text('Lead Number 1'), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Lead Number 7'), findsOneWidget);
    expect(find.text('Lead Number 1'), findsNothing);
  });

  testWidgets('a refresh that fails keeps the rows and says so', (
    tester,
  ) async {
    final api = FakeApi()..on('GET', '/leads', (request) => page(_leads(1, 2)));
    await pumpApp(tester, api: api, user: rep, location: Routes.leads);
    api.on('GET', '/leads', (request) => throw apiError(ApiError.network));

    await tester.fling(find.text('Lead Number 1'), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();

    expect(find.text('Lead Number 1'), findsOneWidget);
    expect(
      find.text(
        'The server cannot be reached. Check your connection and try again.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('opens a lead, and "New lead" opens the form', (tester) async {
    final api = FakeApi()
      ..on('GET', '/leads', (request) => page([leadJson()]))
      ..on('GET', '/leads/lead-1', (request) => leadJson())
      ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
    final app = await pumpApp(
      tester,
      api: api,
      user: rep,
      location: Routes.leads,
    );

    await tapVisible(tester, find.text('Marcus Chen'));
    expect(app.location, Routes.lead('lead-1'));

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(app.location, Routes.leads);

    await tapVisible(tester, find.text('New lead'));
    expect(app.location, Routes.newLead);
    expect(find.text('Create lead'), findsOneWidget);
    // A form covers the bottom bar.
    expect(find.byType(NavigationBar).hitTestable(), findsNothing);
  });
}
