/// The words for timeline entries, with the same wording as the web app
/// (`frontend/src/features/timeline/timeline-labels.ts`).
library;

import 'package:flutter/material.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_entry.dart';

/// A status or a reason as words: `CHOSE_COMPETITOR` becomes "Chose competitor". The
/// timeline shows the changes of every kind of record, so it does not keep a list of each
/// record's statuses; the API's names are plain words in capitals and read well this way.
String humanize(String value) {
  final words = value.toLowerCase().replaceAll('_', ' ');
  return words.isEmpty
      ? words
      : '${words[0].toUpperCase()}${words.substring(1)}';
}

String? _text(Json details, String key) {
  final value = details[key];
  return value is String && value.isNotEmpty ? value : null;
}

/// The `name` of an object such as `{ id, name }` under [key].
String? _name(Json details, String key) {
  final value = details[key];
  return value is Map && value['name'] is String
      ? value['name'] as String
      : null;
}

/// The `number` of the quote or invoice an entry names.
String? _documentNumber(Json details, String key) {
  final value = details[key];
  return value is Map && value['number'] is String
      ? value['number'] as String
      : null;
}

/// The quote an entry is about, when it can be opened: a quote's status change (not the
/// deletion of a draft, which is gone) and an email the quote was sent with
/// (`details.quote`). Null for every other entry.
({String id, String number})? entryQuote(TimelineEntry entry) {
  final isStatus = entry.kind == TimelineKind.quoteStatus;
  if (!isStatus && entry.kind != TimelineKind.email) {
    return null;
  }
  if (isStatus && _text(entry.details, 'to') == null) {
    return null;
  }
  final quote = entry.details['quote'];
  return quote is Map && quote['id'] is String && quote['number'] is String
      ? (id: quote['id'] as String, number: quote['number'] as String)
      : null;
}

IconData entryIcon(TimelineEntry entry) {
  switch (entry.kind) {
    case TimelineKind.conversation:
      return switch (entry.conversationType) {
        ConversationType.call => Icons.phone_outlined,
        ConversationType.meeting => Icons.groups_outlined,
        ConversationType.email => Icons.mail_outline,
        ConversationType.message || null => Icons.chat_bubble_outline,
      };
    case TimelineKind.note:
      return Icons.sticky_note_2_outlined;
    case TimelineKind.email:
      return Icons.send_outlined;
    case TimelineKind.created:
      return Icons.add_circle_outline;
    case TimelineKind.statusChange:
      return Icons.swap_horiz;
    case TimelineKind.assignment:
      return Icons.person_outline;
    case TimelineKind.quoteStatus:
    case TimelineKind.invoiceStatus:
      return Icons.description_outlined;
    case TimelineKind.unknown:
      return Icons.history;
  }
}

/// The title of an opportunity's status change. Stage names are an Admin's own words and
/// are shown as they are; the kinds say whether it was closed or reopened.
String _stageChangeTitle(Json details) {
  final from = _text(details, 'from');
  final to = _text(details, 'to');
  final fromKind = _text(details, 'fromKind');
  final toKind = _text(details, 'toKind');
  if (toKind == 'WON') {
    return 'Closed as won';
  }
  if (toKind == 'LOST') {
    return 'Closed as lost';
  }
  if (fromKind == 'WON' || fromKind == 'LOST') {
    return to == null ? 'Reopened' : 'Reopened in $to';
  }
  if (from != null && to != null) {
    return 'Stage changed: $from → $to';
  }
  return to == null ? 'Stage changed' : 'Moved to $to';
}

String _statusChangeTitle(Json details) {
  if (_text(details, 'toKind') != null) {
    return _stageChangeTitle(details);
  }
  final from = _text(details, 'from');
  final to = _text(details, 'to');
  final reason = _text(details, 'reason');
  if (to == 'CONVERTED') {
    return 'Converted';
  }
  // Marking a lost record as lost again only changes why it was lost.
  if (from == 'LOST' && to == 'LOST') {
    return reason == null
        ? 'Lost reason updated'
        : 'Lost reason updated — ${humanize(reason)}';
  }
  if (to == 'LOST') {
    return reason == null
        ? 'Marked as lost'
        : 'Marked as lost — ${humanize(reason)}';
  }
  if (from != null && to != null) {
    return 'Status changed: ${humanize(from)} → ${humanize(to)}';
  }
  return to == null ? 'Status changed' : 'Status changed to ${humanize(to)}';
}

/// "Quote Q-0001 sent", "Invoice INV-0001 marked paid": the document and, in a word or
/// two, what happened to it.
String _documentTitle(TimelineEntry entry) {
  final isQuote = entry.kind == TimelineKind.quoteStatus;
  final noun = isQuote ? 'Quote' : 'Invoice';
  final number = _documentNumber(entry.details, isQuote ? 'quote' : 'invoice');
  final from = _text(entry.details, 'from');
  final to = _text(entry.details, 'to');

  final String verb;
  if (isQuote && to == null) {
    verb = 'deleted';
  } else if (from == null) {
    verb = 'created';
  } else if (isQuote) {
    verb =
        const {
          'SENT': 'sent',
          'ACCEPTED': 'accepted',
          'DECLINED': 'declined',
          'DRAFT': 'reopened',
        }[to] ??
        'updated';
  } else if (to == 'SENT') {
    // Back from paid or overdue is the way out of a wrong tap.
    verb = from == 'DRAFT' ? 'marked sent' : 'marked unpaid';
  } else {
    verb =
        const {
          'PAID': 'marked paid',
          'OVERDUE': 'marked overdue',
          'VOID': 'voided',
          'DRAFT': 'restored',
        }[to] ??
        'updated';
  }

  final sentence = number == null ? '$noun $verb' : '$noun $number $verb';
  final total = entry.details['total'];
  final carriesTotal =
      from == null || (isQuote && (to == 'SENT' || to == 'ACCEPTED'));
  return carriesTotal && total is num && !(isQuote && to == null)
      ? '$sentence · ${formatCurrency(total)}'
      : sentence;
}

/// The title of an entry: "Call", "Note", "Status changed: New → Contacted",
/// "Marked as lost — Price", "Reassigned from Ada to Rob", "Lead created",
/// "Email sent: Our proposal".
String entryTitle(TimelineEntry entry, RecordType recordType) {
  switch (entry.kind) {
    case TimelineKind.conversation:
      return entry.conversationType?.label ?? 'Conversation';
    case TimelineKind.note:
      return 'Note';
    case TimelineKind.created:
      // A record made by converting a lead says which lead.
      final lead = _name(entry.details, 'fromLead');
      return lead == null
          ? '${recordType.label} created'
          : '${recordType.label} created from lead $lead';
    case TimelineKind.statusChange:
      return _statusChangeTitle(entry.details);
    case TimelineKind.assignment:
      final from = _name(entry.details, 'fromOwner');
      final to = _name(entry.details, 'toOwner');
      if (from != null && to != null) {
        return 'Reassigned from $from to $to';
      }
      return to == null ? 'Reassigned' : 'Assigned to $to';
    case TimelineKind.email:
      final subject = _text(entry.details, 'subject');
      return subject == null ? 'Email sent' : 'Email sent: $subject';
    case TimelineKind.quoteStatus:
    case TimelineKind.invoiceStatus:
      return _documentTitle(entry);
    case TimelineKind.unknown:
      return 'Update';
  }
}

/// The text under the title: what was discussed, the note, the email as it was sent, the
/// note given when a lead was marked as lost, or why an opportunity was won or lost.
/// Null when the entry has none.
String? entryText(TimelineEntry entry) {
  if (entry.kind == TimelineKind.statusChange) {
    // An opportunity's reason is a sentence someone wrote, not a code for the title.
    return _text(entry.details, 'toKind') != null
        ? _text(entry.details, 'reason')
        : _text(entry.details, 'note');
  }
  final body = entry.body;
  return body == null || body.isEmpty ? null : body;
}
