import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:opencrm/app/navigation.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/format/formatters.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/theme/theme_controller.dart';
import 'package:opencrm/core/widgets/app_scaffold.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/state_views.dart';
import 'package:opencrm/core/widgets/status_badge.dart';

/// The version shown at the bottom of the More tab. Keep it equal to `version` in
/// pubspec.yaml (a test checks it).
const appVersion = '0.1.0';

/// The More tab: who is signed in, the pages that have no tab of their own (the
/// `moreItems` of `navigation.dart`), the theme, the server, and signing out.
class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  Future<void> _chooseTheme(
    BuildContext context,
    WidgetRef ref,
    ThemeMode current,
  ) async {
    final mode = await showOptionsSheet<ThemeMode>(
      context,
      title: 'Theme',
      selected: current,
      options: [
        for (final entry in themeModeLabels.entries)
          SheetOption(value: entry.key, label: entry.value),
      ],
    );
    if (mode != null) {
      await ref.read(themeControllerProvider.notifier).choose(mode);
    }
  }

  Future<void> _changeServer(BuildContext context, WidgetRef ref) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Change server?',
      message: 'You will be signed out, and the app will ask for the address of another server.',
      confirmLabel: 'Sign out and change',
    );
    if (confirmed) {
      await ref.read(authControllerProvider.notifier).changeServer();
    }
  }

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Sign out?',
      message: 'You will need your email and password to sign in again.',
      confirmLabel: 'Sign out',
    );
    if (confirmed) {
      await ref.read(authControllerProvider.notifier).signOut();
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final serverUrl = ref.watch(authControllerProvider).serverUrl ?? '';
    final themeMode = ref.watch(themeControllerProvider);
    final text = Theme.of(context).textTheme;

    // The pages of navigation.dart, grouped under their headings in the order given.
    final sections = <String, List<MoreItem>>{};
    for (final item in moreItemsFor(user.role)) {
      sections.putIfAbsent(item.section, () => []).add(item);
    }

    return AppScaffold(
      title: 'More',
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.page),
        children: [
          SectionCard(
            child: Row(
              children: [
                InitialsAvatar(initials: initials(user.name), size: 44),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user.name, style: text.titleMedium),
                      MutedText(user.email),
                      const SizedBox(height: AppSpacing.xs),
                      StatusBadge(label: user.role.label, tone: Tone.info),
                    ],
                  ),
                ),
              ],
            ),
          ),
          for (final MapEntry(key: heading, value: items) in sections.entries)
            _Section(
              heading: heading,
              rows: [
                for (final item in items)
                  _Row(
                    icon: item.icon,
                    label: item.label,
                    onTap: () => context.go(item.path),
                  ),
              ],
            ),
          _Section(
            heading: 'Account',
            rows: [
              _Row(
                icon: Icons.palette_outlined,
                label: 'Theme',
                value: themeModeLabels[themeMode],
                onTap: () => _chooseTheme(context, ref, themeMode),
              ),
              _Row(
                icon: Icons.dns_outlined,
                label: 'Server',
                value: serverUrl,
                onTap: () => _changeServer(context, ref),
              ),
              _Row(
                icon: Icons.logout,
                label: 'Sign out',
                danger: true,
                onTap: () => _signOut(context, ref),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          const Center(
            child: MutedText(
              'OpenCRM $appVersion · Open source, self-hosted',
              small: true,
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.heading, required this.rows});

  final String heading;
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.xs,
            AppSpacing.xl,
            0,
            AppSpacing.sm,
          ),
          child: Semantics(
            header: true,
            child: Text(
              heading.toUpperCase(),
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: context.colors.textMuted,
                letterSpacing: 0.8,
              ),
            ),
          ),
        ),
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (final (index, row) in rows.indexed) ...[
                if (index > 0) const Divider(),
                row,
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    required this.onTap,
    this.value,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  /// The current choice, under the label: the theme, the server address.
  final String? value;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? context.colors.danger : null;
    return ListTile(
      minTileHeight: 56,
      leading: Icon(icon, color: color),
      title: Text(label, style: TextStyle(color: color)),
      subtitle: value == null
          ? null
          : Text(
              value!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: context.colors.textMuted),
            ),
      trailing: danger
          ? null
          : Icon(Icons.chevron_right, color: context.colors.textMuted),
      onTap: onTap,
    );
  }
}
