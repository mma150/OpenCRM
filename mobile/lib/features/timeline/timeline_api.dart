import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_entry.dart';

/// The timeline routes, the same three for every kind of record:
/// `GET /<records>/:id/timeline`, `POST .../conversations` and `POST .../notes`.
class TimelineApi {
  const TimelineApi(this._client);

  final ApiClient _client;

  /// Newest first. The order is the server's; a timeline cannot be sorted.
  Future<Page<TimelineEntry>> list(
    RecordRef record,
    TimelineFilter filter,
    int page,
  ) async {
    final query = ListQuery(page: page, filters: {'kind': filter.apiValue});
    final response = await _client.get(
      '${record.apiPath}/timeline',
      query: query.toQuery(),
    );
    return Page.fromResponse(response, TimelineEntry.fromJson);
  }

  /// [occurredAt] may not be more than 5 minutes ahead of the server's clock.
  Future<TimelineEntry> logConversation(
    RecordRef record, {
    required ConversationType type,
    required DateTime occurredAt,
    required String summary,
  }) async {
    final response = await _client.post(
      '${record.apiPath}/conversations',
      body: {
        'type': type.apiValue,
        'occurredAt': toApiMoment(occurredAt),
        'summary': summary,
      },
    );
    return TimelineEntry.fromJson(asMap(response.data));
  }

  Future<TimelineEntry> addNote(RecordRef record, String body) async {
    final response = await _client.post(
      '${record.apiPath}/notes',
      body: {'body': body},
    );
    return TimelineEntry.fromJson(asMap(response.data));
  }
}

final timelineApiProvider = Provider(
  (ref) => TimelineApi(ref.watch(apiClientProvider)),
);
