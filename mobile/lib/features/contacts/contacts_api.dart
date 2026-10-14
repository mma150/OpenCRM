import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/features/contacts/contact.dart';
import 'package:opencrm/features/leads/lead.dart';

/// How the contacts list can be sorted: the words shown (the web app's), and the API's
/// `sort` and `order`.
enum ContactSort {
  nameAz('Name A–Z', 'name', 'asc'),
  nameZa('Name Z–A', 'name', 'desc'),
  company('Company A–Z', 'company', 'asc'),
  lastContactNewest('Last contact: newest', 'lastContactAt', 'desc'),
  lastContactOldest('Last contact: oldest', 'lastContactAt', 'asc'),
  newest('Newest first', 'createdAt', 'desc'),
  recentlyUpdated('Recently updated', 'updatedAt', 'desc');

  const ContactSort(this.label, this.field, this.order);

  final String label;
  final String field;
  final String order;
}

/// What the contacts list is showing: the search, the company it is narrowed to and the
/// order.
class ContactsQuery {
  const ContactsQuery({
    this.search = '',
    this.company,
    this.sort = ContactSort.nameAz,
  });

  final String search;

  /// Set when the list was opened from a company's page: only that company's contacts.
  /// The name is kept to say so above the list.
  final RecordLink? company;
  final ContactSort sort;

  ListQuery toListQuery(int page, {int pageSize = defaultPageSize}) {
    return ListQuery(
      search: search,
      sort: sort.field,
      order: sort.order,
      page: page,
      pageSize: pageSize,
      filters: {'companyId': company?.id},
    );
  }
}

/// The contact routes of the API. Each function returns the unwrapped data; a failure is
/// an `ApiError`.
class ContactsApi {
  const ContactsApi(this._client);

  final ApiClient _client;

  Contact _contact(ApiResponse response) =>
      Contact.fromJson(asMap(response.data));

  /// One page of the contacts the caller may see.
  Future<Page<Contact>> list(
    ContactsQuery query,
    int page, {
    int pageSize = defaultPageSize,
  }) async {
    final response = await _client.get(
      '/contacts',
      query: query.toListQuery(page, pageSize: pageSize).toQuery(),
    );
    return Page.fromResponse(response, Contact.fromJson);
  }

  /// The first [count] contacts of one company, by name, with how many there are.
  Future<Page<Contact>> ofCompany(
    String companyId, {
    required int count,
  }) async {
    final response = await _client.get(
      '/contacts',
      query: ListQuery(
        sort: 'name',
        order: 'asc',
        pageSize: count,
        filters: {'companyId': companyId},
      ).toQuery(),
    );
    return Page.fromResponse(response, Contact.fromJson);
  }

  Future<Contact> get(String id) async =>
      _contact(await _client.get('/contacts/$id'));

  /// The new contact is owned by the caller.
  Future<Contact> create(ContactInput input) async {
    return _contact(await _client.post('/contacts', body: input.toJson()));
  }

  Future<Contact> update(String id, ContactInput input) async {
    return _contact(await _client.patch('/contacts/$id', body: input.toJson()));
  }

  /// Admins and Sales Managers only.
  Future<Contact> assign(String id, String ownerId) async {
    return _contact(
      await _client.post('/contacts/$id/assign', body: {'ownerId': ownerId}),
    );
  }

  Future<void> delete(String id) async {
    await _client.delete('/contacts/$id');
  }
}

final contactsApiProvider = Provider(
  (ref) => ContactsApi(ref.watch(apiClientProvider)),
);
