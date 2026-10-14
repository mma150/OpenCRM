import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/features/activity/activity_screen.dart';
import 'package:opencrm/features/companies/companies_list_screen.dart';
import 'package:opencrm/features/companies/company_detail_screen.dart';
import 'package:opencrm/features/companies/company_form_screen.dart';
import 'package:opencrm/features/contacts/contact_detail_screen.dart';
import 'package:opencrm/features/contacts/contact_form_screen.dart';
import 'package:opencrm/features/contacts/contacts_list_screen.dart';
import 'package:opencrm/features/home/home_screen.dart';
import 'package:opencrm/features/leads/lead_detail_screen.dart';
import 'package:opencrm/features/leads/lead_form_screen.dart';
import 'package:opencrm/features/leads/leads_list_screen.dart';
import 'package:opencrm/features/more/more_screen.dart';
import 'package:opencrm/features/notifications/notifications_screen.dart';
import 'package:opencrm/features/opportunities/opportunities_screen.dart';
import 'package:opencrm/features/opportunities/opportunity_detail_screen.dart';
import 'package:opencrm/features/opportunities/opportunity_form_screen.dart';
import 'package:opencrm/features/tasks/tasks_screen.dart';

/// The app's navigation, in one file. To add a feature:
///
/// - **A screen of its own tab** (rare: four tabs fit a phone): add an [AppTab] to [appTabs].
/// - **A page reached from the More tab** (Contacts, Companies, Opportunities,
///   Notifications): add its routes to [moreRoutes] and one [MoreItem] to [moreItems].
/// - **A page under an existing tab** (a lead's page under Leads): add a route to that
///   tab's `routes`.
///
/// Paths are named in `routes.dart`. The router (`router.dart`) and the shell
/// (`app_shell.dart`) are built from these lists and need no change.

/// The navigator above the tabs. A route with `parentNavigatorKey: rootNavigatorKey`
/// covers the whole screen, bottom bar included: use it for forms.
final rootNavigatorKey = GlobalKey<NavigatorState>();

/// One tab of the bottom bar (the navigation rail on a tablet).
class AppTab {
  const AppTab({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.path,
    required this.builder,
    this.routes = const [],
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;

  /// The tab's first page.
  final String path;
  final WidgetBuilder builder;

  /// The pages under the tab, with paths relative to [path].
  final List<RouteBase> routes;
}

final List<AppTab> appTabs = [
  AppTab(
    label: 'Home',
    icon: Icons.home_outlined,
    selectedIcon: Icons.home,
    path: Routes.home,
    builder: (context) => const HomeScreen(),
  ),
  AppTab(
    label: 'Leads',
    icon: Icons.filter_alt_outlined,
    selectedIcon: Icons.filter_alt,
    path: Routes.leads,
    builder: (context) => const LeadsListScreen(),
    routes: [
      // Forms cover the bottom bar. "new" is listed before ":id" so it is not read as an id.
      GoRoute(
        path: 'new',
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const LeadFormScreen(),
      ),
      GoRoute(
        path: ':id',
        builder: (context, state) =>
            LeadDetailScreen(id: state.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'edit',
            parentNavigatorKey: rootNavigatorKey,
            builder: (context, state) =>
                LeadFormScreen(id: state.pathParameters['id']),
          ),
        ],
      ),
    ],
  ),
  AppTab(
    label: 'Tasks',
    icon: Icons.check_circle_outline,
    selectedIcon: Icons.check_circle,
    path: Routes.tasks,
    builder: (context) => const TasksScreen(),
  ),
  AppTab(
    label: 'More',
    icon: Icons.more_horiz,
    selectedIcon: Icons.more_horiz,
    path: Routes.more,
    builder: (context) => const MoreScreen(),
    routes: moreRoutes,
  ),
];

/// The pages reached from the More tab, with paths relative to `/more`
/// (`GoRoute(path: 'contacts', ...)` is `/more/contacts`).
final List<RouteBase> moreRoutes = [
  // Contacts. Forms cover the bottom bar; "new" is listed before ":id".
  GoRoute(
    path: 'contacts',
    builder: (context, state) => const ContactsListScreen(),
    routes: [
      GoRoute(
        path: 'new',
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => ContactFormScreen(
          companyId: state.uri.queryParameters['companyId'],
        ),
      ),
      GoRoute(
        path: ':id',
        builder: (context, state) =>
            ContactDetailScreen(id: state.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'edit',
            parentNavigatorKey: rootNavigatorKey,
            builder: (context, state) =>
                ContactFormScreen(id: state.pathParameters['id']),
          ),
        ],
      ),
    ],
  ),
  // Companies.
  GoRoute(
    path: 'companies',
    builder: (context, state) => const CompaniesListScreen(),
    routes: [
      GoRoute(
        path: 'new',
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const CompanyFormScreen(),
      ),
      GoRoute(
        path: ':id',
        builder: (context, state) =>
            CompanyDetailScreen(id: state.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'edit',
            parentNavigatorKey: rootNavigatorKey,
            builder: (context, state) =>
                CompanyFormScreen(id: state.pathParameters['id']),
          ),
        ],
      ),
    ],
  ),
  // Opportunities: the pipeline and the list on one screen.
  GoRoute(
    path: 'opportunities',
    builder: (context, state) => const OpportunitiesScreen(),
    routes: [
      GoRoute(
        path: 'new',
        parentNavigatorKey: rootNavigatorKey,
        builder: (context, state) => const OpportunityFormScreen(),
      ),
      GoRoute(
        path: ':id',
        builder: (context, state) =>
            OpportunityDetailScreen(id: state.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'edit',
            parentNavigatorKey: rootNavigatorKey,
            builder: (context, state) =>
                OpportunityFormScreen(id: state.pathParameters['id']),
          ),
        ],
      ),
    ],
  ),
  // Notifications (the bell in the app bar of the tabs leads here) and the activity feed.
  GoRoute(
    path: 'notifications',
    builder: (context, state) => const NotificationsScreen(),
  ),
  GoRoute(
    path: 'activity',
    builder: (context, state) => const ActivityScreen(),
  ),
];

/// One row of the More tab that opens a page.
class MoreItem {
  const MoreItem({
    required this.label,
    required this.icon,
    required this.path,
    this.section = 'Records',
    this.visibleTo,
  });

  final String label;
  final IconData icon;

  /// The full path, such as `/more/contacts`.
  final String path;

  /// The heading the row sits under. Rows with the same heading are grouped.
  final String section;

  /// Who sees the row; null means everyone. This only hides a row that would lead to
  /// `FORBIDDEN`: the API enforces the rule.
  final bool Function(Role role)? visibleTo;
}

/// The rows of the More tab above the account section, in order. Empty for now: the
/// account section (profile, theme, server, sign out) is the More screen's own.
final List<MoreItem> moreItems = [
  MoreItem(
    label: 'Contacts',
    icon: Icons.people_outline,
    path: Routes.contacts,
  ),
  MoreItem(
    label: 'Companies',
    icon: Icons.business_outlined,
    path: Routes.companies,
  ),
  MoreItem(
    label: 'Opportunities',
    icon: Icons.view_kanban_outlined,
    path: Routes.opportunities,
  ),
  MoreItem(
    label: 'Notifications',
    icon: Icons.notifications_outlined,
    path: Routes.notifications,
    section: 'Updates',
  ),
  MoreItem(
    label: 'Activity',
    icon: Icons.history,
    path: Routes.activity,
    section: 'Updates',
    // The API answers FORBIDDEN to a Sales Rep and a Read-only user.
    visibleTo: (role) => role.seesTeamOverview,
  ),
];

/// The rows [role] sees.
List<MoreItem> moreItemsFor(Role role, [List<MoreItem>? items]) {
  return [
    for (final item in items ?? moreItems)
      if (item.visibleTo?.call(role) ?? true) item,
  ];
}
