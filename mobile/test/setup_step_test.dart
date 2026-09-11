import 'package:exosites_mobile/features/setup/setup_me.dart';
import 'package:exosites_mobile/features/setup/setup_step.dart';
import 'package:flutter_test/flutter_test.dart';

SetupStep _step({
  bool signedIn = true,
  bool meLoaded = true,
  bool storeCheckoutRequired = false,
  bool profileIncomplete = false,
  bool sourcesAckLoaded = true,
  bool sourcesAcknowledged = false,
  bool onboardingComplete = false,
  bool paired = false,
  bool allowDevSkipPair = false,
  bool allowDevSkipFirstRun = false,
}) {
  return deriveSetupStep(
    signedIn: signedIn,
    meLoaded: meLoaded,
    storeCheckoutRequired: storeCheckoutRequired,
    profileIncomplete: profileIncomplete,
    sourcesAckLoaded: sourcesAckLoaded,
    sourcesAcknowledged: sourcesAcknowledged,
    onboardingComplete: onboardingComplete,
    paired: paired,
    allowDevSkipPair: allowDevSkipPair,
    allowDevSkipFirstRun: allowDevSkipFirstRun,
  );
}

void main() {
  test('deriveSetupStep: missing store flag does not wall pairing', () {
    expect(_step(sourcesAcknowledged: true), SetupStep.pair);
  });

  test('deriveSetupStep: new account with store required sees trial first', () {
    expect(
      _step(storeCheckoutRequired: true, profileIncomplete: true),
      SetupStep.trial,
    );
  });

  test('deriveSetupStep: after trial, incomplete profile is next', () {
    expect(_step(profileIncomplete: true), SetupStep.profile);
  });

  test('deriveSetupStep: after profile, sources come before pair', () {
    expect(_step(), SetupStep.sources);
  });

  test('deriveSetupStep: Upgrade A skips trial, profile, and sources', () {
    expect(
      _step(
        storeCheckoutRequired: true,
        profileIncomplete: true,
        onboardingComplete: true,
      ),
      SetupStep.pair,
    );
  });

  test('deriveSetupStep: signed out is always sign-in', () {
    expect(
      _step(signedIn: false, storeCheckoutRequired: true, profileIncomplete: true),
      SetupStep.signIn,
    );
  });

  test('deriveSetupStep: paired after checkout and sources goes to first sync', () {
    expect(_step(paired: true, sourcesAcknowledged: true), SetupStep.firstSync);
  });

  test('deriveSetupStep: first-run dev skip jumps to pair, not the shell', () {
    expect(
      _step(
        storeCheckoutRequired: true,
        profileIncomplete: true,
        allowDevSkipFirstRun: true,
      ),
      SetupStep.pair,
    );
  });

  test('deriveSetupStep: waits for /me and sources ack before later steps', () {
    expect(
      _step(meLoaded: false, storeCheckoutRequired: true, profileIncomplete: true),
      SetupStep.loadingMe,
    );
    expect(_step(sourcesAckLoaded: false), SetupStep.loadingMe);
  });

  test('SetupMeSnapshot treats a missing store_checkout_required as false', () {
    expect(SetupMeSnapshot.fromJson({'email': 'a@b.c'}).storeCheckoutRequired, isFalse);
    expect(
      SetupMeSnapshot.fromJson({'store_checkout_required': true}).storeCheckoutRequired,
      isTrue,
    );
    expect(SetupMeSnapshot.fromJson(null).loaded, isFalse);
  });

  test('SetupMeSnapshot needs name only when display_name and first_name are blank', () {
    expect(SetupMeSnapshot.fromJson({'email': 'a@b.c'}).needsNameFields, isTrue);
    expect(
      SetupMeSnapshot.fromJson({'first_name': 'Ada'}).needsNameFields,
      isFalse,
    );
    expect(
      SetupMeSnapshot.fromJson({
        'profile': {'display_name': 'Ada'},
      }).needsNameFields,
      isFalse,
    );
  });

  test('SetupMeSnapshot is incomplete until a known work_role is set', () {
    final blank = SetupMeSnapshot.fromJson({'first_name': 'Ada'});
    expect(blank.needsWorkRole, isTrue);
    expect(blank.profileIncomplete, isTrue);
    final ready = SetupMeSnapshot.fromJson({
      'first_name': 'Ada',
      'profile': {'work_role': 'founder'},
    });
    expect(ready.profileIncomplete, isFalse);
    expect(
      SetupMeSnapshot.fromJson({
        'first_name': 'Ada',
        'profile': {'work_role': 'operations'},
      }).needsWorkRole,
      isTrue,
    );
  });
}
