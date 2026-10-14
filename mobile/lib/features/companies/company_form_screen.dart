import 'package:flutter/material.dart';
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
import 'package:opencrm/features/companies/companies_providers.dart';
import 'package:opencrm/features/companies/company.dart';

/// The fields this form shows: a validation message for one of these paths goes under its
/// field, and for any other path above the form.
const _fields = {'name', 'industry', 'website', 'phone', 'address', 'notes'};

/// How many industries are suggested under the field at a time.
const _suggestionsShown = 6;

/// "New company" (no [id]) and "Edit company". The form checks what it can before
/// sending; what only the server knows comes back as a message under the field.
///
/// Custom fields are not edited here yet. An edit leaves them as they are; a new company
/// in an installation with a *required* custom field is refused, and the form says which.
class CompanyFormScreen extends ConsumerWidget {
  const CompanyFormScreen({super.key, this.id});

  /// The company to edit; null for a new company.
  final String? id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final companyId = id;
    if (companyId == null) {
      return const AppScaffold(title: 'New company', body: _CompanyForm());
    }
    final company = ref.watch(companyProvider(companyId));
    return AppScaffold(
      title: 'Edit company',
      body: company.when(
        // The form is filled once: a reload while typing does not overwrite what was typed.
        skipLoadingOnReload: true,
        data: (company) =>
            _CompanyForm(key: ValueKey(company.id), company: company),
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.page),
          child: SkeletonList(label: 'Loading company', count: 3),
        ),
        error: (error, _) => Center(
          child: SingleChildScrollView(
            child: ErrorState(
              error: ApiError.from(error),
              onRetry: () => ref.invalidate(companyProvider(companyId)),
            ),
          ),
        ),
      ),
    );
  }
}

class _CompanyForm extends ConsumerStatefulWidget {
  const _CompanyForm({super.key, this.company});

  final Company? company;

  @override
  ConsumerState<_CompanyForm> createState() => _CompanyFormState();
}

class _CompanyFormState extends ConsumerState<_CompanyForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.company?.name);
  late final _industry = TextEditingController(text: widget.company?.industry);
  late final _website = TextEditingController(text: widget.company?.website);
  late final _phone = TextEditingController(text: widget.company?.phone);
  late final _address = TextEditingController(text: widget.company?.address);
  late final _notes = TextEditingController(text: widget.company?.notes);
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  @override
  void dispose() {
    for (final controller in [
      _name,
      _industry,
      _website,
      _phone,
      _address,
      _notes,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _validWebsite(String? value) {
    final website = (value ?? '').trim();
    return website.isEmpty || websitePattern.hasMatch(website)
        ? null
        : 'Enter a web address such as example.com.';
  }

  /// The industries in use that fit what is typed, without the one already typed in
  /// full: the field is free text, and these only save typing and keep one spelling.
  List<String> _suggestions(List<String> inUse) {
    final typed = _industry.text.trim().toLowerCase();
    return [
      for (final industry in inUse)
        if (industry.toLowerCase().contains(typed) &&
            industry.toLowerCase() != typed)
          industry,
    ].take(_suggestionsShown).toList();
  }

  void _useIndustry(String industry) {
    setState(() {
      _industry.text = industry;
      _errors = _errors.without('industry');
    });
  }

  Future<void> _save() async {
    setState(() => _errors = ServerErrors.none);
    if (!_formKey.currentState!.validate()) {
      return;
    }
    final input = CompanyInput(
      name: _name.text,
      industry: _industry.text,
      website: _website.text,
      phone: _phone.text,
      address: _address.text,
      notes: _notes.text,
    );
    setState(() => _saving = true);
    try {
      final existing = widget.company;
      final String id;
      if (existing == null) {
        id = (await ref.read(companyCreatorProvider).create(input)).id;
      } else {
        await ref.read(companyProvider(existing.id).notifier).save(input);
        id = existing.id;
      }
      if (!mounted) {
        return;
      }
      showSuccessSnackBar(
        context,
        existing == null ? 'Company created.' : 'Company saved.',
      );
      // To the company's page, with the list under it.
      context.go(Routes.company(id));
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _errors = ServerErrors.from(error, fields: _fields);
          _saving = false;
        });
      }
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
    String? hint,
    bool rebuildOnChange = false,
  }) {
    return AppTextField(
      label: label,
      controller: controller,
      validator: validator,
      maxLength: maxLength,
      maxLines: maxLines,
      keyboardType: keyboardType,
      textCapitalization: capitalization,
      hint: hint,
      autocorrect: keyboardType == null,
      serverError: _errors[field],
      onChanged: (_) {
        if (rebuildOnChange || _errors[field] != null) {
          setState(() => _errors = _errors.without(field));
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // The suggestions are an extra: the form works while they load and without them.
    final suggestions = _suggestions(
      ref.watch(companyIndustriesProvider).value ?? const [],
    );
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
              'name',
              'Company name',
              _name,
              maxLength: 200,
              capitalization: TextCapitalization.words,
              validator: (value) =>
                  (value ?? '').trim().isEmpty ? 'Enter a name.' : null,
            ),
            _text(
              'industry',
              'Industry',
              _industry,
              maxLength: 100,
              capitalization: TextCapitalization.words,
              // The suggestions follow the typing.
              rebuildOnChange: true,
            ),
            if (suggestions.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.lg),
                child: Semantics(
                  container: true,
                  label: 'Industries in use',
                  child: Wrap(
                    spacing: AppSpacing.sm,
                    children: [
                      for (final industry in suggestions)
                        ActionChip(
                          label: Text(industry),
                          materialTapTargetSize: MaterialTapTargetSize.padded,
                          onPressed: () => _useIndustry(industry),
                        ),
                    ],
                  ),
                ),
              ),
            _text(
              'website',
              'Website',
              _website,
              maxLength: 200,
              hint: 'example.com',
              keyboardType: TextInputType.url,
              validator: _validWebsite,
            ),
            _text(
              'phone',
              'Phone',
              _phone,
              maxLength: 50,
              keyboardType: TextInputType.phone,
            ),
            _text(
              'address',
              'Address',
              _address,
              maxLength: 500,
              maxLines: 3,
              capitalization: TextCapitalization.words,
            ),
            _text(
              'notes',
              'Notes',
              _notes,
              maxLength: 10000,
              maxLines: 6,
              capitalization: TextCapitalization.sentences,
            ),
            SubmitButton(
              label: widget.company == null ? 'Create company' : 'Save changes',
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
