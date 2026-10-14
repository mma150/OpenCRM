import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/widgets/record_picker.dart';
import 'package:opencrm/features/contacts/contacts_api.dart';
import 'package:opencrm/features/leads/lead.dart';

/// Opens the sheet that finds one contact by typing, among the contacts the signed-in
/// user may see, by name. Answers `{ id, name }` (with the contact's company as `detail`),
/// or null when the sheet is dismissed. [companyId] narrows it to one company's contacts.
///
/// ```dart
/// final contact = await showContactPicker(context, selectedId: _contact?.id);
/// if (contact != null) setState(() => _contact = contact);
/// ```
Future<PickedRecord?> showContactPicker(
  BuildContext context, {
  String title = 'Choose a contact',
  String? selectedId,
  String? companyId,
}) {
  // The sheet opens above the app, where the app's own providers are still in reach.
  final api = ProviderScope.containerOf(
    context,
    listen: false,
  ).read(contactsApiProvider);
  return showRecordPicker(
    context,
    title: title,
    plural: 'contacts',
    selectedId: selectedId,
    search: (text) async {
      final page = await api.list(
        ContactsQuery(
          search: text,
          // Only the id is sent.
          company: companyId == null
              ? null
              : RecordLink(id: companyId, name: ''),
        ),
        1,
        pageSize: recordPickerPageSize,
      );
      return [
        for (final contact in page.items)
          PickedRecord(
            id: contact.id,
            name: contact.name,
            detail: contact.company?.name ?? contact.jobTitle,
          ),
      ];
    },
  );
}
