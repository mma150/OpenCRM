import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/record_picker.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

FakeApi _api() {
  return FakeApi()
    ..on('GET', '/contacts', (request) => page([contactJson()]))
    ..on('GET', '/contacts/contact-1', (request) => contactJson())
    ..on('GET', '/contacts/contact-1/timeline', (request) => page([]));
}

/// Two companies, narrowed by the search as the API would.
Object? _companies(FakeRequest request) {
  final all = [
    companyJson(),
    companyJson(id: 'company-2', name: 'Acme Tools', industry: 'Retail'),
  ];
  final search = request.query['search']?.toLowerCase();
  return page([
    for (final company in all)
      if (search == null ||
          (company['name']! as String).toLowerCase().contains(search))
        company,
  ]);
}

Future<void> _submit(WidgetTester tester, String label) {
  return tapVisible(tester, find.widgetWithText(FilledButton, label));
}

/// Types into the search box of the picker sheet and waits for the answer.
Future<void> _searchPicker(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(SearchField).last, text);
  await tester.pump(SearchField.debounce);
  await tester.pumpAndSettle();
}

void main() {
  group('new contact', () {
    testWidgets(
      'creates the contact with a company picked by searching',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('GET', '/companies', _companies)
          ..on('POST', '/contacts', (request) => contactJson());
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.newContact,
        );

        await enterField(tester, 'First name', ' Marcus ');
        await enterField(tester, 'Last name', 'Chen');
        await enterField(tester, 'Job title', 'Operations Director');

        await tapVisible(tester, find.text('No company'));
        expect(find.text('Choose a company'), findsOneWidget);
        // The first companies by name, before anything is typed.
        expect(api.sent('GET', '/companies').single.query, {
          'page': '1',
          'pageSize': '20',
          'sort': 'name',
          'order': 'asc',
        });
        expect(find.text('Acme Tools'), findsOneWidget);
        expect(find.text('Retail'), findsOneWidget);

        await _searchPicker(tester, 'north');
        expect(api.sent('GET', '/companies').last.query['search'], 'north');
        expect(find.text('Acme Tools'), findsNothing);
        await tapVisible(tester, find.text('Northwind Logistics'));

        // The sheet closed and the field holds the company.
        expect(find.text('Choose a company'), findsNothing);
        expect(find.text('Northwind Logistics'), findsOneWidget);

        await enterField(tester, 'Email', 'marcus@northwind.example');
        await _submit(tester, 'Create contact');

        expect(api.sent('POST', '/contacts').single.json, {
          'firstName': 'Marcus',
          'lastName': 'Chen',
          'jobTitle': 'Operations Director',
          'email': 'marcus@northwind.example',
          'phone': null,
          'companyId': 'company-1',
          'notes': null,
        });
        expect(app.location, Routes.contact('contact-1'));
        expect(find.text('Contact created.'), findsOneWidget);
        // The list behind it loads again, with the new contact, when it is next shown.
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(app.location, Routes.contacts);
        expect(api.sent('GET', '/contacts'), hasLength(2));
      },
    );

    testWidgets('checks the form before sending anything', variant: phones, (
      tester,
    ) async {
      final api = _api();
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newContact,
      );

      await enterField(tester, 'Email', 'not-an-email');
      await _submit(tester, 'Create contact');

      expect(find.text('Enter a first name.'), findsOneWidget);
      expect(find.text('Enter a last name.'), findsOneWidget);
      expect(find.text('Enter a valid email address.'), findsOneWidget);
      expect(api.sent('POST', '/contacts'), isEmpty);
      expect(app.location, Routes.newContact);
    });

    testWidgets(
      'puts what the server refused under its field',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('GET', '/companies', _companies)
          ..on('POST', '/contacts', (request) {
            throw validationError({
              'email': 'Enter a valid email address',
              // A company the caller cannot see, or one deleted in the meantime.
              'companyId': 'Choose a company you can see',
            });
          });
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.newContact,
        );

        await enterField(tester, 'First name', 'Marcus');
        await enterField(tester, 'Last name', 'Chen');
        await tapVisible(tester, find.text('No company'));
        await tapVisible(tester, find.text('Acme Tools'));
        await _submit(tester, 'Create contact');

        expect(find.text('Enter a valid email address'), findsOneWidget);
        expect(find.text('Choose a company you can see'), findsOneWidget);
        expect(app.location, Routes.newContact);

        // Changing a field takes its message away; the other one stays.
        await tapVisible(tester, find.byTooltip('Clear company'));
        expect(find.text('Choose a company you can see'), findsNothing);
        expect(find.text('No company'), findsOneWidget);
        expect(find.text('Enter a valid email address'), findsOneWidget);
        await enterField(tester, 'Email', 'marcus@northwind.example');
        expect(find.text('Enter a valid email address'), findsNothing);
      },
    );

    testWidgets(
      'says above the form what has no field here (a required custom field)',
      (tester) async {
        final api = _api()
          ..on('POST', '/contacts', (request) {
            throw validationError({'customFields.field-1': 'Tier is required'});
          });
        await pumpApp(tester, api: api, user: rep, location: Routes.newContact);

        await enterField(tester, 'First name', 'Marcus');
        await enterField(tester, 'Last name', 'Chen');
        await _submit(tester, 'Create contact');

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
          ..on('POST', '/contacts', (request) => throw apiError(code));
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.newContact,
        );

        await enterField(tester, 'First name', 'Marcus');
        await enterField(tester, 'Last name', 'Chen');
        await _submit(tester, 'Create contact');

        await scrollTo(tester, find.text(sentence));
        expect(find.text(sentence), findsOneWidget);
        expect(app.location, Routes.newContact);
      });
    }

    testWidgets('cannot be sent twice', (tester) async {
      final answer = Completer<Object?>();
      final api = _api()..on('POST', '/contacts', (request) => answer.future);
      await pumpApp(tester, api: api, user: rep, location: Routes.newContact);

      await enterField(tester, 'First name', 'Marcus');
      await enterField(tester, 'Last name', 'Chen');
      await tester.ensureVisible(find.text('Create contact'));
      await tester.tap(find.text('Create contact'));
      await tester.pump();

      expect(find.bySemanticsLabel('Saving'), findsOneWidget);
      await tester.tap(find.bySemanticsLabel('Saving'), warnIfMissed: false);
      await tester.pump();
      expect(api.sent('POST', '/contacts'), hasLength(1));

      answer.complete(contactJson());
      await tester.pumpAndSettle();
    });

    testWidgets('Cancel goes back to the list without sending', (tester) async {
      final api = _api();
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newContact,
      );

      await enterField(tester, 'First name', 'Marcus');
      await tapVisible(tester, find.widgetWithText(TextButton, 'Cancel'));

      expect(app.location, Routes.contacts);
      expect(api.sent('POST', '/contacts'), isEmpty);
    });
  });

  group('new contact in a company', () {
    testWidgets('starts with the company filled in', variant: phones, (
      tester,
    ) async {
      final api = _api()
        ..on('GET', '/companies/company-1', (request) => companyJson())
        ..on(
          'POST',
          '/contacts',
          (request) => contactJson(id: 'contact-9', firstName: 'Dana'),
        )
        ..on(
          'GET',
          '/contacts/contact-9',
          (request) => contactJson(id: 'contact-9', firstName: 'Dana'),
        )
        ..on('GET', '/contacts/contact-9/timeline', (request) => page([]));
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newContactIn('company-1'),
      );

      expect(find.text('Northwind Logistics'), findsOneWidget);
      await enterField(tester, 'First name', 'Dana');
      await enterField(tester, 'Last name', 'Chen');
      await _submit(tester, 'Create contact');

      expect(
        api.sent('POST', '/contacts').single.json['companyId'],
        'company-1',
      );
      expect(app.location, Routes.contact('contact-9'));
    });

    testWidgets('a company that cannot be read is left out', (tester) async {
      final api = _api()
        ..on('GET', '/companies/company-1', (request) {
          throw apiError('NOT_FOUND', status: 404);
        })
        ..on('POST', '/contacts', (request) => contactJson());
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newContactIn('company-1'),
      );

      expect(find.text('No company'), findsOneWidget);
      await enterField(tester, 'First name', 'Marcus');
      await enterField(tester, 'Last name', 'Chen');
      await _submit(tester, 'Create contact');

      expect(api.sent('POST', '/contacts').single.json['companyId'], isNull);
    });
  });

  group('edit contact', () {
    testWidgets(
      'starts with the contact and saves the changes',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on(
            'PATCH',
            '/contacts/contact-1',
            (request) => contactJson(jobTitle: 'COO', company: null),
          );
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.editContact('contact-1'),
        );

        expect(find.text('Edit contact'), findsOneWidget);
        expect(
          tester.widget<EditableText>(field('First name')).controller.text,
          'Marcus',
        );
        expect(find.text('Northwind Logistics'), findsOneWidget);

        await enterField(tester, 'Job title', 'COO');
        // Taking the company out sends null, which unlinks the contact.
        await tapVisible(tester, find.byTooltip('Clear company'));
        await _submit(tester, 'Save changes');

        expect(api.sent('PATCH', '/contacts/contact-1').single.json, {
          'firstName': 'Marcus',
          'lastName': 'Chen',
          'jobTitle': 'COO',
          'email': 'marcus@northwind.example',
          'phone': '+1 555 0100',
          'companyId': null,
          'notes': null,
        });
        expect(app.location, Routes.contact('contact-1'));
        expect(find.text('Contact saved.'), findsOneWidget);
        // The page shows the contact as the server answered it.
        expect(find.text('COO'), findsOneWidget);
      },
    );

    testWidgets(
      'an edit that leaves the company alone does not send it, so a company '
      'the reader may not see stays linked',
      (tester) async {
        // The API answers `company: null` for a company the reader may not see.
        final api = _api()
          ..on(
            'GET',
            '/contacts/contact-1',
            (request) => contactJson(company: null),
          )
          ..on(
            'PATCH',
            '/contacts/contact-1',
            (request) => contactJson(jobTitle: 'COO', company: null),
          );
        await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.editContact('contact-1'),
        );

        await enterField(tester, 'Job title', 'COO');
        await _submit(tester, 'Save changes');

        final sent = api.sent('PATCH', '/contacts/contact-1').single.json;
        expect(sent, isNot(contains('companyId')));
        expect(sent['jobTitle'], 'COO');
      },
    );

    testWidgets('shows server messages under the fields', (tester) async {
      final api = _api()
        ..on('PATCH', '/contacts/contact-1', (request) {
          throw validationError({'lastName': 'Use 100 characters or fewer'});
        });
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.editContact('contact-1'),
      );

      await _submit(tester, 'Save changes');

      await scrollTo(tester, find.text('Use 100 characters or fewer'));
      expect(find.text('Use 100 characters or fewer'), findsOneWidget);
    });

    testWidgets('a contact that cannot be read says why', (tester) async {
      final api = FakeApi()
        ..on('GET', '/contacts', (request) => page([]))
        ..on('GET', '/contacts/contact-1', (request) {
          throw apiError('NOT_FOUND', status: 404);
        });
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.editContact('contact-1'),
      );

      expect(
        find.text('This no longer exists. Go back and refresh the list.'),
        findsWidgets,
      );
      expect(find.text('Save changes'), findsNothing);
    });
  });

  group('the company picker', () {
    Future<void> open(WidgetTester tester, FakeApi api, String location) async {
      await pumpApp(tester, api: api, user: rep, location: location);
      await tapVisible(tester, find.byType(RecordPickerField));
    }

    testWidgets('marks the company that is chosen', variant: phones, (
      tester,
    ) async {
      final api = _api()..on('GET', '/companies', _companies);
      await open(tester, api, Routes.editContact('contact-1'));

      expect(find.byIcon(Icons.check), findsOneWidget);
      expect(
        find.descendant(
          of: find.widgetWithText(ListTile, 'Northwind Logistics'),
          matching: find.byIcon(Icons.check),
        ),
        findsOneWidget,
      );
    });

    testWidgets('says so when nothing matches, and when there is nothing', (
      tester,
    ) async {
      final api = _api()..on('GET', '/companies', _companies);
      await open(tester, api, Routes.newContact);

      await _searchPicker(tester, 'zzz');
      expect(find.text('No companies match'), findsOneWidget);
      expect(find.text('Try another search.'), findsOneWidget);

      api.on('GET', '/companies', (request) => page([]));
      await tapVisible(tester, find.byTooltip('Clear search'));
      expect(find.text('No companies yet'), findsOneWidget);
    });

    testWidgets('a search that fails says why and can be retried', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'GET',
          '/companies',
          (request) => throw apiError(ApiError.timeout),
        );
      await open(tester, api, Routes.newContact);

      expect(
        find.text('The server took too long to answer. Try again.'),
        findsOneWidget,
      );

      api.on('GET', '/companies', _companies);
      await tapVisible(tester, find.text('Retry'));
      expect(find.text('Acme Tools'), findsOneWidget);
    });

    testWidgets('an answer to an earlier search is dropped', (tester) async {
      final slow = Completer<Object?>();
      final api = _api()
        ..on('GET', '/companies', (request) {
          return request.query['search'] == 'acme'
              ? slow.future
              : _companies(request);
        });
      await open(tester, api, Routes.newContact);

      await _searchPicker(tester, 'acme');
      await tester.enterText(find.byType(SearchField).last, 'north');
      await tester.pump(SearchField.debounce);
      await tester.pumpAndSettle();
      slow.complete(page([companyJson(id: 'company-2', name: 'Acme Tools')]));
      await tester.pumpAndSettle();

      expect(find.text('Northwind Logistics'), findsOneWidget);
      expect(find.text('Acme Tools'), findsNothing);
    });

    testWidgets('says when there are more than it shows', (tester) async {
      final api = _api()
        ..on('GET', '/companies', (request) {
          return page([
            for (var index = 1; index <= 20; index += 1)
              companyJson(id: 'company-$index', name: 'Company $index'),
          ], total: 43);
        });
      await open(tester, api, Routes.newContact);

      await scrollTo(tester, find.textContaining('Showing the first 20'));
      expect(
        find.text('Showing the first 20. Search to find others.'),
        findsOneWidget,
      );
    });

    testWidgets('closing it leaves the field as it was', (tester) async {
      final api = _api()..on('GET', '/companies', _companies);
      await open(tester, api, Routes.editContact('contact-1'));

      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      expect(find.text('Choose a company'), findsNothing);
      expect(find.text('Northwind Logistics'), findsOneWidget);
    });
  });
}
