import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/state/paged_notifier.dart';
import 'package:opencrm/features/home/dashboard_providers.dart';
import 'package:opencrm/features/tasks/task.dart';
import 'package:opencrm/features/tasks/tasks_api.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// What the Tasks tab shows: every open task in its groups, one group, or the done ones.
enum TasksShow {
  open('Open'),
  overdue('Overdue', due: DueGroup.overdue),
  today('Due today', due: DueGroup.today),
  upcoming('Upcoming', due: DueGroup.upcoming),
  none('No due date', due: DueGroup.none),
  done('Done');

  const TasksShow(this.label, {this.due});

  final String label;

  /// The one group shown; null shows all four (or, for [done], none).
  final DueGroup? due;

  static TasksShow of(DueGroup group) {
    return values.firstWhere((show) => show.due == group);
  }
}

/// Whose tasks are listed: the signed-in user's, everyone's the user may see, or those of
/// one person ([userId], with [label] as the name shown on the filter).
class TaskAssignee {
  const TaskAssignee.me() : userId = null, label = 'Me', everyone = false;
  const TaskAssignee.everyone()
    : userId = null,
      label = 'Everyone',
      everyone = true;
  const TaskAssignee.user(String this.userId, this.label) : everyone = false;

  final String? userId;
  final String label;
  final bool everyone;

  bool get isMe => userId == null && !everyone;

  /// The API's `assigneeId`; null is everyone the caller may see. A Read-only user is
  /// never given a task, so "mine" would always be empty: they get everyone's.
  String? idFor(User me) {
    if (everyone || me.role == Role.readOnly) {
      return null;
    }
    return userId ?? me.id;
  }
}

/// The view, search and assignee of the Tasks tab.
class TasksFilter {
  const TasksFilter({
    this.show = TasksShow.open,
    this.search = '',
    this.assignee = const TaskAssignee.me(),
  });

  final TasksShow show;
  final String search;
  final TaskAssignee assignee;

  /// A search or another person's tasks: an empty list then says "no match".
  bool get isNarrowed => search.trim().isNotEmpty || !assignee.isMe;
}

class TasksFilterController extends Notifier<TasksFilter> {
  @override
  TasksFilter build() {
    // The next person to sign in starts with their own open tasks.
    ref.watch(sessionUserIdProvider);
    return const TasksFilter();
  }

  void show(TasksShow show) {
    state = TasksFilter(
      show: show,
      search: state.search,
      assignee: state.assignee,
    );
  }

  void search(String text) {
    state = TasksFilter(
      show: state.show,
      search: text,
      assignee: state.assignee,
    );
  }

  void assignedTo(TaskAssignee assignee) {
    state = TasksFilter(
      show: state.show,
      search: state.search,
      assignee: assignee,
    );
  }
}

final tasksFilterProvider =
    NotifierProvider<TasksFilterController, TasksFilter>(
      TasksFilterController.new,
    );

/// How many tasks one group of the open view holds. A group with more says so and asks the
/// user to search; the count beside its heading still covers every task.
const groupPageSize = 50;

/// The open tasks, sorted into the four groups the API knows (`due=`), soonest first.
typedef TaskGroups = Map<DueGroup, Page<Task>>;

/// The open view of the Tasks tab: four requests, one per group, so the API decides which
/// task is overdue and which is due today (by the device's day) and counts each group.
class OpenTasksController extends AsyncNotifier<TaskGroups> {
  late String _search;
  late String? _assigneeId;

  @override
  Future<TaskGroups> build() {
    final me = ref.watch(currentUserProvider);
    _search = ref.watch(tasksFilterProvider.select((filter) => filter.search));
    _assigneeId = ref
        .watch(tasksFilterProvider.select((filter) => filter.assignee))
        .idFor(me);
    return _load();
  }

  Future<TaskGroups> _load() async {
    final api = ref.read(tasksApiProvider);
    final pages = await Future.wait([
      for (final group in DueGroup.values)
        api.list(
          done: false,
          due: group,
          search: _search,
          assigneeId: _assigneeId,
          pageSize: groupPageSize,
        ),
    ]);
    return {
      for (final (index, group) in DueGroup.values.indexed) group: pages[index],
    };
  }

  /// Pull to refresh: the groups stay on screen until the new ones arrive. A failure
  /// keeps them too, and is thrown so the screen can say so.
  Future<void> refresh() async {
    try {
      final groups = await _load();
      if (ref.mounted) {
        state = AsyncData(groups);
      }
    } catch (error) {
      throw ApiError.from(error);
    }
  }
}

final openTasksProvider =
    AsyncNotifierProvider<OpenTasksController, TaskGroups>(
      OpenTasksController.new,
    );

/// The Done view of the Tasks tab, page by page.
class DoneTasksController extends PagedNotifier<Task> {
  late String _search;
  late String? _assigneeId;

  @override
  PagedState<Task> build() {
    final me = ref.watch(currentUserProvider);
    _search = ref.watch(tasksFilterProvider.select((filter) => filter.search));
    _assigneeId = ref
        .watch(tasksFilterProvider.select((filter) => filter.assignee))
        .idFor(me);
    return start();
  }

  @override
  Future<Page<Task>> fetchPage(int page) {
    return ref
        .read(tasksApiProvider)
        .list(
          done: true,
          search: _search,
          assigneeId: _assigneeId,
          // The API has no "completed" sort; the newest tasks are the closest to it.
          sort: 'createdAt',
          order: 'desc',
          page: page,
        );
  }

  @override
  Object idOf(Task item) => item.id;
}

final doneTasksProvider =
    NotifierProvider<DoneTasksController, PagedState<Task>>(
      DoneTasksController.new,
    );

/// How many tasks a record's card shows at first, and after "Show all".
const recordTasksShown = 5;
const recordTasksShownAll = 100;

/// Which card: a record, and whether "Show all" was pressed.
typedef RecordTasksArgs = ({RecordRef record, bool all});

/// The open tasks linked to one record that the signed-in user may see, soonest first.
final recordTasksProvider = FutureProvider.autoDispose
    .family<Page<Task>, RecordTasksArgs>((ref, args) {
      ref.watch(sessionUserIdProvider);
      return ref
          .watch(tasksApiProvider)
          .list(
            done: false,
            record: args.record,
            pageSize: args.all ? recordTasksShownAll : recordTasksShown,
          );
    });

/// The ids of the tasks that were ticked off in this session. Every list of open tasks
/// (the Tasks tab, Home, a record's card) leaves them out with [stillOpen], which is what
/// makes completing a task show at once: see [TaskActions.complete].
class CompletedTaskIds extends Notifier<Set<String>> {
  @override
  Set<String> build() {
    ref.watch(sessionUserIdProvider);
    return const {};
  }

  void add(String id) => state = {...state, id};

  void remove(String id) => state = {...state}..remove(id);
}

final completedTaskIdsProvider =
    NotifierProvider<CompletedTaskIds, Set<String>>(CompletedTaskIds.new);

/// The tasks of a list that are still open: without the ones ticked off in this session.
List<Task> stillOpen(List<Task> tasks, Set<String> completed) {
  return completed.isEmpty
      ? tasks
      : [
          for (final task in tasks)
            if (!completed.contains(task.id)) task,
        ];
}

/// Call after a task was created, changed, completed, reopened or deleted: everything that
/// lists or counts tasks loads again.
void tasksChanged(Ref ref) {
  ref
    ..invalidate(openTasksProvider)
    ..invalidate(doneTasksProvider)
    ..invalidate(recordTasksProvider)
    ..invalidate(dashboardProvider)
    ..invalidate(teamDashboardProvider);
}

/// Everything that changes a task. A sheet or a checkbox calls a method and shows the
/// `ApiError` it throws.
class TaskActions {
  const TaskActions(this._ref);

  final Ref _ref;

  TasksApi get _api => _ref.read(tasksApiProvider);

  /// Ticking a task off is optimistic: a checkbox that waits for the server feels broken.
  /// The id goes into [completedTaskIdsProvider] before the request, which takes the task
  /// out of every open list at once, and comes back out if the API refuses, so the task
  /// reappears exactly where it was. The caller then says so.
  Future<void> complete(String id) async {
    final completed = _ref.read(completedTaskIdsProvider.notifier)..add(id);
    try {
      await _api.complete(id);
    } catch (error) {
      completed.remove(id);
      throw ApiError.from(error);
    }
    tasksChanged(_ref);
  }

  Future<void> reopen(String id) async {
    await _api.reopen(id);
    _ref.read(completedTaskIdsProvider.notifier).remove(id);
    tasksChanged(_ref);
  }

  Future<Task> create(TaskInput input) async {
    final task = await _api.create(input);
    tasksChanged(_ref);
    return task;
  }

  Future<Task> update(String id, Json changes) async {
    final task = await _api.update(id, changes);
    tasksChanged(_ref);
    return task;
  }

  Future<void> delete(String id) async {
    await _api.delete(id);
    tasksChanged(_ref);
  }
}

final taskActionsProvider = Provider(TaskActions.new);
