import 'package:exosites_mobile/design/due_day_badge.dart';
import 'package:exosites_mobile/features/inbox/inbox_due.dart';
import 'package:exosites_mobile/features/tasks/task_due_label.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final now = DateTime(2026, 9, 9, 15);

  test('taskDueDayDelta is calendar days, not hours', () {
    expect(
      taskDueDayDelta({'due_at': '2026-09-12T08:00:00'}, now: now),
      3,
    );
    expect(
      taskDueDayDelta({'due_at': '2026-09-09T23:00:00'}, now: now),
      0,
    );
    expect(
      taskDueDayDelta({'due_at': '2026-09-07T08:00:00'}, now: now),
      -2,
    );
    expect(taskDueDayDelta({'completed': true, 'due_at': '2026-09-01'}, now: now), isNull);
    expect(taskDueDayDelta({}, now: now), isNull);
  });

  test('inboxDueDaysFor uses joined task when the mail has no due', () {
    expect(
      inboxDueDaysFor(
        {'task_record_id': '5'},
        taskDueById: {'5': 4},
        now: now,
      ),
      4,
    );
    expect(
      inboxDueDaysFor(
        {'due_at': '2026-09-10T00:00:00', 'task_record_id': '5'},
        taskDueById: {'5': 4},
        now: now,
      ),
      1,
    );
  });

  test('DueDayBadge labels coming vs overdue days', () {
    expect(const DueDayBadge(days: 3).semanticLabel, 'Due in 3 days');
    expect(const DueDayBadge(days: -2).semanticLabel, '2 days overdue');
    expect(const DueDayBadge(days: 0).semanticLabel, 'Due today');
  });

  testWidgets('DueDayBadge paints the day count', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Row(
            children: [
              DueDayBadge(days: 3),
              DueDayBadge(days: -2),
            ],
          ),
        ),
      ),
    );
    expect(find.text('3'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
  });
}
