import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/error_messages.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/share/file_sharer.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/detail_list.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/emails/send_email_sheet.dart';
import 'package:opencrm/features/quotes/quote.dart';
import 'package:opencrm/features/quotes/quotes_api.dart';
import 'package:opencrm/features/quotes/quotes_providers.dart';
import 'package:opencrm/features/timeline/record_ref.dart';

/// What the email of a quote starts with, as on the web. The server fills the placeholders
/// in when it sends the email, and attaches the quote's PDF.
const quoteEmailSubject = 'Quote {{quote.number}} from {{sender.name}}';
const quoteEmailBody = '''
Hello {{contact.firstName}},

Thank you for your interest. Please find our quote {{quote.number}} for {{opportunity.name}} attached. The total is {{quote.total}}.

If you have any questions, or would like anything changed, just reply to this email.

Kind regards,
{{sender.name}}''';

/// The codes that mean "the quote is not what this screen shows any more" (someone sent,
/// accepted or declined it in the web app meanwhile): the screen reads it again.
const _staleCodes = {'INVALID_STATUS_CHANGE', 'QUOTE_NOT_EDITABLE'};

/// One quote as a document, read-only: its status and dates, who it is for, the lines, the
/// totals, notes and terms. "Share PDF" (everyone who can see it) downloads the server's
/// PDF and opens the phone's share sheet; "Email quote" (a role that may change the
/// opportunity, while the quote may be sent) emails it with the PDF attached. Everything
/// else about quotes is done in the web app.
class QuoteScreen extends ConsumerStatefulWidget {
  const QuoteScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<QuoteScreen> createState() => _QuoteScreenState();
}

class _QuoteScreenState extends ConsumerState<QuoteScreen> {
  /// The PDF is on its way: the button shows it and cannot be pressed again.
  bool _downloading = false;

  QuoteController get _controller =>
      ref.read(quoteProvider(widget.id).notifier);

  Future<void> _sharePdf(Quote quote, Rect? origin) async {
    setState(() => _downloading = true);
    final QuotePdf pdf;
    try {
      pdf = await ref
          .read(quotesApiProvider)
          .pdf(quote.id, number: quote.number);
    } on ApiError catch (error) {
      if (mounted) {
        setState(() => _downloading = false);
        showErrorSnackBar(
          context,
          'The PDF could not be downloaded. ${describeApiError(error)}',
        );
      }
      return;
    }
    if (!mounted) {
      return;
    }
    setState(() => _downloading = false);
    try {
      await ref
          .read(fileSharerProvider)
          .shareFile(
            pdf.bytes,
            fileName: pdf.fileName,
            mimeType: 'application/pdf',
            origin: origin,
          );
    } catch (_) {
      if (mounted) {
        showErrorSnackBar(
          context,
          'The share sheet could not be opened. Try again.',
        );
      }
    }
  }

  Future<void> _email(Quote quote) {
    return showSendEmailSheet(
      context,
      record: RecordRef(RecordType.opportunity, quote.opportunity.id),
      recordName: quote.opportunity.name,
      title: 'Email quote ${quote.number}',
      note:
          '${quote.pdfFileName} will be attached. A short summary (the dates and the '
          'totals) is added below your message for mail programs that hide attachments.',
      subject: quoteEmailSubject,
      body: quoteEmailBody,
      send: (message) async {
        try {
          await _controller.sendByEmail(message);
        } on ApiError catch (error) {
          if (_staleCodes.contains(error.code)) {
            // The sheet keeps the draft; the screen under it shows the real status.
            _controller.reload().ignore();
          }
          rethrow;
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(currentUserProvider).role;
    final state = ref.watch(quoteProvider(widget.id));
    final quote = state.value;

    if (quote == null) {
      return AppScaffold(
        title: 'Quote',
        body: state.hasError
            ? Center(
                child: SingleChildScrollView(
                  child: ErrorState(
                    error: ApiError.from(state.error!),
                    onRetry: () => ref.invalidate(quoteProvider(widget.id)),
                  ),
                ),
              )
            : const Padding(
                padding: EdgeInsets.all(AppSpacing.page),
                child: SkeletonList(label: 'Loading quote', count: 3),
              ),
      );
    }

    final canEmail = role.canWriteRecords && quote.canBeEmailed;
    final share = Builder(
      builder: (context) => OutlinedButton.icon(
        onPressed: _downloading
            ? null
            : () {
                final box = context.findRenderObject() as RenderBox?;
                _sharePdf(
                  quote,
                  box == null
                      ? null
                      : box.localToGlobal(Offset.zero) & box.size,
                );
              },
        icon: _downloading
            ? const SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.ios_share),
        label: FittedBox(
          child: Text(_downloading ? 'Preparing PDF...' : 'Share PDF'),
        ),
      ),
    );

    return AppScaffold(
      title: quote.number,
      bottomBar: Row(
        children: [
          Expanded(child: share),
          if (canEmail) ...[
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: FilledButton.icon(
                onPressed: () => _email(quote),
                icon: const Icon(Icons.mail_outline),
                label: const FittedBox(child: Text('Email quote')),
              ),
            ),
          ],
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          try {
            await _controller.reload();
          } on ApiError catch (error) {
            if (context.mounted) {
              showErrorSnackBar(context, describeApiError(error));
            }
          }
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(AppSpacing.page),
          children: [
            _Header(quote),
            if (role.canWriteRecords &&
                quote.status == QuoteStatus.draft &&
                quote.lines.isEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              const MutedText(
                'Add at least one line in the web app before you send this quote.',
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            _Buyer(quote),
            const SizedBox(height: AppSpacing.lg),
            _Lines(quote.lines),
            const SizedBox(height: AppSpacing.lg),
            _Totals(quote),
            if (quote.notes != null) ...[
              const SizedBox(height: AppSpacing.lg),
              SectionCard(title: 'Notes', child: SelectableText(quote.notes!)),
            ],
            if (quote.terms != null) ...[
              const SizedBox(height: AppSpacing.lg),
              SectionCard(title: 'Terms', child: SelectableText(quote.terms!)),
            ],
            if (role.canWriteRecords) ...[
              const SizedBox(height: AppSpacing.lg),
              const MutedText(
                'Quotes are made, changed, accepted and declined in the web app.',
                small: true,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The number, the status, the opportunity, the total and the dates.
class _Header extends StatelessWidget {
  const _Header(this.quote);

  final Quote quote;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final validUntil = quote.validUntil;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Semantics(
                header: true,
                child: Text(
                  'Quote ${quote.number}',
                  style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              StatusBadge(label: quote.status.label, tone: quote.status.tone),
            ],
          ),
          MutedText(quote.opportunity.name),
          const SizedBox(height: AppSpacing.md),
          Text(
            formatCurrency(quote.total),
            style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
            semanticsLabel: 'Total: ${formatCurrency(quote.total)}',
          ),
          const Divider(height: AppSpacing.xxl),
          DetailList(
            items: [
              DetailItem('Issue date', formatDay(quote.issueDate)),
              DetailItem(
                'Valid until',
                validUntil == null ? null : formatDay(validUntil),
              ),
              DetailItem('Prepared by', quote.createdBy.name),
              if (quote.sentAt != null)
                DetailItem('Sent', formatDate(quote.sentAt!)),
              if (quote.acceptedAt != null)
                DetailItem('Accepted', formatDate(quote.acceptedAt!)),
              if (quote.declinedAt != null)
                DetailItem('Declined', formatDate(quote.declinedAt!)),
              if (quote.invoiceNumber != null)
                DetailItem('Invoice', quote.invoiceNumber),
            ],
          ),
        ],
      ),
    );
  }
}

/// Who the quote is for, as it is printed on it.
class _Buyer extends StatelessWidget {
  const _Buyer(this.quote);

  final Quote quote;

  @override
  Widget build(BuildContext context) {
    final contact = quote.contact;
    final company = quote.company;
    final email = contact?.email;
    return SectionCard(
      title: 'Prepared for',
      child: contact == null && company == null
          ? const MutedText('No contact or company.')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (contact != null)
                  Text(
                    contact.name,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                if (company != null) Text(company.name),
                if (email != null)
                  SelectableText(
                    email,
                    style: TextStyle(color: context.colors.textMuted),
                  ),
              ],
            ),
    );
  }
}

/// The lines, one stacked block each: a phone never scrolls sideways.
class _Lines extends StatelessWidget {
  const _Lines(this.lines);

  final List<QuoteLine> lines;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SectionCard(
      title: 'Line items',
      child: lines.isEmpty
          ? const MutedText(
              'No line items yet. A quote needs at least one before it can be sent.',
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (index, line) in lines.indexed) ...[
                  if (index > 0) const Divider(height: AppSpacing.xl),
                  MergeSemantics(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          line.description,
                          style: text.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        MutedText(
                          [
                            '${formatNumber(line.quantity)} × ${formatCurrency(line.unitPrice)}',
                            if (line.discountPercent > 0)
                              '${formatPercent(line.discountPercent)} discount',
                            '${formatPercent(line.taxRate)} tax',
                          ].join(' · '),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          formatCurrency(line.lineTotal),
                          style: text.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

/// Subtotal, the discount when there is one, tax and the total: the API's numbers.
class _Totals extends StatelessWidget {
  const _Totals(this.quote);

  final Quote quote;

  @override
  Widget build(BuildContext context) {
    final discount =
        quote.discountType == QuoteDiscountType.percent &&
            quote.discountValue > 0
        ? 'Discount (${formatPercent(quote.discountValue)})'
        : 'Discount';
    return SectionCard(
      title: 'Totals',
      child: Column(
        children: [
          _TotalRow('Subtotal', formatCurrency(quote.subtotal)),
          if (quote.discountTotal > 0)
            _TotalRow(discount, '−${formatCurrency(quote.discountTotal)}'),
          _TotalRow('Tax', formatCurrency(quote.taxTotal)),
          const Divider(height: AppSpacing.lg),
          _TotalRow('Total', formatCurrency(quote.total), strong: true),
        ],
      ),
    );
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow(this.label, this.value, {this.strong = false});

  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final style = strong
        ? text.titleMedium?.copyWith(fontWeight: FontWeight.w600)
        : text.bodyMedium;
    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                label,
                style: strong
                    ? style
                    : style?.copyWith(color: context.colors.textMuted),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Text(value, style: style),
          ],
        ),
      ),
    );
  }
}
