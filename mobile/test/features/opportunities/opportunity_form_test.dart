import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/format/formatters.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

/// What the form and the pages around it ask for: the stages, the board behind the form,
/// and the page a saved opportunity opens.
FakeApi _api([Map<String, Object?>? opportunity]) {
  return FakeApi()
    ..on('GET', '/pipeline-stages', (request) => pipelineStagesJson())
    ..on('GET', '/opportunities/board', (request) => boardJson([]))
    ..on(
      'GET',
      '/opportunities/opp-1',
      (request) => opportunity ?? opportunityJson(),
    )
    ..on('GET', '/opportunities/opp-1/timeline', (request) => page([]));
}

Future<void> _submit(WidgetTester tester, String label) {
  return tapVisible(tester, find.widgetWithText(FilledButton, label));
}

final _editPath = Routes.editOpportunity('opp-1');

void main() {
  group('new opportunity', () {
    testWidgets(
      'creates it with everything filled in, and opens its page',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('GET', '/companies', (request) => page([companyJson()]))
          ..on('GET', '/contacts', (request) => page([contactJson()]))
          ..on('POST', '/opportunities', (request) => opportunityJson());
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.newOpportunity,
        );

        await enterField(tester, 'Name', ' Fleet renewal ');
        await enterField(tester, 'Value (USD)', '48000.50');
        // Today, with the picker's own OK button.
        await tapVisible(tester, find.text('No date'));
        await tapVisible(tester, find.text('OK'));
        await chooseOption(tester, 'Stage', 'Proposal');
        await tapVisible(tester, find.text('No company'));
        await tapVisible(tester, find.text('Northwind Logistics'));
        await tapVisible(tester, find.text('No contact'));
        await tapVisible(tester, find.text('Marcus Chen'));
        await enterField(tester, 'Notes', 'Renewal of the whole fleet.');
        await _submit(tester, 'Create opportunity');

        expect(api.sent('POST', '/opportunities').single.json, {
          'name': 'Fleet renewal',
          'value': 48000.5,
          'expectedCloseDate': toApiDay(DateTime.now()),
          'stageId': 'stage-proposal',
          'companyId': 'company-1',
          'contactId': 'contact-1',
          'notes': 'Renewal of the whole fleet.',
        });
        expect(app.location, Routes.opportunity('opp-1'));
        expect(find.text('Opportunity created.'), findsOneWidget);
        // The pipeline behind it loads again, with the new card, when it is next shown.
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(app.location, Routes.opportunities);
        expect(api.sent('GET', '/opportunities/board'), hasLength(2));
      },
    );

    testWidgets('a name is enough: the first stage, and nothing else', (
      tester,
    ) async {
      final api = _api()
        ..on('POST', '/opportunities', (request) => opportunityJson());
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newOpportunity,
      );

      await enterField(tester, 'Name', 'Fleet renewal');
      await _submit(tester, 'Create opportunity');

      expect(api.sent('POST', '/opportunities').single.json, {
        'name': 'Fleet renewal',
        'stageId': 'stage-new',
      });
    });

    testWidgets('offers the open stages only', (tester) async {
      await pumpApp(
        tester,
        api: _api(),
        user: rep,
        location: Routes.newOpportunity,
      );

      await tapVisible(tester, dropdown('Stage'));

      expect(find.text('Qualified'), findsWidgets);
      expect(find.text('Proposal'), findsWidgets);
      expect(find.text('Won'), findsNothing);
      expect(find.text('Lost'), findsNothing);
    });

    testWidgets('without the stages the server chooses the first one', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'GET',
          '/pipeline-stages',
          (request) => throw apiError('SERVICE_UNAVAILABLE', status: 503),
        )
        ..on('POST', '/opportunities', (request) => opportunityJson());
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newOpportunity,
      );

      expect(find.text('Stage'), findsNothing);
      await enterField(tester, 'Name', 'Fleet renewal');
      await _submit(tester, 'Create opportunity');

      expect(api.sent('POST', '/opportunities').single.json, {
        'name': 'Fleet renewal',
      });
    });

    testWidgets('checks the form before sending anything', variant: phones, (
      tester,
    ) async {
      final api = _api();
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newOpportunity,
      );

      await enterField(tester, 'Value (USD)', '12.345');
      await _submit(tester, 'Create opportunity');

      await scrollTo(tester, find.text('Enter a name.'));
      expect(find.text('Enter a name.'), findsOneWidget);
      await scrollTo(
        tester,
        find.text('Enter an amount such as 48000 or 48000.50.'),
      );
      expect(api.sent('POST', '/opportunities'), isEmpty);
    });

    testWidgets('a picked company and date can be taken out again', (
      tester,
    ) async {
      final api = _api()
        ..on('GET', '/companies', (request) => page([companyJson()]))
        ..on('POST', '/opportunities', (request) => opportunityJson());
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newOpportunity,
      );

      await enterField(tester, 'Name', 'Fleet renewal');
      await tapVisible(tester, find.text('No date'));
      await tapVisible(tester, find.text('OK'));
      await tapVisible(tester, find.byTooltip('Clear expected close date'));
      await tapVisible(tester, find.text('No company'));
      await tapVisible(tester, find.text('Northwind Logistics'));
      await tapVisible(tester, find.byTooltip('Clear company'));
      await _submit(tester, 'Create opportunity');

      expect(api.sent('POST', '/opportunities').single.json, {
        'name': 'Fleet renewal',
        'stageId': 'stage-new',
      });
    });

    testWidgets(
      'shows what the server says under the fields, and the rest above',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('POST', '/opportunities', (request) {
            throw validationError({
              'name': 'This name is taken',
              'value': 'Too much',
              'expectedCloseDate': 'Not a day',
              'stageId': 'This stage was deleted',
              'companyId': 'You cannot see this company',
              'contactId': 'You cannot see this contact',
              'notes': 'Too long',
              'customFields.field-1': 'Tier is required',
            });
          });
        await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.newOpportunity,
        );

        await enterField(tester, 'Name', 'Fleet renewal');
        await _submit(tester, 'Create opportunity');

        // A path the form has no field for is not lost.
        await scrollTo(tester, find.text('Tier is required'));
        for (final message in [
          'This name is taken',
          'Too much',
          'Not a day',
          'This stage was deleted',
          'You cannot see this company',
          'You cannot see this contact',
          'Too long',
        ]) {
          await scrollTo(tester, find.text(message));
          expect(find.text(message), findsOneWidget, reason: message);
        }

        // Editing a field clears its message.
        await scrollTo(tester, find.text('This name is taken'));
        await enterField(tester, 'Name', 'Fleet renewal 2027');
        expect(find.text('This name is taken'), findsNothing);
      },
    );

    for (final (code, sentence) in [
      ('FORBIDDEN', 'You do not have permission to do that.'),
      (
        'NETWORK_ERROR',
        'The server cannot be reached. Check your connection and try again.',
      ),
    ]) {
      testWidgets('$code is said above the form', (tester) async {
        final api = _api()
          ..on('POST', '/opportunities', (request) => throw apiError(code));
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.newOpportunity,
        );

        await enterField(tester, 'Name', 'Fleet renewal');
        await _submit(tester, 'Create opportunity');

        await scrollTo(tester, find.text(sentence));
        expect(find.text(sentence), findsOneWidget);
        expect(app.location, Routes.newOpportunity);
      });
    }

    testWidgets('cannot be sent twice', (tester) async {
      final answer = Completer<Object?>();
      final api = _api()
        ..on('POST', '/opportunities', (request) => answer.future);
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newOpportunity,
      );

      await enterField(tester, 'Name', 'Fleet renewal');
      await tester.ensureVisible(
        find.widgetWithText(FilledButton, 'Create opportunity'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Create opportunity'));
      await tester.pump();

      expect(find.bySemanticsLabel('Saving'), findsOneWidget);
      expect(
        find.widgetWithText(FilledButton, 'Create opportunity'),
        findsNothing,
      );
      answer.complete(opportunityJson());
      await tester.pumpAndSettle();
      expect(api.sent('POST', '/opportunities'), hasLength(1));
    });

    testWidgets('Cancel goes back to the pipeline without sending', (
      tester,
    ) async {
      final api = _api();
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.newOpportunity,
      );

      await enterField(tester, 'Name', 'Fleet renewal');
      await tapVisible(tester, find.widgetWithText(TextButton, 'Cancel'));

      expect(app.location, Routes.opportunities);
      expect(api.sent('POST', '/opportunities'), isEmpty);
    });
  });

  group('edit opportunity', () {
    testWidgets(
      'starts with the opportunity and sends only what changed',
      variant: phones,
      (tester) async {
        final api = _api(opportunityJson(value: 1250.5, notes: 'Renewal.'))
          ..on(
            'PATCH',
            '/opportunities/opp-1',
            (request) => opportunityJson(name: 'Fleet renewal 2027'),
          );
        final app = await pumpApp(
          tester,
          api: api,
          user: rep,
          location: _editPath,
        );

        expect(find.text('Edit opportunity'), findsOneWidget);
        expect(
          tester.widget<EditableText>(field('Name')).controller.text,
          'Fleet renewal',
        );
        expect(
          tester.widget<EditableText>(field('Value (USD)')).controller.text,
          '1250.50',
        );
        expect(find.text('Nov 15, 2026'), findsOneWidget);
        // The stage is changed on the page or the pipeline, not here.
        expect(find.text('Stage'), findsNothing);
        await scrollTo(tester, find.text('Marcus Chen'));
        expect(find.text('Northwind Logistics'), findsOneWidget);

        await scrollTo(tester, field('Name'));
        await enterField(tester, 'Name', 'Fleet renewal 2027');
        await tapVisible(tester, find.byTooltip('Clear contact'));
        await enterField(tester, 'Notes', '');
        await _submit(tester, 'Save changes');

        expect(api.sent('PATCH', '/opportunities/opp-1').single.json, {
          'name': 'Fleet renewal 2027',
          'contactId': null,
          'notes': null,
        });
        expect(app.location, Routes.opportunity('opp-1'));
        expect(find.text('Opportunity saved.'), findsOneWidget);
        expect(find.text('Fleet renewal 2027'), findsWidgets);
      },
    );

    testWidgets('an emptied value is sent as 0, an emptied date as null', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'PATCH',
          '/opportunities/opp-1',
          (request) => opportunityJson(value: 0, expectedCloseDate: null),
        );
      await pumpApp(tester, api: api, user: rep, location: _editPath);

      await enterField(tester, 'Value (USD)', '');
      await tapVisible(tester, find.byTooltip('Clear expected close date'));
      await _submit(tester, 'Save changes');

      expect(api.sent('PATCH', '/opportunities/opp-1').single.json, {
        'value': 0,
        'expectedCloseDate': null,
      });
    });

    testWidgets('nothing changed, nothing sent', (tester) async {
      final api = _api();
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: _editPath,
      );

      await _submit(tester, 'Save changes');

      expect(api.sent('PATCH', '/opportunities/opp-1'), isEmpty);
      expect(app.location, Routes.opportunity('opp-1'));
    });

    testWidgets('a company the reader may not see is left as it is', (
      tester,
    ) async {
      // The API answers null for it; saving another field must not unlink it.
      final api = _api(opportunityJson(company: null))
        ..on(
          'PATCH',
          '/opportunities/opp-1',
          (request) => opportunityJson(company: null),
        );
      await pumpApp(tester, api: api, user: rep, location: _editPath);

      await enterField(tester, 'Name', 'Fleet renewal 2027');
      await _submit(tester, 'Save changes');

      expect(api.sent('PATCH', '/opportunities/opp-1').single.json, {
        'name': 'Fleet renewal 2027',
      });
    });

    testWidgets('shows server messages under the fields', (tester) async {
      final api = _api()
        ..on('PATCH', '/opportunities/opp-1', (request) {
          throw validationError({'name': 'This name is taken'});
        });
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: _editPath,
      );

      await enterField(tester, 'Name', 'Fleet renewal 2027');
      await _submit(tester, 'Save changes');

      await scrollTo(tester, find.text('This name is taken'));
      expect(app.location, _editPath);
    });

    testWidgets('an opportunity that cannot be read says why', (tester) async {
      final api = FakeApi()
        ..on('GET', '/opportunities/board', (request) => boardJson([]))
        ..on(
          'GET',
          '/opportunities/opp-1',
          (request) => throw apiError('NOT_FOUND', status: 404),
        );
      await pumpApp(tester, api: api, user: rep, location: _editPath);

      expect(
        find.text('This no longer exists. Go back and refresh the list.'),
        findsWidgets,
      );
    });
  });

  group('custom fields', () {
    testWidgets(
      'a new opportunity sends them, the required one filled in',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on(
            'GET',
            '/custom-fields',
            (request) => customFieldsJson(
              recordType: 'OPPORTUNITY',
              required: {'cf-region'},
            ),
          )
          ..on('POST', '/opportunities', (request) => opportunityJson());
        await pumpApp(
          tester,
          api: api,
          user: rep,
          location: Routes.newOpportunity,
        );

        await enterField(tester, 'Name', 'Fleet renewal');
        await enterField(tester, 'Team size', '12');
        await _submit(tester, 'Create opportunity');
        // Region is required: nothing is sent until it is chosen.
        expect(api.sent('POST', '/opportunities'), isEmpty);
        await scrollTo(tester, find.text('Choose an option.'));

        await chooseOption(tester, 'Region', 'North');
        await _submit(tester, 'Create opportunity');

        expect(api.sent('GET', '/custom-fields').first.query, {
          'recordType': 'OPPORTUNITY',
        });
        expect(api.sent('POST', '/opportunities').single.json['customFields'], {
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
            (request) => customFieldsJson(recordType: 'OPPORTUNITY'),
          )
          ..on(
            'GET',
            '/opportunities/opp-1',
            (request) => opportunityJson(
              customFields: {
                'cf-text': 'NW-104',
                'cf-region': 'South',
                'cf-size': 12,
                'cf-renewal': null,
              },
            ),
          )
          ..on('PATCH', '/opportunities/opp-1', (request) {
            throw validationError({'customFields.cf-text': 'Too long'});
          });
        await pumpApp(tester, api: api, user: rep, location: _editPath);

        await enterField(tester, 'Account code', '');
        await chooseOption(tester, 'Region', 'None');
        await _submit(tester, 'Save changes');

        expect(
          api.sent('PATCH', '/opportunities/opp-1').single.json['customFields'],
          {'cf-text': null, 'cf-region': null},
        );
        await scrollTo(tester, find.text('Too long'));
        expect(find.text('Too long'), findsOneWidget);
      },
    );
  });
}
