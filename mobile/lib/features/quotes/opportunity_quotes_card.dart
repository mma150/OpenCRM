import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/routes.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';
import 'package:opencrm/features/quotes/quote.dart';
import 'package:opencrm/features/quotes/quotes_providers.dart';

/// The Quotes card on an opportunity's page: its newest quotes, each with its status, total
/// and "valid until", opening the quote. Every role that sees the opportunity sees it.
/// Quotes are made in the web app, so the card has no "New quote".
///
/// ```dart
/// OpportunityQuotesCard(opportunityId: opportunity.id)
/// ```
class OpportunityQuotesCard extends ConsumerWidget {
  const OpportunityQuotesCard({super.key, required this.opportunityId});

  final String opportunityId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quotes = ref.watch(opportunityQuotesProvider(opportunityId));
    final page = quotes.value;
    return SectionCard(
      title: 'Quotes',
      trailing: page == null ? null : MutedText('${page.meta.total} total'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (page == null)
            quotes.hasError
                ? ErrorState(
                    error: ApiError.from(quotes.error!),
                    onRetry: () => ref.invalidate(
                      opportunityQuotesProvider(opportunityId),
                    ),
                    compact: true,
                  )
                : const SkeletonList(label: 'Loading quotes', count: 2)
          else if (page.items.isEmpty)
            const MutedText('No quotes yet. Quotes are created in the web app.')
          else ...[
            for (final quote in page.items)
              _QuoteRow(opportunityId: opportunityId, quote: quote),
            if (page.meta.total > page.items.length)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: MutedText(
                  'Showing the newest ${page.items.length} of ${page.meta.total}. '
                  'The others are in the web app.',
                  small: true,
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _QuoteRow extends StatelessWidget {
  const _QuoteRow({required this.opportunityId, required this.quote});

  final String opportunityId;
  final Quote quote;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final validUntil = quote.validUntil;
    return Semantics(
      button: true,
      child: InkWell(
        onTap: () => context.go(Routes.quote(opportunityId, quote.id)),
        borderRadius: AppSpacing.borderRadius,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSpacing.touchTarget),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.xs,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            quote.number,
                            style: text.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          StatusBadge(
                            label: quote.status.label,
                            tone: quote.status.tone,
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      MutedText(
                        validUntil == null
                            ? formatCurrency(quote.total)
                            : '${formatCurrency(quote.total)} · Valid until '
                                  '${formatDay(validUntil)}',
                        small: true,
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: context.colors.textMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
