import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/detail_list.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/record_picker.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/tasks/task.dart';
import 'package:opencrm/features/tasks/task_record_picker.dart';
import 'package:opencrm/features/tasks/tasks_providers.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/users/reassign_sheet.dart';

/// The API's limits.
const _maxTitle = 200;
const _maxDescription = 5000;

/// Opens the task sheet over whatever is on screen (it covers the bottom bar): the form
/// that adds a task ([task] left out) or changes one, or the task's details for a
/// Read-only user. [record] is the record a new task starts linked to ("Add task" on a
/// record's page).
///
/// ```dart
/// showTaskSheet(context, task: task);
/// showTaskSheet(context, record: TaskRecord.of(RecordRef(RecordType.lead, id), name));
/// ```
Future<void> showTaskSheet(
  BuildContext context, {
  Task? task,
  TaskRecord? record,
}) {
  return Navigator.of(context, rootNavigator: true).push<void>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (context) => TaskSheet(task: task, record: record),
    ),
  );
}

class TaskSheet extends ConsumerWidget {
  const TaskSheet({super.key, this.task, this.record});

  final Task? task;
  final TaskRecord? record;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(currentUserProvider);
    final existing = task;
    if (me.role.canWriteRecords) {
      return _TaskForm(task: existing, record: record, meId: me.id);
    }
    // A Read-only user is never offered "New task", so there is always a task here.
    return AppScaffold(
      title: existing?.title ?? 'Task',
      body: existing == null
          ? const SizedBox.shrink()
          : SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.page),
              child: _TaskDetails(existing),
            ),
    );
  }
}

/// What a Read-only user gets instead of the form: the task, with nothing to change.
class _TaskDetails extends StatelessWidget {
  const _TaskDetails(this.task);

  final Task task;

  @override
  Widget build(BuildContext context) {
    final due = task.dueAt;
    final reminder = task.reminderAt;
    final record = task.record;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const MutedText('You can see this task but not change it.'),
        const SizedBox(height: AppSpacing.lg),
        SectionCard(
          child: DetailList(
            items: [
              DetailItem('Status', task.isDone ? 'Done' : 'Open'),
              DetailItem('Description', task.description),
              DetailItem('Due', due == null ? null : formatNearDateTime(due)),
              DetailItem('Assignee', task.assignee.name),
              DetailItem(
                'Linked to',
                record == null ? null : '${record.typeLabel}: ${record.name}',
              ),
              DetailItem(
                'Reminder',
                reminder == null ? null : formatNearDateTime(reminder),
              ),
              DetailItem(
                'Created',
                '${formatDateTime(task.createdAt)} by ${task.createdBy.name}',
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TaskForm extends ConsumerStatefulWidget {
  const _TaskForm({
    required this.task,
    required this.record,
    required this.meId,
  });

  final Task? task;
  final TaskRecord? record;
  final String meId;

  @override
  ConsumerState<_TaskForm> createState() => _TaskFormState();
}

class _TaskFormState extends ConsumerState<_TaskForm> {
  /// The paths the API may name. `record.id` is the picker's, and `reminderAt` belongs to
  /// the Reminder choice unless a custom moment was typed.
  static const _fields = {
    'title',
    'description',
    'dueAt',
    'assigneeId',
    'record',
    'record.id',
    'record.type',
    'reminderAt',
  };

  final _formKey = GlobalKey<FormState>();
  late final _title = TextEditingController(text: widget.task?.title);
  late final _description = TextEditingController(
    text: widget.task?.description,
  );
  late DateTime? _dueAt = widget.task?.dueAt;
  late String _assigneeId = widget.task?.assignee.id ?? widget.meId;

  /// The record the task was linked to when the sheet opened. It is sent back as it was
  /// until the user touches "Linked to", so a record of a kind this version does not know
  /// is never unlinked by saving something else.
  late final TaskRecord? _linked = widget.task?.record ?? widget.record;
  late RecordType? _recordType = _linked?.recordType;
  late PickedRecord? _record = _linked == null
      ? null
      : PickedRecord(id: _linked.id, name: _linked.name);
  bool _recordTouched = false;

  late ReminderChoice _reminder = widget.task == null
      ? ReminderChoice.none
      : ReminderChoice.of(widget.task!);
  late DateTime? _remindAt = _reminder == ReminderChoice.custom
      ? widget.task?.reminderAt
      : null;

  String? _recordError;
  String? _reminderError;
  String? _remindAtError;
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  TaskRecord? get _recordToSend {
    if (!_recordTouched) {
      return _linked;
    }
    final type = _recordType;
    final record = _record;
    return type == null || record == null
        ? null
        : TaskRecord(
            type: apiRecordType(type),
            id: record.id,
            name: record.name,
          );
  }

  /// The checks the form makes itself for what is not a text field.
  bool _check() {
    final type = _recordType;
    setState(() {
      _recordError = _recordTouched && type != null && _record == null
          ? 'Choose the ${type.label.toLowerCase()}, or link the task to nothing.'
          : null;
      _reminderError = _reminder.needsDueDate && _dueAt == null
          ? 'Set a due date first, or choose a custom date and time.'
          : null;
      _remindAtError = _reminder == ReminderChoice.custom && _remindAt == null
          ? 'Enter when to be reminded.'
          : null;
    });
    return _recordError == null &&
        _reminderError == null &&
        _remindAtError == null;
  }

  Future<void> _save() async {
    setState(() => _errors = ServerErrors.none);
    final fieldsValid = _formKey.currentState!.validate();
    if (!_check() || !fieldsValid) {
      return;
    }
    final task = widget.task;
    final input = TaskInput(
      title: _title.text,
      description: _description.text,
      dueAt: _dueAt,
      assigneeId: _assigneeId,
      record: _recordToSend,
      reminderAt: _reminder.moment(dueAt: _dueAt, customAt: _remindAt),
    );
    final changes = task == null ? null : input.changesFrom(TaskInput.of(task));
    if (changes != null && changes.isEmpty) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _saving = true);
    try {
      final actions = ref.read(taskActionsProvider);
      if (task == null) {
        await actions.create(input);
      } else {
        await actions.update(task.id, changes!);
      }
      if (!mounted) {
        return;
      }
      showSuccessSnackBar(
        context,
        task == null ? 'Task added.' : 'Task saved.',
      );
      Navigator.of(context).pop();
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _errors = ServerErrors.from(error, fields: _fields);
          _saving = false;
        });
      }
    }
  }

  Future<void> _delete(Task task) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Delete this task?',
      message:
          '"${task.title}" and its reminder are removed for everyone. This cannot be undone.',
      confirmLabel: 'Delete task',
      destructive: true,
    );
    if (!confirmed || !mounted) {
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(taskActionsProvider).delete(task.id);
      if (!mounted) {
        return;
      }
      showSuccessSnackBar(context, 'Task deleted.');
      Navigator.of(context).pop();
    } on ApiError catch (error) {
      if (mounted) {
        setState(() => _saving = false);
        showErrorSnackBar(context, describeApiError(error));
      }
    }
  }

  Future<void> _pickRecord(RecordType type) async {
    final picked = await showTaskRecordPicker(
      context,
      client: ref.read(apiClientProvider),
      type: type,
      selectedId: _record?.id,
    );
    if (picked != null && mounted) {
      setState(() {
        _record = picked;
        _recordTouched = true;
        _recordError = null;
        _errors = _errors.without('record.id').without('record');
      });
    }
  }

  /// The people the user may give the task to. The task's own assignee is always among
  /// the choices, so opening a task someone else was given does not change who has it, and
  /// so is the user while the list is loading (or could not be loaded).
  List<DropdownOption<String>> _assignees(List<AssignableUser> people) {
    final task = widget.task;
    final meId = widget.meId;
    return [
      for (final person in people)
        DropdownOption(
          value: person.id,
          label: person.id == meId ? '${person.name} (you)' : person.name,
        ),
      if (task != null &&
          !people.any((person) => person.id == task.assignee.id))
        DropdownOption(value: task.assignee.id, label: task.assignee.name),
      if (!people.any((person) => person.id == meId) &&
          task?.assignee.id != meId)
        DropdownOption(value: meId, label: 'Me'),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final task = widget.task;
    final people = ref.watch(assignableUsersProvider).value ?? const [];
    final recordType = _recordType;
    final custom = _reminder == ReminderChoice.custom;
    final recordError =
        _recordError ??
        _errors['record.id'] ??
        _errors['record'] ??
        _errors['record.type'];

    return AppScaffold(
      title: task == null ? 'New task' : 'Edit task',
      bottomBar: Row(
        children: [
          if (task != null) ...[
            OutlinedButton.icon(
              onPressed: _saving ? null : () => _delete(task),
              style: OutlinedButton.styleFrom(
                foregroundColor: context.colors.danger,
              ),
              icon: const Icon(Icons.delete_outline),
              label: const Text('Delete'),
            ),
            const SizedBox(width: AppSpacing.md),
          ],
          Expanded(
            child: SubmitButton(
              label: task == null ? 'Add task' : 'Save changes',
              saving: _saving,
              onPressed: _save,
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.page),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FormErrorBanner(_errors.form),
              AppTextField(
                label: 'Title',
                controller: _title,
                hint: 'What needs doing?',
                maxLength: _maxTitle,
                textCapitalization: TextCapitalization.sentences,
                serverError: _errors['title'],
                onChanged: (_) =>
                    setState(() => _errors = _errors.without('title')),
                validator: (value) =>
                    (value ?? '').trim().isEmpty ? 'Enter a title.' : null,
              ),
              AppTextField(
                label: 'Description',
                controller: _description,
                maxLines: 5,
                maxLength: _maxDescription,
                textCapitalization: TextCapitalization.sentences,
                serverError: _errors['description'],
                onChanged: (_) =>
                    setState(() => _errors = _errors.without('description')),
              ),
              DateTimeField(
                label: 'Due date and time',
                value: _dueAt,
                placeholder: 'No due date',
                firstDate: DateTime(2000),
                lastDate: DateTime(2100),
                errorText: _errors['dueAt'],
                onChanged: (moment) => setState(() {
                  _dueAt = moment;
                  _reminderError = null;
                  _errors = _errors.without('dueAt');
                }),
              ),
              if (_dueAt != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _dueAt = null),
                    child: const Text('Clear due date'),
                  ),
                ),
              AppDropdownField<String>(
                label: 'Assignee',
                value: _assigneeId,
                options: _assignees(people),
                serverError: _errors['assigneeId'],
                onChanged: (id) => setState(() {
                  _assigneeId = id ?? _assigneeId;
                  _errors = _errors.without('assigneeId');
                }),
              ),
              AppDropdownField<RecordType?>(
                label: 'Linked to',
                value: recordType,
                options: [
                  const DropdownOption(value: null, label: 'Nothing'),
                  for (final type in RecordType.values)
                    DropdownOption(value: type, label: type.label),
                ],
                onChanged: (type) => setState(() {
                  // A record of one kind is not a record of another.
                  _recordType = type;
                  _record = null;
                  _recordTouched = true;
                  _recordError = null;
                }),
              ),
              if (recordType != null)
                RecordPickerField(
                  label: recordType.label,
                  value: _record,
                  placeholder: 'Choose',
                  errorText: recordError,
                  onPick: () => _pickRecord(recordType),
                  onClear: () => setState(() {
                    _record = null;
                    _recordTouched = true;
                  }),
                ),
              AppDropdownField<ReminderChoice>(
                label: 'Reminder',
                value: _reminder,
                serverError:
                    _reminderError ?? (custom ? null : _errors['reminderAt']),
                options: [
                  for (final choice in ReminderChoice.values)
                    DropdownOption(value: choice, label: choice.label),
                ],
                onChanged: (choice) => setState(() {
                  _reminder = choice ?? _reminder;
                  _reminderError = null;
                  _remindAtError = null;
                  _errors = _errors.without('reminderAt');
                }),
              ),
              if (custom)
                DateTimeField(
                  label: 'Remind at',
                  value: _remindAt,
                  firstDate: DateTime(2000),
                  lastDate: DateTime(2100),
                  errorText: _remindAtError ?? _errors['reminderAt'],
                  onChanged: (moment) => setState(() {
                    _remindAt = moment;
                    _remindAtError = null;
                    _errors = _errors.without('reminderAt');
                  }),
                ),
              const MutedText(
                'The assignee gets a notification at the time of the reminder.',
                small: true,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
