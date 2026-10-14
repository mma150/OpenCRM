import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/opportunities/opportunities_providers.dart';
import 'package:opencrm/features/opportunities/opportunity.dart';
import 'package:opencrm/features/opportunities/opportunity_sheets.dart';
import 'package:opencrm/features/pipeline_stages/pipeline_stages.dart';

/// The pipeline on a phone: a row of stages with their counts, and the cards of one stage
/// at a time (the open stages, then Won, then Lost). A user who may change opportunities
/// moves a card with its "Move to stage" button; choosing Won or Lost there opens the close
/// sheet. A stage carries at most 50 cards; the list has the rest.
class OpportunityBoard extends ConsumerStatefulWidget {
  const OpportunityBoard({super.key});

  @override
  ConsumerState<OpportunityBoard> createState() => _OpportunityBoardState();
}

class _OpportunityBoardState extends ConsumerState<OpportunityBoard> {
  /// The stage shown; the first one until the user picks another.
  String? _stageId;

  BoardController get _board => ref.read(boardProvider.notifier);

  Future<void> _refresh() async {
    try {
      await _board.refresh();
    } on ApiError catch (error) {
      if (mounted) {
        showErrorSnackBar(context, describeApiError(error));
      }
    }
  }

  /// "Move to stage": another open stage moves the card at once, Won and Lost ask for
  /// the reason first.
  Future<void> _move(Opportunity opportunity, List<Stage> stages) async {
    final stage = await showMoveToStageSheet(
      context,
      opportunity: opportunity,
      stages: stages,
    );
    if (stage == null || !mounted) {
      return;
    }
    final outcome = CloseOutcome.ofKind(stage.kind);
    if (outcome != null) {
      await showCloseSheet(
        context,
        opportunity: opportunity,
        outcome: outcome,
        onClose: ({required outcome, reason}) =>
            _board.close(opportunity, outcome: outcome, reason: reason),
      );
      return;
    }
    try {
      await _board.move(opportunity, stage);
      if (mounted) {
        showSuccessSnackBar(
          context,
          '${opportunity.name} moved to ${stage.name}.',
        );
      }
    } on ApiError catch (error) {
      // The card is back where it was; this is the only sign that the move failed.
      if (mounted) {
        showErrorSnackBar(
          context,
          '${opportunity.name} could not be moved. ${describeApiError(error)}',
        );
      }
    }
  }

  Future<void> _reopen(Opportunity opportunity) async {
    try {
      final reopened = await _board.reopen(opportunity);
      if (mounted) {
        showSuccessSnackBar(
          context,
          '${opportunity.name} was reopened in ${reopened.stage.name}.',
        );
      }
    } on ApiError catch (error) {
      if (mounted) {
        showErrorSnackBar(context, describeApiError(error));
      }
    }
  }

  /// To the list, showing every opportunity of one stage.
  void _showInList(Stage stage) {
    ref.read(opportunitiesQueryProvider.notifier).showStage(stage.id);
    ref.read(opportunitiesViewProvider.notifier).show(OpportunitiesView.list);
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(currentUserProvider);
    final canWrite = me.role.canWriteRecords;
    final board = ref.watch(boardProvider);
    final columns = board.value;

    if (columns == null) {
      if (board.hasError) {
        return Center(
          child: SingleChildScrollView(
            child: ErrorState(
              error: ApiError.from(board.error!),
              onRetry: () => ref.invalidate(boardProvider),
            ),
          ),
        );
      }
      return const Padding(
        padding: EdgeInsets.all(AppSpacing.page),
        child: SkeletonList(label: 'Loading pipeline', count: 3),
      );
    }

    if (columns.every((column) => column.count == 0)) {
      return RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(AppSpacing.page),
          children: [
            EmptyState(
              title: 'No opportunities yet',
              message: canWrite
                  ? 'Add your first opportunity to start your pipeline.'
                  : 'Opportunities will show here once someone adds them.',
            ),
          ],
        ),
      );
    }

    final column = columns.firstWhere(
      (column) => column.stage.id == _stageId,
      orElse: () => columns.first,
    );
    final stages = [for (final column in columns) column.stage];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: AppSpacing.page),
          child: FilterChipBar<String>(
            label: 'Stage',
            selected: column.stage.id,
            onSelected: (stageId) => setState(() => _stageId = stageId),
            options: [
              for (final column in columns)
                FilterOption(
                  value: column.stage.id,
                  label: '${column.stage.name} · ${column.count}',
                ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              // A new stage starts at its top.
              key: PageStorageKey('stage-${column.stage.id}'),
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(AppSpacing.page),
              children: [
                // A reload that failed keeps the last board on screen: say it is out of date.
                if (board.hasError && !board.isLoading)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: ToneBanner(
                      tone: Tone.danger,
                      icon: Icons.error_outline,
                      child: Text(
                        describeApiError(ApiError.from(board.error!)),
                      ),
                    ),
                  ),
                _StageSummary(column),
                const SizedBox(height: AppSpacing.md),
                if (column.opportunities.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(AppSpacing.xl),
                    child: Center(
                      child: MutedText('No opportunities in this stage.'),
                    ),
                  ),
                for (final opportunity in column.opportunities)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: _BoardCard(
                      opportunity: opportunity,
                      showOwner: opportunity.owner.id != me.id,
                      onTap: () =>
                          context.go(Routes.opportunity(opportunity.id)),
                      onMove: canWrite && opportunity.isOpen
                          ? () => _move(opportunity, stages)
                          : null,
                      onReopen: canWrite && !opportunity.isOpen
                          ? () => _reopen(opportunity)
                          : null,
                    ),
                  ),
                if (column.isCapped)
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      MutedText(
                        'Showing ${column.opportunities.length} of ${column.count}.',
                        small: true,
                      ),
                      TextButton(
                        onPressed: () => _showInList(column.stage),
                        child: const Text('View all in the list'),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// The stage on screen: its name, what its opportunities are worth together, and how many
/// there are (all of them, not only the cards shown).
class _StageSummary extends StatelessWidget {
  const _StageSummary(this.column);

  final BoardColumn column;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final stage = column.stage;
    final colors = context.colors.tone(stage.kind.tone);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.background,
        border: Border.all(color: colors.border),
        borderRadius: AppSpacing.borderRadius,
      ),
      child: MergeSemantics(
        child: Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.end,
          spacing: AppSpacing.lg,
          runSpacing: AppSpacing.xs,
          children: [
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    stage.name,
                    style: text.labelLarge?.copyWith(color: colors.foreground),
                  ),
                ),
                Text(
                  '${formatCurrency(column.totalValue)} total',
                  style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
            Text(
              column.count == 1
                  ? '1 opportunity'
                  : '${column.count} opportunities',
              style: text.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

/// One opportunity on the board: its name, company, value, expected close date, the owner
/// when it is someone else's, and the button that moves it (or reopens a closed one) for a
/// user who may change it.
class _BoardCard extends StatelessWidget {
  const _BoardCard({
    required this.opportunity,
    required this.showOwner,
    required this.onTap,
    required this.onMove,
    required this.onReopen,
  });

  final Opportunity opportunity;
  final bool showOwner;
  final VoidCallback onTap;

  /// Null for a closed card, and for a user who may not change opportunities.
  final VoidCallback? onMove;

  /// Null for an open card, and for a user who may not change opportunities.
  final VoidCallback? onReopen;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final company = opportunity.company;
    final day = opportunity.expectedCloseDate;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                opportunity.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
              if (company != null) ...[
                const SizedBox(height: 2),
                MutedText(company.name, maxLines: 1),
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
              if (onMove != null) ...[
                const SizedBox(height: AppSpacing.md),
                OutlinedButton.icon(
                  onPressed: onMove,
                  icon: const Icon(Icons.swap_horiz),
                  label: const Text('Move to stage'),
                ),
              ],
              if (onReopen != null) ...[
                const SizedBox(height: AppSpacing.md),
                OutlinedButton.icon(
                  onPressed: onReopen,
                  icon: const Icon(Icons.replay),
                  label: const Text('Reopen'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
