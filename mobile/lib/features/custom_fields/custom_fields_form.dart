import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/custom_fields/custom_fields.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

// The custom fields of a record form (leads, contacts, companies, opportunities), the
// app's side of the web's `custom-fields-form.tsx`. A form keeps one [CustomFieldValues],
// shows a [CustomFieldsSection], and sends what the values answer:
//
//   late final _custom = CustomFieldValues(stored: widget.lead?.customFields);
//   ...
//   final fields = ref.read(customFieldsProvider(RecordType.lead)).value ?? const [];
//   customFields: existing == null ? _custom.forCreate(fields) : _custom.changes(fields),
//   ...
//   _errors = ServerErrors.from(error, fields: {..._fields, ...customFieldPaths(fields)});
//   ...
//   CustomFieldsSection(recordType: RecordType.lead, values: _custom, errors: _errors,
//       onEdited: _clearError),

/// The longest text the API stores in a text field.
const customTextMaxLength = 500;

final _numberPattern = RegExp(r'^-?\d+(\.\d+)?$');

/// Where the API reports a problem with a custom field's value: `customFields.<field id>`.
String customFieldPath(String fieldId) => 'customFields.$fieldId';

/// The paths of [fields], for `ServerErrors.from`: a message about one of them goes under
/// its control.
Set<String> customFieldPaths(List<CustomField> fields) => {
  for (final field in fields) customFieldPath(field.id),
};

/// What a record form holds for its custom fields: the text of each control, by field id,
/// starting from what the record holds. It turns the text into the API's values (a number
/// for a number field, null for none) and checks it with the API's rules.
class CustomFieldValues {
  CustomFieldValues({this.stored});

  /// What the record being edited holds (its `customFields`); null in a form that creates
  /// a record.
  final Json? stored;

  final _texts = <String, String>{};
  final _controllers = <String, TextEditingController>{};

  Object? _storedValue(CustomField field) => stored?[field.id];

  /// 12 as "12", 12.5 as "12.5": what a person would type.
  String _storedText(CustomField field) {
    final value = _storedValue(field);
    if (value == null) {
      return '';
    }
    if (value is double && value == value.truncateToDouble() && value < 1e15) {
      return value.toInt().toString();
    }
    return value.toString();
  }

  /// What the control of [field] holds: "" for none.
  String text(CustomField field) {
    return _controllers[field.id]?.text ??
        _texts[field.id] ??
        _storedText(field);
  }

  /// Sets what a dropdown or a date holds ("" for none).
  void set(CustomField field, String text) => _texts[field.id] = text;

  /// The text controller of a text or number field, made once and kept.
  TextEditingController controller(CustomField field) {
    return _controllers.putIfAbsent(
      field.id,
      () => TextEditingController(text: text(field)),
    );
  }

  /// A dropdown value the record holds that is no longer an option: it can be kept, but
  /// the API will not take it for another record. Null when there is none.
  String? removedOption(CustomField field) {
    final text = _storedText(field);
    return field.type == 'DROPDOWN' &&
            text.isNotEmpty &&
            !field.options.contains(text)
        ? text
        : null;
  }

  /// The API's value for what the control holds: a number for a number field, null for
  /// none.
  Object? _apiValue(CustomField field) {
    final value = text(field).trim();
    if (value.isEmpty) {
      return null;
    }
    return field.type == 'NUMBER' ? (num.tryParse(value) ?? value) : value;
  }

  /// The same rules as the API, to save a round trip; the server checks again. A required
  /// field must be filled in on a new record. On an existing one it only cannot be emptied:
  /// a record from before the field existed, or before it became required, stays
  /// editable, exactly as the API allows.
  String? validate(CustomField field, String? text) {
    final value = (text ?? '').trim();
    if (value.isEmpty) {
      final hadValue = _storedValue(field) != null;
      if (field.required && (stored == null || hadValue)) {
        return field.type == 'DROPDOWN'
            ? 'Choose an option.'
            : 'Enter a value.';
      }
      return null;
    }
    if (value == _storedText(field)) {
      // What the record holds already: it is not sent again.
      return null;
    }
    if (field.type == 'TEXT' && value.length > customTextMaxLength) {
      return 'Use $customTextMaxLength characters or fewer.';
    }
    if (field.type == 'NUMBER' &&
        (!_numberPattern.hasMatch(value) ||
            !(num.tryParse(value)?.isFinite ?? false))) {
      return 'Enter a number such as 12 or 12.5.';
    }
    return null;
  }

  /// For a new record: the fields that were filled in. Null when there are none, so the
  /// request leaves `customFields` out.
  Json? forCreate(List<CustomField> fields) {
    final filled = <String, Object?>{
      for (final field in fields) field.id: ?_apiValue(field),
    };
    return filled.isEmpty ? null : filled;
  }

  /// For an edit: only the fields the user changed (the API merges key by key), with null
  /// for one that was emptied. Null when nothing changed. A dropdown that still holds an
  /// option removed since is therefore never sent, and so is kept.
  Json? changes(List<CustomField> fields) {
    final changed = <String, Object?>{
      for (final field in fields)
        if (_apiValue(field) != _storedValue(field)) field.id: _apiValue(field),
    };
    return changed.isEmpty ? null : changed;
  }

  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
  }
}

/// The "Custom fields" part of a record form: one control per field in use, by its type,
/// in the Admin's order. It renders nothing for a record type without custom fields.
///
/// A text field is a text box (500 characters), a number field a text box with the
/// number keyboard, a date the platform's date picker, a dropdown its options with
/// "None". A required field has a `*`. A message the server sent about a field
/// ([errors] at `customFields.<field id>`) is shown under it; [onEdited] is called with
/// that path when the user changes the field, so the form can take the message away.
class CustomFieldsSection extends ConsumerStatefulWidget {
  const CustomFieldsSection({
    super.key,
    required this.recordType,
    required this.values,
    required this.errors,
    required this.onEdited,
  });

  final RecordType recordType;
  final CustomFieldValues values;
  final ServerErrors errors;
  final ValueChanged<String> onEdited;

  @override
  ConsumerState<CustomFieldsSection> createState() =>
      _CustomFieldsSectionState();
}

class _CustomFieldsSectionState extends ConsumerState<CustomFieldsSection> {
  @override
  void initState() {
    super.initState();
    // The fields were read when a record page was opened, maybe long ago. A form asks
    // again, so a field an Admin added or made required since is in it.
    if (ref.read(customFieldsProvider(widget.recordType)).hasValue) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          ref.invalidate(customFieldsProvider(widget.recordType));
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(customFieldsProvider(widget.recordType));
    final fields = async.value;
    if (fields == null) {
      if (async.hasError) {
        return _NotLoaded(
          onRetry: () =>
              ref.invalidate(customFieldsProvider(widget.recordType)),
        );
      }
      return Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.lg),
        child: Semantics(
          label: 'Loading custom fields',
          child: const Skeleton(height: 48),
        ),
      );
    }
    if (fields.isEmpty) {
      return const SizedBox.shrink();
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Divider(height: 1),
        const SizedBox(height: AppSpacing.lg),
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: Semantics(
            header: true,
            child: Text(
              'Custom fields',
              style: Theme.of(context).textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        ),
        for (final field in fields)
          KeyedSubtree(key: ValueKey(field.id), child: _control(field)),
      ],
    );
  }

  Widget _control(CustomField field) {
    final values = widget.values;
    final path = customFieldPath(field.id);
    final serverError = widget.errors[path];
    String? validate(String? text) => values.validate(field, text);
    switch (field.type) {
      case 'NUMBER':
        return AppTextField(
          label: field.label,
          controller: values.controller(field),
          required: field.required,
          keyboardType: const TextInputType.numberWithOptions(
            decimal: true,
            signed: true,
          ),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[-\d.]')),
          ],
          autocorrect: false,
          validator: validate,
          serverError: serverError,
          onChanged: (_) => widget.onEdited(path),
        );
      case 'DATE':
        return FormField<String>(
          initialValue: values.text(field),
          validator: validate,
          builder: (state) {
            final day = state.value ?? '';
            return DayField(
              label: field.label,
              day: day.isEmpty ? null : day,
              required: field.required,
              firstDate: DateTime(1900),
              lastDate: DateTime(2100, 12, 31),
              errorText: state.errorText ?? serverError,
              onChanged: (picked) {
                values.set(field, picked ?? '');
                state.didChange(picked ?? '');
                widget.onEdited(path);
              },
            );
          },
        );
      case 'DROPDOWN':
        final removed = values.removedOption(field);
        return AppDropdownField<String>(
          label: field.label,
          required: field.required,
          value: values.text(field),
          options: [
            const DropdownOption(value: '', label: 'None'),
            for (final option in field.options)
              DropdownOption(value: option, label: option),
            // It can be kept, and gone back to while the form is open, but the API will
            // not take it for another record.
            if (removed != null)
              DropdownOption(
                value: removed,
                label: '$removed (removed option)',
              ),
          ],
          validator: validate,
          serverError: serverError,
          onChanged: (option) {
            values.set(field, option ?? '');
            widget.onEdited(path);
          },
        );
      default:
        // TEXT, and a type this version does not know yet: text is what the API answers.
        return AppTextField(
          label: field.label,
          controller: values.controller(field),
          required: field.required,
          maxLength: customTextMaxLength,
          textCapitalization: TextCapitalization.sentences,
          validator: validate,
          serverError: serverError,
          onChanged: (_) => widget.onEdited(path),
        );
    }
  }
}

/// The fields could not be read: the rest of the form still works, and the server names a
/// required field it misses above the form.
class _NotLoaded extends StatelessWidget {
  const _NotLoaded({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: AppSpacing.sm,
        children: [
          const MutedText('The custom fields could not be loaded.'),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
