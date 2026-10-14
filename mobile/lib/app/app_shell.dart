import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/navigation.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/features/notifications/notification_bell.dart';

/// The frame around the signed-in pages: the bottom bar on a phone, a navigation rail on
/// a tablet, both built from `appTabs`. Each tab keeps its own stack of pages and its
/// scroll position while another tab is shown.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  void _select(int index) {
    // Tapping the tab that is already shown goes back to its first page.
    shell.goBranch(index, initialLocation: index == shell.currentIndex);
  }

  /// Around the tabs, for as long as someone is signed in: the unread count is kept fresh
  /// (`UnreadCountPoller`), and the first page of every tab gets the bell in its app bar.
  @override
  Widget build(BuildContext context) {
    return UnreadCountPoller(
      child: TabBarActions(
        actions: const [NotificationBell()],
        child: _frame(context),
      ),
    );
  }

  Widget _frame(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= AppSpacing.wideLayout;
    if (wide) {
      return Scaffold(
        body: SafeArea(
          child: Row(
            children: [
              NavigationRail(
                selectedIndex: shell.currentIndex,
                onDestinationSelected: _select,
                labelType: NavigationRailLabelType.all,
                destinations: [
                  for (final tab in appTabs)
                    NavigationRailDestination(
                      icon: Icon(tab.icon),
                      selectedIcon: Icon(tab.selectedIcon),
                      label: Text(tab.label),
                    ),
                ],
              ),
              const VerticalDivider(width: 1),
              Expanded(child: shell),
            ],
          ),
        ),
      );
    }
    return Scaffold(
      body: shell,
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: Theme.of(context).dividerColor),
          ),
        ),
        child: NavigationBar(
          selectedIndex: shell.currentIndex,
          onDestinationSelected: _select,
          destinations: [
            for (final tab in appTabs)
              NavigationDestination(
                icon: Icon(tab.icon),
                selectedIcon: Icon(tab.selectedIcon),
                label: tab.label,
              ),
          ],
        ),
      ),
    );
  }
}
