import 'package:flutter/material.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/list_controls.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/state_views.dart';

/// A record as a picker offers it and hands it over: `{ id, name }`, with an optional
/// second line that tells two of the same name apart (a contact's company).
class PickedRecord {
  const PickedRecord({required this.id, required this.name, this.detail});

  final String id;
  final String name;
  final String? detail;
}

/// How many matches a picker asks for and shows. More than this is narrowed by typing.
const recordPickerPageSize = 20;

/// Asks a list endpoint for the first [recordPickerPageSize] records that match [search]
/// (an empty text is "the first ones by name").
typedef RecordSearch = Future<List<PickedRecord>> Function(String search);

/// Opens a sheet that finds one record by typing: the search box asks [search] a moment
/// after the typing stops, and a tap on a row answers with it. Null when the sheet is
/// dismissed. A feature wraps this in its own function (`showCompanyPicker`,
/// `showContactPicker`), which knows the route and the words.
///
/// [plural] is the lowercase word for the records ("companies"), used in every sentence.
Future<PickedRecord?> showRecordPicker(
  BuildContext context, {
  required String title,
  required String plural,
  required RecordSearch search,
  String? selectedId,
}) {
  return showAppSheet<PickedRecord>(
    context,
    title: title,
    builder: (context) =>
        _RecordPicker(plural: plural, search: search, selectedId: selectedId),
  );
}

class _RecordPicker extends StatefulWidget {
  const _RecordPicker({
    required this.plural,
    required this.search,
    required this.selectedId,
  });

  final String plural;
  final RecordSearch search;
  final String? selectedId;

  @override
  State<_RecordPicker> createState() => _RecordPickerState();
}

class _RecordPickerState extends State<_RecordPicker> {
  String _text = '';
  List<PickedRecord>? _matches;
  ApiError? _error;

  /// Counts the searches, so an answer to an earlier one is dropped.
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _load('');
  }

  Future<void> _load(String text) async {
    final generation = _generation += 1;
    setState(() {
      _text = text.trim();
      _matches = null;
      _error = null;
    });
    try {
      final matches = await widget.search(_text);
      if (mounted && generation == _generation) {
        setState(() => _matches = matches);
      }
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() => _error = ApiError.from(error));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final matches = _matches;
    final error = _error;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SearchField(hint: 'Search ${widget.plural}', onChanged: _load),
        const SizedBox(height: AppSpacing.md),
        if (error != null)
          ErrorState(error: error, onRetry: () => _load(_text), compact: true)
        else if (matches == null)
          SkeletonList(label: 'Loading ${widget.plural}', count: 3)
        else if (matches.isEmpty)
          EmptyState(
            title: _text.isEmpty
                ? 'No ${widget.plural} yet'
                : 'No ${widget.plural} match',
            message: _text.isEmpty ? null : 'Try another search.',
          )
        else ...[
          for (final record in matches)
            ListTile(
              contentPadding: EdgeInsets.zero,
              minTileHeight: AppSpacing.touchTarget,
              title: Text(
                record.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: record.detail == null
                  ? null
                  : Text(
                      record.detail!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: context.colors.textMuted),
                    ),
              trailing: record.id == widget.selectedId
                  ? Icon(
                      Icons.check,
                      color: context.colors.primary,
                      semanticLabel: 'Selected',
                    )
                  : null,
              onTap: () => Navigator.of(context).pop(record),
            ),
          if (matches.length >= recordPickerPageSize)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: MutedText(
                'Showing the first $recordPickerPageSize. Search to find others.',
                small: true,
              ),
            ),
        ],
      ],
    );
  }
}

/// A form field that holds one picked record, with its label above it: a tap opens the
/// picker ([onPick]), and the cross takes the record out again ([onClear]).
class RecordPickerField extends StatelessWidget {
  const RecordPickerField({
    super.key,
    required this.label,
    required this.value,
    required this.placeholder,
    required this.onPick,
    required this.onClear,
    this.errorText,
  });

  final String label;
  final PickedRecord? value;

  /// What an empty field says: "No company".
  final String placeholder;
  final VoidCallback onPick;
  final VoidCallback onClear;

  /// What the server said about this field.
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final record = value;
    return LabeledField(
      label: label,
      child: Semantics(
        button: true,
        child: InkWell(
          borderRadius: AppSpacing.borderRadius,
          onTap: onPick,
          child: InputDecorator(
            decoration: InputDecoration(
              errorText: errorText,
              suffixIcon: record == null
                  ? const Icon(Icons.search)
                  : IconButton(
                      tooltip: 'Clear ${label.toLowerCase()}',
                      icon: const Icon(Icons.close),
                      onPressed: onClear,
                    ),
            ),
            child: Text(
              record?.name ?? placeholder,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: record == null
                  ? TextStyle(color: context.colors.textMuted)
                  : null,
            ),
          ),
        ),
      ),
    );
  }
}
