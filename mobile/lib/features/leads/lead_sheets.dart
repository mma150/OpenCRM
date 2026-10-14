import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/leads/lead.dart';
import 'package:opencrm/features/leads/leads_providers.dart';

/// Opens "Mark as lost": the reason (required) and a note.
Future<void> showMarkLostSheet(BuildContext context, Lead lead) {
  return showAppSheet<void>(
    context,
    title: 'Mark as lost',
    builder: (context) => _MarkLostForm(lead),
  );
}

/// Opens the follow-up sheet: when to follow up and what to do then. A lead that already
/// has a follow-up can also clear it here.
Future<void> showFollowUpSheet(BuildContext context, Lead lead) {
  return showAppSheet<void>(
    context,
    title: lead.followUpAt == null ? 'Set follow-up' : 'Change follow-up',
    builder: (context) => _FollowUpForm(lead),
  );
}

class _MarkLostForm extends ConsumerStatefulWidget {
  const _MarkLostForm(this.lead);

  final Lead lead;

  @override
  ConsumerState<_MarkLostForm> createState() => _MarkLostFormState();
}

class _MarkLostFormState extends ConsumerState<_MarkLostForm> {
  final _formKey = GlobalKey<FormState>();
  final _note = TextEditingController();
  LostReason? _reason;
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _errors = ServerErrors.none);
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() => _saving = true);
    try {
      await ref
          .read(leadProvider(widget.lead.id).notifier)
          .markLost(reason: _reason!, note: _note.text);
      if (!mounted) {
        return;
      }
      showSuccessSnackBar(context, 'Lead marked as lost.');
      Navigator.of(context).pop();
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _errors = ServerErrors.from(error, fields: {'reason', 'note'});
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.lg),
            child: MutedText(
              '${widget.lead.name} leaves the open leads. The lead can be reopened later.',
            ),
          ),
          FormErrorBanner(_errors.form),
          AppDropdownField<LostReason>(
            label: 'Reason',
            hint: 'Select a reason',
            value: _reason,
            serverError: _errors['reason'],
            options: [
              for (final reason in LostReason.values)
                DropdownOption(value: reason, label: reason.label),
            ],
            onChanged: (reason) => setState(() {
              _reason = reason;
              _errors = _errors.without('reason');
            }),
            validator: (reason) => reason == null ? 'Choose a reason.' : null,
          ),
          AppTextField(
            label: 'Note (optional)',
            controller: _note,
            maxLines: 4,
            maxLength: 1000,
            textCapitalization: TextCapitalization.sentences,
            serverError: _errors['note'],
            onChanged: (_) => setState(() => _errors = _errors.without('note')),
          ),
          SubmitButton(
            label: 'Mark as lost',
            saving: _saving,
            destructive: true,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}

class _FollowUpForm extends ConsumerStatefulWidget {
  const _FollowUpForm(this.lead);

  final Lead lead;

  @override
  ConsumerState<_FollowUpForm> createState() => _FollowUpFormState();
}

class _FollowUpFormState extends ConsumerState<_FollowUpForm> {
  late final _note = TextEditingController(
    text: widget.lead.followUpNote ?? '',
  );
  late DateTime? _at = widget.lead.followUpAt;
  String? _atError;
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _send(DateTime? at, String done) async {
    setState(() {
      _saving = true;
      _errors = ServerErrors.none;
    });
    try {
      await ref
          .read(leadProvider(widget.lead.id).notifier)
          .setFollowUp(at: at, note: _note.text);
      if (!mounted) {
        return;
      }
      showSuccessSnackBar(context, done);
      Navigator.of(context).pop();
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _errors = ServerErrors.from(error, fields: {'at', 'note'});
          _saving = false;
        });
      }
    }
  }

  Future<void> _save() async {
    final at = _at;
    if (at == null) {
      setState(() => _atError = 'Choose when to follow up.');
      return;
    }
    await _send(at, 'Follow-up saved.');
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FormErrorBanner(_errors.form),
        DateTimeField(
          label: 'Follow up on',
          value: _at,
          firstDate: DateTime(now.year - 1),
          lastDate: DateTime(now.year + 5),
          errorText: _atError ?? _errors['at'],
          onChanged: (moment) => setState(() {
            _at = moment;
            _atError = null;
            _errors = _errors.without('at');
          }),
        ),
        AppTextField(
          label: 'What to do (optional)',
          controller: _note,
          hint: 'Send the pricing, call back about the demo',
          maxLines: 3,
          maxLength: 500,
          textCapitalization: TextCapitalization.sentences,
          serverError: _errors['note'],
          onChanged: (_) => setState(() => _errors = _errors.without('note')),
        ),
        SubmitButton(
          label: 'Save follow-up',
          saving: _saving,
          onPressed: _save,
        ),
        if (widget.lead.followUpAt != null) ...[
          const SizedBox(height: AppSpacing.sm),
          TextButton(
            onPressed: _saving ? null : () => _send(null, 'Follow-up cleared.'),
            child: const Text('Clear follow-up'),
          ),
        ],
      ],
    );
  }
}
