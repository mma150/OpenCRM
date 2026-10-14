import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/features/notifications/notification.dart';

/// The notification routes of the API. They only ever reach the caller's own rows.
class NotificationsApi {
  const NotificationsApi(this._client);

  final ApiClient _client;

  /// Newest first. The order is the server's.
  Future<Page<AppNotification>> list(int page) async {
    final response = await _client.get(
      '/notifications',
      query: ListQuery(page: page).toQuery(),
    );
    return Page.fromResponse(response, AppNotification.fromJson);
  }

  /// How many the user has not read: the number on the bell.
  Future<int> unreadCount() async {
    final response = await _client.get('/notifications/unread-count');
    return readInt(asMap(response.data), 'count');
  }

  Future<AppNotification> markRead(String id) async {
    final response = await _client.post('/notifications/$id/read');
    return AppNotification.fromJson(asMap(response.data));
  }

  Future<void> markAllRead() async {
    await _client.post('/notifications/read-all');
  }
}

final notificationsApiProvider = Provider(
  (ref) => NotificationsApi(ref.watch(apiClientProvider)),
);
