import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/custom_fields/custom_fields.dart';
import 'package:opencrm/features/custom_fields/custom_fields_form.dart';
import 'package:opencrm/features/leads/lead.dart';
import 'package:opencrm/features/leads/leads_providers.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// The fields this form shows: a validation message for one of these paths goes under its
/// field, and for any other path above the form.
const _fields = {
  'firstName',
  'lastName',
  'company',
  'jobTitle',
  'email',
  'phone',
  'source',
  'estimatedValue',
  'notes',
};

/// "New lead" (no [id]) and "Edit lead". The form checks what it can before sending; what
/// only the server knows comes back as a message under the field.
///
/// The custom fields of leads follow the lead's own ([CustomFieldsSection]): a new lead
/// sends the ones filled in, an edit only the ones changed.
class LeadFormScreen extends ConsumerWidget {
  const LeadFormScreen({super.key, this.id});

  /// The lead to edit; null for a new lead.
  final String? id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leadId = id;
    if (leadId == null) {
      return const AppScaffold(title: 'New lead', body: _LeadForm());
    }
    final lead = ref.watch(leadProvider(leadId));
    return AppScaffold(
      title: 'Edit lead',
      body: lead.when(
        // The form is filled once: a reload while typing does not overwrite what was typed.
        skipLoadingOnReload: true,
        data: (lead) => _LeadForm(key: ValueKey(lead.id), lead: lead),
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.page),
          child: SkeletonList(label: 'Loading lead', count: 3),
        ),
        error: (error, _) => Center(
          child: SingleChildScrollView(
            child: ErrorState(
              error: ApiError.from(error),
              onRetry: () => ref.invalidate(leadProvider(leadId)),
            ),
          ),
        ),
      ),
    );
  }
}

class _LeadForm extends ConsumerStatefulWidget {
  const _LeadForm({super.key, this.lead});

  final Lead? lead;

  @override
  ConsumerState<_LeadForm> createState() => _LeadFormState();
}

class _LeadFormState extends ConsumerState<_LeadForm> {
  final _formKey = GlobalKey<FormState>();
  late final _firstName = TextEditingController(text: widget.lead?.firstName);
  late final _lastName = TextEditingController(text: widget.lead?.lastName);
  late final _company = TextEditingController(text: widget.lead?.company);
  late final _jobTitle = TextEditingController(text: widget.lead?.jobTitle);
  late final _email = TextEditingController(text: widget.lead?.email);
  late final _phone = TextEditingController(text: widget.lead?.phone);
  late final _value = TextEditingController(
    text: _valueText(widget.lead?.estimatedValue),
  );
  late final _notes = TextEditingController(text: widget.lead?.notes);
  late LeadSource? _source = widget.lead?.source;
  late final _custom = CustomFieldValues(stored: widget.lead?.customFields);
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  /// 48000 as "48000", 1250.5 as "1250.50": what a person would type.
  static String _valueText(double? value) {
    if (value == null) {
      return '';
    }
    return value == value.roundToDouble()
        ? value.toStringAsFixed(0)
        : value.toStringAsFixed(2);
  }

  @override
  void dispose() {
    for (final controller in [
      _firstName,
      _lastName,
      _company,
      _jobTitle,
      _email,
      _phone,
      _value,
      _notes,
    ]) {
      controller.dispose();
    }
    _custom.dispose();
    super.dispose();
  }

  String? _required(String? value, String message) =>
      (value ?? '').trim().isEmpty ? message : null;

  String? _validEmail(String? value) {
    final email = (value ?? '').trim();
    // The server has the real rule; this catches a slip of the thumb.
    return email.isEmpty ||
            RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)
        ? null
        : 'Enter a valid email address.';
  }

  String? _validValue(String? value) {
    final text = (value ?? '').trim();
    if (text.isEmpty) {
      return null;
    }
    final amount = double.tryParse(text);
    if (amount == null ||
        amount < 0 ||
        !RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(text)) {
      return 'Enter an amount such as 48000 or 1250.50.';
    }
    return amount > 9999999999.99 ? 'Enter a smaller amount.' : null;
  }

  Future<void> _save() async {
    setState(() => _errors = ServerErrors.none);
    if (!_formKey.currentState!.validate()) {
      return;
    }
    final existing = widget.lead;
    final fields =
        ref.read(customFieldsProvider(RecordType.lead)).value ?? const [];
    final input = LeadInput(
      firstName: _firstName.text,
      lastName: _lastName.text,
      source: _source!,
      company: _company.text,
      jobTitle: _jobTitle.text,
      email: _email.text,
      phone: _phone.text,
      estimatedValue: double.tryParse(_value.text.trim()),
      notes: _notes.text,
      customFields: existing == null
          ? _custom.forCreate(fields)
          : _custom.changes(fields),
    );
    setState(() => _saving = true);
    try {
      final String id;
      if (existing == null) {
        id = (await ref.read(leadCreatorProvider).create(input)).id;
      } else {
        await ref.read(leadProvider(existing.id).notifier).save(input);
        id = existing.id;
      }
      if (!mounted) {
        return;
      }
      showSuccessSnackBar(
        context,
        existing == null ? 'Lead created.' : 'Lead saved.',
      );
      // To the lead's page, with the list under it.
      context.go(Routes.lead(id));
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _errors = ServerErrors.from(
            error,
            fields: {..._fields, ...customFieldPaths(fields)},
          );
          _saving = false;
        });
      }
    }
  }

  /// Takes the server's message off a field the user changed.
  void _clearError(String field) {
    if (_errors[field] != null) {
      setState(() => _errors = _errors.without(field));
    }
  }

  /// A text field of this form: its server message, cleared when the user edits it.
  Widget _text(
    String field,
    String label,
    TextEditingController controller, {
    FormFieldValidator<String>? validator,
    int? maxLength,
    int maxLines = 1,
    TextInputType? keyboardType,
    TextCapitalization capitalization = TextCapitalization.none,
    Iterable<String>? autofillHints,
    List<TextInputFormatter>? inputFormatters,
    String? hint,
  }) {
    return AppTextField(
      label: label,
      controller: controller,
      validator: validator,
      maxLength: maxLength,
      maxLines: maxLines,
      keyboardType: keyboardType,
      textCapitalization: capitalization,
      autofillHints: autofillHints,
      inputFormatters: inputFormatters,
      hint: hint,
      autocorrect: keyboardType == null,
      serverError: _errors[field],
      onChanged: (_) => _clearError(field),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      // A Column in a scroll view, not a ListView: a ListView drops the fields that are
      // scrolled out of view, and a field that is not there is not validated.
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.page),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FormErrorBanner(_errors.form),
            _text(
              'firstName',
              'First name',
              _firstName,
              maxLength: 100,
              capitalization: TextCapitalization.words,
              validator: (value) => _required(value, 'Enter the first name.'),
            ),
            _text(
              'lastName',
              'Last name',
              _lastName,
              maxLength: 100,
              capitalization: TextCapitalization.words,
              validator: (value) => _required(value, 'Enter the last name.'),
            ),
            _text(
              'company',
              'Company',
              _company,
              maxLength: 200,
              capitalization: TextCapitalization.words,
            ),
            _text(
              'jobTitle',
              'Job title',
              _jobTitle,
              maxLength: 100,
              capitalization: TextCapitalization.words,
            ),
            _text(
              'email',
              'Email',
              _email,
              maxLength: 254,
              keyboardType: TextInputType.emailAddress,
              validator: _validEmail,
            ),
            _text(
              'phone',
              'Phone',
              _phone,
              maxLength: 50,
              keyboardType: TextInputType.phone,
            ),
            AppDropdownField<LeadSource>(
              label: 'Source',
              hint: 'Where the lead came from',
              value: _source,
              serverError: _errors['source'],
              options: [
                for (final source in LeadSource.values)
                  DropdownOption(value: source, label: source.label),
              ],
              onChanged: (source) => setState(() {
                _source = source;
                _errors = _errors.without('source');
              }),
              validator: (source) => source == null ? 'Choose a source.' : null,
            ),
            _text(
              'estimatedValue',
              'Estimated value (USD)',
              _value,
              hint: '48000',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[\d.]')),
              ],
              validator: _validValue,
            ),
            _text(
              'notes',
              'Notes',
              _notes,
              maxLength: 10000,
              maxLines: 6,
              capitalization: TextCapitalization.sentences,
            ),
            CustomFieldsSection(
              recordType: RecordType.lead,
              values: _custom,
              errors: _errors,
              onEdited: _clearError,
            ),
            SubmitButton(
              label: widget.lead == null ? 'Create lead' : 'Save changes',
              saving: _saving,
              onPressed: _save,
            ),
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              onPressed: _saving ? null : () => context.pop(),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }
}
