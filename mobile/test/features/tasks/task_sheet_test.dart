import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/routes.dart';

import '../../support/fake_api.dart';
import '../../support/fixtures.dart';
import '../../support/pump_app.dart';

final _lead = Routes.lead('lead-1');

/// The Tasks tab with one overdue task, the people a task can be given to, and a lead's
/// page with its list behind it.
FakeApi _api({List<Object?>? recordTasks}) {
  return FakeApi()
    ..on('GET', '/tasks', (request) {
      if (request.query['recordType'] != null) {
        return page(recordTasks ?? [taskJson()]);
      }
      return page(request.query['due'] == 'overdue' ? [taskJson()] : []);
    })
    ..on('GET', '/users/assignable', (request) {
      return [
        {'id': rep.id, 'name': rep.name, 'role': 'SALES_REP'},
      ];
    })
    ..on('GET', '/leads', (request) => page([leadJson()]))
    ..on('GET', '/leads/lead-1', (request) => leadJson())
    ..on('GET', '/leads/lead-1/timeline', (request) => page([]));
}

/// Picks today with the date picker and keeps the time it offers (now).
Future<void> _pickNow(WidgetTester tester, Finder field) async {
  await tapVisible(tester, field);
  await tapVisible(tester, find.text('OK'));
  await tapVisible(tester, find.text('OK'));
}

Future<void> _openNewTask(WidgetTester tester) {
  return tapVisible(tester, find.widgetWithText(FilledButton, 'New task'));
}

void main() {
  group('a new task', () {
    testWidgets(
      'sends the title, due date, assignee and reminder',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('POST', '/tasks', (request) => taskJson(id: 'task-2'));
        await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

        await _openNewTask(tester);
        await enterField(tester, 'Title', '  Call about the renewal ');
        await enterField(tester, 'Description', 'Ask about the second depot');
        await _pickNow(tester, find.text('No due date'));
        await chooseOption(tester, 'Reminder', '1 hour before');
        await tapVisible(tester, find.widgetWithText(FilledButton, 'Add task'));

        final sent = api.sent('POST', '/tasks').single.json;
        expect(sent['title'], 'Call about the renewal');
        expect(sent['description'], 'Ask about the second depot');
        expect(sent['assigneeId'], rep.id);
        expect(sent.containsKey('record'), isFalse);
        final due = DateTime.parse(sent['dueAt']! as String);
        final reminder = DateTime.parse(sent['reminderAt']! as String);
        expect(due.difference(reminder), const Duration(hours: 1));
        expect(find.text('Task added.'), findsOneWidget);
        expect(find.text('New task').hitTestable(), findsOneWidget);
      },
    );

    testWidgets('checks the form before sending anything', variant: phones, (
      tester,
    ) async {
      final api = _api();
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      await _openNewTask(tester);
      await chooseOption(tester, 'Reminder', '1 day before');
      await chooseOption(tester, 'Linked to', 'Lead');
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Add task'));

      await scrollTo(tester, find.text('Enter a title.'));
      expect(find.text('Enter a title.'), findsOneWidget);
      await scrollTo(
        tester,
        find.text('Choose the lead, or link the task to nothing.'),
      );
      await scrollTo(
        tester,
        find.text('Set a due date first, or choose a custom date and time.'),
      );
      expect(api.sent('POST', '/tasks'), isEmpty);
    });

    testWidgets('links a record found by searching', (tester) async {
      final api = _api()
        ..on('POST', '/tasks', (request) => taskJson(id: 'task-2'));
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      await _openNewTask(tester);
      await enterField(tester, 'Title', 'Send the contract');
      await chooseOption(tester, 'Linked to', 'Lead');
      await tapVisible(tester, find.text('Choose'));
      final search = api.sent('GET', '/leads').last.query;
      expect(search['sort'], 'name');
      expect(search['pageSize'], '20');
      await tapVisible(tester, find.text('Marcus Chen').last);
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Add task'));

      expect(api.sent('POST', '/tasks').single.json['record'], {
        'type': 'LEAD',
        'id': 'lead-1',
      });
    });

    testWidgets('puts what the server refused under its field', (tester) async {
      final api = _api()
        ..on(
          'POST',
          '/tasks',
          (request) => throw validationError({
            'title': 'Use 200 characters or fewer.',
            'record.id': 'The record does not exist.',
          }),
        );
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      await _openNewTask(tester);
      await enterField(tester, 'Title', 'Too long');
      await chooseOption(tester, 'Linked to', 'Lead');
      await tapVisible(tester, find.text('Choose'));
      await tapVisible(tester, find.text('Marcus Chen').last);
      await tapVisible(tester, find.widgetWithText(FilledButton, 'Add task'));

      await scrollTo(tester, find.text('Use 200 characters or fewer.'));
      await scrollTo(tester, find.text('The record does not exist.'));
      expect(find.text('Task added.'), findsNothing);
    });

    for (final code in ['FORBIDDEN', 'NETWORK_ERROR']) {
      testWidgets('says "$code" above the form and keeps what was typed', (
        tester,
      ) async {
        final api = _api()
          ..on('POST', '/tasks', (request) => throw apiError(code));
        await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

        await _openNewTask(tester);
        await enterField(tester, 'Title', 'Call back');
        await tapVisible(tester, find.widgetWithText(FilledButton, 'Add task'));

        final message = find.text(
          code == 'FORBIDDEN' ? 'You do not have permission to do that.' : 'The server cannot be reached. Check your connection and try again.',
        );
        await scrollTo(tester, message);
        expect(message, findsOneWidget);
        expect(find.text('Call back'), findsOneWidget);
      });
    }

    testWidgets('cannot be sent twice', (tester) async {
      final answer = Completer<Object?>();
      final api = _api()..on('POST', '/tasks', (request) => answer.future);
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      await _openNewTask(tester);
      await enterField(tester, 'Title', 'Call back');
      await tester.tap(find.widgetWithText(FilledButton, 'Add task'));
      await tester.pump();
      expect(find.widgetWithText(FilledButton, 'Add task'), findsNothing);
      answer.complete(taskJson(id: 'task-2'));
      await tester.pumpAndSettle();
      expect(api.sent('POST', '/tasks'), hasLength(1));
    });
  });

  group('a task that exists', () {
    testWidgets('sends only what changed', variant: phones, (tester) async {
      final api = _api()
        ..on('PATCH', '/tasks/task-1', (request) => taskJson(title: 'New'));
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      await tapVisible(tester, find.text('Send revised pricing'));
      expect(find.text('Edit task'), findsOneWidget);
      await enterField(tester, 'Title', 'Send the final pricing');
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Save changes'),
      );

      expect(api.sent('PATCH', '/tasks/task-1').single.json, {
        'title': 'Send the final pricing',
      });
      expect(find.text('Task saved.'), findsOneWidget);
    });

    testWidgets('saving without a change sends nothing', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      await tapVisible(tester, find.text('Send revised pricing'));
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Save changes'),
      );
      expect(api.sent('PATCH', '/tasks/task-1'), isEmpty);
      expect(find.text('Edit task'), findsNothing);
    });

    testWidgets('is deleted after asking', variant: phones, (tester) async {
      final api = _api()..on('DELETE', '/tasks/task-1', (request) => null);
      await pumpApp(tester, api: api, user: rep, location: Routes.tasks);

      await tapVisible(tester, find.text('Send revised pricing'));
      await tapVisible(tester, find.widgetWithText(OutlinedButton, 'Delete'));
      expect(find.text('Delete this task?'), findsOneWidget);
      await tapVisible(
        tester,
        find.widgetWithText(FilledButton, 'Delete task'),
      );

      expect(api.sent('DELETE', '/tasks/task-1'), hasLength(1));
      expect(find.text('Task deleted.'), findsOneWidget);
    });

    testWidgets(
      'a Read-only user sees its details, nothing to change',
      variant: phones,
      (tester) async {
        await pumpApp(
          tester,
          api: _api(),
          user: readOnly,
          location: Routes.tasks,
        );

        await tapVisible(tester, find.text('Send revised pricing'));
        expect(
          find.text('You can see this task but not change it.'),
          findsOneWidget,
        );
        expect(find.text('Lead: Marcus Chen'), findsOneWidget);
        expect(find.text('Save changes'), findsNothing);
        expect(find.text('Delete'), findsNothing);
      },
    );
  });

  group("a record's Tasks card", () {
    testWidgets(
      'lists the open tasks of the lead, and adds one to it',
      variant: phones,
      (tester) async {
        final api = _api()
          ..on('POST', '/tasks', (request) => taskJson(id: 'task-2'));
        await pumpApp(tester, api: api, user: rep, location: _lead);

        await scrollTo(tester, find.text('1 open'));
        expect(find.text('Send revised pricing'), findsOneWidget);
        final asked = api
            .sent('GET', '/tasks')
            .firstWhere((request) => request.query['recordType'] != null)
            .query;
        expect(asked['recordType'], 'LEAD');
        expect(asked['recordId'], 'lead-1');
        expect(asked['status'], 'OPEN');
        expect(asked['pageSize'], '5');

        await tapVisible(
          tester,
          find.widgetWithText(OutlinedButton, 'Add task'),
        );
        // The lead is filled in.
        expect(find.text('Marcus Chen'), findsWidgets);
        await enterField(tester, 'Title', 'Send the brochure');
        await tapVisible(tester, find.widgetWithText(FilledButton, 'Add task'));

        expect(api.sent('POST', '/tasks').single.json['record'], {
          'type': 'LEAD',
          'id': 'lead-1',
        });
      },
    );

    testWidgets('completes a task from the card', (tester) async {
      final api = _api()
        ..on('POST', '/tasks/task-1/complete', (request) {
          return taskJson(status: 'DONE');
        });
      await pumpApp(tester, api: api, user: rep, location: _lead);

      await tapVisible(
        tester,
        find.bySemanticsLabel('Complete Send revised pricing'),
      );
      expect(api.sent('POST', '/tasks/task-1/complete'), hasLength(1));
      expect(find.text('Task completed.'), findsOneWidget);
      await scrollTo(tester, find.text('No open tasks.'));
    });

    testWidgets('shows all of them on request', (tester) async {
      final api = _api(
        recordTasks: [
          for (var index = 1; index <= 5; index += 1)
            taskJson(id: 'task-$index', title: 'Task $index'),
        ],
      );
      api.on('GET', '/tasks', (request) {
        if (request.query['recordType'] == null) {
          return page([]);
        }
        final tasks = [
          for (var index = 1; index <= 7; index += 1)
            taskJson(id: 'task-$index', title: 'Task $index'),
        ];
        final size = int.parse(request.query['pageSize']!);
        return page(tasks.take(size).toList(), total: 7, pageSize: size);
      });
      await pumpApp(tester, api: api, user: rep, location: _lead);

      await tapVisible(tester, find.text('Show all 7 tasks'));
      await scrollTo(tester, find.text('Task 7'));
      expect(api.sent('GET', '/tasks').last.query['pageSize'], '100');
    });

    testWidgets('a Read-only user may not add or tick off', (tester) async {
      await pumpApp(tester, api: _api(), user: readOnly, location: _lead);

      await scrollTo(tester, find.text('1 open'));
      expect(find.text('Add task'), findsNothing);
      expect(
        find.bySemanticsLabel('Complete Send revised pricing'),
        findsNothing,
      );
    });
  });
}
