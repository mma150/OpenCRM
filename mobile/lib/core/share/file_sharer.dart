import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

/// Hands a file the app holds in memory to the phone's share sheet (Android's chooser,
/// iOS's activity view), where the user saves it, mails it or sends it to another app.
///
/// The one seam to the platform: only this file imports `share_plus`, and the tests
/// replace [fileSharerProvider] with a fake, so they never reach a platform channel.
abstract class FileSharer {
  /// Opens the share sheet with one file. Completes when the sheet closes, whatever the
  /// user chose (also nothing). Throws when the sheet cannot be opened.
  ///
  /// [origin] is the area the sheet points at on an iPad: the button that opened it.
  Future<void> shareFile(
    Uint8List bytes, {
    required String fileName,
    required String mimeType,
    Rect? origin,
  });
}

/// [FileSharer] with `share_plus`. The bytes are written by the plugin to the app's cache
/// folder under [fileName], which the system clears when it needs the space; nothing is
/// stored anywhere the user can browse until they choose a place in the sheet.
class SharePlusFileSharer implements FileSharer {
  const SharePlusFileSharer();

  @override
  Future<void> shareFile(
    Uint8List bytes, {
    required String fileName,
    required String mimeType,
    Rect? origin,
  }) async {
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile.fromData(bytes, name: fileName, mimeType: mimeType)],
        // The name of XFile.fromData is ignored on most platforms; this one is used.
        fileNameOverrides: [fileName],
        sharePositionOrigin: origin,
      ),
    );
  }
}

/// The app's [FileSharer]. Tests override it with a fake.
final fileSharerProvider = Provider<FileSharer>(
  (ref) => const SharePlusFileSharer(),
);
