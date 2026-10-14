import 'package:opencrm/app/routes.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// The page of a record in the app, or null while its kind has no page here. Everything
/// that names a record it does not own (a task's linked record, a notification, an entry
/// of the activity feed) asks this, and shows the name without a link when the answer is
/// null.
String? recordRoute(RecordType type, String id) {
  return switch (type) {
    RecordType.lead => Routes.lead(id),
    RecordType.contact => Routes.contact(id),
    RecordType.company => Routes.company(id),
    RecordType.opportunity => Routes.opportunity(id),
  };
}

/// Where a link the API wrote for the web app leads in this app, or null when it has no
/// page here. The API's links are paths of the web app (backend.md, "Notifications"):
/// `/tasks?open=<id>`, `/leads/<id>`, `/opportunities/<id>`. Only a path is ever followed,
/// never a full address.
String? appRouteForWebPath(String link) {
  final uri = Uri.tryParse(link);
  if (uri == null ||
      uri.hasScheme ||
      uri.hasAuthority ||
      !link.startsWith('/')) {
    return null;
  }
  final segments = uri.pathSegments;
  if (segments.length == 1 && segments.first == 'tasks') {
    final open = uri.queryParameters['open'] ?? '';
    return open.isEmpty ? Routes.tasks : Routes.openTask(open);
  }
  if (segments.length == 2 && segments[1].isNotEmpty) {
    for (final type in RecordType.values) {
      if (type.apiPath == segments.first) {
        return recordRoute(type, segments[1]);
      }
    }
  }
  return null;
}
