import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/theme/app_colors.dart';

/// A lead's status, with the API's value, the words shown for it and its badge colour.
/// Never print the raw value.
enum LeadStatus {
  newLead('NEW', 'New', Tone.neutral),
  contacted('CONTACTED', 'Contacted', Tone.warning),
  qualified('QUALIFIED', 'Qualified', Tone.info),
  converted('CONVERTED', 'Converted', Tone.success),
  lost('LOST', 'Lost', Tone.danger);

  const LeadStatus(this.apiValue, this.label, this.tone);

  final String apiValue;
  final String label;
  final Tone tone;

  /// The statuses a user sets by hand. Lost and Converted are reached by their own actions.
  static const open = [newLead, contacted, qualified];

  bool get isOpen => open.contains(this);

  static LeadStatus fromApi(String value) {
    return values.firstWhere(
      (status) => status.apiValue == value,
      orElse: () => throw FormatException('Unknown lead status "$value"'),
    );
  }
}

enum LeadSource {
  website('WEBSITE', 'Website'),
  referral('REFERRAL', 'Referral'),
  coldCall('COLD_CALL', 'Cold call'),
  event('EVENT', 'Event'),
  other('OTHER', 'Other');

  const LeadSource(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static LeadSource fromApi(String value) {
    return values.firstWhere(
      (source) => source.apiValue == value,
      orElse: () => other,
    );
  }
}

enum LostReason {
  price('PRICE', 'Price'),
  choseCompetitor('CHOSE_COMPETITOR', 'Chose competitor'),
  noBudget('NO_BUDGET', 'No budget'),
  noResponse('NO_RESPONSE', 'No response'),
  other('OTHER', 'Other');

  const LostReason(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static LostReason? fromApi(String? value) {
    return values.where((reason) => reason.apiValue == value).firstOrNull;
  }
}

/// `{ id, name }`: how the API names another record (what a converted lead became).
class RecordLink {
  const RecordLink({required this.id, required this.name});

  static RecordLink? fromJsonOrNull(Object? json) {
    if (json == null) {
      return null;
    }
    final map = asMap(json);
    return RecordLink(id: readString(map, 'id'), name: readString(map, 'name'));
  }

  final String id;
  final String name;
}

/// A lead as `GET /leads/:id` answers. Dates are in the device's time zone.
class Lead {
  const Lead({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.name,
    required this.company,
    required this.jobTitle,
    required this.email,
    required this.phone,
    required this.source,
    required this.status,
    required this.owner,
    required this.estimatedValue,
    required this.notes,
    required this.lostReason,
    required this.lostNote,
    required this.lostAt,
    required this.lastContactAt,
    required this.followUpAt,
    required this.followUpNote,
    required this.convertedAt,
    required this.convertedContact,
    required this.convertedCompany,
    required this.convertedOpportunity,
    required this.customFields,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Lead.fromJson(Json json) {
    // A record the reader may not see is null inside `convertedTo`.
    final convertedTo = readMapOrNull(json, 'convertedTo') ?? const {};
    return Lead(
      id: readString(json, 'id'),
      firstName: readString(json, 'firstName'),
      lastName: readString(json, 'lastName'),
      name: readString(json, 'name'),
      company: readStringOrNull(json, 'company'),
      jobTitle: readStringOrNull(json, 'jobTitle'),
      email: readStringOrNull(json, 'email'),
      phone: readStringOrNull(json, 'phone'),
      source: LeadSource.fromApi(readString(json, 'source')),
      status: LeadStatus.fromApi(readString(json, 'status')),
      owner: PersonRef.fromJson(asMap(json['owner'])),
      estimatedValue: readDoubleOrNull(json, 'estimatedValue'),
      notes: readStringOrNull(json, 'notes'),
      lostReason: LostReason.fromApi(readStringOrNull(json, 'lostReason')),
      lostNote: readStringOrNull(json, 'lostNote'),
      lostAt: readDateOrNull(json, 'lostAt'),
      lastContactAt: readDateOrNull(json, 'lastContactAt'),
      followUpAt: readDateOrNull(json, 'followUpAt'),
      followUpNote: readStringOrNull(json, 'followUpNote'),
      convertedAt: readDateOrNull(json, 'convertedAt'),
      convertedContact: RecordLink.fromJsonOrNull(convertedTo['contact']),
      convertedCompany: RecordLink.fromJsonOrNull(convertedTo['company']),
      convertedOpportunity: RecordLink.fromJsonOrNull(
        convertedTo['opportunity'],
      ),
      customFields: readMapOrNull(json, 'customFields') ?? const {},
      createdAt: readDate(json, 'createdAt'),
      updatedAt: readDate(json, 'updatedAt'),
    );
  }

  final String id;
  final String firstName;
  final String lastName;

  /// The full name, as the server builds it.
  final String name;
  final String? company;
  final String? jobTitle;
  final String? email;
  final String? phone;
  final LeadSource source;
  final LeadStatus status;
  final PersonRef owner;
  final double? estimatedValue;
  final String? notes;
  final LostReason? lostReason;
  final String? lostNote;
  final DateTime? lostAt;
  final DateTime? lastContactAt;

  /// The follow-up reminder: when, and what to do then.
  final DateTime? followUpAt;
  final String? followUpNote;
  final DateTime? convertedAt;
  final RecordLink? convertedContact;
  final RecordLink? convertedCompany;
  final RecordLink? convertedOpportunity;

  /// The values of the custom fields by field id: a string, a number or null.
  final Json customFields;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// A converted lead lives on as a contact: its details and status are final. It can
  /// still be reassigned and still takes conversations and notes.
  bool get isConverted => status == LeadStatus.converted;
}

/// What the lead form sends, for a new lead and for an edit. An empty text is sent as
/// null, which clears the field.
class LeadInput {
  const LeadInput({
    required this.firstName,
    required this.lastName,
    required this.source,
    this.company = '',
    this.jobTitle = '',
    this.email = '',
    this.phone = '',
    this.estimatedValue,
    this.notes = '',
    this.customFields,
  });

  final String firstName;
  final String lastName;
  final LeadSource source;
  final String company;
  final String jobTitle;
  final String email;
  final String phone;
  final double? estimatedValue;
  final String notes;

  /// The custom fields to send, by field id (`CustomFieldValues.forCreate` or `.changes`);
  /// null leaves `customFields` out, so the record keeps the values it has.
  final Json? customFields;

  static String? _orNull(String text) =>
      text.trim().isEmpty ? null : text.trim();

  Json toJson() {
    return {
      'firstName': firstName.trim(),
      'lastName': lastName.trim(),
      'source': source.apiValue,
      'company': _orNull(company),
      'jobTitle': _orNull(jobTitle),
      'email': _orNull(email),
      'phone': _orNull(phone),
      'estimatedValue': estimatedValue,
      'notes': _orNull(notes),
      'customFields': ?customFields,
    };
  }
}
