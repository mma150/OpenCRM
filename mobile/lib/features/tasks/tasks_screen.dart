import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/paged_list_view.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/tasks/task.dart';
import 'package:opencrm/features/tasks/task_row.dart';
import 'package:opencrm/features/tasks/task_sheet.dart';
import 'package:opencrm/features/tasks/tasks_api.dart';
import 'package:opencrm/features/tasks/tasks_providers.dart';
import 'package:opencrm/features/users/reassign_sheet.dart';

/// The Tasks tab: the signed-in user's open tasks, grouped by when they are due, with a
/// Done view, a search and, for an Admin and a Sales Manager, a choice of whose tasks.
///
/// Two things can come with the address: `?due=<group>` shows one group (a tile on Home),
/// and `?open=<id>` opens one task's sheet (the link of a notification). Both are taken
/// from the address once and then removed from it.
class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});

  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen> {
  /// The `?due=` and `?open=` being taken from the address, so they are acted on once.
  String? _taking;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final uri = GoRouterState.of(context).uri;
    final due = DueGroup.fromApi(uri.queryParameters['due']);
    final open = uri.queryParameters['open'] ?? '';
    if (due == null && open.isEmpty) {
      _taking = null;
      return;
    }
    if (_taking == uri.query) {
      return;
    }
    _taking = uri.query;
    // After this frame: a provider may not change, and the app may not navigate, while
    // the screen is being built.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      if (due != null) {
        ref.read(tasksFilterProvider.notifier).show(TasksShow.of(due));
      }
      context.go(Routes.tasks);
      if (open.isNotEmpty) {
        _openFromAddress(open).ignore();
      }
    });
  }

  /// The task of `?open=<id>` is read on its own: it may not be in the lists on screen.
  Future<void> _openFromAddress(String id) async {
    try {
      final task = await ref.read(tasksApiProvider).get(id);
      if (mounted) {
        await showTaskSheet(context, task: task);
      }
    } on ApiError catch (error) {
      if (mounted) {
        showErrorSnackBar(
          context,
          error.code == 'NOT_FOUND' || error.code == ApiError.validationFailed
              ? 'That task no longer exists, or is not yours to see.'
              : describeApiError(error),
        );
      }
    }
  }

  Future<void> _chooseAssignee(User me, TaskAssignee current) async {
    final List<AssignableUser> people;
    try {
      people = await ref.read(assignableUsersProvider.future);
    } catch (error) {
      if (mounted) {
        showErrorSnackBar(context, describeApiError(ApiError.from(error)));
      }
      return;
    }
    if (!mounted) {
      return;
    }
    const mine = TaskAssignee.me();
    const everyone = TaskAssignee.everyone();
    final choice = await showOptionsSheet<TaskAssignee>(
      context,
      title: 'Whose tasks',
      selected: current,
      options: [
        SheetOption(value: mine, label: mine.label),
        SheetOption(value: everyone, label: everyone.label),
        for (final person in people)
          if (person.id != me.id)
            SheetOption(
              // The one already chosen keeps its tick.
              value: person.id == current.userId
                  ? current
                  : TaskAssignee.user(person.id, person.name),
              label: person.name,
            ),
      ],
    );
    if (choice != null) {
      ref.read(tasksFilterProvider.notifier).assignedTo(choice);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(currentUserProvider);
    final canWrite = me.role.canWriteRecords;
    final filter = ref.watch(tasksFilterProvider);
    final controller = ref.read(tasksFilterProvider.notifier);

    return AppScaffold(
      title: 'Tasks',
      actions: [
        if (canWrite)
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.sm),
            child: FilledButton.icon(
              onPressed: () => showTaskSheet(context),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('New task'),
            ),
          ),
      ],
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.md,
              AppSpacing.page,
              0,
            ),
            child: SearchField(
              hint: 'Search tasks by title',
              initialValue: filter.search,
              onChanged: controller.search,
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(
              left: AppSpacing.page,
              top: AppSpacing.sm,
            ),
            child: FilterChipBar<TasksShow>(
              label: 'Show',
              selected: filter.show,
              onSelected: controller.show,
              options: [
                for (final show in TasksShow.values)
                  FilterOption(value: show, label: show.label),
              ],
            ),
          ),
          // Looking at other people's tasks is for those who manage them.
          if (me.role.seesTeam)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
              child: Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => _chooseAssignee(me, filter.assignee),
                  icon: const Icon(Icons.person_outline, size: 18),
                  label: Text(
                    'Assignee: ${filter.assignee.label}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ),
          Expanded(
            child: filter.show == TasksShow.done
                ? _DoneTasks(narrowed: filter.isNarrowed)
                : _OpenTasks(filter: filter, canWrite: canWrite),
          ),
        ],
      ),
    );
  }
}

/// The open tasks in their groups. A task that was just ticked off is left out at once
/// (`completedTaskIdsProvider`), and each count goes down with it.
class _OpenTasks extends ConsumerWidget {
  const _OpenTasks({required this.filter, required this.canWrite});

  final TasksFilter filter;
  final bool canWrite;

  Future<void> _refresh(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(openTasksProvider.notifier).refresh();
    } on ApiError catch (error) {
      if (context.mounted) {
        showErrorSnackBar(context, describeApiError(error));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final open = ref.watch(openTasksProvider);
    final completed = ref.watch(completedTaskIdsProvider);
    final groups = open.value;

    final List<Widget> slivers;
    if (open.hasError && !open.isLoading) {
      slivers = [
        SliverToBoxAdapter(
          child: ErrorState(
            error: ApiError.from(open.error!),
            onRetry: () => ref.invalidate(openTasksProvider),
          ),
        ),
      ];
    } else if (groups == null) {
      slivers = const [
        SliverToBoxAdapter(child: SkeletonList(label: 'Loading tasks')),
      ];
    } else {
      final shown = {
        for (final MapEntry(key: group, value: page) in groups.entries)
          group: stillOpen(page.items, completed),
      };
      if (shown.values.every((tasks) => tasks.isEmpty)) {
        slivers = [
          SliverToBoxAdapter(
            child: filter.isNarrowed
                ? const EmptyState(
                    icon: Icons.task_alt,
                    title: 'No tasks match',
                    message: 'Try another search or another assignee.',
                  )
                : EmptyState(
                    icon: Icons.task_alt,
                    title: 'No open tasks',
                    message: canWrite
                        ? 'Add a task for anything you need to remember: a call back, a quote to send.'
                        : 'Tasks the team adds will show here.',
                    action: canWrite
                        ? OutlinedButton.icon(
                            onPressed: () => showTaskSheet(context),
                            icon: const Icon(Icons.add),
                            label: const Text('New task'),
                          )
                        : null,
                  ),
          ),
        ];
      } else {
        slivers = [
          for (final group in DueGroup.values)
            if (filter.show.due == null || filter.show.due == group)
              ..._group(
                context,
                group: group,
                tasks: shown[group]!,
                // Every task of the group, also the ones past the first page of it.
                total:
                    groups[group]!.meta.total -
                    (groups[group]!.items.length - shown[group]!.length),
              ),
        ];
      }
    }

    return RefreshIndicator(
      onRefresh: () => _refresh(context, ref),
      child: CustomScrollView(
        // Always scrollable, so pull to refresh works on a short or empty list.
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.all(AppSpacing.page),
            sliver: SliverMainAxisGroup(slivers: slivers),
          ),
        ],
      ),
    );
  }

  /// One group: its name, how many tasks it holds, and the tasks.
  List<Widget> _group(
    BuildContext context, {
    required DueGroup group,
    required List<Task> tasks,
    required int total,
  }) {
    final late = group == DueGroup.overdue && total > 0;
    return [
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Semantics(
            header: true,
            label: '${group.label}: $total',
            excludeSemantics: true,
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    group.label,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: late
                          ? context.colors.tone(Tone.warning).foreground
                          : null,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                StatusBadge(
                  label: '$total',
                  tone: late ? Tone.warning : Tone.neutral,
                ),
              ],
            ),
          ),
        ),
      ),
      if (tasks.isEmpty)
        SliverToBoxAdapter(
          child: MutedText(
            group == DueGroup.overdue ? 'Nothing is overdue.' : 'Nothing here.',
          ),
        )
      else
        // Rows are built as they scroll into view, so a long list stays cheap.
        SliverList.builder(
          itemCount: tasks.length,
          itemBuilder: (context, index) => Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: _TaskCard(
              task: tasks[index],
              overdue: group == DueGroup.overdue,
            ),
          ),
        ),
      if (total > tasks.length)
        SliverToBoxAdapter(
          child: MutedText(
            'Showing the first ${tasks.length} of $total. Search to find the rest.',
            small: true,
          ),
        ),
      const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xl)),
    ];
  }
}

/// The completed tasks, the newest first, page by page. Their checkbox reopens them.
class _DoneTasks extends ConsumerWidget {
  const _DoneTasks({required this.narrowed});

  final bool narrowed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final done = ref.watch(doneTasksProvider);
    final list = ref.read(doneTasksProvider.notifier);
    return PagedListView<Task>(
      state: done,
      onRefresh: list.refresh,
      onLoadMore: list.loadMore,
      onRetry: list.retry,
      loadingLabel: 'Loading tasks',
      emptyTitle: narrowed
          ? 'No completed tasks match'
          : 'No completed tasks yet',
      emptyMessage: narrowed
          ? 'Try another search or another assignee.'
          : 'Tasks you tick off are kept here.',
      header: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: MutedText(
          done.total == 1
              ? '1 completed task'
              : '${done.total} completed tasks',
          small: true,
        ),
      ),
      itemBuilder: (context, task) => _TaskCard(task: task),
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({required this.task, this.overdue});

  final Task task;
  final bool? overdue;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xs,
          AppSpacing.xs,
          AppSpacing.md,
          AppSpacing.xs,
        ),
        child: TaskRow(
          task: task,
          overdue: overdue,
          onOpen: () => showTaskSheet(context, task: task),
        ),
      ),
    );
  }
}
