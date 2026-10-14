import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/status_badge.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

final _path = Routes.opportunity('opp-1');
final _qualified = pipelineStages[1];
final _won = pipelineStages[3];
final _lost = pipelineStages[4];

Map<String, Object?> _closedAsLost() {
  return opportunityJson(
    stage: _lost,
    closeReason: 'Went with Acme',
    closedAt: '2026-10-04T10:00:00.000Z',
  );
}

/// An opportunity's page: the opportunity, an empty timeline, the pipeline's stages, and
/// the board behind it.
FakeApi _api([Map<String, Object?>? opportunity]) {
  return FakeApi()
    ..on(
      'GET',
      '/opportunities/board',
      (request) => boardJson([opportunity ?? opportunityJson()]),
    )
    ..on(
      'GET',
      '/opportunities/opp-1',
      (request) => opportunity ?? opportunityJson(),
    )
    ..on('GET', '/opportunities/opp-1/timeline', (request) => page([]))
    ..on('GET', '/pipeline-stages', (request) => pipelineStagesJson());
}

Future<void> _openMenu(WidgetTester tester) {
  return tapVisible(tester, find.byTooltip('Opportunity actions'));
}

void main() {
  group('what it shows', () {
    testWidgets('the header, the follow-up and the details', variant: phones, (
      tester,
    ) async {
      final api = _api(
        opportunityJson(
          notes: 'Renewal of the whole fleet.',
          followUpAt: '2026-10-01T09:00:00.000Z',
          followUpNote: 'Send the contract',
          convertedFromLead: {'id': 'lead-1', 'name': 'Marcus Chen'},
        ),
      );
      await pumpApp(tester, api: api, user: rep, location: _path);

      // The app bar and the header.
      expect(find.text('Fleet renewal'), findsNWidgets(2));
      expect(find.text('Northwind Logistics'), findsOneWidget);
      expect(find.widgetWithText(StatusBadge, 'New'), findsOneWidget);
      expect(find.text(r'$48,000'), findsOneWidget);
      expect(find.text('Nov 15, 2026'), findsOneWidget);
      expect(find.text('Never'), findsOneWidget);
      await scrollTo(tester, find.textContaining('Follow-up overdue'));
      expect(
        find.textContaining('Follow-up overdue: Oct 1, 2026'),
        findsOneWidget,
      );
      expect(find.text('Send the contract'), findsOneWidget);

      await tapVisible(tester, find.text('Details'));
      await scrollTo(tester, find.text('Renewal of the whole fleet.'));
      expect(find.text('Open'), findsOneWidget);
      // The records it belongs to are named, as links to their pages.
      await scrollTo(tester, find.text('Converted from lead'));
      expect(find.text('Company'), findsOneWidget);
      expect(find.text('Contact'), findsOneWidget);
      expect(find.text('Marcus Chen'), findsNWidgets(2));
    });

    testWidgets(
      'a long name and an opportunity with nothing optional',
      variant: phones,
      (tester) async {
        final api = _api(
          opportunityJson(
            name:
                'An Exceptionally Long Opportunity Name For The Whole Fleet Of '
                'Northwind Logistics',
            value: 0,
            expectedCloseDate: null,
            contact: null,
            company: null,
            stage: stageJson(name: 'Waiting for the procurement committee'),
          ),
        );
        await pumpApp(tester, api: api, user: rep, location: _path);

        expect(find.textContaining('Exceptionally Long'), findsWidgets);
        expect(find.text(r'$0'), findsOneWidget);
        // A missing value is a dash, never an empty space.
        expect(find.text('—'), findsOneWidget);
        await tapVisible(tester, find.text('Details'));
        await scrollTo(tester, find.text('Created'));
        expect(find.text('Company'), findsNothing);
        expect(find.text('Contact'), findsNothing);
        expect(find.text('Converted from lead'), findsNothing);
      },
    );

    testWidgets('a link opens the record it names', (tester) async {
      final api =
          _api(
              opportunityJson(
                convertedFromLead: {'id': 'lead-1', 'name': 'Marcus Chen'},
                contact: null,
              ),
            )
            ..on('GET', '/leads', (request) => page([leadJson()]))
            ..on(
              'GET',
              '/leads/lead-1',
              (request) => leadJson(status: 'CONVERTED'),
            )
            ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
      final app = await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Details'));
      await tapVisible(tester, find.text('Marcus Chen'));

      expect(app.location, Routes.lead('lead-1'));
    });

    testWidgets('custom fields, read-only, when the installation has some', (
      tester,
    ) async {
      final api =
          _api(
            opportunityJson(
              customFields: {'field-1': 'Gold', 'field-2': 12500.5},
            ),
          )..on('GET', '/custom-fields', (request) {
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
      expect(find.text('12,500.5'), findsOneWidget);
      expect(api.sent('GET', '/custom-fields').single.query, {
        'recordType': 'OPPORTUNITY',
      });
    });

    testWidgets('a lost opportunity says when and why', variant: phones, (
      tester,
    ) async {
      await pumpApp(
        tester,
        api: _api(_closedAsLost()),
        user: rep,
        location: _path,
      );

      expect(find.widgetWithText(StatusBadge, 'Lost'), findsOneWidget);
      // A closed opportunity is reopened first: nothing moves or closes it.
      await scrollTo(tester, find.text('Reopen'));
      expect(find.text('Move to stage'), findsNothing);
      expect(find.text('Close as won'), findsNothing);
      expect(find.text('Close as lost'), findsNothing);
      await scrollTo(tester, find.text('Reason: Went with Acme'));
      expect(
        find.textContaining('Closed as lost on Oct 4, 2026'),
        findsOneWidget,
      );
      expect(find.text('Set follow-up'), findsNothing);
      // It still takes conversations and notes.
      expect(find.text('Log conversation'), findsOneWidget);
      expect(find.text('Add note'), findsOneWidget);
    });

    testWidgets('a won opportunity without a reason says so', variant: phones, (
      tester,
    ) async {
      final api = _api(
        opportunityJson(stage: _won, closedAt: '2026-10-04T10:00:00.000Z'),
      );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await scrollTo(tester, find.text('No reason was given.'));
      expect(
        find.textContaining('Closed as won on Oct 4, 2026'),
        findsOneWidget,
      );
    });

    testWidgets(
      'an opportunity that cannot be read says why, with Retry',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/opportunities/board', (request) => boardJson([]))
          ..on(
            'GET',
            '/opportunities/opp-1',
            (request) => throw apiError('NOT_FOUND', status: 404),
          );
        await pumpApp(tester, api: api, user: rep, location: _path);

        expect(
          find.text('This no longer exists. Go back and refresh the list.'),
          findsOneWidget,
        );

        api
          ..on('GET', '/opportunities/opp-1', (request) => opportunityJson())
          ..on('GET', '/opportunities/opp-1/timeline', (request) => page([]));
        await tapVisible(tester, find.text('Retry'));
        expect(find.text('Fleet renewal'), findsWidgets);
      },
    );
  });

  group('what a role may do', () {
    testWidgets('Read-only: nothing that writes', variant: phones, (
      tester,
    ) async {
      final api = _api(opportunityJson(followUpAt: '2026-10-01T09:00:00.000Z'));
      await pumpApp(tester, api: api, user: readOnly, location: _path);

      expect(find.text('Fleet renewal'), findsWidgets);
      for (final label in [
        'Log conversation',
        'Add note',
        'Move to stage',
        'Close as won',
        'Close as lost',
        'Reopen',
        'Change follow-up',
        'Clear follow-up',
        'Set follow-up',
      ]) {
        expect(find.text(label), findsNothing, reason: label);
      }
      expect(find.byTooltip('Opportunity actions'), findsNothing);
      // The follow-up that is set is still shown.
      await scrollTo(tester, find.textContaining('Follow-up overdue'));
      await scrollTo(tester, find.text('Nothing logged yet'));
    });

    testWidgets('Read-only: a closed one cannot be reopened', (tester) async {
      await pumpApp(
        tester,
        api: _api(_closedAsLost()),
        user: readOnly,
        location: _path,
      );

      expect(find.text('Reason: Went with Acme'), findsOneWidget);
      expect(find.text('Reopen'), findsNothing);
    });

    for (final user in [admin, manager, rep]) {
      testWidgets('${user.role.label}: the buttons and the menu', (
        tester,
      ) async {
        await pumpApp(tester, api: _api(), user: user, location: _path);

        expect(find.text('Move to stage'), findsOneWidget);
        expect(find.text('Close as won'), findsOneWidget);
        expect(find.text('Close as lost'), findsOneWidget);
        expect(find.text('Reopen'), findsNothing);
        await _openMenu(tester);

        expect(find.text('Edit'), findsOneWidget);
        expect(find.text('Delete'), findsOneWidget);
        // A rep does not hand an opportunity to someone else.
        expect(
          find.text('Reassign'),
          user.role == Role.salesRep ? findsNothing : findsOneWidget,
        );
      });
    }
  });

  group('changing it', () {
    testWidgets('moves to another open stage', variant: phones, (tester) async {
      final api = _api()
        ..on(
          'POST',
          '/opportunities/opp-1/stage',
          (request) => opportunityJson(stage: _qualified),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Move to stage'));
      // The other open stages only: closing has its own buttons.
      expect(find.widgetWithText(ListTile, 'New'), findsNothing);
      expect(find.widgetWithText(ListTile, 'Proposal'), findsOneWidget);
      expect(find.widgetWithText(ListTile, 'Close as won'), findsNothing);
      expect(find.widgetWithText(ListTile, 'Won'), findsNothing);
      await tapVisible(tester, find.text('Qualified'));

      expect(api.sent('POST', '/opportunities/opp-1/stage').single.json, {
        'stageId': 'stage-qualified',
      });
      expect(find.text('Fleet renewal moved to Qualified.'), findsOneWidget);
      expect(find.widgetWithText(StatusBadge, 'Qualified'), findsOneWidget);
      // The change wrote a timeline entry (read once the timeline is on screen).
      await scrollTo(tester, find.text('Nothing logged yet'));
      final requests = api.requests.map((request) => '$request').toList();
      expect(
        requests.lastIndexOf('GET /opportunities/opp-1/timeline'),
        greaterThan(requests.indexOf('POST /opportunities/opp-1/stage')),
      );
    });

    testWidgets('a refused move says why and changes nothing', (tester) async {
      final api = _api()
        ..on(
          'POST',
          '/opportunities/opp-1/stage',
          (request) => throw apiError('FORBIDDEN', status: 403),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Move to stage'));
      await tapVisible(tester, find.text('Proposal'));

      expect(
        find.text('You do not have permission to do that.'),
        findsOneWidget,
      );
      expect(find.widgetWithText(StatusBadge, 'New'), findsOneWidget);
    });

    testWidgets('stages that cannot be read are said, and asked for again', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'GET',
          '/pipeline-stages',
          (request) => throw apiError('SERVICE_UNAVAILABLE', status: 503),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Move to stage'));
      expect(
        find.text(
          'The service is temporarily unavailable. Try again in a moment.',
        ),
        findsOneWidget,
      );

      api.on('GET', '/pipeline-stages', (request) => pipelineStagesJson());
      await tapVisible(tester, find.text('Move to stage'));
      expect(find.widgetWithText(ListTile, 'Qualified'), findsOneWidget);
    });

    testWidgets('closes as lost, with a reason', variant: phones, (
      tester,
    ) async {
      final api = _api()
        ..on(
          'POST',
          '/opportunities/opp-1/close',
          (request) => _closedAsLost(),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Close as lost'));
      // Without a reason nothing is sent.
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Close as lost'),
      );
      expect(find.text('Say why the opportunity was lost.'), findsOneWidget);
      expect(api.sent('POST', '/opportunities/opp-1/close'), isEmpty);

      await enterField(tester, 'Reason', 'Went with Acme');
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Close as lost'),
      );

      expect(api.sent('POST', '/opportunities/opp-1/close').single.json, {
        'outcome': 'LOST',
        'reason': 'Went with Acme',
      });
      expect(find.text('Fleet renewal was closed as lost.'), findsOneWidget);
      await scrollTo(tester, find.widgetWithText(StatusBadge, 'Lost'));
      await scrollTo(tester, find.text('Reopen'));
      expect(find.text('Close as lost'), findsNothing);
      await scrollTo(tester, find.text('Reason: Went with Acme'));
      // The change wrote a timeline entry (read once the timeline is on screen, under
      // the Tasks card).
      await scrollTo(tester, find.text('Nothing logged yet'));
      final requests = api.requests.map((request) => '$request').toList();
      expect(
        requests.lastIndexOf('GET /opportunities/opp-1/timeline'),
        greaterThan(requests.indexOf('POST /opportunities/opp-1/close')),
      );
    });

    testWidgets('closes as won without a reason', (tester) async {
      final api = _api()
        ..on(
          'POST',
          '/opportunities/opp-1/close',
          (request) => opportunityJson(
            stage: _won,
            closedAt: '2026-10-06T10:00:00.000Z',
          ),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Close as won'));
      expect(
        find.text(
          'Fleet renewal moves to the Won stage. You can reopen it later.',
        ),
        findsOneWidget,
      );
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Close as won'),
      );

      expect(api.sent('POST', '/opportunities/opp-1/close').single.json, {
        'outcome': 'WON',
      });
      expect(find.text('Fleet renewal was closed as won.'), findsOneWidget);
      expect(find.text('No reason was given.'), findsOneWidget);
    });

    testWidgets('what the API says about the reason is under the field', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'POST',
          '/opportunities/opp-1/close',
          (request) => throw validationError({'reason': 'Too long'}),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Close as lost'));
      await enterField(tester, 'Reason', 'Price');
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Close as lost'),
      );

      expect(find.text('Too long'), findsOneWidget);
      expect(find.byType(SubmitButton), findsOneWidget);
    });

    testWidgets('a close the API refuses is said above the field', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'POST',
          '/opportunities/opp-1/close',
          (request) => throw apiError('FORBIDDEN', status: 403),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Close as won'));
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Close as won'),
      );

      expect(
        find.text('You do not have permission to do that.'),
        findsOneWidget,
      );
    });

    testWidgets('reopens a closed one into the first stage', variant: phones, (
      tester,
    ) async {
      final api = _api(_closedAsLost())
        ..on(
          'POST',
          '/opportunities/opp-1/reopen',
          (request) => opportunityJson(),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Reopen'));

      expect(
        api.sent('POST', '/opportunities/opp-1/reopen').single.json,
        <String, Object?>{},
      );
      expect(find.text('Fleet renewal was reopened in New.'), findsOneWidget);
      expect(find.widgetWithText(StatusBadge, 'New'), findsOneWidget);
      expect(find.text('Move to stage'), findsOneWidget);
      expect(find.textContaining('Closed as lost'), findsNothing);
    });

    testWidgets('a reopen the API refuses says why', (tester) async {
      final api = _api(_closedAsLost())
        ..on(
          'POST',
          '/opportunities/opp-1/reopen',
          (request) => throw apiError('VALIDATION_FAILED', status: 400),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Reopen'));

      expect(
        find.text(
          'Some of the details are not valid. Check them and try again.',
        ),
        findsOneWidget,
      );
      expect(find.widgetWithText(StatusBadge, 'Lost'), findsOneWidget);
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
          '/opportunities/opp-1/assign',
          (request) => opportunityJson(owner: manager),
        );
      await pumpApp(tester, api: api, user: manager, location: _path);

      await _openMenu(tester);
      await tapVisible(tester, find.text('Reassign'));
      expect(find.text('Sales Rep · Current owner'), findsOneWidget);
      await tapVisible(tester, find.text('Sarah Jenkins').last);
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Reassign'));

      expect(api.sent('POST', '/opportunities/opp-1/assign').single.json, {
        'ownerId': manager.id,
      });
      expect(find.text('Owner changed.'), findsOneWidget);
      expect(find.text('Sarah Jenkins'), findsOneWidget);
    });

    testWidgets(
      'deletes after asking, and goes back to the pipeline',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('DELETE', '/opportunities/opp-1', (request) => null);
        final app = await pumpApp(tester, api: api, user: rep, location: _path);

        await _openMenu(tester);
        await tapVisible(tester, find.text('Delete'));
        expect(find.text('Delete Fleet renewal?'), findsOneWidget);
        // Cancel sends nothing.
        await tapVisible(tester, find.text('Cancel'));
        expect(api.sent('DELETE', '/opportunities/opp-1'), isEmpty);

        api.on('GET', '/opportunities/board', (request) => boardJson([]));
        await _openMenu(tester);
        await tapVisible(tester, find.text('Delete'));
        await tapVisible(tester, find.text('Delete opportunity'));

        expect(api.sent('DELETE', '/opportunities/opp-1'), hasLength(1));
        expect(app.location, Routes.opportunities);
        expect(find.text('Opportunity deleted.'), findsOneWidget);
        // The pipeline was read again, without it.
        expect(find.text('No opportunities yet'), findsOneWidget);
      },
    );

    testWidgets('a delete the API refuses says why and stays', (tester) async {
      final api = _api()
        ..on(
          'DELETE',
          '/opportunities/opp-1',
          (request) => throw apiError('FORBIDDEN', status: 403),
        );
      final app = await pumpApp(tester, api: api, user: rep, location: _path);

      await _openMenu(tester);
      await tapVisible(tester, find.text('Delete'));
      await tapVisible(tester, find.text('Delete opportunity'));

      expect(
        find.text('You do not have permission to do that.'),
        findsOneWidget,
      );
      expect(app.location, _path);
    });

    testWidgets('Edit opens the form', (tester) async {
      final app = await pumpApp(
        tester,
        api: _api(),
        user: rep,
        location: _path,
      );

      await _openMenu(tester);
      await tapVisible(tester, find.text('Edit'));

      expect(app.location, Routes.editOpportunity('opp-1'));
      expect(find.text('Edit opportunity'), findsOneWidget);
    });
  });

  group('the follow-up', () {
    testWidgets('is changed from its sheet', variant: phones, (tester) async {
      final api =
          _api(
            opportunityJson(
              followUpAt: '2026-11-15T09:30:00.000Z',
              followUpNote: 'Send the contract',
            ),
          )..on(
            'PUT',
            '/opportunities/opp-1/follow-up',
            (request) => opportunityJson(),
          );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Change follow-up'));
      await enterField(tester, 'What to do (optional)', 'Call about the demo');
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Save follow-up'),
      );

      final sent = api
          .sent('PUT', '/opportunities/opp-1/follow-up')
          .single
          .json;
      expect(sent['at'], '2026-11-15T09:30:00.000Z');
      expect(sent['note'], 'Call about the demo');
      expect(find.text('Follow-up saved.'), findsOneWidget);
      // The answer had no follow-up, so the page now offers to set one.
      await scrollTo(tester, find.text('Set follow-up'));
      expect(find.text('Set follow-up'), findsOneWidget);
    });

    testWidgets('is cleared from its sheet', (tester) async {
      final api = _api(opportunityJson(followUpAt: '2026-11-15T09:30:00.000Z'))
        ..on(
          'PUT',
          '/opportunities/opp-1/follow-up',
          (request) => opportunityJson(),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Change follow-up'));
      await tapVisible(tester, find.text('Clear follow-up'));

      expect(api.sent('PUT', '/opportunities/opp-1/follow-up').single.json, {
        'at': null,
        'note': null,
      });
      expect(find.text('Follow-up cleared.'), findsOneWidget);
    });

    testWidgets('a new one needs a time', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Set follow-up'));
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Save follow-up'),
      );

      expect(find.text('Choose when to follow up.'), findsOneWidget);
      expect(api.sent('PUT', '/opportunities/opp-1/follow-up'), isEmpty);
    });

    testWidgets('a new one is set with the date and time pickers', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'PUT',
          '/opportunities/opp-1/follow-up',
          (request) => opportunityJson(
            followUpAt: request.json['at']! as String,
            followUpNote: 'Send the contract',
          ),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Set follow-up'));
      await tapVisible(tester, find.text('Choose a date and time'));
      // Today, at the time shown: the pickers' own OK buttons.
      await tapVisible(tester, find.text('OK'));
      await tapVisible(tester, find.text('OK'));
      await enterField(tester, 'What to do (optional)', 'Send the contract');
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Save follow-up'),
      );

      final sent = api
          .sent('PUT', '/opportunities/opp-1/follow-up')
          .single
          .json;
      expect(DateTime.parse(sent['at']! as String).isUtc, true);
      expect(sent['note'], 'Send the contract');
      expect(find.text('Follow-up saved.'), findsOneWidget);
      await scrollTo(tester, find.text('Send the contract'));
      expect(find.text('Change follow-up'), findsOneWidget);
    });

    testWidgets('what the API refuses is said in the sheet', (tester) async {
      final api = _api(opportunityJson(followUpAt: '2026-11-15T09:30:00.000Z'))
        ..on(
          'PUT',
          '/opportunities/opp-1/follow-up',
          (request) => throw validationError({'at': 'Choose a later time'}),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Change follow-up'));
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Save follow-up'),
      );

      expect(find.text('Choose a later time'), findsOneWidget);
      expect(find.byType(SubmitButton), findsOneWidget);
    });

    testWidgets(
      'one that is still set on a closed opportunity can only be cleared',
      variant: phones,
      (tester) async {
        final closed = _closedAsLost()
          ..['followUpAt'] = '2026-11-15T09:30:00.000Z';
        final api = _api(closed)
          ..on(
            'PUT',
            '/opportunities/opp-1/follow-up',
            (request) => _closedAsLost(),
          );
        await pumpApp(tester, api: api, user: rep, location: _path);

        await scrollTo(tester, find.text('Clear follow-up'));
        expect(find.text('Change follow-up'), findsNothing);
        await tapVisible(tester, find.text('Clear follow-up'));

        expect(api.sent('PUT', '/opportunities/opp-1/follow-up').single.json, {
          'at': null,
          'note': null,
        });
        expect(find.text('Follow-up cleared.'), findsOneWidget);
        expect(find.textContaining('Next follow-up'), findsNothing);
      },
    );
  });

  group('the timeline', () {
    testWidgets(
      'shows what happened, and a note is written on it',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('GET', '/opportunities/opp-1/timeline', (request) {
            return page([
              entryJson(
                kind: 'STATUS_CHANGE',
                body: null,
                details: {
                  'from': 'New',
                  'to': 'Qualified',
                  'fromKind': 'OPEN',
                  'toKind': 'OPEN',
                },
              ),
            ]);
          })
          ..on(
            'POST',
            '/opportunities/opp-1/notes',
            (request) => entryJson(kind: 'NOTE', body: 'Budget is approved.'),
          );
        await pumpApp(tester, api: api, user: rep, location: _path);

        await scrollTo(tester, find.textContaining('Qualified'));
        await tapVisible(tester, find.text('Add note'));
        await tester.enterText(
          find.byType(EditableText).last,
          'Budget is approved.',
        );
        await tester.pump();
        await tapVisible(tester, find.byType(SubmitButton));

        expect(api.sent('POST', '/opportunities/opp-1/notes').single.json, {
          'body': 'Budget is approved.',
        });
        // The timeline was read again.
        expect(api.sent('GET', '/opportunities/opp-1/timeline'), hasLength(2));
      },
    );

    testWidgets('a conversation moves the last contact', (tester) async {
      final api = _api()
        ..on(
          'POST',
          '/opportunities/opp-1/conversations',
          (request) => entryJson(),
        );
      await pumpApp(tester, api: api, user: rep, location: _path);
      expect(api.sent('GET', '/opportunities/opp-1'), hasLength(1));

      await tapVisible(tester, find.text('Log conversation'));
      await tester.enterText(
        find.byType(EditableText).last,
        'Talked through the contract.',
      );
      await tester.pump();
      await tapVisible(tester, find.byType(SubmitButton));

      expect(
        api.sent('POST', '/opportunities/opp-1/conversations'),
        hasLength(1),
      );
      // The opportunity was read again for its "last contact".
      expect(api.sent('GET', '/opportunities/opp-1'), hasLength(2));
    });
  });
}
