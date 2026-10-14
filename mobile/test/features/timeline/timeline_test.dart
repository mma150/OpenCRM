import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

final _path = Routes.lead('lead-1');

/// A recent moment in the API's format, so the entry reads "Today" or "Yesterday".
String _hoursAgo(int hours) {
  return DateTime.now()
      .subtract(Duration(hours: hours))
      .toUtc()
      .toIso8601String();
}

FakeApi _api(Object? Function(FakeRequest request) timeline) {
  return FakeApi()
    ..on('GET', '/leads', (request) => page([leadJson()]))
    ..on('GET', '/leads/lead-1', (request) => leadJson())
    ..on('GET', '/leads/lead-1/timeline', timeline);
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

void main() {
  group('the timeline of a record', () {
    testWidgets(
      'shows each entry with its title, time, author and text',
      variant: phones,
      (tester) async {
        final api = _api((request) {
          return page([
            entryJson(
              body: 'Talked through the fleet pricing for 120 vehicles.',
              author: manager,
            ),
            entryJson(id: 'entry-2', kind: 'NOTE', body: 'Prefers email.'),
            entryJson(
              id: 'entry-3',
              kind: 'STATUS_CHANGE',
              body: null,
              details: {'from': 'NEW', 'to': 'CONTACTED'},
            ),
            entryJson(id: 'entry-4', kind: 'CREATED', body: null),
          ]);
        });
        await pumpApp(tester, api: api, user: rep, location: _path);

        await _scrollTo(tester, find.text('Call'));
        expect(
          find.text('Talked through the fleet pricing for 120 vehicles.'),
          findsOneWidget,
        );
        expect(find.textContaining('Oct 5, 2026'), findsWidgets);
        expect(find.textContaining('· Sarah Jenkins'), findsOneWidget);

        await _scrollTo(tester, find.text('Lead created'));
        expect(find.text('Note'), findsOneWidget);
        expect(find.text('Prefers email.'), findsOneWidget);
        expect(find.text('Status changed: New → Contacted'), findsOneWidget);
        expect(find.text('Load more'), findsNothing);
      },
    );

    testWidgets(
      'filters: All, Conversations, Notes, Changes',
      variant: phones,
      (tester) async {
        final api = _api((request) {
          return switch (request.query['kind']) {
            null => page([
              entryJson(),
              entryJson(id: 'entry-2', kind: 'NOTE', body: 'Prefers email.'),
            ]),
            'NOTE' => page([
              entryJson(id: 'entry-2', kind: 'NOTE', body: 'Prefers email.'),
            ]),
            _ => page([]),
          };
        });
        await pumpApp(tester, api: api, user: rep, location: _path);
        await _scrollTo(tester, find.text('Prefers email.'));

        await tapVisible(tester, find.widgetWithText(ChoiceChip, 'Notes'));
        expect(api.requests.last.query, containsPair('kind', 'NOTE'));
        expect(find.text('Prefers email.'), findsOneWidget);
        expect(find.text('Talked through the fleet pricing.'), findsNothing);

        await tapVisible(
          tester,
          find.widgetWithText(ChoiceChip, 'Conversations'),
        );
        expect(api.requests.last.query, containsPair('kind', 'CONVERSATION'));
        expect(find.text('No conversations yet'), findsOneWidget);

        await tapVisible(tester, find.widgetWithText(ChoiceChip, 'Changes'));
        expect(api.requests.last.query, containsPair('kind', 'SYSTEM'));
        expect(find.text('No changes yet'), findsOneWidget);
      },
    );

    testWidgets('an empty timeline invites the first conversation', (
      tester,
    ) async {
      await pumpApp(
        tester,
        api: _api((request) => page([])),
        user: rep,
        location: _path,
      );

      // The lead's Tasks card sits above the timeline.
      await scrollTo(tester, find.text('Nothing logged yet'));
      expect(find.text('Nothing logged yet'), findsOneWidget);
      expect(
        find.text("Log the first conversation to start this record's history."),
        findsOneWidget,
      );
    });

    testWidgets('loads more entries on request', variant: phones, (
      tester,
    ) async {
      final api = _api((request) {
        final number = int.parse(request.query['page']!);
        return page(
          [
            for (var index = 1; index <= 2; index += 1)
              entryJson(
                id: 'entry-$number-$index',
                kind: 'NOTE',
                body: 'Note $number.$index',
              ),
          ],
          total: 4,
          page: number,
          pageSize: 2,
        );
      });
      await pumpApp(tester, api: api, user: rep, location: _path);

      await _scrollTo(tester, find.text('Load more'));
      expect(find.text('Note 2.1'), findsNothing);
      await tapVisible(tester, find.text('Load more'));

      await _scrollTo(tester, find.text('Note 2.2'));
      expect(find.text('Note 1.1'), findsOneWidget);
      expect(find.text('Load more'), findsNothing);
    });

    testWidgets(
      'a timeline that fails keeps the rest of the page, with Retry',
      variant: phones,
      (tester) async {
        var fail = true;
        final api = _api((request) {
          if (fail) {
            throw apiError(ApiError.network);
          }
          return page([entryJson()]);
        });
        await pumpApp(tester, api: api, user: rep, location: _path);

        expect(find.text('Marcus Chen'), findsWidgets);
        await _scrollTo(tester, find.text('Retry'));
        expect(
          find.text(
            'The server cannot be reached. Check your connection and try again.',
          ),
          findsOneWidget,
        );

        fail = false;
        await tapVisible(tester, find.text('Retry'));
        await _scrollTo(tester, find.text('Call'));
      },
    );
  });

  group('log conversation', () {
    testWidgets(
      'sends the type, the time and what was discussed',
      variant: phones,
      (tester) async {
        var logged = false;
        final api =
            _api(
              (request) =>
                  page(logged ? [entryJson(occurredAt: _hoursAgo(0))] : []),
            )..on('POST', '/leads/lead-1/conversations', (request) {
              logged = true;
              return entryJson();
            });
        await pumpApp(tester, api: api, user: rep, location: _path);

        await tapVisible(tester, find.text('Log conversation'));
        expect(find.text('With Marcus Chen'), findsOneWidget);
        await tapVisible(tester, find.widgetWithText(ChoiceChip, 'Meeting'));
        await enterField(
          tester,
          'What was discussed?',
          ' Talked through the fleet pricing. ',
        );
        final before = DateTime.now().toUtc();
        await tapVisible(
          tester,
          find.widgetWithText(FilledButton, 'Save conversation'),
        );

        final sent = api
            .sent('POST', '/leads/lead-1/conversations')
            .single
            .json;
        expect(sent['type'], 'MEETING');
        expect(sent['summary'], 'Talked through the fleet pricing.');
        // "Now" by default, sent as an exact UTC moment.
        final occurredAt = DateTime.parse(sent['occurredAt']! as String);
        expect(occurredAt.isUtc, true);
        expect(occurredAt.difference(before).inMinutes.abs(), lessThan(2));

        expect(find.text('Conversation logged.'), findsOneWidget);
        expect(find.text('Save conversation'), findsNothing);
        // The timeline loaded again and shows the entry; the lead was read again too
        // (a conversation moves its "last contact").
        await _scrollTo(tester, find.text('Call'));
        expect(api.sent('GET', '/leads/lead-1'), hasLength(2));
      },
    );

    testWidgets('needs what was discussed', (tester) async {
      final api = _api((request) => page([]));
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Log conversation'));
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Save conversation'),
      );

      expect(find.text('Write what was discussed.'), findsOneWidget);
      expect(api.sent('POST', '/leads/lead-1/conversations'), isEmpty);
    });

    testWidgets(
      'shows what the API refused: a field, and anything else',
      variant: phones,
      (tester) async {
        final api = _api((request) => page([]))
          ..on('POST', '/leads/lead-1/conversations', (request) {
            throw validationError({
              'occurredAt': 'The time cannot be in the future',
              'summary': 'Too long',
            });
          });
        await pumpApp(tester, api: api, user: rep, location: _path);

        await tapVisible(tester, find.text('Log conversation'));
        await enterField(tester, 'What was discussed?', 'Hello');
        await tapVisible(
          tester,
          find.widgetWithText(FilledButton, 'Save conversation'),
        );

        expect(find.text('The time cannot be in the future'), findsOneWidget);
        expect(find.text('Too long'), findsOneWidget);

        api.on(
          'POST',
          '/leads/lead-1/conversations',
          (request) => throw apiError('FORBIDDEN', status: 403),
        );
        await tapVisible(
          tester,
          find.widgetWithText(FilledButton, 'Save conversation'),
        );
        expect(
          find.text('You do not have permission to do that.'),
          findsOneWidget,
        );
        // The sheet stays open with what was typed.
        expect(find.text('Hello'), findsOneWidget);
      },
    );
  });

  group('add note', () {
    testWidgets('sends the note and shows it', variant: phones, (tester) async {
      var added = false;
      final api =
          _api((request) {
            return page(
              added ? [entryJson(kind: 'NOTE', body: 'Prefers email.')] : [],
            );
          })..on('POST', '/leads/lead-1/notes', (request) {
            added = true;
            return entryJson(kind: 'NOTE', body: 'Prefers email.');
          });
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Add note'));
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Save note'));
      expect(find.text('Write the note first.'), findsOneWidget);

      await enterField(tester, 'Note', 'Prefers email.');
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Save note'));

      expect(api.sent('POST', '/leads/lead-1/notes').single.json, {
        'body': 'Prefers email.',
      });
      expect(find.text('Note added.'), findsOneWidget);
      await _scrollTo(tester, find.text('Prefers email.'));
    });

    testWidgets('shows a refusal under the field', (tester) async {
      final api = _api((request) => page([]))
        ..on('POST', '/leads/lead-1/notes', (request) {
          throw validationError({'body': 'Use 5000 characters or fewer'});
        });
      await pumpApp(tester, api: api, user: rep, location: _path);

      await tapVisible(tester, find.text('Add note'));
      await enterField(tester, 'Note', 'Hello');
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Save note'));

      expect(find.text('Use 5000 characters or fewer'), findsOneWidget);
    });
  });

  group('the entries of the lead a record was converted from', () {
    const lara = {'id': 'lead-9', 'name': 'Lara QALifecycle'};

    FakeApi contactApi() {
      return FakeApi()
        ..on('GET', '/contacts', (request) => page([contactJson()]))
        ..on('GET', '/contacts/contact-1', (request) => contactJson())
        ..on('GET', '/contacts/contact-1/timeline', (request) {
          return page([
            entryJson(body: 'Asked for a demo.', fromLead: lara),
            entryJson(
              id: 'entry-2',
              kind: 'CREATED',
              body: null,
              details: {'fromLead': lara},
            ),
            entryJson(
              id: 'entry-3',
              kind: 'STATUS_CHANGE',
              body: null,
              details: {'from': 'QUALIFIED', 'to': 'CONVERTED'},
              fromLead: lara,
            ),
            entryJson(
              id: 'entry-4',
              kind: 'CREATED',
              body: null,
              fromLead: lara,
            ),
          ]);
        });
    }

    testWidgets(
      "are titled as the lead's and say which lead, in the order given",
      variant: phones,
      (tester) async {
        await pumpApp(
          tester,
          api: contactApi(),
          user: rep,
          location: Routes.contact('contact-1'),
        );

        await _scrollTo(tester, find.text('Asked for a demo.'));
        // The contact's own entry is titled as the contact's, without the line.
        await _scrollTo(
          tester,
          find.text('Contact created from lead Lara QALifecycle'),
        );
        await _scrollTo(tester, find.text('Converted'));
        await _scrollTo(tester, find.text('Lead created'));
        expect(find.text('Contact created'), findsNothing);
        expect(
          find.textContaining('From lead Lara QALifecycle', findRichText: true),
          findsNWidgets(3),
        );
      },
    );

    testWidgets('"From lead" opens the lead', (tester) async {
      final api = contactApi()
        ..on('GET', '/leads', (request) => page([leadJson(id: 'lead-9')]))
        ..on('GET', '/leads/lead-9', (request) => leadJson(id: 'lead-9'))
        ..on('GET', '/leads/lead-9/timeline', (request) => page([]));
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.contact('contact-1'),
      );

      final link = find
          .textContaining('From lead Lara QALifecycle', findRichText: true)
          .first;
      await _scrollTo(tester, link);
      await tapVisible(tester, link);

      expect(app.location, Routes.lead('lead-9'));
    });

    testWidgets("a lead's own timeline has no such line", (tester) async {
      final api = _api((request) => page([entryJson()]));
      await pumpApp(tester, api: api, user: rep, location: _path);

      await _scrollTo(tester, find.text('Call'));
      expect(
        find.textContaining('From lead', findRichText: true),
        findsNothing,
      );
    });
  });
}
