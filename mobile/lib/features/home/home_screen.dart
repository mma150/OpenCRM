import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/home/dashboard.dart';
import 'package:opencrm/features/home/dashboard_providers.dart';
import 'package:opencrm/features/home/team_section.dart';
import 'package:opencrm/features/leads/lead.dart';
import 'package:opencrm/features/leads/leads_providers.dart';
import 'package:opencrm/features/opportunities/opportunities_providers.dart';
import 'package:opencrm/features/pipeline_stages/pipeline_stages.dart';
import 'package:opencrm/features/tasks/task.dart';
import 'package:opencrm/features/tasks/task_row.dart';
import 'package:opencrm/features/tasks/task_sheet.dart';
import 'package:opencrm/features/tasks/tasks_providers.dart';

/// Home: the greeting, then the signed-in user's own work from `GET /dashboard/me`.
/// The greeting never waits for the figures; if they fail to load, an error with Retry
/// takes their place and the rest of the screen stays.
///
/// A section with its own request (the team dashboard, later) is another widget in the
/// list below with its own provider, so one failing does not hide the other.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final text = Theme.of(context).textTheme;
    return AppScaffold(
      title: 'Home',
      body: RefreshIndicator(
        // Keeps the figures on screen until the new ones arrive.
        onRefresh: () {
          // The Team section has its own request; it loads again with the figures.
          if (user.role.seesTeamOverview) {
            ref.invalidate(teamDashboardProvider);
          }
          return ref
              .refresh(dashboardProvider.future)
              .then((_) {}, onError: (_) {});
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(AppSpacing.page),
          children: [
            Semantics(
              header: true,
              child: Text(
                '${greeting()}, ${user.firstName}',
                style: text.headlineSmall,
              ),
            ),
            const SizedBox(height: 2),
            MutedText('${user.role.label} · ${formatLongDay(DateTime.now())}'),
            const SizedBox(height: AppSpacing.lg),
            const _MyWork(),
            // Not a Sales Rep: they are never asked for the team.
            if (user.role.seesTeamOverview) ...[
              const SizedBox(height: AppSpacing.xl),
              const TeamSection(),
            ],
          ],
        ),
      ),
    );
  }
}

/// The sections that come from `GET /dashboard/me`.
class _MyWork extends ConsumerWidget {
  const _MyWork();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(dashboardProvider);
    final data = dashboard.value;
    // A refresh keeps showing the figures it already has.
    if (data != null) {
      return _Sections(data);
    }
    if (dashboard.hasError) {
      return Card(
        child: ErrorState(
          error: ApiError.from(dashboard.error!),
          onRetry: () => ref.invalidate(dashboardProvider),
        ),
      );
    }
    return const SkeletonList(label: 'Loading your dashboard');
  }
}

class _Sections extends StatelessWidget {
  const _Sections(this.data);

  final MyDashboard data;

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(height: AppSpacing.lg);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StatTiles(data),
        gap,
        _TasksDue(data.tasksDue),
        gap,
        _FollowUpsDue(data.followUps),
        gap,
        _PipelineByStage(data),
        gap,
        _OpenLeadsByStatus(data),
      ],
    );
  }
}

/// Home's figures are the user's own. An Admin or a Sales Manager sees other people's
/// records too, so the list a figure opens is narrowed to their own, as on the web; for
/// everyone else the list already is.
String? _mine(WidgetRef ref) {
  final me = ref.read(currentUserProvider);
  return me.role.seesTeam ? me.id : null;
}

/// Opens the leads a figure counts.
void _openLeads(BuildContext context, WidgetRef ref, {LeadStatus? status}) {
  ref
      .read(leadsQueryProvider.notifier)
      .show(status: status, ownerId: _mine(ref));
  context.go(Routes.leads);
}

/// Opens the opportunities a figure counts: the pipeline, or the list of one stage or
/// status.
void _openOpportunities(
  BuildContext context,
  WidgetRef ref, {
  String? stageId,
  StageKind? status,
}) {
  ref
      .read(opportunitiesQueryProvider.notifier)
      .show(stageId: stageId, status: status, ownerId: _mine(ref));
  ref
      .read(opportunitiesViewProvider.notifier)
      .show(
        stageId == null && status == null
            ? OpportunitiesView.pipeline
            : OpportunitiesView.list,
      );
  context.go(Routes.opportunities);
}

class _StatTiles extends ConsumerWidget {
  const _StatTiles(this.data);

  final MyDashboard data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tiles = [
      _StatTile(
        label: 'Open leads',
        value: '${data.openLeads}',
        onTap: () => _openLeads(context, ref),
      ),
      _StatTile(
        label: 'Pipeline value',
        value: formatCurrency(data.pipelineValue),
        onTap: () => _openOpportunities(context, ref),
      ),
      _StatTile(
        label: 'Tasks due today',
        value: '${data.tasksToday}',
        onTap: () => context.go(Routes.tasksDue(DueGroup.today.apiValue)),
      ),
      _StatTile(
        label: 'Overdue tasks',
        value: '${data.tasksOverdue}',
        // The colour supports the label; the number alone already says it.
        tone: data.tasksOverdue > 0 ? Tone.warning : null,
        onTap: () => context.go(Routes.tasksDue(DueGroup.overdue.apiValue)),
      ),
      _StatTile(
        label: 'Won this month',
        value: formatCurrency(data.wonThisMonthValue),
        hint: data.wonThisMonthCount == 1
            ? '1 opportunity'
            : '${data.wonThisMonthCount} opportunities',
        onTap: () => _openOpportunities(context, ref, status: StageKind.won),
      ),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        // Two tiles side by side; one per row when large text would not fit in half.
        final scale = MediaQuery.textScalerOf(context).scale(1);
        final columns = constraints.maxWidth / scale < 300 ? 1 : 2;
        final width =
            (constraints.maxWidth - (columns - 1) * AppSpacing.md) / columns;
        return Semantics(
          container: true,
          label: 'Your numbers',
          child: Wrap(
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.md,
            children: [
              for (final (index, tile) in tiles.indexed)
                SizedBox(
                  // The last tile of an odd count takes the whole row.
                  width:
                      columns == 2 &&
                          index == tiles.length - 1 &&
                          tiles.length.isOdd
                      ? constraints.maxWidth
                      : width,
                  child: tile,
                ),
            ],
          ),
        );
      },
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.value,
    this.hint,
    this.tone,
    this.onTap,
  });

  final String label;
  final String value;
  final String? hint;
  final Tone? tone;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final colors = tone == null ? null : context.colors.tone(tone!);
    return Semantics(
      container: true,
      button: onTap != null,
      label: '$label: $value${hint == null ? '' : ', $hint'}',
      excludeSemantics: true,
      // The InkWell's own tap is excluded with the rest, so a screen reader gets it here.
      onTap: onTap,
      child: Material(
        color: colors?.background ?? context.colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: AppSpacing.borderRadius,
          side: BorderSide(color: colors?.border ?? context.colors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: text.labelMedium?.copyWith(
                    color: colors?.foreground ?? context.colors.textMuted,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    value,
                    style: text.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: colors?.foreground,
                    ),
                  ),
                ),
                if (hint != null) MutedText(hint!, small: true),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The open tasks that are overdue or due today. Each has the checkbox of the Tasks tab
/// (`TaskRow`): ticking one off takes it out of the card at once, with Undo. A tap on a
/// title opens the task; "All tasks" leads to the Tasks tab.
class _TasksDue extends ConsumerWidget {
  const _TasksDue(this.tasks);

  final List<Task> tasks;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final due = stillOpen(tasks, ref.watch(completedTaskIdsProvider));
    return SectionCard(
      title: 'Tasks due',
      trailing: due.isEmpty ? null : StatusBadge(label: '${due.length}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (due.isEmpty)
            const MutedText(
              'Nothing is due today. Tasks that are overdue or due today show here.',
            )
          else
            for (final (index, task) in due.indexed) ...[
              if (index > 0) const Divider(height: AppSpacing.md),
              TaskRow(
                task: task,
                onOpen: () => showTaskSheet(context, task: task),
              ),
            ],
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => context.go(Routes.tasks),
              child: const Text('All tasks'),
            ),
          ),
        ],
      ),
    );
  }
}

class _FollowUpsDue extends StatelessWidget {
  const _FollowUpsDue(this.followUps);

  final List<DashboardFollowUp> followUps;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'Follow-ups due',
      trailing: followUps.isEmpty
          ? null
          : StatusBadge(label: '${followUps.length}'),
      child: followUps.isEmpty
          ? const MutedText(
              'No follow-ups are due. Set one on a lead to be reminded.',
            )
          : Column(
              children: [
                for (final (index, followUp) in followUps.indexed) ...[
                  if (index > 0) const Divider(height: AppSpacing.xl),
                  _FollowUpRow(followUp),
                ],
              ],
            ),
    );
  }
}

class _FollowUpRow extends StatelessWidget {
  const _FollowUpRow(this.followUp);

  final DashboardFollowUp followUp;

  @override
  Widget build(BuildContext context) {
    final overdue = followUp.at.isBefore(DateTime.now());
    final text = Theme.of(context).textTheme;
    final note = followUp.note;
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Flexible(
              child: Text(
                followUp.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            StatusBadge(label: followUp.isLead ? 'Lead' : 'Opportunity'),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          '${overdue ? 'Overdue · ' : 'Due '}${formatNearDateTime(followUp.at)}',
          style: text.bodySmall?.copyWith(
            color: overdue
                ? context.colors.tone(Tone.warning).foreground
                : context.colors.textMuted,
            fontWeight: overdue ? FontWeight.w600 : null,
          ),
        ),
        if (note != null && note.isNotEmpty)
          MutedText(note, maxLines: 2, small: true),
      ],
    );
    // A row opens the page of its lead or opportunity.
    return InkWell(
      onTap: () => context.go(
        followUp.isLead
            ? Routes.lead(followUp.id)
            : Routes.opportunity(followUp.id),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
        child: Row(
          children: [
            Expanded(child: content),
            Icon(Icons.chevron_right, color: context.colors.textMuted),
          ],
        ),
      ),
    );
  }
}

/// A label, a value in words, and a bar that shows the value's share of the largest one.
/// The number is always written out; the bar only makes the comparison quicker.
class _BarRow extends StatelessWidget {
  const _BarRow({
    required this.label,
    required this.value,
    required this.share,
  });

  final String label;
  final String value;

  /// 0 to 1.
  final double share;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return MergeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: AppSpacing.md,
            children: [
              Text(label, style: text.bodyMedium),
              Text(
                value,
                style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ExcludeSemantics(
            child: ClipRRect(
              borderRadius: const BorderRadius.all(Radius.circular(4)),
              child: LinearProgressIndicator(
                value: share.clamp(0, 1).toDouble(),
                minHeight: 8,
                backgroundColor: context.colors.surfaceMuted,
                color: context.colors.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PipelineByStage extends ConsumerWidget {
  const _PipelineByStage(this.data);

  final MyDashboard data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stages = data.pipelineStages;
    final largest = stages.fold<double>(
      0,
      (max, stage) => stage.totalValue > max ? stage.totalValue : max,
    );
    return SectionCard(
      title: 'Pipeline by stage',
      trailing: MutedText(formatCurrency(data.pipelineValue)),
      child: stages.isEmpty
          ? const MutedText('The pipeline has no open stages.')
          : Column(
              children: [
                for (final (index, stage) in stages.indexed)
                  Padding(
                    padding: EdgeInsets.only(
                      top: index == 0 ? 0 : AppSpacing.sm,
                    ),
                    // A row opens the list of that stage's opportunities.
                    child: InkWell(
                      borderRadius: AppSpacing.borderRadius,
                      onTap: () => _openOpportunities(
                        context,
                        ref,
                        stageId: stage.stageId,
                      ),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(
                          minHeight: AppSpacing.touchTarget,
                        ),
                        child: Center(
                          child: _BarRow(
                            label: stage.name,
                            value:
                                '${formatCurrency(stage.totalValue)} · ${stage.count} open',
                            share: largest == 0
                                ? 0
                                : stage.totalValue / largest,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _OpenLeadsByStatus extends ConsumerWidget {
  const _OpenLeadsByStatus(this.data);

  final MyDashboard data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final counts = data.openLeadsByStatus;
    final largest = counts.values.fold<int>(
      0,
      (max, count) => count > max ? count : max,
    );
    return SectionCard(
      title: 'Open leads by status',
      trailing: MutedText('${data.openLeads}'),
      child: Column(
        children: [
          for (final (index, status) in LeadStatus.open.indexed)
            Padding(
              padding: EdgeInsets.only(top: index == 0 ? 0 : AppSpacing.sm),
              // A row opens the Leads tab with that status chosen.
              child: InkWell(
                borderRadius: AppSpacing.borderRadius,
                onTap: () => _openLeads(context, ref, status: status),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    minHeight: AppSpacing.touchTarget,
                  ),
                  child: Center(
                    child: _BarRow(
                      label: status.label,
                      value: '${counts[status] ?? 0}',
                      share: largest == 0 ? 0 : (counts[status] ?? 0) / largest,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
