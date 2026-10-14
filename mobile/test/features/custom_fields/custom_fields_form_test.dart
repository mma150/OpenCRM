import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/features/custom_fields/custom_fields.dart';
import 'package:opencrm/features/custom_fields/custom_fields_form.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

// The shared custom fields of a record form. The rules are tested on CustomFieldValues; the
// controls through the lead form, the first of the four forms that show them (each form
// has its own test that it sends them).

final _text = CustomField.fromJson(customFieldJson(id: 'cf-text'));
final _region = CustomField.fromJson(
  customFieldJson(
    id: 'cf-region',
    type: 'DROPDOWN',
    options: const ['North', 'South'],
  ),
);
final _size = CustomField.fromJson(
  customFieldJson(id: 'cf-size', type: 'NUMBER'),
);
final _renewal = CustomField.fromJson(
  customFieldJson(id: 'cf-renewal', type: 'DATE'),
);
final _all = [_text, _region, _size, _renewal];

CustomField _required(CustomField field) {
  return CustomField(
    id: field.id,
    label: field.label,
    type: field.type,
    options: field.options,
    required: true,
  );
}

/// The lead form's API, with these custom fields and this lead behind the edit form.
FakeApi _api({List<Map<String, Object?>>? fields, Map<String, Object?>? lead}) {
  return FakeApi()
    ..on('GET', '/leads', (request) => page([leadJson()]))
    ..on('GET', '/leads/lead-1', (request) => lead ?? leadJson())
    ..on('GET', '/leads/lead-1/timeline', (request) => page([]))
    ..on('GET', '/custom-fields', (request) => fields ?? customFieldsJson());
}

Future<void> _fillLead(WidgetTester tester) async {
  await enterField(tester, 'First name', 'Marcus');
  await enterField(tester, 'Last name', 'Chen');
  await chooseOption(tester, 'Source', 'Referral');
}

Future<void> _submit(WidgetTester tester, String label) {
  return tapVisible(tester, find.widgetWithText(FilledButton, label));
}

/// The lead's stored values: a removed dropdown option, and one of each other type.
const _stored = {
  'cf-text': 'NW-104',
  'cf-region': 'East',
  'cf-size': 12,
  'cf-renewal': '2026-11-15',
};

void main() {
  group('the field definitions', () {
    test('read the options and whether a field is required', () {
      expect(_region.options, ['North', 'South']);
      expect(_region.required, false);
      expect(
        CustomField.fromJson(customFieldJson(required: true)).required,
        true,
      );
      // An older answer without them: no options, not required.
      final bare = CustomField.fromJson({
        'id': 'f',
        'label': 'Tier',
        'type': 'TEXT',
      });
      expect(bare.options, isEmpty);
      expect(bare.required, false);
      expect(
        () => CustomField.fromJson({
          ...customFieldJson(),
          'options': [1],
        }),
        throwsFormatException,
      );
    });
  });

  group('the values of a new record', () {
    test('send the fields filled in, each as the API takes it', () {
      final values = CustomFieldValues()
        ..controller(_text).text = '  NW-104 '
        ..controller(_size).text = '12'
        ..set(_region, 'North')
        ..set(_renewal, '2026-11-15');

      expect(values.forCreate(_all), {
        'cf-text': 'NW-104',
        'cf-region': 'North',
        'cf-size': 12,
        'cf-renewal': '2026-11-15',
      });
      values.controller(_size).text = '-12.5';
      expect(values.forCreate(_all)!['cf-size'], -12.5);
    });

    test('leave customFields out when nothing is filled in', () {
      final values = CustomFieldValues()..controller(_text).text = '   ';
      expect(values.forCreate(_all), isNull);
    });

    test('must fill in a required field', () {
      final values = CustomFieldValues();
      expect(values.validate(_required(_text), ''), 'Enter a value.');
      expect(values.validate(_required(_size), ' '), 'Enter a value.');
      expect(values.validate(_required(_renewal), null), 'Enter a value.');
      expect(values.validate(_required(_region), ''), 'Choose an option.');
      expect(values.validate(_text, ''), isNull);
    });

    test('check text and numbers with the API rules', () {
      final values = CustomFieldValues();
      expect(values.validate(_text, 'a' * 500), isNull);
      expect(values.validate(_text, 'a' * 501), 'Use 500 characters or fewer.');
      for (final good in ['12', '-12', '12.5', '0.25']) {
        expect(values.validate(_size, good), isNull, reason: good);
      }
      for (final bad in ['12.', '.5', '1-2', '1.2.3', '--1', '9' * 400]) {
        expect(
          values.validate(_size, bad),
          'Enter a number such as 12 or 12.5.',
          reason: bad,
        );
      }
    });
  });

  group('the values of an existing record', () {
    test('send only what changed, with null for an emptied field', () {
      final values = CustomFieldValues(stored: _stored);
      expect(values.text(_size), '12');
      expect(values.changes(_all), isNull);

      values
        ..controller(_text).text = 'NW-200'
        ..set(_renewal, '');
      expect(values.changes(_all), {'cf-text': 'NW-200', 'cf-renewal': null});
    });

    test('a number written another way is not a change', () {
      final values = CustomFieldValues(stored: const {'cf-size': 12.0});
      expect(values.text(_size), '12');
      values.controller(_size).text = '12.00';
      expect(values.changes([_size]), isNull);
    });

    test('a removed option is kept unless another one is chosen', () {
      final values = CustomFieldValues(stored: _stored);
      expect(values.removedOption(_region), 'East');
      expect(values.removedOption(_text), isNull);
      expect(values.validate(_region, 'East'), isNull);
      expect(values.changes(_all), isNull);

      values.set(_region, 'South');
      expect(values.changes(_all), {'cf-region': 'South'});
      // Gone back to while the form is open: kept again.
      values.set(_region, 'East');
      expect(values.changes(_all), isNull);
      expect(CustomFieldValues().removedOption(_region), isNull);
    });

    test('a required field cannot be emptied, but may stay empty', () {
      final values = CustomFieldValues(
        stored: const {'cf-text': 'NW-104', 'cf-size': null},
      );
      expect(values.validate(_required(_text), ''), 'Enter a value.');
      // A record from before the field became required stays editable.
      expect(values.validate(_required(_size), ''), isNull);
    });
  });

  group('in a form', () {
    testWidgets(
      'shows a control per field and sends what was filled in',
      variant: phones,
      (tester) async {
        final api = _api(fields: customFieldsJson(required: {'cf-region'}))
          ..on('POST', '/leads', (request) => leadJson());
        await pumpApp(tester, api: api, user: rep, location: Routes.newLead);

        await scrollTo(tester, find.text('Custom fields'));
        expect(api.sent('GET', '/custom-fields').single.query, {
          'recordType': 'LEAD',
        });
        // The required one is marked, and starts at "None".
        await scrollTo(tester, dropdown('Region'));
        expect(
          find.descendant(
            of: find.widgetWithText(LabeledField, 'Region'),
            matching: find.text(' *'),
          ),
          findsOneWidget,
        );
        expect(find.text(' *'), findsOneWidget);
        expect(
          find.bySemanticsLabel(RegExp('^Region, required')),
          findsOneWidget,
        );

        await _fillLead(tester);
        await enterField(tester, 'Account code', 'NW-104');
        await chooseOption(tester, 'Region', 'South');
        await enterField(tester, 'Team size', '12.5');
        await tapVisible(tester, find.text('No date'));
        await tapVisible(tester, find.text('OK'));
        await _submit(tester, 'Create lead');

        expect(api.sent('POST', '/leads').single.json['customFields'], {
          'cf-text': 'NW-104',
          'cf-region': 'South',
          'cf-size': 12.5,
          'cf-renewal': toApiDay(DateTime.now()),
        });
      },
    );

    testWidgets('takes no room when the record type has no fields', (
      tester,
    ) async {
      final api = _api(fields: const []);
      await pumpApp(tester, api: api, user: rep, location: Routes.newLead);

      await scrollTo(tester, find.widgetWithText(FilledButton, 'Create lead'));
      expect(find.text('Custom fields'), findsNothing);
    });

    testWidgets(
      'checks required fields and numbers before sending',
      variant: phones,
      (tester) async {
        final api = _api(
          fields: customFieldsJson(
            required: {'cf-text', 'cf-region', 'cf-renewal'},
          ),
        );
        await pumpApp(tester, api: api, user: rep, location: Routes.newLead);

        await _fillLead(tester);
        await enterField(tester, 'Team size', '1.2.3');
        await _submit(tester, 'Create lead');

        await scrollTo(tester, find.text('Choose an option.'));
        expect(find.text('Choose an option.'), findsOneWidget);
        await scrollTo(tester, find.text('Enter a number such as 12 or 12.5.'));
        await scrollTo(tester, find.text('Renewal'));
        expect(find.text('Enter a value.'), findsNWidgets(2));
        expect(api.sent('POST', '/leads'), isEmpty);
      },
    );

    testWidgets(
      'puts what the server said about a field under it',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('POST', '/leads', (request) {
            throw validationError({
              'customFields.cf-size': 'Enter a number',
              'customFields.cf-gone': 'This field is no longer in use',
            });
          });
        await pumpApp(tester, api: api, user: rep, location: Routes.newLead);

        await _fillLead(tester);
        await enterField(tester, 'Team size', '12');
        await _submit(tester, 'Create lead');

        // A field the form does not have is said above it.
        await scrollTo(tester, find.text('This field is no longer in use'));
        await scrollTo(tester, find.text('Enter a number'));
        expect(find.text('Enter a number'), findsOneWidget);

        await enterField(tester, 'Team size', '13');
        expect(find.text('Enter a number'), findsNothing);
      },
    );

    testWidgets(
      'an edit shows the values, keeps a removed option, and sends only changes',
      variant: phones,
      (tester) async {
        final api = _api(lead: leadJson(customFields: _stored))
          ..on('PATCH', '/leads/lead-1', (request) => leadJson());
        await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.editLead('lead-1'),
        );

        await scrollTo(tester, find.text('East (removed option)'));
        expect(find.text('East (removed option)'), findsOneWidget);
        expect(
          tester.widget<EditableText>(field('Team size')).controller.text,
          '12',
        );
        await scrollTo(tester, find.text('Nov 15, 2026'));

        await enterField(tester, 'Account code', 'NW-200');
        await tapVisible(tester, find.byTooltip('Clear renewal'));
        await _submit(tester, 'Save changes');

        expect(api.sent('PATCH', '/leads/lead-1').single.json['customFields'], {
          'cf-text': 'NW-200',
          'cf-renewal': null,
        });
      },
    );

    testWidgets('an edit that leaves them alone sends none of them', (
      tester,
    ) async {
      final api = _api(lead: leadJson(customFields: _stored))
        ..on('PATCH', '/leads/lead-1', (request) => leadJson());
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.editLead('lead-1'),
      );

      await _submit(tester, 'Save changes');

      expect(
        api
            .sent('PATCH', '/leads/lead-1')
            .single
            .json
            .containsKey('customFields'),
        false,
      );
    });

    testWidgets('a removed option is not offered to another record', (
      tester,
    ) async {
      await pumpApp(tester, api: _api(), user: rep, location: Routes.newLead);

      await tapVisible(tester, dropdown('Region'));
      expect(find.textContaining('(removed option)'), findsNothing);
      expect(find.text('North'), findsWidgets);
    });

    testWidgets('fields that cannot be read can be asked for again', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'GET',
          '/custom-fields',
          (request) => throw apiError('INTERNAL_ERROR', status: 500),
        );
      await pumpApp(tester, api: api, user: rep, location: Routes.newLead);

      await scrollTo(
        tester,
        find.text('The custom fields could not be loaded.'),
      );
      api.on('GET', '/custom-fields', (request) => customFieldsJson());
      await tapVisible(tester, find.widgetWithText(TextButton, 'Retry'));

      await scrollTo(tester, find.text('Custom fields'));
      expect(find.text('The custom fields could not be loaded.'), findsNothing);
    });

    testWidgets('are read again when a form opens', (tester) async {
      final api = _api(lead: leadJson(customFields: _stored));
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.lead('lead-1'),
      );
      // The read-only card of the lead's details reads them.
      await tapVisible(tester, find.text('Details'));
      expect(api.sent('GET', '/custom-fields'), hasLength(1));

      // An Admin made Region required in the meantime.
      api.on(
        'GET',
        '/custom-fields',
        (request) => customFieldsJson(required: {'cf-region'}),
      );
      app.router.go(Routes.editLead('lead-1'));
      await tester.pumpAndSettle();

      expect(api.sent('GET', '/custom-fields'), hasLength(2));
      await scrollTo(tester, dropdown('Region'));
      expect(find.text(' *'), findsOneWidget);
    });
  });
}
