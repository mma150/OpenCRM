import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/widgets/detail_list.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// A field an Admin added to a kind of record. The values live on the records, keyed by
/// [id]: the record pages show them ([CustomFieldsCard]) and the record forms edit them
/// (`CustomFieldsSection` in `custom_fields_form.dart`).
class CustomField {
  const CustomField({
    required this.id,
    required this.label,
    required this.type,
    this.options = const [],
    this.required = false,
  });

  factory CustomField.fromJson(Json json) {
    return CustomField(
      id: readString(json, 'id'),
      label: readString(json, 'label'),
      type: readString(json, 'type'),
      options: [
        for (final option in asList(json['options'] ?? const <Object?>[]))
          if (option is String)
            option
          else
            throw const FormatException('Expected "options" to be text'),
      ],
      required: json['required'] == null ? false : readBool(json, 'required'),
    );
  }

  final String id;
  final String label;

  /// `TEXT`, `NUMBER`, `DATE` or `DROPDOWN`.
  final String type;

  /// The choices of a `DROPDOWN`, in the Admin's order; empty for the other types.
  final List<String> options;

  /// A new record must have a value, and a record that has one cannot be emptied.
  final bool required;

  /// A stored value as text: a number as people write it, a day as a date.
  String? format(Object? value) {
    if (value == null) {
      return null;
    }
    if (value is num) {
      return formatNumber(value);
    }
    return type == 'DATE' ? formatDay(value.toString()) : value.toString();
  }
}

/// The custom fields in use for one kind of record, in the Admin's order.
final customFieldsProvider =
    FutureProvider.family<List<CustomField>, RecordType>((ref, type) async {
      ref.watch(sessionUserIdProvider);
      final response = await ref
          .watch(apiClientProvider)
          .get(
            '/custom-fields',
            query: {'recordType': type.name.toUpperCase()},
          );
      return readList(response.data, CustomField.fromJson);
    });

/// The "Custom fields" card of a record's page, read-only. It takes no room when the
/// record type has no custom fields, while they load, or when they cannot be read: the
/// rest of the page does not depend on them.
class CustomFieldsCard extends ConsumerWidget {
  const CustomFieldsCard({
    super.key,
    required this.recordType,
    required this.values,
  });

  final RecordType recordType;

  /// The record's `customFields`: values by field id.
  final Json values;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fields =
        ref.watch(customFieldsProvider(recordType)).value ?? const [];
    if (fields.isEmpty) {
      return const SizedBox.shrink();
    }
    return SectionCard(
      title: 'Custom fields',
      child: DetailList(
        items: [
          for (final field in fields)
            DetailItem(
              field.label,
              field.format(values[field.id]),
              selectable: true,
            ),
        ],
      ),
    );
  }
}
