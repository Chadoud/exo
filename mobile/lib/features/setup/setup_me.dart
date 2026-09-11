/// /v1/me slice the first-run router needs. Missing keys fail open.
class SetupMeSnapshot {
  const SetupMeSnapshot({
    required this.loaded,
    required this.storeCheckoutRequired,
    this.firstName,
    this.displayName,
    this.workRole,
  });

  static const empty = SetupMeSnapshot(loaded: false, storeCheckoutRequired: false);

  static const workRoles = ['investing', 'sales', 'hiring', 'founder', 'other'];

  final bool loaded;
  final bool storeCheckoutRequired;
  final String? firstName;
  final String? displayName;
  final String? workRole;

  bool get needsNameFields {
    return !_hasText(displayName) && !_hasText(firstName);
  }

  bool get needsWorkRole => !workRoles.contains(workRole);

  bool get profileIncomplete => needsNameFields || needsWorkRole;

  factory SetupMeSnapshot.fromJson(Map<String, dynamic>? json) {
    if (json == null) return empty;
    final profile = json['profile'];
    final profileMap = profile is Map
        ? Map<String, dynamic>.from(profile)
        : const <String, dynamic>{};
    return SetupMeSnapshot(
      loaded: true,
      storeCheckoutRequired: json['store_checkout_required'] == true,
      firstName: _asNonEmpty(json['first_name']),
      displayName: _asNonEmpty(profileMap['display_name']),
      workRole: _asNonEmpty(profileMap['work_role']),
    );
  }

  SetupMeSnapshot copyWith({
    bool? loaded,
    bool? storeCheckoutRequired,
    String? firstName,
    String? displayName,
    String? workRole,
  }) {
    return SetupMeSnapshot(
      loaded: loaded ?? this.loaded,
      storeCheckoutRequired: storeCheckoutRequired ?? this.storeCheckoutRequired,
      firstName: firstName ?? this.firstName,
      displayName: displayName ?? this.displayName,
      workRole: workRole ?? this.workRole,
    );
  }

  static bool _hasText(String? value) => value != null && value.trim().isNotEmpty;

  static String? _asNonEmpty(Object? value) {
    if (value is! String) return null;
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
}
