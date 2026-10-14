import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/paged_list_view.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/opportunities/opportunities_api.dart';
import 'package:opencrm/features/opportunities/opportunities_providers.dart';
import 'package:opencrm/features/opportunities/opportunity.dart';
import 'package:opencrm/features/opportunities/opportunity_board.dart';
import 'package:opencrm/features/pipeline_stages/pipeline_stages.dart';

/// Opportunities, reached from the More tab: the same records as a pipeline (one stage at
/// a time) or as a list (search, filters, a sort order, page by page). Which opportunities
/// those are is the API's decision (everyone's, the team's, or the user's own).
class OpportunitiesScreen extends ConsumerWidget {
  const OpportunitiesScreen({super.key});

  Future<void> _chooseSort(
    BuildContext context,
    WidgetRef ref,
    OpportunitySort current,
  ) async {
    final sort = await showOptionsSheet<OpportunitySort>(
      context,
      title: 'Sort opportunities',
      selected: current,
      options: [
        for (final sort in OpportunitySort.values)
          SheetOption(value: sort, label: sort.label),
      ],
    );
    if (sort != null) {
      ref.read(opportunitiesQueryProvider.notifier).sortBy(sort);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canWrite = ref.watch(currentUserProvider).role.canWriteRecords;
    final view = ref.watch(opportunitiesViewProvider);
    final sort = ref.watch(
      opportunitiesQueryProvider.select((query) => query.sort),
    );

    return AppScaffold(
      title: 'Opportunities',
      actions: [
        if (view == OpportunitiesView.list)
          IconButton(
            tooltip: 'Sort opportunities',
            icon: const Icon(Icons.sort),
            onPressed: () => _chooseSort(context, ref, sort),
          ),
        if (canWrite)
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.sm),
            // "New" and not "New opportunity": the title beside it must stay readable on
            // a narrow phone. The tooltip says the rest.
            child: Tooltip(
              message: 'New opportunity',
              child: FilledButton.icon(
                onPressed: () => context.go(Routes.newOpportunity),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('New'),
              ),
            ),
          ),
      ],
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.md,
              AppSpacing.page,
              AppSpacing.sm,
            ),
            child: Semantics(
              container: true,
              label: 'View',
              child: SegmentedButton<OpportunitiesView>(
                showSelectedIcon: false,
                segments: [
                  for (final view in OpportunitiesView.values)
                    ButtonSegment(value: view, label: Text(view.label)),
                ],
                selected: {view},
                onSelectionChanged: (selection) => ref
                    .read(opportunitiesViewProvider.notifier)
                    .show(selection.first),
              ),
            ),
          ),
          Expanded(
            child: switch (view) {
              OpportunitiesView.pipeline => const OpportunityBoard(),
              OpportunitiesView.list => const _OpportunityList(),
            },
          ),
        ],
      ),
    );
  }
}

/// The list view: search, the stage and status filters, and the opportunities page by
/// page.
class _OpportunityList extends ConsumerWidget {
  const _OpportunityList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(currentUserProvider);
    final canWrite = me.role.canWriteRecords;
    final query = ref.watch(opportunitiesQueryProvider);
    final opportunities = ref.watch(opportunitiesListProvider);
    final list = ref.read(opportunitiesListProvider.notifier);
    final filters = ref.read(opportunitiesQueryProvider.notifier);
    // The pipeline's stages for the filter. Until they arrive (or when they cannot be
    // read) the stages of the board do, so a stage chosen on the pipeline can be cleared.
    final stages =
        ref.watch(pipelineStagesProvider).value ??
        [
          for (final column
              in ref.watch(boardProvider).value ?? const <BoardColumn>[])
            column.stage,
        ];

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
          child: SearchField(
            hint: 'Search opportunities',
            initialValue: query.search,
            onChanged: filters.search,
          ),
        ),
        if (stages.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(
              left: AppSpacing.page,
              top: AppSpacing.sm,
            ),
            child: FilterChipBar<String?>(
              label: 'Filter by stage',
              selected: query.stageId,
              onSelected: filters.filterByStage,
              options: [
                const FilterOption(value: null, label: 'All stages'),
                for (final stage in stages)
                  FilterOption(value: stage.id, label: stage.name),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.only(left: AppSpacing.page),
          child: FilterChipBar<StageKind?>(
            label: 'Filter by status',
            selected: query.status,
            onSelected: filters.filterByStatus,
            options: [
              const FilterOption(value: null, label: 'Any status'),
              for (final status in StageKind.values)
                FilterOption(value: status, label: status.label),
            ],
          ),
        ),
        Expanded(
          child: PagedListView<Opportunity>(
            state: opportunities,
            onRefresh: list.refresh,
            onLoadMore: list.loadMore,
            onRetry: list.retry,
            loadingLabel: 'Loading opportunities',
            emptyTitle: query.isFiltered
                ? 'No opportunities match'
                : 'No opportunities yet',
            emptyMessage: query.isFiltered
                ? 'Try a different search or remove a filter.'
                : canWrite
                ? 'Add your first opportunity to start your pipeline.'
                : 'Opportunities will show here once someone adds them.',
            header: Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: MutedText(
                opportunities.total == 1
                    ? '1 opportunity'
                    : '${opportunities.total} opportunities',
                small: true,
              ),
            ),
            itemBuilder: (context, opportunity) => OpportunityCard(
              opportunity: opportunity,
              showOwner: opportunity.owner.id != me.id,
              onTap: () => context.go(Routes.opportunity(opportunity.id)),
            ),
          ),
        ),
      ],
    );
  }
}

/// One opportunity in the list: its name and stage, the company and contact, the value,
/// the expected close date, and the owner when it is someone else's.
class OpportunityCard extends StatelessWidget {
  const OpportunityCard({
    super.key,
    required this.opportunity,
    required this.showOwner,
    required this.onTap,
  });

  final Opportunity opportunity;
  final bool showOwner;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final who = [
      opportunity.company?.name,
      opportunity.contact?.name,
    ].nonNulls.join(' · ');
    final day = opportunity.expectedCloseDate;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      opportunity.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: text.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  // A stage's name is an Admin's choice and can be long.
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 120),
                    child: StatusBadge(
                      label: opportunity.stage.name,
                      tone: opportunity.stage.kind.tone,
                    ),
                  ),
                ],
              ),
              if (who.isNotEmpty) ...[
                const SizedBox(height: 2),
                MutedText(who, maxLines: 1),
              ],
              const SizedBox(height: AppSpacing.md),
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: AppSpacing.lg,
                runSpacing: AppSpacing.xs,
                children: [
                  Text(
                    formatCurrency(opportunity.value),
                    style: text.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (day != null)
                    MutedText('Expected close: ${formatDay(day)}', small: true),
                ],
              ),
              if (showOwner) ...[
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    InitialsAvatar(
                      initials: initials(opportunity.owner.name),
                      size: 24,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        opportunity.owner.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.bodySmall,
                        semanticsLabel: 'Owner: ${opportunity.owner.name}',
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
