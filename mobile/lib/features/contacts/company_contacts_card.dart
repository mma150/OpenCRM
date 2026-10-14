import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/contacts/contacts_providers.dart';
import 'package:opencrm/features/leads/lead.dart';

/// The Contacts card on a company's page: the first people linked to the company that the
/// signed-in user may see, by name, each opening the contact. A company with more gets
/// "View all", which opens the contacts list narrowed to the company. "Add contact" opens
/// the new-contact form with this company filled in; [canWrite] false leaves it out.
class CompanyContactsCard extends ConsumerWidget {
  const CompanyContactsCard({
    super.key,
    required this.companyId,
    required this.companyName,
    required this.canWrite,
  });

  final String companyId;
  final String companyName;
  final bool canWrite;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contacts = ref.watch(companyContactsProvider(companyId));
    final page = contacts.value;
    return SectionCard(
      title: 'Contacts',
      trailing: page == null ? null : MutedText('${page.meta.total} total'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (page == null)
            contacts.hasError
                ? ErrorState(
                    error: ApiError.from(contacts.error!),
                    onRetry: () =>
                        ref.invalidate(companyContactsProvider(companyId)),
                    compact: true,
                  )
                : const SkeletonList(label: 'Loading contacts', count: 2)
          else if (page.items.isEmpty)
            MutedText(
              canWrite
                  ? 'No contacts yet. Add the people you deal with at this company.'
                  : 'No contacts yet. Contacts linked to this company will show here.',
            )
          else ...[
            for (final contact in page.items)
              ListTile(
                contentPadding: EdgeInsets.zero,
                minTileHeight: AppSpacing.touchTarget,
                title: Text(
                  contact.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: contact.jobTitle == null
                    ? null
                    : Text(
                        contact.jobTitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: context.colors.textMuted),
                      ),
                trailing: Icon(
                  Icons.chevron_right,
                  color: context.colors.textMuted,
                ),
                onTap: () => context.go(Routes.contact(contact.id)),
              ),
            if (page.meta.total > page.items.length)
              TextButton(
                onPressed: () {
                  ref
                      .read(contactsQueryProvider.notifier)
                      .filterByCompany(
                        RecordLink(id: companyId, name: companyName),
                      );
                  context.go(Routes.contacts);
                },
                child: Text('View all ${page.meta.total} contacts'),
              ),
          ],
          if (canWrite) ...[
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton.icon(
              onPressed: () => context.go(Routes.newContactIn(companyId)),
              icon: const Icon(Icons.add),
              label: const Text('Add contact'),
            ),
          ],
        ],
      ),
    );
  }
}
