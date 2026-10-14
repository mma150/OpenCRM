import 'package:opencrm/core/auth/user.dart';

/// The people of the tests, one per role.
const admin = User(
  id: 'user-admin',
  name: 'Ada Admin',
  email: 'ada@example.com',
  role: Role.admin,
);
const manager = User(
  id: 'user-manager',
  name: 'Sarah Jenkins',
  email: 'sarah@example.com',
  role: Role.salesManager,
);
const rep = User(
  id: 'user-rep',
  name: 'Riley Rep',
  email: 'riley@example.com',
  role: Role.salesRep,
);
const readOnly = User(
  id: 'user-readonly',
  name: 'Robin Readonly',
  email: 'robin@example.com',
  role: Role.readOnly,
);

Map<String, Object?> userJson(User user) {
  return {
    'id': user.id,
    'name': user.name,
    'email': user.email,
    'role': user.role.apiValue,
  };
}

/// A lead as the API answers it. Pass only what a test is about.
Map<String, Object?> leadJson({
  String id = 'lead-1',
  String firstName = 'Marcus',
  String lastName = 'Chen',
  String? company = 'Northwind Logistics',
  String? jobTitle = 'Operations Director',
  String? email = 'marcus@northwind.example',
  String? phone = '+1 555 0100',
  String source = 'REFERRAL',
  String status = 'NEW',
  User owner = rep,
  num? estimatedValue = 48000,
  String? notes,
  String? lostReason,
  String? lostNote,
  String? lostAt,
  String? lastContactAt,
  String? followUpAt,
  String? followUpNote,
  String? convertedAt,
  Map<String, Object?>? convertedTo,
  Map<String, Object?> customFields = const {},
}) {
  return {
    'id': id,
    'firstName': firstName,
    'lastName': lastName,
    'name': '$firstName $lastName',
    'company': company,
    'jobTitle': jobTitle,
    'email': email,
    'phone': phone,
    'source': source,
    'status': status,
    'owner': {'id': owner.id, 'name': owner.name},
    'estimatedValue': estimatedValue,
    'notes': notes,
    'lostReason': lostReason,
    'lostNote': lostNote,
    'lostAt': lostAt,
    'lastContactAt': lastContactAt,
    'followUpAt': followUpAt,
    'followUpNote': followUpNote,
    'convertedAt': convertedAt,
    'convertedTo': convertedTo,
    'customFields': customFields,
    'createdAt': '2026-10-01T09:00:00.000Z',
    'updatedAt': '2026-10-05T09:00:00.000Z',
  };
}

/// A timeline entry as the API answers it.
Map<String, Object?> entryJson({
  String id = 'entry-1',
  String kind = 'CONVERSATION',
  String? conversationType = 'CALL',
  String? body = 'Talked through the fleet pricing.',
  Map<String, Object?>? details,
  String occurredAt = '2026-10-05T09:30:00.000Z',
  User author = rep,
}) {
  return {
    'id': id,
    'kind': kind,
    'conversationType': kind == 'CONVERSATION' ? conversationType : null,
    'body': body,
    'details': details,
    'occurredAt': occurredAt,
    'author': {'id': author.id, 'name': author.name},
    'createdAt': occurredAt,
  };
}

/// A task as the API answers it. Pass only what a test is about.
Map<String, Object?> taskJson({
  String id = 'task-1',
  String title = 'Send revised pricing',
  String? description,
  String? dueAt = '2026-10-01T09:00:00.000Z',
  String status = 'OPEN',
  String? completedAt,
  User assignee = rep,
  User createdBy = rep,
  String? reminderAt,
  Map<String, Object?>? record = const {
    'type': 'LEAD',
    'id': 'lead-1',
    'name': 'Marcus Chen',
  },
}) {
  return {
    'id': id,
    'title': title,
    'description': description,
    'dueAt': dueAt,
    'status': status,
    'completedAt': completedAt,
    'assignee': {'id': assignee.id, 'name': assignee.name},
    'createdBy': {'id': createdBy.id, 'name': createdBy.name},
    'record': record,
    'reminderAt': reminderAt,
    'createdAt': '2026-09-30T09:00:00.000Z',
    'updatedAt': '2026-09-30T09:00:00.000Z',
  };
}

/// `GET /dashboard/me` with a little of everything.
Map<String, Object?> dashboardJson({
  int openLeads = 7,
  List<Map<String, Object?>>? tasksDue,
  List<Map<String, Object?>>? followUps,
  int overdue = 2,
}) {
  return {
    'openLeads': {
      'total': openLeads,
      'byStatus': [
        {'status': 'NEW', 'count': 4},
        {'status': 'CONTACTED', 'count': 2},
        {'status': 'QUALIFIED', 'count': 1},
      ],
    },
    'pipeline': {
      'totalValue': 84500,
      'stages': [
        {
          'stage': {'id': 'stage-1', 'name': 'Qualified', 'kind': 'OPEN'},
          'count': 2,
          'totalValue': 60000,
        },
        {
          'stage': {'id': 'stage-2', 'name': 'Proposal', 'kind': 'OPEN'},
          'count': 1,
          'totalValue': 24500,
        },
      ],
    },
    'tasks': {'overdue': overdue, 'today': 5, 'upcoming': 3},
    'tasksDue': tasksDue ?? [taskJson()],
    'followUps':
        followUps ??
        [
          {
            'type': 'LEAD',
            'id': 'lead-1',
            'name': 'Marcus Chen',
            'at': '2026-10-02T09:00:00.000Z',
            'note': 'Send the fleet pricing',
          },
        ],
    'wonThisMonth': {'count': 1, 'totalValue': 12000.5},
  };
}

/// A contact as the API answers it. Pass only what a test is about.
Map<String, Object?> contactJson({
  String id = 'contact-1',
  String firstName = 'Marcus',
  String lastName = 'Chen',
  String? jobTitle = 'Operations Director',
  String? email = 'marcus@northwind.example',
  String? phone = '+1 555 0100',
  Map<String, Object?>? company = const {
    'id': 'company-1',
    'name': 'Northwind Logistics',
  },
  String? notes,
  User owner = rep,
  Map<String, Object?>? convertedFromLead,
  String? lastContactAt,
  Map<String, Object?> customFields = const {},
}) {
  return {
    'id': id,
    'firstName': firstName,
    'lastName': lastName,
    'name': '$firstName $lastName',
    'jobTitle': jobTitle,
    'email': email,
    'phone': phone,
    'company': company,
    'notes': notes,
    'owner': {'id': owner.id, 'name': owner.name},
    'convertedFromLead': convertedFromLead,
    'lastContactAt': lastContactAt,
    'customFields': customFields,
    'createdAt': '2026-10-01T09:00:00.000Z',
    'updatedAt': '2026-10-05T09:00:00.000Z',
  };
}

/// A company as the API answers it. Pass only what a test is about.
Map<String, Object?> companyJson({
  String id = 'company-1',
  String name = 'Northwind Logistics',
  String? website = 'https://northwind.example/',
  String? industry = 'Logistics',
  String? phone = '+1 555 0199',
  String? address = '12 Harbour Road, Seattle',
  String? notes,
  User owner = rep,
  int contactCount = 2,
  Map<String, Object?> customFields = const {},
}) {
  return {
    'id': id,
    'name': name,
    'website': website,
    'industry': industry,
    'phone': phone,
    'address': address,
    'notes': notes,
    'owner': {'id': owner.id, 'name': owner.name},
    'contactCount': contactCount,
    'customFields': customFields,
    'createdAt': '2026-10-01T09:00:00.000Z',
    'updatedAt': '2026-10-05T09:00:00.000Z',
  };
}

/// A stage of the pipeline as an opportunity and a board column name it.
Map<String, Object?> stageJson({
  String id = 'stage-new',
  String name = 'New',
  String kind = 'OPEN',
}) {
  return {'id': id, 'name': name, 'kind': kind};
}

/// The pipeline of the tests, in order: three open stages, then Won and Lost.
final pipelineStages = [
  stageJson(),
  stageJson(id: 'stage-qualified', name: 'Qualified'),
  stageJson(id: 'stage-proposal', name: 'Proposal'),
  stageJson(id: 'stage-won', name: 'Won', kind: 'WON'),
  stageJson(id: 'stage-lost', name: 'Lost', kind: 'LOST'),
];

/// `GET /pipeline-stages`: [pipelineStages] with their positions and counts.
List<Map<String, Object?>> pipelineStagesJson() {
  return [
    for (final (index, stage) in pipelineStages.indexed)
      {...stage, 'position': index, 'opportunityCount': 0},
  ];
}

/// An opportunity as the API answers it. Pass only what a test is about. [stage] is one
/// of [pipelineStages]; the status follows it.
Map<String, Object?> opportunityJson({
  String id = 'opp-1',
  String name = 'Fleet renewal',
  num value = 48000,
  String? expectedCloseDate = '2026-11-15',
  Map<String, Object?>? stage,
  String? closeReason,
  String? closedAt,
  Map<String, Object?>? contact = const {
    'id': 'contact-1',
    'name': 'Marcus Chen',
  },
  Map<String, Object?>? company = const {
    'id': 'company-1',
    'name': 'Northwind Logistics',
  },
  String? notes,
  User owner = rep,
  Map<String, Object?>? convertedFromLead,
  String? lastContactAt,
  String? followUpAt,
  String? followUpNote,
  Map<String, Object?> customFields = const {},
}) {
  final inStage = stage ?? pipelineStages.first;
  return {
    'id': id,
    'name': name,
    'value': value,
    'expectedCloseDate': expectedCloseDate,
    'stage': inStage,
    'status': inStage['kind'],
    'closeReason': closeReason,
    'closedAt': closedAt,
    'contact': contact,
    'company': company,
    'notes': notes,
    'owner': {'id': owner.id, 'name': owner.name},
    'convertedFromLead': convertedFromLead,
    'lastContactAt': lastContactAt,
    'followUpAt': followUpAt,
    'followUpNote': followUpNote,
    'customFields': customFields,
    'createdAt': '2026-10-01T09:00:00.000Z',
    'updatedAt': '2026-10-05T09:00:00.000Z',
  };
}

/// `GET /opportunities/board`: one column per stage of [pipelineStages], holding the
/// [opportunities] that are in it. [counts] overrides a column's count by stage id (a
/// stage that holds more than the board carries).
List<Map<String, Object?>> boardJson(
  List<Map<String, Object?>> opportunities, {
  Map<String, int> counts = const {},
}) {
  return [
    for (final (index, stage) in pipelineStages.indexed)
      () {
        final cards = [
          for (final opportunity in opportunities)
            if ((opportunity['stage']! as Map)['id'] == stage['id'])
              opportunity,
        ];
        return {
          'stage': {...stage, 'position': index},
          'count': counts[stage['id']] ?? cards.length,
          'totalValue': cards.fold<num>(
            0,
            (sum, card) => sum + (card['value']! as num),
          ),
          'opportunities': cards,
        };
      }(),
  ];
}

/// A notification as the API answers it. Unread unless [readAt] is given.
Map<String, Object?> notificationJson({
  String id = 'notification-1',
  String kind = 'TASK_REMINDER',
  String title = 'Reminder: Send revised pricing',
  String? body = 'The fleet pricing, with the volume discount.',
  String link = '/tasks?open=task-1',
  String? readAt,
  String createdAt = '2026-10-05T09:00:00.000Z',
}) {
  return {
    'id': id,
    'kind': kind,
    'title': title,
    'body': body,
    'link': link,
    'readAt': readAt,
    'createdAt': createdAt,
  };
}

/// The figures of one person, or of the totals, in `GET /dashboard/team`.
Map<String, Object?> teamFiguresJson({
  int leadsCreated = 4,
  int leadsHandled = 3,
  int conversationsLogged = 9,
  int opportunitiesWon = 1,
  int opportunitiesLost = 0,
  num wonValue = 12000,
  num openPipelineValue = 84500,
  int overdueTasks = 2,
}) {
  return {
    'leadsCreated': leadsCreated,
    'leadsHandled': leadsHandled,
    'conversationsLogged': conversationsLogged,
    'opportunitiesWon': opportunitiesWon,
    'opportunitiesLost': opportunitiesLost,
    'wonValue': wonValue,
    'openPipelineValue': openPipelineValue,
    'overdueTasks': overdueTasks,
  };
}

/// One person's row of `GET /dashboard/team`.
Map<String, Object?> teamRepJson(
  User user, {
  bool active = true,
  Map<String, Object?>? figures,
}) {
  return {
    'user': {
      'id': user.id,
      'name': user.name,
      'role': user.role.apiValue,
      'active': active,
    },
    ...figures ?? teamFiguresJson(),
  };
}

/// `GET /dashboard/team`: the manager and the rep, unless [reps] says otherwise.
Map<String, Object?> teamDashboardJson({
  List<Map<String, Object?>>? reps,
  Map<String, Object?>? totals,
  String from = '2026-10-01',
  String to = '2026-10-13',
}) {
  return {
    'range': {'from': from, 'to': to},
    'totals': totals ?? teamFiguresJson(leadsCreated: 6, wonValue: 30000),
    'reps':
        reps ??
        [
          teamRepJson(rep),
          teamRepJson(
            manager,
            figures: teamFiguresJson(leadsCreated: 2, wonValue: 18000),
          ),
        ],
  };
}

/// An entry of the activity feed: a timeline entry (`entryJson`) and the record it is on.
Map<String, Object?> activityJson({
  String id = 'entry-1',
  String kind = 'CONVERSATION',
  String? conversationType = 'CALL',
  String? body = 'Talked through the fleet pricing.',
  Map<String, Object?>? details,
  String occurredAt = '2026-10-05T09:30:00.000Z',
  User author = rep,
  Map<String, Object?> record = const {
    'type': 'LEAD',
    'id': 'lead-1',
    'name': 'Marcus Chen',
  },
}) {
  return {
    ...entryJson(
      id: id,
      kind: kind,
      conversationType: conversationType,
      body: body,
      details: details,
      occurredAt: occurredAt,
      author: author,
    ),
    'record': record,
  };
}
