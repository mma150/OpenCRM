import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/features/leads/lead.dart' show RecordLink;

/// What a quote is now, with the words and tone of the web's `quote-status-badge.tsx`.
/// `expired` is not stored: the API answers it for a sent quote whose "valid until" day has
/// passed for the viewer (the `tz` the app sends).
enum QuoteStatus {
  draft('DRAFT', 'Draft', Tone.neutral),
  sent('SENT', 'Sent', Tone.info),
  accepted('ACCEPTED', 'Accepted', Tone.success),
  declined('DECLINED', 'Declined', Tone.danger),
  expired('EXPIRED', 'Expired', Tone.warning);

  const QuoteStatus(this.apiValue, this.label, this.tone);

  final String apiValue;
  final String label;
  final Tone tone;

  /// A status this version does not know throws, like a lead status: guessing it would
  /// offer the wrong actions.
  static QuoteStatus fromApi(String value) {
    for (final status in values) {
      if (status.apiValue == value) {
        return status;
      }
    }
    throw FormatException('Unknown quote status: $value');
  }
}

/// How the quote's discount was given. Only the words of the totals depend on it ("Discount
/// (10%)"); the amount is always the API's, so a kind this version does not know reads as
/// a plain amount.
enum QuoteDiscountType {
  none('NONE'),
  percent('PERCENT'),
  amount('AMOUNT');

  const QuoteDiscountType(this.apiValue);

  final String apiValue;

  static QuoteDiscountType fromApi(String value) {
    return values.firstWhere(
      (type) => type.apiValue == value,
      orElse: () => amount,
    );
  }
}

/// One line of a quote, as the API counted it. [lineTotal] is before tax and before the
/// quote's discount.
class QuoteLine {
  const QuoteLine({
    required this.id,
    required this.description,
    required this.quantity,
    required this.unitPrice,
    required this.discountPercent,
    required this.taxRate,
    required this.lineTotal,
  });

  factory QuoteLine.fromJson(Json json) {
    return QuoteLine(
      id: readString(json, 'id'),
      description: readString(json, 'description'),
      quantity: readDouble(json, 'quantity'),
      unitPrice: readDouble(json, 'unitPrice'),
      discountPercent: readDouble(json, 'discountPercent'),
      taxRate: readDouble(json, 'taxRate'),
      lineTotal: readDouble(json, 'lineTotal'),
    );
  }

  final String id;
  final String description;
  final double quantity;
  final double unitPrice;

  /// 0 to 100; 0 when the line has none.
  final double discountPercent;

  /// 0 to 100.
  final double taxRate;
  final double lineTotal;
}

/// Who a quote is for: the contact, with the address it is printed with.
class QuoteContact {
  const QuoteContact({required this.id, required this.name, this.email});

  static QuoteContact? fromJsonOrNull(Object? json) {
    if (json == null) {
      return null;
    }
    final map = asMap(json);
    return QuoteContact(
      id: readString(map, 'id'),
      name: readString(map, 'name'),
      email: readStringOrNull(map, 'email'),
    );
  }

  final String id;
  final String name;
  final String? email;
}

/// A quote as `GET /quotes/:id` answers it (backend.md, "Quotes"). Every amount is the
/// API's: the app never adds anything up. Days ([issueDate], [validUntil]) are calendar
/// days such as `2026-11-15`; moments are in the device's time zone.
///
/// The app only reads quotes and sends them by email; making and changing them is done in
/// the web app.
class Quote {
  const Quote({
    required this.id,
    required this.number,
    required this.opportunity,
    required this.contact,
    required this.company,
    required this.status,
    required this.issueDate,
    required this.validUntil,
    required this.lines,
    required this.discountType,
    required this.discountValue,
    required this.subtotal,
    required this.discountTotal,
    required this.taxTotal,
    required this.total,
    required this.notes,
    required this.terms,
    required this.sentAt,
    required this.acceptedAt,
    required this.declinedAt,
    required this.invoiceNumber,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Quote.fromJson(Json json) {
    final invoice = json['invoice'];
    final opportunity = asMap(json['opportunity']);
    return Quote(
      id: readString(json, 'id'),
      number: readString(json, 'number'),
      opportunity: RecordLink(
        id: readString(opportunity, 'id'),
        name: readString(opportunity, 'name'),
      ),
      contact: QuoteContact.fromJsonOrNull(json['contact']),
      company: RecordLink.fromJsonOrNull(json['company']),
      status: QuoteStatus.fromApi(readString(json, 'status')),
      issueDate: readString(json, 'issueDate'),
      validUntil: readStringOrNull(json, 'validUntil'),
      lines: readList(json['lines'], QuoteLine.fromJson),
      discountType: QuoteDiscountType.fromApi(readString(json, 'discountType')),
      discountValue: readDouble(json, 'discountValue'),
      subtotal: readDouble(json, 'subtotal'),
      discountTotal: readDouble(json, 'discountTotal'),
      taxTotal: readDouble(json, 'taxTotal'),
      total: readDouble(json, 'total'),
      notes: readStringOrNull(json, 'notes'),
      terms: readStringOrNull(json, 'terms'),
      sentAt: readDateOrNull(json, 'sentAt'),
      acceptedAt: readDateOrNull(json, 'acceptedAt'),
      declinedAt: readDateOrNull(json, 'declinedAt'),
      invoiceNumber: invoice == null
          ? null
          : readString(asMap(invoice), 'number'),
      createdBy: PersonRef.fromJson(asMap(json['createdBy'])),
      createdAt: readDate(json, 'createdAt'),
      updatedAt: readDate(json, 'updatedAt'),
    );
  }

  final String id;

  /// `Q-0001`.
  final String number;
  final RecordLink opportunity;

  /// Who the quote is for. Null when it names none.
  final QuoteContact? contact;
  final RecordLink? company;
  final QuoteStatus status;
  final String issueDate;
  final String? validUntil;
  final List<QuoteLine> lines;
  final QuoteDiscountType discountType;

  /// The percentage or the amount the discount was given as.
  final double discountValue;
  final double subtotal;
  final double discountTotal;
  final double taxTotal;
  final double total;
  final String? notes;
  final String? terms;
  final DateTime? sentAt;
  final DateTime? acceptedAt;
  final DateTime? declinedAt;

  /// The invoice made from the quote (`INV-0001`), or null. Invoices are in the web app.
  final String? invoiceNumber;
  final PersonRef createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// What the API takes for `POST /quotes/:id/send` with an email (backend.md, the table
  /// in "Quotes"): a draft with at least one line (it becomes sent), and a sent or expired
  /// quote again (it stays sent). An accepted or declined quote is not sent.
  bool get canBeEmailed => switch (status) {
    QuoteStatus.draft => lines.isNotEmpty,
    QuoteStatus.sent || QuoteStatus.expired => true,
    QuoteStatus.accepted || QuoteStatus.declined => false,
  };

  /// The name of the quote's PDF: `Q-0001.pdf`.
  String get pdfFileName => quotePdfFileName(number);
}

/// `Q-0001.pdf`, with anything that cannot be in a file name taken out: the number comes
/// from the server and becomes a file on the phone.
String quotePdfFileName(String number) {
  final safe = number.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '');
  return '${safe.isEmpty ? 'quote' : safe}.pdf';
}
