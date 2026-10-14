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
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/custom_fields/custom_fields.dart';
import 'package:opencrm/features/leads/lead.dart';
import 'package:opencrm/features/leads/lead_sheets.dart';
import 'package:opencrm/features/leads/leads_providers.dart';
import 'package:opencrm/features/tasks/record_tasks_card.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_section.dart';
import 'package:opencrm/features/timeline/timeline_sheets.dart';
import 'package:opencrm/features/users/reassign_sheet.dart';

/// The page of one lead: who it is and its status, the follow-up, then the timeline
/// (what was discussed and what changed, newest first) or the details.
///
/// What a role may do here follows `Role.canWriteRecords` and `Role.canReassignRecords`:
/// a Read-only user gets no button that writes. A converted lead is final: it can still
/// be reassigned and still takes conversations and notes, and nothing else.
class LeadDetailScreen extends ConsumerWidget {
  const LeadDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(currentUserProvider).role;
    final leadState = ref.watch(leadProvider(id));
    final lead = leadState.value;

    if (lead == null) {
      return AppScaffold(
        title: 'Lead',
        body: leadState.hasError
            ? Center(
                child: SingleChildScrollView(
                  child: ErrorState(
                    error: ApiError.from(leadState.error!),
                    onRetry: () => ref.invalidate(leadProvider(id)),
                  ),
                ),
              )
            : const Padding(
                padding: EdgeInsets.all(AppSpacing.page),
                child: SkeletonList(label: 'Loading lead', count: 3),
              ),
      );
    }

    final record = RecordRef(RecordType.lead, lead.id);
    final controller = ref.read(leadProvider(id).notifier);
    return AppScaffold(
      title: lead.name,
      actions: [if (role.canWriteRecords) _LeadMenu(lead: lead, role: role)],
      bottomBar: role.canWriteRecords
          ? Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => showAddNoteSheet(
                      context,
                      record: record,
                      recordName: lead.name,
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
                      recordName: lead.name,
                      // A conversation moves the lead's "last contact".
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
          try {
            await controller.refresh();
          } on ApiError catch (error) {
            if (context.mounted) {
              showErrorSnackBar(context, describeApiError(error));
            }
          }
        },
        child: _LeadBody(lead: lead, role: role),
      ),
    );
  }
}

/// Timeline or Details: the two halves of the page under the header.
enum _Tab { timeline, details }

class _LeadBody extends StatefulWidget {
  const _LeadBody({required this.lead, required this.role});

  final Lead lead;
  final Role role;

  @override
  State<_LeadBody> createState() => _LeadBodyState();
}

class _LeadBodyState extends State<_LeadBody> {
  _Tab _tab = _Tab.timeline;

  @override
  Widget build(BuildContext context) {
    final lead = widget.lead;
    final canWrite = widget.role.canWriteRecords;
    const gap = SizedBox(height: AppSpacing.lg);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.page),
      children: [
        _Header(lead: lead, canWrite: canWrite),
        if (lead.isConverted) ...[gap, _ConvertedBanner(lead)],
        if (lead.status == LeadStatus.lost) ...[gap, _LostCard(lead)],
        // Nothing to show for a lead without a follow-up that cannot take one.
        if (lead.followUpAt != null || (canWrite && lead.status.isOpen)) ...[
          gap,
          _FollowUpCard(lead: lead, canWrite: canWrite),
        ],
        gap,
        // The open tasks linked to this lead, and "Add task".
        RecordTasksCard(
          record: RecordRef(RecordType.lead, lead.id),
          recordName: lead.name,
          canWrite: canWrite,
        ),
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
            record: RecordRef(RecordType.lead, lead.id),
            canWrite: canWrite,
          )
        else ...[
          _DetailsCard(lead),
          gap,
          CustomFieldsCard(
            recordType: RecordType.lead,
            values: lead.customFields,
          ),
          if (lead.notes != null) ...[
            gap,
            SectionCard(title: 'Notes', child: SelectableText(lead.notes!)),
          ],
        ],
      ],
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.lead, required this.canWrite});

  final Lead lead;
  final bool canWrite;

  Future<void> _changeStatus(BuildContext context, WidgetRef ref) async {
    final status = await showOptionsSheet<LeadStatus>(
      context,
      title: 'Change status',
      selected: lead.status,
      options: [
        for (final status in LeadStatus.open)
          SheetOption(value: status, label: status.label),
      ],
    );
    if (status == null || status == lead.status || !context.mounted) {
      return;
    }
    await runLeadAction(
      context,
      () => ref.read(leadProvider(lead.id).notifier).changeStatus(status),
      done: 'Status changed to ${status.label}.',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final subtitle = [lead.jobTitle, lead.company].nonNulls.join(' · ');
    final value = lead.estimatedValue;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              InitialsAvatar(initials: initials(lead.name), size: 44),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(
                        lead.name,
                        style: text.titleLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (subtitle.isNotEmpty) MutedText(subtitle),
                    const SizedBox(height: AppSpacing.sm),
                    StatusBadge(
                      label: lead.status.label,
                      tone: lead.status.tone,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: AppSpacing.xxl),
          DetailList(
            items: [
              DetailItem('Owner', lead.owner.name),
              DetailItem(
                'Estimated value',
                value == null ? null : formatCurrency(value),
              ),
              DetailItem(
                'Last contact',
                lead.lastContactAt == null
                    ? 'Never'
                    : formatRelativeDate(lead.lastContactAt!),
              ),
            ],
          ),
          if (canWrite && lead.status.isOpen) ...[
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _changeStatus(context, ref),
                icon: const Icon(Icons.swap_horiz),
                label: const Text('Change status'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Runs something that changes the lead and says how it went: [done] when it worked, the
/// error in words when it did not.
Future<void> runLeadAction(
  BuildContext context,
  Future<void> Function() action, {
  required String done,
}) async {
  try {
    await action();
    if (context.mounted) {
      showSuccessSnackBar(context, done);
    }
  } on ApiError catch (error) {
    if (context.mounted) {
      showErrorSnackBar(context, describeApiError(error));
    }
  }
}

enum _MenuAction { edit, reopen, markLost, reassign, delete }

/// The lead's actions, behind the three dots. A converted lead keeps only Reassign.
class _LeadMenu extends ConsumerWidget {
  const _LeadMenu({required this.lead, required this.role});

  final Lead lead;
  final Role role;

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    _MenuAction action,
  ) async {
    final controller = ref.read(leadProvider(lead.id).notifier);
    switch (action) {
      case _MenuAction.edit:
        context.go(Routes.editLead(lead.id));
      case _MenuAction.reopen:
        await runLeadAction(
          context,
          () => controller.changeStatus(LeadStatus.newLead),
          done: 'Lead reopened.',
        );
      case _MenuAction.markLost:
        await showMarkLostSheet(context, lead);
      case _MenuAction.reassign:
        await showReassignSheet(
          context,
          recordName: lead.name,
          currentOwnerId: lead.owner.id,
          onAssign: controller.assign,
        );
      case _MenuAction.delete:
        final confirmed = await showConfirmDialog(
          context,
          title: 'Delete ${lead.name}?',
          message: 'The lead and its notes are removed for everyone. This cannot be undone.',
          confirmLabel: 'Delete lead',
          destructive: true,
        );
        if (!confirmed || !context.mounted) {
          return;
        }
        try {
          await controller.delete();
          if (context.mounted) {
            showSuccessSnackBar(context, 'Lead deleted.');
            context.go(Routes.leads);
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
    final items = <PopupMenuEntry<_MenuAction>>[
      if (!lead.isConverted)
        const PopupMenuItem(value: _MenuAction.edit, child: Text('Edit')),
      if (lead.status == LeadStatus.lost)
        const PopupMenuItem(value: _MenuAction.reopen, child: Text('Reopen')),
      if (lead.status.isOpen)
        const PopupMenuItem(
          value: _MenuAction.markLost,
          child: Text('Mark as lost'),
        ),
      if (role.canReassignRecords)
        const PopupMenuItem(
          value: _MenuAction.reassign,
          child: Text('Reassign'),
        ),
      if (!lead.isConverted)
        PopupMenuItem(
          value: _MenuAction.delete,
          child: Text('Delete', style: TextStyle(color: context.colors.danger)),
        ),
    ];
    if (items.isEmpty) {
      return const SizedBox.shrink();
    }
    return PopupMenuButton<_MenuAction>(
      tooltip: 'Lead actions',
      icon: const Icon(Icons.more_vert),
      onSelected: (action) => _run(context, ref, action),
      itemBuilder: (context) => items,
    );
  }
}

/// What a converted lead became, each a link to its page. A record the reader may not see
/// is not named by the API and is left out.
class _ConvertedBanner extends StatelessWidget {
  const _ConvertedBanner(this.lead);

  final Lead lead;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors.tone(Tone.success);
    final contact = lead.convertedContact;
    final company = lead.convertedCompany;
    final opportunity = lead.convertedOpportunity;
    final became = [
      if (contact != null)
        ('Contact', contact.name, Routes.contact(contact.id)),
      if (company != null)
        ('Company', company.name, Routes.company(company.id)),
      if (opportunity != null)
        ('Opportunity', opportunity.name, Routes.opportunity(opportunity.id)),
    ];
    final convertedAt = lead.convertedAt;
    return ToneBanner(
      tone: Tone.success,
      icon: Icons.check_circle_outline,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            convertedAt == null
                ? 'Converted'
                : 'Converted on ${formatDate(convertedAt)}',
            style: TextStyle(
              color: colors.foreground,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 2),
          const MutedText(
            'This lead can no longer be edited. Its timeline is kept, and the work continues '
            'on the records it became.',
          ),
          for (final (label, name, path) in became)
            Semantics(
              button: true,
              label: '$label: $name',
              excludeSemantics: true,
              onTap: () => context.go(path),
              child: InkWell(
                borderRadius: AppSpacing.borderRadius,
                onTap: () => context.go(path),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    minHeight: AppSpacing.touchTarget,
                  ),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text.rich(
                      TextSpan(
                        text: '$label: ',
                        children: [
                          TextSpan(
                            text: name,
                            style: TextStyle(
                              color: context.colors.primary,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
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

/// Why, when and with what note the lead was marked as lost.
class _LostCard extends StatelessWidget {
  const _LostCard(this.lead);

  final Lead lead;

  @override
  Widget build(BuildContext context) {
    final lostAt = lead.lostAt;
    return SectionCard(
      title: 'Marked as lost',
      child: DetailList(
        items: [
          DetailItem('Reason', lead.lostReason?.label),
          if (lead.lostNote != null) DetailItem('Note', lead.lostNote),
          if (lostAt != null) DetailItem('Date', formatDate(lostAt)),
        ],
      ),
    );
  }
}

/// The follow-up reminder: what happens next with this lead. Only an open lead takes a
/// new one; one that is still set on a lost or converted lead can be cleared.
class _FollowUpCard extends ConsumerWidget {
  const _FollowUpCard({required this.lead, required this.canWrite});

  final Lead lead;
  final bool canWrite;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final at = lead.followUpAt;
    final note = lead.followUpNote;
    final canSet = canWrite && lead.status.isOpen;
    final overdue = at != null && at.isBefore(DateTime.now());

    if (at == null) {
      if (!canSet) {
        return const SizedBox.shrink();
      }
      return OutlinedButton.icon(
        onPressed: () => showFollowUpSheet(context, lead),
        icon: const Icon(Icons.event_outlined),
        label: const Text('Set follow-up'),
      );
    }
    final colors = context.colors.tone(overdue ? Tone.warning : Tone.info);
    return ToneBanner(
      tone: overdue ? Tone.warning : Tone.info,
      icon: Icons.event_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${overdue ? 'Follow-up overdue' : 'Next follow-up'}: ${formatNearDateTime(at)}',
            style: TextStyle(
              color: colors.foreground,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (note != null && note.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 2), child: Text(note)),
          if (canWrite)
            Align(
              alignment: Alignment.centerLeft,
              child: canSet
                  ? TextButton(
                      onPressed: () => showFollowUpSheet(context, lead),
                      child: const Text('Change follow-up'),
                    )
                  : TextButton(
                      onPressed: () => runLeadAction(
                        context,
                        () => ref
                            .read(leadProvider(lead.id).notifier)
                            .setFollowUp(at: null),
                        done: 'Follow-up cleared.',
                      ),
                      child: const Text('Clear follow-up'),
                    ),
            ),
        ],
      ),
    );
  }
}

class _DetailsCard extends StatelessWidget {
  const _DetailsCard(this.lead);

  final Lead lead;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'Details',
      child: DetailList(
        items: [
          // Selectable, so an address or a number can be copied into the phone's own apps.
          DetailItem('Email', lead.email, selectable: true),
          DetailItem('Phone', lead.phone, selectable: true),
          DetailItem('Company', lead.company),
          DetailItem('Job title', lead.jobTitle),
          DetailItem('Source', lead.source.label),
          DetailItem('Owner', lead.owner.name),
          DetailItem('Created', formatDate(lead.createdAt)),
          DetailItem('Updated', formatDate(lead.updatedAt)),
        ],
      ),
    );
  }
}
