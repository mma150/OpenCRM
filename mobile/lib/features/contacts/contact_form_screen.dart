import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/record_picker.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/companies/companies_providers.dart';
import 'package:opencrm/features/companies/company_picker.dart';
import 'package:opencrm/features/contacts/contact.dart';
import 'package:opencrm/features/contacts/contacts_providers.dart';
import 'package:opencrm/features/custom_fields/custom_fields.dart';
import 'package:opencrm/features/custom_fields/custom_fields_form.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// The fields this form shows: a validation message for one of these paths goes under its
/// field, and for any other path above the form.
const _fields = {
  'firstName',
  'lastName',
  'jobTitle',
  'email',
  'phone',
  'companyId',
  'notes',
};

const _loading = Padding(
  padding: EdgeInsets.all(AppSpacing.page),
  child: SkeletonList(label: 'Loading contact', count: 3),
);

/// "New contact" (no [id]) and "Edit contact". [companyId] starts a new contact in that
/// company: the "Add contact" button on a company's page (`/more/contacts/new?companyId=`).
///
/// The custom fields of contacts follow the contact's own ([CustomFieldsSection]): a new
/// contact sends the ones filled in, an edit only the ones changed.
class ContactFormScreen extends ConsumerWidget {
  const ContactFormScreen({super.key, this.id, this.companyId});

  /// The contact to edit; null for a new contact.
  final String? id;

  /// The company a new contact starts in; null for none.
  final String? companyId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contactId = id;
    if (contactId != null) {
      final contact = ref.watch(contactProvider(contactId));
      return AppScaffold(
        title: 'Edit contact',
        body: contact.when(
          // The form is filled once: a reload while typing does not overwrite what was typed.
          skipLoadingOnReload: true,
          data: (contact) =>
              _ContactForm(key: ValueKey(contact.id), contact: contact),
          loading: () => _loading,
          error: (error, _) => Center(
            child: SingleChildScrollView(
              child: ErrorState(
                error: ApiError.from(error),
                onRetry: () => ref.invalidate(contactProvider(contactId)),
              ),
            ),
          ),
        ),
      );
    }

    final startIn = companyId;
    if (startIn == null) {
      return const AppScaffold(title: 'New contact', body: _ContactForm());
    }
    // The company's name is needed to show it in the field. A company that cannot be read
    // (deleted, or outside the user's reach) is left out: the form still works.
    final company = ref.watch(companyProvider(startIn));
    return AppScaffold(
      title: 'New contact',
      body: company.hasValue || company.hasError
          ? _ContactForm(
              key: ValueKey('in-$startIn'),
              startIn: company.hasValue
                  ? PickedRecord(id: startIn, name: company.requireValue.name)
                  : null,
              backTo: Routes.company(startIn),
            )
          : _loading,
    );
  }
}

class _ContactForm extends ConsumerStatefulWidget {
  const _ContactForm({super.key, this.contact, this.startIn, this.backTo});

  final Contact? contact;

  /// The company a new contact starts in.
  final PickedRecord? startIn;

  /// Where Cancel goes when the form was not opened from the list.
  final String? backTo;

  @override
  ConsumerState<_ContactForm> createState() => _ContactFormState();
}

class _ContactFormState extends ConsumerState<_ContactForm> {
  final _formKey = GlobalKey<FormState>();
  late final _firstName = TextEditingController(
    text: widget.contact?.firstName,
  );
  late final _lastName = TextEditingController(text: widget.contact?.lastName);
  late final _jobTitle = TextEditingController(text: widget.contact?.jobTitle);
  late final _email = TextEditingController(text: widget.contact?.email);
  late final _phone = TextEditingController(text: widget.contact?.phone);
  late final _notes = TextEditingController(text: widget.contact?.notes);
  late PickedRecord? _company = _startingCompany();
  late final _custom = CustomFieldValues(stored: widget.contact?.customFields);
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  PickedRecord? _startingCompany() {
    final company = widget.contact?.company;
    return company == null
        ? widget.startIn
        : PickedRecord(id: company.id, name: company.name);
  }

  @override
  void dispose() {
    for (final controller in [
      _firstName,
      _lastName,
      _jobTitle,
      _email,
      _phone,
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

  Future<void> _pickCompany() async {
    final company = await showCompanyPicker(context, selectedId: _company?.id);
    if (company != null && mounted) {
      setState(() {
        _company = company;
        _errors = _errors.without('companyId');
      });
    }
  }

  Future<void> _save() async {
    setState(() => _errors = ServerErrors.none);
    if (!_formKey.currentState!.validate()) {
      return;
    }
    final existing = widget.contact;
    final fields =
        ref.read(customFieldsProvider(RecordType.contact)).value ?? const [];
    final input = ContactInput(
      firstName: _firstName.text,
      lastName: _lastName.text,
      jobTitle: _jobTitle.text,
      email: _email.text,
      phone: _phone.text,
      companyId: _company?.id,
      // An edit that did not touch the company leaves it out: one the reader may not see
      // reads as no company, and sending that would unlink it.
      sendCompany: existing == null || _company?.id != existing.company?.id,
      notes: _notes.text,
      customFields: existing == null
          ? _custom.forCreate(fields)
          : _custom.changes(fields),
    );
    setState(() => _saving = true);
    try {
      final String id;
      if (existing == null) {
        id = (await ref.read(contactCreatorProvider).create(input)).id;
      } else {
        await ref.read(contactProvider(existing.id).notifier).save(input);
        id = existing.id;
      }
      if (!mounted) {
        return;
      }
      showSuccessSnackBar(
        context,
        existing == null ? 'Contact created.' : 'Contact saved.',
      );
      // To the contact's page, with the list under it.
      context.go(Routes.contact(id));
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
  }) {
    return AppTextField(
      label: label,
      controller: controller,
      validator: validator,
      maxLength: maxLength,
      maxLines: maxLines,
      keyboardType: keyboardType,
      textCapitalization: capitalization,
      autocorrect: keyboardType == null,
      serverError: _errors[field],
      onChanged: (_) => _clearError(field),
    );
  }

  @override
  Widget build(BuildContext context) {
    final backTo = widget.backTo;
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
              validator: (value) => _required(value, 'Enter a first name.'),
            ),
            _text(
              'lastName',
              'Last name',
              _lastName,
              maxLength: 100,
              capitalization: TextCapitalization.words,
              validator: (value) => _required(value, 'Enter a last name.'),
            ),
            _text(
              'jobTitle',
              'Job title',
              _jobTitle,
              maxLength: 100,
              capitalization: TextCapitalization.words,
            ),
            RecordPickerField(
              label: 'Company',
              value: _company,
              placeholder: 'No company',
              errorText: _errors['companyId'],
              onPick: _pickCompany,
              onClear: () => setState(() {
                _company = null;
                _errors = _errors.without('companyId');
              }),
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
            _text(
              'notes',
              'Notes',
              _notes,
              maxLength: 10000,
              maxLines: 6,
              capitalization: TextCapitalization.sentences,
            ),
            CustomFieldsSection(
              recordType: RecordType.contact,
              values: _custom,
              errors: _errors,
              onEdited: _clearError,
            ),
            SubmitButton(
              label: widget.contact == null ? 'Create contact' : 'Save changes',
              saving: _saving,
              onPressed: _save,
            ),
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              onPressed: _saving
                  ? null
                  : () => backTo == null ? context.pop() : context.go(backTo),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }
}
