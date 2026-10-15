import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/detail_list.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/follow_up.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/custom_fields/custom_fields.dart';
import 'package:opencrm/features/opportunities/opportunities_providers.dart';
import 'package:opencrm/features/opportunities/opportunity.dart';
import 'package:opencrm/features/opportunities/opportunity_sheets.dart';
import 'package:opencrm/features/pipeline_stages/pipeline_stages.dart';
import 'package:opencrm/features/quotes/opportunity_quotes_card.dart';
import 'package:opencrm/features/quotes/quotes_providers.dart';
import 'package:opencrm/features/tasks/record_tasks_card.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_section.dart';
import 'package:opencrm/features/timeline/timeline_sheets.dart';
import 'package:opencrm/features/users/reassign_sheet.dart';

/// The page of one opportunity: what it is worth and where it is in the pipeline, how it
/// ended if it is closed, the follow-up, then the timeline or the details.
///
/// What a role may do here follows `Role.canWriteRecords` and `Role.canReassignRecords`: a
/// Read-only user gets no button that writes. An open opportunity is moved or closed; a
/// closed one is reopened first. Conversations and notes are taken either way.
class OpportunityDetailScreen extends ConsumerWidget {
  const OpportunityDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(currentUserProvider).role;
    final state = ref.watch(opportunityProvider(id));
    final opportunity = state.value;

    if (opportunity == null) {
      return AppScaffold(
        title: 'Opportunity',
        body: state.hasError
            ? Center(
                child: SingleChildScrollView(
                  child: ErrorState(
                    error: ApiError.from(state.error!),
                    onRetry: () => ref.invalidate(opportunityProvider(id)),
                  ),
                ),
              )
            : const Padding(
                padding: EdgeInsets.all(AppSpacing.page),
                child: SkeletonList(label: 'Loading opportunity', count: 3),
              ),
      );
    }

    final record = RecordRef(RecordType.opportunity, opportunity.id);
    final controller = ref.read(opportunityProvider(id).notifier);
    return AppScaffold(
      title: opportunity.name,
      actions: [
        if (role.canWriteRecords)
          _OpportunityMenu(opportunity: opportunity, role: role),
      ],
      bottomBar: role.canWriteRecords
          ? Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => showAddNoteSheet(
                      context,
                      record: record,
                      recordName: opportunity.name,
                    ),
                    icon: const Icon(Icons.sticky_note_2_outlined),
                    label: const Text('Add note'),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => showLogConversationSheet(
                      context,
                      record: record,
                      recordName: opportunity.name,
                      // A conversation moves the opportunity's "last contact".
                      onSaved: () => controller.reload().ignore(),
                    ),
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: const FittedBox(child: Text('Log conversation')),
                  ),
                ),
              ],
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(opportunityQuotesProvider(id));
          try {
            await controller.refresh();
          } on ApiError catch (error) {
            if (context.mounted) {
              showErrorSnackBar(context, describeApiError(error));
            }
          }
        },
        child: _OpportunityBody(opportunity: opportunity, role: role),
      ),
    );
  }
}

/// Timeline or Details: the two halves of the page under the header.
enum _Tab { timeline, details }

class _OpportunityBody extends ConsumerStatefulWidget {
  const _OpportunityBody({required this.opportunity, required this.role});

  final Opportunity opportunity;
  final Role role;

  @override
  ConsumerState<_OpportunityBody> createState() => _OpportunityBodyState();
}

class _OpportunityBodyState extends ConsumerState<_OpportunityBody> {
  _Tab _tab = _Tab.timeline;

  @override
  Widget build(BuildContext context) {
    final opportunity = widget.opportunity;
    final canWrite = widget.role.canWriteRecords;
    final canSetFollowUp = canWrite && opportunity.isOpen;
    const gap = SizedBox(height: AppSpacing.lg);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.page),
      children: [
        _Header(opportunity: opportunity, canWrite: canWrite),
        if (!opportunity.isOpen) ...[gap, _OutcomeBanner(opportunity)],
        // Nothing to show for an opportunity without a follow-up that cannot take one.
        if (opportunity.followUpAt != null || canSetFollowUp) ...[
          gap,
          FollowUpCard(
            at: opportunity.followUpAt,
            note: opportunity.followUpNote,
            canSet: canSetFollowUp,
            // One that is still set on a closed opportunity can be cleared.
            canClear: canWrite,
            onSave: ({at, note}) => ref
                .read(opportunityProvider(opportunity.id).notifier)
                .setFollowUp(at: at, note: note),
          ),
        ],
        gap,
        // The open tasks linked to this opportunity, and "Add task".
        RecordTasksCard(
          record: RecordRef(RecordType.opportunity, opportunity.id),
          recordName: opportunity.name,
          canWrite: canWrite,
        ),
        gap,
        // Its quotes, read-only: they are made in the web app.
        OpportunityQuotesCard(opportunityId: opportunity.id),
        gap,
        SegmentedButton<_Tab>(
          showSelectedIcon: false,
          segments: const [
            ButtonSegment(value: _Tab.timeline, label: Text('Timeline')),
            ButtonSegment(value: _Tab.details, label: Text('Details')),
          ],
          selected: {_tab},
          onSelectionChanged: (selection) =>
              setState(() => _tab = selection.first),
        ),
        gap,
        if (_tab == _Tab.timeline)
          TimelineSection(
            record: RecordRef(RecordType.opportunity, opportunity.id),
            canWrite: canWrite,
          )
        else ...[
          _DetailsCard(opportunity),
          gap,
          CustomFieldsCard(
            recordType: RecordType.opportunity,
            values: opportunity.customFields,
          ),
          if (opportunity.notes != null) ...[
            gap,
            SectionCard(
              title: 'Notes',
              child: SelectableText(opportunity.notes!),
            ),
          ],
        ],
      ],
    );
  }
}

/// The name, the stage and the value, and for a user who may change it the buttons that
/// move it through the pipeline: "Move to stage" and the two ways to close an open one,
/// "Reopen" for a closed one.
class _Header extends ConsumerWidget {
  const _Header({required this.opportunity, required this.canWrite});

  final Opportunity opportunity;
  final bool canWrite;

  OpportunityController _controller(WidgetRef ref) =>
      ref.read(opportunityProvider(opportunity.id).notifier);

  Future<void> _move(BuildContext context, WidgetRef ref) async {
    final List<Stage> stages;
    try {
      stages = await ref.read(pipelineStagesProvider.future);
    } catch (error) {
      // Asked for again on the next tap.
      ref.invalidate(pipelineStagesProvider);
      if (context.mounted) {
        showErrorSnackBar(context, describeApiError(ApiError.from(error)));
      }
      return;
    }
    if (!context.mounted) {
      return;
    }
    final stage = await showMoveToStageSheet(
      context,
      opportunity: opportunity,
      stages: openStages(stages),
    );
    if (stage == null || !context.mounted) {
      return;
    }
    await runOpportunityAction(
      context,
      () => _controller(ref).move(stage),
      done: '${opportunity.name} moved to ${stage.name}.',
    );
  }

  Future<void> _close(
    BuildContext context,
    WidgetRef ref,
    CloseOutcome outcome,
  ) {
    return showCloseSheet(
      context,
      opportunity: opportunity,
      outcome: outcome,
      onClose: _controller(ref).close,
    );
  }

  Future<void> _reopen(BuildContext context, WidgetRef ref) async {
    try {
      final reopened = await _controller(ref).reopen();
      if (context.mounted) {
        showSuccessSnackBar(
          context,
          '${opportunity.name} was reopened in ${reopened.stage.name}.',
        );
      }
    } on ApiError catch (error) {
      if (context.mounted) {
        showErrorSnackBar(context, describeApiError(error));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final company = opportunity.company;
    final day = opportunity.expectedCloseDate;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(
              opportunity.name,
              style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          if (company != null) MutedText(company.name),
          const SizedBox(height: AppSpacing.sm),
          StatusBadge(
            label: opportunity.stage.name,
            tone: opportunity.stage.kind.tone,
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            formatCurrency(opportunity.value),
            style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
            semanticsLabel: 'Value: ${formatCurrency(opportunity.value)}',
          ),
          const Divider(height: AppSpacing.xxl),
          DetailList(
            items: [
              DetailItem('Expected close', day == null ? null : formatDay(day)),
              DetailItem('Owner', opportunity.owner.name),
              DetailItem(
                'Last contact',
                opportunity.lastContactAt == null
                    ? 'Never'
                    : formatRelativeDate(opportunity.lastContactAt!),
              ),
            ],
          ),
          if (canWrite && opportunity.isOpen) ...[
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _move(context, ref),
                icon: const Icon(Icons.swap_horiz),
                label: const Text('Move to stage'),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _close(context, ref, CloseOutcome.won),
                    child: const FittedBox(child: Text('Close as won')),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _close(context, ref, CloseOutcome.lost),
                    child: const FittedBox(child: Text('Close as lost')),
                  ),
                ),
              ],
            ),
          ],
          if (canWrite && !opportunity.isOpen) ...[
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _reopen(context, ref),
                icon: const Icon(Icons.replay),
                label: const Text('Reopen'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

enum _MenuAction { edit, reassign, delete }

/// The opportunity's other actions, behind the three dots.
class _OpportunityMenu extends ConsumerWidget {
  const _OpportunityMenu({required this.opportunity, required this.role});

  final Opportunity opportunity;
  final Role role;

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    _MenuAction action,
  ) async {
    final controller = ref.read(opportunityProvider(opportunity.id).notifier);
    switch (action) {
      case _MenuAction.edit:
        context.go(Routes.editOpportunity(opportunity.id));
      case _MenuAction.reassign:
        await showReassignSheet(
          context,
          recordName: opportunity.name,
          currentOwnerId: opportunity.owner.id,
          onAssign: controller.assign,
        );
      case _MenuAction.delete:
        final confirmed = await showConfirmDialog(
          context,
          title: 'Delete ${opportunity.name}?',
          message:
              'The opportunity and its timeline are removed for everyone. Its contact and '
              'company are kept. This cannot be undone.',
          confirmLabel: 'Delete opportunity',
          destructive: true,
        );
        if (!confirmed || !context.mounted) {
          return;
        }
        try {
          await controller.delete();
          if (context.mounted) {
            showSuccessSnackBar(context, 'Opportunity deleted.');
            context.go(Routes.opportunities);
          }
        } on ApiError catch (error) {
          if (context.mounted) {
            showErrorSnackBar(context, describeApiError(error));
          }
        }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<_MenuAction>(
      tooltip: 'Opportunity actions',
      icon: const Icon(Icons.more_vert),
      onSelected: (action) => _run(context, ref, action),
      itemBuilder: (context) => [
        const PopupMenuItem(value: _MenuAction.edit, child: Text('Edit')),
        if (role.canReassignRecords)
          const PopupMenuItem(
            value: _MenuAction.reassign,
            child: Text('Reassign'),
          ),
        PopupMenuItem(
          value: _MenuAction.delete,
          child: Text('Delete', style: TextStyle(color: context.colors.danger)),
        ),
      ],
    );
  }
}

/// How a closed opportunity ended: won or lost, when, and why.
class _OutcomeBanner extends StatelessWidget {
  const _OutcomeBanner(this.opportunity);

  final Opportunity opportunity;

  @override
  Widget build(BuildContext context) {
    final won = opportunity.status == StageKind.won;
    final tone = won ? Tone.success : Tone.danger;
    final closedAt = opportunity.closedAt;
    final reason = opportunity.closeReason;
    return Semantics(
      container: true,
      label: 'Outcome',
      child: ToneBanner(
        tone: tone,
        icon: won ? Icons.check_circle_outline : Icons.highlight_off,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Closed as ${won ? 'won' : 'lost'}'
              '${closedAt == null ? '' : ' on ${formatDate(closedAt)}'}',
              style: TextStyle(
                color: context.colors.tone(tone).foreground,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 2),
            if (reason == null || reason.isEmpty)
              const MutedText('No reason was given.')
            else
              Text('Reason: $reason'),
          ],
        ),
      ),
    );
  }
}

/// The facts of the opportunity, and the records it belongs to as links to their pages.
class _DetailsCard extends StatelessWidget {
  const _DetailsCard(this.opportunity);

  final Opportunity opportunity;

  @override
  Widget build(BuildContext context) {
    final day = opportunity.expectedCloseDate;
    final company = opportunity.company;
    final contact = opportunity.contact;
    final lead = opportunity.convertedFromLead;
    return SectionCard(
      title: 'Details',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DetailList(
            items: [
              DetailItem('Value', formatCurrency(opportunity.value)),
              DetailItem('Expected close', day == null ? null : formatDay(day)),
              DetailItem('Stage', opportunity.stage.name),
              DetailItem('Status', opportunity.status.label),
              DetailItem('Owner', opportunity.owner.name),
              DetailItem(
                'Last contact',
                opportunity.lastContactAt == null
                    ? 'Never'
                    : formatRelativeDate(opportunity.lastContactAt!),
              ),
              DetailItem('Created', formatDate(opportunity.createdAt)),
              DetailItem('Updated', formatDate(opportunity.updatedAt)),
            ],
          ),
          if (company != null || contact != null || lead != null)
            const Divider(height: AppSpacing.xl),
          if (company != null)
            _RecordLinkRow(
              label: 'Company',
              name: company.name,
              path: Routes.company(company.id),
            ),
          if (contact != null)
            _RecordLinkRow(
              label: 'Contact',
              name: contact.name,
              path: Routes.contact(contact.id),
            ),
          if (lead != null)
            _RecordLinkRow(
              label: 'Converted from lead',
              name: lead.name,
              path: Routes.lead(lead.id),
            ),
        ],
      ),
    );
  }
}

/// A record this one belongs to, as a row that opens its page.
class _RecordLinkRow extends StatelessWidget {
  const _RecordLinkRow({
    required this.label,
    required this.name,
    required this.path,
  });

  final String label;
  final String name;
  final String path;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Semantics(
      link: true,
      child: InkWell(
        onTap: () => context.go(path),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    MutedText(label, small: true),
                    Text(
                      name,
                      style: text.bodyMedium?.copyWith(
                        color: context.colors.primary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: context.colors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
