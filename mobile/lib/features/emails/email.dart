import 'package:opencrm/core/api/json.dart';

/// How many addresses "To" and "Cc" each take: the API's limit.
const maxRecipients = 10;

/// The API's limits of an email's text.
const maxEmailSubject = 200;
const maxEmailBody = 20000;

/// One address: something, an @, a domain with a dot. The mail server has the last word.
/// The same rule as the web's `recipients.ts`.
final _emailAddress = RegExp(r'^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$');

bool isEmailAddress(String value) =>
    value.length <= 254 && _emailAddress.hasMatch(value);

/// What typing [text] into a list of addresses gives: the list with each valid address of
/// [text] added in lower case (as the API stores it), what could not be added ([rest], for
/// the user to correct) and why ([problem]). [text] may hold several addresses, pasted or
/// separated by commas, semicolons or spaces; one already in the list is dropped without a
/// word. The web's `addRecipients`, with its sentences.
({List<String> value, String rest, String? problem}) addRecipients(
  List<String> value,
  String text, {
  int max = maxRecipients,
}) {
  final next = [...value];
  final rest = <String>[];
  String? problem;
  for (final address in text.toLowerCase().split(RegExp(r'[,;\s]+'))) {
    if (address.isEmpty || next.contains(address)) {
      continue;
    }
    if (!isEmailAddress(address)) {
      rest.add(address);
      problem ??=
          '"$address" is not a valid email address. Correct it or clear it.';
    } else if (next.length >= max) {
      rest.add(address);
      problem ??= 'Use $max addresses or fewer.';
    } else {
      next.add(address);
    }
  }
  return (value: next, rest: rest.join(', '), problem: problem);
}

/// Someone an email from a record usually goes to (`GET /emails/defaults`): a lead's own
/// address, a contact's, the contacts of a company, an opportunity's contact.
class EmailRecipient {
  const EmailRecipient({required this.name, required this.email});

  factory EmailRecipient.fromJson(Json json) {
    return EmailRecipient(
      name: readString(json, 'name'),
      email: readString(json, 'email').toLowerCase(),
    );
  }

  final String name;

  /// In lower case, as the API stores an address.
  final String email;
}

/// A template the user may use (`GET /email-templates`): their own and the shared ones.
/// The subject and body hold `{{placeholders}}`, filled in by the server when the email is
/// sent. Templates are written in the web app; the app only applies them.
class EmailTemplate {
  const EmailTemplate({
    required this.id,
    required this.name,
    required this.subject,
    required this.body,
    required this.shared,
    required this.ownerId,
  });

  factory EmailTemplate.fromJson(Json json) {
    return EmailTemplate(
      id: readString(json, 'id'),
      name: readString(json, 'name'),
      subject: readString(json, 'subject'),
      body: readString(json, 'body'),
      shared: readBool(json, 'shared'),
      ownerId: readString(asMap(json['owner']), 'id'),
    );
  }

  final String id;
  final String name;
  final String subject;
  final String body;
  final bool shared;
  final String ownerId;

  /// "Follow-up (shared)" for a shared template of someone else, as on the web.
  String labelFor(String userId) =>
      shared && ownerId != userId ? '$name (shared)' : name;
}

/// What the email sheet hands over when the user presses Send.
class EmailMessage {
  const EmailMessage({
    required this.to,
    this.cc = const [],
    required this.subject,
    required this.body,
  });

  final List<String> to;
  final List<String> cc;
  final String subject;
  final String body;

  /// `{ to, cc?, subject, body }`: the email of `POST /quotes/:id/send`.
  Json toJson() {
    return {
      'to': to,
      if (cc.isNotEmpty) 'cc': cc,
      'subject': subject,
      'body': body,
    };
  }
}
