import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

final _tomorrow = DateTime.now()
    .add(const Duration(days: 1))
    .toUtc()
    .toIso8601String();

/// Answers `GET /tasks` by its `due` group, and the Done view by `status=DONE`.
FakeApi _api({
  List<Object?>? overdue,
  List<Object?> today = const [],
  List<Object?>? upcoming,
  List<Object?> none = const [],
  List<Object?> done = const [],
}) {
  final groups = {
    'overdue': overdue ?? [taskJson()],
    'today': today,
    'upcoming':
        upcoming ??
        [
          taskJson(
            id: 'task-2',
            title: 'Book the demo room',
            dueAt: _tomorrow,
            record: null,
          ),
        ],
    'none': none,
  };
  return FakeApi()
    ..on('GET', '/tasks', (request) {
      if (request.query['status'] == 'DONE') {
        return page(done);
      }
      return page(groups[request.query['due']] ?? const []);
    })
    ..on('GET', '/users/assignable', (request) {
      return [
        {'id': manager.id, 'name': manager.name, 'role': 'SALES_MANAGER'},
        {'id': rep.id, 'name': rep.name, 'role': 'SALES_REP'},
      ];
    });
}

List<FakeRequest> _openRequests(FakeApi api) {
  return [
    for (final request in api.sent('GET', '/tasks'))
      if (request.query['status'] == 'OPEN' && request.query['due'] != null)
        request,
  ];
}

void main() {
  group('the open tasks', () {
    testWidgets(
      'in their groups, with counts, overdue said in words',
      variant: phones,
      (tester) async {
        final api = _api();
        await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

        expect(find.bySemanticsLabel('Overdue: 1'), findsOneWidget);
        expect(find.text('Send revised pricing'), findsOneWidget);
        expect(find.textContaining('Overdue · Oct 1, 2026'), findsOneWidget);
        expect(find.text('Marcus Chen'), findsOneWidget);
        await scrollTo(tester, find.text('Book the demo room'));
        expect(find.bySemanticsLabel('Upcoming: 1'), findsOneWidget);
        expect(find.textContaining('Due Tomorrow'), findsOneWidget);
        await scrollTo(tester, find.bySemanticsLabel('No due date: 0'));
        expect(find.text('Nothing here.'), findsWidgets);

        // One request per group, open tasks only, the rep's own, in the device's zone.
        final sent = _openRequests(api);
        expect(sent.map((request) => request.query['due']).toSet(), {
          'overdue',
          'today',
          'upcoming',
          'none',
        });
        for (final request in sent) {
          expect(request.query['assigneeId'], rep.id);
          expect(request.query['sort'], 'dueAt');
          expect(request.query['tz'], matches(RegExp(r'^[+-]\d{2}:\d{2}$')));
        }
      },
    );

    testWidgets(
      'says so when there is nothing to do, by role',
      variant: phones,
      (tester) async {
        await pumpApp(
          tester,
          api: _api(overdue: [], upcoming: []),
          user: rep,
          location: Routes.tasks,
        );
        expect(find.text('No open tasks'), findsOneWidget);
        expect(find.widgetWithText(OutlinedButton, 'New task'), findsOneWidget);
      },
    );

    testWidgets('a Read-only user sees everyone\'s tasks and changes nothing', (
      tester,
    ) async {
      final api = _api();
      await pumpApp(tester, api: api, user: readOnly, location: Routes.tasks);

      expect(find.text('Send revised pricing'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Complete Send revised pricing'),
        findsNothing,
      );
      expect(find.text('New task'), findsNothing);
      expect(find.textContaining('Assignee:'), findsNothing);
      expect(
        _openRequests(api)
            .every((request) => request.query['assigneeId'] == null),
        isTrue,
      );
    });

    testWidgets('a failure says why, with Retry', variant: phones, (
      tester,
    ) async {
      final api = FakeApi()
        ..on('GET', '/tasks', (request) => throw apiError('INTERNAL_ERROR'));
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      expect(
        find.text('The server ran into a problem. Try again in a moment.'),
        findsOneWidget,
      );
      api.on('GET', '/tasks', (request) => page([taskJson()]));
      await tapVisible(tester, find.text('Retry'));
      expect(find.text('Send revised pricing'), findsWidgets);
    });

    testWidgets('searches, and shows one group', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      await tester.enterText(find.byType(TextField).first, 'pricing');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(_openRequests(api).last.query['search'], 'pricing');

      await tapVisible(tester, find.widgetWithText(ChoiceChip, 'Upcoming'));
      expect(find.text('Book the demo room'), findsOneWidget);
      expect(find.text('Send revised pricing'), findsNothing);
    });

    testWidgets('the link of a linked record opens the record', (tester) async {
      final api = _api()
        ..on('GET', '/leads', (request) => page([leadJson()]))
        ..on('GET', '/leads/lead-1', (request) => leadJson())
        ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.tasks,
      );

      await tapVisible(tester, find.text('Marcus Chen'));
      expect(app.location, Routes.lead('lead-1'));
    });
  });

  group('whose tasks', () {
    testWidgets('a manager picks a person, or everyone', variant: phones, (
      tester,
    ) async {
      final api = _api();
      await pumpApp(tester, api: api, user: manager, location: Routes.tasks);
      expect(_openRequests(api).last.query['assigneeId'], manager.id);

      await tapVisible(tester, find.text('Assignee: Me'));
      // The rows name the rep too; the sheet is on top.
      await tapVisible(tester, find.text(rep.name).last);
      expect(find.text('Assignee: ${rep.name}'), findsOneWidget);
      expect(_openRequests(api).last.query['assigneeId'], rep.id);

      await tapVisible(tester, find.text('Assignee: ${rep.name}'));
      await tapVisible(tester, find.text('Everyone'));
      expect(_openRequests(api).last.query['assigneeId'], isNull);
    });

    testWidgets('a Sales Rep is not offered the choice', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);
      expect(find.textContaining('Assignee:'), findsNothing);
      expect(api.sent('GET', '/users/assignable'), isEmpty);
    });
  });

  group('the checkbox', () {
    testWidgets('completes at once, then offers Undo', variant: phones, (
      tester,
    ) async {
      final answer = Completer<Object?>();
      final api = _api()
        ..on('POST', '/tasks/task-1/complete', (request) => answer.future)
        ..on('POST', '/tasks/task-1/reopen', (request) => taskJson());
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      await tapVisible(
        tester,
        find.bySemanticsLabel('Complete Send revised pricing'),
      );
      // Gone before the server has answered, and the count goes down with it.
      expect(find.text('Send revised pricing'), findsNothing);
      await scrollTo(tester, find.bySemanticsLabel('Overdue: 0'));
      expect(find.bySemanticsLabel('Overdue: 0'), findsOneWidget);

      answer.complete(taskJson(status: 'DONE'));
      await tester.pumpAndSettle();
      expect(find.text('Task completed.'), findsOneWidget);
      expect(api.sent('POST', '/tasks/task-1/complete'), hasLength(1));

      await tester.tap(find.widgetWithText(SnackBarAction, 'Undo'));
      await tester.pumpAndSettle();
      expect(api.sent('POST', '/tasks/task-1/reopen'), hasLength(1));
      expect(find.text('Send revised pricing'), findsOneWidget);
    });

    testWidgets('a refusal puts the task back and says why', variant: phones, (
      tester,
    ) async {
      final api = _api()
        ..on(
          'POST',
          '/tasks/task-1/complete',
          (request) => throw apiError('NOT_FOUND', status: 404),
        );
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      await tapVisible(
        tester,
        find.bySemanticsLabel('Complete Send revised pricing'),
      );
      expect(find.text('Send revised pricing'), findsOneWidget);
      expect(
        find.textContaining('could not be completed and is back in the list'),
        findsOneWidget,
      );
    });

    testWidgets(
      'the Done view lists completed tasks; their box reopens',
      variant: phones,
      (tester) async {
        final api =
            _api(
              done: [
                taskJson(
                  id: 'task-9',
                  title: 'Sent the contract',
                  status: 'DONE',
                  completedAt: '2026-10-02T10:00:00.000Z',
                ),
              ],
            )..on(
              'POST',
              '/tasks/task-9/reopen',
              (request) => taskJson(id: 'task-9'),
            );
        await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

        await tapVisible(tester, find.widgetWithText(ChoiceChip, 'Done'));
        expect(find.text('Sent the contract'), findsOneWidget);
        expect(find.textContaining('Completed Oct 2, 2026'), findsOneWidget);
        final done = api.sent('GET', '/tasks').last.query;
        expect(done['status'], 'DONE');
        expect(done['sort'], 'createdAt');

        await tapVisible(
          tester,
          find.bySemanticsLabel('Reopen Sent the contract'),
        );
        expect(api.sent('POST', '/tasks/task-9/reopen'), hasLength(1));
        expect(find.text('Task reopened.'), findsOneWidget);
      },
    );
  });

  group('the address', () {
    testWidgets('?open=<id> opens that task', variant: phones, (tester) async {
      final api = _api()
        ..on('GET', '/tasks/task-7', (request) {
          return taskJson(id: 'task-7', title: 'Call about the renewal');
        });
      final app = await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.openTask('task-7'),
      );

      expect(find.text('Edit task'), findsOneWidget);
      expect(find.text('Call about the renewal'), findsOneWidget);
      expect(app.location, Routes.tasks);
    });

    testWidgets('a task that is gone is said, and nothing opens', (
      tester,
    ) async {
      final api = _api()
        ..on(
          'GET',
          '/tasks/task-7',
          (request) => throw apiError('NOT_FOUND', status: 404),
        );
      await pumpApp(
        tester,
        api: api,
        user: rep,
        location: Routes.openTask('task-7'),
      );

      expect(
        find.text('That task no longer exists, or is not yours to see.'),
        findsOneWidget,
      );
      expect(find.text('Edit task'), findsNothing);
    });

    testWidgets('?due=<group> shows that group', (tester) async {
      final app = await pumpApp(
        tester,
        api: _api(),
        user: rep,
        location: Routes.tasksDue('upcoming'),
      );
      expect(app.location, Routes.tasks);
      expect(find.text('Book the demo room'), findsOneWidget);
      expect(find.text('Send revised pricing'), findsNothing);
      final chip = tester.widget<ChoiceChip>(
        find.widgetWithText(ChoiceChip, 'Upcoming'),
      );
      expect(chip.selected, isTrue);
    });
  });
}
