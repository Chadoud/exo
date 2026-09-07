/// In-memory debug seams for local/device testing. Never log tokens or mail bodies.
class SyncDebugLog {
  SyncDebugLog._();

  static String? lastWakeType;
  static String? lastEvent;
  static int lastDueScheduled = 0;
  static int lastReadyActions = 0;

  static void note(String event) {
    lastEvent = event;
  }

  static void reset() {
    lastWakeType = null;
    lastEvent = null;
    lastDueScheduled = 0;
    lastReadyActions = 0;
  }
}
