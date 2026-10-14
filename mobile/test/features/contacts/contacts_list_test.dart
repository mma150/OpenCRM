import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/features/contacts/contacts_providers.dart';
import 'package:opencrm/features/leads/lead.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

List<Object?> _contacts(int from, int count) {
  return [
    for (var index = from; index < from + count; index += 1)
      contactJson(
        id: 'contact-$index',
        firstName: 'Contact',
        lastName: 'Number $index',
      ),
  ];
}

/// Answers `/contacts` with as many pages of 25 as [total] needs.
FakeApi _paged(int total) {
  return FakeApi()..on('GET', '/contacts', (request) {
    final number = int.parse(request.query['page']!);
    final from = (number - 1) * 25 + 1;
    final count = (total - from + 1).clamp(0, 25);
    return page(_contacts(from, count), total: total, page: number);
  });
}

void main() {
  testWidgets(
    'shows each contact with its job, company, owner and last contact',
    variant: phones,
    (tester) async {
      final api = FakeApi()
        ..on('GET', '/contacts', (request) {
          return page([
            contactJson(lastContactAt: '2026-10-01T09:00:00.000Z'),
            contactJson(
              id: 'contact-2',
              firstName: 'Bartholomew Maximilian',
              lastName: 'Featherstonehaugh-Cholmondeley',
              jobTitle: 'Senior Vice President of Procurement and Logistics',
              company: {
                'id': 'company-2',
                'name':
                    'An Exceptionally Long Company Name Incorporated and Sons',
              },
              owner: manager,
            ),
            contactJson(
              id: 'contact-3',
              firstName: 'Devon',
              lastName: 'Vance',
              jobTitle: null,
              company: null,
            ),
          ], total: 3);
        });
      await pumpApp(tester, api: api, user: manager, location: Routes.contacts);

      expect(find.text('3 contacts'), findsOneWidget);
      expect(find.text('Marcus Chen'), findsOneWidget);
      expect(
        find.text('Operations Director · Northwind Logistics'),
        findsOneWidget,
      );
      expect(find.text('Last contact: Oct 1, 2026'), findsOneWidget);
      expect(find.text('Riley Rep'), findsWidgets);
      expect(find.text('No contact yet'), findsWidgets);
      await scrollTo(tester, find.text('Devon Vance'));
      expect(find.text('Devon Vance'), findsOneWidget);
    },
  );

  testWidgets('says so when there are no contacts, by role', variant: phones, (
    tester,
  ) async {
    final api = FakeApi()..on('GET', '/contacts', (request) => page([]));
    await pumpApp(tester, api: api, user: rep, location: Routes.contacts);

    expect(find.text('No contacts yet'), findsOneWidget);
    expect(
      find.text('Add your first contact to keep track of your conversations.'),
      findsOneWidget,
    );
    expect(find.text('0 contacts'), findsNothing);
  });

  testWidgets('a Read-only user gets no way to add a contact', (tester) async {
    final api = FakeApi()..on('GET', '/contacts', (request) => page([]));
    await pumpApp(tester, api: api, user: readOnly, location: Routes.contacts);

    expect(
      find.text('Contacts will show here once someone adds them.'),
      findsOneWidget,
    );
    expect(find.text('New contact'), findsNothing);
  });

  testWidgets('shows a placeholder while the first page loads', (tester) async {
    final answer = Completer<Object?>();
    final api = FakeApi()..on('GET', '/contacts', (request) => answer.future);
    final app = await pumpApp(tester, api: api, user: rep);
    app.router.go(Routes.contacts);
    await tester.pump();
    await tester.pump();

    expect(find.bySemanticsLabel('Loading contacts'), findsOneWidget);

    answer.complete(page(_contacts(1, 1)));
    await tester.pumpAndSettle();
    expect(find.text('Contact Number 1'), findsOneWidget);
  });

  testWidgets(
    'a list that fails to load says why and can be retried',
    variant: phones,
    (tester) async {
      final api = FakeApi()
        ..on('GET', '/contacts', (request) => throw apiError(ApiError.network));
      await pumpApp(tester, api: api, user: rep, location: Routes.contacts);

      expect(
        find.text(
          'The server cannot be reached. Check your connection and try again.',
        ),
        findsOneWidget,
      );

      api.on('GET', '/contacts', (request) => page(_contacts(1, 2)));
      await tapVisible(tester, find.text('Retry'));

      expect(find.text('Contact Number 1'), findsOneWidget);
    },
  );

  testWidgets('searches a moment after the typing stops', variant: phones, (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET', '/contacts', (request) {
        return request.query['search'] == 'chen'
            ? page([contactJson()])
            : page(_contacts(1, 3));
      });
    await pumpApp(tester, api: api, user: rep, location: Routes.contacts);
    expect(api.sent('GET', '/contacts'), hasLength(1));

    await tester.enterText(find.byType(TextField), 'ch');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(TextField), 'chen');
    await tester.pump(const Duration(milliseconds: 100));
    // Still typing: nothing was asked yet.
    expect(api.sent('GET', '/contacts'), hasLength(1));

    await tester.pump(SearchField.debounce);
    await tester.pumpAndSettle();

    expect(api.sent('GET', '/contacts'), hasLength(2));
    expect(api.requests.last.query['search'], 'chen');
    expect(api.requests.last.query['page'], '1');
    expect(find.text('Marcus Chen'), findsOneWidget);
    expect(find.text('1 contact'), findsOneWidget);

    await tapVisible(tester, find.byTooltip('Clear search'));
    expect(api.requests.last.query.containsKey('search'), false);
    expect(find.text('Contact Number 1'), findsOneWidget);
  });

  testWidgets('a search without a match says so', (tester) async {
    final api = FakeApi()
      ..on('GET', '/contacts', (request) {
        return request.query.containsKey('search')
            ? page([])
            : page(_contacts(1, 3));
      });
    await pumpApp(tester, api: api, user: rep, location: Routes.contacts);

    await tester.enterText(find.byType(TextField), 'zzz');
    await tester.pump(SearchField.debounce);
    await tester.pumpAndSettle();

    expect(find.text('No contacts match'), findsOneWidget);
    expect(find.text('Try another search.'), findsOneWidget);
  });

  testWidgets('sorts by name unless asked otherwise', variant: phones, (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET', '/contacts', (request) => page(_contacts(1, 2)));
    await pumpApp(tester, api: api, user: rep, location: Routes.contacts);
    expect(api.requests.last.query, containsPair('sort', 'name'));
    expect(api.requests.last.query, containsPair('order', 'asc'));
    expect(api.requests.last.query.containsKey('companyId'), false);

    await tapVisible(tester, find.byTooltip('Sort contacts'));
    expect(find.byIcon(Icons.check), findsOneWidget);
    await tapVisible(tester, find.text('Last contact: newest'));
    expect(api.requests.last.query, containsPair('sort', 'lastContactAt'));
    expect(api.requests.last.query, containsPair('order', 'desc'));

    await tapVisible(tester, find.byTooltip('Sort contacts'));
    await tapVisible(tester, find.text('Company A–Z'));
    expect(api.requests.last.query, containsPair('sort', 'company'));
    expect(api.requests.last.query, containsPair('order', 'asc'));
  });

  testWidgets(
    'narrowed to a company it says so, and the chip shows everyone again',
    variant: phones,
    (tester) async {
      final api = FakeApi()
        ..on('GET', '/contacts', (request) {
          return request.query.containsKey('companyId')
              ? page([contactJson()])
              : page(_contacts(1, 3));
        })
        ..on('GET', '/companies/company-1', (request) => companyJson());
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.contacts,
      );

      // What "View all" on a company's page does.
      app.container
          .read(contactsQueryProvider.notifier)
          .filterByCompany(
            const RecordLink(
              id: 'company-1',
              name: 'Northwind Logistics and Worldwide Freight Forwarding',
            ),
          );
      await tester.pumpAndSettle();

      expect(api.requests.last.query, containsPair('companyId', 'company-1'));
      expect(
        find.text(
          'Company: Northwind Logistics and Worldwide Freight Forwarding',
        ),
        findsOneWidget,
      );
      expect(find.text('1 contact'), findsOneWidget);

      // A new contact starts in that company.
      await tapVisible(tester, find.text('New contact'));
      expect(app.location, Routes.newContact);
      expect(
        app.router.routerDelegate.currentConfiguration.uri.queryParameters,
        {'companyId': 'company-1'},
      );
      app.router.go(Routes.contacts);
      await tester.pumpAndSettle();
      await tapVisible(tester, find.byTooltip('Show all contacts'));
      expect(api.requests.last.query.containsKey('companyId'), false);
      expect(find.textContaining('Company:'), findsNothing);
      expect(find.text('3 contacts'), findsOneWidget);
    },
  );

  testWidgets('a company without contacts says so', (tester) async {
    final api = FakeApi()..on('GET', '/contacts', (request) => page([]));
    final app = await pumpApp(
      tester,
      api: api,
      user: rep,
      location: Routes.contacts,
    );

    app.container
        .read(contactsQueryProvider.notifier)
        .filterByCompany(const RecordLink(id: 'company-1', name: 'Northwind'));
    await tester.pumpAndSettle();

    expect(find.text('No contacts match'), findsOneWidget);
    expect(
      find.text('No contacts are linked to this company.'),
      findsOneWidget,
    );
  });

  testWidgets('loads the next page as the end comes near', variant: phones, (
    tester,
  ) async {
    final api = _paged(60);
    await pumpApp(tester, api: api, user: rep, location: Routes.contacts);
    expect(find.text('60 contacts'), findsOneWidget);
    expect(api.sent('GET', '/contacts'), hasLength(1));

    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(
      find.text('Contact Number 30'),
      400,
      scrollable: list,
    );
    await tester.pumpAndSettle();
    expect(
      api.sent('GET', '/contacts').map((request) => request.query['page']),
      ['1', '2'],
    );

    await tester.scrollUntilVisible(
      find.text('Contact Number 60'),
      400,
      scrollable: list,
    );
    await tester.pumpAndSettle();
    expect(api.sent('GET', '/contacts'), hasLength(3));

    // The end: scrolling further asks for nothing.
    await tester.drag(list, const Offset(0, -800));
    await tester.pumpAndSettle();
    expect(api.sent('GET', '/contacts'), hasLength(3));
  });

  testWidgets('a next page that fails keeps the rows and offers Retry', (
    tester,
  ) async {
    var fail = true;
    final api = FakeApi()
      ..on('GET', '/contacts', (request) {
        if (request.query['page'] == '1') {
          return page(_contacts(1, 25), total: 30);
        }
        if (fail) {
          throw apiError(ApiError.timeout);
        }
        return page(_contacts(26, 5), total: 30, page: 2);
      });
    await pumpApp(tester, api: api, user: rep, location: Routes.contacts);

    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(
      find.text('The server took too long to answer. Try again.'),
      400,
      scrollable: list,
    );
    expect(find.text('Contact Number 25'), findsOneWidget);

    fail = false;
    await tapVisible(tester, find.text('Retry'));
    await tester.scrollUntilVisible(
      find.text('Contact Number 30'),
      400,
      scrollable: list,
    );
    expect(find.text('Contact Number 30'), findsOneWidget);
  });

  testWidgets('pull to refresh reads the first page again', (tester) async {
    final api = FakeApi()
      ..on('GET', '/contacts', (request) => page(_contacts(1, 2)));
    await pumpApp(tester, api: api, user: rep, location: Routes.contacts);
    api.on('GET', '/contacts', (request) => page(_contacts(7, 1)));

    await tester.fling(
      find.text('Contact Number 1'),
      const Offset(0, 400),
      1000,
    );
    await tester.pumpAndSettle();

    expect(find.text('Contact Number 7'), findsOneWidget);
    expect(find.text('Contact Number 1'), findsNothing);
  });

  testWidgets('a refresh that fails keeps the rows and says so', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET', '/contacts', (request) => page(_contacts(1, 2)));
    await pumpApp(tester, api: api, user: rep, location: Routes.contacts);
    api.on('GET', '/contacts', (request) => throw apiError(ApiError.network));

    await tester.fling(
      find.text('Contact Number 1'),
      const Offset(0, 400),
      1000,
    );
    await tester.pumpAndSettle();

    expect(find.text('Contact Number 1'), findsOneWidget);
    expect(
      find.text(
        'The server cannot be reached. Check your connection and try again.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('is reached from the More tab', (tester) async {
    final api = FakeApi()
      ..on('GET', '/contacts', (request) => page([contactJson()]));
    final app = await pumpApp(
      tester,
      api: api,
      user: readOnly,
      location: Routes.more,
    );

    await tapVisible(tester, find.text('Contacts'));

    expect(app.location, Routes.contacts);
    expect(find.text('Marcus Chen'), findsOneWidget);
  });

  testWidgets('opens a contact, and "New contact" opens the form', (
    tester,
  ) async {
    final api = FakeApi()
      ..on('GET', '/contacts', (request) => page([contactJson()]))
      ..on('GET', '/contacts/contact-1', (request) => contactJson())
      ..on('GET', '/contacts/contact-1/timeline', (request) => page([]));
    final app = await pumpApp(
      tester,
      api: api,
      user: rep,
      location: Routes.contacts,
    );

    await tapVisible(tester, find.text('Marcus Chen'));
    expect(app.location, Routes.contact('contact-1'));

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(app.location, Routes.contacts);

    await tapVisible(tester, find.text('New contact'));
    expect(app.location, Routes.newContact);
    expect(find.text('Create contact'), findsOneWidget);
    // A form covers the bottom bar.
    expect(find.byType(NavigationBar).hitTestable(), findsNothing);
  });
}
