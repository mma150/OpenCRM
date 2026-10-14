import 'dart:convert';

import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// The API names a record's type in capitals (`LEAD`). This is the one place that turns it
/// into the app's own [RecordType]; a new record type adds one line.
const _recordTypes = {
  'LEAD': RecordType.lead,
  'CONTACT': RecordType.contact,
  'COMPANY': RecordType.company,
  'OPPORTUNITY': RecordType.opportunity,
};

/// `LEAD` for [RecordType.lead]: the type as the task and activity routes write it.
String apiRecordType(RecordType type) {
  return _recordTypes.entries.firstWhere((entry) => entry.value == type).key;
}

/// The record a task belongs to: `{ type, id, name }`, with the type as the API writes it
/// (`LEAD`, `CONTACT`, `COMPANY`, `OPPORTUNITY`). The activity feed names the record of an
/// entry the same way.
class TaskRecord {
  const TaskRecord({required this.type, required this.id, required this.name});

  factory TaskRecord.fromJson(Json json) {
    return TaskRecord(
      type: readString(json, 'type'),
      id: readString(json, 'id'),
      name: readString(json, 'name'),
    );
  }

  /// The record a new task starts linked to ("Add task" on a record's page).
  factory TaskRecord.of(RecordRef record, String name) {
    return TaskRecord(
      type: apiRecordType(record.type),
      id: record.id,
      name: name,
    );
  }

  final String type;
  final String id;
  final String name;

  /// Null for a type a newer server knows and this version of the app does not: the record
  /// is then named, and not linked.
  RecordType? get recordType => _recordTypes[type];

  /// "Lead", "Contact", "Company", "Opportunity".
  String get typeLabel => recordType?.label ?? 'Record';
}

/// When a task is due, by the viewer's calendar day. The names are the API's (`due=`), in
/// the order the groups are shown.
enum DueGroup {
  overdue('overdue', 'Overdue'),
  today('today', 'Due today'),
  upcoming('upcoming', 'Upcoming'),
  none('none', 'No due date');

  const DueGroup(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static DueGroup? fromApi(String? value) {
    return values.where((group) => group.apiValue == value).firstOrNull;
  }
}

/// A task as the API answers it.
class Task {
  const Task({
    required this.id,
    required this.title,
    required this.description,
    required this.dueAt,
    required this.isDone,
    required this.completedAt,
    required this.assignee,
    required this.createdBy,
    required this.record,
    required this.reminderAt,
    required this.createdAt,
  });

  factory Task.fromJson(Json json) {
    final record = readMapOrNull(json, 'record');
    return Task(
      id: readString(json, 'id'),
      title: readString(json, 'title'),
      description: readStringOrNull(json, 'description'),
      dueAt: readDateOrNull(json, 'dueAt'),
      isDone: readString(json, 'status') == 'DONE',
      completedAt: readDateOrNull(json, 'completedAt'),
      assignee: PersonRef.fromJson(asMap(json['assignee'])),
      createdBy: PersonRef.fromJson(asMap(json['createdBy'])),
      record: record == null ? null : TaskRecord.fromJson(record),
      reminderAt: readDateOrNull(json, 'reminderAt'),
      createdAt: readDate(json, 'createdAt'),
    );
  }

  final String id;
  final String title;
  final String? description;
  final DateTime? dueAt;
  final bool isDone;
  final DateTime? completedAt;
  final PersonRef assignee;
  final PersonRef createdBy;

  /// Null when the task belongs to no record, or to one the reader may not see.
  final TaskRecord? record;

  /// When the assignee is reminded, or null.
  final DateTime? reminderAt;
  final DateTime createdAt;

  /// Due before today began on this device: the API's own rule for "overdue". The Tasks
  /// tab does not need it (the API sorts the tasks into groups); shorter lists (Home, a
  /// record's card) mark their rows with it.
  bool isOverdue({DateTime? now}) {
    final due = dueAt;
    return !isDone && due != null && daysAgo(due, now: now) > 0;
  }
}

/// When to be reminded. The API stores one moment (`reminderAt`); the form offers the usual
/// distances from the due date, and "Custom" for any other moment.
enum ReminderChoice {
  none('None'),
  atDue('At due time', before: Duration.zero),
  hourBefore('1 hour before', before: Duration(hours: 1)),
  dayBefore('1 day before', before: Duration(days: 1)),
  custom('Custom date and time');

  const ReminderChoice(this.label, {this.before});

  final String label;

  /// How long before the due date the choice reminds; null for None and Custom.
  final Duration? before;

  /// True for the choices that count back from the due date, and so need one.
  bool get needsDueDate => before != null;

  /// The moment to send as `reminderAt`, or null for no reminder.
  DateTime? moment({required DateTime? dueAt, required DateTime? customAt}) {
    if (this == ReminderChoice.custom) {
      return customAt;
    }
    final distance = before;
    return distance == null || dueAt == null ? null : dueAt.subtract(distance);
  }

  /// The choice that gives [task]'s `reminderAt`: one of the distances when it matches,
  /// "Custom" otherwise.
  static ReminderChoice of(Task task) {
    final at = task.reminderAt;
    final due = task.dueAt;
    if (at == null) {
      return ReminderChoice.none;
    }
    if (due != null) {
      final distance = due.difference(at);
      for (final choice in values) {
        if (choice.before == distance) {
          return choice;
        }
      }
    }
    return ReminderChoice.custom;
  }
}

/// What the task form sends. Text is trimmed and empty text is null.
class TaskInput {
  TaskInput({
    required String title,
    required String description,
    required this.dueAt,
    required this.assigneeId,
    required this.record,
    required this.reminderAt,
  }) : title = title.trim(),
       description = description.trim().isEmpty ? null : description.trim();

  /// The form's values for a task as it was loaded, to tell what an edit changed.
  factory TaskInput.of(Task task) {
    return TaskInput(
      title: task.title,
      description: task.description ?? '',
      dueAt: task.dueAt,
      assigneeId: task.assignee.id,
      record: task.record,
      reminderAt: task.reminderAt,
    );
  }

  final String title;
  final String? description;
  final DateTime? dueAt;
  final String assigneeId;

  /// Only its type and id are sent.
  final TaskRecord? record;
  final DateTime? reminderAt;

  Json _all() {
    final linked = record;
    final due = dueAt;
    final reminder = reminderAt;
    return {
      'title': title,
      'description': description,
      'dueAt': due == null ? null : toApiMoment(due),
      'assigneeId': assigneeId,
      'record': linked == null ? null : {'type': linked.type, 'id': linked.id},
      'reminderAt': reminder == null ? null : toApiMoment(reminder),
    };
  }

  /// The body of `POST /tasks`: what is empty is left out.
  Json toCreateJson() {
    return {for (final MapEntry(:key, :value) in _all().entries) key: ?value};
  }

  /// The body of `PATCH /tasks/:id`: only what differs from [before], with null for a
  /// field that was emptied. Empty when nothing changed.
  Json changesFrom(TaskInput before) {
    final was = before._all();
    return {
      for (final MapEntry(:key, :value) in _all().entries)
        if (jsonEncode(value) != jsonEncode(was[key])) key: value,
    };
  }
}
