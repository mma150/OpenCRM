import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/features/leads/lead.dart';

/// A contact as `GET /contacts/:id` answers. Dates are in the device's time zone.
class Contact {
  const Contact({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.name,
    required this.jobTitle,
    required this.email,
    required this.phone,
    required this.company,
    required this.notes,
    required this.owner,
    required this.convertedFromLead,
    required this.lastContactAt,
    required this.customFields,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Contact.fromJson(Json json) {
    return Contact(
      id: readString(json, 'id'),
      firstName: readString(json, 'firstName'),
      lastName: readString(json, 'lastName'),
      name: readString(json, 'name'),
      jobTitle: readStringOrNull(json, 'jobTitle'),
      email: readStringOrNull(json, 'email'),
      phone: readStringOrNull(json, 'phone'),
      company: RecordLink.fromJsonOrNull(json['company']),
      notes: readStringOrNull(json, 'notes'),
      owner: PersonRef.fromJson(asMap(json['owner'])),
      convertedFromLead: RecordLink.fromJsonOrNull(json['convertedFromLead']),
      lastContactAt: readDateOrNull(json, 'lastContactAt'),
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
  final String? jobTitle;
  final String? email;
  final String? phone;

  /// Null when the contact has no company, and also when it has one the reader may not
  /// see: the API does not name a hidden company.
  final RecordLink? company;
  final String? notes;
  final PersonRef owner;

  /// The lead this contact was made from, when there is one the reader may see.
  final RecordLink? convertedFromLead;
  final DateTime? lastContactAt;

  /// The values of the custom fields by field id: a string, a number or null.
  final Json customFields;
  final DateTime createdAt;
  final DateTime updatedAt;
}

/// What the contact form sends, for a new contact and for an edit. An empty text is sent
/// as null, which clears the field; a null [companyId] takes the contact out of its
/// company.
///
/// An edit sends the company only when it was changed ([sendCompany]): a contact whose
/// company the reader may not see comes with `company: null`, and sending that back
/// would take the contact out of a company the reader never touched.
class ContactInput {
  const ContactInput({
    required this.firstName,
    required this.lastName,
    this.jobTitle = '',
    this.email = '',
    this.phone = '',
    this.companyId,
    this.sendCompany = true,
    this.notes = '',
  });

  final String firstName;
  final String lastName;
  final String jobTitle;
  final String email;
  final String phone;
  final String? companyId;

  /// False leaves `companyId` out, so the contact keeps the company it has.
  final bool sendCompany;
  final String notes;

  static String? _orNull(String text) =>
      text.trim().isEmpty ? null : text.trim();

  Json toJson() {
    return {
      'firstName': firstName.trim(),
      'lastName': lastName.trim(),
      'jobTitle': _orNull(jobTitle),
      'email': _orNull(email),
      'phone': _orNull(phone),
      if (sendCompany) 'companyId': companyId,
      'notes': _orNull(notes),
    };
  }
}
