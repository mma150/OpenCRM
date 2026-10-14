import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/auth/user.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

final _path = Routes.company('company-1');

List<Object?> _people(int count) {
  return [
    for (var index = 1; index <= count; index += 1)
      contactJson(
        id: 'contact-$index',
        firstName: 'Person',
        lastName: 'Number $index',
      ),
  ];
}

/// A company's page: the company, its contacts, an empty timeline, and the list behind it.
FakeApi _api({Map<String, Object?>? company, FakeHandler? contacts}) {
  return FakeApi()
    ..on('GET', '/companies', (request) => page([company ?? companyJson()]))
    ..on('GET', '/companies/industries', (request) => ['Logistics'])
    ..on('GET', '/companies/company-1', (request) => company ?? companyJson())
    ..on('GET', '/companies/company-1/timeline', (request) => page([]))
    ..on('GET', '/contacts', contacts ?? (request) => page(_people(2)));
}

Future<void> _openMenu(WidgetTester tester) {
  return tapVisible(tester, find.byTooltip('Company actions'));
}

void main() {
  group('what it shows', () {
    testWidgets('the header, the contacts and the details', variant: phones, (
      tester,
    ) async {
      final api = _api(company: companyJson(notes: 'Renews in March.'));
      await pumpApp(tester, api: api, user: rep, location: _path);

      expect(
        find.text('Northwind Logistics'),
        findsNWidgets(2),
      ); // the app bar and the header
      expect(find.text('Logistics'), findsOneWidget);
      expect(find.text('Riley Rep'), findsOneWidget);
      // The website is text, without its scheme, that can be selected and copied.
      expect(
        find.widgetWithText(SelectableText, 'northwind.example'),
        findsOneWidget,
      );

      // The first contacts of the company, by name.
      final asked = api.sent('GET', '/contacts').single.query;
      expect(asked, {
        'page': '1',
        'pageSize': '5',
        'sort': 'name',
        'order': 'asc',
        'companyId': 'company-1',
      });
      await scrollTo(tester, find.text('Person Number 2'));
      expect(find.text('2 total'), findsOneWidget);
      expect(find.text('Person Number 1'), findsOneWidget);
      // Everyone is shown: nothing more to view.
      expect(find.textContaining('View all'), findsNothing);

      await tapVisible(tester, find.text('Details'));
      await tester.scrollUntilVisible(
        find.text('Renews in March.'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('+1 555 0199'), findsOneWidget);
      expect(find.text('12 Harbour Road, Seattle'), findsOneWidget);
      expect(find.text('Oct 1, 2026'), findsOneWidget);
    });

    testWidgets('long names fit a small phone', variant: phones, (
      tester,
    ) async {
      final api = _api(
        company: companyJson(
          name: 'An Exceptionally Long Company Name Incorporated and Sons',
          industry: 'Wholesale Distribution of Industrial Machinery',
          website: 'https://www.an-exceptionally-long-company-name.example/en',
        ),
        contacts: (request) => page([
          contactJson(
            firstName: 'Bartholomew Maximilian',
            lastName: 'Featherstonehaugh-Cholmondeley',
            jobTitle: 'Senior Vice President of Procurement and Logistics',
          ),
        ]),
      );
      await pumpApp(tester, api: api, user: manager, location: _path);

      await scrollTo(
        tester,
        find.text('Bartholomew Maximilian Featherstonehaugh-Cholmondeley'),
      );
      expect(find.text('1 total'), findsOneWidget);
    });

    testWidgets(
      'a company with more contacts links to all of them',
      variant: phones,
      (tester) async {
        final api = _api(
          contacts: (request) {
            return request.query['pageSize'] == '5'
                ? page(_people(5), total: 12, pageSize: 5)
                : page(_people(12));
          },
        );
        final app = await pumpApp(tester, api: api, user: rep, location: _path);

        await tapVisible(tester, find.text('View all 12 contacts'));

        // The contacts list, narrowed to this company.
        expect(app.location, Routes.contacts);
        expect(api.requests.last.path, '/contacts');
        expect(api.requests.last.query, containsPair('companyId', 'company-1'));
        expect(api.requests.last.query, containsPair('pageSize', '25'));
        expect(find.text('Company: Northwind Logistics'), findsOneWidget);
        expect(find.text('12 contacts'), findsOneWidget);
      },
    );

    testWidgets('a contact opens its page', (tester) async {
      final api = _api()
        ..on('GET', '/contacts/contact-1', (request) => contactJson())
        ..on('GET', '/contacts/contact-1/timeline', (request) => page([]));
      final app = await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Person Number 1'));

      expect(app.location, Routes.contact('contact-1'));
    });

    testWidgets('"Add contact" opens the form with the company filled in', (
      tester,
    ) async {
      final app = await pumpApp(
        tester,
        api: _api(),
        user: rep,
        location: _path,
      );

      await tapVisible(tester, find.text('Add contact'));

      expect(app.location, Routes.newContact);
      expect(
        app.router.routerDelegate.currentConfiguration.uri.queryParameters,
        {'companyId': 'company-1'},
      );
      expect(find.text('Create contact'), findsOneWidget);
      expect(find.text('Northwind Logistics'), findsOneWidget);

      // Cancel goes back to the company, not to the contacts list.
      await tapVisible(tester, find.widgetWithText(TextButton, 'Cancel'));
      expect(app.location, _path);
    });

    testWidgets('says so when it has no contacts, by role', variant: phones, (
      tester,
    ) async {
      final api = _api(
        company: companyJson(contactCount: 0),
        contacts: (request) => page([]),
      );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await scrollTo(tester, find.text('Add contact'));
      expect(find.text('0 total'), findsOneWidget);
      expect(
        find.text(
          'No contacts yet. Add the people you deal with at this company.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('contacts that cannot be read say why, with Retry', (
      tester,
    ) async {
      final api = _api(contacts: (request) => throw apiError(ApiError.network));
      await pumpApp(tester, api: api, user: rep, location: _path);

      await scrollTo(
        tester,
        find.text(
          'The server cannot be reached. Check your connection and try again.',
        ),
      );
      // The rest of the page does not depend on them.
      expect(find.text('Northwind Logistics'), findsWidgets);

      api.on('GET', '/contacts', (request) => page(_people(1)));
      await tapVisible(tester, find.text('Retry'));
      expect(find.text('Person Number 1'), findsOneWidget);
    });

    testWidgets('custom fields, read-only, when the installation has some', (
      tester,
    ) async {
      final api = _api(company: companyJson(customFields: {'field-1': 'Gold'}))
        ..on('GET', '/custom-fields', (request) {
          expect(request.query, {'recordType': 'COMPANY'});
          return [
            {'id': 'field-1', 'label': 'Tier', 'type': 'DROPDOWN'},
          ];
        });
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Details'));
      await scrollTo(tester, find.text('Tier'));
      expect(find.text('Custom fields'), findsOneWidget);
      expect(find.text('Gold'), findsOneWidget);
    });

    testWidgets(
      'a company outside the user\'s reach says so, with Retry',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/companies', (request) => page([]))
          ..on('GET', '/companies/industries', (request) => const <Object?>[])
          ..on('GET', '/companies/company-1', (request) {
            throw apiError('NOT_FOUND', status: 404);
          });
        await pumpApp(tester, api: api, user: rep, location: _path);

        expect(
          find.text('This no longer exists. Go back and refresh the list.'),
          findsOneWidget,
        );

        api
          ..on('GET', '/companies/company-1', (request) => companyJson())
          ..on('GET', '/companies/company-1/timeline', (request) => page([]))
          ..on('GET', '/contacts', (request) => page([]));
        await tapVisible(tester, find.text('Retry'));

        expect(find.text('Northwind Logistics'), findsWidgets);
      },
    );
  });

  group('what a role may do', () {
    testWidgets('Read-only: nothing that writes', variant: phones, (
      tester,
    ) async {
      final api = _api(contacts: (request) => page([]));
      await pumpApp(tester, api: api, user: readOnly, location: _path);

      expect(find.text('Northwind Logistics'), findsWidgets);
      expect(find.text('Log conversation'), findsNothing);
      expect(find.text('Add note'), findsNothing);
      expect(find.byTooltip('Company actions'), findsNothing);
      await scrollTo(tester, find.text('Nothing logged yet'));
      expect(find.text('Add contact'), findsNothing);
      // The Contacts card sits above the Tasks card and the timeline.
      final noContacts = find.text(
        'No contacts yet. Contacts linked to this company will show here.',
      );
      await scrollTo(tester, noContacts);
      expect(noContacts, findsOneWidget);
    });

    for (final user in [admin, manager, rep]) {
      testWidgets('${user.role.label}: the menu', (tester) async {
        await pumpApp(tester, api: _api(), user: user, location: _path);

        expect(find.text('Log conversation'), findsOneWidget);
        expect(find.text('Add note'), findsOneWidget);
        await _openMenu(tester);

        expect(find.text('Edit'), findsOneWidget);
        expect(find.text('Delete'), findsOneWidget);
        expect(
          find.text('Reassign'),
          user.role == Role.salesRep ? findsNothing : findsOneWidget,
        );
      });
    }
  });

  group('changing it', () {
    testWidgets('Edit opens the form', (tester) async {
      final app = await pumpApp(
        tester,
        api: _api(),
        user: rep,
        location: _path,
      );

      await _openMenu(tester);
      await tapVisible(tester, find.text('Edit'));

      expect(app.location, Routes.editCompany('company-1'));
    });

    testWidgets('a manager reassigns to someone on the team', variant: phones, (
      tester,
    ) async {
      final api = _api()
        ..on('GET', '/users/assignable', (request) {
          return [
            {'id': manager.id, 'name': manager.name, 'role': 'SALES_MANAGER'},
            {'id': rep.id, 'name': rep.name, 'role': 'SALES_REP'},
          ];
        })
        ..on(
          'POST',
          '/companies/company-1/assign',
          (request) => companyJson(owner: manager),
        );
      await pumpApp(tester, api: api, user: manager, location: _path);
      // On a small phone the timeline is under the contacts: it loads when it is reached.
      await scrollTo(tester, find.text('Nothing logged yet'));

      await _openMenu(tester);
      await tapVisible(tester, find.text('Reassign'));
      expect(find.text('Sales Rep · Current owner'), findsOneWidget);
      await tapVisible(tester, find.text('Sarah Jenkins').last);
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Reassign'));

      expect(api.sent('POST', '/companies/company-1/assign').single.json, {
        'ownerId': manager.id,
      });
      expect(find.text('Owner changed.'), findsOneWidget);
      // An assignment writes a timeline entry: the timeline was read again.
      expect(api.sent('GET', '/companies/company-1/timeline'), hasLength(2));
      await scrollTo(tester, find.text('Sarah Jenkins'));
      expect(find.text('Sarah Jenkins'), findsOneWidget);
    });

    testWidgets(
      'deleting says the contacts stay, and goes back to the list',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('DELETE', '/companies/company-1', (request) => null);
        final app = await pumpApp(tester, api: api, user: rep, location: _path);

        await _openMenu(tester);
        await tapVisible(tester, find.text('Delete'));
        expect(find.text('Delete Northwind Logistics?'), findsOneWidget);
        expect(
          find.text(
            'The company and its timeline are removed for everyone. Its 2 contacts '
            'stay, but are no longer linked to a company. This cannot be undone.',
          ),
          findsOneWidget,
        );
        await tapVisible(tester, find.widgetWithText(TextButton, 'Cancel'));
        expect(api.sent('DELETE', '/companies/company-1'), isEmpty);

        await _openMenu(tester);
        await tapVisible(tester, find.text('Delete'));
        api.on('GET', '/companies', (request) => page([]));
        await tapVisible(
          tester,
          find.widgetWithText(FilledButton, 'Delete company'),
        );

        expect(api.sent('DELETE', '/companies/company-1'), hasLength(1));
        expect(app.location, Routes.companies);
        expect(find.text('Company deleted.'), findsOneWidget);
        expect(find.text('No companies yet'), findsOneWidget);
      },
    );

    testWidgets('a delete the API refuses says why and stays', (tester) async {
      final api = _api()
        ..on('DELETE', '/companies/company-1', (request) {
          throw apiError('FORBIDDEN', status: 403);
        });
      final app = await pumpApp(tester, api: api, user: rep, location: _path);

      await _openMenu(tester);
      await tapVisible(tester, find.text('Delete'));
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Delete company'),
      );

      expect(
        find.text('You do not have permission to do that.'),
        findsOneWidget,
      );
      expect(app.location, _path);
    });
  });

  group('the timeline', () {
    testWidgets('a conversation is logged on the company', variant: phones, (
      tester,
    ) async {
      var logged = false;
      final api = _api()
        ..on('GET', '/companies/company-1/timeline', (request) {
          return page(logged ? [entryJson()] : []);
        })
        ..on('POST', '/companies/company-1/conversations', (request) {
          logged = true;
          return entryJson();
        });
      await pumpApp(tester, api: api, user: rep, location: _path);
      await scrollTo(tester, find.text('Nothing logged yet'));

      await tapVisible(tester, find.text('Log conversation'));
      expect(find.text('With Northwind Logistics'), findsOneWidget);
      await enterField(tester, 'What was discussed?', 'Renewal terms.');
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Save conversation'),
      );

      final sent = api
          .sent('POST', '/companies/company-1/conversations')
          .single
          .json;
      expect(sent['summary'], 'Renewal terms.');
      expect(find.text('Conversation logged.'), findsOneWidget);
      expect(api.sent('GET', '/companies/company-1/timeline'), hasLength(2));
    });

    testWidgets('a note is added on the company', (tester) async {
      final api = _api()
        ..on('POST', '/companies/company-1/notes', (request) {
          return entryJson(kind: 'NOTE', body: 'Ask about the new depot.');
        });
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Add note'));
      await enterField(tester, 'Note', 'Ask about the new depot.');
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Save note'));

      expect(api.sent('POST', '/companies/company-1/notes').single.json, {
        'body': 'Ask about the new depot.',
      });
    });
  });
}
