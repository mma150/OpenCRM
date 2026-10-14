import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/state/paged_notifier.dart';
import 'package:opencrm/features/companies/companies_providers.dart';
import 'package:opencrm/features/contacts/contact.dart';
import 'package:opencrm/features/contacts/contacts_api.dart';
import 'package:opencrm/features/leads/lead.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_providers.dart';

/// The search, company filter and order of the contacts list. Changing it starts the list
/// again.
class ContactsQueryController extends Notifier<ContactsQuery> {
  @override
  ContactsQuery build() {
    // The next person to sign in starts with no search and no filter.
    ref.watch(sessionUserIdProvider);
    return const ContactsQuery();
  }

  void search(String text) {
    state = ContactsQuery(
      search: text,
      company: state.company,
      sort: state.sort,
    );
  }

  /// Narrows the list to one company's contacts ("View all" on a company's page), or with
  /// null shows everyone again. A new company starts without the last search.
  void filterByCompany(RecordLink? company) {
    state = ContactsQuery(
      search: company == null ? state.search : '',
      company: company,
      sort: state.sort,
    );
  }

  void sortBy(ContactSort sort) {
    state = ContactsQuery(
      search: state.search,
      company: state.company,
      sort: sort,
    );
  }
}

final contactsQueryProvider =
    NotifierProvider<ContactsQueryController, ContactsQuery>(
      ContactsQueryController.new,
    );

/// The contacts list, page by page, for the query in [contactsQueryProvider].
class ContactsListController extends PagedNotifier<Contact> {
  late ContactsQuery _query;

  @override
  PagedState<Contact> build() {
    _query = ref.watch(contactsQueryProvider);
    return start();
  }

  @override
  Future<Page<Contact>> fetchPage(int page) =>
      ref.read(contactsApiProvider).list(_query, page);

  @override
  Object idOf(Contact item) => item.id;
}

final contactsListProvider =
    NotifierProvider<ContactsListController, PagedState<Contact>>(
      ContactsListController.new,
    );

/// How many contacts the card on a company's page shows. A company with more links to
/// the contacts list, narrowed to the company.
const companyContactsShown = 5;

/// The first contacts of one company, by name, and how many there are: the Contacts card
/// on a company's page.
final companyContactsProvider = FutureProvider.autoDispose
    .family<Page<Contact>, String>((ref, companyId) {
      ref.watch(sessionUserIdProvider);
      return ref
          .watch(contactsApiProvider)
          .ofCompany(companyId, count: companyContactsShown);
    });

/// One contact and everything that changes it. The page of a contact watches this; the
/// form and the Reassign sheet call a method and show the `ApiError` it throws.
class ContactController extends AsyncNotifier<Contact> {
  ContactController(this.id);

  final String id;

  ContactsApi get _api => ref.read(contactsApiProvider);

  @override
  Future<Contact> build() {
    ref.watch(sessionUserIdProvider);
    return _api.get(id);
  }

  /// Reads the contact again, keeping what is on screen until the answer arrives.
  Future<void> reload() async {
    try {
      final contact = await _api.get(id);
      if (ref.mounted) {
        state = AsyncData(contact);
      }
    } catch (error) {
      throw ApiError.from(error);
    }
  }

  /// Pull to refresh: the contact and its timeline.
  Future<void> refresh() async {
    refreshTimelines(ref, RecordRef(RecordType.contact, id));
    await reload();
  }

  void _changed(Contact contact, {bool wroteTimeline = false}) {
    if (!ref.mounted) {
      return;
    }
    state = AsyncData(contact);
    contactsChanged(ref);
    if (wroteTimeline) {
      refreshTimelines(ref, RecordRef(RecordType.contact, id));
    }
  }

  Future<void> save(ContactInput input) async =>
      _changed(await _api.update(id, input));

  Future<void> assign(String ownerId) async {
    _changed(await _api.assign(id, ownerId), wroteTimeline: true);
  }

  Future<void> delete() async {
    await _api.delete(id);
    if (ref.mounted) {
      contactsChanged(ref);
    }
  }
}

final contactProvider = AsyncNotifierProvider.autoDispose
    .family<ContactController, Contact, String>(ContactController.new);

/// Call after a contact was created, changed or deleted: everything that lists or counts
/// contacts loads again (a company shows how many contacts it has, and the first of them).
void contactsChanged(Ref ref) {
  ref.invalidate(contactsListProvider);
  ref.invalidate(companyContactsProvider);
  ref.invalidate(companiesListProvider);
  ref.invalidate(companyProvider);
}

/// Creates a contact, owned by the signed-in user. The "New contact" form calls this.
class ContactCreator {
  const ContactCreator(this._ref);

  final Ref _ref;

  Future<Contact> create(ContactInput input) async {
    final contact = await _ref.read(contactsApiProvider).create(input);
    contactsChanged(_ref);
    return contact;
  }
}

final contactCreatorProvider = Provider(ContactCreator.new);
