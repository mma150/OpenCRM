import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/widgets/form_fields.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

final _path = Routes.lead('lead-1');

/// A lead's page: the lead, an empty timeline, and the list behind it.
FakeApi _api([Map<String, Object?>? lead]) {
  return FakeApi()
    ..on('GET', '/leads', (request) => page([lead ?? leadJson()]))
    ..on('GET', '/leads/lead-1', (request) => lead ?? leadJson())
    ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
}

Future<void> _openMenu(WidgetTester tester) {
  return tapVisible(tester, find.byTooltip('Lead actions'));
}

void main() {
  group('what it shows', () {
    testWidgets('the header, the follow-up and the details', variant: phones, (
      tester,
    ) async {
      final api = _api(
        leadJson(
          status: 'CONTACTED',
          notes: 'Met at the logistics fair.',
          followUpAt: '2026-10-01T09:00:00.000Z',
          followUpNote: 'Send the fleet pricing',
        ),
      );
      await pumpApp(tester, api: api, user: rep, location: _path);

      expect(
        find.text('Marcus Chen'),
        findsNWidgets(2),
      ); // the app bar and the header
      expect(
        find.text('Operations Director · Northwind Logistics'),
        findsOneWidget,
      );
      expect(find.text('Contacted'), findsOneWidget);
      expect(find.text(r'$48,000'), findsOneWidget);
      expect(find.text('Never'), findsOneWidget);
      await scrollTo(tester, find.textContaining('Follow-up overdue'));
      expect(
        find.textContaining('Follow-up overdue: Oct 1, 2026'),
        findsOneWidget,
      );
      expect(find.text('Send the fleet pricing'), findsOneWidget);

      await tapVisible(tester, find.text('Details'));
      await tester.scrollUntilVisible(
        find.text('Met at the logistics fair.'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('marcus@northwind.example'), findsOneWidget);
      expect(find.text('+1 555 0100'), findsOneWidget);
      expect(find.text('Referral'), findsOneWidget);
      // An address and a number can be selected and copied.
      expect(
        find.widgetWithText(SelectableText, 'marcus@northwind.example'),
        findsOneWidget,
      );
    });

    testWidgets(
      'a long name and a lead with nothing optional',
      variant: phones,
      (tester) async {
        final api = _api(
          leadJson(
            firstName: 'Bartholomew Maximilian Alexander',
            lastName: 'Featherstonehaugh-Cholmondeley-Smythe',
            company: null,
            jobTitle: null,
            email: null,
            phone: null,
            estimatedValue: null,
          ),
        );
        await pumpApp(tester, api: api, user: rep, location: _path);

        expect(find.textContaining('Featherstonehaugh'), findsWidgets);
        await tapVisible(tester, find.text('Details'));
        // A missing value is a dash, never an empty space.
        expect(find.text('—'), findsWidgets);
      },
    );

    testWidgets('custom fields, read-only, when the installation has some', (
      tester,
    ) async {
      final api =
          _api(
            leadJson(
              customFields: {
                'field-1': 'Gold',
                'field-2': 12500.5,
                'field-3': null,
              },
            ),
          )..on('GET', '/custom-fields', (request) {
            return [
              {'id': 'field-1', 'label': 'Tier', 'type': 'DROPDOWN'},
              {'id': 'field-2', 'label': 'Fleet size', 'type': 'NUMBER'},
              {'id': 'field-3', 'label': 'Renewal', 'type': 'DATE'},
            ];
          });
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Details'));
      await tester.scrollUntilVisible(
        find.text('Renewal'),
        200,
        scrollable: find.byType(Scrollable).first,
      );

      expect(find.text('Custom fields'), findsOneWidget);
      expect(find.text('Gold'), findsOneWidget);
      expect(find.text('12,500.5'), findsOneWidget);
      expect(api.sent('GET', '/custom-fields').single.query, {
        'recordType': 'LEAD',
      });
    });

    testWidgets('a lost lead says why', variant: phones, (tester) async {
      final api = _api(
        leadJson(
          status: 'LOST',
          lostReason: 'CHOSE_COMPETITOR',
          lostNote: 'Went with Acme',
          lostAt: '2026-10-04T10:00:00.000Z',
        ),
      );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await scrollTo(tester, find.text('Went with Acme'));
      expect(find.text('Marked as lost'), findsOneWidget);
      expect(find.text('Chose competitor'), findsOneWidget);
      expect(find.text('Went with Acme'), findsOneWidget);
      expect(find.text('Change status'), findsNothing);
      expect(find.text('Set follow-up'), findsNothing);
    });

    testWidgets(
      'a lead that cannot be read says why, with Retry',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/leads', (request) => page([]))
          ..on(
            'GET',
            '/leads/lead-1',
            (request) => throw apiError('NOT_FOUND', status: 404),
          );
        await pumpApp(tester, api: api, user: rep, location: _path);

        expect(
          find.text('This no longer exists. Go back and refresh the list.'),
          findsOneWidget,
        );

        api
          ..on('GET', '/leads/lead-1', (request) => leadJson())
          ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
        await tapVisible(tester, find.text('Retry'));
        expect(find.text('Marcus Chen'), findsWidgets);
      },
    );
  });

  group('what a role may do', () {
    testWidgets('Read-only: nothing that writes', variant: phones, (
      tester,
    ) async {
      final api = _api(leadJson(followUpAt: '2026-10-01T09:00:00.000Z'));
      await pumpApp(tester, api: api, user: readOnly, location: _path);

      expect(find.text('Marcus Chen'), findsWidgets);
      for (final label in [
        'Log conversation',
        'Add note',
        'Change status',
        'Change follow-up',
        'Set follow-up',
      ]) {
        expect(find.text(label), findsNothing, reason: label);
      }
      expect(find.byTooltip('Lead actions'), findsNothing);
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

        await _openMenu(tester);

        expect(find.text('Edit'), findsOneWidget);
        expect(find.text('Mark as lost'), findsOneWidget);
        expect(find.text('Delete'), findsOneWidget);
        expect(find.text('Reopen'), findsNothing);
        expect(
          find.text('Reassign'),
          user.role == Role.salesRep ? findsNothing : findsOneWidget,
        );
      });
    }

    testWidgets(
      'a converted lead is final: conversations and notes only',
      variant: phones,
      (tester) async {
        final api = _api(
          leadJson(
            status: 'CONVERTED',
            convertedAt: '2026-10-06T10:00:00.000Z',
            convertedTo: {
              'contact': {'id': 'contact-1', 'name': 'Marcus Chen'},
              'company': null,
              'opportunity': {'id': 'opp-1', 'name': 'Fleet deal'},
            },
          ),
        );
        await pumpApp(tester, api: api, user: rep, location: _path);

        await scrollTo(tester, find.text('Opportunity: Fleet deal'));
        expect(find.textContaining('Converted on '), findsOneWidget);
        expect(find.text('Opportunity: Fleet deal'), findsOneWidget);
        expect(find.textContaining('Company:'), findsNothing);
        expect(find.text('Change status'), findsNothing);
        expect(find.text('Set follow-up'), findsNothing);
        // A rep has nothing left in the menu, so there is no menu.
        expect(find.byTooltip('Lead actions'), findsNothing);
        expect(find.text('Log conversation'), findsOneWidget);
        expect(find.text('Add note'), findsOneWidget);
      },
    );

    testWidgets('the records a converted lead became open their pages', (
      tester,
    ) async {
      final api =
          _api(
              leadJson(
                status: 'CONVERTED',
                convertedTo: {
                  'contact': {'id': 'contact-1', 'name': 'Marcus Chen'},
                  'company': {'id': 'company-1', 'name': 'Northwind'},
                  'opportunity': {'id': 'opp-1', 'name': 'Fleet deal'},
                },
              ),
            )
            ..on('GET', '/contacts', (request) => page([contactJson()]))
            ..on('GET', '/contacts/contact-1', (request) => contactJson())
            ..on('GET', '/contacts/contact-1/timeline', (request) => page([]));
      final app = await pumpApp(tester, api: api, user: rep, location: _path);

      expect(
        tester.getSemantics(find.bySemanticsLabel('Company: Northwind')),
        isSemantics(isButton: true, hasTapAction: true),
      );
      expect(find.bySemanticsLabel('Opportunity: Fleet deal'), findsOneWidget);
      await tapVisible(tester, find.text('Contact: Marcus Chen'));

      expect(app.location, Routes.contact('contact-1'));
    });

    testWidgets('a converted lead can still be reassigned by a manager', (
      tester,
    ) async {
      final api = _api(leadJson(status: 'CONVERTED'));
      await pumpApp(tester, api: api, user: manager, location: _path);

      await _openMenu(tester);

      expect(find.text('Reassign'), findsOneWidget);
      expect(find.text('Edit'), findsNothing);
      expect(find.text('Delete'), findsNothing);
    });
  });

  group('changing it', () {
    testWidgets('moves between the open statuses', variant: phones, (
      tester,
    ) async {
      final api = _api()
        ..on(
          'PATCH',
          '/leads/lead-1',
          (request) => leadJson(status: 'QUALIFIED'),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Change status'));
      expect(find.text('Converted'), findsNothing);
      expect(find.text('Lost'), findsNothing);
      await tapVisible(tester, find.text('Qualified'));

      expect(api.sent('PATCH', '/leads/lead-1').single.json, {
        'status': 'QUALIFIED',
      });
      expect(find.text('Status changed to Qualified.'), findsOneWidget);
      expect(find.text('Qualified'), findsOneWidget);
      // The change wrote a timeline entry and moved a dashboard figure.
      expect(api.sent('GET', '/leads/lead-1/timeline'), hasLength(2));
    });

    testWidgets('a refused status change says why and changes nothing', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'PATCH',
          '/leads/lead-1',
          (request) => throw apiError('LEAD_CONVERTED', status: 409),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Change status'));
      await tapVisible(tester, find.text('Contacted'));

      expect(
        find.text('This lead has been converted and can no longer be changed.'),
        findsOneWidget,
      );
      expect(find.text('New'), findsOneWidget);
    });

    testWidgets('marks as lost with a reason and a note', variant: phones, (
      tester,
    ) async {
      final api = _api()
        ..on('POST', '/leads/lead-1/mark-lost', (request) {
          return leadJson(
            status: 'LOST',
            lostReason: 'PRICE',
            lostNote: 'Too dear',
          );
        });
      await pumpApp(tester, api: api, user: rep, location: _path);

      await _openMenu(tester);
      await tapVisible(tester, find.text('Mark as lost'));
      // Without a reason nothing is sent.
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Mark as lost'),
      );
      expect(find.text('Choose a reason.'), findsOneWidget);
      expect(api.sent('POST', '/leads/lead-1/mark-lost'), isEmpty);

      await chooseOption(tester, 'Reason', 'Price');
      await enterField(tester, 'Note (optional)', ' Too dear ');
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Mark as lost'),
      );

      expect(api.sent('POST', '/leads/lead-1/mark-lost').single.json, {
        'reason': 'PRICE',
        'note': 'Too dear',
      });
      expect(find.text('Lead marked as lost.'), findsOneWidget);
      await scrollTo(tester, find.text('Too dear'));
      expect(find.text('Marked as lost'), findsOneWidget);
      expect(find.text('Too dear'), findsOneWidget);
    });

    testWidgets('reopens a lost lead', (tester) async {
      final api = _api(leadJson(status: 'LOST', lostReason: 'PRICE'))
        ..on('PATCH', '/leads/lead-1', (request) => leadJson());
      await pumpApp(tester, api: api, user: rep, location: _path);

      await _openMenu(tester);
      await tapVisible(tester, find.text('Reopen'));

      expect(api.sent('PATCH', '/leads/lead-1').single.json, {'status': 'NEW'});
      expect(find.text('Lead reopened.'), findsOneWidget);
      expect(find.text('Change status'), findsOneWidget);
    });

    testWidgets(
      'deletes after asking, and goes back to the list',
      variant: phones,
      (tester) async {
        final api = _api()..on('DELETE', '/leads/lead-1', (request) => null);
        final app = await pumpApp(tester, api: api, user: rep, location: _path);

        await _openMenu(tester);
        await tapVisible(tester, find.text('Delete'));
        expect(find.text('Delete Marcus Chen?'), findsOneWidget);
        await tapVisible(tester, find.widgetWithText(TextButton, 'Cancel'));
        expect(api.sent('DELETE', '/leads/lead-1'), isEmpty);

        await _openMenu(tester);
        await tapVisible(tester, find.text('Delete'));
        api.on('GET', '/leads', (request) => page([]));
        await tapVisible(
          tester,
          find.widgetWithText(FilledButton, 'Delete lead'),
        );

        expect(api.sent('DELETE', '/leads/lead-1'), hasLength(1));
        expect(app.location, Routes.leads);
        expect(find.text('Lead deleted.'), findsOneWidget);
        expect(find.text('No leads yet'), findsOneWidget);
      },
    );

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
          '/leads/lead-1/assign',
          (request) => leadJson(owner: manager),
        );
      await pumpApp(tester, api: api, user: manager, location: _path);

      await _openMenu(tester);
      await tapVisible(tester, find.text('Reassign'));
      expect(find.text('Sales Rep · Current owner'), findsOneWidget);
      await tapVisible(tester, find.text('Sarah Jenkins').last);
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Reassign'));

      expect(api.sent('POST', '/leads/lead-1/assign').single.json, {
        'ownerId': manager.id,
      });
      expect(find.text('Owner changed.'), findsOneWidget);
      expect(find.text('Sarah Jenkins'), findsOneWidget);
    });

    testWidgets('an owner the API refuses is said in the sheet', (
      tester,
    ) async {
      final api = _api()
        ..on('GET', '/users/assignable', (request) {
          return [
            {'id': manager.id, 'name': manager.name, 'role': 'SALES_MANAGER'},
            {'id': rep.id, 'name': rep.name, 'role': 'SALES_REP'},
          ];
        })
        ..on('POST', '/leads/lead-1/assign', (request) {
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

    testWidgets('sets and clears the follow-up', variant: phones, (
      tester,
    ) async {
      final api = _api(
        leadJson(
          followUpAt: '2026-11-15T09:30:00.000Z',
          followUpNote: 'Send the pricing',
        ),
      )..on('PUT', '/leads/lead-1/follow-up', (request) => leadJson());
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Change follow-up'));
      await enterField(tester, 'What to do (optional)', 'Call about the demo');
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Save follow-up'),
      );

      final sent = api.sent('PUT', '/leads/lead-1/follow-up').single.json;
      expect(sent['at'], '2026-11-15T09:30:00.000Z');
      expect(sent['note'], 'Call about the demo');
      expect(find.text('Follow-up saved.'), findsOneWidget);
      // The answer had no follow-up, so the page now offers to set one.
      await scrollTo(tester, find.text('Set follow-up'));
      expect(find.text('Set follow-up'), findsOneWidget);
    });

    testWidgets('clears a follow-up from its sheet', (tester) async {
      final api = _api(leadJson(followUpAt: '2026-11-15T09:30:00.000Z'))
        ..on('PUT', '/leads/lead-1/follow-up', (request) => leadJson());
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Change follow-up'));
      await tapVisible(tester, find.text('Clear follow-up'));

      expect(api.sent('PUT', '/leads/lead-1/follow-up').single.json, {
        'at': null,
        'note': null,
      });
      expect(find.text('Follow-up cleared.'), findsOneWidget);
    });

    testWidgets('a new follow-up needs a time', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Set follow-up'));
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Save follow-up'),
      );

      expect(find.text('Choose when to follow up.'), findsOneWidget);
      expect(api.sent('PUT', '/leads/lead-1/follow-up'), isEmpty);
    });
  });
}
