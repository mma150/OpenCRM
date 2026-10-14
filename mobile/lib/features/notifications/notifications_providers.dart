import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/paged.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/state/paged_notifier.dart';
import 'package:opencrm/features/notifications/notification.dart';
import 'package:opencrm/features/notifications/notifications_api.dart';

/// How many notifications the signed-in user has not read: the number on the bell.
///
/// Nothing is pushed to the phone. The number is asked for while the app is open
/// (`UnreadCountPoller`), and is 0 until the first answer.
class UnreadCountController extends Notifier<int> {
  @override
  int build() {
    // The next person to sign in starts without the last one's number.
    ref.watch(sessionUserIdProvider);
    return 0;
  }

  /// Asks the server. A failure keeps the number on screen: the next ask corrects it, and
  /// a bell is not worth an error message. (A session that ended still signs the user out,
  /// in the API client.)
  Future<void> refresh() async {
    final int count;
    try {
      count = await ref.read(notificationsApiProvider).unreadCount();
    } on ApiError {
      return;
    }
    if (!ref.mounted) {
      return;
    }
    if (count != state) {
      state = count;
      // Something arrived, or was read elsewhere: the list is out of date too.
      ref.invalidate(notificationsListProvider);
    }
  }

  /// One was read here.
  void oneRead() => state = state > 0 ? state - 1 : 0;

  void allRead() => state = 0;
}

final unreadCountProvider = NotifierProvider<UnreadCountController, int>(
  UnreadCountController.new,
);

/// The signed-in user's notifications, newest first, page by page.
class NotificationsListController extends PagedNotifier<AppNotification> {
  @override
  PagedState<AppNotification> build() => start();

  @override
  Future<Page<AppNotification>> fetchPage(int page) {
    return ref.read(notificationsApiProvider).list(page);
  }

  @override
  Object idOf(AppNotification item) => item.id;

  void _markLocally(bool Function(AppNotification item) which) {
    final now = DateTime.now();
    state = state.copyWith(
      items: [
        for (final item in state.items) which(item) ? item.read(now) : item,
      ],
    );
  }

  /// Marks one as read: here at once, then on the server. It is not worth stopping for
  /// when the server cannot be reached: the next load shows it unread again.
  Future<void> markRead(AppNotification notification) async {
    if (!notification.isUnread) {
      return;
    }
    _markLocally((item) => item.id == notification.id);
    ref.read(unreadCountProvider.notifier).oneRead();
    try {
      await ref.read(notificationsApiProvider).markRead(notification.id);
    } on ApiError {
      // See above.
    }
  }

  /// Marks every one as read. Throws the `ApiError` so the screen can say so.
  Future<void> markAllRead() async {
    await ref.read(notificationsApiProvider).markAllRead();
    if (ref.mounted) {
      _markLocally((item) => true);
      ref.read(unreadCountProvider.notifier).allRead();
    }
  }
}

final notificationsListProvider =
    NotifierProvider<NotificationsListController, PagedState<AppNotification>>(
      NotificationsListController.new,
    );
