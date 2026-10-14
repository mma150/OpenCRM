import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/record_routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/tasks/task.dart';
import 'package:opencrm/features/tasks/tasks_providers.dart';

/// What a task's checkbox does, wherever the task is listed (the Tasks tab, Home, a
/// record's card). Completing is optimistic: the task leaves the list at once and comes
/// back, with a message, when the API refuses. A large checkbox is easy to hit by mistake,
/// so the message that confirms it offers Undo.
///
/// The row that was tapped is gone by the time the API answers, so everything this needs
/// later (the messenger, the colours, the actions) is taken from the context first.
Future<void> completeTask(
  BuildContext context,
  WidgetRef ref,
  Task task,
) async {
  final actions = ref.read(taskActionsProvider);
  final say = _Messages.of(context);
  try {
    await actions.complete(task.id);
    say.done('Task completed.', undo: () => _reopen(actions, say, task));
  } on ApiError catch (error) {
    say.failed(
      '"${task.title}" could not be completed and is back in the list. '
      '${describeApiError(error)}',
    );
  }
}

/// Reopens a task that is done (its checkbox in the Done view, and Undo).
Future<void> reopenTask(BuildContext context, WidgetRef ref, Task task) {
  return _reopen(ref.read(taskActionsProvider), _Messages.of(context), task);
}

Future<void> _reopen(TaskActions actions, _Messages say, Task task) async {
  try {
    await actions.reopen(task.id);
    say.done('Task reopened.');
  } on ApiError catch (error) {
    say.failed(
      '"${task.title}" could not be reopened. ${describeApiError(error)}',
    );
  }
}

/// The snack bars of a checkbox, usable after the row that showed them is gone.
class _Messages {
  _Messages.of(BuildContext context)
    : _messenger = ScaffoldMessenger.of(context),
      _onDanger = context.colors.onPrimary,
      _danger = context.colors.tone(Tone.danger).foreground;

  final ScaffoldMessengerState _messenger;
  final Color _onDanger;
  final Color _danger;

  void done(String message, {VoidCallback? undo}) {
    _messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          // With an action a snack bar would otherwise stay until it is dismissed.
          persist: false,
          action: undo == null
              ? null
              : SnackBarAction(label: 'Undo', onPressed: undo),
        ),
      );
  }

  void failed(String message) {
    _messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message, style: TextStyle(color: _onDanger)),
          backgroundColor: _danger,
          duration: const Duration(seconds: 6),
        ),
      );
  }
}

/// One task in a list: a large checkbox that completes it (or reopens it, when it is
/// done), the title, when it is due, who it is assigned to when that is not the viewer,
/// and the record it is linked to. A tap on the title opens the task ([onOpen]).
///
/// A Read-only user gets no checkbox. A late task says "Overdue" in words, never by
/// colour alone.
class TaskRow extends ConsumerWidget {
  const TaskRow({
    super.key,
    required this.task,
    this.overdue,
    this.showRecord = true,
    this.onOpen,
  });

  final Task task;

  /// What the API said (the Overdue group of the Tasks tab); when left out, the row works
  /// it out from the due date and the device's day.
  final bool? overdue;

  /// False on a record's own card: every task there is linked to that record.
  final bool showRecord;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(currentUserProvider);
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final late = !task.isDone && (overdue ?? task.isOverdue());
    final warning = colors.tone(Tone.warning).foreground;
    final due = task.dueAt;
    final completedAt = task.completedAt;
    final reminderAt = task.reminderAt;
    final record = task.record;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (me.role.canWriteRecords)
          Semantics(
            container: true,
            excludeSemantics: true,
            checked: task.isDone,
            label: task.isDone
                ? 'Reopen ${task.title}'
                : 'Complete ${task.title}',
            onTap: () => _toggle(context, ref),
            child: SizedBox.square(
              dimension: AppSpacing.touchTarget,
              child: Transform.scale(
                scale: 1.3,
                child: Checkbox(
                  value: task.isDone,
                  onChanged: (_) => _toggle(context, ref),
                ),
              ),
            ),
          )
        else
          const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              InkWell(
                onTap: onOpen,
                borderRadius: AppSpacing.borderRadius,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    minHeight: AppSpacing.touchTarget,
                    minWidth: double.infinity,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          task.title,
                          style: text.bodyLarge?.copyWith(
                            fontWeight: FontWeight.w500,
                            color: task.isDone ? colors.textMuted : null,
                            decoration: task.isDone
                                ? TextDecoration.lineThrough
                                : null,
                          ),
                        ),
                        if (task.isDone && completedAt != null)
                          _Fact(
                            icon: Icons.check_circle_outline,
                            text:
                                'Completed ${formatNearDateTime(completedAt)}',
                          )
                        else if (due != null)
                          _Fact(
                            icon: late
                                ? Icons.error_outline
                                : Icons.schedule_outlined,
                            text: late
                                ? 'Overdue · ${formatNearDateTime(due)}'
                                : 'Due ${formatNearDateTime(due)}',
                            color: late ? warning : null,
                          ),
                        if (reminderAt != null && !task.isDone)
                          _Fact(
                            icon: Icons.notifications_none,
                            text: 'Reminder ${formatNearDateTime(reminderAt)}',
                          ),
                        if (task.assignee.id != me.id)
                          _Fact(
                            icon: Icons.person_outline,
                            text: task.assignee.name,
                            semanticsLabel: 'Assigned to ${task.assignee.name}',
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              if (showRecord && record != null) _RecordLink(record),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _toggle(BuildContext context, WidgetRef ref) {
    return task.isDone
        ? reopenTask(context, ref, task)
        : completeTask(context, ref, task);
  }
}

/// One small line under a task's title: an icon and a few words.
class _Fact extends StatelessWidget {
  const _Fact({
    required this.icon,
    required this.text,
    this.color,
    this.semanticsLabel,
  });

  final IconData icon;
  final String text;

  /// The muted colour unless given (a late due date).
  final Color? color;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final shade = color ?? context.colors.textMuted;
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2, right: AppSpacing.xs),
            child: Icon(icon, size: 14, color: shade),
          ),
          Expanded(
            child: Text(
              text,
              semanticsLabel: semanticsLabel,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: shade,
                fontWeight: color == null ? null : FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The record a task is linked to: what kind it is and its name, which opens the record's
/// page when the app has one.
class _RecordLink extends StatelessWidget {
  const _RecordLink(this.record);

  final TaskRecord record;

  @override
  Widget build(BuildContext context) {
    final type = record.recordType;
    final route = type == null ? null : recordRoute(type, record.id);
    final text = Theme.of(context).textTheme;
    final name = Text(
      record.name,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: text.bodyMedium?.copyWith(
        color: route == null
            ? context.colors.textMuted
            : context.colors.primary,
        fontWeight: route == null ? null : FontWeight.w500,
      ),
    );
    final line = Row(
      children: [
        StatusBadge(label: record.typeLabel),
        const SizedBox(width: AppSpacing.sm),
        Flexible(child: name),
      ],
    );
    if (route == null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        child: line,
      );
    }
    return Semantics(
      link: true,
      child: InkWell(
        onTap: () => context.go(route),
        borderRadius: AppSpacing.borderRadius,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
          child: Align(alignment: Alignment.centerLeft, child: line),
        ),
      ),
    );
  }
}
