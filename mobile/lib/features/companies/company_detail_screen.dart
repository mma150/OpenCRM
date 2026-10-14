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
import 'package:opencrm/features/companies/companies_providers.dart';
import 'package:opencrm/features/companies/company.dart';
import 'package:opencrm/features/contacts/company_contacts_card.dart';
import 'package:opencrm/features/custom_fields/custom_fields.dart';
import 'package:opencrm/features/tasks/record_tasks_card.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_section.dart';
import 'package:opencrm/features/timeline/timeline_sheets.dart';
import 'package:opencrm/features/users/reassign_sheet.dart';

/// What deleting a company does to its contacts: they stay, without a company. The count
/// is of the contacts this user may see; colleagues' contacts lose the link too, so a
/// company that shows none still gets the warning in general words. The web app's wording.
String deleteCompanyMessage(Company company) {
  final contacts = switch (company.contactCount) {
    0 => 'Any contacts linked to it stay, but lose the link.',
    1 => 'Its 1 contact stays, but is no longer linked to a company.',
    final count =>
      'Its $count contacts stay, but are no longer linked to a company.',
  };
  return 'The company and its timeline are removed for everyone. $contacts '
      'This cannot be undone.';
}

/// The page of one company: what it is, the people who work there, then the timeline
/// (what was discussed and what changed, newest first) or the details.
///
/// What a role may do here follows `Role.canWriteRecords` and `Role.canReassignRecords`:
/// a Read-only user gets no button that writes.
class CompanyDetailScreen extends ConsumerWidget {
  const CompanyDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(currentUserProvider).role;
    final companyState = ref.watch(companyProvider(id));
    final company = companyState.value;

    if (company == null) {
      return AppScaffold(
        title: 'Company',
        body: companyState.hasError
            ? Center(
                child: SingleChildScrollView(
                  child: ErrorState(
                    error: ApiError.from(companyState.error!),
                    onRetry: () => ref.invalidate(companyProvider(id)),
                  ),
                ),
              )
            : const Padding(
                padding: EdgeInsets.all(AppSpacing.page),
                child: SkeletonList(label: 'Loading company', count: 3),
              ),
      );
    }

    final record = RecordRef(RecordType.company, company.id);
    final controller = ref.read(companyProvider(id).notifier);
    return AppScaffold(
      title: company.name,
      actions: [
        if (role.canWriteRecords) _CompanyMenu(company: company, role: role),
      ],
      bottomBar: role.canWriteRecords
          ? Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => showAddNoteSheet(
                      context,
                      record: record,
                      recordName: company.name,
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
                      recordName: company.name,
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
        child: _CompanyBody(company: company, canWrite: role.canWriteRecords),
      ),
    );
  }
}

/// Timeline or Details: the two halves of the page under the contacts.
enum _Tab { timeline, details }

class _CompanyBody extends StatefulWidget {
  const _CompanyBody({required this.company, required this.canWrite});

  final Company company;
  final bool canWrite;

  @override
  State<_CompanyBody> createState() => _CompanyBodyState();
}

class _CompanyBodyState extends State<_CompanyBody> {
  _Tab _tab = _Tab.timeline;

  @override
  Widget build(BuildContext context) {
    final company = widget.company;
    const gap = SizedBox(height: AppSpacing.lg);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.page),
      children: [
        _Header(company),
        gap,
        CompanyContactsCard(
          companyId: company.id,
          companyName: company.name,
          canWrite: widget.canWrite,
        ),
        gap,
        // The open tasks linked to this company, and "Add task".
        RecordTasksCard(
          record: RecordRef(RecordType.company, company.id),
          recordName: company.name,
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
            record: RecordRef(RecordType.company, company.id),
            canWrite: widget.canWrite,
          )
        else ...[
          _DetailsCard(company),
          gap,
          CustomFieldsCard(
            recordType: RecordType.company,
            values: company.customFields,
          ),
          if (company.notes != null) ...[
            gap,
            SectionCard(title: 'Notes', child: SelectableText(company.notes!)),
          ],
        ],
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header(this.company);

  final Company company;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final website = company.website;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              InitialsAvatar(initials: initials(company.name), size: 44),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(
                        company.name,
                        style: text.titleLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (company.industry != null) MutedText(company.industry!),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: AppSpacing.xxl),
          DetailList(
            items: [
              DetailItem('Owner', company.owner.name),
              // Text, not a link: opening a browser needs a package the app does not have.
              DetailItem(
                'Website',
                website == null ? null : websiteLabel(website),
                selectable: true,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

enum _MenuAction { edit, reassign, delete }

/// The company's actions, behind the three dots.
class _CompanyMenu extends ConsumerWidget {
  const _CompanyMenu({required this.company, required this.role});

  final Company company;
  final Role role;

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    _MenuAction action,
  ) async {
    final controller = ref.read(companyProvider(company.id).notifier);
    switch (action) {
      case _MenuAction.edit:
        context.go(Routes.editCompany(company.id));
      case _MenuAction.reassign:
        await showReassignSheet(
          context,
          recordName: company.name,
          currentOwnerId: company.owner.id,
          onAssign: controller.assign,
        );
      case _MenuAction.delete:
        final confirmed = await showConfirmDialog(
          context,
          title: 'Delete ${company.name}?',
          message: deleteCompanyMessage(company),
          confirmLabel: 'Delete company',
          destructive: true,
        );
        if (!confirmed || !context.mounted) {
          return;
        }
        try {
          await controller.delete();
          if (context.mounted) {
            showSuccessSnackBar(context, 'Company deleted.');
            context.go(Routes.companies);
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
      tooltip: 'Company actions',
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
  const _DetailsCard(this.company);

  final Company company;

  @override
  Widget build(BuildContext context) {
    final website = company.website;
    return SectionCard(
      title: 'Details',
      child: DetailList(
        items: [
          // Selectable, so an address or a number can be copied into the phone's own apps.
          DetailItem(
            'Website',
            website == null ? null : websiteLabel(website),
            selectable: true,
          ),
          DetailItem('Phone', company.phone, selectable: true),
          DetailItem('Industry', company.industry),
          DetailItem('Address', company.address, selectable: true),
          DetailItem('Owner', company.owner.name),
          DetailItem('Created', formatDate(company.createdAt)),
          DetailItem('Updated', formatDate(company.updatedAt)),
        ],
      ),
    );
  }
}
