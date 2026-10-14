import 'package:opencrm/core/api/json.dart';

/// The four roles of OpenCRM, with the value the API uses and the words shown for it.
enum Role {
  admin('ADMIN', 'Admin'),
  salesManager('SALES_MANAGER', 'Sales Manager'),
  salesRep('SALES_REP', 'Sales Rep'),
  readOnly('READ_ONLY', 'Read-only');

  const Role(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static Role fromApi(String value) {
    return values.firstWhere(
      (role) => role.apiValue == value,
      // A role this version does not know may see and change the least.
      orElse: () => Role.readOnly,
    );
  }

  /// What this role may do with the owned records it can see (leads, contacts, companies,
  /// opportunities). The API decides which records those are and enforces every rule;
  /// the app only avoids offering what would be refused. The same rule as the web app's
  /// `recordAccess` and the API's `record-access.ts`.
  ///
  /// Read-only sees every record but changes nothing.
  bool get canWriteRecords => this != Role.readOnly;

  /// Handing a record to another owner is for Admins and Sales Managers.
  bool get canReassignRecords =>
      this == Role.admin || this == Role.salesManager;

  /// Admins and Sales Managers look after other people's work: they see everyone's tasks
  /// and narrow Home's lists to their own records.
  bool get seesTeam => this == Role.admin || this == Role.salesManager;

  /// The team dashboard and the activity feed: Admins, Sales Managers and Read-only users
  /// (who are there to watch the team). A Sales Rep gets `FORBIDDEN`.
  bool get seesTeamOverview => this != Role.salesRep;
}

/// The signed-in user, as `GET /auth/me` and `POST /auth/token` answer.
class User {
  const User({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
  });

  factory User.fromJson(Json json) {
    return User(
      id: readString(json, 'id'),
      name: readString(json, 'name'),
      email: readString(json, 'email'),
      role: Role.fromApi(readString(json, 'role')),
    );
  }

  final String id;
  final String name;
  final String email;
  final Role role;

  /// "Priya" from "Priya Shah", for the greeting.
  String get firstName => name.trim().split(RegExp(r'\s+')).first;
}

/// `{ id, name }`: how the API names a person on a record (an owner, an author).
class PersonRef {
  const PersonRef({required this.id, required this.name});

  factory PersonRef.fromJson(Json json) {
    return PersonRef(
      id: readString(json, 'id'),
      name: readString(json, 'name'),
    );
  }

  final String id;
  final String name;
}
