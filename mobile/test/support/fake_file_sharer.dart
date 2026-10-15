import 'dart:typed_data';
import 'dart:ui';

import 'package:opencrm/core/share/file_sharer.dart';

/// One file the app handed to the share sheet.
class SharedFile {
  const SharedFile(this.bytes, this.fileName, this.mimeType, this.origin);

  final Uint8List bytes;
  final String fileName;
  final String mimeType;
  final Rect? origin;
}

/// The share sheet of the tests: records what the app shared, and never reaches the
/// platform. Set [error] to make the sheet fail to open.
class FakeFileSharer implements FileSharer {
  final List<SharedFile> shared = [];
  Object? error;

  @override
  Future<void> shareFile(
    Uint8List bytes, {
    required String fileName,
    required String mimeType,
    Rect? origin,
  }) async {
    final failure = error;
    if (failure != null) {
      throw failure;
    }
    shared.add(SharedFile(bytes, fileName, mimeType, origin));
  }
}
