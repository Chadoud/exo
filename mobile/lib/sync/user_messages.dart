/// Centralized user-facing copy for sync/auth (English; extract to ARB later).
abstract final class SyncUserMessages {
  // Setup
  static const setupTitle = 'Sign in to your account';
  static const setupTitleCreate = 'Create your account';
  static const setupSubtitle =
      'Then link this phone to your computer to sync your Exo.';
  static const signInWithGoogle = 'Google';
  static const signInWithApple = 'Apple';
  static const signIn = 'Sign in';
  static const signInWithEmail = 'Sign in';
  static const createAccount = 'Create account';
  static const haveAccountSignIn = 'Already have an account? Sign in';
  static const noAccountCreate = 'No account yet? Create one';
  static const emailLabel = 'Email';
  static const passwordLabel = 'Password';
  static const orDivider = 'or';
  static const orContinueWith = 'or continue with';
  static const openSignInAgain = 'Open sign-in again';
  static const signInAgain = 'Sign in again';
  static const pairAgain = 'Pair again';
  static const waitingForGoogle =
      'Finish sign-in in the browser, then return here.';
  static const signInFailed = 'Couldn\'t sign in — try again.';
  static const cloudUnreachable =
      'Can\'t reach Exo\'s servers. Check your connection and try again.';
  static const invalidEmailPassword = 'Email or password looks wrong — try again.';
  static const scanDesktopCode = 'Scan desktop code';
  static const pairStepTitle = 'Scan the code on your computer';
  static const pairPasteTitle = 'Paste pairing code';
  static const pairStepSubtitle =
      'On desktop: Settings → Sync → Pair mobile device. Or copy the pairing code and paste it below.';
  static const pairStepSubtitleNoCamera =
      'This device has no camera. On desktop: Settings → Sync → Copy pairing code, then paste it here.';
  static const pastePairingHint =
      'Or paste the code from desktop instead of scanning.';
  static const pastePairingPrimaryHint =
      'On desktop tap Copy pairing code, then paste it below.';
  static const pastePairingFieldHint = 'Paste pairing code from desktop';
  static const pasteFromClipboard = 'Paste from clipboard';
  static const usePastedCode = 'Use pasted code';
  static const clipboardEmpty = 'Nothing to paste — copy the code from desktop Sync settings first.';
  static const updatingFromDesktop = 'Updating from desktop…';
  static const syncNow = 'Sync now';
  static const firstSyncFailed = 'Couldn\'t update yet.';
  static const continueToMemories = 'Continue to memories';
  static const tryAgain = 'Try again';
  static const stepSignIn = 'Step 1 of 2';
  static const stepPair = 'Step 2 of 2';

  // Status / sync
  static const notSignedIn = 'Sign in to continue.';
  static const notPaired = 'Scan the desktop code to unlock your notes.';
  static const authExpired = 'Session ended — sign in again.';
  static const networkFailed = 'Couldn\'t reach Exo — check your connection.';
  static const decryptFailed =
      'Couldn\'t read synced data — pair again from desktop.';
  static const syncFailed = 'Couldn\'t update — try again.';
  static const youreOffline = 'You\'re offline — try again when connected.';
  static const invalidPairingQr =
      'Couldn\'t read that code. Try again from desktop Settings → Sync.';

  static String upToDate(int memoryCount) =>
      'Up to date · $memoryCount memories on this phone';

  static String syncedNothingNew() => 'Up to date — nothing new yet.';

  // Memory
  static const memoriesTitle = 'Memories';
  static const memoryFallbackTitle = 'Memory';
  static const memoryEmptyTitle = 'Nothing from desktop yet';
  static const memoryEmptySubtitle =
      'Add notes on desktop, then pull to refresh.';
  static const selectMemoryTitle = 'Select a memory';
  static const selectMemorySubtitle = 'Choose an item from the list to read it here.';

  // Capture / settings
  static const captureComingSoon =
      'Voice capture is coming in a later update.';
  static const signOut = 'Sign out';
  static const signOutConfirmTitle = 'Sign out and clear memories on this phone?';
  static const signOutConfirmBody =
      'This removes sign-in, pairing, and local notes from this device.';
  static const cancel = 'Cancel';
  static const signedOutSnack =
      'Signed out — keys and local cache cleared on this phone.';

  // Legacy helpers used by older call sites
  static const signInAndPair = notSignedIn;
}
