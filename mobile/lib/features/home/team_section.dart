import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/home/dashboard_providers.dart';
import 'package:opencrm/features/home/team_dashboard.dart';

/// The Team section of Home, for an Admin, a Sales Manager and a Read-only user: what each person on the
/// team did in a range of days, as a card per person, with the totals. The cards are
/// sorted on the phone; the API sends the people by name.
///
/// **Mount it only for `role.seesTeamOverview`.** A Sales Rep is never asked for (the API
/// would answer `FORBIDDEN`), and `teamDashboardProvider` refuses to ask for them as well.
class TeamSection extends ConsumerStatefulWidget {
  const TeamSection({super.key});

  @override
  ConsumerState<TeamSection> createState() => _TeamSectionState();
}

class _TeamSectionState extends ConsumerState<TeamSection> {
  TeamRange _range = TeamRange.thisMonth;

  /// Null sorts by name, A to Z; a figure sorts the highest first.
  TeamFigure? _sort;

  Future<void> _chooseSort() async {
    // The sheet answers null when it is dismissed, so "by name" needs a value of its own.
    const byName = 'name';
    final choice = await showOptionsSheet<Object>(
      context,
      title: 'Sort team by',
      selected: _sort ?? byName,
      options: [
        const SheetOption(value: byName, label: 'Name (A to Z)'),
        for (final figure in TeamFigure.values)
          SheetOption(value: figure, label: '${figure.label} (highest first)'),
      ],
    );
    if (choice != null && mounted) {
      setState(() => _sort = choice is TeamFigure ? choice : null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = teamDashboardProvider(_range);
    final team = ref.watch(provider);
    final data = team.value;
    final text = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(header: true, child: Text('Team', style: text.titleLarge)),
        const SizedBox(height: 2),
        MutedText(
          data == null
              ? 'What each person on your team did.'
              : 'What each person did from ${formatDay(data.from)} to ${formatDay(data.to)}.',
        ),
        const SizedBox(height: AppSpacing.sm),
        FilterChipBar<TeamRange>(
          label: 'Date range',
          selected: _range,
          onSelected: (range) => setState(() => _range = range),
          options: [
            for (final range in TeamRange.values)
              FilterOption(value: range, label: range.label),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        if (team.hasError && !team.isLoading)
          Card(
            child: ErrorState(
              error: ApiError.from(team.error!),
              onRetry: () => ref.invalidate(provider),
              compact: true,
            ),
          )
        else if (data == null)
          const SkeletonList(label: 'Loading team figures', count: 2)
        else if (data.reps.isEmpty)
          const Card(
            child: EmptyState(
              icon: Icons.group_outlined,
              title: 'No one on your team yet',
              message: 'People show here once they are invited and, for a Sales Manager, added to the team.',
            ),
          )
        else ...[
          const MutedText(
            'Open pipeline and overdue tasks are as of now; every other figure covers the range.',
            small: true,
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _chooseSort,
              icon: const Icon(Icons.sort, size: 18),
              label: Text('Sort by: ${_sort?.label ?? 'Name'}'),
            ),
          ),
          for (final rep in data.sortedBy(_sort))
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: _FiguresCard(
                name: rep.name,
                caption: rep.active
                    ? rep.role.label
                    : '${rep.role.label} · Deactivated',
                figures: rep.figures,
              ),
            ),
          _FiguresCard(name: 'Total', figures: data.totals, strong: true),
        ],
      ],
    );
  }
}

/// One person, or the totals: a name and the eight figures, two to a row when they fit.
class _FiguresCard extends StatelessWidget {
  const _FiguresCard({
    required this.name,
    required this.figures,
    this.caption,
    this.strong = false,
  });

  final String name;

  /// Under the name: the person's role.
  final String? caption;
  final TeamFigures figures;

  /// The totals card: a quiet fill sets it apart from the people.
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    return Semantics(
      container: true,
      label: 'Team figures of $name',
      child: Card(
        color: strong ? colors.surfaceMuted : null,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
              if (caption != null) MutedText(caption!, small: true),
              const SizedBox(height: AppSpacing.md),
              LayoutBuilder(
                builder: (context, constraints) {
                  // Two figures side by side; one per row when large text would not fit.
                  final scale = MediaQuery.textScalerOf(context).scale(1);
                  final columns = constraints.maxWidth / scale < 260 ? 1 : 2;
                  final width =
                      (constraints.maxWidth - (columns - 1) * AppSpacing.md) /
                      columns;
                  return Wrap(
                    spacing: AppSpacing.md,
                    runSpacing: AppSpacing.md,
                    children: [
                      for (final figure in TeamFigure.values)
                        SizedBox(
                          width: width,
                          child: MergeSemantics(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                MutedText(figure.label, small: true),
                                // A large amount shrinks to its column rather than
                                // breaking over two lines.
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    figure.text(figures),
                                    maxLines: 1,
                                    style: text.bodyLarge?.copyWith(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
