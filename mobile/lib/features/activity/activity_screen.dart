import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/record_routes.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/paged_list_view.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/activity/activity_entry.dart';
import 'package:opencrm/features/activity/activity_labels.dart';
import 'package:opencrm/features/activity/activity_providers.dart';
import 'package:opencrm/features/timeline/timeline_labels.dart';

/// The activity feed: what each person on the team did and when, newest first. For Admins
/// and Sales Managers only. Anyone else who gets here (the More tab does not offer it)
/// is told so, and the API is not asked: it would answer `FORBIDDEN`.
class ActivityScreen extends ConsumerWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(currentUserProvider).role;
    return AppScaffold(
      title: 'Activity',
      body: role.seesTeamOverview
          ? const _Feed()
          : const Center(
              child: SingleChildScrollView(
                child: EmptyState(
                  icon: Icons.lock_outline,
                  title: 'You do not have access to Activity',
                  message: 'Only an Admin, a Sales Manager or a Read-only user can see what the team did.',
                ),
              ),
            ),
    );
  }
}

class _Feed extends ConsumerWidget {
  const _Feed();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kind = ref.watch(activityKindProvider);
    final activity = ref.watch(activityProvider);
    final list = ref.read(activityProvider.notifier);
    final filtered = kind != ActivityKind.all;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(
            left: AppSpacing.page,
            top: AppSpacing.md,
          ),
          child: FilterChipBar<ActivityKind>(
            label: 'Filter by type',
            selected: kind,
            onSelected: ref.read(activityKindProvider.notifier).choose,
            options: [
              for (final kind in ActivityKind.values)
                FilterOption(value: kind, label: kind.label),
            ],
          ),
        ),
        Expanded(
          child: PagedListView<ActivityEntry>(
            state: activity,
            onRefresh: list.refresh,
            onLoadMore: list.loadMore,
            onRetry: list.retry,
            loadingLabel: 'Loading activity',
            emptyTitle: filtered ? 'No activity matches' : 'No activity yet',
            emptyMessage: filtered ? 'Try another type.' : 'Conversations, notes and changes your team logs will show here.',
            itemBuilder: (context, entry) => ActivityCard(activity: entry),
          ),
        ),
      ],
    );
  }
}

/// One thing someone did: who, what, on which record, when, and a line or two of it. A
/// tap opens the record's page when the app has one.
class ActivityCard extends StatelessWidget {
  const ActivityCard({super.key, required this.activity});

  final ActivityEntry activity;

  @override
  Widget build(BuildContext context) {
    final entry = activity.entry;
    final record = activity.record;
    final type = record.recordType;
    final route = type == null ? null : recordRoute(type, record.id);
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final sentence = activitySentence(entry);
    final excerpt = activityExcerpt(activity);
    const strong = TextStyle(fontWeight: FontWeight.w600);

    final content = Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InitialsAvatar(initials: initials(entry.author.name), size: 32),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(text: entry.author.name, style: strong),
                      TextSpan(text: ' ${sentence.before} '),
                      TextSpan(
                        text: record.name,
                        style: strong.copyWith(
                          color: route == null ? null : colors.primary,
                        ),
                      ),
                      TextSpan(text: sentence.after),
                    ],
                  ),
                  style: text.bodyMedium,
                ),
                const SizedBox(height: AppSpacing.xs),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.xs,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    StatusBadge(label: record.typeLabel),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          entryIcon(entry),
                          size: 14,
                          color: colors.textMuted,
                        ),
                        const SizedBox(width: AppSpacing.xs),
                        MutedText(activityBadge(entry), small: true),
                      ],
                    ),
                    MutedText(
                      formatNearDateTime(entry.occurredAt),
                      small: true,
                    ),
                  ],
                ),
                if (excerpt != null) ...[
                  const SizedBox(height: AppSpacing.xs),
                  MutedText(excerpt, maxLines: 2),
                ],
              ],
            ),
          ),
          if (route != null) Icon(Icons.chevron_right, color: colors.textMuted),
        ],
      ),
    );
    return Card(
      clipBehavior: Clip.antiAlias,
      child: route == null
          ? content
          : InkWell(onTap: () => context.go(route), child: content),
    );
  }
}
