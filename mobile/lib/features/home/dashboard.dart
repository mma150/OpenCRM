import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/features/leads/lead.dart';
import 'package:opencrm/features/tasks/task.dart';

/// One open stage of the pipeline with the caller's open opportunities in it.
class PipelineStageFigures {
  const PipelineStageFigures({
    required this.name,
    required this.count,
    required this.totalValue,
  });

  factory PipelineStageFigures.fromJson(Json json) {
    return PipelineStageFigures(
      name: readString(asMap(json['stage']), 'name'),
      count: readInt(json, 'count'),
      totalValue: readDouble(json, 'totalValue'),
    );
  }

  final String name;
  final int count;
  final double totalValue;
}

/// A follow-up that is due: on a lead or on an opportunity.
class DashboardFollowUp {
  const DashboardFollowUp({
    required this.isLead,
    required this.id,
    required this.name,
    required this.at,
    required this.note,
  });

  factory DashboardFollowUp.fromJson(Json json) {
    return DashboardFollowUp(
      isLead: readString(json, 'type') == 'LEAD',
      id: readString(json, 'id'),
      name: readString(json, 'name'),
      at: readDate(json, 'at'),
      note: readStringOrNull(json, 'note'),
    );
  }

  final bool isLead;
  final String id;
  final String name;
  final DateTime at;
  final String? note;
}

/// `GET /dashboard/me`: the signed-in user's own work. The same for every role; a
/// Read-only user owns nothing and gets zeros.
class MyDashboard {
  const MyDashboard({
    required this.openLeads,
    required this.openLeadsByStatus,
    required this.pipelineValue,
    required this.pipelineStages,
    required this.tasksOverdue,
    required this.tasksToday,
    required this.tasksDue,
    required this.followUps,
    required this.wonThisMonthCount,
    required this.wonThisMonthValue,
  });

  factory MyDashboard.fromJson(Json json) {
    final openLeads = asMap(json['openLeads']);
    final pipeline = asMap(json['pipeline']);
    final tasks = asMap(json['tasks']);
    final won = asMap(json['wonThisMonth']);
    return MyDashboard(
      openLeads: readInt(openLeads, 'total'),
      openLeadsByStatus: {
        for (final row in asList(openLeads['byStatus']).map(asMap))
          LeadStatus.fromApi(readString(row, 'status')): readInt(row, 'count'),
      },
      pipelineValue: readDouble(pipeline, 'totalValue'),
      pipelineStages: readList(
        pipeline['stages'],
        PipelineStageFigures.fromJson,
      ),
      tasksOverdue: readInt(tasks, 'overdue'),
      tasksToday: readInt(tasks, 'today'),
      tasksDue: readList(json['tasksDue'], Task.fromJson),
      followUps: readList(json['followUps'], DashboardFollowUp.fromJson),
      wonThisMonthCount: readInt(won, 'count'),
      wonThisMonthValue: readDouble(won, 'totalValue'),
    );
  }

  final int openLeads;

  /// New, Contacted and Qualified, in that order.
  final Map<LeadStatus, int> openLeadsByStatus;
  final double pipelineValue;

  /// Every open stage, in pipeline order.
  final List<PipelineStageFigures> pipelineStages;
  final int tasksOverdue;
  final int tasksToday;

  /// Up to 10 open tasks that are overdue or due today, the longest overdue first.
  final List<Task> tasksDue;

  /// Up to 10 follow-ups due by the end of today, the longest overdue first.
  final List<DashboardFollowUp> followUps;
  final int wonThisMonthCount;
  final double wonThisMonthValue;
}
