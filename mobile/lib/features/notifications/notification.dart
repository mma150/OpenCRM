import 'package:flutter/material.dart';
import 'package:opencrm/core/api/json.dart';

/// What kind of notification it is, with the words and the icon shown for it. `unknown` is
/// a kind a newer server writes that this version has no words for yet: it is still shown,
/// with its own title, as a plain "Notification".
enum NotificationKind {
  taskReminder('TASK_REMINDER', 'Task reminder', Icons.alarm),
  leadFollowUp('LEAD_FOLLOW_UP', 'Lead follow-up', Icons.notifications_active),
  opportunityFollowUp(
    'OPPORTUNITY_FOLLOW_UP',
    'Opportunity follow-up',
    Icons.notifications_active,
  ),
  taskAssigned('TASK_ASSIGNED', 'Task assigned', Icons.assignment_outlined),
  unknown('', 'Notification', Icons.notifications_none);

  const NotificationKind(this.apiValue, this.label, this.icon);

  final String apiValue;
  final String label;
  final IconData icon;

  static NotificationKind fromApi(String value) {
    return values.firstWhere(
      (kind) => kind.apiValue == value,
      orElse: () => unknown,
    );
  }
}

/// A message for the signed-in user: a reminder that came due, or a task someone gave
/// them. Named `AppNotification` because Flutter has a `Notification` of its own.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.link,
    required this.readAt,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Json json) {
    return AppNotification(
      id: readString(json, 'id'),
      kind: NotificationKind.fromApi(readString(json, 'kind')),
      title: readString(json, 'title'),
      body: readStringOrNull(json, 'body'),
      link: readString(json, 'link'),
      readAt: readDateOrNull(json, 'readAt'),
      createdAt: readDate(json, 'createdAt'),
    );
  }

  final String id;
  final NotificationKind kind;
  final String title;
  final String? body;

  /// A path of the web app, such as `/tasks?open=<id>` or `/leads/<id>`. The app turns it
  /// into one of its own routes with `appRouteForWebPath`.
  final String link;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isUnread => readAt == null;

  /// The same notification, read at [at].
  AppNotification read(DateTime at) {
    return AppNotification(
      id: id,
      kind: kind,
      title: title,
      body: body,
      link: link,
      readAt: readAt ?? at,
      createdAt: createdAt,
    );
  }
}
