import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/features/leads/lead.dart' show RecordLink;

/// What a timeline entry is. `unknown` is a kind a newer server writes that this version
/// of the app has no words for yet; it is shown as a plain "Update".
enum TimelineKind {
  conversation('CONVERSATION'),
  note('NOTE'),
  email('EMAIL'),
  created('CREATED'),
  statusChange('STATUS_CHANGE'),
  assignment('ASSIGNMENT'),
  quoteStatus('QUOTE_STATUS'),
  invoiceStatus('INVOICE_STATUS'),
  unknown('');

  const TimelineKind(this.apiValue);

  final String apiValue;

  static TimelineKind fromApi(String value) {
    return values.firstWhere(
      (kind) => kind.apiValue == value,
      orElse: () => unknown,
    );
  }
}

/// How a conversation happened.
enum ConversationType {
  call('CALL', 'Call'),
  meeting('MEETING', 'Meeting'),
  email('EMAIL', 'Email'),
  message('MESSAGE', 'Message');

  const ConversationType(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static ConversationType? fromApi(String? value) {
    return values.where((type) => type.apiValue == value).firstOrNull;
  }
}

/// The filter of a timeline: everything, or one group of kinds. `changes` is the API's
/// `SYSTEM`: the entries the system writes itself.
enum TimelineFilter {
  all(null, 'All'),
  conversations('CONVERSATION', 'Conversations'),
  notes('NOTE', 'Notes'),
  changes('SYSTEM', 'Changes');

  const TimelineFilter(this.apiValue, this.label);

  /// The `kind` query parameter; null leaves it out.
  final String? apiValue;
  final String label;
}

/// One dated thing that happened to a record. Entries are permanent: the API has no route
/// that changes or deletes one.
class TimelineEntry {
  const TimelineEntry({
    required this.id,
    required this.kind,
    required this.conversationType,
    required this.body,
    required this.details,
    required this.occurredAt,
    required this.author,
    this.fromLead,
  });

  factory TimelineEntry.fromJson(Json json) {
    return TimelineEntry(
      id: readString(json, 'id'),
      kind: TimelineKind.fromApi(readString(json, 'kind')),
      conversationType: ConversationType.fromApi(
        readStringOrNull(json, 'conversationType'),
      ),
      body: readStringOrNull(json, 'body'),
      details: readMapOrNull(json, 'details') ?? const {},
      occurredAt: readDate(json, 'occurredAt'),
      author: PersonRef.fromJson(asMap(json['author'])),
      // Left out by an older server: the entry is the record's own.
      fromLead: RecordLink.fromJsonOrNull(json['fromLead']),
    );
  }

  final String id;
  final TimelineKind kind;
  final ConversationType? conversationType;

  /// What was discussed, the note, or the text of an email. Null for system entries.
  final String? body;

  /// What a system entry records (`{ from, to }` of a status change, the two owners of an
  /// assignment). Empty when there is none. Read it through `timeline_labels.dart`.
  final Json details;
  final DateTime occurredAt;
  final PersonRef author;

  /// On the timeline of a contact, a company or an opportunity: the lead that was converted
  /// into the record, when this is one of that lead's entries (merged in by date). Null for
  /// the record's own entries, and on a lead's timeline and the activity feed.
  final RecordLink? fromLead;
}
