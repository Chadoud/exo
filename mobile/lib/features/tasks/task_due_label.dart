import 'package:flutter/widgets.dart';

import '../../sync/task_payload.dart';

const _monthsEn = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const _monthsFr = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

bool isFrenchLocale(Locale? locale) =>
    locale?.languageCode.toLowerCase() == 'fr';

DateTime? parseTaskDueAt(Map<String, dynamic> payload) {
  final raw = payload['due_at']?.toString().trim() ?? '';
  if (raw.isEmpty) return null;
  return DateTime.tryParse(raw);
}

DateTime dateOnly(DateTime value) => DateTime(value.year, value.month, value.day);

bool taskDueIsOverdue(Map<String, dynamic> payload, {required DateTime now}) {
  if (taskPayloadIsCompleted(payload)) return false;
  final due = parseTaskDueAt(payload);
  if (due == null) return false;
  return dateOnly(due.toLocal()).isBefore(dateOnly(now.toLocal()));
}

String formatTaskDue(
  DateTime due, {
  required DateTime now,
  required bool french,
}) {
  final dueDay = dateOnly(due.toLocal());
  final today = dateOnly(now.toLocal());
  final diff = dueDay.difference(today).inDays;
  final calendar = _calendarDay(dueDay, french: french);
  if (diff < 0) {
    return french ? 'En retard · $calendar' : 'Overdue · $calendar';
  }
  if (diff == 0) return french ? 'Aujourd’hui' : 'Today';
  if (diff == 1) return french ? 'Demain' : 'Tomorrow';
  return calendar;
}

String? taskDueMeta(
  Map<String, dynamic> payload, {
  required DateTime now,
  required bool french,
}) {
  final due = parseTaskDueAt(payload);
  if (due == null) return null;
  return formatTaskDue(due, now: now, french: french);
}

String _calendarDay(DateTime day, {required bool french}) {
  final months = french ? _monthsFr : _monthsEn;
  final month = months[day.month - 1];
  return french ? '${day.day} $month' : '$month ${day.day}';
}
