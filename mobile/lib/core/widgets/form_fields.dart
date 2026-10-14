import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/status_badge.dart';

/// What the server said about a form that was sent: a message per field for a validation
/// failure, and one sentence above the form for everything else.
///
/// ```dart
/// try {
///   await save();
/// } on ApiError catch (error) {
///   setState(() => _errors = ServerErrors.from(error, fields: {'firstName', 'email'}));
/// }
/// ```
class ServerErrors {
  const ServerErrors({this.fields = const {}, this.form});

  static const none = ServerErrors();

  /// [fields] are the paths this form has a field for. A validation message for any other
  /// path (a required custom field the form does not show) goes above the form instead
  /// of being lost.
  factory ServerErrors.from(ApiError error, {required Set<String> fields}) {
    final byField = error.fieldErrors;
    if (error.code != ApiError.validationFailed || byField.isEmpty) {
      return ServerErrors(form: describeApiError(error));
    }
    final shown = {
      for (final entry in byField.entries)
        if (fields.contains(entry.key)) entry.key: entry.value,
    };
    final others = [
      for (final entry in byField.entries)
        if (!fields.contains(entry.key)) entry.value,
    ];
    return ServerErrors(
      fields: shown,
      form: others.isEmpty ? null : others.join(' '),
    );
  }

  final Map<String, String> fields;
  final String? form;

  String? operator [](String field) => fields[field];

  /// The same errors without the one for [field]: call it when the user edits the field.
  ServerErrors without(String field) {
    if (!fields.containsKey(field)) {
      return this;
    }
    return ServerErrors(fields: {...fields}..remove(field), form: form);
  }
}

/// The sentence above a form when saving failed. Announced by screen readers.
class FormErrorBanner extends StatelessWidget {
  const FormErrorBanner(this.message, {super.key});

  final String? message;

  @override
  Widget build(BuildContext context) {
    final text = message;
    if (text == null) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Semantics(
        liveRegion: true,
        child: ToneBanner(
          tone: Tone.danger,
          icon: Icons.error_outline,
          child: Text(
            text,
            style: TextStyle(
              color: context.colors.tone(Tone.danger).foreground,
            ),
          ),
        ),
      ),
    );
  }
}

/// A label above a form control, with the space under it. Every field of every form is
/// laid out through this, so labels look the same everywhere.
class LabeledField extends StatelessWidget {
  const LabeledField({super.key, required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ExcludeSemantics(
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelLarge
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(height: 6),
          // The visible label is outside the control; this names it for screen readers.
          Semantics(label: label, child: child),
        ],
      ),
    );
  }
}

/// A text field with its label above it. [validator] is the check before sending;
/// [serverError] is what the API said about this field after sending.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.label,
    required this.controller,
    this.validator,
    this.serverError,
    this.onChanged,
    this.hint,
    this.keyboardType,
    this.textInputAction = TextInputAction.next,
    this.textCapitalization = TextCapitalization.none,
    this.autofillHints,
    this.inputFormatters,
    this.maxLength,
    this.maxLines = 1,
    this.obscureText = false,
    this.autocorrect = true,
    this.suffixIcon,
    this.onSubmitted,
    this.enabled = true,
  });

  final String label;
  final TextEditingController controller;
  final FormFieldValidator<String>? validator;
  final String? serverError;
  final ValueChanged<String>? onChanged;
  final String? hint;
  final TextInputType? keyboardType;
  final TextInputAction textInputAction;
  final TextCapitalization textCapitalization;
  final Iterable<String>? autofillHints;
  final List<TextInputFormatter>? inputFormatters;

  /// The API's limit. Typing stops there; no counter is shown.
  final int? maxLength;
  final int maxLines;
  final bool obscureText;
  final bool autocorrect;
  final Widget? suffixIcon;
  final ValueChanged<String>? onSubmitted;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return LabeledField(
      label: label,
      child: TextFormField(
        controller: controller,
        validator: validator,
        onChanged: onChanged,
        enabled: enabled,
        keyboardType: maxLines > 1 ? TextInputType.multiline : keyboardType,
        textInputAction: maxLines > 1
            ? TextInputAction.newline
            : textInputAction,
        textCapitalization: textCapitalization,
        autofillHints: autofillHints,
        inputFormatters: inputFormatters,
        maxLength: maxLength,
        maxLines: maxLines,
        minLines: maxLines > 1 ? 3 : 1,
        obscureText: obscureText,
        autocorrect: autocorrect,
        enableSuggestions: autocorrect,
        onFieldSubmitted: onSubmitted,
        decoration: InputDecoration(
          hintText: hint,
          errorText: serverError,
          counterText: '',
          suffixIcon: suffixIcon,
        ),
      ),
    );
  }
}

/// A password field with a button that shows what was typed.
class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.label,
    required this.controller,
    this.validator,
    this.onSubmitted,
  });

  final String label;
  final TextEditingController controller;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onSubmitted;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _hidden = true;

  @override
  Widget build(BuildContext context) {
    return AppTextField(
      label: widget.label,
      controller: widget.controller,
      validator: widget.validator,
      obscureText: _hidden,
      autocorrect: false,
      autofillHints: const [AutofillHints.password],
      textInputAction: TextInputAction.done,
      onSubmitted: widget.onSubmitted,
      // The API's limit for a password.
      maxLength: 128,
      suffixIcon: IconButton(
        tooltip: _hidden ? 'Show password' : 'Hide password',
        icon: Icon(
          _hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
        ),
        onPressed: () => setState(() => _hidden = !_hidden),
      ),
    );
  }
}

/// One choice of an [AppDropdownField].
class DropdownOption<T> {
  const DropdownOption({required this.value, required this.label});

  final T value;
  final String label;
}

/// Picks one value from a short list, with its label above it.
class AppDropdownField<T> extends StatelessWidget {
  const AppDropdownField({
    super.key,
    required this.label,
    required this.options,
    required this.value,
    required this.onChanged,
    this.hint,
    this.validator,
    this.serverError,
  });

  final String label;
  final List<DropdownOption<T>> options;
  final T? value;
  final ValueChanged<T?> onChanged;
  final String? hint;
  final FormFieldValidator<T>? validator;
  final String? serverError;

  @override
  Widget build(BuildContext context) {
    return LabeledField(
      label: label,
      child: DropdownButtonFormField<T>(
        initialValue: value,
        isExpanded: true,
        validator: validator,
        onChanged: onChanged,
        hint: hint == null ? null : Text(hint!),
        decoration: InputDecoration(errorText: serverError),
        items: [
          for (final option in options)
            DropdownMenuItem(
              value: option.value,
              child: Text(option.label, overflow: TextOverflow.ellipsis),
            ),
        ],
      ),
    );
  }
}

/// Picks a date and a time with the platform's pickers, with its label above it.
class DateTimeField extends StatelessWidget {
  const DateTimeField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    required this.firstDate,
    required this.lastDate,
    this.errorText,
    this.placeholder = 'Choose a date and time',
  });

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime> onChanged;
  final DateTime firstDate;
  final DateTime lastDate;
  final String? errorText;
  final String placeholder;

  Future<void> _pick(BuildContext context) async {
    final current = value ?? DateTime.now();
    final initial = current.isBefore(firstDate)
        ? firstDate
        : (current.isAfter(lastDate) ? lastDate : current);
    final day = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: firstDate,
      lastDate: lastDate,
    );
    if (day == null || !context.mounted) {
      return;
    }
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(current),
    );
    if (time != null) {
      onChanged(DateTime(day.year, day.month, day.day, time.hour, time.minute));
    }
  }

  @override
  Widget build(BuildContext context) {
    final moment = value;
    return LabeledField(
      label: label,
      child: Semantics(
        button: true,
        child: InkWell(
          borderRadius: AppSpacing.borderRadius,
          onTap: () => _pick(context),
          child: InputDecorator(
            decoration: InputDecoration(
              errorText: errorText,
              suffixIcon: const Icon(Icons.calendar_today_outlined),
            ),
            child: Text(
              moment == null ? placeholder : formatDateTime(moment),
              style: moment == null
                  ? TextStyle(color: context.colors.textMuted)
                  : null,
            ),
          ),
        ),
      ),
    );
  }
}

/// The button that sends a form. While [saving] it shows a spinner and cannot be pressed
/// again, so nothing is sent twice.
class SubmitButton extends StatelessWidget {
  const SubmitButton({
    super.key,
    required this.label,
    required this.saving,
    required this.onPressed,
    this.destructive = false,
  });

  final String label;
  final bool saving;
  final VoidCallback onPressed;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      style: destructive
          ? FilledButton.styleFrom(
              backgroundColor: context.colors.tone(Tone.danger).foreground,
              // The tone's pale background as the text: white on the dark theme's light
              // red would be hard to read.
              foregroundColor: context.colors.tone(Tone.danger).background,
            )
          : null,
      onPressed: saving ? null : onPressed,
      child: saving
          ? const SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                semanticsLabel: 'Saving',
              ),
            )
          : Text(label),
    );
  }
}
