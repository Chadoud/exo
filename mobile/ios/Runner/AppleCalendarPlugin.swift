import EventKit
import Flutter
import UIKit

/// Read-only EventKit. Never returns calendar titles or events to Dart.
///
/// Device checks: allow, deny, revoke, no calendars, several calendars, iCloud visible.
final class AppleCalendarPlugin: NSObject, FlutterPlugin {
  private let store = EKEventStore()

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "exosites/apple_calendar",
      binaryMessenger: registrar.messenger()
    )
    registrar.addMethodCallDelegate(AppleCalendarPlugin(), channel: channel)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "status":
      reply(currentPayload(), result)
    case "request":
      requestAccess(result)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func requestAccess(_ result: @escaping FlutterResult) {
    let finish: (Bool, Error?) -> Void = { [weak self] _, _ in
      guard let self else { return }
      self.reply(self.currentPayload(), result)
    }
    if #available(iOS 17.0, *) {
      store.requestFullAccessToEvents(completion: finish)
    } else {
      store.requestAccess(to: .event, completion: finish)
    }
  }

  private func currentPayload() -> [String: Any] {
    let status = EKEventStore.authorizationStatus(for: .event)
    let key = statusKey(status)
    let count = key == "authorized" ? store.calendars(for: .event).count : 0
    return ["status": key, "count": count]
  }

  private func statusKey(_ status: EKAuthorizationStatus) -> String {
    if #available(iOS 17.0, *) {
      switch status {
      case .fullAccess:
        return "authorized"
      case .writeOnly, .denied:
        return "denied"
      case .restricted:
        return "restricted"
      case .notDetermined:
        return "notDetermined"
      @unknown default:
        return "denied"
      }
    }
    switch status {
    case .authorized:
      return "authorized"
    case .denied:
      return "denied"
    case .restricted:
      return "restricted"
    case .notDetermined:
      return "notDetermined"
    default:
      return "denied"
    }
  }

  private func reply(_ payload: [String: Any], _ result: @escaping FlutterResult) {
    DispatchQueue.main.async {
      result(payload)
    }
  }
}
