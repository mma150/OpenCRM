/// Typed reads from decoded JSON. Models use these in their hand-written `fromJson`
/// (there is no code generation), so a wrong shape fails in one predictable way: a
/// [FormatException] naming the key, which the screens show as an unexpected error.
library;

typedef Json = Map<String, dynamic>;

Json asMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map((key, item) => MapEntry(key.toString(), item));
  }
  throw FormatException('Expected an object, got ${value.runtimeType}');
}

List<Object?> asList(Object? value) {
  if (value is List) {
    return value;
  }
  throw FormatException('Expected a list, got ${value.runtimeType}');
}

/// A list of objects, each read with [fromJson].
List<T> readList<T>(Object? value, T Function(Json json) fromJson) {
  return [for (final item in asList(value)) fromJson(asMap(item))];
}

String readString(Json json, String key) {
  final value = json[key];
  if (value is String) {
    return value;
  }
  throw FormatException('Expected "$key" to be a string');
}

String? readStringOrNull(Json json, String key) {
  final value = json[key];
  if (value == null || value is String) {
    return value as String?;
  }
  throw FormatException('Expected "$key" to be a string or null');
}

int readInt(Json json, String key) {
  final value = json[key];
  if (value is num) {
    return value.round();
  }
  throw FormatException('Expected "$key" to be a number');
}

double readDouble(Json json, String key) {
  final value = json[key];
  if (value is num) {
    return value.toDouble();
  }
  throw FormatException('Expected "$key" to be a number');
}

double? readDoubleOrNull(Json json, String key) {
  return json[key] == null ? null : readDouble(json, key);
}

bool readBool(Json json, String key) {
  final value = json[key];
  if (value is bool) {
    return value;
  }
  throw FormatException('Expected "$key" to be true or false');
}

/// An exact moment (`"2026-11-15T09:30:00.000Z"`), as the device's local time.
DateTime readDate(Json json, String key) {
  final parsed = DateTime.tryParse(readString(json, key));
  if (parsed == null) {
    throw FormatException('Expected "$key" to be a date');
  }
  return parsed.toLocal();
}

DateTime? readDateOrNull(Json json, String key) {
  return json[key] == null ? null : readDate(json, key);
}

/// An object such as `{ id, name }`, or null.
Json? readMapOrNull(Json json, String key) {
  return json[key] == null ? null : asMap(json[key]);
}
