import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/features/tasks/task.dart';
import 'package:opencrm/features/timeline/timeline_entry.dart';

/// One entry of the activity feed: a timeline entry plus the record it was made on. The
/// record is `{ type, id, name }`, the same shape a task names its record with.
class ActivityEntry {
  const ActivityEntry({required this.entry, required this.record});

  factory ActivityEntry.fromJson(Json json) {
    return ActivityEntry(
      entry: TimelineEntry.fromJson(json),
      record: TaskRecord.fromJson(asMap(json['record'])),
    );
  }

  final TimelineEntry entry;
  final TaskRecord record;
}

/// The Type filter of the feed: the same groups as the filter of a record's timeline, plus
/// the emails. `changes` is the API's `SYSTEM`: the entries the system writes itself.
enum ActivityKind {
  all(null, 'All types'),
  conversations('CONVERSATION', 'Conversations'),
  notes('NOTE', 'Notes'),
  emails('EMAIL', 'Emails'),
  changes('SYSTEM', 'Changes');

  const ActivityKind(this.apiValue, this.label);

  /// The `kind` query parameter; null leaves it out.
  final String? apiValue;
  final String label;
}
