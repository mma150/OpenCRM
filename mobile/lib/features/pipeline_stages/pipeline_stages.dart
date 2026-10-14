import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/theme/app_colors.dart';

/// What a stage is for: a step of the pipeline, or one of its two ends. It is also the
/// status of an opportunity (the kind of the stage it is in), so the words are "Open",
/// "Won" and "Lost". Never print the raw value.
enum StageKind {
  open('OPEN', 'Open', Tone.info),
  won('WON', 'Won', Tone.success),
  lost('LOST', 'Lost', Tone.danger);

  const StageKind(this.apiValue, this.label, this.tone);

  final String apiValue;
  final String label;
  final Tone tone;

  /// A kind this version does not know throws: guessing would offer the wrong actions
  /// (moving something that is closed).
  static StageKind fromApi(String value) {
    return values.firstWhere(
      (kind) => kind.apiValue == value,
      orElse: () => throw FormatException('Unknown stage kind "$value"'),
    );
  }
}

/// A stage of the pipeline: `{ id, name, kind }`, as an opportunity, a column of the board
/// and `GET /pipeline-stages` name it. The name is an Admin's choice and is shown as it is.
class Stage {
  const Stage({required this.id, required this.name, required this.kind});

  factory Stage.fromJson(Json json) {
    return Stage(
      id: readString(json, 'id'),
      name: readString(json, 'name'),
      kind: StageKind.fromApi(readString(json, 'kind')),
    );
  }

  final String id;
  final String name;
  final StageKind kind;

  bool get isOpen => kind == StageKind.open;
}

/// The whole pipeline in order: the open stages, then Won, then Lost. The stages are set
/// up in the web app (Settings); the app only reads them.
final pipelineStagesProvider = FutureProvider<List<Stage>>((ref) async {
  ref.watch(sessionUserIdProvider);
  final response = await ref.watch(apiClientProvider).get('/pipeline-stages');
  return readList(response.data, Stage.fromJson);
});

/// The steps an opportunity can be moved to. Won and Lost are reached by closing it.
List<Stage> openStages(List<Stage> stages) {
  return [
    for (final stage in stages)
      if (stage.isOpen) stage,
  ];
}
