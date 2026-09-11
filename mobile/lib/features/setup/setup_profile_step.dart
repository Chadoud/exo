import 'package:flutter/material.dart';

import '../../app/mobile_sync_config.dart';
import '../../sync/cloud_api.dart';
import 'setup_copy.dart';
import 'setup_me.dart';
import 'setup_profile_panel.dart';

/// Collects a name when blank and one work chip, then PATCHes /v1/me.
class SetupProfileStep extends StatefulWidget {
  const SetupProfileStep({
    super.key,
    required this.config,
    required this.me,
    required this.onSaved,
    required this.onSignOut,
  });

  final MobileSyncConfig config;
  final SetupMeSnapshot me;
  final ValueChanged<SetupMeSnapshot> onSaved;
  final Future<void> Function() onSignOut;

  @override
  State<SetupProfileStep> createState() => _SetupProfileStepState();
}

class _SetupProfileStepState extends State<SetupProfileStep> {
  static const _nameCap = 120;

  String _firstName = '';
  String _lastName = '';
  String? _workRole;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _workRole = widget.me.needsWorkRole ? null : widget.me.workRole;
  }

  String? _displayNameToSend() {
    if (!widget.me.needsNameFields) return null;
    final first = _firstName.trim();
    final last = _lastName.trim();
    final joined = last.isEmpty ? first : '$first $last';
    if (joined.isEmpty) return null;
    return joined.length <= _nameCap ? joined : joined.substring(0, _nameCap);
  }

  Future<void> _save() async {
    final role = _workRole;
    if (role == null) return;
    if (widget.me.needsNameFields && _firstName.trim().isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final json = await widget.config.api.patchMe(
        displayName: _displayNameToSend(),
        workRole: role,
      );
      if (!mounted) return;
      widget.onSaved(SetupMeSnapshot.fromJson(json));
    } on CloudApiException catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = SetupCopy.of(context).profileSaveFailed;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = SetupCopy.of(context).profileSaveFailed;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SetupProfilePanel(
      copy: SetupCopy.of(context),
      showNameFields: widget.me.needsNameFields,
      firstName: _firstName,
      lastName: _lastName,
      workRole: _workRole,
      busy: _busy,
      error: _error,
      onFirstName: (value) => setState(() => _firstName = value),
      onLastName: (value) => setState(() => _lastName = value),
      onWorkRole: (value) => setState(() => _workRole = value),
      onContinue: _save,
      onSignOut: () => widget.onSignOut(),
    );
  }
}
