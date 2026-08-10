/// Centralized user-facing copy for sync/auth (English; extract to ARB later).
abstract final class SyncUserMessages {
  // Setup
  static const setupTitle = 'Sign in to your account';
  static const setupTitleCreate = 'Create your account';
  static const setupSubtitle = 'Then link this phone to your computer.';
  static const setupPairingHint =
      'Already copied a code from desktop? Sign in first — we\'ll connect you on the next step.';
  static const signInWithGoogle = 'Continue with Google';
  static const signInWithApple = 'Continue with Apple';
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
  static const pairStepTitle = 'Link this phone to your computer';
  static const pairPasteTitle = 'Paste pairing code';
  static const pairStepSubtitle =
      'On your computer: Settings → Sync → Pair mobile device. Scan the code or paste what you copied.';
  static const pairStepSubtitleNoCamera =
      'This device can\'t scan. Paste the code you copied on your computer.';
  static const pairCodeReady = 'Code ready from your computer. Tap Connect.';
  static const pastePairingHint =
      'Or paste the code from desktop instead of scanning.';
  static const pastePairingPrimaryHint =
      'On desktop tap Copy pairing code, then paste it below.';
  static const pastePairingFieldHint = 'Paste pairing code from desktop';
  static const connectPairing = 'Connect';
  static const scanInstead = 'Scan instead';
  static const pasteFromClipboard = 'Paste from clipboard';
  static const usePastedCode = 'Use pasted code';
  static const clipboardEmpty =
      'Nothing to paste yet. On desktop: Settings → Sync → Copy pairing code.';
  static const skipPairingDev = 'Skip pairing (dev)';
  static const skipPairingDevHint =
      'Enter the app without desktop sync. Pair later from Settings when you have a code.';
  static const updatingFromDesktop = 'Updating from desktop…';
  static const syncNow = 'Sync now';
  static const firstSyncFailed = 'Couldn\'t update yet.';
  static const continueToMemories = 'Continue to memories';
  static const tryAgain = 'Try again';
  static const stepSignIn = 'Step 1 of 2 · Sign in';
  static const stepPair = 'Step 2 of 2 · Link phone';

  // Status / sync
  static const notSignedIn = 'Sign in to continue.';
  static const notPaired = 'Scan the desktop code to unlock your notes.';
  static const authExpired = 'Session ended — sign in again.';
  static const networkFailed = 'Couldn\'t reach Exo — check your connection.';
  static const decryptFailed =
      'This phone can\'t read that computer\'s data. Pair again.';
  static const schemaTooOld =
      'Update EXO to continue syncing.';
  static const syncFailed = 'Couldn\'t update — try again.';
  static const youreOffline = 'You\'re offline — try again when connected.';
  static const invalidPairingQr =
      'That code didn\'t work. On desktop: Settings → Sync → copy a fresh code, then try again.';
  static const pairingInvalidJson =
      'Paste is incomplete or not a pairing code. On desktop tap Copy pairing code, then paste the whole JSON — it must start with {"v":2';
  static const pairingUnsupportedVersion =
      'This pairing code is from an older or newer Exo. Rebuild/update the phone app and desktop, then copy a fresh code.';
  static const pairingMissingKey =
      'That code is incomplete. Copy it again from desktop Settings → Sync.';
  static const pairingDisallowedCloudUrl =
      'That code points to an unknown server. Copy a fresh code from the official Exo desktop app.';
  static const pairingMissingGrant =
      'That code is incomplete. On desktop tap Copy pairing code again (update both apps if needed).';
  static const pairingExpired =
      'This pairing code has expired. On desktop: Settings → Sync → Copy pairing code, then try again.';
  static const pairingAccountMismatch =
      'This code belongs to a different EXO account. Sign in with the same account as desktop, then pair again.';
  static const pairingRegisterFailed =
      'Phone linked, but device registration failed — Sync still works; try Sync again if the list stays empty.';

  static String upToDate(int memoryCount) =>
      'Up to date · $memoryCount memories on this phone';

  static String syncedNothingNew() => 'Up to date — nothing new yet.';

  // Settings hub
  static const settingsAccountSignedIn = 'Signed in';
  static const settingsAccountSignedOut = notSignedIn;
  static const settingsLinkPaired =
      'Linked to your computer — notes and tasks can update here.';
  static const settingsLinkPairedPendingPull =
      'Paired — pull once to finish linking notes and tasks.';
  static const settingsLinkUnpaired = notPaired;
  static const signOutSwitchAccount = 'Sign out / switch account';
  static const settingsLastUpdateNever =
      'Not updated yet — tap Sync on Memory or Tasks.';
  static String settingsLastUpdate(String when) => 'Last updated $when';

  // Shared sync empties (honest why-empty)
  static const syncEmptyUnpairedTitle = 'Link this phone to your computer';
  static const syncEmptyUnpairedSubtitle =
      'Scan or paste the desktop code in Settings to see your notes and tasks here.';
  static const syncEmptyNeverPulledTitle = 'Getting your data from desktop';
  static const syncEmptyNeverPulledSubtitle =
      'Hang tight — or pull down to refresh.';
  static const syncEmptyNeverPulledIdleSubtitle =
      'Pull down to refresh, or tap Sync at the top.';

  // Memory
  static const memoriesTitle = 'Memories';
  static const memoryFallbackTitle = 'Memory';
  static const memoryEmptyTitle = 'Nothing from desktop yet';
  static const memoryEmptySubtitle =
      'Add notes on your computer, then pull to refresh.';
  static const selectMemoryTitle = 'Select a memory';
  static const selectMemorySubtitle = 'Choose an item from the list to read it here.';
  static const searchMemoriesLabel = 'Search';
  static const searchMemoriesHint = 'Search memories';
  static const clearSearch = 'Clear search';
  static const searchNoMatchesTitle = 'No matches';
  static String searchNoMatchesSubtitle(String query) =>
      'Nothing matched “$query”.';

  // Tasks tab — synced desktop tasks; AI draft/review execute is later
  static const actionsTitle = 'Tasks';
  static const tasksTitle = 'Tasks';
  static const tasksEmptyTitle = 'No tasks from desktop yet';
  static const tasksEmptySubtitle =
      'Create tasks on your computer, then pull to refresh.';
  static const taskFallbackTitle = 'Task';
  static const taskCompletedLabel = 'Done';
  static const taskDetailReviewHint =
      'Soon EXO can draft actions here (for example an email) for you to review before anything is sent.';
  // Legacy aliases (tests / older call sites)
  static const actionsEmptyTitle = tasksEmptyTitle;
  static const actionsEmptySubtitle = tasksEmptySubtitle;

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
