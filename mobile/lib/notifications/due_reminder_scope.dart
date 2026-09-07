import 'package:flutter/widgets.dart';

import 'due_reminder_controller.dart';

class DueReminderScope extends InheritedNotifier<DueReminderController> {
  const DueReminderScope({
    super.key,
    required DueReminderController controller,
    required super.child,
  }) : super(notifier: controller);

  static DueReminderController? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<DueReminderScope>()?.notifier;
  }
}
