import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/features/leads/lead.dart' show RecordLink;
import 'package:opencrm/features/pipeline_stages/pipeline_stages.dart';

/// How an opportunity is closed: `POST /opportunities/:id/close`. [word] completes
/// "Close as ..." and "Closed as ...".
enum CloseOutcome {
  won('WON', 'won'),
  lost('LOST', 'lost');

  const CloseOutcome(this.apiValue, this.word);

  final String apiValue;
  final String word;

  /// The outcome a Won or Lost stage stands for; null for an open stage.
  static CloseOutcome? ofKind(StageKind kind) {
    return switch (kind) {
      StageKind.won => won,
      StageKind.lost => lost,
      StageKind.open => null,
    };
  }
}

/// An opportunity as `GET /opportunities/:id` answers. Moments are in the device's time
/// zone; [expectedCloseDate] is a calendar day and the same for every viewer.
class Opportunity {
  const Opportunity({
    required this.id,
    required this.name,
    required this.value,
    required this.expectedCloseDate,
    required this.stage,
    required this.status,
    required this.closeReason,
    required this.closedAt,
    required this.contact,
    required this.company,
    required this.notes,
    required this.owner,
    required this.convertedFromLead,
    required this.lastContactAt,
    required this.followUpAt,
    required this.followUpNote,
    required this.customFields,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Opportunity.fromJson(Json json) {
    return Opportunity(
      id: readString(json, 'id'),
      name: readString(json, 'name'),
      value: readDouble(json, 'value'),
      expectedCloseDate: readStringOrNull(json, 'expectedCloseDate'),
      stage: Stage.fromJson(asMap(json['stage'])),
      status: StageKind.fromApi(readString(json, 'status')),
      closeReason: readStringOrNull(json, 'closeReason'),
      closedAt: readDateOrNull(json, 'closedAt'),
      contact: RecordLink.fromJsonOrNull(json['contact']),
      company: RecordLink.fromJsonOrNull(json['company']),
      notes: readStringOrNull(json, 'notes'),
      owner: PersonRef.fromJson(asMap(json['owner'])),
      convertedFromLead: RecordLink.fromJsonOrNull(json['convertedFromLead']),
      lastContactAt: readDateOrNull(json, 'lastContactAt'),
      followUpAt: readDateOrNull(json, 'followUpAt'),
      followUpNote: readStringOrNull(json, 'followUpNote'),
      customFields: readMapOrNull(json, 'customFields') ?? const {},
      createdAt: readDate(json, 'createdAt'),
      updatedAt: readDate(json, 'updatedAt'),
    );
  }

  final String id;
  final String name;

  /// 0 when none was given.
  final double value;

  /// A day such as `2026-11-15`, or null.
  final String? expectedCloseDate;
  final Stage stage;

  /// The kind of [stage]: open until the opportunity is closed as won or lost.
  final StageKind status;
  final String? closeReason;
  final DateTime? closedAt;

  /// Null when there is none, and when the reader may not see it.
  final RecordLink? contact;
  final RecordLink? company;
  final String? notes;
  final PersonRef owner;
  final RecordLink? convertedFromLead;
  final DateTime? lastContactAt;

  /// The follow-up reminder: when, and what to do then.
  final DateTime? followUpAt;
  final String? followUpNote;

  /// The values of the custom fields by field id: a string, a number or null.
  final Json customFields;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool get isOpen => status == StageKind.open;

  /// The same opportunity in another stage: what the board shows while a move is on its
  /// way to the server.
  Opportunity inStage(Stage stage) {
    return Opportunity(
      id: id,
      name: name,
      value: value,
      expectedCloseDate: expectedCloseDate,
      stage: stage,
      status: stage.kind,
      closeReason: closeReason,
      closedAt: closedAt,
      contact: contact,
      company: company,
      notes: notes,
      owner: owner,
      convertedFromLead: convertedFromLead,
      lastContactAt: lastContactAt,
      followUpAt: followUpAt,
      followUpNote: followUpNote,
      customFields: customFields,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}

/// One stage of the board (`GET /opportunities/board`): [count] and [totalValue] cover
/// every opportunity in the stage, [opportunities] holds at most 50 of them, the most
/// recently changed first.
class BoardColumn {
  const BoardColumn({
    required this.stage,
    required this.count,
    required this.totalValue,
    required this.opportunities,
  });

  factory BoardColumn.fromJson(Json json) {
    return BoardColumn(
      stage: Stage.fromJson(asMap(json['stage'])),
      count: readInt(json, 'count'),
      totalValue: readDouble(json, 'totalValue'),
      opportunities: readList(json['opportunities'], Opportunity.fromJson),
    );
  }

  final Stage stage;
  final int count;
  final double totalValue;
  final List<Opportunity> opportunities;

  /// The stage holds more opportunities than the board carries: the list has the rest.
  bool get isCapped => count > opportunities.length;
}

/// The board with one card put somewhere else: [card] leaves the column it is in (found by
/// id) and is placed in the column of `card.stage` at [index]. The counts and totals of
/// both columns follow. Used for a move that shows at once, for undoing it, and for the
/// server's answer.
List<BoardColumn> placeCard(
  List<BoardColumn> columns,
  Opportunity card, {
  int index = 0,
}) {
  return [for (final column in columns) _placeIn(column, card, index)];
}

BoardColumn _placeIn(BoardColumn column, Opportunity card, int index) {
  final current = column.opportunities
      .where((opportunity) => opportunity.id == card.id)
      .firstOrNull;
  final isTarget = column.stage.id == card.stage.id;
  if (current == null && !isTarget) {
    return column;
  }
  final cards = [
    for (final opportunity in column.opportunities)
      if (opportunity.id != card.id) opportunity,
  ];
  var count = column.count - (current == null ? 0 : 1);
  var totalValue = column.totalValue - (current?.value ?? 0);
  if (isTarget) {
    cards.insert(index.clamp(0, cards.length), card);
    count += 1;
    totalValue += card.value;
  }
  return BoardColumn(
    stage: column.stage,
    count: count,
    totalValue: totalValue < 0 ? 0 : totalValue,
    opportunities: cards,
  );
}

/// What the opportunity form holds. A new opportunity sends what was filled in
/// ([toCreateJson]); an edit sends only what changed ([changesFrom]).
class OpportunityInput {
  const OpportunityInput({
    required this.name,
    this.value,
    this.expectedCloseDate,
    this.stageId,
    this.companyId,
    this.contactId,
    this.notes = '',
    this.customFields,
  });

  final String name;

  /// Null when the box was left empty: 0.
  final double? value;

  /// A day such as `2026-11-15`.
  final String? expectedCloseDate;

  /// For a new opportunity only: an existing one changes stage on its page or the board.
  final String? stageId;
  final String? companyId;
  final String? contactId;
  final String notes;

  /// The custom fields to send, by field id (`CustomFieldValues.forCreate` or `.changes`);
  /// null leaves `customFields` out, so the record keeps the values it has.
  final Json? customFields;

  String? get _notes => notes.trim().isEmpty ? null : notes.trim();

  /// Empty optional fields are left out, so the server's defaults apply (value 0, the
  /// first open stage).
  Json toCreateJson() {
    return {
      'name': name.trim(),
      'value': ?value,
      'expectedCloseDate': ?expectedCloseDate,
      'stageId': ?stageId,
      'companyId': ?companyId,
      'contactId': ?contactId,
      'notes': ?_notes,
      'customFields': ?customFields,
    };
  }

  /// Only what differs from [opportunity]. An emptied field is sent as null, which clears
  /// it (an emptied value is 0). A company or contact the reader may not see is null on
  /// the opportunity and stays untouched unless the user picks another.
  Json changesFrom(Opportunity opportunity) {
    return {
      if (name.trim() != opportunity.name) 'name': name.trim(),
      if ((value ?? 0) != opportunity.value) 'value': value ?? 0,
      if (expectedCloseDate != opportunity.expectedCloseDate)
        'expectedCloseDate': expectedCloseDate,
      if (companyId != opportunity.company?.id) 'companyId': companyId,
      if (contactId != opportunity.contact?.id) 'contactId': contactId,
      if (_notes != opportunity.notes) 'notes': _notes,
      'customFields': ?customFields,
    };
  }
}
