import 'package:flutter/material.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';

/// One fact of a record: a label and its value, such as "Email" and the address.
class DetailItem {
  const DetailItem(this.label, this.value, {this.selectable = false});

  final String label;

  /// Null or empty is shown as a dash.
  final String? value;

  /// The value can be selected and copied (an email address, a phone number).
  final bool selectable;
}

/// The facts of a record, one under the other. The label sits beside the value when both
/// fit and above it otherwise (a narrow phone, large text), so nothing is cut off.
class DetailList extends StatelessWidget {
  const DetailList({super.key, required this.items});

  final List<DetailItem> items;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = text.bodyMedium?.copyWith(color: context.colors.textMuted);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (index, item) in items.indexed)
          Padding(
            padding: EdgeInsets.only(top: index == 0 ? 0 : AppSpacing.md),
            child: MergeSemantics(
              child: Wrap(
                spacing: AppSpacing.lg,
                runSpacing: 2,
                alignment: WrapAlignment.spaceBetween,
                children: [
                  Text(item.label, style: muted),
                  _value(item, text.bodyMedium),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _value(DetailItem item, TextStyle? style) {
    final value = item.value;
    if (value == null || value.isEmpty) {
      return Text('—', style: style, semanticsLabel: 'None');
    }
    return item.selectable
        ? SelectableText(value, style: style)
        : Text(value, style: style);
  }
}
