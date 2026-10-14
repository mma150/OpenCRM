import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/features/leads/lead.dart';

/// How the leads list can be sorted: the words shown, and the API's `sort` and `order`.
enum LeadSort {
  newest('Newest first', 'createdAt', 'desc'),
  recentlyUpdated('Recently updated', 'updatedAt', 'desc'),
  name('Name (A to Z)', 'name', 'asc'),
  lastContact('Last contact', 'lastContactAt', 'desc'),
  followUp('Follow-up (soonest first)', 'followUpAt', 'asc');

  const LeadSort(this.label, this.field, this.order);

  final String label;
  final String field;
  final String order;
}

/// What the leads list is showing: the search, the status filter and the order.
class LeadsQuery {
  const LeadsQuery({
    this.search = '',
    this.status,
    this.sort = LeadSort.newest,
  });

  final String search;

  /// Null shows every status.
  final LeadStatus? status;
  final LeadSort sort;

  ListQuery toListQuery(int page) {
    return ListQuery(
      search: search,
      sort: sort.field,
      order: sort.order,
      page: page,
      filters: {'status': status?.apiValue},
    );
  }
}

/// The lead routes of the API. Each function returns the unwrapped data; a failure is an
/// `ApiError`.
class LeadsApi {
  const LeadsApi(this._client);

  final ApiClient _client;

  Lead _lead(ApiResponse response) => Lead.fromJson(asMap(response.data));

  Future<Page<Lead>> list(LeadsQuery query, int page) async {
    final response = await _client.get(
      '/leads',
      query: query.toListQuery(page).toQuery(),
    );
    return Page.fromResponse(response, Lead.fromJson);
  }

  Future<Lead> get(String id) async => _lead(await _client.get('/leads/$id'));

  /// The new lead is owned by the caller.
  Future<Lead> create(LeadInput input) async {
    return _lead(await _client.post('/leads', body: input.toJson()));
  }

  Future<Lead> update(String id, LeadInput input) async {
    return _lead(await _client.patch('/leads/$id', body: input.toJson()));
  }

  /// Moves a lead between New, Contacted and Qualified, and reopens a lost one.
  Future<Lead> changeStatus(String id, LeadStatus status) async {
    return _lead(
      await _client.patch('/leads/$id', body: {'status': status.apiValue}),
    );
  }

  Future<Lead> markLost(
    String id, {
    required LostReason reason,
    String? note,
  }) async {
    final trimmed = note?.trim() ?? '';
    return _lead(
      await _client.post(
        '/leads/$id/mark-lost',
        body: {
          'reason': reason.apiValue,
          'note': trimmed.isEmpty ? null : trimmed,
        },
      ),
    );
  }

  /// Admins and Sales Managers only.
  Future<Lead> assign(String id, String ownerId) async {
    return _lead(
      await _client.post('/leads/$id/assign', body: {'ownerId': ownerId}),
    );
  }

  /// Sets, moves or (with a null [at]) clears the follow-up reminder.
  Future<Lead> setFollowUp(
    String id, {
    required DateTime? at,
    String? note,
  }) async {
    final trimmed = note?.trim() ?? '';
    return _lead(
      await _client.put(
        '/leads/$id/follow-up',
        body: {
          'at': at == null ? null : toApiMoment(at),
          'note': at == null || trimmed.isEmpty ? null : trimmed,
        },
      ),
    );
  }

  Future<void> delete(String id) async {
    await _client.delete('/leads/$id');
  }
}

final leadsApiProvider = Provider(
  (ref) => LeadsApi(ref.watch(apiClientProvider)),
);
