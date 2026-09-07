import 'dart:convert';

import 'package:exosites_mobile/notifications/due_reminder_plan.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _row({
  required String id,
  required Map<String, dynamic> payload,
}) {
  return {
    'record_id': id,
    'payload_json': jsonEncode(payload),
  };
}

void main() {
  final now = DateTime(2026, 9, 7, 12, 0);

  test('parseTaskDueAt treats Z as UTC instant', () {
    final due = parseTaskDueAt('2026-09-07T15:00:00Z');
    expect(due, isNotNull);
    expect(due!.isUtc, isFalse);
    expect(due.toUtc(), DateTime.utc(2026, 9, 7, 15));
  });

  test('parseTaskDueAt keeps naive clock as local', () {
    final due = parseTaskDueAt('2026-09-07T17:30:00');
    expect(due, DateTime(2026, 9, 7, 17, 30));
    expect(due!.isUtc, isFalse);
  });

  test('planDueReminders skips completed, past, and empty ids', () {
    final plans = planDueReminders(
      rows: [
        _row(id: 'past', payload: {
          'description': 'Old',
          'completed': false,
          'due_at': '2026-09-07T10:00:00',
        }),
        _row(id: 'done', payload: {
          'description': 'Done',
          'completed': true,
          'due_at': '2026-09-08T10:00:00',
        }),
        _row(id: '', payload: {
          'description': 'No id',
          'due_at': '2026-09-08T10:00:00',
        }),
        _row(id: 'soon', payload: {
          'description': 'Call the landlord',
          'completed': false,
          'due_at': '2026-09-07T18:00:00',
        }),
      ],
      now: now,
      showLockScreenDetail: true,
      genericTitle: 'Task due',
      genericBody: 'Open Tasks',
    );
    expect(plans, hasLength(1));
    expect(plans.single.recordId, 'soon');
    expect(plans.single.title, 'Call the landlord');
  });

  test('lock-screen detail off uses generic title', () {
    final plans = planDueReminders(
      rows: [
        _row(id: '1', payload: {
          'description': 'Secret invoice',
          'completed': false,
          'due_at': '2026-09-08T09:00:00',
        }),
      ],
      now: now,
      showLockScreenDetail: false,
      genericTitle: 'Task due',
      genericBody: 'Open Tasks',
    );
    expect(plans.single.title, 'Task due');
    expect(plans.single.body, 'Open Tasks');
  });

  test('caps soonest N and stable notification ids', () {
    final rows = [
      for (var i = 1; i <= 25; i++)
        _row(
          id: 't$i',
          payload: {
            'description': 'T$i',
            'completed': false,
            'due_at': DateTime(2026, 9, 8, i).toIso8601String(),
          },
        ),
    ];
    final plans = planDueReminders(
      rows: rows,
      now: now,
      showLockScreenDetail: false,
      genericTitle: 'Task due',
      genericBody: 'Open Tasks',
      cap: 20,
    );
    expect(plans, hasLength(20));
    expect(plans.first.recordId, 't1');
    expect(notificationIdFor('abc'), notificationIdFor('abc'));
    expect(notificationIdFor('abc'), isNonZero);
  });
}
