import 'package:flutter/material.dart';
import 'package:opencrm/core/theme/app_colors.dart';

/// "Lead saved.": a short confirmation that goes away on its own.
void showSuccessSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Something the user asked for did not happen. Stays a little longer.
void showErrorSnackBar(BuildContext context, String message) {
  final colors = context.colors;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        // The tone's pale background as the text, readable in both themes.
        content: Text(
          message,
          style: TextStyle(color: colors.tone(Tone.danger).background),
        ),
        backgroundColor: colors.tone(Tone.danger).foreground,
        duration: const Duration(seconds: 6),
      ),
    );
}
