/// The words of the activity feed, with the same wording as the web app
/// (`frontend/src/features/activity/activity-labels.ts`). What an entry itself says (its
/// title and its text) comes from `timeline_labels.dart`.
library;

import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/features/activity/activity_entry.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_entry.dart';
import 'package:opencrm/features/timeline/timeline_labels.dart';

String? _text(Json details, String key) {
  final value = details[key];
  return value is String && value.isNotEmpty ? value : null;
}

String? _name(Json details, String key) {
  final value = details[key];
  return value is Map && value['name'] is String
      ? value['name'] as String
      : null;
}

const _conversationVerbs = {
  ConversationType.call: 'logged a call with',
  ConversationType.meeting: 'logged a meeting with',
  ConversationType.email: 'logged an email with',
  ConversationType.message: 'logged a message with',
};

/// What someone did, as the words around the record's name:
/// "Riley logged a call with Marcus Chen", "Riley marked Marcus Chen as lost".
({String before, String after}) activitySentence(TimelineEntry entry) {
  final details = entry.details;
  switch (entry.kind) {
    case TimelineKind.conversation:
      return (
        before:
            _conversationVerbs[entry.conversationType] ??
            'logged a conversation with',
        after: '',
      );
    case TimelineKind.note:
      return (before: 'added a note on', after: '');
    case TimelineKind.created:
      return (before: 'created', after: '');
    case TimelineKind.statusChange:
      final from = _text(details, 'from');
      final to = _text(details, 'to');
      final fromKind = _text(details, 'fromKind');
      final toKind = _text(details, 'toKind');
      // An opportunity: `to` is the name of a pipeline stage, shown as it is.
      if (toKind == 'WON' || toKind == 'LOST') {
        return (
          before: 'closed',
          after: toKind == 'WON' ? ' as won' : ' as lost',
        );
      }
      if (toKind != null) {
        final reopened = fromKind == 'WON' || fromKind == 'LOST';
        return (
          before: reopened ? 'reopened' : 'moved',
          after: to == null ? '' : ' to $to',
        );
      }
      if (to == 'CONVERTED') {
        return (before: 'converted', after: '');
      }
      if (from == 'LOST' && to == 'LOST') {
        return (before: 'updated the lost reason of', after: '');
      }
      if (to == 'LOST') {
        return (before: 'marked', after: ' as lost');
      }
      return (
        before: 'changed the status of',
        after: to == null ? '' : ' to ${humanize(to)}',
      );
    case TimelineKind.assignment:
      final from = _name(details, 'fromOwner');
      final to = _name(details, 'toOwner');
      if (from != null && to != null) {
        return (before: 'reassigned', after: ' from $from to $to');
      }
      return (before: 'reassigned', after: to == null ? '' : ' to $to');
    case TimelineKind.email:
      return (before: 'sent an email from', after: '');
    // Which quote or invoice, and what happened to it, is in the line under the sentence.
    case TimelineKind.quoteStatus:
      return (before: 'changed a quote on', after: '');
    case TimelineKind.invoiceStatus:
      return (before: 'changed an invoice on', after: '');
    case TimelineKind.unknown:
      return (before: 'updated', after: '');
  }
}

bool _isMarkedLost(TimelineEntry entry) {
  return entry.kind == TimelineKind.statusChange &&
      _text(entry.details, 'toKind') == null &&
      _text(entry.details, 'to') == 'LOST';
}

/// The word on an entry's badge.
String activityBadge(TimelineEntry entry) {
  return switch (entry.kind) {
    TimelineKind.conversation =>
      entry.conversationType?.label ?? 'Conversation',
    TimelineKind.note => 'Note',
    TimelineKind.created => 'New',
    TimelineKind.statusChange => _isMarkedLost(entry) ? 'Lost' : 'Status',
    TimelineKind.assignment => 'Owner',
    TimelineKind.email => 'Email',
    TimelineKind.quoteStatus => 'Quote',
    TimelineKind.invoiceStatus => 'Invoice',
    TimelineKind.unknown => 'Update',
  };
}

/// The line or two under the sentence: what was discussed, the note, why it was lost, the
/// subject and start of an email, or which quote or invoice it was ("Quote Q-0001 sent").
/// Null when the entry has none.
String? activityExcerpt(ActivityEntry activity) {
  final entry = activity.entry;
  final details = entry.details;
  String? joined(List<String?> parts) {
    final present = parts.nonNulls.toList();
    return present.isEmpty ? null : present.join(' — ');
  }

  switch (entry.kind) {
    case TimelineKind.quoteStatus:
    case TimelineKind.invoiceStatus:
      return entryTitle(
        entry,
        activity.record.recordType ?? RecordType.opportunity,
      );
    case TimelineKind.email:
      return joined([_text(details, 'subject'), entryText(entry)]);
    default:
      if (_isMarkedLost(entry)) {
        final reason = _text(details, 'reason');
        return joined([
          reason == null ? null : humanize(reason),
          _text(details, 'note'),
        ]);
      }
      return entryText(entry);
  }
}
