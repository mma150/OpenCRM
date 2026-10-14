import 'package:flutter/material.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/status_badge.dart';

/// Sends a follow-up to the record's own route: a null `at` clears it. Throws the
/// `ApiError` of a failure.
typedef SaveFollowUp = Future<void> Function({DateTime? at, String? note});

/// The follow-up reminder of a record that has one (`PUT .../follow-up`): what happens
/// next with it. A record page shows this under its header.
///
/// - [canSet]: the user may write and the record still takes a follow-up (it is open).
/// - [canClear]: the user may write. A follow-up that is still set on a closed record can
///   be cleared, not moved.
///
/// It takes no room when there is nothing to show and nothing to do.
class FollowUpCard extends StatelessWidget {
  const FollowUpCard({
    super.key,
    required this.at,
    required this.note,
    required this.canSet,
    required this.canClear,
    required this.onSave,
  });

  final DateTime? at;
  final String? note;
  final bool canSet;
  final bool canClear;
  final SaveFollowUp onSave;

  Future<void> _open(BuildContext context) {
    return showRecordFollowUpSheet(context, at: at, note: note, onSave: onSave);
  }

  Future<void> _clear(BuildContext context) async {
    try {
      await onSave(at: null);
      if (context.mounted) {
        showSuccessSnackBar(context, 'Follow-up cleared.');
      }
    } on ApiError catch (error) {
      if (context.mounted) {
        showErrorSnackBar(context, describeApiError(error));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final moment = at;
    final words = note;
    if (moment == null) {
      if (!canSet) {
        return const SizedBox.shrink();
      }
      return OutlinedButton.icon(
        onPressed: () => _open(context),
        icon: const Icon(Icons.event_outlined),
        label: const Text('Set follow-up'),
      );
    }
    final overdue = moment.isBefore(DateTime.now());
    final tone = overdue ? Tone.warning : Tone.info;
    return ToneBanner(
      tone: tone,
      icon: Icons.event_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${overdue ? 'Follow-up overdue' : 'Next follow-up'}: ${formatNearDateTime(moment)}',
            style: TextStyle(
              color: context.colors.tone(tone).foreground,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (words != null && words.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 2), child: Text(words)),
          if (canSet)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => _open(context),
                child: const Text('Change follow-up'),
              ),
            )
          else if (canClear)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => _clear(context),
                child: const Text('Clear follow-up'),
              ),
            ),
        ],
      ),
    );
  }
}

/// Opens the follow-up sheet of any record: when to follow up and what to do then. A
/// record that already has a follow-up ([at]) can also clear it here.
Future<void> showRecordFollowUpSheet(
  BuildContext context, {
  required DateTime? at,
  required String? note,
  required SaveFollowUp onSave,
}) {
  return showAppSheet<void>(
    context,
    title: at == null ? 'Set follow-up' : 'Change follow-up',
    builder: (context) => _FollowUpForm(at: at, note: note, onSave: onSave),
  );
}

class _FollowUpForm extends StatefulWidget {
  const _FollowUpForm({
    required this.at,
    required this.note,
    required this.onSave,
  });

  final DateTime? at;
  final String? note;
  final SaveFollowUp onSave;

  @override
  State<_FollowUpForm> createState() => _FollowUpFormState();
}

class _FollowUpFormState extends State<_FollowUpForm> {
  late final _note = TextEditingController(text: widget.note ?? '');
  late DateTime? _at = widget.at;
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
      await widget.onSave(at: at, note: _note.text);
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
        if (widget.at != null) ...[
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
