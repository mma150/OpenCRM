import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/tasks/task.dart';
import 'package:opencrm/features/tasks/task_row.dart';
import 'package:opencrm/features/tasks/task_sheet.dart';
import 'package:opencrm/features/tasks/tasks_providers.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// The Tasks card of a record's page (a lead, a contact, a company, an opportunity): the
/// open tasks linked to that record that the signed-in user may see, soonest first, each
/// with its checkbox, and "Add task" with the record filled in. It does not scroll by
/// itself: put it inside the scroll view of the record's page.
///
/// ```dart
/// RecordTasksCard(
///   record: RecordRef(RecordType.contact, contact.id),
///   recordName: contact.name,
///   canWrite: role.canWriteRecords,
/// )
/// ```
class RecordTasksCard extends ConsumerStatefulWidget {
  const RecordTasksCard({
    super.key,
    required this.record,
    required this.recordName,
    required this.canWrite,
  });

  final RecordRef record;

  /// The record's name, shown on a task that is added here.
  final String recordName;

  /// False for a Read-only user: no "Add task". (The rows leave out their checkbox by
  /// themselves.)
  final bool canWrite;

  @override
  ConsumerState<RecordTasksCard> createState() => _RecordTasksCardState();
}

class _RecordTasksCardState extends ConsumerState<RecordTasksCard> {
  bool _showAll = false;

  @override
  Widget build(BuildContext context) {
    final provider = recordTasksProvider((
      record: widget.record,
      all: _showAll,
    ));
    final answer = ref.watch(provider);
    final completed = ref.watch(completedTaskIdsProvider);
    final page = answer.value;
    final tasks = page == null
        ? const <Task>[]
        : stillOpen(page.items, completed);
    final total = page == null
        ? 0
        : page.meta.total - (page.items.length - tasks.length);

    return SectionCard(
      title: 'Tasks',
      trailing: page == null ? null : StatusBadge(label: '$total open'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (answer.hasError && !answer.isLoading)
            ErrorState(
              error: ApiError.from(answer.error!),
              onRetry: () => ref.invalidate(provider),
              compact: true,
            )
          else if (page == null)
            Semantics(
              label: 'Loading tasks',
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  FractionallySizedBox(widthFactor: 0.7, child: Skeleton()),
                  SizedBox(height: AppSpacing.sm),
                  FractionallySizedBox(widthFactor: 0.4, child: Skeleton()),
                ],
              ),
            )
          else if (tasks.isEmpty)
            const MutedText('No open tasks.')
          else ...[
            for (final (index, task) in tasks.indexed) ...[
              if (index > 0) const Divider(height: AppSpacing.md),
              TaskRow(
                task: task,
                showRecord: false,
                onOpen: () => showTaskSheet(context, task: task),
              ),
            ],
            if (page.meta.total > page.items.length)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: _showAll
                    ? MutedText(
                        'Showing the first ${page.items.length} of ${page.meta.total}.',
                        small: true,
                      )
                    : TextButton(
                        onPressed: () => setState(() => _showAll = true),
                        child: Text('Show all ${page.meta.total} tasks'),
                      ),
              ),
          ],
          if (widget.canWrite) ...[
            const SizedBox(height: AppSpacing.md),
            OutlinedButton.icon(
              onPressed: () => showTaskSheet(
                context,
                record: TaskRecord.of(widget.record, widget.recordName),
              ),
              icon: const Icon(Icons.add),
              label: const Text('Add task'),
            ),
          ],
        ],
      ),
    );
  }
}
