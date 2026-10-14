import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/features/tasks/task.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// The task routes of the API. Each function returns the unwrapped data; a failure is an
/// `ApiError`.
class TasksApi {
  const TasksApi(this._client);

  final ApiClient _client;

  Task _task(ApiResponse response) => Task.fromJson(asMap(response.data));

  /// One page of the tasks the signed-in user may see. The device's distance from UTC goes
  /// with every request: it decides what "overdue" and "today" mean.
  ///
  /// [assigneeId] null is everyone the caller may see. [record] lists the tasks linked to
  /// one record.
  Future<Page<Task>> list({
    required bool done,
    DueGroup? due,
    String search = '',
    String? assigneeId,
    RecordRef? record,
    String sort = 'dueAt',
    String order = 'asc',
    int page = 1,
    int pageSize = defaultPageSize,
  }) async {
    final query = ListQuery(
      search: search,
      sort: sort,
      order: order,
      page: page,
      pageSize: pageSize,
      filters: {
        'status': done ? 'DONE' : 'OPEN',
        'due': due?.apiValue,
        'assigneeId': assigneeId,
        'recordType': record == null ? null : apiRecordType(record.type),
        'recordId': record?.id,
        'tz': deviceTimeZone(),
      },
    );
    final response = await _client.get('/tasks', query: query.toQuery());
    return Page.fromResponse(response, Task.fromJson);
  }

  Future<Task> get(String id) async => _task(await _client.get('/tasks/$id'));

  /// Assigned to the caller unless the input says otherwise.
  Future<Task> create(TaskInput input) async {
    return _task(await _client.post('/tasks', body: input.toCreateJson()));
  }

  /// [changes] holds only the keys to change (`TaskInput.changesFrom`).
  Future<Task> update(String id, Json changes) async {
    return _task(await _client.patch('/tasks/$id', body: changes));
  }

  Future<Task> complete(String id) async {
    return _task(await _client.post('/tasks/$id/complete'));
  }

  Future<Task> reopen(String id) async {
    return _task(await _client.post('/tasks/$id/reopen'));
  }

  Future<void> delete(String id) async {
    await _client.delete('/tasks/$id');
  }
}

final tasksApiProvider = Provider(
  (ref) => TasksApi(ref.watch(apiClientProvider)),
);
