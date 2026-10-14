import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/features/opportunities/opportunities_api.dart';
import 'package:opencrm/features/opportunities/opportunity.dart';
import 'package:opencrm/features/opportunities/opportunity_form_screen.dart';
import 'package:opencrm/features/pipeline_stages/pipeline_stages.dart';

import '../../support/fixtures.dart';

Opportunity _opportunity({
  String id = 'opp-1',
  num value = 48000,
  Map<String, Object?>? stage,
  Map<String, Object?>? company = const {
    'id': 'company-1',
    'name': 'Northwind',
  },
  String? notes,
}) {
  return Opportunity.fromJson(
    opportunityJson(
      id: id,
      value: value,
      stage: stage,
      company: company,
      notes: notes,
    ),
  );
}

List<BoardColumn> _board(List<Map<String, Object?>> cards) {
  return readList(boardJson(cards), BoardColumn.fromJson);
}

void main() {
  group('Stage', () {
    test('reads a stage and the words for its kind', () {
      final stages = readList(pipelineStagesJson(), Stage.fromJson);

      expect(stages.map((stage) => stage.name), [
        'New',
        'Qualified',
        'Proposal',
        'Won',
        'Lost',
      ]);
      expect(stages.map((stage) => stage.kind.label), [
        'Open',
        'Open',
        'Open',
        'Won',
        'Lost',
      ]);
      expect(openStages(stages).map((stage) => stage.id), [
        'stage-new',
        'stage-qualified',
        'stage-proposal',
      ]);
    });

    test('refuses a kind it does not know rather than guessing', () {
      expect(
        () => Stage.fromJson(stageJson(kind: 'PAUSED')),
        throwsFormatException,
      );
    });
  });

  group('Opportunity', () {
    test('reads every field, with moments in local time', () {
      final opportunity = Opportunity.fromJson(
        opportunityJson(
          stage: pipelineStages[3],
          value: 1250.5,
          closeReason: 'Best price',
          closedAt: '2026-10-04T10:00:00.000Z',
          notes: 'Renewal of the fleet contract.',
          owner: manager,
          convertedFromLead: {'id': 'lead-1', 'name': 'Marcus Chen'},
          lastContactAt: '2026-10-03T10:00:00.000Z',
          followUpAt: '2026-11-15T09:30:00.000Z',
          followUpNote: 'Send the contract',
          customFields: {'field-1': 'Gold'},
        ),
      );

      expect(opportunity.id, 'opp-1');
      expect(opportunity.name, 'Fleet renewal');
      expect(opportunity.value, 1250.5);
      expect(opportunity.expectedCloseDate, '2026-11-15');
      expect(opportunity.stage.name, 'Won');
      expect(opportunity.status, StageKind.won);
      expect(opportunity.isOpen, false);
      expect(opportunity.closeReason, 'Best price');
      expect(opportunity.closedAt, DateTime.utc(2026, 10, 4, 10).toLocal());
      expect(opportunity.closedAt!.isUtc, false);
      expect(opportunity.contact!.name, 'Marcus Chen');
      expect(opportunity.company!.id, 'company-1');
      expect(opportunity.notes, 'Renewal of the fleet contract.');
      expect(opportunity.owner.name, 'Sarah Jenkins');
      expect(opportunity.convertedFromLead!.id, 'lead-1');
      expect(
        opportunity.lastContactAt,
        DateTime.utc(2026, 10, 3, 10).toLocal(),
      );
      expect(
        opportunity.followUpAt,
        DateTime.utc(2026, 11, 15, 9, 30).toLocal(),
      );
      expect(opportunity.followUpNote, 'Send the contract');
      expect(opportunity.customFields, {'field-1': 'Gold'});
      expect(opportunity.createdAt, DateTime.utc(2026, 10, 1, 9).toLocal());
    });

    test('reads nulls for everything optional', () {
      final opportunity = Opportunity.fromJson(
        opportunityJson(
          value: 0,
          expectedCloseDate: null,
          contact: null,
          company: null,
        ),
      );

      expect(opportunity.value, 0);
      expect(opportunity.expectedCloseDate, isNull);
      expect(opportunity.contact, isNull);
      expect(opportunity.company, isNull);
      expect(opportunity.closeReason, isNull);
      expect(opportunity.closedAt, isNull);
      expect(opportunity.convertedFromLead, isNull);
      expect(opportunity.followUpAt, isNull);
      expect(opportunity.isOpen, true);
    });

    test('fails on a missing field and on a status it does not know', () {
      expect(
        () => Opportunity.fromJson(opportunityJson()..remove('name')),
        throwsFormatException,
      );
      expect(
        () => Opportunity.fromJson(opportunityJson()..['status'] = 'PAUSED'),
        throwsFormatException,
      );
    });

    test('an outcome belongs to the Won and the Lost stage only', () {
      expect(CloseOutcome.ofKind(StageKind.won), CloseOutcome.won);
      expect(CloseOutcome.ofKind(StageKind.lost), CloseOutcome.lost);
      expect(CloseOutcome.ofKind(StageKind.open), isNull);
    });
  });

  group('the board', () {
    test('reads a column with its count, total and cards', () {
      final columns = readList(
        boardJson(
          [opportunityJson(), opportunityJson(id: 'opp-2', value: 2000.5)],
          counts: {'stage-new': 132},
        ),
        BoardColumn.fromJson,
      );

      expect(columns, hasLength(5));
      expect(columns.first.stage.name, 'New');
      expect(columns.first.count, 132);
      expect(columns.first.totalValue, 50000.5);
      expect(columns.first.opportunities, hasLength(2));
      expect(columns.first.isCapped, true);
      expect(columns[1].isCapped, false);
    });

    test('placing a card moves it, with the counts and totals', () {
      final card = _opportunity();
      final qualified = Stage.fromJson(pipelineStages[1]);
      final before = _board([
        opportunityJson(),
        opportunityJson(id: 'opp-2', value: 1000),
        opportunityJson(id: 'opp-3', value: 500, stage: pipelineStages[1]),
      ]);

      final after = placeCard(before, card.inStage(qualified));

      expect(after[0].opportunities.map((card) => card.id), ['opp-2']);
      expect(after[0].count, 1);
      expect(after[0].totalValue, 1000);
      // The moved card is the most recently changed: first in its new stage.
      expect(after[1].opportunities.map((card) => card.id), ['opp-1', 'opp-3']);
      expect(after[1].opportunities.first.stage.name, 'Qualified');
      expect(after[1].count, 2);
      expect(after[1].totalValue, 48500);
      expect(after[2].count, 0);

      // Undoing it puts the card back where it was.
      final undone = placeCard(after, card);
      expect(undone[0].opportunities.map((card) => card.id), [
        'opp-1',
        'opp-2',
      ]);
      expect(undone[0].totalValue, 49000);
      expect(undone[1].opportunities.map((card) => card.id), ['opp-3']);
      expect(undone[1].totalValue, 500);
    });

    test('a card is put back at the place it had', () {
      final before = _board([
        opportunityJson(id: 'opp-0'),
        opportunityJson(),
        opportunityJson(id: 'opp-2'),
      ]);
      final moved = placeCard(
        before,
        _opportunity().inStage(Stage.fromJson(pipelineStages[2])),
      );

      final undone = placeCard(moved, _opportunity(), index: 1);

      expect(undone[0].opportunities.map((card) => card.id), [
        'opp-0',
        'opp-1',
        'opp-2',
      ]);
    });

    test('a card the board does not carry still moves the counts', () {
      // More than 50 in a stage: the card comes from the server's answer only.
      final before = _board([]);

      final after = placeCard(before, _opportunity(stage: pipelineStages[3]));

      expect(after[3].count, 1);
      expect(after[3].totalValue, 48000);
      expect(after[0].count, 0);
    });
  });

  group('OpportunityInput', () {
    test('a new opportunity sends what was filled in, trimmed', () {
      expect(const OpportunityInput(name: '  Fleet renewal ').toCreateJson(), {
        'name': 'Fleet renewal',
      });
      expect(
        const OpportunityInput(
          name: 'Fleet renewal',
          value: 48000.5,
          expectedCloseDate: '2026-11-15',
          stageId: 'stage-proposal',
          companyId: 'company-1',
          contactId: 'contact-1',
          notes: ' Renewal. ',
        ).toCreateJson(),
        {
          'name': 'Fleet renewal',
          'value': 48000.5,
          'expectedCloseDate': '2026-11-15',
          'stageId': 'stage-proposal',
          'companyId': 'company-1',
          'contactId': 'contact-1',
          'notes': 'Renewal.',
        },
      );
    });

    test('an edit sends only what changed', () {
      final opportunity = _opportunity(notes: 'Renewal.');
      const same = OpportunityInput(
        name: 'Fleet renewal',
        value: 48000,
        expectedCloseDate: '2026-11-15',
        companyId: 'company-1',
        contactId: 'contact-1',
        notes: 'Renewal.',
      );

      expect(same.changesFrom(opportunity), isEmpty);
      expect(
        const OpportunityInput(
          name: 'Fleet renewal 2027',
          // An emptied value is 0; an emptied date, link or note is null.
          contactId: 'contact-2',
        ).changesFrom(opportunity),
        {
          'name': 'Fleet renewal 2027',
          'value': 0,
          'expectedCloseDate': null,
          'companyId': null,
          'contactId': 'contact-2',
          'notes': null,
        },
      );
    });

    test('a company the reader may not see is left alone', () {
      // The API answers null for it; the form then holds none, and sends nothing.
      final opportunity = _opportunity(company: null);
      const input = OpportunityInput(
        name: 'Fleet renewal',
        value: 48000,
        expectedCloseDate: '2026-11-15',
        contactId: 'contact-1',
      );

      expect(input.changesFrom(opportunity), isEmpty);
    });

    test('a day is sent as the day that was picked', () {
      expect(toApiDay(DateTime(2026, 3, 5)), '2026-03-05');
      expect(toApiDay(DateTime(2026, 11, 15, 23, 59)), '2026-11-15');
    });
  });

  test('OpportunitiesQuery becomes the list query of the API', () {
    expect(const OpportunitiesQuery().toListQuery(1).toQuery(), {
      'page': '1',
      'pageSize': '25',
      'sort': 'createdAt',
      'order': 'desc',
    });
    expect(const OpportunitiesQuery().isFiltered, false);

    const query = OpportunitiesQuery(
      search: ' fleet ',
      stageId: 'stage-new',
      status: StageKind.open,
      sort: OpportunitySort.valueHighest,
    );
    expect(query.isFiltered, true);
    expect(query.toListQuery(2).toQuery(), {
      'page': '2',
      'pageSize': '25',
      'search': 'fleet',
      'sort': 'value',
      'order': 'desc',
      'stageId': 'stage-new',
      'status': 'OPEN',
    });
  });
}
