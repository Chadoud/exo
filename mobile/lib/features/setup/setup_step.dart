/// First-run step from current account + /me. No persisted step index.
enum SetupStep { signIn, loadingMe, trial, profile, sources, pair, firstSync }

/// Missing [storeCheckoutRequired] is treated as false so staging still pairs.
SetupStep deriveSetupStep({
  required bool signedIn,
  required bool meLoaded,
  required bool storeCheckoutRequired,
  required bool profileIncomplete,
  required bool sourcesAckLoaded,
  required bool sourcesAcknowledged,
  required bool onboardingComplete,
  required bool paired,
  required bool allowDevSkipPair,
  required bool allowDevSkipFirstRun,
}) {
  if (!signedIn) return SetupStep.signIn;
  if (!meLoaded || !sourcesAckLoaded) return SetupStep.loadingMe;
  // Dev skip and Upgrade A never waive pairing unless [allowDevSkipPair] applies.
  if (!allowDevSkipFirstRun) {
    if (storeCheckoutRequired && !onboardingComplete) return SetupStep.trial;
    if (profileIncomplete && !onboardingComplete) return SetupStep.profile;
    if (!sourcesAcknowledged && !onboardingComplete) return SetupStep.sources;
  }
  if (!paired) {
    if (allowDevSkipPair && onboardingComplete) return SetupStep.firstSync;
    return SetupStep.pair;
  }
  return SetupStep.firstSync;
}
