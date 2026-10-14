import 'package:flutter/material.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';

/// Asks before something that cannot be undone. Answers true only for the confirm button.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  bool destructive = false,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: destructive
              ? FilledButton.styleFrom(
                  backgroundColor: context.colors.tone(Tone.danger).foreground,
                )
              : null,
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return confirmed ?? false;
}

/// A bottom sheet for a short form or a list of choices. It grows with its content, moves
/// above the keyboard, scrolls when it is taller than the screen, and is capped to the
/// readable width on a tablet. Every sheet in the app opens through this.
Future<T?> showAppSheet<T>(
  BuildContext context, {
  required String title,
  required WidgetBuilder builder,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    // Over the bottom bar too, so a sheet's button is never under it.
    useRootNavigator: true,
    useSafeArea: true,
    constraints: const BoxConstraints(maxWidth: AppSpacing.contentMaxWidth),
    builder: (context) => Padding(
      // Keeps the sheet's fields above the keyboard.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          0,
          AppSpacing.lg,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(title, style: Theme.of(context).textTheme.titleLarge),
            ),
            const SizedBox(height: AppSpacing.lg),
            builder(context),
          ],
        ),
      ),
    ),
  );
}

/// One choice of [showOptionsSheet].
class SheetOption<T> {
  const SheetOption({required this.value, required this.label, this.icon});

  final T value;
  final String label;
  final IconData? icon;
}

/// A sheet that offers a short list and answers with the one chosen (a sort order, a
/// status), or null when it is dismissed.
Future<T?> showOptionsSheet<T>(
  BuildContext context, {
  required String title,
  required List<SheetOption<T>> options,
  T? selected,
}) {
  return showAppSheet<T>(
    context,
    title: title,
    builder: (context) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final option in options)
          ListTile(
            contentPadding: EdgeInsets.zero,
            minTileHeight: AppSpacing.touchTarget,
            leading: option.icon == null ? null : Icon(option.icon),
            title: Text(option.label),
            trailing: option.value == selected
                ? Icon(
                    Icons.check,
                    color: context.colors.primary,
                    semanticLabel: 'Selected',
                  )
                : null,
            onTap: () => Navigator.of(context).pop(option.value),
          ),
      ],
    ),
  );
}
