import 'package:flutter/material.dart';

/// The colour a badge or a banner speaks in.
enum Tone { neutral, info, success, warning, danger }

/// The background, border and text of one [Tone].
class ToneColors {
  const ToneColors({
    required this.background,
    required this.border,
    required this.foreground,
  });

  final Color background;
  final Color border;
  final Color foreground;
}

/// The app's colour tokens: the web app's zinc neutrals and blue primary, in a light and a
/// dark set. Widgets read them with `context.colors` and never write a colour value
/// themselves, so both themes stay complete.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.background,
    required this.surface,
    required this.surfaceMuted,
    required this.border,
    required this.text,
    required this.textMuted,
    required this.primary,
    required this.onPrimary,
    required this.danger,
    required this.skeleton,
    required this.tones,
  });

  /// Behind everything.
  final Color background;

  /// Cards, sheets, bars.
  final Color surface;

  /// A quiet fill inside a surface: a chip, a track, an avatar.
  final Color surfaceMuted;
  final Color border;
  final Color text;

  /// Secondary text. At least 4.5:1 on [background] and [surface] in both themes.
  final Color textMuted;
  final Color primary;
  final Color onPrimary;
  final Color danger;
  final Color skeleton;
  final Map<Tone, ToneColors> tones;

  ToneColors tone(Tone tone) => tones[tone]!;

  static const light = AppColors(
    background: Color(0xFFFAFAFA), // zinc-50
    surface: Color(0xFFFFFFFF),
    surfaceMuted: Color(0xFFF4F4F5), // zinc-100
    border: Color(0xFFE4E4E7), // zinc-200
    text: Color(0xFF09090B), // zinc-950
    textMuted: Color(0xFF52525B), // zinc-600
    primary: Color(0xFF2563EB), // blue-600
    onPrimary: Color(0xFFFFFFFF),
    danger: Color(0xFFDC2626), // red-600
    skeleton: Color(0xFFE4E4E7),
    tones: {
      Tone.neutral: ToneColors(
        background: Color(0xFFF4F4F5),
        border: Color(0xFFE4E4E7),
        foreground: Color(0xFF3F3F46),
      ),
      Tone.info: ToneColors(
        background: Color(0xFFEFF6FF),
        border: Color(0xFFBFDBFE),
        foreground: Color(0xFF1D4ED8),
      ),
      Tone.success: ToneColors(
        background: Color(0xFFECFDF5),
        border: Color(0xFFA7F3D0),
        foreground: Color(0xFF047857),
      ),
      Tone.warning: ToneColors(
        background: Color(0xFFFFFBEB),
        border: Color(0xFFFDE68A),
        foreground: Color(0xFFB45309),
      ),
      Tone.danger: ToneColors(
        background: Color(0xFFFEF2F2),
        border: Color(0xFFFECACA),
        foreground: Color(0xFFB91C1C),
      ),
    },
  );

  static const dark = AppColors(
    background: Color(0xFF09090B), // zinc-950
    surface: Color(0xFF18181B), // zinc-900
    surfaceMuted: Color(0xFF27272A), // zinc-800
    border: Color(0xFF3F3F46), // zinc-700
    text: Color(0xFFFAFAFA),
    textMuted: Color(0xFFA1A1AA), // zinc-400
    primary: Color(0xFF3B82F6), // blue-500
    onPrimary: Color(0xFFFFFFFF),
    danger: Color(0xFFF87171), // red-400
    skeleton: Color(0xFF27272A),
    tones: {
      Tone.neutral: ToneColors(
        background: Color(0xFF27272A),
        border: Color(0xFF3F3F46),
        foreground: Color(0xFFD4D4D8),
      ),
      Tone.info: ToneColors(
        background: Color(0xFF172554),
        border: Color(0xFF1E40AF),
        foreground: Color(0xFF93C5FD),
      ),
      Tone.success: ToneColors(
        background: Color(0xFF022C22),
        border: Color(0xFF065F46),
        foreground: Color(0xFF6EE7B7),
      ),
      Tone.warning: ToneColors(
        background: Color(0xFF451A03),
        border: Color(0xFF92400E),
        foreground: Color(0xFFFCD34D),
      ),
      Tone.danger: ToneColors(
        background: Color(0xFF450A0A),
        border: Color(0xFF991B1B),
        foreground: Color(0xFFFCA5A5),
      ),
    },
  );

  @override
  AppColors copyWith() => this;

  @override
  AppColors lerp(AppColors? other, double t) =>
      t < 0.5 ? this : (other ?? this);
}

extension AppColorsContext on BuildContext {
  /// The colour tokens of the theme in effect.
  AppColors get colors => Theme.of(this).extension<AppColors>()!;
}
