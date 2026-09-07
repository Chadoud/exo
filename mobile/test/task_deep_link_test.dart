import 'package:exosites_mobile/notifications/task_deep_link.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses exosites://tasks/{id}', () {
    expect(taskRecordIdFromUri(Uri.parse('exosites://tasks/42')), '42');
    expect(taskRecordIdFromUri(Uri.parse('exosites://oauth?exo_code=x')), isNull);
    expect(taskRecordIdFromUri(Uri.parse('exosites://tasks/')), isNull);
    expect(taskRecordIdFromUri(Uri.parse('https://exosites.ch/tasks/1')), isNull);
  });

  test('actions deep link opens Tasks without a task id', () {
    expect(opensTasksFromUri(Uri.parse('exosites://actions/mail_reply:9')), isTrue);
    expect(taskRecordIdFromUri(Uri.parse('exosites://actions/mail_reply:9')), isNull);
    expect(opensTasksFromUri(Uri.parse('exosites://oauth')), isFalse);
  });
}
