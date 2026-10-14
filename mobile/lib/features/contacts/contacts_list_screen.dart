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
import 'package:opencrm/features/contacts/contact.dart';
import 'package:opencrm/features/contacts/contacts_api.dart';
import 'package:opencrm/features/contacts/contacts_providers.dart';

/// Contacts, from the More tab: search, a sort order, and the contacts the signed-in user
/// may see, page by page. Opened from a company's page ("View all") it shows only that
/// company's contacts, and says so in a chip that takes the filter off again.
class ContactsListScreen extends ConsumerWidget {
  const ContactsListScreen({super.key});

  Future<void> _chooseSort(
    BuildContext context,
    WidgetRef ref,
    ContactSort current,
  ) async {
    final sort = await showOptionsSheet<ContactSort>(
      context,
      title: 'Sort contacts',
      selected: current,
      options: [
        for (final sort in ContactSort.values)
          SheetOption(value: sort, label: sort.label),
      ],
    );
    if (sort != null) {
      ref.read(contactsQueryProvider.notifier).sortBy(sort);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canWrite = ref.watch(currentUserProvider).role.canWriteRecords;
    final query = ref.watch(contactsQueryProvider);
    final contacts = ref.watch(contactsListProvider);
    final list = ref.read(contactsListProvider.notifier);
    final company = query.company;
    final filtered = query.search.trim().isNotEmpty || company != null;

    return AppScaffold(
      title: 'Contacts',
      actions: [
        IconButton(
          tooltip: 'Sort contacts',
          icon: const Icon(Icons.sort),
          onPressed: () => _chooseSort(context, ref, query.sort),
        ),
        if (canWrite)
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.sm),
            child: FilledButton.icon(
              // A new contact starts in the company the list is narrowed to.
              onPressed: () => context.go(
                company == null
                    ? Routes.newContact
                    : Routes.newContactIn(company.id),
              ),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('New contact'),
            ),
          ),
      ],
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.md,
              AppSpacing.page,
              0,
            ),
            child: SearchField(
              // A new company filter starts with an empty search box.
              key: ValueKey(company?.id),
              hint: 'Search contacts',
              initialValue: query.search,
              onChanged: ref.read(contactsQueryProvider.notifier).search,
            ),
          ),
          if (company != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.sm,
                AppSpacing.page,
                0,
              ),
              child: InputChip(
                avatar: const Icon(Icons.business_outlined, size: 18),
                label: Text(
                  'Company: ${company.name}',
                  overflow: TextOverflow.ellipsis,
                ),
                materialTapTargetSize: MaterialTapTargetSize.padded,
                deleteButtonTooltipMessage: 'Show all contacts',
                onDeleted: () => ref
                    .read(contactsQueryProvider.notifier)
                    .filterByCompany(null),
              ),
            ),
          Expanded(
            child: PagedListView<Contact>(
              state: contacts,
              onRefresh: list.refresh,
              onLoadMore: list.loadMore,
              onRetry: list.retry,
              loadingLabel: 'Loading contacts',
              emptyTitle: filtered ? 'No contacts match' : 'No contacts yet',
              emptyMessage: company != null && query.search.trim().isEmpty
                  ? 'No contacts are linked to this company.'
                  : filtered
                  ? 'Try another search.'
                  : canWrite
                  ? 'Add your first contact to keep track of your conversations.'
                  : 'Contacts will show here once someone adds them.',
              header: Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: MutedText(
                  contacts.total == 1
                      ? '1 contact'
                      : '${contacts.total} contacts',
                  small: true,
                ),
              ),
              itemBuilder: (context, contact) => ContactCard(
                contact: contact,
                onTap: () => context.go(Routes.contact(contact.id)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One contact in the list: who, their job and company, who owns the contact and when
/// they were last contacted.
class ContactCard extends StatelessWidget {
  const ContactCard({super.key, required this.contact, required this.onTap});

  final Contact contact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final lastContact = contact.lastContactAt;
    final subtitle = [
      contact.jobTitle,
      contact.company?.name,
    ].nonNulls.join(' · ');
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
                contact.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
              ),
              if (subtitle.isNotEmpty) ...[
                const SizedBox(height: 2),
                MutedText(subtitle, maxLines: 2),
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
                        initials: initials(contact.owner.name),
                        size: 24,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Flexible(
                        child: Text(
                          contact.owner.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.bodySmall,
                          semanticsLabel: 'Owner: ${contact.owner.name}',
                        ),
                      ),
                    ],
                  ),
                  MutedText(
                    lastContact == null
                        ? 'No contact yet'
                        : 'Last contact: ${formatRelativeDate(lastContact)}',
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
