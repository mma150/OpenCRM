import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_entry.dart';
import 'package:opencrm/features/timeline/timeline_labels.dart';
import 'package:opencrm/features/timeline/timeline_providers.dart';

const _emptyTitles = {
  TimelineFilter.all: 'Nothing logged yet',
  TimelineFilter.conversations: 'No conversations yet',
  TimelineFilter.notes: 'No notes yet',
  TimelineFilter.changes: 'No changes yet',
};

/// A record's history: the filter (All, Conversations, Notes, Changes), the entries newest
/// first, and "Load more". It does not scroll by itself: put it inside the scroll view of
/// the record's page. The same widget serves every kind of record.
class TimelineSection extends ConsumerStatefulWidget {
  const TimelineSection({
    super.key,
    required this.record,
    required this.canWrite,
  });

  final RecordRef record;

  /// Only changes the hint of an empty timeline; the buttons that write are the page's.
  final bool canWrite;

  @override
  ConsumerState<TimelineSection> createState() => _TimelineSectionState();
}

class _TimelineSectionState extends ConsumerState<TimelineSection> {
  TimelineFilter _filter = TimelineFilter.all;

  @override
  Widget build(BuildContext context) {
    final provider = timelineProvider((record: widget.record, filter: _filter));
    final timeline = ref.watch(provider);
    final controller = ref.read(provider.notifier);
    final error = timeline.error;
    final moreError = timeline.moreError;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilterChipBar<TimelineFilter>(
          label: 'Filter timeline',
          selected: _filter,
          onSelected: (filter) => setState(() => _filter = filter),
          options: [
            for (final filter in TimelineFilter.values)
              FilterOption(value: filter, label: filter.label),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        if (timeline.isLoading)
          const SkeletonList(label: 'Loading timeline', count: 3)
        else if (error != null)
          ErrorState(error: error, onRetry: controller.retry, compact: true)
        else if (timeline.items.isEmpty)
          EmptyState(
            icon: Icons.history,
            title: _emptyTitles[_filter]!,
            message: widget.canWrite
                ? "Log the first conversation to start this record's history."
                : 'Conversations and notes will show here once someone logs them.',
          )
        else ...[
          for (final entry in timeline.items)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: TimelineEntryTile(
                entry: entry,
                recordType: widget.record.type,
              ),
            ),
          if (moreError != null)
            ErrorState(
              error: moreError,
              onRetry: controller.loadMore,
              compact: true,
            )
          else if (timeline.hasMore)
            OutlinedButton(
              onPressed: timeline.isLoadingMore ? null : controller.loadMore,
              child: Text(timeline.isLoadingMore ? 'Loading...' : 'Load more'),
            ),
        ],
      ],
    );
  }
}

/// One entry: its icon and title, when it happened and who wrote it, and its text.
class TimelineEntryTile extends StatelessWidget {
  const TimelineEntryTile({
    super.key,
    required this.entry,
    required this.recordType,
  });

  final TimelineEntry entry;
  final RecordType recordType;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final body = entryText(entry);
    final tone = context.colors.tone(
      entry.kind == TimelineKind.conversation ? Tone.info : Tone.neutral,
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: tone.background,
                borderRadius: AppSpacing.borderRadius,
              ),
              child: Icon(entryIcon(entry), size: 18, color: tone.foreground),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entryTitle(entry, recordType),
                    style: text.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  MutedText(
                    '${formatNearDateTime(entry.occurredAt)} · ${entry.author.name}',
                    small: true,
                  ),
                  if (body != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(body, style: text.bodyMedium),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
