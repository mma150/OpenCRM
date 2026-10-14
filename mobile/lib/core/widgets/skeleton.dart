import 'package:flutter/material.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';

/// A grey block where content is about to appear. It does not animate, so a loading
/// screen is calm and tests need no timers.
class Skeleton extends StatelessWidget {
  const Skeleton({super.key, this.width, this.height = 16});

  final double? width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: context.colors.skeleton,
        borderRadius: const BorderRadius.all(Radius.circular(4)),
      ),
    );
  }
}

/// A card-shaped placeholder for one row of a list.
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({super.key, this.lines = 2});

  final int lines;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const FractionallySizedBox(
              widthFactor: 0.5,
              child: Skeleton(height: 18),
            ),
            for (var line = 0; line < lines; line += 1) ...[
              const SizedBox(height: AppSpacing.md),
              FractionallySizedBox(
                widthFactor: line.isEven ? 0.8 : 0.6,
                child: const Skeleton(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The placeholder of a whole list while its first page loads. [label] is what a screen
/// reader announces, such as "Loading leads".
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, required this.label, this.count = 4});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      liveRegion: true,
      child: ExcludeSemantics(
        child: Column(
          children: [
            for (var index = 0; index < count; index += 1)
              const Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.md),
                child: SkeletonCard(),
              ),
          ],
        ),
      ),
    );
  }
}
