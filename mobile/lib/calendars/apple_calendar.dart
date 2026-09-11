import 'dart:io';

import 'package:flutter/services.dart';

/// On-device EventKit snapshot. Never includes calendar titles or events.
enum AppleCalendarStatus {
  unavailable,
  notDetermined,
  denied,
  restricted,
  authorized,
}

class AppleCalendarSnapshot {
  const AppleCalendarSnapshot({
    required this.status,
    this.calendarCount = 0,
  });

  final AppleCalendarStatus status;
  final int calendarCount;

  factory AppleCalendarSnapshot.fromChannel(Map<Object?, Object?> raw) {
    final status = _statusOf(raw['status']?.toString());
    final countRaw = raw['count'];
    final count = countRaw is int
        ? countRaw
        : countRaw is num
            ? countRaw.toInt()
            : 0;
    return AppleCalendarSnapshot(
      status: status,
      calendarCount: count < 0 ? 0 : count,
    );
  }

  static AppleCalendarStatus _statusOf(String? raw) {
    switch (raw) {
      case 'authorized':
        return AppleCalendarStatus.authorized;
      case 'denied':
        return AppleCalendarStatus.denied;
      case 'restricted':
        return AppleCalendarStatus.restricted;
      case 'notDetermined':
        return AppleCalendarStatus.notDetermined;
      default:
        return AppleCalendarStatus.unavailable;
    }
  }
}

/// Read-only Apple Calendar. Android is [AppleCalendarStatus.unavailable].
abstract class AppleCalendar {
  Future<AppleCalendarSnapshot> current();

  /// Prompts only when the OS has not decided yet.
  Future<AppleCalendarSnapshot> requestAccess();
}

class DeviceAppleCalendar implements AppleCalendar {
  DeviceAppleCalendar({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('exosites/apple_calendar');

  final MethodChannel _channel;

  @override
  Future<AppleCalendarSnapshot> current() => _invoke('status');

  @override
  Future<AppleCalendarSnapshot> requestAccess() => _invoke('request');

  Future<AppleCalendarSnapshot> _invoke(String method) async {
    if (!Platform.isIOS) {
      return const AppleCalendarSnapshot(status: AppleCalendarStatus.unavailable);
    }
    try {
      final raw = await _channel.invokeMapMethod<Object?, Object?>(method);
      if (raw == null) {
        return const AppleCalendarSnapshot(status: AppleCalendarStatus.unavailable);
      }
      return AppleCalendarSnapshot.fromChannel(raw);
    } on PlatformException {
      return const AppleCalendarSnapshot(status: AppleCalendarStatus.unavailable);
    }
  }
}

class FakeAppleCalendar implements AppleCalendar {
  FakeAppleCalendar({
    this.snapshot = const AppleCalendarSnapshot(
      status: AppleCalendarStatus.notDetermined,
    ),
    this.onRequest,
  });

  AppleCalendarSnapshot snapshot;
  AppleCalendarSnapshot Function()? onRequest;

  @override
  Future<AppleCalendarSnapshot> current() async => snapshot;

  @override
  Future<AppleCalendarSnapshot> requestAccess() async {
    snapshot = onRequest?.call() ?? snapshot;
    return snapshot;
  }
}
