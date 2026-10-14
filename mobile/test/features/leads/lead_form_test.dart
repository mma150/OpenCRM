import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

FakeApi _api() {
  return FakeApi()
    ..on('GET', '/leads', (request) => page([leadJson()]))
    ..on('GET', '/leads/lead-1', (request) => leadJson())
    ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
}

Future<void> _chooseSource(WidgetTester tester, String label) {
  return chooseOption(tester, 'Source', label);
}

Future<void> _submit(WidgetTester tester, String label) {
  return tapVisible(tester, find.widgetWithText(FilledButton, label));
}

void main() {
  group('new lead', () {
    testWidgets('creates the lead and opens its page', variant: phones, (
      tester,
    ) async {
      final api = _api()
        ..on('POST', '/leads', (request) => leadJson())
        ..on('GET', '/leads/lead-1', (request) => leadJson());
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newLead,
      );

      await enterField(tester, 'First name', ' Marcus ');
      await enterField(tester, 'Last name', 'Chen');
      await enterField(tester, 'Company', 'Northwind Logistics');
      await enterField(tester, 'Email', 'marcus@northwind.example');
      await _chooseSource(tester, 'Referral');
      await enterField(tester, 'Estimated value (USD)', '48000');
      await _submit(tester, 'Create lead');

      expect(api.sent('POST', '/leads').single.json, {
        'firstName': 'Marcus',
        'lastName': 'Chen',
        'source': 'REFERRAL',
        'company': 'Northwind Logistics',
        'jobTitle': null,
        'email': 'marcus@northwind.example',
        'phone': null,
        'estimatedValue': 48000,
        'notes': null,
      });
      expect(app.location, Routes.lead('lead-1'));
      expect(find.text('Lead created.'), findsOneWidget);
      // The list behind it loads again, with the new lead, when it is next shown.
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(app.location, Routes.leads);
      expect(api.sent('GET', '/leads'), hasLength(2));
    });

    testWidgets('checks the form before sending anything', variant: phones, (
      tester,
    ) async {
      final api = _api();
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newLead,
      );

      await enterField(tester, 'Email', 'not-an-email');
      await enterField(tester, 'Estimated value (USD)', '12.345');
      await _submit(tester, 'Create lead');

      expect(find.text('Enter the first name.'), findsOneWidget);
      expect(find.text('Enter the last name.'), findsOneWidget);
      expect(find.text('Enter a valid email address.'), findsOneWidget);
      expect(find.text('Choose a source.'), findsOneWidget);
      expect(
        find.text('Enter an amount such as 48000 or 1250.50.'),
        findsOneWidget,
      );
      expect(api.sent('POST', '/leads'), isEmpty);
      expect(app.location, Routes.newLead);
    });

    testWidgets(
      'puts what the server refused under its field',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('POST', '/leads', (request) {
            throw validationError({
              'email': 'Enter a valid email address',
              'phone': 'Use 50 characters or fewer',
            });
          });
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.newLead,
        );

        await enterField(tester, 'First name', 'Marcus');
        await enterField(tester, 'Last name', 'Chen');
        await _chooseSource(tester, 'Website');
        await _submit(tester, 'Create lead');

        expect(find.text('Enter a valid email address'), findsOneWidget);
        expect(find.text('Use 50 characters or fewer'), findsOneWidget);
        expect(app.location, Routes.newLead);

        // Editing a field takes its message away; the other one stays.
        await enterField(tester, 'Email', 'marcus@northwind.example');
        expect(find.text('Enter a valid email address'), findsNothing);
        expect(find.text('Use 50 characters or fewer'), findsOneWidget);
      },
    );

    testWidgets(
      'says above the form what has no field here (a required custom field)',
      (tester) async {
        final api = _api()
          ..on('POST', '/leads', (request) {
            throw validationError({'customFields.field-1': 'Tier is required'});
          });
        await pumpApp(tester, api: api, user: rep, location: Routes.newLead);

        await enterField(tester, 'First name', 'Marcus');
        await enterField(tester, 'Last name', 'Chen');
        await _chooseSource(tester, 'Website');
        await _submit(tester, 'Create lead');

        expect(find.text('Tier is required'), findsOneWidget);
      },
    );

    final refusals = {
      apiError('FORBIDDEN', status: 403):
          'You do not have permission to do that.',
      apiError(ApiError.network):
          'The server cannot be reached. Check your connection and try again.',
      apiError('INTERNAL_ERROR', status: 500):
          'The server ran into a problem. Try again in a moment.',
    };
    for (final MapEntry(key: error, value: message) in refusals.entries) {
      testWidgets(
        'says "${error.code}" above the form and keeps what was typed',
        (tester) async {
          final api = _api()..on('POST', '/leads', (request) => throw error);
          await pumpApp(tester, api: api, user: rep, location: Routes.newLead);

          await enterField(tester, 'First name', 'Marcus');
          await enterField(tester, 'Last name', 'Chen');
          await _chooseSource(tester, 'Website');
          await _submit(tester, 'Create lead');

          expect(find.text(message), findsOneWidget);
          expect(find.text('Marcus'), findsOneWidget);
          expect(
            tester
                .widget<FilledButton>(
                  find.widgetWithText(FilledButton, 'Create lead'),
                )
                .onPressed,
            isNotNull,
          );
        },
      );
    }

    testWidgets('cannot be sent twice', (tester) async {
      final answer = Completer<Object?>();
      final api = _api()..on('POST', '/leads', (request) => answer.future);
      await pumpApp(tester, api: api, user: rep, location: Routes.newLead);

      await enterField(tester, 'First name', 'Marcus');
      await enterField(tester, 'Last name', 'Chen');
      await _chooseSource(tester, 'Website');
      await tester.ensureVisible(
        find.widgetWithText(FilledButton, 'Create lead'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Create lead'));
      await tester.pump();

      expect(find.bySemanticsLabel('Saving'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Create lead'), findsNothing);
      answer.complete(leadJson());
      await tester.pumpAndSettle();
      expect(api.sent('POST', '/leads'), hasLength(1));
    });

    testWidgets('Cancel goes back to the list without sending', (tester) async {
      final api = _api();
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newLead,
      );

      await enterField(tester, 'First name', 'Marcus');
      await tapVisible(tester, find.widgetWithText(TextButton, 'Cancel'));

      expect(app.location, Routes.leads);
      expect(api.sent('POST', '/leads'), isEmpty);
    });
  });

  group('edit lead', () {
    testWidgets('starts with the lead and saves the changes', variant: phones, (
      tester,
    ) async {
      final api = _api()
        ..on('PATCH', '/leads/lead-1', (request) {
          return leadJson(company: 'Northwind Freight', estimatedValue: 1250.5);
        });
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.editLead('lead-1'),
      );

      expect(find.text('Edit lead'), findsOneWidget);
      expect(
        tester.widget<EditableText>(field('First name')).controller.text,
        'Marcus',
      );
      expect(
        tester
            .widget<EditableText>(field('Estimated value (USD)'))
            .controller
            .text,
        '48000',
      );

      await enterField(tester, 'Company', 'Northwind Freight');
      await enterField(tester, 'Phone', '');
      await enterField(tester, 'Estimated value (USD)', '1250.50');
      await _submit(tester, 'Save changes');

      final sent = api.sent('PATCH', '/leads/lead-1').single.json;
      expect(sent['company'], 'Northwind Freight');
      expect(sent['phone'], isNull);
      expect(sent['estimatedValue'], 1250.5);
      expect(sent['source'], 'REFERRAL');
      // Not the status, and no custom fields: none were changed.
      expect(sent.containsKey('status'), false);
      expect(sent.containsKey('customFields'), false);
      expect(app.location, Routes.lead('lead-1'));
      expect(find.text('Lead saved.'), findsOneWidget);
      expect(find.textContaining('Northwind Freight'), findsOneWidget);
    });

    testWidgets('shows server messages under the fields', (tester) async {
      final api = _api()
        ..on('PATCH', '/leads/lead-1', (request) {
          throw validationError({'firstName': 'Remove the control characters'});
        });
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.editLead('lead-1'),
      );

      await _submit(tester, 'Save changes');

      expect(find.text('Remove the control characters'), findsOneWidget);
    });

    testWidgets('a lead converted in the meantime is said above the form', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'PATCH',
          '/leads/lead-1',
          (request) => throw apiError('LEAD_CONVERTED', status: 409),
        );
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.editLead('lead-1'),
      );

      await _submit(tester, 'Save changes');

      expect(
        find.text('This lead has been converted and can no longer be changed.'),
        findsOneWidget,
      );
    });

    testWidgets('a lead that cannot be read says why', (tester) async {
      final api = FakeApi()
        ..on('GET', '/leads', (request) => page([]))
        ..on(
          'GET',
          '/leads/lead-1',
          (request) => throw apiError('NOT_FOUND', status: 404),
        );
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.editLead('lead-1'),
      );

      expect(
        find.text('This no longer exists. Go back and refresh the list.'),
        findsOneWidget,
      );
    });
  });

  group('custom fields', () {
    testWidgets(
      'a new lead sends them, the required one filled in',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on(
            'GET',
            '/custom-fields',
            (request) =>
                customFieldsJson(recordType: 'LEAD', required: {'cf-region'}),
          )
          ..on('POST', '/leads', (request) => leadJson());
        await pumpApp(tester, api: api, user: rep, location: Routes.newLead);

        await enterField(tester, 'First name', 'Marcus');
        await enterField(tester, 'Last name', 'Chen');
        await _chooseSource(tester, 'Referral');
        await enterField(tester, 'Team size', '12');
        await _submit(tester, 'Create lead');
        // Region is required: nothing is sent until it is chosen.
        expect(api.sent('POST', '/leads'), isEmpty);
        await scrollTo(tester, find.text('Choose an option.'));

        await chooseOption(tester, 'Region', 'North');
        await _submit(tester, 'Create lead');

        expect(api.sent('GET', '/custom-fields').first.query, {
          'recordType': 'LEAD',
        });
        expect(api.sent('POST', '/leads').single.json['customFields'], {
          'cf-region': 'North',
          'cf-size': 12,
        });
      },
    );

    testWidgets(
      'an edit sends only the ones changed, and shows refusals under them',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on(
            'GET',
            '/custom-fields',
            (request) => customFieldsJson(recordType: 'LEAD'),
          )
          ..on(
            'GET',
            '/leads/lead-1',
            (request) => leadJson(
              customFields: {
                'cf-text': 'NW-104',
                'cf-region': 'South',
                'cf-size': 12,
                'cf-renewal': null,
              },
            ),
          )
          ..on('PATCH', '/leads/lead-1', (request) {
            throw validationError({'customFields.cf-text': 'Too long'});
          });
        await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.editLead('lead-1'),
        );

        await enterField(tester, 'Account code', '');
        await chooseOption(tester, 'Region', 'None');
        await _submit(tester, 'Save changes');

        expect(api.sent('PATCH', '/leads/lead-1').single.json['customFields'], {
          'cf-text': null,
          'cf-region': null,
        });
        await scrollTo(tester, find.text('Too long'));
        expect(find.text('Too long'), findsOneWidget);
      },
    );
  });
}
