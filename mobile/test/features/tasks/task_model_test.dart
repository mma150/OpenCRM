import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/app/record_routes.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/features/tasks/task.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

import '../../support/fixtures.dart';

void main() {
  group('Task.fromJson', () {
    test('reads every field, in local time', () {
      final task = Task.fromJson(
        taskJson(
          description: 'With the volume discount',
          status: 'DONE',
          completedAt: '2026-10-02T10:00:00.000Z',
          assignee: manager,
          createdBy: admin,
          reminderAt: '2026-10-01T08:00:00.000Z',
        ),
      );

      expect(task.id, 'task-1');
      expect(task.title, 'Send revised pricing');
      expect(task.description, 'With the volume discount');
      expect(task.dueAt, DateTime.utc(2026, 10, 1, 9).toLocal());
      expect(task.isDone, isTrue);
      expect(task.completedAt, DateTime.utc(2026, 10, 2, 10).toLocal());
      expect(task.assignee.name, manager.name);
      expect(task.createdBy.name, admin.name);
      expect(task.reminderAt, DateTime.utc(2026, 10, 1, 8).toLocal());
      expect(task.record!.recordType, RecordType.lead);
      expect(task.record!.typeLabel, 'Lead');
      expect(task.record!.name, 'Marcus Chen');
    });

    test('the nulls, and a record type this version does not know', () {
      final bare = Task.fromJson(taskJson(dueAt: null, record: null));
      expect(bare.dueAt, isNull);
      expect(bare.record, isNull);
      expect(bare.reminderAt, isNull);
      expect(bare.isOverdue(), isFalse);

      final newer = Task.fromJson(
        taskJson(record: {'type': 'INVOICE', 'id': 'x', 'name': 'INV-1'}),
      );
      expect(newer.record!.recordType, isNull);
      expect(newer.record!.typeLabel, 'Record');
    });

    test('overdue is before the start of today on this device', () {
      final now = DateTime(2026, 10, 13, 15);
      Task due(DateTime at, {String status = 'OPEN'}) {
        return Task.fromJson(
          taskJson(dueAt: at.toUtc().toIso8601String(), status: status),
        );
      }

      expect(due(DateTime(2026, 10, 12, 23)).isOverdue(now: now), isTrue);
      expect(due(DateTime(2026, 10, 13, 8)).isOverdue(now: now), isFalse);
      expect(
        due(DateTime(2026, 10, 1), status: 'DONE').isOverdue(now: now),
        isFalse,
      );
    });

    test('the API record types both ways', () {
      expect(apiRecordType(RecordType.opportunity), 'OPPORTUNITY');
      expect(
        TaskRecord.of(const RecordRef(RecordType.company, 'c-1'), 'Acme').type,
        'COMPANY',
      );
      expect(DueGroup.fromApi('today'), DueGroup.today);
      expect(DueGroup.fromApi('later'), isNull);
    });
  });

  group('reminders', () {
    final due = DateTime(2026, 11, 15, 10);

    test('each choice counts back from the due date', () {
      expect(ReminderChoice.none.moment(dueAt: due, customAt: null), isNull);
      expect(ReminderChoice.atDue.moment(dueAt: due, customAt: null), due);
      expect(
        ReminderChoice.hourBefore.moment(dueAt: due, customAt: null),
        DateTime(2026, 11, 15, 9),
      );
      expect(
        ReminderChoice.dayBefore.moment(dueAt: due, customAt: null),
        DateTime(2026, 11, 14, 10),
      );
      final custom = DateTime(2026, 11, 1, 7);
      expect(
        ReminderChoice.custom.moment(dueAt: due, customAt: custom),
        custom,
      );
      expect(ReminderChoice.hourBefore.needsDueDate, isTrue);
      expect(ReminderChoice.custom.needsDueDate, isFalse);
    });

    test('a saved reminder is read back as the choice that gives it', () {
      Task task(String? reminderAt) => Task.fromJson(
        taskJson(dueAt: '2026-11-15T10:00:00.000Z', reminderAt: reminderAt),
      );
      expect(ReminderChoice.of(task(null)), ReminderChoice.none);
      expect(
        ReminderChoice.of(task('2026-11-15T10:00:00.000Z')),
        ReminderChoice.atDue,
      );
      expect(
        ReminderChoice.of(task('2026-11-15T09:00:00.000Z')),
        ReminderChoice.hourBefore,
      );
      expect(
        ReminderChoice.of(task('2026-11-14T10:00:00.000Z')),
        ReminderChoice.dayBefore,
      );
      expect(
        ReminderChoice.of(task('2026-11-15T09:45:00.000Z')),
        ReminderChoice.custom,
      );
    });
  });

  group('TaskInput', () {
    test('a create leaves out what is empty', () {
      final input = TaskInput(
        title: '  Call back  ',
        description: '   ',
        dueAt: null,
        assigneeId: 'user-rep',
        record: null,
        reminderAt: null,
      );
      expect(input.toCreateJson(), {
        'title': 'Call back',
        'assigneeId': 'user-rep',
      });
    });

    test('an edit sends only what changed, null for what was emptied', () {
      final task = Task.fromJson(
        taskJson(description: 'Old', reminderAt: '2026-09-30T09:00:00.000Z'),
      );
      final before = TaskInput.of(task);
      expect(TaskInput.of(task).changesFrom(before), isEmpty);

      final after = TaskInput(
        title: 'Send revised pricing',
        description: '',
        dueAt: task.dueAt,
        assigneeId: 'user-manager',
        record: task.record,
        reminderAt: null,
      );
      expect(after.changesFrom(before), {
        'description': null,
        'assigneeId': 'user-manager',
        'reminderAt': null,
      });
    });
  });

  group('links of the web app', () {
    test('become routes of the app', () {
      expect(
        appRouteForWebPath('/tasks?open=task-1'),
        Routes.openTask('task-1'),
      );
      expect(appRouteForWebPath('/tasks'), Routes.tasks);
      expect(appRouteForWebPath('/leads/lead-1'), Routes.lead('lead-1'));
      expect(
        appRouteForWebPath('/opportunities/opp-1'),
        Routes.opportunity('opp-1'),
      );
      expect(appRouteForWebPath('/contacts/c-1'), Routes.contact('c-1'));
      expect(appRouteForWebPath('/companies/c-1'), Routes.company('c-1'));
    });

    test('anything else has no page here', () {
      expect(appRouteForWebPath('/invoices/inv-1'), isNull);
      expect(appRouteForWebPath('/settings'), isNull);
      expect(appRouteForWebPath('https://evil.example/leads/x'), isNull);
      expect(appRouteForWebPath('//evil.example/leads/x'), isNull);
      expect(appRouteForWebPath('leads/x'), isNull);
    });
  });
}
