import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/features/timeline/record_ref.dart';
import 'package:opencrm/features/timeline/timeline_entry.dart';
import 'package:opencrm/features/timeline/timeline_providers.dart';

/// The API's limit for what was discussed and for a note.
const _maxText = 5000;

/// Opens the "Log conversation" sheet for [record]: how it happened, when, and what was
/// discussed. [onSaved] runs after the entry is written, so the record's page can read the
/// record again (a conversation moves its "last contact").
Future<void> showLogConversationSheet(
  BuildContext context, {
  required RecordRef record,
  required String recordName,
  VoidCallback? onSaved,
}) {
  return showAppSheet<void>(
    context,
    title: 'Log conversation',
    builder: (context) => _LogConversationForm(
      record: record,
      recordName: recordName,
      onSaved: onSaved,
    ),
  );
}

/// Opens the "Add note" sheet for [record].
Future<void> showAddNoteSheet(
  BuildContext context, {
  required RecordRef record,
  required String recordName,
  VoidCallback? onSaved,
}) {
  return showAppSheet<void>(
    context,
    title: 'Add note',
    builder: (context) =>
        _AddNoteForm(record: record, recordName: recordName, onSaved: onSaved),
  );
}

class _LogConversationForm extends ConsumerStatefulWidget {
  const _LogConversationForm({
    required this.record,
    required this.recordName,
    this.onSaved,
  });

  final RecordRef record;
  final String recordName;
  final VoidCallback? onSaved;

  @override
  ConsumerState<_LogConversationForm> createState() =>
      _LogConversationFormState();
}

class _LogConversationFormState extends ConsumerState<_LogConversationForm> {
  final _formKey = GlobalKey<FormState>();
  final _summary = TextEditingController();
  ConversationType _type = ConversationType.call;
  DateTime _occurredAt = DateTime.now();
  String? _whenError;
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  @override
  void dispose() {
    _summary.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    // The server allows a clock that runs up to five minutes fast.
    final inFuture = _occurredAt.isAfter(
      DateTime.now().add(const Duration(minutes: 5)),
    );
    setState(() {
      _whenError = inFuture
          ? 'The date and time cannot be in the future.'
          : null;
      _errors = ServerErrors.none;
    });
    if (!_formKey.currentState!.validate() || inFuture) {
      return;
    }
    setState(() => _saving = true);
    try {
      await ref
          .read(timelineWriterProvider)
          .logConversation(
            widget.record,
            type: _type,
            occurredAt: _occurredAt,
            summary: _summary.text.trim(),
          );
      if (!mounted) {
        return;
      }
      widget.onSaved?.call();
      showSuccessSnackBar(context, 'Conversation logged.');
      Navigator.of(context).pop();
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _errors = ServerErrors.from(
            error,
            fields: {'summary', 'occurredAt', 'type'},
          );
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
          FormErrorBanner(_errors.form),
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: MutedText('With ${widget.recordName}'),
          ),
          LabeledField(
            label: 'Type',
            child: Semantics(
              container: true,
              child: Wrap(
                spacing: 8,
                children: [
                  for (final type in ConversationType.values)
                    ChoiceChip(
                      label: Text(type.label),
                      selected: _type == type,
                      materialTapTargetSize: MaterialTapTargetSize.padded,
                      labelStyle: TextStyle(
                        color: _type == type
                            ? Theme.of(context).colorScheme.onPrimary
                            : Theme.of(context).colorScheme.onSurface,
                        fontWeight: FontWeight.w500,
                      ),
                      onSelected: (_) => setState(() => _type = type),
                    ),
                ],
              ),
            ),
          ),
          DateTimeField(
            label: 'Date and time',
            value: _occurredAt,
            firstDate: DateTime(2000),
            lastDate: DateTime.now(),
            errorText: _whenError ?? _errors['occurredAt'],
            onChanged: (moment) => setState(() {
              _occurredAt = moment;
              _whenError = null;
              _errors = _errors.without('occurredAt');
            }),
          ),
          AppTextField(
            label: 'What was discussed?',
            controller: _summary,
            hint: 'What you talked about and what was agreed',
            maxLines: 6,
            maxLength: _maxText,
            textCapitalization: TextCapitalization.sentences,
            serverError: _errors['summary'],
            onChanged: (_) =>
                setState(() => _errors = _errors.without('summary')),
            validator: (value) => (value ?? '').trim().isEmpty
                ? 'Write what was discussed.'
                : null,
          ),
          SubmitButton(
            label: 'Save conversation',
            saving: _saving,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}

class _AddNoteForm extends ConsumerStatefulWidget {
  const _AddNoteForm({
    required this.record,
    required this.recordName,
    this.onSaved,
  });

  final RecordRef record;
  final String recordName;
  final VoidCallback? onSaved;

  @override
  ConsumerState<_AddNoteForm> createState() => _AddNoteFormState();
}

class _AddNoteFormState extends ConsumerState<_AddNoteForm> {
  final _formKey = GlobalKey<FormState>();
  final _body = TextEditingController();
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  @override
  void dispose() {
    _body.dispose();
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
          .read(timelineWriterProvider)
          .addNote(widget.record, _body.text.trim());
      if (!mounted) {
        return;
      }
      widget.onSaved?.call();
      showSuccessSnackBar(context, 'Note added.');
      Navigator.of(context).pop();
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          _errors = ServerErrors.from(error, fields: {'body'});
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
          FormErrorBanner(_errors.form),
          AppTextField(
            label: 'Note',
            controller: _body,
            hint: 'Anything worth remembering about ${widget.recordName}',
            maxLines: 6,
            maxLength: _maxText,
            textCapitalization: TextCapitalization.sentences,
            serverError: _errors['body'],
            onChanged: (_) => setState(() => _errors = _errors.without('body')),
            validator: (value) =>
                (value ?? '').trim().isEmpty ? 'Write the note first.' : null,
          ),
          SubmitButton(label: 'Save note', saving: _saving, onPressed: _save),
        ],
      ),
    );
  }
}
