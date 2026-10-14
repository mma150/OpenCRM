import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/features/notifications/notifications_providers.dart';

/// The bell in the app bar of the four tabs, with the number of unread notifications on
/// it. It opens the notifications page. The number is part of the button's label, so a
/// screen reader says it.
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadCountProvider);
    return IconButton(
      tooltip: unread == 0 ? 'Notifications' : 'Notifications, $unread unread',
      onPressed: () => context.go(Routes.notifications),
      icon: Badge(
        isLabelVisible: unread > 0,
        backgroundColor: context.colors.primary,
        textColor: context.colors.onPrimary,
        // The tooltip says the number in words; the figure itself is not read out twice.
        label: ExcludeSemantics(child: Text(unread > 99 ? '99+' : '$unread')),
        child: const Icon(Icons.notifications_outlined),
      ),
    );
  }
}

/// Keeps the unread count fresh while the app is in use, without push notifications: it is
/// asked for when the signed-in pages appear, every minute after that, and the moment the
/// app comes back to the foreground. While the app is in the background nothing is asked.
///
/// The shell wraps the tabs in this, so it lives exactly as long as someone is signed in.
class UnreadCountPoller extends ConsumerStatefulWidget {
  const UnreadCountPoller({super.key, required this.child});

  /// How often the count is asked for while the app is in the foreground.
  static const interval = Duration(seconds: 60);

  final Widget child;

  @override
  ConsumerState<UnreadCountPoller> createState() => _UnreadCountPollerState();
}

class _UnreadCountPollerState extends ConsumerState<UnreadCountPoller>
    with WidgetsBindingObserver {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (_inForeground(WidgetsBinding.instance.lifecycleState)) {
      _start();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stop();
    super.dispose();
  }

  /// Unknown (the app has only just started) counts as the foreground. `inactive` is a
  /// call coming in or the app switcher: the app is still on screen.
  bool _inForeground(AppLifecycleState? state) {
    return state == null ||
        state == AppLifecycleState.resumed ||
        state == AppLifecycleState.inactive;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _start();
    } else if (!_inForeground(state)) {
      _stop();
    }
  }

  void _check() {
    ref.read(unreadCountProvider.notifier).refresh().ignore();
  }

  /// Asks now, then every [UnreadCountPoller.interval].
  void _start() {
    _stop();
    _check();
    _timer = Timer.periodic(UnreadCountPoller.interval, (_) => _check());
  }

  void _stop() {
    _timer?.cancel();
    _timer = null;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
