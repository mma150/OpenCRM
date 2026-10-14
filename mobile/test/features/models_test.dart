import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/features/custom_fields/custom_fields.dart';
import 'package:opencrm/features/home/dashboard.dart';
import 'package:opencrm/features/leads/lead.dart';
import 'package:opencrm/features/leads/leads_api.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_entry.dart';
import 'package:opencrm/features/timeline/timeline_labels.dart';

import '../support/fixtures.dart';

TimelineEntry _entry({
  String kind = 'STATUS_CHANGE',
  String? conversationType,
  String? body,
  Map<String, Object?>? details,
}) {
  return TimelineEntry.fromJson(
    asMap(
      entryJson(
        kind: kind,
        conversationType: conversationType,
        body: body,
        details: details,
      ),
    ),
  );
}

void main() {
  group('User', () {
    test('reads the API answer', () {
      final user = User.fromJson(asMap(userJson(manager)));

      expect(user.id, 'user-manager');
      expect(user.role, Role.salesManager);
      expect(user.role.label, 'Sales Manager');
      expect(user.firstName, 'Sarah');
    });

    test('fails on a missing field', () {
      expect(() => User.fromJson({'id': 'x'}), throwsFormatException);
    });
  });

  group('Lead', () {
    test('reads every field, with dates in local time', () {
      final lead = Lead.fromJson(
        asMap(
          leadJson(
            status: 'LOST',
            lostReason: 'CHOSE_COMPETITOR',
            lostNote: 'Went with Acme',
            lostAt: '2026-10-04T10:00:00.000Z',
            lastContactAt: '2026-10-03T10:00:00.000Z',
            followUpAt: '2026-10-20T10:00:00.000Z',
            followUpNote: 'Call back',
            estimatedValue: 1250.5,
            customFields: {'field-1': 'Gold', 'field-2': 12, 'field-3': null},
          ),
        ),
      );

      expect(lead.name, 'Marcus Chen');
      expect(lead.status, LeadStatus.lost);
      expect(lead.status.isOpen, false);
      expect(lead.source, LeadSource.referral);
      expect(lead.owner.name, 'Riley Rep');
      expect(lead.estimatedValue, 1250.5);
      expect(lead.lostReason, LostReason.choseCompetitor);
      expect(lead.lostAt?.toUtc(), DateTime.utc(2026, 10, 4, 10));
      expect(lead.followUpAt?.isUtc, false);
      expect(lead.customFields, {
        'field-1': 'Gold',
        'field-2': 12,
        'field-3': null,
      });
      expect(lead.isConverted, false);
    });

    test('reads what a converted lead became, leaving out what the reader may not see', () {
      final lead = Lead.fromJson(
        asMap(
          leadJson(
            status: 'CONVERTED',
            convertedAt: '2026-10-06T10:00:00.000Z',
            convertedTo: {
              'contact': {'id': 'contact-1', 'name': 'Marcus Chen'},
              'company': null,
              'opportunity': {'id': 'opp-1', 'name': 'Fleet deal'},
            },
          ),
        ),
      );

      expect(lead.isConverted, true);
      expect(lead.convertedContact?.name, 'Marcus Chen');
      expect(lead.convertedCompany, isNull);
      expect(lead.convertedOpportunity?.id, 'opp-1');
    });

    test('reads nulls for everything optional', () {
      final lead = Lead.fromJson(
        asMap(
          leadJson(
            company: null,
            jobTitle: null,
            email: null,
            phone: null,
            estimatedValue: null,
          ),
        ),
      );

      expect(lead.company, isNull);
      expect(lead.estimatedValue, isNull);
      expect(lead.lostReason, isNull);
      expect(lead.convertedContact, isNull);
    });

    test('refuses a status it does not know rather than guessing', () {
      expect(
        () => Lead.fromJson(asMap(leadJson(status: 'ARCHIVED'))),
        throwsFormatException,
      );
    });

    test('LeadInput trims, and sends an empty text as null', () {
      const input = LeadInput(
        firstName: ' Marcus ',
        lastName: 'Chen',
        source: LeadSource.coldCall,
        company: '  ',
        email: ' marcus@example.com ',
        estimatedValue: 48000,
      );

      expect(input.toJson(), {
        'firstName': 'Marcus',
        'lastName': 'Chen',
        'source': 'COLD_CALL',
        'company': null,
        'jobTitle': null,
        'email': 'marcus@example.com',
        'phone': null,
        'estimatedValue': 48000,
        'notes': null,
      });
    });

    test('LeadsQuery becomes the list query of the API', () {
      const query = LeadsQuery(
        search: 'north',
        status: LeadStatus.contacted,
        sort: LeadSort.name,
      );

      expect(query.toListQuery(2).toQuery(), {
        'page': '2',
        'pageSize': '25',
        'search': 'north',
        'sort': 'name',
        'order': 'asc',
        'status': 'CONTACTED',
      });
      expect(const LeadsQuery().toListQuery(1).toQuery(), {
        'page': '1',
        'pageSize': '25',
        'sort': 'createdAt',
        'order': 'desc',
      });
    });
  });

  group('RecordRef', () {
    test('names the routes of each kind of record, and equals by value', () {
      expect(const RecordRef(RecordType.lead, 'a').apiPath, '/leads/a');
      expect(const RecordRef(RecordType.company, 'b').apiPath, '/companies/b');
      expect(
        const RecordRef(RecordType.opportunity, 'c').apiPath,
        '/opportunities/c',
      );
      expect(
        const RecordRef(RecordType.lead, 'a'),
        const RecordRef(RecordType.lead, 'a'),
      );
      expect(
        const RecordRef(RecordType.lead, 'a') ==
            const RecordRef(RecordType.contact, 'a'),
        false,
      );
    });
  });

  group('timeline entries', () {
    String title(TimelineEntry entry) => entryTitle(entry, RecordType.lead);

    test(
      'a conversation is titled by how it happened, with what was discussed',
      () {
        final entry = _entry(
          kind: 'CONVERSATION',
          conversationType: 'MEETING',
          body: 'Met at the depot.',
        );

        expect(entry.kind, TimelineKind.conversation);
        expect(title(entry), 'Meeting');
        expect(entryText(entry), 'Met at the depot.');
      },
    );

    test('a note', () {
      final entry = _entry(kind: 'NOTE', body: 'Prefers email.');

      expect(title(entry), 'Note');
      expect(entryText(entry), 'Prefers email.');
    });

    test('created, also from a lead', () {
      expect(title(_entry(kind: 'CREATED')), 'Lead created');
      expect(
        entryTitle(
          _entry(
            kind: 'CREATED',
            details: {
              'fromLead': {'id': 'lead-1', 'name': 'Marcus Chen'},
            },
          ),
          RecordType.contact,
        ),
        'Contact created from lead Marcus Chen',
      );
    });

    test('a status change says both statuses in words', () {
      final entry = _entry(details: {'from': 'NEW', 'to': 'CONTACTED'});

      expect(title(entry), 'Status changed: New → Contacted');
      expect(entryText(entry), isNull);
    });

    test('marked as lost says why, with the note under it', () {
      final entry = _entry(
        details: {
          'from': 'QUALIFIED',
          'to': 'LOST',
          'reason': 'CHOSE_COMPETITOR',
          'note': 'Went with Acme',
        },
      );

      expect(title(entry), 'Marked as lost — Chose competitor');
      expect(entryText(entry), 'Went with Acme');
      expect(
        title(
          _entry(details: {'from': 'LOST', 'to': 'LOST', 'reason': 'PRICE'}),
        ),
        'Lost reason updated — Price',
      );
    });

    test('converted and reopened', () {
      expect(
        title(_entry(details: {'from': 'QUALIFIED', 'to': 'CONVERTED'})),
        'Converted',
      );
      expect(
        title(_entry(details: {'from': 'LOST', 'to': 'NEW'})),
        'Status changed: Lost → New',
      );
    });

    test("an opportunity's stage change uses the stage names as they are", () {
      expect(
        title(
          _entry(
            details: {
              'from': 'Qualified',
              'to': 'Proposal',
              'fromKind': 'OPEN',
              'toKind': 'OPEN',
            },
          ),
        ),
        'Stage changed: Qualified → Proposal',
      );
      final won = _entry(
        details: {
          'from': 'Proposal',
          'to': 'Won',
          'fromKind': 'OPEN',
          'toKind': 'WON',
          'reason': 'Signed for three years',
        },
      );
      expect(title(won), 'Closed as won');
      expect(entryText(won), 'Signed for three years');
      expect(
        title(
          _entry(
            details: {
              'from': 'Lost',
              'to': 'Qualified',
              'fromKind': 'LOST',
              'toKind': 'OPEN',
            },
          ),
        ),
        'Reopened in Qualified',
      );
    });

    test('an assignment names both owners', () {
      expect(
        title(
          _entry(
            kind: 'ASSIGNMENT',
            details: {
              'fromOwner': {'id': 'a', 'name': 'Ada'},
              'toOwner': {'id': 'b', 'name': 'Rob'},
            },
          ),
        ),
        'Reassigned from Ada to Rob',
      );
    });

    test('an email, a quote and an invoice', () {
      expect(
        title(
          _entry(
            kind: 'EMAIL',
            body: 'Hello',
            details: {'subject': 'Our proposal'},
          ),
        ),
        'Email sent: Our proposal',
      );
      expect(
        title(
          _entry(
            kind: 'QUOTE_STATUS',
            details: {
              'quote': {'id': 'q', 'number': 'Q-0001'},
              'from': 'DRAFT',
              'to': 'SENT',
              'total': 4360.87,
            },
          ),
        ),
        r'Quote Q-0001 sent · $4,360.87',
      );
      expect(
        title(
          _entry(
            kind: 'INVOICE_STATUS',
            details: {
              'invoice': {'id': 'i', 'number': 'INV-0001'},
              'from': 'SENT',
              'to': 'PAID',
              'total': 100,
            },
          ),
        ),
        'Invoice INV-0001 marked paid',
      );
    });

    test('a kind a newer server writes is shown, not dropped', () {
      final entry = _entry(kind: 'SOMETHING_NEW');

      expect(entry.kind, TimelineKind.unknown);
      expect(title(entry), 'Update');
    });

    test('humanize', () {
      expect(humanize('CHOSE_COMPETITOR'), 'Chose competitor');
      expect(humanize('NEW'), 'New');
      expect(humanize(''), '');
    });
  });

  group('MyDashboard', () {
    test('reads the figures, the tasks and the follow-ups', () {
      final dashboard = MyDashboard.fromJson(asMap(dashboardJson()));

      expect(dashboard.openLeads, 7);
      expect(dashboard.openLeadsByStatus, {
        LeadStatus.newLead: 4,
        LeadStatus.contacted: 2,
        LeadStatus.qualified: 1,
      });
      expect(dashboard.pipelineValue, 84500);
      expect(dashboard.pipelineStages.map((stage) => stage.name), [
        'Qualified',
        'Proposal',
      ]);
      expect(dashboard.tasksOverdue, 2);
      expect(dashboard.tasksToday, 5);
      expect(dashboard.tasksDue.single.title, 'Send revised pricing');
      expect(dashboard.tasksDue.single.record?.name, 'Marcus Chen');
      expect(dashboard.followUps.single.isLead, true);
      expect(dashboard.wonThisMonthValue, 12000.5);
    });
  });

  group('CustomField', () {
    test('writes a value by its type', () {
      const text = CustomField(id: 'a', label: 'Tier', type: 'DROPDOWN');
      const number = CustomField(id: 'b', label: 'Fleet size', type: 'NUMBER');
      const date = CustomField(id: 'c', label: 'Renewal', type: 'DATE');

      expect(text.format('Gold'), 'Gold');
      expect(number.format(12500.5), '12,500.5');
      expect(date.format('2026-11-15'), 'Nov 15, 2026');
      expect(date.format(null), isNull);
    });
  });
}
