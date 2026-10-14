import 'package:flutter/material.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/opportunities/opportunity.dart';
import 'package:opencrm/features/pipeline_stages/pipeline_stages.dart';

/// Runs something that changes an opportunity and says how it went: [done] when it
/// worked, the error in words when it did not.
Future<void> runOpportunityAction(
  BuildContext context,
  Future<void> Function() action, {
  required String done,
}) async {
  try {
    await action();
    if (context.mounted) {
      showSuccessSnackBar(context, done);
    }
  } on ApiError catch (error) {
    if (context.mounted) {
      showErrorSnackBar(context, describeApiError(error));
    }
  }
}

/// Opens "Move to stage" for an open opportunity and answers with the stage chosen, or
/// null when the sheet is dismissed. [stages] is what to offer, in pipeline order: an open
/// stage is offered by its name (the one the opportunity is in is left out), the Won and
/// the Lost stage as "Close as won" and "Close as lost". The caller moves the opportunity
/// for an open stage and opens [showCloseSheet] for the other two.
Future<Stage?> showMoveToStageSheet(
  BuildContext context, {
  required Opportunity opportunity,
  required List<Stage> stages,
}) {
  return showOptionsSheet<Stage>(
    context,
    title: 'Move to stage',
    options: [
      for (final stage in stages)
        if (stage.id != opportunity.stage.id)
          switch (stage.kind) {
            StageKind.open => SheetOption(
              value: stage,
              label: stage.name,
              icon: Icons.arrow_forward,
            ),
            StageKind.won => SheetOption(
              value: stage,
              label: 'Close as won',
              icon: Icons.check_circle_outline,
            ),
            StageKind.lost => SheetOption(
              value: stage,
              label: 'Close as lost',
              icon: Icons.highlight_off,
            ),
          },
    ],
  );
}

/// Sends the outcome to the API: the board's or the page's own `close`.
typedef CloseOpportunity = Future<void> Function({
  required CloseOutcome outcome,
  String? reason,
});

/// Opens "Close as won" or "Close as lost": the reason, needed for lost and optional for
/// won.
Future<void> showCloseSheet(
  BuildContext context, {
  required Opportunity opportunity,
  required CloseOutcome outcome,
  required CloseOpportunity onClose,
}) {
  return showAppSheet<void>(
    context,
    title: 'Close as ${outcome.word}',
    builder: (context) => _CloseForm(
      opportunity: opportunity,
      outcome: outcome,
      onClose: onClose,
    ),
  );
}

class _CloseForm extends StatefulWidget {
  const _CloseForm({
    required this.opportunity,
    required this.outcome,
    required this.onClose,
  });

  final Opportunity opportunity;
  final CloseOutcome outcome;
  final CloseOpportunity onClose;

  @override
  State<_CloseForm> createState() => _CloseFormState();
}

class _CloseFormState extends State<_CloseForm> {
  final _formKey = GlobalKey<FormState>();
  final _reason = TextEditingController();
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  bool get _lost => widget.outcome == CloseOutcome.lost;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _errors = ServerErrors.none);
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.onClose(outcome: widget.outcome, reason: _reason.text);
      if (!mounted) {
        return;
      }
      showSuccessSnackBar(
        context,
        '${widget.opportunity.name} was closed as ${widget.outcome.word}.',
      );
      Navigator.of(context).pop();
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _errors = ServerErrors.from(error, fields: {'reason'});
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.opportunity.name;
    return Form(
      key: _formKey,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.lg),
            child: MutedText(
              _lost
                  ? 'Record why $name was not won. You can reopen it later.'
                  : '$name moves to the Won stage. You can reopen it later.',
            ),
          ),
          FormErrorBanner(_errors.form),
          AppTextField(
            label: _lost ? 'Reason' : 'Reason (optional)',
            controller: _reason,
            hint: _lost ? null : 'What made the difference',
            maxLines: 4,
            maxLength: 1000,
            textCapitalization: TextCapitalization.sentences,
            serverError: _errors['reason'],
            validator: (value) => _lost && (value ?? '').trim().isEmpty
                ? 'Say why the opportunity was lost.'
                : null,
            onChanged: (_) =>
                setState(() => _errors = _errors.without('reason')),
          ),
          SubmitButton(
            label: 'Close as ${widget.outcome.word}',
            saving: _saving,
            destructive: _lost,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}
