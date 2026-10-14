import 'package:flutter_test/flutter_test.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/features/companies/companies_api.dart';
import 'package:opencrm/features/companies/company.dart';
import 'package:opencrm/features/companies/company_detail_screen.dart';

import '../../support/fixtures.dart';

void main() {
  group('Company', () {
    test('reads every field of the API answer', () {
      final company = Company.fromJson(
        asMap(
          companyJson(
            notes: 'Renews in March.',
            owner: manager,
            contactCount: 4,
            customFields: {'field-1': 120},
          ),
        ),
      );

      expect(company.id, 'company-1');
      expect(company.name, 'Northwind Logistics');
      expect(company.website, 'https://northwind.example/');
      expect(company.industry, 'Logistics');
      expect(company.phone, '+1 555 0199');
      expect(company.address, '12 Harbour Road, Seattle');
      expect(company.notes, 'Renews in March.');
      expect(company.owner.id, 'user-manager');
      expect(company.contactCount, 4);
      expect(company.customFields, {'field-1': 120});
      expect(company.createdAt.isUtc, false);
      expect(company.createdAt.toUtc(), DateTime.utc(2026, 10, 1, 9));
      expect(company.updatedAt.toUtc(), DateTime.utc(2026, 10, 5, 9));
    });

    test('reads what is not set as null', () {
      final company = Company.fromJson(
        asMap(
          companyJson(
            website: null,
            industry: null,
            phone: null,
            address: null,
            contactCount: 0,
          ),
        ),
      );

      expect(company.website, isNull);
      expect(company.industry, isNull);
      expect(company.phone, isNull);
      expect(company.address, isNull);
      expect(company.notes, isNull);
      expect(company.contactCount, 0);
    });

    test('a wrong shape is a FormatException', () {
      expect(
        () => Company.fromJson(asMap(companyJson()..remove('contactCount'))),
        throwsFormatException,
      );
      expect(
        () => Company.fromJson(asMap(companyJson()..['owner'] = 'Riley')),
        throwsFormatException,
      );
    });
  });

  group('CompanyInput', () {
    test('trims text and sends empty text as null', () {
      const input = CompanyInput(
        name: ' Northwind ',
        website: ' northwind.example ',
        industry: ' ',
      );

      expect(input.toJson(), {
        'name': 'Northwind',
        'website': 'northwind.example',
        'industry': null,
        'phone': null,
        'address': null,
        'notes': null,
      });
    });
  });

  group('CompaniesQuery', () {
    test('by name, A to Z, unless asked otherwise', () {
      expect(const CompaniesQuery().toListQuery(1).toQuery(), {
        'page': '1',
        'pageSize': '25',
        'sort': 'name',
        'order': 'asc',
      });
    });

    test('sends the search, the industry and the order', () {
      const query = CompaniesQuery(
        search: ' north ',
        industry: 'Logistics',
        sort: CompanySort.newest,
      );

      expect(query.toListQuery(2).toQuery(), {
        'page': '2',
        'pageSize': '25',
        'search': 'north',
        'sort': 'createdAt',
        'order': 'desc',
        'industry': 'Logistics',
      });
    });

    test('every sort is one the API knows', () {
      const known = {'name', 'industry', 'createdAt', 'updatedAt'};
      for (final sort in CompanySort.values) {
        expect(known, contains(sort.field), reason: sort.label);
        expect(['asc', 'desc'], contains(sort.order), reason: sort.label);
      }
    });
  });

  group('the words', () {
    test('a website is written without its scheme and trailing slash', () {
      expect(websiteLabel('https://northwind.example/'), 'northwind.example');
      expect(
        websiteLabel('HTTP://northwind.example/about'),
        'northwind.example/about',
      );
      expect(websiteLabel('northwind.example'), 'northwind.example');
    });

    test('the website rule is the API\'s', () {
      for (final website in [
        'example.com',
        'www.example.com/about',
        'http://example.com',
        'https://example.com/a?b=c',
      ]) {
        expect(websitePattern.hasMatch(website), true, reason: website);
      }
      for (final website in [
        'example',
        'javascript:alert(1)',
        'ftp://example.com',
        'two words.com',
      ]) {
        expect(websitePattern.hasMatch(website), false, reason: website);
      }
    });

    test('counts contacts in words', () {
      expect(contactCountLabel(0), '0 contacts');
      expect(contactCountLabel(1), '1 contact');
      expect(contactCountLabel(4), '4 contacts');
    });

    test('deleting says what happens to the contacts', () {
      Company withContacts(int count) =>
          Company.fromJson(asMap(companyJson(contactCount: count)));

      expect(
        deleteCompanyMessage(withContacts(0)),
        'The company and its timeline are removed for everyone. Any contacts linked to '
        'it stay, but lose the link. This cannot be undone.',
      );
      expect(
        deleteCompanyMessage(withContacts(1)),
        contains('Its 1 contact stays, but is no longer linked to a company.'),
      );
      expect(
        deleteCompanyMessage(withContacts(3)),
        contains('Its 3 contacts stay, but are no longer linked to a company.'),
      );
    });
  });
}
