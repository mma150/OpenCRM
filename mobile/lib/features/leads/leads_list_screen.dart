import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/paged_list_view.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/leads/lead.dart';
import 'package:opencrm/features/leads/leads_api.dart';
import 'package:opencrm/features/leads/leads_providers.dart';

/// The Leads tab: search, a status filter, a sort order, and the leads the signed-in user
/// may see, page by page. Which leads those are is the API's decision (everyone's, the
/// team's, or their own).
class LeadsListScreen extends ConsumerWidget {
  const LeadsListScreen({super.key});

  Future<void> _chooseSort(
    BuildContext context,
    WidgetRef ref,
    LeadSort current,
  ) async {
    final sort = await showOptionsSheet<LeadSort>(
      context,
      title: 'Sort leads',
      selected: current,
      options: [
        for (final sort in LeadSort.values)
          SheetOption(value: sort, label: sort.label),
      ],
    );
    if (sort != null) {
      ref.read(leadsQueryProvider.notifier).sortBy(sort);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canWrite = ref.watch(currentUserProvider).role.canWriteRecords;
    final query = ref.watch(leadsQueryProvider);
    final leads = ref.watch(leadsListProvider);
    final list = ref.read(leadsListProvider.notifier);
    final filtered = query.search.trim().isNotEmpty || query.status != null;

    return AppScaffold(
      title: 'Leads',
      actions: [
        IconButton(
          tooltip: 'Sort leads',
          icon: const Icon(Icons.sort),
          onPressed: () => _chooseSort(context, ref, query.sort),
        ),
        if (canWrite)
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.sm),
            child: FilledButton.icon(
              onPressed: () => context.go(Routes.newLead),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('New lead'),
            ),
          ),
      ],
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.md,
              AppSpacing.page,
              0,
            ),
            child: SearchField(
              hint: 'Search leads',
              initialValue: query.search,
              onChanged: ref.read(leadsQueryProvider.notifier).search,
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(
              left: AppSpacing.page,
              top: AppSpacing.sm,
            ),
            child: FilterChipBar<LeadStatus?>(
              label: 'Filter by status',
              selected: query.status,
              onSelected: ref.read(leadsQueryProvider.notifier).filterByStatus,
              options: [
                const FilterOption(value: null, label: 'All'),
                for (final status in LeadStatus.values)
                  FilterOption(value: status, label: status.label),
              ],
            ),
          ),
          Expanded(
            child: PagedListView<Lead>(
              state: leads,
              onRefresh: list.refresh,
              onLoadMore: list.loadMore,
              onRetry: list.retry,
              loadingLabel: 'Loading leads',
              emptyTitle: filtered ? 'No leads match' : 'No leads yet',
              emptyMessage: filtered
                  ? 'Try another search or status.'
                  : canWrite
                  ? 'Add the first lead to start tracking it.'
                  : 'Leads will show here once someone adds them.',
              header: Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: MutedText(
                  leads.total == 1 ? '1 lead' : '${leads.total} leads',
                  small: true,
                ),
              ),
              itemBuilder: (context, lead) => LeadCard(
                lead: lead,
                onTap: () => context.go(Routes.lead(lead.id)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One lead in the list: who, their status and company, who owns the lead, when they were
/// last contacted, and the follow-up if one is set.
class LeadCard extends StatelessWidget {
  const LeadCard({super.key, required this.lead, required this.onTap});

  final Lead lead;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final lastContact = lead.lastContactAt;
    final followUp = lead.followUpAt;
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
                      lead.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: text.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  StatusBadge(label: lead.status.label, tone: lead.status.tone),
                ],
              ),
              if (lead.company != null) ...[
                const SizedBox(height: 2),
                MutedText(lead.company!, maxLines: 1),
              ],
              const SizedBox(height: AppSpacing.md),
              // The owner and the last contact share a line when both fit, and take one
              // each on a narrow phone or with large text.
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.xs,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      InitialsAvatar(
                        initials: initials(lead.owner.name),
                        size: 24,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Flexible(
                        child: Text(
                          lead.owner.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.bodySmall,
                          semanticsLabel: 'Owner: ${lead.owner.name}',
                        ),
                      ),
                    ],
                  ),
                  MutedText(
                    lastContact == null
                        ? 'No contact yet'
                        : 'Contacted ${formatRelativeDate(lastContact).toLowerCase()}',
                    small: true,
                  ),
                ],
              ),
              if (followUp != null && lead.status.isOpen) ...[
                const SizedBox(height: AppSpacing.md),
                _FollowUpLine(at: followUp),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _FollowUpLine extends StatelessWidget {
  const _FollowUpLine({required this.at});

  final DateTime at;

  @override
  Widget build(BuildContext context) {
    final overdue = at.isBefore(DateTime.now());
    final colors = context.colors.tone(overdue ? Tone.warning : Tone.neutral);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: colors.background,
        border: Border.all(color: colors.border),
        borderRadius: AppSpacing.borderRadius,
      ),
      child: Text(
        '${overdue ? 'Overdue follow-up' : 'Next follow-up'}: ${formatNearDateTime(at)}',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: colors.foreground,
          fontWeight: overdue ? FontWeight.w600 : null,
        ),
      ),
    );
  }
}
