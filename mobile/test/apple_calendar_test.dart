import 'package:exosites_mobile/calendars/apple_calendar.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('fromChannel maps OS status and never requires titles', () {
    expect(
      AppleCalendarSnapshot.fromChannel({'status': 'authorized', 'count': 3}).status,
      AppleCalendarStatus.authorized,
    );
    expect(
      AppleCalendarSnapshot.fromChannel({'status': 'authorized', 'count': 3})
          .calendarCount,
      3,
    );
    expect(
      AppleCalendarSnapshot.fromChannel({'status': 'denied'}).status,
      AppleCalendarStatus.denied,
    );
    expect(
      AppleCalendarSnapshot.fromChannel({'status': 'restricted'}).status,
      AppleCalendarStatus.restricted,
    );
    expect(
      AppleCalendarSnapshot.fromChannel({'status': 'notDetermined'}).status,
      AppleCalendarStatus.notDetermined,
    );
    expect(
      AppleCalendarSnapshot.fromChannel({'status': 'unknown'}).status,
      AppleCalendarStatus.unavailable,
    );
  });

  test('fromChannel ignores leftover title fields', () {
    final snap = AppleCalendarSnapshot.fromChannel({
      'status': 'authorized',
      'count': 2,
      'titles': ['Work', 'Home'],
    });
    expect(snap.calendarCount, 2);
    expect(snap.toString(), isNot(contains('Work')));
  });

  test('FakeAppleCalendar request swaps snapshot without prompting', () async {
    final fake = FakeAppleCalendar(
      onRequest: () => const AppleCalendarSnapshot(
        status: AppleCalendarStatus.authorized,
        calendarCount: 1,
      ),
    );
    expect((await fake.current()).status, AppleCalendarStatus.notDetermined);
    expect((await fake.requestAccess()).status, AppleCalendarStatus.authorized);
  });
}
