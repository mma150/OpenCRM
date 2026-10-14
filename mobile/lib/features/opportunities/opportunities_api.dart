import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/features/opportunities/opportunity.dart';
import 'package:opencrm/features/pipeline_stages/pipeline_stages.dart';

/// How the opportunities list can be sorted: the words shown (the web app's), and the
/// API's `sort` and `order`.
enum OpportunitySort {
  newest('Newest first', 'createdAt', 'desc'),
  oldest('Oldest first', 'createdAt', 'asc'),
  stage('Stage', 'stage', 'asc'),
  valueHighest('Value: highest', 'value', 'desc'),
  valueLowest('Value: lowest', 'value', 'asc'),
  closingSoonest('Closing soonest', 'expectedCloseDate', 'asc'),
  closingLatest('Closing latest', 'expectedCloseDate', 'desc'),
  nameAscending('Name A–Z', 'name', 'asc'),
  nameDescending('Name Z–A', 'name', 'desc');

  const OpportunitySort(this.label, this.field, this.order);

  final String label;
  final String field;
  final String order;
}

/// What the opportunities list is showing: the search, the stage and status filters and
/// the order.
class OpportunitiesQuery {
  const OpportunitiesQuery({
    this.search = '',
    this.stageId,
    this.status,
    this.ownerId,
    this.sort = OpportunitySort.newest,
  });

  final String search;

  /// Null shows every stage.
  final String? stageId;

  /// Null shows open, won and lost.
  final StageKind? status;

  /// One owner's opportunities only: Home sets it to the user's own id for an Admin or a
  /// Sales Manager, whose figures there are their own. Null shows every one the user may
  /// see.
  final String? ownerId;
  final OpportunitySort sort;

  bool get isFiltered =>
      search.trim().isNotEmpty ||
      stageId != null ||
      status != null ||
      ownerId != null;

  ListQuery toListQuery(int page) {
    return ListQuery(
      search: search,
      sort: sort.field,
      order: sort.order,
      page: page,
      filters: {
        'stageId': stageId,
        'status': status?.apiValue,
        'ownerId': ownerId,
      },
    );
  }
}

/// The opportunity routes of the API. Each function returns the unwrapped data; a failure
/// is an `ApiError`.
class OpportunitiesApi {
  const OpportunitiesApi(this._client);

  final ApiClient _client;

  Opportunity _opportunity(ApiResponse response) =>
      Opportunity.fromJson(asMap(response.data));

  Future<Page<Opportunity>> list(OpportunitiesQuery query, int page) async {
    final response = await _client.get(
      '/opportunities',
      query: query.toListQuery(page).toQuery(),
    );
    return Page.fromResponse(response, Opportunity.fromJson);
  }

  /// The pipeline as columns, in order, Won and Lost included. Not paged. [ownerId]
  /// keeps one owner's opportunities only.
  Future<List<BoardColumn>> board({String? ownerId}) async {
    final response = await _client.get(
      '/opportunities/board',
      query: {'ownerId': ?ownerId},
    );
    return readList(response.data, BoardColumn.fromJson);
  }

  Future<Opportunity> get(String id) async =>
      _opportunity(await _client.get('/opportunities/$id'));

  /// The new opportunity is owned by the caller.
  Future<Opportunity> create(OpportunityInput input) async {
    return _opportunity(
      await _client.post('/opportunities', body: input.toCreateJson()),
    );
  }

  /// The details only. The stage and the owner have their own routes below.
  Future<Opportunity> update(String id, Json changes) async {
    return _opportunity(
      await _client.patch('/opportunities/$id', body: changes),
    );
  }

  /// To an open stage. Won and Lost are reached with [close].
  Future<Opportunity> move(String id, String stageId) async {
    return _opportunity(
      await _client.post(
        '/opportunities/$id/stage',
        body: {'stageId': stageId},
      ),
    );
  }

  /// The reason is needed for lost and optional for won.
  Future<Opportunity> close(
    String id, {
    required CloseOutcome outcome,
    String? reason,
  }) async {
    final trimmed = reason?.trim() ?? '';
    return _opportunity(
      await _client.post(
        '/opportunities/$id/close',
        body: {
          'outcome': outcome.apiValue,
          if (trimmed.isNotEmpty) 'reason': trimmed,
        },
      ),
    );
  }

  /// Back to the first open stage.
  Future<Opportunity> reopen(String id) async {
    return _opportunity(
      await _client.post('/opportunities/$id/reopen', body: const {}),
    );
  }

  /// Admins and Sales Managers only.
  Future<Opportunity> assign(String id, String ownerId) async {
    return _opportunity(
      await _client.post(
        '/opportunities/$id/assign',
        body: {'ownerId': ownerId},
      ),
    );
  }

  /// Sets, moves or (with a null [at]) clears the follow-up reminder. The API refuses a
  /// new one on a closed opportunity.
  Future<Opportunity> setFollowUp(
    String id, {
    required DateTime? at,
    String? note,
  }) async {
    final trimmed = note?.trim() ?? '';
    return _opportunity(
      await _client.put(
        '/opportunities/$id/follow-up',
        body: {
          'at': at == null ? null : toApiMoment(at),
          'note': at == null || trimmed.isEmpty ? null : trimmed,
        },
      ),
    );
  }

  Future<void> delete(String id) async {
    await _client.delete('/opportunities/$id');
  }
}

final opportunitiesApiProvider = Provider(
  (ref) => OpportunitiesApi(ref.watch(apiClientProvider)),
);
