import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/widgets/form_fields.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

final _path = Routes.contact('contact-1');

/// A contact's page: the contact, an empty timeline, and the list behind it.
FakeApi _api([Map<String, Object?>? contact]) {
  return FakeApi()
    ..on('GET', '/contacts', (request) => page([contact ?? contactJson()]))
    ..on('GET', '/contacts/contact-1', (request) => contact ?? contactJson())
    ..on('GET', '/contacts/contact-1/timeline', (request) => page([]));
}

Future<void> _openMenu(WidgetTester tester) {
  return tapVisible(tester, find.byTooltip('Contact actions'));
}

List<Object?> _assignable() {
  return [
    {'id': manager.id, 'name': manager.name, 'role': 'SALES_MANAGER'},
    {'id': rep.id, 'name': rep.name, 'role': 'SALES_REP'},
  ];
}

void main() {
  group('what it shows', () {
    testWidgets('the header and the details', variant: phones, (tester) async {
      final api = _api(contactJson(notes: 'Prefers email in the morning.'));
      await pumpApp(tester, api: api, user: rep, location: _path);

      expect(
        find.text('Marcus Chen'),
        findsNWidgets(2),
      ); // the app bar and the header
      expect(find.text('Operations Director'), findsOneWidget);
      expect(find.text('Northwind Logistics'), findsOneWidget);
      expect(find.text('Riley Rep'), findsOneWidget);
      expect(find.text('Never'), findsOneWidget);
      expect(find.text('Converted from lead'), findsNothing);

      await tapVisible(tester, find.text('Details'));
      await tester.scrollUntilVisible(
        find.text('Prefers email in the morning.'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('marcus@northwind.example'), findsOneWidget);
      expect(find.text('+1 555 0100'), findsOneWidget);
      expect(find.text('Oct 1, 2026'), findsOneWidget);
      // An address and a number can be selected and copied.
      expect(
        find.widgetWithText(SelectableText, 'marcus@northwind.example'),
        findsOneWidget,
      );
    });

    testWidgets(
      'a long name, job title and company fit a small phone',
      variant: phones,
      (tester) async {
        final api = _api(
          contactJson(
            firstName: 'Bartholomew Maximilian',
            lastName: 'Featherstonehaugh-Cholmondeley',
            jobTitle: 'Senior Vice President of Procurement and Logistics',
            company: {
              'id': 'company-1',
              'name':
                  'An Exceptionally Long Company Name Incorporated and Sons',
            },
            convertedFromLead: {
              'id': 'lead-1',
              'name': 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley',
            },
          ),
        );
        await pumpApp(tester, api: api, user: manager, location: _path);

        expect(
          find.text('An Exceptionally Long Company Name Incorporated and Sons'),
          findsOneWidget,
        );
        expect(find.text('Converted from lead'), findsOneWidget);
      },
    );

    testWidgets('the company opens its page', (tester) async {
      final api = _api()
        ..on('GET', '/companies', (request) => page([companyJson()]))
        ..on('GET', '/companies/industries', (request) => ['Logistics'])
        ..on('GET', '/companies/company-1', (request) => companyJson())
        ..on('GET', '/companies/company-1/timeline', (request) => page([]));
      final app = await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Northwind Logistics'));

      expect(app.location, Routes.company('company-1'));
    });

    testWidgets(
      'a company the user may not see is not named and not linked',
      variant: phones,
      (tester) async {
        // The API answers `company: null` for a hidden company, as for none.
        final api = _api(contactJson(company: null));
        await pumpApp(tester, api: api, user: rep, location: _path);

        expect(find.text('Company'), findsNothing);
        expect(find.byIcon(Icons.business_outlined), findsNothing);

        await tapVisible(tester, find.text('Details'));
        await scrollTo(tester, find.text('Company'));
        expect(find.text('—'), findsOneWidget);
      },
    );

    testWidgets('"Converted from lead" opens the lead', (tester) async {
      final api =
          _api(
              contactJson(
                convertedFromLead: {'id': 'lead-1', 'name': 'Marcus T. Chen'},
              ),
            )
            ..on('GET', '/leads', (request) => page([leadJson()]))
            ..on('GET', '/leads/lead-1', (request) => leadJson())
            ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
      final app = await pumpApp(tester, api: api, user: rep, location: _path);

      expect(find.text('Converted from lead'), findsOneWidget);
      await tapVisible(tester, find.text('Marcus T. Chen'));

      expect(app.location, Routes.lead('lead-1'));
    });

    testWidgets('custom fields, read-only, when the installation has some', (
      tester,
    ) async {
      final api =
          _api(contactJson(customFields: {'field-1': 'Gold', 'field-2': 12500}))
            ..on('GET', '/custom-fields', (request) {
              expect(request.query, {'recordType': 'CONTACT'});
              return [
                {'id': 'field-1', 'label': 'Tier', 'type': 'DROPDOWN'},
                {'id': 'field-2', 'label': 'Fleet size', 'type': 'NUMBER'},
              ];
            });
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Details'));
      await scrollTo(tester, find.text('Fleet size'));
      expect(find.text('Custom fields'), findsOneWidget);
      expect(find.text('Gold'), findsOneWidget);
      expect(find.text('12,500'), findsOneWidget);
    });

    testWidgets(
      'a contact outside the user\'s reach says so, with Retry',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/contacts', (request) => page([]))
          ..on('GET', '/contacts/contact-1', (request) {
            throw apiError('NOT_FOUND', status: 404);
          });
        await pumpApp(tester, api: api, user: rep, location: _path);

        expect(
          find.text('This no longer exists. Go back and refresh the list.'),
          findsOneWidget,
        );

        api
          ..on('GET', '/contacts/contact-1', (request) => contactJson())
          ..on('GET', '/contacts/contact-1/timeline', (request) => page([]));
        await tapVisible(tester, find.text('Retry'));

        expect(find.text('Marcus Chen'), findsWidgets);
      },
    );
  });

  group('what a role may do', () {
    testWidgets('Read-only: nothing that writes', variant: phones, (
      tester,
    ) async {
      await pumpApp(tester, api: _api(), user: readOnly, location: _path);

      expect(find.text('Marcus Chen'), findsWidgets);
      expect(find.text('Log conversation'), findsNothing);
      expect(find.text('Add note'), findsNothing);
      expect(find.byTooltip('Contact actions'), findsNothing);
      await scrollTo(tester, find.text('Nothing logged yet'));
      expect(
        find.text(
          'Conversations and notes will show here once someone logs them.',
        ),
        findsOneWidget,
      );
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

      expect(app.location, Routes.editContact('contact-1'));
    });

    testWidgets('a manager reassigns to someone on the team', variant: phones, (
      tester,
    ) async {
      final api = _api()
        ..on('GET', '/users/assignable', (request) => _assignable())
        ..on(
          'POST',
          '/contacts/contact-1/assign',
          (request) => contactJson(owner: manager),
        );
      await pumpApp(tester, api: api, user: manager, location: _path);

      await _openMenu(tester);
      await tapVisible(tester, find.text('Reassign'));
      expect(find.text('Sales Rep · Current owner'), findsOneWidget);
      await tapVisible(tester, find.text('Sarah Jenkins').last);
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Reassign'));

      expect(api.sent('POST', '/contacts/contact-1/assign').single.json, {
        'ownerId': manager.id,
      });
      expect(find.text('Owner changed.'), findsOneWidget);
      expect(find.text('Sarah Jenkins'), findsOneWidget);
      // An assignment writes a timeline entry: the timeline is read after it (when it
      // comes on screen: on a small phone the Tasks card keeps it below the fold).
      await scrollTo(tester, find.text('Nothing logged yet'));
      final requests = api.requests.map((request) => '$request').toList();
      expect(
        requests.lastIndexOf('GET /contacts/contact-1/timeline'),
        greaterThan(requests.indexOf('POST /contacts/contact-1/assign')),
      );
    });

    testWidgets('an owner the API refuses is said in the sheet', (
      tester,
    ) async {
      final api = _api()
        ..on('GET', '/users/assignable', (request) => _assignable())
        ..on('POST', '/contacts/contact-1/assign', (request) {
          throw validationError({
            'ownerId': 'You cannot assign to this person',
          });
        });
      await pumpApp(tester, api: api, user: manager, location: _path);

      await _openMenu(tester);
      await tapVisible(tester, find.text('Reassign'));
      await tapVisible(tester, find.text('Sarah Jenkins').last);
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Reassign'));

      expect(find.text('You cannot assign to this person'), findsOneWidget);
      expect(find.byType(SubmitButton), findsOneWidget);
    });

    testWidgets(
      'deletes after asking, and goes back to the list',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('DELETE', '/contacts/contact-1', (request) => null);
        final app = await pumpApp(tester, api: api, user: rep, location: _path);

        await _openMenu(tester);
        await tapVisible(tester, find.text('Delete'));
        expect(find.text('Delete Marcus Chen?'), findsOneWidget);
        expect(
          find.text(
            'The contact and its timeline are removed for everyone. This cannot be undone.',
          ),
          findsOneWidget,
        );
        await tapVisible(tester, find.widgetWithText(TextButton, 'Cancel'));
        expect(api.sent('DELETE', '/contacts/contact-1'), isEmpty);

        await _openMenu(tester);
        await tapVisible(tester, find.text('Delete'));
        api.on('GET', '/contacts', (request) => page([]));
        await tapVisible(
          tester,
          find.widgetWithText(FilledButton, 'Delete contact'),
        );

        expect(api.sent('DELETE', '/contacts/contact-1'), hasLength(1));
        expect(app.location, Routes.contacts);
        expect(find.text('Contact deleted.'), findsOneWidget);
        expect(find.text('No contacts yet'), findsOneWidget);
      },
    );

    testWidgets('a delete the API refuses says why and stays', (tester) async {
      final api = _api()
        ..on('DELETE', '/contacts/contact-1', (request) {
          throw apiError('FORBIDDEN', status: 403);
        });
      final app = await pumpApp(tester, api: api, user: rep, location: _path);

      await _openMenu(tester);
      await tapVisible(tester, find.text('Delete'));
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Delete contact'),
      );

      expect(
        find.text('You do not have permission to do that.'),
        findsOneWidget,
      );
      expect(app.location, _path);
    });
  });

  group('the timeline', () {
    testWidgets(
      'a conversation is logged on the contact and moves its last contact',
      variant: phones,
      (tester) async {
        var logged = false;
        final api = FakeApi()
          ..on('GET', '/contacts', (request) => page([contactJson()]))
          ..on('GET', '/contacts/contact-1', (request) {
            return contactJson(
              lastContactAt: logged
                  ? DateTime.now().toUtc().toIso8601String()
                  : null,
            );
          })
          ..on('GET', '/contacts/contact-1/timeline', (request) {
            return page(logged ? [entryJson()] : []);
          })
          ..on('POST', '/contacts/contact-1/conversations', (request) {
            logged = true;
            return entryJson();
          });
        await pumpApp(tester, api: api, user: rep, location: _path);
        expect(find.text('Never'), findsOneWidget);

        await tapVisible(tester, find.text('Log conversation'));
        expect(find.text('With Marcus Chen'), findsOneWidget);
        await enterField(tester, 'What was discussed?', 'Agreed on the price.');
        await tapVisible(
          tester,
          find.widgetWithText(FilledButton, 'Save conversation'),
        );

        final sent = api
            .sent('POST', '/contacts/contact-1/conversations')
            .single
            .json;
        expect(sent['summary'], 'Agreed on the price.');
        expect(find.text('Conversation logged.'), findsOneWidget);
        expect(api.sent('GET', '/contacts/contact-1'), hasLength(2));
        expect(find.text('Never'), findsNothing);
        expect(find.text('Today'), findsOneWidget);
      },
    );

    testWidgets('a note is added on the contact', (tester) async {
      final api = _api()
        ..on('POST', '/contacts/contact-1/notes', (request) {
          return entryJson(kind: 'NOTE', body: 'Call back on Friday.');
        });
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Add note'));
      await enterField(tester, 'Note', 'Call back on Friday.');
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Save note'));

      expect(api.sent('POST', '/contacts/contact-1/notes').single.json, {
        'body': 'Call back on Friday.',
      });
      expect(api.sent('GET', '/contacts/contact-1/timeline'), hasLength(2));
    });
  });
}
