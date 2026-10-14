import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/state/paged_notifier.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_api.dart';
import 'package:opencrm/features/timeline/timeline_entry.dart';

/// Which timeline: a record and the filter chosen on it.
typedef TimelineArgs = ({RecordRef record, TimelineFilter filter});

/// The timeline of one record under one filter, page by page.
class TimelineController extends PagedNotifier<TimelineEntry> {
  TimelineController(this.args);

  final TimelineArgs args;

  @override
  PagedState<TimelineEntry> build() => start();

  @override
  Future<Page<TimelineEntry>> fetchPage(int page) {
    return ref.read(timelineApiProvider).list(args.record, args.filter, page);
  }

  @override
  Object idOf(TimelineEntry item) => item.id;
}

final timelineProvider = NotifierProvider.autoDispose
    .family<TimelineController, PagedState<TimelineEntry>, TimelineArgs>(
      TimelineController.new,
    );

/// Call after anything that writes an entry on [record] (a conversation, a note, a status
/// change, an assignment): its timelines, under every filter, load again.
void refreshTimelines(Ref ref, RecordRef record) {
  for (final filter in TimelineFilter.values) {
    ref.invalidate(timelineProvider((record: record, filter: filter)));
  }
}

/// The two things a person writes on a timeline. A screen calls these from a sheet and
/// shows the `ApiError` they throw.
class TimelineWriter {
  const TimelineWriter(this._ref);

  final Ref _ref;

  Future<void> logConversation(
    RecordRef record, {
    required ConversationType type,
    required DateTime occurredAt,
    required String summary,
  }) async {
    await _ref
        .read(timelineApiProvider)
        .logConversation(
          record,
          type: type,
          occurredAt: occurredAt,
          summary: summary,
        );
    refreshTimelines(_ref, record);
  }

  Future<void> addNote(RecordRef record, String body) async {
    await _ref.read(timelineApiProvider).addNote(record, body);
    refreshTimelines(_ref, record);
  }
}

final timelineWriterProvider = Provider(TimelineWriter.new);
