import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/emails/email.dart';
import 'package:opencrm/features/emails/emails_api.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// Opens the email sheet over everything (it covers the bottom bar): To and Cc as chips,
/// a template, the subject and the message, and Send. The app's side of the web's
/// `send-email-dialog.tsx`, without its preview.
///
/// [record] is the record the email is sent from: its usual recipients fill "To", and the
/// server fills the placeholders from it. [send] sends the message (a quote passes its own
/// route) and throws an `ApiError`, which the sheet shows above the form, keeping the draft
/// as it is. Answers true when the email was sent.
///
/// ```dart
/// showSendEmailSheet(
///   context,
///   record: RecordRef(RecordType.opportunity, quote.opportunity.id),
///   recordName: quote.opportunity.name,
///   title: 'Email quote Q-0001',
///   note: 'Q-0001.pdf will be attached.',
///   send: (message) => controller.sendByEmail(message),
/// );
/// ```
Future<bool> showSendEmailSheet(
  BuildContext context, {
  required RecordRef record,
  required String recordName,
  required String title,
  required Future<void> Function(EmailMessage message) send,
  String? note,
  String subject = '',
  String body = '',
}) async {
  final sent = await Navigator.of(context, rootNavigator: true).push<bool>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (context) => SendEmailSheet(
        record: record,
        recordName: recordName,
        title: title,
        note: note,
        subject: subject,
        body: body,
        send: send,
      ),
    ),
  );
  return sent ?? false;
}

class SendEmailSheet extends ConsumerStatefulWidget {
  const SendEmailSheet({
    super.key,
    required this.record,
    required this.recordName,
    required this.title,
    required this.send,
    this.note,
    this.subject = '',
    this.body = '',
  });

  final RecordRef record;
  final String recordName;
  final String title;
  final Future<void> Function(EmailMessage message) send;
  final String? note;
  final String subject;
  final String body;

  @override
  ConsumerState<SendEmailSheet> createState() => _SendEmailSheetState();
}

class _SendEmailSheetState extends ConsumerState<SendEmailSheet> {
  /// The paths of a validation failure this form shows under a field. The API names one
  /// address by its place (`to.2`, or `email.to.2` for a quote); [_forFields] reads both
  /// as the whole list.
  static const _fields = {'to', 'cc', 'subject', 'body'};

  final _formKey = GlobalKey<FormState>();
  final _scroll = ScrollController();
  late final _subject = TextEditingController(text: widget.subject);
  late final _body = TextEditingController(text: widget.body);
  final _toText = TextEditingController();
  final _ccText = TextEditingController();

  List<String> _to = const [];
  List<String> _cc = const [];
  bool _showCc = false;

  /// Something typed in "To" or "Cc" that is not an address, or a list that is empty or
  /// too long: said under the box.
  String? _toProblem;
  String? _ccProblem;

  /// The text the last template (or the caller) put in the boxes. Text that is still
  /// exactly that was not written by the user, so a template may replace it without asking.
  late ({String subject, String body}) _given = (
    subject: widget.subject,
    body: widget.body,
  );
  String? _templateId;

  /// Counts the refused replacements: a new value rebuilds the dropdown, which then shows
  /// the template chosen before again.
  int _templateRevision = 0;

  ServerErrors _errors = ServerErrors.none;
  bool _sending = false;

  /// "To" was changed by the user: the usual recipient no longer fills it.
  bool _toTouched = false;

  @override
  void initState() {
    super.initState();
    // One usual recipient (an opportunity's contact) fills "To"; several are offered.
    ref.listenManual(emailDefaultsProvider(widget.record), (previous, next) {
      final recipients = next.value;
      if (recipients != null &&
          recipients.length == 1 &&
          _to.isEmpty &&
          !_toTouched &&
          mounted) {
        setState(() => _to = [recipients.single.email]);
      }
    }, fireImmediately: true);
  }

  @override
  void dispose() {
    _scroll.dispose();
    _subject.dispose();
    _body.dispose();
    _toText.dispose();
    _ccText.dispose();
    super.dispose();
  }

  /// Adds what is typed in "To" ([cc] false) or "Cc" to its list.
  void _commit({required bool cc}) {
    final text = cc ? _ccText : _toText;
    // Leaving the box also commits, which can happen while the sheet closes.
    if (!mounted || text.text.trim().isEmpty) {
      return;
    }
    final result = addRecipients(cc ? _cc : _to, text.text);
    setState(() {
      text.text = result.rest;
      if (cc) {
        _cc = result.value;
        _ccProblem = result.problem;
        _errors = _errors.without('cc');
      } else {
        _to = result.value;
        _toProblem = result.problem;
        _toTouched = true;
        _errors = _errors.without('to');
      }
    });
  }

  void _remove(String address, {required bool cc}) {
    setState(() {
      if (cc) {
        _cc = [..._cc]..remove(address);
        _ccProblem = null;
        _errors = _errors.without('cc');
      } else {
        _to = [..._to]..remove(address);
        _toProblem = null;
        _toTouched = true;
        _errors = _errors.without('to');
      }
    });
  }

  void _addSuggested(EmailRecipient recipient) {
    if (_to.length >= maxRecipients) {
      return;
    }
    setState(() {
      _to = [..._to, recipient.email];
      _toTouched = true;
      _toProblem = null;
      _errors = _errors.without('to');
    });
  }

  Future<void> _chooseTemplate(EmailTemplate template) async {
    final subject = _subject.text;
    final body = _body.text;
    final empty = subject.trim().isEmpty && body.trim().isEmpty;
    final untouched = subject == _given.subject && body == _given.body;
    if (!empty && !untouched) {
      final replace = await showConfirmDialog(
        context,
        title: 'Replace what you wrote?',
        message:
            'The template "${template.name}" replaces the subject and the message you '
            'have now.',
        confirmLabel: 'Replace',
      );
      if (!replace || !mounted) {
        // The dropdown goes back to the template that was chosen before.
        setState(() => _templateRevision++);
        return;
      }
    }
    setState(() {
      _templateId = template.id;
      _given = (subject: template.subject, body: template.body);
      _subject.text = template.subject;
      _body.text = template.body;
      _errors = _errors.without('subject').without('body');
    });
  }

  /// The API's paths as this form's fields: `email.to.2` and `to.2` are "To".
  ApiError _forFields(ApiError error) {
    final details = error.details;
    if (details is! List) {
      return error;
    }
    return ApiError(
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      requestId: error.requestId,
      details: [
        for (final item in details)
          if (item is Map && item['path'] is String)
            {
              ...item,
              'path': (item['path'] as String)
                  .replaceFirst(RegExp(r'^email\.'), '')
                  .replaceAllMapped(
                    RegExp(r'^(to|cc)\.\d+$'),
                    (match) => match.group(1)!,
                  ),
            }
          else
            item,
      ],
    );
  }

  ServerErrors _serverErrors(ApiError error, Role role) {
    switch (error.code) {
      case 'EMAIL_NOT_CONFIGURED':
        return ServerErrors(
          form:
              'Outgoing email is not set up, so nothing was sent. Your draft is kept. '
              '${role == Role.admin ? 'You can set it up in the web app under Settings, Email.' : 'Ask an Admin to set it up under Settings, Email.'}',
        );
      case 'RATE_LIMITED':
        return ServerErrors(
          form:
              'You have sent a lot of emails in a short time, so this one was not sent. '
              '${retryHint(error)}',
        );
      default:
        return ServerErrors.from(_forFields(error), fields: _fields);
    }
  }

  Future<void> _send(Role role) async {
    _commit(cc: false);
    _commit(cc: true);
    setState(() {
      _errors = ServerErrors.none;
      if (_to.isEmpty && _toProblem == null) {
        _toProblem = 'Add at least one address.';
      }
    });
    final fieldsValid = _formKey.currentState!.validate();
    if (!fieldsValid || _toProblem != null || _ccProblem != null) {
      return;
    }
    setState(() => _sending = true);
    final message = EmailMessage(
      to: _to,
      cc: _cc,
      subject: _subject.text,
      body: _body.text,
    );
    try {
      await widget.send(message);
      if (!mounted) {
        return;
      }
      final others = _to.length - 1 + _cc.length;
      showSuccessSnackBar(
        context,
        others == 0
            ? 'Email sent to ${_to.first}.'
            : 'Email sent to ${_to.first} and $others more.',
      );
      Navigator.of(context).pop(true);
    } on ApiError catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _sending = false;
        _errors = _serverErrors(error, role);
        if (_errors['cc'] != null) {
          _showCc = true;
        }
      });
      // The reason is above the form: bring it into view.
      if (_errors.form != null && _scroll.hasClients) {
        await _scroll.animateTo(
          0,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(currentUserProvider);
    final recipients =
        ref.watch(emailDefaultsProvider(widget.record)).value ?? const [];
    final templates = ref.watch(emailTemplatesProvider).value ?? const [];
    final names = {
      for (final recipient in recipients) recipient.email: recipient.name,
    };
    final suggestions = recipients.length > 1
        ? [
            for (final recipient in recipients)
              if (!_to.contains(recipient.email) &&
                  !_cc.contains(recipient.email))
                recipient,
          ]
        : const <EmailRecipient>[];
    final note = widget.note;

    return PopScope(
      // Not while the email is on its way: its answer would have nowhere to go.
      canPop: !_sending,
      child: AppScaffold(
        title: widget.title,
        bottomBar: SizedBox(
          width: double.infinity,
          child: SubmitButton(
            label: 'Send email',
            saving: _sending,
            onPressed: () => _send(me.role),
          ),
        ),
        body: SingleChildScrollView(
          controller: _scroll,
          padding: const EdgeInsets.all(AppSpacing.page),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                MutedText(widget.recordName),
                const SizedBox(height: AppSpacing.lg),
                if (note != null) ...[
                  ToneBanner(
                    tone: Tone.info,
                    icon: Icons.attach_file,
                    child: Text(note),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
                FormErrorBanner(_errors.form),
                _RecipientsField(
                  label: 'To',
                  addresses: _to,
                  controller: _toText,
                  names: names,
                  error: _toProblem ?? _errors['to'],
                  onCommit: () => _commit(cc: false),
                  onRemove: (address) => _remove(address, cc: false),
                  onEdited: () => setState(() {
                    _toProblem = null;
                    _errors = _errors.without('to');
                  }),
                ),
                if (suggestions.isNotEmpty) ...[
                  MutedText('Contacts of ${widget.recordName}:', small: true),
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.xs,
                    children: [
                      for (final recipient in suggestions)
                        ActionChip(
                          label: Text(
                            '+ ${recipient.name}',
                            overflow: TextOverflow.ellipsis,
                          ),
                          tooltip:
                              'Add ${recipient.name} (${recipient.email}) to To',
                          onPressed: _to.length >= maxRecipients
                              ? null
                              : () => _addSuggested(recipient),
                        ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
                if (_showCc)
                  _RecipientsField(
                    label: 'Cc',
                    addresses: _cc,
                    controller: _ccText,
                    names: names,
                    error: _ccProblem ?? _errors['cc'],
                    onCommit: () => _commit(cc: true),
                    onRemove: (address) => _remove(address, cc: true),
                    onEdited: () => setState(() {
                      _ccProblem = null;
                      _errors = _errors.without('cc');
                    }),
                  )
                else
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: TextButton.icon(
                        onPressed: () => setState(() => _showCc = true),
                        icon: const Icon(Icons.add),
                        label: const Text('Add Cc'),
                      ),
                    ),
                  ),
                if (templates.isNotEmpty)
                  AppDropdownField<String>(
                    // A new key puts the dropdown back when a replacement was refused.
                    key: ValueKey('template-$_templateRevision'),
                    label: 'Template',
                    hint: 'Choose a template',
                    value: _templateId,
                    options: [
                      for (final template in templates)
                        DropdownOption(
                          value: template.id,
                          label: template.labelFor(me.id),
                        ),
                    ],
                    onChanged: (id) {
                      final template = templates
                          .where((candidate) => candidate.id == id)
                          .firstOrNull;
                      if (template != null) {
                        _chooseTemplate(template);
                      }
                    },
                  ),
                AppTextField(
                  label: 'Subject',
                  controller: _subject,
                  maxLength: maxEmailSubject,
                  textCapitalization: TextCapitalization.sentences,
                  serverError: _errors['subject'],
                  onChanged: (_) =>
                      setState(() => _errors = _errors.without('subject')),
                  validator: (value) =>
                      (value ?? '').trim().isEmpty ? 'Enter a subject.' : null,
                ),
                AppTextField(
                  label: 'Message',
                  controller: _body,
                  maxLines: 12,
                  maxLength: maxEmailBody,
                  textCapitalization: TextCapitalization.sentences,
                  serverError: _errors['body'],
                  onChanged: (_) =>
                      setState(() => _errors = _errors.without('body')),
                  validator: (value) => (value ?? '').trim().isEmpty
                      ? 'Write the message.'
                      : null,
                ),
                MutedText(
                  'Words in {{double braces}} are filled in when the email is sent, '
                  "such as {{contact.firstName}} with the contact's first name.",
                  small: true,
                ),
                const SizedBox(height: AppSpacing.sm),
                MutedText(
                  'Sent as plain text from ${me.name}; replies go to ${me.email}. The '
                  'email is added to the timeline of ${widget.recordName}.',
                  small: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "To" or "Cc": each address is a chip with a remove button, and the box under them
/// takes the next one. The keyboard's Done, a comma, a semicolon, a space or leaving the box
/// adds what was typed; an address that is not valid stays in the box with a message, so
/// nothing typed is lost.
class _RecipientsField extends StatelessWidget {
  const _RecipientsField({
    required this.label,
    required this.addresses,
    required this.controller,
    required this.names,
    required this.error,
    required this.onCommit,
    required this.onRemove,
    required this.onEdited,
  });

  final String label;
  final List<String> addresses;
  final TextEditingController controller;

  /// The name that belongs to an address, when it is known: shown on its chip.
  final Map<String, String> names;
  final String? error;
  final VoidCallback onCommit;
  final ValueChanged<String> onRemove;
  final VoidCallback onEdited;

  @override
  Widget build(BuildContext context) {
    return LabeledField(
      label: label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (addresses.isNotEmpty) ...[
            LayoutBuilder(
              builder: (context, constraints) => Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.xs,
                children: [
                  for (final address in addresses)
                    InputChip(
                      label: ConstrainedBox(
                        // Room for the remove button: a long address is cut, not overflowing.
                        constraints: BoxConstraints(
                          maxWidth: (constraints.maxWidth - 72).clamp(
                            40,
                            double.infinity,
                          ),
                        ),
                        child: Text(
                          names[address] == null
                              ? address
                              : '${names[address]} <$address>',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      deleteButtonTooltipMessage: 'Remove $address',
                      onDeleted: () => onRemove(address),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          Focus(
            onFocusChange: (focused) {
              if (!focused) {
                onCommit();
              }
            },
            child: TextField(
              controller: controller,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.done,
              autocorrect: false,
              enableSuggestions: false,
              decoration: InputDecoration(
                hintText: addresses.isEmpty
                    ? 'name@example.com'
                    : 'Add another address',
                errorText: error,
                errorMaxLines: 3,
              ),
              onChanged: (text) {
                if (text.contains(RegExp(r'[,;\s]'))) {
                  onCommit();
                } else {
                  onEdited();
                }
              },
              onSubmitted: (_) => onCommit(),
            ),
          ),
        ],
      ),
    );
  }
}
