import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/storage/key_value_store.dart';

const _themeKey = 'theme_mode';

/// The words shown for each choice on the More tab.
const themeModeLabels = {
  ThemeMode.system: 'System',
  ThemeMode.light: 'Light',
  ThemeMode.dark: 'Dark',
};

/// Light, Dark or System (the default: follow the phone). The choice is remembered on the
/// device.
class ThemeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    Future.microtask(_restore);
    return ThemeMode.system;
  }

  Future<void> _restore() async {
    final saved = await ref.read(keyValueStoreProvider).read(_themeKey);
    final mode = ThemeMode.values
        .where((mode) => mode.name == saved)
        .firstOrNull;
    if (mode != null && ref.mounted) {
      state = mode;
    }
  }

  Future<void> choose(ThemeMode mode) async {
    state = mode;
    await ref.read(keyValueStoreProvider).write(_themeKey, mode.name);
  }
}

final themeControllerProvider = NotifierProvider<ThemeController, ThemeMode>(
  ThemeController.new,
);
