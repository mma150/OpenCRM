import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/format/formatters.dart';

/// What one person, or the whole team, did in a range of days.
class TeamFigures {
  const TeamFigures({
    required this.leadsCreated,
    required this.leadsHandled,
    required this.conversationsLogged,
    required this.opportunitiesWon,
    required this.opportunitiesLost,
    required this.wonValue,
    required this.openPipelineValue,
    required this.overdueTasks,
  });

  factory TeamFigures.fromJson(Json json) {
    return TeamFigures(
      leadsCreated: readInt(json, 'leadsCreated'),
      leadsHandled: readInt(json, 'leadsHandled'),
      conversationsLogged: readInt(json, 'conversationsLogged'),
      opportunitiesWon: readInt(json, 'opportunitiesWon'),
      opportunitiesLost: readInt(json, 'opportunitiesLost'),
      wonValue: readDouble(json, 'wonValue'),
      openPipelineValue: readDouble(json, 'openPipelineValue'),
      overdueTasks: readInt(json, 'overdueTasks'),
    );
  }

  final int leadsCreated;
  final int leadsHandled;
  final int conversationsLogged;
  final int opportunitiesWon;
  final int opportunitiesLost;
  final double wonValue;

  /// As of now, whatever the range.
  final double openPipelineValue;

  /// As of now, whatever the range.
  final int overdueTasks;
}

/// The figures of the team section, in the order they are shown, with the web app's
/// labels. `money` ones are amounts.
enum TeamFigure {
  leadsCreated('Leads created'),
  leadsHandled('Leads handled'),
  conversationsLogged('Conversations logged'),
  opportunitiesWon('Won'),
  opportunitiesLost('Lost'),
  wonValue('Won value', money: true),
  openPipelineValue('Open pipeline', money: true),
  overdueTasks('Overdue tasks');

  const TeamFigure(this.label, {this.money = false});

  final String label;
  final bool money;

  num of(TeamFigures figures) {
    return switch (this) {
      TeamFigure.leadsCreated => figures.leadsCreated,
      TeamFigure.leadsHandled => figures.leadsHandled,
      TeamFigure.conversationsLogged => figures.conversationsLogged,
      TeamFigure.opportunitiesWon => figures.opportunitiesWon,
      TeamFigure.opportunitiesLost => figures.opportunitiesLost,
      TeamFigure.wonValue => figures.wonValue,
      TeamFigure.openPipelineValue => figures.openPipelineValue,
      TeamFigure.overdueTasks => figures.overdueTasks,
    };
  }

  /// The figure as it is shown: `12`, `$48,000`.
  String text(TeamFigures figures) {
    final value = of(figures);
    return money ? formatCurrency(value) : '$value';
  }
}

/// One person of the team with their figures.
class TeamRep {
  const TeamRep({
    required this.id,
    required this.name,
    required this.role,
    required this.active,
    required this.figures,
  });

  factory TeamRep.fromJson(Json json) {
    final user = asMap(json['user']);
    return TeamRep(
      id: readString(user, 'id'),
      name: readString(user, 'name'),
      role: Role.fromApi(readString(user, 'role')),
      active: readBool(user, 'active'),
      figures: TeamFigures.fromJson(json),
    );
  }

  final String id;
  final String name;
  final Role role;

  /// A deactivated person is listed only while one of their figures is not zero.
  final bool active;
  final TeamFigures figures;
}

/// `GET /dashboard/team`: a row per person the caller may see, and the totals. For Admins
/// and Sales Managers only; the API answers `FORBIDDEN` to everyone else.
class TeamDashboard {
  const TeamDashboard({
    required this.from,
    required this.to,
    required this.totals,
    required this.reps,
  });

  factory TeamDashboard.fromJson(Json json) {
    final range = asMap(json['range']);
    return TeamDashboard(
      from: readString(range, 'from'),
      to: readString(range, 'to'),
      totals: TeamFigures.fromJson(asMap(json['totals'])),
      reps: readList(json['reps'], TeamRep.fromJson),
    );
  }

  /// The first and last day the figures cover (`2026-10-01`), as the API repeats them.
  final String from;
  final String to;
  final TeamFigures totals;

  /// In name order.
  final List<TeamRep> reps;

  /// The people ordered by [figure], the highest first; by name (the API's order) when it
  /// is null. People with the same figure stay in name order.
  List<TeamRep> sortedBy(TeamFigure? figure) {
    if (figure == null) {
      return reps;
    }
    final order = {for (final (index, rep) in reps.indexed) rep.id: index};
    return [...reps]..sort((a, b) {
      final byFigure = figure.of(b.figures).compareTo(figure.of(a.figures));
      return byFigure != 0 ? byFigure : order[a.id]!.compareTo(order[b.id]!);
    });
  }
}

String _day(DateTime day) {
  final month = day.month.toString().padLeft(2, '0');
  final date = day.day.toString().padLeft(2, '0');
  return '${day.year}-$month-$date';
}

/// The date ranges of the team section. "This month" is the default.
enum TeamRange {
  thisMonth('This month'),
  lastMonth('Last month'),
  last7Days('Last 7 days'),
  last30Days('Last 30 days');

  const TeamRange(this.label);

  final String label;

  /// The first and last day the range covers, as the days the API takes (`2026-10-05`,
  /// both included), on this device's calendar.
  ({String from, String to}) days({DateTime? now}) {
    final today = now ?? DateTime.now();
    final year = today.year;
    final month = today.month;
    final to = _day(today);
    return switch (this) {
      TeamRange.thisMonth => (from: _day(DateTime(year, month)), to: to),
      TeamRange.lastMonth => (
        from: _day(DateTime(year, month - 1)),
        // Day 0 of this month is the last day of the one before.
        to: _day(DateTime(year, month, 0)),
      ),
      TeamRange.last7Days => (
        from: _day(DateTime(year, month, today.day - 6)),
        to: to,
      ),
      TeamRange.last30Days => (
        from: _day(DateTime(year, month, today.day - 29)),
        to: to,
      ),
    };
  }
}
