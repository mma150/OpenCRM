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
import 'package:opencrm/features/companies/companies_api.dart';
import 'package:opencrm/features/companies/companies_providers.dart';
import 'package:opencrm/features/companies/company.dart';

/// Companies, from the More tab: search, an industry filter, a sort order, and the
/// companies the signed-in user may see, page by page.
class CompaniesListScreen extends ConsumerWidget {
  const CompaniesListScreen({super.key});

  Future<void> _chooseSort(
    BuildContext context,
    WidgetRef ref,
    CompanySort current,
  ) async {
    final sort = await showOptionsSheet<CompanySort>(
      context,
      title: 'Sort companies',
      selected: current,
      options: [
        for (final sort in CompanySort.values)
          SheetOption(value: sort, label: sort.label),
      ],
    );
    if (sort != null) {
      ref.read(companiesQueryProvider.notifier).sortBy(sort);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canWrite = ref.watch(currentUserProvider).role.canWriteRecords;
    final query = ref.watch(companiesQueryProvider);
    final companies = ref.watch(companiesListProvider);
    final list = ref.read(companiesListProvider.notifier);
    final filtered = query.search.trim().isNotEmpty || query.industry != null;
    // The filter is an extra: the list works without it while the industries load and
    // when they cannot be read. The one that is filtered by always has its chip.
    final inUse = ref.watch(companyIndustriesProvider).value ?? const [];
    final selected = query.industry;
    final industries = [
      if (selected != null && !inUse.contains(selected)) selected,
      ...inUse,
    ];

    return AppScaffold(
      title: 'Companies',
      actions: [
        IconButton(
          tooltip: 'Sort companies',
          icon: const Icon(Icons.sort),
          onPressed: () => _chooseSort(context, ref, query.sort),
        ),
        if (canWrite)
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.sm),
            child: FilledButton.icon(
              onPressed: () => context.go(Routes.newCompany),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('New company'),
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
              hint: 'Search companies',
              initialValue: query.search,
              onChanged: ref.read(companiesQueryProvider.notifier).search,
            ),
          ),
          if (industries.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(
                left: AppSpacing.page,
                top: AppSpacing.sm,
              ),
              child: Align(
                alignment: Alignment.centerLeft,
                child: FilterChipBar<String?>(
                  label: 'Filter by industry',
                  selected: selected,
                  onSelected: ref
                      .read(companiesQueryProvider.notifier)
                      .filterByIndustry,
                  options: [
                    const FilterOption(value: null, label: 'All'),
                    for (final industry in industries)
                      FilterOption(value: industry, label: industry),
                  ],
                ),
              ),
            ),
          Expanded(
            child: PagedListView<Company>(
              state: companies,
              onRefresh: () async {
                ref.invalidate(companyIndustriesProvider);
                await list.refresh();
              },
              onLoadMore: list.loadMore,
              onRetry: list.retry,
              loadingLabel: 'Loading companies',
              emptyTitle: filtered ? 'No companies match' : 'No companies yet',
              emptyMessage: filtered
                  ? 'Try another search or industry.'
                  : canWrite
                  ? 'Add your first company, then link its contacts to it.'
                  : 'Companies will show here once someone adds them.',
              header: Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: MutedText(
                  companies.total == 1
                      ? '1 company'
                      : '${companies.total} companies',
                  small: true,
                ),
              ),
              itemBuilder: (context, company) => CompanyCard(
                company: company,
                onTap: () => context.go(Routes.company(company.id)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One company in the list: its name and industry, who owns it and how many contacts it
/// has.
class CompanyCard extends StatelessWidget {
  const CompanyCard({super.key, required this.company, required this.onTap});

  final Company company;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                company.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
              if (company.industry != null) ...[
                const SizedBox(height: 2),
                MutedText(company.industry!, maxLines: 1),
              ],
              const SizedBox(height: AppSpacing.md),
              // The owner and the contacts share a line when both fit, and take one each
              // on a narrow phone or with large text.
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
                        initials: initials(company.owner.name),
                        size: 24,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Flexible(
                        child: Text(
                          company.owner.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.bodySmall,
                          semanticsLabel: 'Owner: ${company.owner.name}',
                        ),
                      ),
                    ],
                  ),
                  MutedText(
                    contactCountLabel(company.contactCount),
                    small: true,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
