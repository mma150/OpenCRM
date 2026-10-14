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
    ..on('GET', '/companies', (request) => page([companyJson()]))
    ..on('GET', '/companies/industries', (request) => ['Logistics', 'Retail'])
    ..on('GET', '/companies/company-1', (request) => companyJson())
    ..on('GET', '/companies/company-1/timeline', (request) => page([]))
    ..on('GET', '/contacts', (request) => page([]));
}

Future<void> _submit(WidgetTester tester, String label) {
  return tapVisible(tester, find.widgetWithText(FilledButton, label));
}

void main() {
  group('new company', () {
    testWidgets('creates the company and opens its page', variant: phones, (
      tester,
    ) async {
      final api = _api()..on('POST', '/companies', (request) => companyJson());
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newCompany,
      );

      await enterField(tester, 'Company name', ' Northwind Logistics ');
      await enterField(tester, 'Industry', 'Shipping');
      await enterField(tester, 'Website', 'northwind.example');
      await enterField(tester, 'Address', '12 Harbour Road, Seattle');
      await _submit(tester, 'Create company');

      expect(api.sent('POST', '/companies').single.json, {
        'name': 'Northwind Logistics',
        'website': 'northwind.example',
        // Free text: an industry nobody used before is fine.
        'industry': 'Shipping',
        'phone': null,
        'address': '12 Harbour Road, Seattle',
        'notes': null,
      });
      expect(app.location, Routes.company('company-1'));
      expect(find.text('Company created.'), findsOneWidget);
      // The list behind it loads again, with the new company, when it is next shown.
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(app.location, Routes.companies);
      expect(api.sent('GET', '/companies'), hasLength(2));
    });

    testWidgets(
      'suggests the industries in use, following the typing',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('POST', '/companies', (request) => companyJson());
        await pumpApp(tester, api: api, user: rep, location: Routes.newCompany);

        expect(find.widgetWithText(ActionChip, 'Logistics'), findsOneWidget);
        expect(find.widgetWithText(ActionChip, 'Retail'), findsOneWidget);

        await enterField(tester, 'Industry', 'log');
        expect(find.widgetWithText(ActionChip, 'Logistics'), findsOneWidget);
        expect(find.widgetWithText(ActionChip, 'Retail'), findsNothing);

        await tapVisible(tester, find.widgetWithText(ActionChip, 'Logistics'));
        expect(
          tester.widget<EditableText>(field('Industry')).controller.text,
          'Logistics',
        );
        // Typed in full: nothing left to suggest.
        expect(find.byType(ActionChip), findsNothing);

        await enterField(tester, 'Company name', 'Northwind');
        await _submit(tester, 'Create company');
        expect(
          api.sent('POST', '/companies').single.json['industry'],
          'Logistics',
        );
      },
    );

    testWidgets('works when the industries cannot be read', (tester) async {
      final api = _api()
        ..on('GET', '/companies/industries', (request) {
          throw apiError('INTERNAL_ERROR', status: 500);
        })
        ..on('POST', '/companies', (request) => companyJson());
      await pumpApp(tester, api: api, user: rep, location: Routes.newCompany);

      expect(find.byType(ActionChip), findsNothing);
      await enterField(tester, 'Company name', 'Northwind');
      await _submit(tester, 'Create company');

      expect(api.sent('POST', '/companies'), hasLength(1));
    });

    testWidgets('checks the form before sending anything', variant: phones, (
      tester,
    ) async {
      final api = _api();
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newCompany,
      );

      await enterField(tester, 'Website', 'not a website');
      await _submit(tester, 'Create company');

      expect(find.text('Enter a name.'), findsOneWidget);
      expect(
        find.text('Enter a web address such as example.com.'),
        findsOneWidget,
      );
      expect(api.sent('POST', '/companies'), isEmpty);
      expect(app.location, Routes.newCompany);
    });

    testWidgets(
      'puts what the server refused under its field',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('POST', '/companies', (request) {
            throw validationError({
              'website': 'Enter a web address such as example.com',
              'phone': 'Use 50 characters or fewer',
            });
          });
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.newCompany,
        );

        await enterField(tester, 'Company name', 'Northwind');
        await _submit(tester, 'Create company');

        expect(
          find.text('Enter a web address such as example.com'),
          findsOneWidget,
        );
        expect(find.text('Use 50 characters or fewer'), findsOneWidget);
        expect(app.location, Routes.newCompany);

        // Editing a field takes its message away; the other one stays.
        await enterField(tester, 'Website', 'northwind.example');
        expect(
          find.text('Enter a web address such as example.com'),
          findsNothing,
        );
        expect(find.text('Use 50 characters or fewer'), findsOneWidget);
      },
    );

    testWidgets(
      'says above the form what has no field here (a required custom field)',
      (tester) async {
        final api = _api()
          ..on('POST', '/companies', (request) {
            throw validationError({'customFields.field-1': 'Tier is required'});
          });
        await pumpApp(tester, api: api, user: rep, location: Routes.newCompany);

        await enterField(tester, 'Company name', 'Northwind');
        await _submit(tester, 'Create company');

        await scrollTo(tester, find.text('Tier is required'));
        expect(find.text('Tier is required'), findsOneWidget);
      },
    );

    for (final (code, sentence) in [
      ('FORBIDDEN', 'You do not have permission to do that.'),
      (
        ApiError.network,
        'The server cannot be reached. Check your connection and try again.',
      ),
    ]) {
      testWidgets('$code is said above the form', (tester) async {
        final api = _api()
          ..on('POST', '/companies', (request) => throw apiError(code));
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.newCompany,
        );

        await enterField(tester, 'Company name', 'Northwind');
        await _submit(tester, 'Create company');

        await scrollTo(tester, find.text(sentence));
        expect(find.text(sentence), findsOneWidget);
        expect(app.location, Routes.newCompany);
      });
    }

    testWidgets('cannot be sent twice', (tester) async {
      final answer = Completer<Object?>();
      final api = _api()..on('POST', '/companies', (request) => answer.future);
      await pumpApp(tester, api: api, user: rep, location: Routes.newCompany);

      await enterField(tester, 'Company name', 'Northwind');
      await tester.ensureVisible(find.text('Create company'));
      await tester.tap(find.text('Create company'));
      await tester.pump();

      expect(find.bySemanticsLabel('Saving'), findsOneWidget);
      await tester.tap(find.bySemanticsLabel('Saving'), warnIfMissed: false);
      await tester.pump();
      expect(api.sent('POST', '/companies'), hasLength(1));

      answer.complete(companyJson());
      await tester.pumpAndSettle();
    });

    testWidgets('Cancel goes back to the list without sending', (tester) async {
      final api = _api();
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newCompany,
      );

      await enterField(tester, 'Company name', 'Northwind');
      await tapVisible(tester, find.widgetWithText(TextButton, 'Cancel'));

      expect(app.location, Routes.companies);
      expect(api.sent('POST', '/companies'), isEmpty);
    });
  });

  group('edit company', () {
    testWidgets(
      'starts with the company and saves the changes',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on(
            'PATCH',
            '/companies/company-1',
            (request) => companyJson(industry: 'Freight', phone: null),
          );
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.editCompany('company-1'),
        );

        expect(find.text('Edit company'), findsOneWidget);
        expect(
          tester.widget<EditableText>(field('Company name')).controller.text,
          'Northwind Logistics',
        );

        await enterField(tester, 'Industry', 'Freight');
        // Emptying a field clears it on the server.
        await enterField(tester, 'Phone', '');
        await _submit(tester, 'Save changes');

        expect(api.sent('PATCH', '/companies/company-1').single.json, {
          'name': 'Northwind Logistics',
          'website': 'https://northwind.example/',
          'industry': 'Freight',
          'phone': null,
          'address': '12 Harbour Road, Seattle',
          'notes': null,
        });
        expect(app.location, Routes.company('company-1'));
        expect(find.text('Company saved.'), findsOneWidget);
        // The page shows the company as the server answered it.
        expect(find.text('Freight'), findsOneWidget);
      },
    );

    testWidgets('shows server messages under the fields', (tester) async {
      final api = _api()
        ..on('PATCH', '/companies/company-1', (request) {
          throw validationError({'name': 'Use 200 characters or fewer'});
        });
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.editCompany('company-1'),
      );

      await _submit(tester, 'Save changes');

      await scrollTo(tester, find.text('Use 200 characters or fewer'));
      expect(find.text('Use 200 characters or fewer'), findsOneWidget);
    });

    testWidgets('a company that cannot be read says why', (tester) async {
      final api = FakeApi()
        ..on('GET', '/companies', (request) => page([]))
        ..on('GET', '/companies/industries', (request) => const <Object?>[])
        ..on('GET', '/companies/company-1', (request) {
          throw apiError('NOT_FOUND', status: 404);
        });
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.editCompany('company-1'),
      );

      expect(
        find.text('This no longer exists. Go back and refresh the list.'),
        findsWidgets,
      );
      expect(find.text('Save changes'), findsNothing);
    });
  });
}
