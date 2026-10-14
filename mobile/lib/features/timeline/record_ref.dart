/// The kinds of record that have a timeline. The one table of record types: a new kind of
/// record adds one line here, and every timeline screen, sheet and request works for it.
///
/// [apiPath] is the first part of its routes (`/leads/:id/timeline`), [label] the word for
/// one of them ("Lead created").
enum RecordType {
  lead('leads', 'Lead'),
  contact('contacts', 'Contact'),
  company('companies', 'Company'),
  opportunity('opportunities', 'Opportunity');

  const RecordType(this.apiPath, this.label);

  final String apiPath;
  final String label;
}

/// One record: its kind and its id. Two refs to the same record are equal, so a ref can be
/// the argument of a provider family.
class RecordRef {
  const RecordRef(this.type, this.id);

  final RecordType type;
  final String id;

  /// `/leads/<id>`: where the record's own routes start.
  String get apiPath => '/${type.apiPath}/$id';

  @override
  bool operator ==(Object other) =>
      other is RecordRef && other.type == type && other.id == id;

  @override
  int get hashCode => Object.hash(type, id);
}
