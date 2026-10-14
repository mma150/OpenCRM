import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import 'package:opencrm/features/companies/company_picker.dart';
import 'package:opencrm/features/contacts/contact_picker.dart';
import 'package:opencrm/features/custom_fields/custom_fields.dart';
import 'package:opencrm/features/custom_fields/custom_fields_form.dart';
import 'package:opencrm/features/leads/lead.dart' show RecordLink;
import 'package:opencrm/features/opportunities/opportunities_providers.dart';
import 'package:opencrm/features/opportunities/opportunity.dart';
import 'package:opencrm/features/pipeline_stages/pipeline_stages.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// The fields this form shows: a validation message for one of these paths goes under its
/// field, and for any other path above the form.
const _fields = {
  'name',
  'value',
  'expectedCloseDate',
  'stageId',
  'companyId',
  'contactId',
  'notes',
};

/// "New opportunity" (no [id]) and "Edit opportunity". The form checks what it can before
/// sending; what only the server knows comes back as a message under the field.
///
/// A new opportunity also chooses its stage. An existing one changes stage on its page or
/// on the pipeline, and owner with Reassign, so neither is here. The custom fields of
/// opportunities follow ([CustomFieldsSection]): a new opportunity sends the ones filled
/// in, an edit only the ones changed.
class OpportunityFormScreen extends ConsumerWidget {
  const OpportunityFormScreen({super.key, this.id});

  /// The opportunity to edit; null for a new one.
  final String? id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final opportunityId = id;
    if (opportunityId == null) {
      return const AppScaffold(
        title: 'New opportunity',
        body: _OpportunityForm(),
      );
    }
    final opportunity = ref.watch(opportunityProvider(opportunityId));
    return AppScaffold(
      title: 'Edit opportunity',
      body: opportunity.when(
        // The form is filled once: a reload while typing does not overwrite what was typed.
        skipLoadingOnReload: true,
        data: (opportunity) => _OpportunityForm(
          key: ValueKey(opportunity.id),
          opportunity: opportunity,
        ),
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.page),
          child: SkeletonList(label: 'Loading opportunity', count: 3),
        ),
        error: (error, _) => Center(
          child: SingleChildScrollView(
            child: ErrorState(
              error: ApiError.from(error),
              onRetry: () => ref.invalidate(opportunityProvider(opportunityId)),
            ),
          ),
        ),
      ),
    );
  }
}

class _OpportunityForm extends ConsumerStatefulWidget {
  const _OpportunityForm({super.key, this.opportunity});

  final Opportunity? opportunity;

  @override
  ConsumerState<_OpportunityForm> createState() => _OpportunityFormState();
}

class _OpportunityFormState extends ConsumerState<_OpportunityForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.opportunity?.name);
  late final _value = TextEditingController(
    text: _valueText(widget.opportunity?.value),
  );
  late final _notes = TextEditingController(text: widget.opportunity?.notes);
  late String? _expectedCloseDate = widget.opportunity?.expectedCloseDate;
  late PickedRecord? _company = _picked(widget.opportunity?.company);
  late PickedRecord? _contact = _picked(widget.opportunity?.contact);
  late final _custom = CustomFieldValues(
    stored: widget.opportunity?.customFields,
  );

  /// The picker offers five years back and ten ahead.
  final _now = DateTime.now();

  /// The stage chosen for a new opportunity; null is the first open stage.
  String? _stageId;
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  static PickedRecord? _picked(RecordLink? link) =>
      link == null ? null : PickedRecord(id: link.id, name: link.name);

  /// 48000 as "48000", 1250.5 as "1250.50": what a person would type. An opportunity
  /// without a value (0) starts with an empty box.
  static String _valueText(double? value) {
    if (value == null || value == 0) {
      return '';
    }
    return value == value.roundToDouble()
        ? value.toStringAsFixed(0)
        : value.toStringAsFixed(2);
  }

  @override
  void dispose() {
    for (final controller in [_name, _value, _notes]) {
      controller.dispose();
    }
    _custom.dispose();
    super.dispose();
  }

  String? _validValue(String? value) {
    final text = (value ?? '').trim();
    return RegExp(r'^(\d{1,10}(\.\d{1,2})?)?$').hasMatch(text)
        ? null
        : 'Enter an amount such as 48000 or 48000.50.';
  }

  void _clearError(String field) {
    if (_errors[field] != null) {
      setState(() => _errors = _errors.without(field));
    }
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

  Future<void> _pickContact() async {
    final contact = await showContactPicker(context, selectedId: _contact?.id);
    if (contact != null && mounted) {
      setState(() {
        _contact = contact;
        _errors = _errors.without('contactId');
      });
    }
  }

  Future<void> _save(List<Stage> stages) async {
    setState(() => _errors = ServerErrors.none);
    if (!_formKey.currentState!.validate()) {
      return;
    }
    final existing = widget.opportunity;
    final fields =
        ref.read(customFieldsProvider(RecordType.opportunity)).value ??
        const [];
    final input = OpportunityInput(
      name: _name.text,
      value: double.tryParse(_value.text.trim()),
      expectedCloseDate: _expectedCloseDate,
      stageId: _stageId ?? stages.firstOrNull?.id,
      companyId: _company?.id,
      contactId: _contact?.id,
      notes: _notes.text,
      customFields: existing == null
          ? _custom.forCreate(fields)
          : _custom.changes(fields),
    );
    setState(() => _saving = true);
    try {
      final String id;
      if (existing == null) {
        id = (await ref.read(opportunityCreatorProvider).create(input)).id;
      } else {
        await ref
            .read(opportunityProvider(existing.id).notifier)
            .save(input.changesFrom(existing));
        id = existing.id;
      }
      if (!mounted) {
        return;
      }
      showSuccessSnackBar(
        context,
        existing == null ? 'Opportunity created.' : 'Opportunity saved.',
      );
      // To the opportunity's page, with the pipeline under it.
      context.go(Routes.opportunity(id));
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

  @override
  Widget build(BuildContext context) {
    final isNew = widget.opportunity == null;
    // The open stages, for a new opportunity. Until they arrive, and when they cannot be
    // read, the field is not shown and the server puts the opportunity in the first one.
    final stages = isNew
        ? openStages(ref.watch(pipelineStagesProvider).value ?? const [])
        : const <Stage>[];
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
            AppTextField(
              label: 'Name',
              controller: _name,
              maxLength: 200,
              textCapitalization: TextCapitalization.sentences,
              serverError: _errors['name'],
              validator: (value) =>
                  (value ?? '').trim().isEmpty ? 'Enter a name.' : null,
              onChanged: (_) => _clearError('name'),
            ),
            AppTextField(
              label: 'Value (USD)',
              controller: _value,
              hint: '48000',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[\d.]')),
              ],
              autocorrect: false,
              serverError: _errors['value'],
              validator: _validValue,
              onChanged: (_) => _clearError('value'),
            ),
            DayField(
              label: 'Expected close date',
              day: _expectedCloseDate,
              firstDate: DateTime(_now.year - 5),
              lastDate: DateTime(_now.year + 10, 12, 31),
              errorText: _errors['expectedCloseDate'],
              onChanged: (day) => setState(() {
                _expectedCloseDate = day;
                _errors = _errors.without('expectedCloseDate');
              }),
            ),
            if (stages.isNotEmpty)
              AppDropdownField<String>(
                label: 'Stage',
                value: _stageId ?? stages.first.id,
                serverError: _errors['stageId'],
                options: [
                  for (final stage in stages)
                    DropdownOption(value: stage.id, label: stage.name),
                ],
                onChanged: (stageId) => setState(() {
                  _stageId = stageId;
                  _errors = _errors.without('stageId');
                }),
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
            RecordPickerField(
              label: 'Contact',
              value: _contact,
              placeholder: 'No contact',
              errorText: _errors['contactId'],
              onPick: _pickContact,
              onClear: () => setState(() {
                _contact = null;
                _errors = _errors.without('contactId');
              }),
            ),
            AppTextField(
              label: 'Notes',
              controller: _notes,
              maxLength: 10000,
              maxLines: 6,
              textCapitalization: TextCapitalization.sentences,
              serverError: _errors['notes'],
              onChanged: (_) => _clearError('notes'),
            ),
            CustomFieldsSection(
              recordType: RecordType.opportunity,
              values: _custom,
              errors: _errors,
              onEdited: _clearError,
            ),
            SubmitButton(
              label: isNew ? 'Create opportunity' : 'Save changes',
              saving: _saving,
              onPressed: () => _save(stages),
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
