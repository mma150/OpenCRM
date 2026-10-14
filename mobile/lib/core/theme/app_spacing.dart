import 'package:flutter/widgets.dart';

/// The spacing steps and the few sizes every screen shares. Use these instead of writing
/// a number, so the app keeps one rhythm.
abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;

  /// The gap between a screen's edge and its content.
  static const double page = 16;

  /// The corner radius of cards, fields and buttons (the web app's 8px).
  static const double radius = 8;
  static const BorderRadius borderRadius = BorderRadius.all(
    Radius.circular(radius),
  );

  /// The smallest touch target: 48 logical pixels.
  static const double touchTarget = 48;

  /// Content is never wider than this, so lists and forms stay readable on a tablet.
  static const double contentMaxWidth = 720;

  /// From this width the app shows a navigation rail instead of the bottom bar.
  static const double wideLayout = 720;
}
