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
  static const firstNameLabel = 'First name';
  static const lastNameLabel = 'Last name';
  static const emailRequired = 'Enter your email';
  static const emailInvalid = 'Enter a valid email address';
  static const passwordRequired = 'Enter your password';
  static const firstNameRequired = 'Enter your first name';
  static const lastNameRequired = 'Enter your last name';
  static const passwordMinHint = 'At least 8 characters';
  static const passwordTooShort = 'Password must be at least 8 characters.';
  static const emailAlreadyRegistered =
      'This email already has an account — sign in instead.';
  static const orDivider = 'or';
  static const orContinueWith = 'or continue with';
  static const openSignInAgain = 'Open sign-in again';
  static const signInAgain = 'Sign in again';
  static const linkAgain = 'Link again';
  static const scanNewCode = 'Scan a new code';
  static const waitingForBrowser =
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
      'Enter the app without desktop sync. Link later from Settings when you have a code.';
  static const updatingFromDesktop = 'Updating from desktop…';
  static const syncNow = 'Sync now';
  static const firstSyncFailed = 'Couldn\'t update yet.';
  static const continueToInbox = 'Continue';
  static const continueToMemories = continueToInbox;
  static const tryAgain = 'Try again';
  static const stepSignIn = 'Step 1 of 2 · Sign in';
  static const stepPair = 'Step 2 of 2 · Link phone';

  // Status / sync
  static const notSignedIn = 'Sign in to continue.';
  static const notPaired = 'Scan the desktop code to unlock your notes.';
  static const authExpired = 'Session ended — sign in again.';
  static const networkFailed = 'Couldn\'t reach Exo — check your connection.';
  static const decryptFailed =
      'This phone can\'t read that computer\'s data. Link again.';
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
      'This code belongs to a different EXO account. Sign in with the same account as desktop, then link again.';
  static const pairingRegisterFailed =
      'Phone linked, but device registration failed — Sync still works; try Sync again if the list stays empty.';

  static String upToDate(int memoryCount) =>
      'Up to date · $memoryCount facts on this phone';

  static String syncedNothingNew() => 'Up to date — nothing new yet.';

  // Settings hub
  static const settingsAccountSignedIn = 'Signed in';
  static const settingsAccountSignedOut = notSignedIn;
  static const settingsLinkPaired =
      'Linked to your computer — notes and tasks can update here.';
  static const settingsLinkPairedPendingPull =
      'Linked — pull once to finish linking notes and tasks.';
  static const settingsLinkUnpaired = notPaired;
  static const signOutSwitchAccount = 'Sign out / switch account';
  static const settingsTitle = 'Settings';
  static const settingsLastUpdateNever =
      'Not updated yet — tap Sync on Inbox or Tasks.';
  static String settingsFactsOnPhone(int count) =>
      count == 1 ? '1 fact on this phone' : '$count facts on this phone';
  static String settingsLastUpdate(String when) => 'Last updated $when';

  // Shared sync empties (honest why-empty)
  static const syncEmptyUnpairedTitle = 'Link this phone to your computer';
  static const openLink = 'Open Link';
  static const syncEmptyUnpairedSubtitle =
      'Scan or paste the desktop code in Settings to see your tasks here.';
  static const syncEmptyNeverPulledTitle = 'Getting your data from desktop';
  static const syncEmptyNeverPulledSubtitle =
      'Hang tight — or pull down to refresh.';
  static const syncEmptyNeverPulledIdleSubtitle =
      'Pull down to refresh, or tap Sync at the top.';

  // Inbox tab — drafts / nudges / failures to review
  static const inboxTitle = 'Inbox';
  static const inboxEmptyTitle = 'Nothing to review';
  static const inboxEmptySubtitle =
      'When EXO drafts a reply or needs a look, it shows up here.';

  // Tasks tab — synced desktop tasks; AI draft/review execute is later
  static const actionsTitle = 'Tasks';
  static const tasksTitle = 'Tasks';
  static const tasksEmptyTitle = 'No tasks from desktop yet';
  static const tasksEmptySubtitle =
      'Create tasks on your computer, then pull to refresh.';
  static const taskFallbackTitle = 'Task';
  static const taskCompletedLabel = 'Done';
  static const taskMarkDone = 'Mark done';
  static const taskMarkNotDone = 'Mark not done';
  static const taskSelect = 'Select';
  static const taskRemove = 'Remove';
  static const taskRemoveConfirmTitle = 'Remove from your list?';
  static const taskRemoveConfirmBody =
      'This is not a to-do. Calendar events and mail stay where they are. EXO will not add these again.';
  static const removedOne = 'Removed from your list';
  static const removedOther = 'Removed from your list';
  static const taskFilterOpen = 'Open';
  static const taskFilterDone = 'Done';
  static const taskFilterAll = 'All';
  static const taskSelectAll = 'Select all';
  static const tasksOpenEmptyTitle = 'Nothing left to do';
  static const tasksDoneEmptyTitle = 'Nothing marked done yet';
  static const tasksFilterEmptySubtitle = 'Switch filters to see other tasks.';
  static const markedDone = 'Marked done';
  static const markedNotDone = 'Marked not done';

  static String tasksSelected(int count) =>
      count == 1 ? '1 selected' : '$count selected';

  static String tasksMarkedDone(int count) =>
      count == 1 ? markedDone : '$count marked done';

  static String tasksMarkedNotDone(int count) =>
      count == 1 ? markedNotDone : '$count marked not done';

  static String tasksRemoved(int count) =>
      count == 1 ? removedOne : '$count removed from your list';

  // Legacy aliases (tests / older call sites)
  static const actionsEmptyTitle = tasksEmptyTitle;
  static const actionsEmptySubtitle = tasksEmptySubtitle;

  static const signOut = 'Sign out';
  static const signOutConfirmTitle = 'Sign out and remove this phone\'s data?';
  static const signOutConfirmBody =
      'This removes sign-in, the desktop link, and this phone\'s local copy.';
  static const cancel = 'Cancel';
  static const signedOutSnack = 'Signed out — this phone\'s data was removed.';

  // Legacy helpers used by older call sites
  static const signInAndPair = notSignedIn;
}
