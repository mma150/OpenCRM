import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/features/emails/email.dart';
import 'package:opencrm/features/tasks/task.dart' show apiRecordType;
import 'package:opencrm/features/timeline/record_ref.dart';

/// What the email sheet reads: who an email from a record usually goes to, and the
/// templates (`/email-templates`, a module of its own in the API and the web app, only
/// read here). Sending is the caller's route: a quote sends through `POST /quotes/:id/send`.
class EmailsApi {
  const EmailsApi(this._client);

  final ApiClient _client;

  /// `GET /emails/defaults`: needs only a record the caller may see.
  Future<List<EmailRecipient>> defaults(RecordRef record) async {
    final response = await _client.get(
      '/emails/defaults',
      query: {'recordType': apiRecordType(record.type), 'recordId': record.id},
    );
    return readList(
      asMap(response.data)['recipients'],
      EmailRecipient.fromJson,
    );
  }

  /// The caller's own templates and every shared one, by name. Not paged.
  Future<List<EmailTemplate>> templates() async {
    final response = await _client.get('/email-templates');
    return readList(response.data, EmailTemplate.fromJson);
  }
}

final emailsApiProvider = Provider(
  (ref) => EmailsApi(ref.watch(apiClientProvider)),
);

/// Who an email from [RecordRef] usually goes to. Read each time the sheet opens.
final emailDefaultsProvider = FutureProvider.autoDispose
    .family<List<EmailRecipient>, RecordRef>((ref, record) {
      ref.watch(sessionUserIdProvider);
      return ref.watch(emailsApiProvider).defaults(record);
    });

/// The templates the user may use. Read each time the sheet opens, so one written in the
/// web app a moment ago is there.
final emailTemplatesProvider = FutureProvider.autoDispose<List<EmailTemplate>>((
  ref,
) {
  ref.watch(sessionUserIdProvider);
  return ref.watch(emailsApiProvider).templates();
});
