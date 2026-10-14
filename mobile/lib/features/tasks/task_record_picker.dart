import 'package:flutter/material.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/widgets/record_picker.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// The words of the picker for each kind of record a task can be linked to.
const _titles = {
  RecordType.lead: 'Choose a lead',
  RecordType.contact: 'Choose a contact',
  RecordType.company: 'Choose a company',
  RecordType.opportunity: 'Choose an opportunity',
};

const _plurals = {
  RecordType.lead: 'leads',
  RecordType.contact: 'contacts',
  RecordType.company: 'companies',
  RecordType.opportunity: 'opportunities',
};

/// The second line of a match: a lead's company is text, a contact's and an opportunity's
/// is `{ id, name }`, and a company has none.
String? _company(Json json) {
  final company = json['company'];
  if (company is String && company.isNotEmpty) {
    return company;
  }
  return company is Map && company['name'] is String
      ? company['name'] as String
      : null;
}

/// Finds a record of any kind by name. All four lists of the API take the same `search`,
/// `sort=name` and paging, and answer each record with an `id` and a `name`, so one search
/// serves every kind: `GET /leads?search=`, `GET /opportunities?search=`.
Future<List<PickedRecord>> searchRecords(
  ApiClient client,
  RecordType type,
  String search,
) async {
  final query = ListQuery(
    search: search,
    sort: 'name',
    order: 'asc',
    pageSize: recordPickerPageSize,
  );
  final response = await client.get('/${type.apiPath}', query: query.toQuery());
  return [
    for (final json in asList(response.data).map(asMap))
      PickedRecord(
        id: readString(json, 'id'),
        name: readString(json, 'name'),
        detail: _company(json),
      ),
  ];
}

/// Opens the shared record picker for the kind of record a task is linked to. Answers the
/// record that was picked, or null when the sheet is dismissed.
Future<PickedRecord?> showTaskRecordPicker(
  BuildContext context, {
  required ApiClient client,
  required RecordType type,
  String? selectedId,
}) {
  return showRecordPicker(
    context,
    title: _titles[type]!,
    plural: _plurals[type]!,
    selectedId: selectedId,
    search: (search) => searchRecords(client, type, search),
  );
}
