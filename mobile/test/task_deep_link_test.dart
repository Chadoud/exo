import 'package:exosites_mobile/notifications/task_deep_link.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses exosites://tasks/{id}', () {
    expect(taskRecordIdFromUri(Uri.parse('exosites://tasks/42')), '42');
    expect(taskRecordIdFromUri(Uri.parse('exosites://oauth?exo_code=x')), isNull);
    expect(taskRecordIdFromUri(Uri.parse('exosites://tasks/')), isNull);
    expect(taskRecordIdFromUri(Uri.parse('https://exosites.ch/tasks/1')), isNull);
  });

  test('actions deep link opens Inbox without a task id', () {
    expect(opensInboxFromUri(Uri.parse('exosites://actions/mail_reply:9')), isTrue);
    expect(opensTasksFromUri(Uri.parse('exosites://actions/mail_reply:9')), isFalse);
    expect(taskRecordIdFromUri(Uri.parse('exosites://actions/mail_reply:9')), isNull);
    expect(inboxActionIdFromUri(Uri.parse('exosites://actions/mail_reply:9')), 'mail_reply:9');
    expect(inboxActionIdFromUri(Uri.parse('exosites://actions/')), isNull);
    expect(inboxActionIdFromUri(Uri.parse('exosites://tasks/42')), isNull);
    expect(opensTasksFromUri(Uri.parse('exosites://tasks')), isTrue);
    expect(opensTasksFromUri(Uri.parse('exosites://oauth')), isFalse);
  });
}
