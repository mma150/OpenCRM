import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/widgets/record_picker.dart';
import 'package:opencrm/features/companies/companies_api.dart';

/// Opens the sheet that finds one company by typing, among the companies the signed-in
/// user may see, by name. Answers `{ id, name }`, or null when the sheet is dismissed.
///
/// ```dart
/// final company = await showCompanyPicker(context, selectedId: _company?.id);
/// if (company != null) setState(() => _company = company);
/// ```
Future<PickedRecord?> showCompanyPicker(
  BuildContext context, {
  String title = 'Choose a company',
  String? selectedId,
}) {
  // The sheet opens above the app, where the app's own providers are still in reach.
  final api = ProviderScope.containerOf(
    context,
    listen: false,
  ).read(companiesApiProvider);
  return showRecordPicker(
    context,
    title: title,
    plural: 'companies',
    selectedId: selectedId,
    search: (text) async {
      final page = await api.list(
        CompaniesQuery(search: text),
        1,
        pageSize: recordPickerPageSize,
      );
      return [
        for (final company in page.items)
          PickedRecord(
            id: company.id,
            name: company.name,
            detail: company.industry,
          ),
      ];
    },
  );
}
