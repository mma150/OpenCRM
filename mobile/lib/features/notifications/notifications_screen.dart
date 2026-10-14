import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/record_routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/paged_list_view.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/notifications/notification.dart';
import 'package:opencrm/features/notifications/notifications_providers.dart';

/// Everything the signed-in user was told, newest first: reminders of tasks and
/// follow-ups, and tasks someone gave them. A tap marks one as read and goes to the task
/// or the record it is about. The bell in the app bar of the tabs leads here.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  void _open(
    BuildContext context,
    WidgetRef ref,
    AppNotification notification,
  ) {
    ref
        .read(notificationsListProvider.notifier)
        .markRead(notification)
        .ignore();
    final route = appRouteForWebPath(notification.link);
    if (route == null) {
      // A page the web app has and this app does not (yet).
      showErrorSnackBar(
        context,
        'The app cannot open what this notification is about. Open it in the web app.',
      );
      return;
    }
    context.go(route);
  }

  Future<void> _markAllRead(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(notificationsListProvider.notifier).markAllRead();
      if (context.mounted) {
        showSuccessSnackBar(context, 'All notifications are marked as read.');
      }
    } on ApiError catch (error) {
      if (context.mounted) {
        showErrorSnackBar(context, describeApiError(error));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsListProvider);
    final unread = ref.watch(unreadCountProvider);
    final list = ref.read(notificationsListProvider.notifier);

    return AppScaffold(
      title: 'Notifications',
      body: PagedListView<AppNotification>(
        state: notifications,
        onRefresh: () async {
          ref.read(unreadCountProvider.notifier).refresh().ignore();
          await list.refresh();
        },
        onLoadMore: list.loadMore,
        onRetry: list.retry,
        loadingLabel: 'Loading notifications',
        emptyTitle: 'No notifications yet',
        emptyMessage: 'Reminders for your tasks and follow-ups, and tasks someone gives you, will show here.',
        header: Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: AppSpacing.md,
            children: [
              MutedText(
                unread == 0 ? 'You have read everything.' : '$unread unread',
              ),
              if (unread > 0)
                TextButton.icon(
                  onPressed: () => _markAllRead(context, ref),
                  icon: const Icon(Icons.done_all, size: 18),
                  label: const Text('Mark all as read'),
                ),
            ],
          ),
        ),
        itemBuilder: (context, notification) => NotificationCard(
          notification: notification,
          onTap: () => _open(context, ref, notification),
        ),
      ),
    );
  }
}

/// One notification: an icon for its kind, the title, a second line, and when. An unread
/// one has a bolder title and the word "New" beside it, never colour alone.
class NotificationCard extends StatelessWidget {
  const NotificationCard({
    super.key,
    required this.notification,
    required this.onTap,
  });

  final AppNotification notification;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final unread = notification.isUnread;
    final tone = context.colors.tone(unread ? Tone.info : Tone.neutral);
    final body = notification.body;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: tone.background,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  notification.kind.icon,
                  size: 18,
                  color: tone.foreground,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            notification.title,
                            style: text.bodyLarge?.copyWith(
                              fontWeight: unread
                                  ? FontWeight.w600
                                  : FontWeight.w400,
                            ),
                          ),
                        ),
                        if (unread) ...[
                          const SizedBox(width: AppSpacing.sm),
                          const StatusBadge(label: 'New', tone: Tone.info),
                        ],
                      ],
                    ),
                    if (body != null && body.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      MutedText(body, maxLines: 2),
                    ],
                    const SizedBox(height: 2),
                    MutedText(
                      '${notification.kind.label} · ${formatRelativeTime(notification.createdAt)}',
                      small: true,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
