import 'package:flutter/material.dart';
import 'package:opencrm/core/theme/app_spacing.dart';

/// The frame of every screen: an app bar with the title, the body inside the safe area
/// and never wider than a readable column, and an optional bar of actions at the bottom.
class AppScaffold extends StatelessWidget {
  const AppScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions = const [],
    this.bottomBar,
  });

  final String title;
  final Widget body;

  /// In the app bar. A screen's main action goes here as a button with its label
  /// ("New lead"), not in a floating button: that would cover the last row of a list.
  final List<Widget> actions;

  /// Buttons that stay in reach under the body, such as "Log conversation".
  final Widget? bottomBar;

  @override
  Widget build(BuildContext context) {
    final bar = bottomBar;
    // The first page of a tab also gets what the shell adds to every tab (the bell).
    final isTabRoot = ModalRoute.of(context)?.isFirst ?? false;
    return Scaffold(
      appBar: AppBar(
        title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [if (isTabRoot) ...TabBarActions.of(context), ...actions],
      ),
      body: SafeArea(child: ContentWidth(child: body)),
      bottomNavigationBar: bar == null
          ? null
          : Material(
              color: Theme.of(context).colorScheme.surface,
              shape: Border(
                top: BorderSide(color: Theme.of(context).dividerColor),
              ),
              child: SafeArea(
                top: false,
                // As tall as the buttons only: without heightFactor the bar would take the
                // whole screen and cover the page.
                child: ContentWidth(
                  heightFactor: 1,
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: bar,
                  ),
                ),
              ),
            ),
    );
  }
}

/// Centres its child and caps it at [AppSpacing.contentMaxWidth], so a list or a form on
/// a tablet is a readable column instead of a stretched one.
class ContentWidth extends StatelessWidget {
  const ContentWidth({super.key, required this.child, this.heightFactor});

  final Widget child;

  /// Null fills the height it is given (a page); 1 is as tall as the child (a bar).
  final double? heightFactor;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      heightFactor: heightFactor,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: AppSpacing.contentMaxWidth),
        child: child,
      ),
    );
  }
}

/// Actions the shell puts in the app bar of every tab's first page, before the page's own:
/// the notification bell. `AppShell` wraps the tabs in this; [AppScaffold] reads it. A
/// page under a tab (a lead) and a form above the tabs do not get them.
class TabBarActions extends InheritedWidget {
  const TabBarActions({super.key, required this.actions, required super.child});

  final List<Widget> actions;

  /// The shell's actions, or none outside the shell (the pages before sign-in).
  static List<Widget> of(BuildContext context) {
    return context
            .dependOnInheritedWidgetOfExactType<TabBarActions>()
            ?.actions ??
        const [];
  }

  @override
  bool updateShouldNotify(TabBarActions oldWidget) =>
      oldWidget.actions != actions;
}
