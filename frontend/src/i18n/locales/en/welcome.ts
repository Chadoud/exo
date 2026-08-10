/** Welcome / onboarding copy (en). */
export const enWelcomeLocaleSlice = {
  welcome: {
    ctaNext: "Next",
    ctaStart: "Get started",
    setupStepConnectAi: "Connect AI",
    setupStepSortSetup: "Folder & sort model",
    setupStepSortSetupCloud: "Folder & sorting",
    setupStepPrivacy: "Terms & privacy",
    sortSetupHeading: "Set up file sorting",
    sortSetupSubtitle:
      "Pick the output folder and download a local sort model. Vision models for scans can wait — add them later in Settings.",
    sortSetupSubtitleCloud:
      "Choose where sorted files go. Exo handles classification on secure servers — nothing to install for sorting.",
    sortSetupVisionHint:
      "Link Gmail, Drive, and other accounts anytime from the Sources tab after setup.",
    sortSetupVisionHintCloud:
      "Link Gmail, Drive, and other accounts anytime from the Sources tab after setup.",
    aiProviderHeading: "Connect your AI",
    aiProviderSubtitle:
      "Add a Gemini API key to power voice and chat. You can change provider anytime in Settings → AI Provider.",
    geminiCardTitle: "Gemini",
    geminiCardSubline: "Google AI · Cloud",
    geminiBulletFast: "Faster responses",
    geminiBulletVoice: "Real-time voice",
    geminiBulletFreeTier: "Free API tier",
    providerSelectedBadge: "Voice",
    geminiFreeKeyCta: "Open Google AI Studio ",
    geminiFreeKeyStep1: "Open Google AI Studio and sign in with your Google account.",
    geminiFreeKeyStep2: "Open API keys in the left sidebar, then click Create API key (top right).",
    geminiFreeKeyStep3: "Copy the key and paste it below. It stays on this device only.",
    geminiFreeTierHint:
      "Google AI Studio shows free usage and limits. You only need a paid plan if you choose to upgrade there.",
    geminiSetupVisualTitle: "Where to click",
    geminiSetupScreenshotAlt:
      "Screenshot of Google AI Studio: API Keys selected in the left sidebar and Create API key in the header.",
    geminiSetupScreenshotCaption:
      "Labels and layout may change slightly — use API Keys and Create API key as shown.",
    geminiApiKeyLabel: "Gemini API key",
    geminiApiKeyPlaceholder: "AIza… or AQ.…",
    geminiShowKey: "Show",
    geminiHideKey: "Hide",
    geminiKeyPrivacyLine:
      "Your key is stored locally and only sent to Google when you use Gemini features in this app.",
    geminiKeySavedShort: "Key saved — chat and voice will use Gemini",
    geminiKeyFormatOk: "Key format looks right — click Save and we'll connect",
    geminiKeyInvalidFormat:
      "This doesn't look like a Google AI Studio key. Copy the full key from aistudio.google.com (starts with AIza or AQ.).",
    geminiKeyRequiredHint: "Paste your API key above to enable Gemini chat and voice.",
    privacyStepHeading: "Terms & privacy",
    privacyStepSubtitle:
      "Accept the Terms and Privacy Policy to finish setup. Usage analytics and crash reports are described there (legitimate interest; you can object in Settings).",
    diagnosticsNoticeTitle: "Product diagnostics",
    diagnosticsNoticeBody:
      "Exo may send coarse usage signals and crash reports to improve reliability, based on our legitimate interest and as described in the Privacy Policy. File names, paths, and what you organize are never included. You can object in Settings → Privacy.",
    privacyStepFooter: "Details are in the Privacy Policy linked above.",
    legalAcceptHeading: "Terms & privacy",
    legalAcceptPrefix: "I have read and agree to the",
    legalAcceptCombinedLink: "Terms of Service and Privacy Policy",
    legalTermsLink: "Terms of Service",
    legalAcceptAnd: "and",
    legalPrivacyLink: "Privacy Policy",
    legalAcceptSuffix: ".",
    legalAcceptOffline:
      "I have read and accept the terms and privacy practices that apply to this version. For the full legal text, use Help or contact whoever gave you this app.",
    legalAcceptHint:
      "Check the box above after you’ve read and agree. You can’t finish setup until you do.",
    legalAcceptHintNoLinks:
      "If you don’t see links for Terms or Privacy, ask whoever provided this app—or open Help—for the official documents.",
    skipBlockedUntilLegalAccept: "Accept the Terms and Privacy Policy to skip or continue from this step.",
    finishSetupBody: "Finish setup — choose your AI model so file sorting can work.",
    finishSetupBodyCloud: "Finish setup — choose where sorted files go so Exo can start sorting.",
    finishSetupAction: "Finish setup",
    installFromDmgBody:
      "Install to Applications for updates and best performance. Drag Exo from the disk window into Applications, then launch from there.",
    installFromDmgAction: "Open Applications",
    installFromDmgNotNow: "Not now",
    stepCounter: "Step {current} of {total} — {label}",
    skipSetup: "Skip setup",
    backButton: "Back",
    leaveTitle: "Leave setup?",
    leaveMessage:
      "You changed setup options. Discard those changes and close the wizard, or keep them and close?",
    leaveKeepEditing: "Keep editing",
    leaveDiscard: "Discard & close",
    leaveSave: "Keep changes & close",
    localServiceStartingTitle: "Starting Exo on this computer",
    localServiceStartingBody:
      "Exo is getting ready in the background. This usually only takes a moment.",
    localServiceOfflineTitle: "Exo couldn't start on this computer",
    localServiceOfflineBody:
      "Quit Exo (Cmd+Q) and reopen it from Applications. If this keeps happening, contact support.",
    localServiceRetry: "Restart service",
    localServiceRetryBusy: "Restarting…",
    localServiceSkipSetup: "Skip setup for now",
    continueAnyway: "Continue anyway",
    useLocalAiOnly: "Use local AI only",
    ctaNextWithGemini: "Continue with Gemini",
    signedInAs: "Signed in as {email}",
    switchAccount: "Switch account",
  },
} as const;
