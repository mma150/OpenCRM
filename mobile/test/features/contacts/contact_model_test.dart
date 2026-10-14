import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/features/contacts/contact.dart';
import 'package:opencrm/features/contacts/contacts_api.dart';
import 'package:opencrm/features/leads/lead.dart';

import '../../support/fixtures.dart';

void main() {
  group('Contact', () {
    test('reads every field of the API answer', () {
      final contact = Contact.fromJson(
        asMap(
          contactJson(
            notes: 'Prefers email.',
            owner: manager,
            convertedFromLead: {'id': 'lead-1', 'name': 'Marcus Chen'},
            lastContactAt: '2026-10-05T09:30:00.000Z',
            customFields: {'field-1': 'Gold'},
          ),
        ),
      );

      expect(contact.id, 'contact-1');
      expect(contact.firstName, 'Marcus');
      expect(contact.lastName, 'Chen');
      expect(contact.name, 'Marcus Chen');
      expect(contact.jobTitle, 'Operations Director');
      expect(contact.email, 'marcus@northwind.example');
      expect(contact.phone, '+1 555 0100');
      expect(contact.company?.id, 'company-1');
      expect(contact.company?.name, 'Northwind Logistics');
      expect(contact.notes, 'Prefers email.');
      expect(contact.owner.name, 'Sarah Jenkins');
      expect(contact.convertedFromLead?.id, 'lead-1');
      expect(contact.convertedFromLead?.name, 'Marcus Chen');
      // A moment is read as the device's local time.
      expect(contact.lastContactAt?.isUtc, false);
      expect(contact.lastContactAt?.toUtc(), DateTime.utc(2026, 10, 5, 9, 30));
      expect(contact.customFields, {'field-1': 'Gold'});
      expect(contact.createdAt.toUtc(), DateTime.utc(2026, 10, 1, 9));
      expect(contact.updatedAt.toUtc(), DateTime.utc(2026, 10, 5, 9));
    });

    test('reads what is not set as null', () {
      final contact = Contact.fromJson(
        asMap(
          contactJson(jobTitle: null, email: null, phone: null, company: null),
        ),
      );

      expect(contact.jobTitle, isNull);
      expect(contact.email, isNull);
      expect(contact.phone, isNull);
      // No company, or one the reader may not see: the API says null for both.
      expect(contact.company, isNull);
      expect(contact.notes, isNull);
      expect(contact.convertedFromLead, isNull);
      expect(contact.lastContactAt, isNull);
      expect(contact.customFields, isEmpty);
    });

    test('a wrong shape is a FormatException', () {
      expect(
        () => Contact.fromJson(asMap(contactJson()..remove('owner'))),
        throwsFormatException,
      );
      expect(
        () => Contact.fromJson(asMap(contactJson()..['firstName'] = 7)),
        throwsFormatException,
      );
    });
  });

  group('ContactInput', () {
    test('trims text and sends empty text as null', () {
      const input = ContactInput(
        firstName: ' Marcus ',
        lastName: 'Chen',
        jobTitle: '  ',
        email: ' marcus@northwind.example ',
        companyId: 'company-1',
      );

      expect(input.toJson(), {
        'firstName': 'Marcus',
        'lastName': 'Chen',
        'jobTitle': null,
        'email': 'marcus@northwind.example',
        'phone': null,
        'companyId': 'company-1',
        'notes': null,
      });
    });

    test('no company is sent as null, which takes the contact out of it', () {
      const input = ContactInput(firstName: 'Marcus', lastName: 'Chen');

      expect(input.toJson().containsKey('companyId'), true);
      expect(input.toJson()['companyId'], isNull);
    });
  });

  group('ContactsQuery', () {
    test('by name, A to Z, unless asked otherwise', () {
      expect(const ContactsQuery().toListQuery(1).toQuery(), {
        'page': '1',
        'pageSize': '25',
        'sort': 'name',
        'order': 'asc',
      });
    });

    test('sends the search, the company and the order', () {
      const query = ContactsQuery(
        search: ' chen ',
        company: RecordLink(id: 'company-1', name: 'Northwind Logistics'),
        sort: ContactSort.lastContactNewest,
      );

      expect(query.toListQuery(3, pageSize: 20).toQuery(), {
        'page': '3',
        'pageSize': '20',
        'search': 'chen',
        'sort': 'lastContactAt',
        'order': 'desc',
        'companyId': 'company-1',
      });
    });

    test('every sort is one the API knows', () {
      const known = {
        'name',
        'company',
        'createdAt',
        'updatedAt',
        'lastContactAt',
      };
      for (final sort in ContactSort.values) {
        expect(known, contains(sort.field), reason: sort.label);
        expect(['asc', 'desc'], contains(sort.order), reason: sort.label);
      }
    });
  });
}
