import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/widgets/list_controls.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

List<Object?> _companies(int from, int count) {
  return [
    for (var index = from; index < from + count; index += 1)
      companyJson(id: 'company-$index', name: 'Company Number $index'),
  ];
}

/// The companies list with [answer] for its rows and two industries in use.
FakeApi _api(FakeHandler answer) {
  return FakeApi()
    ..on('GET', '/companies', answer)
    ..on('GET', '/companies/industries', (request) => ['Logistics', 'Retail']);
}

void main() {
  testWidgets(
    'shows each company with its industry, owner and contacts',
    variant: phones,
    (tester) async {
      final api = _api((request) {
        return page([
          companyJson(contactCount: 1),
          companyJson(
            id: 'company-2',
            name: 'An Exceptionally Long Company Name Incorporated and Sons',
            industry: 'Wholesale Distribution of Industrial Machinery',
            owner: manager,
            contactCount: 14,
          ),
          companyJson(
            id: 'company-3',
            name: 'Acme Tools',
            industry: null,
            contactCount: 0,
          ),
        ], total: 3);
      });
      await pumpApp(
        tester,
        api: api,
        user: manager,
        location: Routes.companies,
      );

      expect(find.text('3 companies'), findsOneWidget);
      expect(find.text('Northwind Logistics'), findsOneWidget);
      expect(find.text('1 contact'), findsOneWidget);
      expect(find.text('Riley Rep'), findsWidgets);
      await scrollTo(tester, find.text('Acme Tools'));
      expect(find.text('0 contacts'), findsOneWidget);
    },
  );

  testWidgets('says so when there are no companies, by role', variant: phones, (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET', '/companies', (request) => page([]))
      ..on('GET', '/companies/industries', (request) => const <Object?>[]);
    await pumpApp(tester, api: api, user: rep, location: Routes.companies);

    expect(find.text('No companies yet'), findsOneWidget);
    expect(
      find.text('Add your first company, then link its contacts to it.'),
      findsOneWidget,
    );
    // Nothing to filter by: no chips.
    expect(find.byType(ChoiceChip), findsNothing);
  });

  testWidgets('a Read-only user gets no way to add a company', (tester) async {
    final api = FakeApi()
      ..on('GET', '/companies', (request) => page([]))
      ..on('GET', '/companies/industries', (request) => const <Object?>[]);
    await pumpApp(tester, api: api, user: readOnly, location: Routes.companies);

    expect(
      find.text('Companies will show here once someone adds them.'),
      findsOneWidget,
    );
    expect(find.text('New company'), findsNothing);
  });

  testWidgets(
    'a list that fails to load says why and can be retried',
    variant: phones,
    (tester) async {
      final api = _api((request) => throw apiError(ApiError.network));
      await pumpApp(tester, api: api, user: rep, location: Routes.companies);

      expect(
        find.text(
          'The server cannot be reached. Check your connection and try again.',
        ),
        findsOneWidget,
      );

      api.on('GET', '/companies', (request) => page(_companies(1, 2)));
      await tapVisible(tester, find.text('Retry'));

      expect(find.text('Company Number 1'), findsOneWidget);
    },
  );

  testWidgets('searches a moment after the typing stops', variant: phones, (
    tester,
  ) async {
    final api = _api((request) {
      return request.query['search'] == 'north'
          ? page([companyJson()])
          : page(_companies(1, 3));
    });
    await pumpApp(tester, api: api, user: rep, location: Routes.companies);
    expect(api.sent('GET', '/companies'), hasLength(1));

    await tester.enterText(find.byType(TextField), 'north');
    await tester.pump(const Duration(milliseconds: 100));
    // Still typing: nothing was asked yet.
    expect(api.sent('GET', '/companies'), hasLength(1));
    await tester.pump(SearchField.debounce);
    await tester.pumpAndSettle();

    final sent = api.sent('GET', '/companies');
    expect(sent, hasLength(2));
    expect(sent.last.query['search'], 'north');
    expect(find.text('Northwind Logistics'), findsOneWidget);
    expect(find.text('1 company'), findsOneWidget);
  });

  testWidgets('a search without a match says so', (tester) async {
    final api = _api((request) {
      return request.query.containsKey('search')
          ? page([])
          : page(_companies(1, 3));
    });
    await pumpApp(tester, api: api, user: rep, location: Routes.companies);

    await tester.enterText(find.byType(TextField), 'zzz');
    await tester.pump(SearchField.debounce);
    await tester.pumpAndSettle();

    expect(find.text('No companies match'), findsOneWidget);
    expect(find.text('Try another search or industry.'), findsOneWidget);
  });

  testWidgets('filters by an industry in use, and sorts', variant: phones, (
    tester,
  ) async {
    final api = _api((request) => page(_companies(1, 2)));
    await pumpApp(tester, api: api, user: rep, location: Routes.companies);
    List<FakeRequest> lists() => api.sent('GET', '/companies');
    expect(lists().last.query, containsPair('sort', 'name'));
    expect(lists().last.query, containsPair('order', 'asc'));
    expect(lists().last.query.containsKey('industry'), false);
    expect(api.sent('GET', '/companies/industries'), hasLength(1));

    await tapVisible(tester, find.widgetWithText(ChoiceChip, 'Retail'));
    expect(lists().last.query, containsPair('industry', 'Retail'));

    await tapVisible(tester, find.byTooltip('Sort companies'));
    expect(find.byIcon(Icons.check), findsOneWidget);
    await tapVisible(tester, find.text('Newest first'));
    expect(lists().last.query, containsPair('sort', 'createdAt'));
    expect(lists().last.query, containsPair('order', 'desc'));
    // The filter stays while the order changes.
    expect(lists().last.query, containsPair('industry', 'Retail'));

    await tapVisible(tester, find.widgetWithText(ChoiceChip, 'All'));
    expect(lists().last.query.containsKey('industry'), false);
  });

  testWidgets('works without the filter when the industries cannot be read', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET', '/companies', (request) => page(_companies(1, 2)))
      ..on('GET', '/companies/industries', (request) {
        throw apiError('INTERNAL_ERROR', status: 500);
      });
    await pumpApp(tester, api: api, user: rep, location: Routes.companies);

    expect(find.text('Company Number 1'), findsOneWidget);
    expect(find.byType(ChoiceChip), findsNothing);
  });

  testWidgets('loads the next page as the end comes near', variant: phones, (
    tester,
  ) async {
    final api = _api((request) {
      final number = int.parse(request.query['page']!);
      final from = (number - 1) * 25 + 1;
      return page(
        _companies(from, (40 - from + 1).clamp(0, 25)),
        total: 40,
        page: number,
      );
    });
    await pumpApp(tester, api: api, user: rep, location: Routes.companies);
    expect(find.text('40 companies'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Company Number 40'),
      400,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();

    expect(
      api.sent('GET', '/companies').map((request) => request.query['page']),
      ['1', '2'],
    );
  });

  testWidgets('pull to refresh reads the list and the industries again', (
    tester,
  ) async {
    final api = _api((request) => page(_companies(1, 2)));
    await pumpApp(tester, api: api, user: rep, location: Routes.companies);
    api
      ..on('GET', '/companies', (request) => page(_companies(7, 1)))
      ..on('GET', '/companies/industries', (request) => ['Farming']);

    await tester.fling(
      find.text('Company Number 1'),
      const Offset(0, 400),
      1000,
    );
    await tester.pumpAndSettle();

    expect(find.text('Company Number 7'), findsOneWidget);
    expect(find.text('Company Number 1'), findsNothing);
    expect(find.widgetWithText(ChoiceChip, 'Farming'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, 'Retail'), findsNothing);
  });

  testWidgets('is reached from the More tab', (tester) async {
    final api = _api((request) => page([companyJson()]));
    final app = await pumpApp(
      tester,
      api: api,
      user: readOnly,
      location: Routes.more,
    );

    await tapVisible(tester, find.text('Companies'));

    expect(app.location, Routes.companies);
    expect(find.text('Northwind Logistics'), findsOneWidget);
  });

  testWidgets('opens a company, and "New company" opens the form', (
    tester,
  ) async {
    final api = _api((request) => page([companyJson()]))
      ..on('GET', '/companies/company-1', (request) => companyJson())
      ..on('GET', '/companies/company-1/timeline', (request) => page([]))
      ..on('GET', '/contacts', (request) => page([]));
    final app = await pumpApp(
      tester,
      api: api,
      user: rep,
      location: Routes.companies,
    );

    await tapVisible(tester, find.text('Northwind Logistics'));
    expect(app.location, Routes.company('company-1'));

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(app.location, Routes.companies);

    await tapVisible(tester, find.text('New company'));
    expect(app.location, Routes.newCompany);
    expect(find.text('Create company'), findsOneWidget);
    // A form covers the bottom bar.
    expect(find.byType(NavigationBar).hitTestable(), findsNothing);
  });
}
