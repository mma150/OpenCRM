import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/user.dart';

/// What the API accepts as a website: "example.com", "www.example.com/about" or the same
/// with http:// or https:// in front. The same rule as the web app's `WEBSITE_PATTERN`.
final websitePattern = RegExp(
  r'^(https?://)?[^\s:/]+\.\S+$',
  caseSensitive: false,
);

/// How a website is written on screen: without the scheme and without a trailing slash.
String websiteLabel(String website) {
  return website
      .replaceFirst(RegExp('^https?://', caseSensitive: false), '')
      .replaceFirst(RegExp(r'/$'), '');
}

/// "1 contact", "4 contacts": how many of a company's contacts the user may see.
String contactCountLabel(int count) =>
    count == 1 ? '1 contact' : '$count contacts';

/// A company as `GET /companies/:id` answers. Dates are in the device's time zone.
class Company {
  const Company({
    required this.id,
    required this.name,
    required this.website,
    required this.industry,
    required this.phone,
    required this.address,
    required this.notes,
    required this.owner,
    required this.contactCount,
    required this.customFields,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Company.fromJson(Json json) {
    return Company(
      id: readString(json, 'id'),
      name: readString(json, 'name'),
      website: readStringOrNull(json, 'website'),
      industry: readStringOrNull(json, 'industry'),
      phone: readStringOrNull(json, 'phone'),
      address: readStringOrNull(json, 'address'),
      notes: readStringOrNull(json, 'notes'),
      owner: PersonRef.fromJson(asMap(json['owner'])),
      contactCount: readInt(json, 'contactCount'),
      customFields: readMapOrNull(json, 'customFields') ?? const {},
      createdAt: readDate(json, 'createdAt'),
      updatedAt: readDate(json, 'updatedAt'),
    );
  }

  final String id;
  final String name;
  final String? website;

  /// Free text; the industries in use come from `GET /companies/industries`.
  final String? industry;
  final String? phone;
  final String? address;
  final String? notes;
  final PersonRef owner;

  /// Only the contacts the reader may see.
  final int contactCount;

  /// The values of the custom fields by field id: a string, a number or null.
  final Json customFields;
  final DateTime createdAt;
  final DateTime updatedAt;
}

/// What the company form sends, for a new company and for an edit. An empty text is sent
/// as null, which clears the field.
class CompanyInput {
  const CompanyInput({
    required this.name,
    this.website = '',
    this.industry = '',
    this.phone = '',
    this.address = '',
    this.notes = '',
  });

  final String name;
  final String website;
  final String industry;
  final String phone;
  final String address;
  final String notes;

  static String? _orNull(String text) =>
      text.trim().isEmpty ? null : text.trim();

  Json toJson() {
    return {
      'name': name.trim(),
      'website': _orNull(website),
      'industry': _orNull(industry),
      'phone': _orNull(phone),
      'address': _orNull(address),
      'notes': _orNull(notes),
    };
  }
}
