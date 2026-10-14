import 'package:flutter/material.dart';
import 'package:opencrm/core/theme/app_colors.dart';

/// A small pill that names a status ("Qualified", "Overdue"). The colour supports the
/// word and never replaces it.
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, this.tone = Tone.neutral});

  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors.tone(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: colors.background,
        border: Border.all(color: colors.border),
        borderRadius: const BorderRadius.all(Radius.circular(999)),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.labelMedium
            ?.copyWith(color: colors.foreground, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// A person's initials in a circle.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({super.key, required this.initials, this.size = 28});

  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors.tone(Tone.info);
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: colors.background,
          shape: BoxShape.circle,
        ),
        child: Text(
          initials,
          textScaler: TextScaler.noScaling,
          style: TextStyle(
            color: colors.foreground,
            fontSize: size * 0.4,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

/// A banner inside a screen: a converted lead, a follow-up that is overdue.
class ToneBanner extends StatelessWidget {
  const ToneBanner({
    super.key,
    required this.tone,
    required this.icon,
    required this.child,
  });

  final Tone tone;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors.tone(tone);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.background,
        border: Border.all(color: colors.border),
        borderRadius: const BorderRadius.all(Radius.circular(8)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: colors.foreground),
          const SizedBox(width: 12),
          Expanded(child: child),
        ],
      ),
    );
  }
}
