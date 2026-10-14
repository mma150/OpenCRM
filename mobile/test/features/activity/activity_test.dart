import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/features/activity/activity_entry.dart';
import 'package:opencrm/features/activity/activity_labels.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

ActivityEntry _entry({
  String kind = 'CONVERSATION',
  String? conversationType = 'CALL',
  String? body = 'Talked through the fleet pricing.',
  Map<String, Object?>? details,
}) {
  return ActivityEntry.fromJson(
    activityJson(
      kind: kind,
      conversationType: conversationType,
      body: body,
      details: details,
    ),
  );
}

String _sentence(ActivityEntry activity) {
  final words = activitySentence(activity.entry);
  return '${words.before} ${activity.record.name}${words.after}';
}

Finder _rich(String text) => find.textContaining(text, findRichText: true);

void main() {
  group('the words of an entry', () {
    test('what someone did, around the name of the record', () {
      expect(_sentence(_entry()), 'logged a call with Marcus Chen');
      expect(_sentence(_entry(kind: 'NOTE')), 'added a note on Marcus Chen');
      expect(
        _sentence(
          _entry(kind: 'STATUS_CHANGE', details: {'from': 'NEW', 'to': 'LOST'}),
        ),
        'marked Marcus Chen as lost',
      );
      expect(
        _sentence(
          _entry(
            kind: 'STATUS_CHANGE',
            details: {'from': 'NEW', 'to': 'CONTACTED'},
          ),
        ),
        'changed the status of Marcus Chen to Contacted',
      );
      expect(
        _sentence(
          _entry(
            kind: 'STATUS_CHANGE',
            details: {'from': 'Proposal', 'to': 'Won', 'toKind': 'WON'},
          ),
        ),
        'closed Marcus Chen as won',
      );
      expect(
        _sentence(
          _entry(
            kind: 'ASSIGNMENT',
            details: {
              'fromOwner': {'id': 'a', 'name': 'Ada'},
              'toOwner': {'id': 'b', 'name': 'Rob'},
            },
          ),
        ),
        'reassigned Marcus Chen from Ada to Rob',
      );
      expect(_sentence(_entry(kind: 'SOMETHING_NEW')), 'updated Marcus Chen');
    });

    test('the badge and the line under it', () {
      expect(activityBadge(_entry().entry), 'Call');
      final lost = _entry(
        kind: 'STATUS_CHANGE',
        body: null,
        details: {
          'from': 'NEW',
          'to': 'LOST',
          'reason': 'CHOSE_COMPETITOR',
          'note': 'Went with Acme',
        },
      );
      expect(activityBadge(lost.entry), 'Lost');
      expect(activityExcerpt(lost), 'Chose competitor — Went with Acme');
      expect(activityExcerpt(_entry()), 'Talked through the fleet pricing.');
      final quote = _entry(
        kind: 'QUOTE_STATUS',
        body: null,
        details: {
          'from': 'DRAFT',
          'to': 'SENT',
          'quote': {'id': 'q', 'number': 'Q-0001'},
          'total': 4800,
        },
      );
      expect(activityExcerpt(quote), r'Quote Q-0001 sent · $4,800');
    });
  });

  group('the feed', () {
    testWidgets(
      'a manager finds it under More and sees who did what',
      variant: phones,
      (tester) async {
        final api = FakeApi()
          ..on('GET', '/activity', (request) {
            return page([
              activityJson(),
              activityJson(
                id: 'entry-2',
                kind: 'NOTE',
                conversationType: null,
                body: 'Prefers email',
                author: manager,
                record: const {'type': 'COMPANY', 'id': 'c-1', 'name': 'Acme'},
              ),
            ]);
          });
        final app = await pumpApp(
          tester,
          api: api,
          user: manager,
          location: Routes.more,
        );

        await tapVisible(tester, find.text('Activity'));
        expect(app.location, Routes.activity);
        expect(
          _rich('Riley Rep logged a call with Marcus Chen'),
          findsOneWidget,
        );
        expect(find.text('Talked through the fleet pricing.'), findsOneWidget);
        await scrollTo(tester, _rich('Sarah Jenkins added a note on Acme'));
        expect(find.text('Company'), findsOneWidget);
        expect(
          api.sent('GET', '/activity').single.query.containsKey('kind'),
          isFalse,
        );
      },
    );

    testWidgets('filters by type, and a tap opens the record', (tester) async {
      final api = FakeApi()
        ..on('GET', '/activity', (request) => page([activityJson()]))
        ..on('GET', '/leads', (request) => page([leadJson()]))
        ..on('GET', '/leads/lead-1', (request) => leadJson())
        ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
      final app = await pumpApp(
        tester,
        api: api,
        user: admin,
        location: Routes.activity,
      );

      await tapVisible(tester, find.widgetWithText(ChoiceChip, 'Changes'));
      expect(api.sent('GET', '/activity').last.query['kind'], 'SYSTEM');

      await tapVisible(tester, _rich('logged a call with'));
      expect(app.location, Routes.lead('lead-1'));
    });

    testWidgets('loads the next page as the end comes near', (tester) async {
      final api = FakeApi()
        ..on('GET', '/activity', (request) {
          final number = int.parse(request.query['page']!);
          final from = (number - 1) * 25 + 1;
          return page(
            [
              for (
                var index = from;
                index < from + (number == 1 ? 25 : 3);
                index += 1
              )
                activityJson(id: 'entry-$index', body: 'Entry number $index'),
            ],
            total: 28,
            page: number,
          );
        });
      await pumpApp(tester, api: api, user: manager, location: Routes.activity);

      await scrollTo(tester, find.text('Entry number 28'));
      expect(api.sent('GET', '/activity'), hasLength(2));
    });

    testWidgets('empty, and a failure with Retry', variant: phones, (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET', '/activity', (request) => throw apiError('INTERNAL_ERROR'));
      await pumpApp(tester, api: api, user: manager, location: Routes.activity);
      expect(
        find.text('The server ran into a problem. Try again in a moment.'),
        findsOneWidget,
      );

      api.on('GET', '/activity', (request) => page([]));
      await tapVisible(tester, find.text('Retry'));
      expect(find.text('No activity yet'), findsOneWidget);
    });

    for (final user in [rep, readOnly]) {
      testWidgets('${user.role.label}: not offered, and never asked for', (
        tester,
      ) async {
        final api = FakeApi();
        final app = await pumpApp(
          tester,
          api: api,
          user: user,
          location: Routes.more,
        );
        await scrollTo(tester, find.text('Notifications'));
        expect(find.text('Activity'), findsNothing);

        // Reached by its address all the same: told so, and the API is not asked.
        app.router.go(Routes.activity);
        await tester.pumpAndSettle();
        expect(find.text('You do not have access to Activity'), findsOneWidget);
        expect(api.sent('GET', '/activity'), isEmpty);
      });
    }
  });
}
