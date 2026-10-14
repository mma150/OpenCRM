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
import 'package:opencrm/features/contacts/contact.dart';
import 'package:opencrm/features/contacts/contacts_providers.dart';
import 'package:opencrm/features/custom_fields/custom_fields.dart';
import 'package:opencrm/features/tasks/record_tasks_card.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_section.dart';
import 'package:opencrm/features/timeline/timeline_sheets.dart';
import 'package:opencrm/features/users/reassign_sheet.dart';

/// The page of one contact: who it is, the company and the lead it came from as links,
/// then the timeline (what was discussed and what changed, newest first) or the details.
///
/// What a role may do here follows `Role.canWriteRecords` and `Role.canReassignRecords`:
/// a Read-only user gets no button that writes.
class ContactDetailScreen extends ConsumerWidget {
  const ContactDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(currentUserProvider).role;
    final contactState = ref.watch(contactProvider(id));
    final contact = contactState.value;

    if (contact == null) {
      return AppScaffold(
        title: 'Contact',
        body: contactState.hasError
            ? Center(
                child: SingleChildScrollView(
                  child: ErrorState(
                    error: ApiError.from(contactState.error!),
                    onRetry: () => ref.invalidate(contactProvider(id)),
                  ),
                ),
              )
            : const Padding(
                padding: EdgeInsets.all(AppSpacing.page),
                child: SkeletonList(label: 'Loading contact', count: 3),
              ),
      );
    }

    final record = RecordRef(RecordType.contact, contact.id);
    final controller = ref.read(contactProvider(id).notifier);
    return AppScaffold(
      title: contact.name,
      actions: [
        if (role.canWriteRecords) _ContactMenu(contact: contact, role: role),
      ],
      bottomBar: role.canWriteRecords
          ? Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => showAddNoteSheet(
                      context,
                      record: record,
                      recordName: contact.name,
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
                      recordName: contact.name,
                      // A conversation moves the contact's "last contact".
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
        child: _ContactBody(contact: contact, canWrite: role.canWriteRecords),
      ),
    );
  }
}

/// Timeline or Details: the two halves of the page under the header.
enum _Tab { timeline, details }

class _ContactBody extends StatefulWidget {
  const _ContactBody({required this.contact, required this.canWrite});

  final Contact contact;
  final bool canWrite;

  @override
  State<_ContactBody> createState() => _ContactBodyState();
}

class _ContactBodyState extends State<_ContactBody> {
  _Tab _tab = _Tab.timeline;

  @override
  Widget build(BuildContext context) {
    final contact = widget.contact;
    const gap = SizedBox(height: AppSpacing.lg);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.page),
      children: [
        _Header(contact),
        gap,
        // The open tasks linked to this contact, and "Add task".
        RecordTasksCard(
          record: RecordRef(RecordType.contact, contact.id),
          recordName: contact.name,
          canWrite: widget.canWrite,
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
            record: RecordRef(RecordType.contact, contact.id),
            canWrite: widget.canWrite,
          )
        else ...[
          _DetailsCard(contact),
          gap,
          CustomFieldsCard(
            recordType: RecordType.contact,
            values: contact.customFields,
          ),
          if (contact.notes != null) ...[
            gap,
            SectionCard(title: 'Notes', child: SelectableText(contact.notes!)),
          ],
        ],
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header(this.contact);

  final Contact contact;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final company = contact.company;
    final lead = contact.convertedFromLead;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              InitialsAvatar(initials: initials(contact.name), size: 44),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(
                        contact.name,
                        style: text.titleLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (contact.jobTitle != null) MutedText(contact.jobTitle!),
                  ],
                ),
              ),
            ],
          ),
          // A company or a lead the reader may not see is not named by the API, and then
          // there is no link.
          if (company != null) ...[
            const SizedBox(height: AppSpacing.sm),
            _RecordLinkRow(
              icon: Icons.business_outlined,
              caption: 'Company',
              name: company.name,
              onTap: () => context.go(Routes.company(company.id)),
            ),
          ],
          if (lead != null) ...[
            const SizedBox(height: AppSpacing.sm),
            _RecordLinkRow(
              icon: Icons.filter_alt_outlined,
              caption: 'Converted from lead',
              name: lead.name,
              onTap: () => context.go(Routes.lead(lead.id)),
            ),
          ],
          const Divider(height: AppSpacing.xxl),
          DetailList(
            items: [
              DetailItem('Owner', contact.owner.name),
              DetailItem(
                'Last contact',
                contact.lastContactAt == null
                    ? 'Never'
                    : formatRelativeDate(contact.lastContactAt!),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A row that opens another record: what it is ("Company") above its name.
class _RecordLinkRow extends StatelessWidget {
  const _RecordLinkRow({
    required this.icon,
    required this.caption,
    required this.name,
    required this.onTap,
  });

  final IconData icon;
  final String caption;
  final String name;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      label: '$caption: $name',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: AppSpacing.borderRadius,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
          child: Row(
            children: [
              Icon(icon, size: 20, color: context.colors.textMuted),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    MutedText(caption, small: true),
                    Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: text.bodyMedium?.copyWith(
                        color: context.colors.primary,
                        fontWeight: FontWeight.w600,
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

enum _MenuAction { edit, reassign, delete }

/// The contact's actions, behind the three dots.
class _ContactMenu extends ConsumerWidget {
  const _ContactMenu({required this.contact, required this.role});

  final Contact contact;
  final Role role;

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    _MenuAction action,
  ) async {
    final controller = ref.read(contactProvider(contact.id).notifier);
    switch (action) {
      case _MenuAction.edit:
        context.go(Routes.editContact(contact.id));
      case _MenuAction.reassign:
        await showReassignSheet(
          context,
          recordName: contact.name,
          currentOwnerId: contact.owner.id,
          onAssign: controller.assign,
        );
      case _MenuAction.delete:
        final confirmed = await showConfirmDialog(
          context,
          title: 'Delete ${contact.name}?',
          message: 'The contact and its timeline are removed for everyone. This cannot be undone.',
          confirmLabel: 'Delete contact',
          destructive: true,
        );
        if (!confirmed || !context.mounted) {
          return;
        }
        try {
          await controller.delete();
          if (context.mounted) {
            showSuccessSnackBar(context, 'Contact deleted.');
            context.go(Routes.contacts);
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
      tooltip: 'Contact actions',
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

class _DetailsCard extends StatelessWidget {
  const _DetailsCard(this.contact);

  final Contact contact;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: 'Details',
      child: DetailList(
        items: [
          // Selectable, so an address or a number can be copied into the phone's own apps.
          DetailItem('Email', contact.email, selectable: true),
          DetailItem('Phone', contact.phone, selectable: true),
          DetailItem('Company', contact.company?.name),
          DetailItem('Job title', contact.jobTitle),
          DetailItem('Owner', contact.owner.name),
          if (contact.convertedFromLead != null)
            DetailItem('Converted from lead', contact.convertedFromLead!.name),
          DetailItem('Created', formatDate(contact.createdAt)),
          DetailItem('Updated', formatDate(contact.updatedAt)),
        ],
      ),
    );
  }
}
