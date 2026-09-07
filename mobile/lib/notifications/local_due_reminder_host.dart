import 'dart:async';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'due_reminder_host.dart';
import 'due_reminder_plan.dart';

const _channelId = 'exo_due_tasks';
const _channelName = 'Task reminders';
const _channelDesc = 'When a synced task is due';

/// OS local notifications. Do not construct in widget tests.
class LocalDueReminderHost implements DueReminderHost {
  LocalDueReminderHost({FlutterLocalNotificationsPlugin? plugin})
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  final _taps = StreamController<String>.broadcast();
  final Set<int> _dueIds = {};
  bool _ready = false;

  Future<void> ensureStarted() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
      onDidReceiveNotificationResponse: _onResponse,
    );
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            _channelId,
            _channelName,
            description: _channelDesc,
            importance: Importance.high,
          ),
        );
    final launch = await _plugin.getNotificationAppLaunchDetails();
    final payload = launch?.notificationResponse?.payload;
    if (launch?.didNotificationLaunchApp == true && payload != null && payload.isNotEmpty) {
      _taps.add(payload);
    }
    _ready = true;
  }

  void _onResponse(NotificationResponse response) {
    final payload = response.payload;
    if (payload == null || payload.isEmpty) return;
    _taps.add(payload);
  }

  @override
  Stream<String> get taskTaps => _taps.stream;

  @override
  Future<bool> hasPermission() async {
    await ensureStarted();
    final android = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) {
      return await android.areNotificationsEnabled() ?? false;
    }
    final ios = _plugin.resolvePlatformSpecificImplementation<
        IOSFlutterLocalNotificationsPlugin>();
    if (ios != null) {
      final status = await ios.checkPermissions();
      return status?.isEnabled ?? false;
    }
    return false;
  }

  @override
  Future<bool> requestPermission() async {
    await ensureStarted();
    final android = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) {
      return await android.requestNotificationsPermission() ?? false;
    }
    final ios = _plugin.resolvePlatformSpecificImplementation<
        IOSFlutterLocalNotificationsPlugin>();
    if (ios != null) {
      return await ios.requestPermissions(alert: true, sound: true) ?? false;
    }
    return false;
  }

  @override
  Future<void> cancel(String recordId) async {
    await ensureStarted();
    final id = notificationIdFor(recordId);
    _dueIds.remove(id);
    await _plugin.cancel(id);
  }

  @override
  Future<void> cancelAll() async {
    await ensureStarted();
    _dueIds.clear();
    await _plugin.cancelAll();
  }

  @override
  Future<void> showNow(DueReminderPlan plan) async {
    await ensureStarted();
    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        _channelName,
        channelDescription: _channelDesc,
        importance: Importance.high,
        priority: Priority.high,
      ),
      iOS: DarwinNotificationDetails(presentAlert: true, presentBadge: false),
    );
    await _plugin.show(
      notificationIdFor(plan.recordId),
      plan.title,
      plan.body,
      details,
      payload: plan.recordId,
    );
  }

  @override
  Future<void> replaceAll(List<DueReminderPlan> plans) async {
    await ensureStarted();
    for (final id in _dueIds) {
      await _plugin.cancel(id);
    }
    _dueIds.clear();
    for (final plan in plans) {
      await _scheduleOne(plan);
      _dueIds.add(notificationIdFor(plan.recordId));
    }
  }

  Future<void> _scheduleOne(DueReminderPlan plan) async {
    final when = tz.TZDateTime.from(plan.fireAt.toUtc(), tz.UTC);
    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        _channelName,
        channelDescription: _channelDesc,
        importance: Importance.high,
        priority: Priority.high,
      ),
      iOS: DarwinNotificationDetails(presentAlert: true, presentBadge: false),
    );
    try {
      await _plugin.zonedSchedule(
        notificationIdFor(plan.recordId),
        plan.title,
        plan.body,
        when,
        details,
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        uiLocalNotificationDateInterpretation:
            UILocalNotificationDateInterpretation.absoluteTime,
        payload: plan.recordId,
      );
    } catch (_) {
      await _plugin.zonedSchedule(
        notificationIdFor(plan.recordId),
        plan.title,
        plan.body,
        when,
        details,
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        uiLocalNotificationDateInterpretation:
            UILocalNotificationDateInterpretation.absoluteTime,
        payload: plan.recordId,
      );
    }
  }
}
