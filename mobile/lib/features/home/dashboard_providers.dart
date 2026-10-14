import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/features/home/dashboard.dart';
import 'package:opencrm/features/home/team_dashboard.dart';

/// The dashboard routes of the API.
class DashboardApi {
  const DashboardApi(this._client);

  final ApiClient _client;

  /// "Today" and "this month" are the device's: its distance from UTC is sent as `tz`.
  Future<MyDashboard> me() async {
    final response = await _client.get(
      '/dashboard/me',
      query: {'tz': deviceTimeZone()},
    );
    return MyDashboard.fromJson(asMap(response.data));
  }

  /// Figures per person for the days [from] to [to] (`2026-10-05`, both included, on the
  /// device's calendar). Admins and Sales Managers only.
  Future<TeamDashboard> team({required String from, required String to}) async {
    final response = await _client.get(
      '/dashboard/team',
      query: {'from': from, 'to': to, 'tz': deviceTimeZone()},
    );
    return TeamDashboard.fromJson(asMap(response.data));
  }
}

final dashboardApiProvider = Provider(
  (ref) => DashboardApi(ref.watch(apiClientProvider)),
);

/// The signed-in user's own figures. Invalidate it after a change that moves a figure
/// (a lead created, a status changed); pull to refresh does the same.
final dashboardProvider = FutureProvider<MyDashboard>((ref) {
  ref.watch(sessionUserIdProvider);
  return ref.watch(dashboardApiProvider).me();
});

/// The team's figures for one range of days, for the Team section of Home. Kept while
/// Home scrolls the section out of view; pull to refresh and a change to a task load it
/// again.
///
/// **Only an Admin and a Sales Manager are ever asked for**: the API answers `FORBIDDEN`
/// to everyone else, so for them this fails here, before any request is made.
final teamDashboardProvider = FutureProvider.family<TeamDashboard, TeamRange>((
  ref,
  range,
) {
  final user = ref.watch(currentUserProvider);
  if (!user.role.seesTeam) {
    throw const ApiError(
      code: 'FORBIDDEN',
      message: 'The team dashboard is for Admins and Sales Managers.',
    );
  }
  final days = range.days();
  return ref.watch(dashboardApiProvider).team(from: days.from, to: days.to);
});
