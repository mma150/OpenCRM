import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:opencrm/core/api/api_client.dart';
import 'package:opencrm/core/api/api_error.dart';
import 'package:opencrm/core/api/json.dart';
import 'package:opencrm/core/auth/auth_controller.dart';
import 'package:opencrm/core/auth/user.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';
import 'package:opencrm/core/widgets/dialogs.dart';
import 'package:opencrm/core/widgets/form_fields.dart';
import 'package:opencrm/core/widgets/skeleton.dart';
import 'package:opencrm/core/widgets/snackbars.dart';
import 'package:opencrm/core/widgets/state_views.dart';

/// Someone a record can be given to: `GET /users/assignable`.
class AssignableUser {
  const AssignableUser({
    required this.id,
    required this.name,
    required this.role,
  });

  factory AssignableUser.fromJson(Json json) {
    return AssignableUser(
      id: readString(json, 'id'),
      name: readString(json, 'name'),
      role: Role.fromApi(readString(json, 'role')),
    );
  }

  final String id;
  final String name;
  final Role role;
}

/// The people the signed-in user may make the owner of a record: for an Admin every
/// active user who is not Read-only, for a Sales Manager themselves and their team.
final assignableUsersProvider =
    FutureProvider.autoDispose<List<AssignableUser>>((ref) async {
      ref.watch(sessionUserIdProvider);
      final response = await ref
          .watch(apiClientProvider)
          .get('/users/assignable');
      return readList(response.data, AssignableUser.fromJson);
    });

/// Opens the "Reassign" sheet of an owned record (a lead, later a contact, a company, an
/// opportunity): pick the new owner, and [onAssign] sends the choice to the record's own
/// route. Show it only to a role that may reassign (`Role.canReassignRecords`).
Future<void> showReassignSheet(
  BuildContext context, {
  required String recordName,
  required String currentOwnerId,
  required Future<void> Function(String ownerId) onAssign,
}) {
  return showAppSheet<void>(
    context,
    title: 'Reassign',
    builder: (context) => _ReassignForm(
      recordName: recordName,
      currentOwnerId: currentOwnerId,
      onAssign: onAssign,
    ),
  );
}

class _ReassignForm extends ConsumerStatefulWidget {
  const _ReassignForm({
    required this.recordName,
    required this.currentOwnerId,
    required this.onAssign,
  });

  final String recordName;
  final String currentOwnerId;
  final Future<void> Function(String ownerId) onAssign;

  @override
  ConsumerState<_ReassignForm> createState() => _ReassignFormState();
}

class _ReassignFormState extends ConsumerState<_ReassignForm> {
  late String _ownerId = widget.currentOwnerId;
  ServerErrors _errors = ServerErrors.none;
  bool _saving = false;

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _errors = ServerErrors.none;
    });
    try {
      await widget.onAssign(_ownerId);
      if (!mounted) {
        return;
      }
      showSuccessSnackBar(context, 'Owner changed.');
      Navigator.of(context).pop();
    } on ApiError catch (error) {
      if (mounted) {
        setState(() {
          // A message about `ownerId` is about the person chosen: shown above the list.
          _errors = ServerErrors.from(error, fields: const {});
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final users = ref.watch(assignableUsersProvider);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MutedText('Choose the new owner of ${widget.recordName}.'),
        const SizedBox(height: AppSpacing.md),
        FormErrorBanner(_errors.form),
        ...users.when(
          loading: () => const [
            SkeletonList(label: 'Loading people', count: 2),
          ],
          error: (error, _) => [
            ErrorState(
              error: ApiError.from(error),
              onRetry: () => ref.invalidate(assignableUsersProvider),
              compact: true,
            ),
          ],
          data: (people) => [
            RadioGroup<String>(
              groupValue: _ownerId,
              onChanged: (id) => setState(() => _ownerId = id ?? _ownerId),
              child: Column(
                children: [
                  for (final person in people)
                    RadioListTile<String>(
                      value: person.id,
                      contentPadding: EdgeInsets.zero,
                      title: Text(person.name),
                      subtitle: Text(
                        person.id == widget.currentOwnerId
                            ? '${person.role.label} · Current owner'
                            : person.role.label,
                        style: TextStyle(color: context.colors.textMuted),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            SubmitButton(
              label: 'Reassign',
              saving: _saving,
              onPressed: _ownerId == widget.currentOwnerId
                  ? () => Navigator.of(context).pop()
                  : _save,
            ),
          ],
        ),
      ],
    );
  }
}
