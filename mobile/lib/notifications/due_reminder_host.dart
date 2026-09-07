import 'due_reminder_plan.dart';

/// Platform notifications. Tests use [MemoryDueReminderHost].
abstract class DueReminderHost {
  Future<bool> hasPermission();
  Future<bool> requestPermission();
  Future<void> replaceAll(List<DueReminderPlan> plans);
  Future<void> showNow(DueReminderPlan plan);
  Future<void> cancel(String recordId);
  Future<void> cancelAll();

  /// Task [record_id] from a notification tap (including cold start).
  Stream<String> get taskTaps;
}

/// In-memory host — widget/unit tests and default when no plugin is wired.
class MemoryDueReminderHost implements DueReminderHost {
  MemoryDueReminderHost({this.permissionGranted = false});

  bool permissionGranted;
  int requestCount = 0;
  final List<DueReminderPlan> scheduled = [];
  final List<DueReminderPlan> shownNow = [];
  final List<String> tapLog = [];

  @override
  Future<bool> hasPermission() async => permissionGranted;

  @override
  Future<bool> requestPermission() async {
    requestCount++;
    permissionGranted = true;
    return true;
  }

  @override
  Future<void> replaceAll(List<DueReminderPlan> plans) async {
    scheduled
      ..clear()
      ..addAll(plans);
  }

  @override
  Future<void> showNow(DueReminderPlan plan) async {
    shownNow.removeWhere((p) => p.recordId == plan.recordId);
    shownNow.add(plan);
  }

  @override
  Future<void> cancel(String recordId) async {
    scheduled.removeWhere((p) => p.recordId == recordId);
    shownNow.removeWhere((p) => p.recordId == recordId);
  }

  @override
  Future<void> cancelAll() async {
    scheduled.clear();
    shownNow.clear();
  }

  @override
  Stream<String> get taskTaps => const Stream.empty();

  void emitTap(String recordId) => tapLog.add(recordId);
}
