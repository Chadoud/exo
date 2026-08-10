/** Welcome / onboarding copy (de). */
export const deWelcomeLocaleSlice = {
  welcome: {
    ctaNext: "Weiter",
    ctaStart: "Loslegen",
    setupStepConnectAi: "KI verbinden",
    setupStepSortSetup: "Ordner & Sortiermodell",
    setupStepSortSetupCloud: "Ordner & Sortierung",
    setupStepPrivacy: "AGB & Datenschutz",
    sortSetupHeading: "Dateisortierung einrichten",
    sortSetupSubtitle:
      "Ausgabeordner wählen und ein lokales Sortiermodell herunterladen. Vision-Modelle für Scans können warten — später unter Einstellungen.",
    sortSetupSubtitleCloud:
      "Wählen Sie, wohin sortierte Dateien gehen. Exo klassifiziert auf sicheren Servern — für die Sortierung ist nichts zu installieren.",
    sortSetupVisionHint:
      "Gmail, Drive und andere Konten verbinden Sie jederzeit über den Tab Quellen.",
    sortSetupVisionHintCloud:
      "Gescannte Seiten werden auf diesem Mac mit Tesseract gelesen. Optionale Vision-Modelle können später unter Einstellungen hinzugefügt werden.",
    aiProviderHeading: "Gemini-API-Schlüssel holen",
    aiProviderSubtitle:
      "Optional für Chat und Sprache. Fügen Sie unten einen kostenlosen Google-AI-Studio-Schlüssel ein, oder Weiter für nur lokale Modelle — er bleibt auf diesem Gerät.",
    geminiCardTitle: "Gemini",
    geminiCardSubline: "Google KI · Cloud",
    geminiBulletFast: "Schnellere Antworten",
    geminiBulletVoice: "Echtzeit-Sprache",
    geminiBulletFreeTier: "Kostenloses API-Kontingent",
    providerSelectedBadge: "Sprache",
    geminiFreeKeyCta: "Google AI Studio öffnen",
    geminiFreeKeyStep1: "Öffnen Sie Google AI Studio und melden Sie sich mit Ihrem Google-Konto an.",
    geminiFreeKeyStep2: "Öffnen Sie links „API keys“ und klicken Sie oben rechts auf „Create API key“.",
    geminiFreeKeyStep3: "Kopieren Sie den Schlüssel und fügen Sie ihn unten ein. Er bleibt nur auf diesem Gerät.",
    geminiFreeTierHint:
      "In Google AI Studio sehen Sie kostenlose Nutzung und Limits. Ein kostenpflichtiges Upgrade ist nur nötig, wenn Sie es dort wählen.",
    geminiSetupVisualTitle: "Wo Sie klicken",
    geminiSetupScreenshotAlt:
      "Screenshot von Google AI Studio: API Keys in der linken Leiste ausgewählt und Create API key in der Kopfzeile.",
    geminiSetupScreenshotCaption:
      "Beschriftungen und Layout können sich leicht ändern — nutzen Sie API Keys und Create API key wie hier gezeigt.",
    geminiApiKeyLabel: "Gemini-API-Schlüssel",
    geminiApiKeyPlaceholder: "AIza… oder AQ.…",
    geminiShowKey: "Anzeigen",
    geminiHideKey: "Ausblenden",
    geminiKeyPrivacyLine:
      "Ihr Schlüssel wird lokal gespeichert und nur an Google gesendet, wenn Sie Gemini-Funktionen in dieser App nutzen.",
    geminiKeySavedShort: "Schlüssel gespeichert — Chat und Sprache nutzen Gemini",
    geminiKeyFormatOk: "Schlüsselformat sieht richtig aus — Speichern zum Verbinden",
    geminiKeyInvalidFormat:
      "Das sieht nicht wie ein Google-AI-Studio-Schlüssel aus. Kopieren Sie den vollständigen Schlüssel von aistudio.google.com (beginnt mit AIza oder AQ.).",
    geminiKeyRequiredHint: "Fügen Sie oben Ihren API-Schlüssel ein, um Gemini-Chat und -Sprache zu aktivieren.",
    privacyStepHeading: "AGB & Datenschutz",
    privacyStepSubtitle:
      "Akzeptieren Sie AGB und Datenschutzerklärung zum Abschluss. Nutzungsanalyse und Absturzberichte sind dort beschrieben (berechtigtes Interesse; Widerspruch in Einstellungen).",
    diagnosticsNoticeTitle: "Produktdiagnose",
    diagnosticsNoticeBody:
      "Exo kann grobe Nutzungssignale und Absturzberichte auf Grundlage unseres berechtigten Interesses senden (Datenschutzerklärung). Nie Dateinamen, Pfade oder organisierte Inhalte. Widerspruch unter Einstellungen → Datenschutz.",
    privacyStepFooter: "Details stehen in der verlinkten Datenschutzerklärung.",
    legalAcceptHeading: "AGB & Datenschutz",
    legalAcceptPrefix: "Ich habe gelesen und stimme zu:",
    legalAcceptCombinedLink: "Nutzungsbedingungen und Datenschutzerklärung",
    legalTermsLink: "Nutzungsbedingungen",
    legalAcceptAnd: "und",
    legalPrivacyLink: "Datenschutzerklärung",
    legalAcceptSuffix: ".",
    legalAcceptOffline:
      "Ich habe gelesen und akzeptiere die Bedingungen und Datenschutzpraktiken, die für diese Version gelten. Den vollständigen Rechtstext finden Sie in der Hilfe oder beim Anbieter.",
    legalAcceptHint:
      "Aktivieren Sie das Kontrollkästchen oben nach Lesen und Zustimmung. Ohne das können Sie die Einrichtung nicht abschließen.",
    legalAcceptHintNoLinks:
      "Wenn Links zu AGB oder Datenschutz fehlen, erhalten Sie die offiziellen Dokumente beim Anbieter oder in der Hilfe.",
    skipBlockedUntilLegalAccept: "Akzeptieren Sie AGB und Datenschutz, um diesen Schritt zu überspringen oder fortzufahren.",
    finishSetupBody: "Einrichtung abschließen — wählen Sie Ihr KI-Modell, damit das Sortieren funktioniert.",
    finishSetupBodyCloud: "Einrichtung abschließen — wählen Sie den Zielordner, damit Exo sortieren kann.",
    finishSetupAction: "Einrichtung abschließen",
    installFromDmgBody:
      "In Programme installieren — für Updates und beste Leistung. Exo aus dem Disk-Fenster nach Programme ziehen und von dort starten.",
    installFromDmgAction: "Programme öffnen",
    installFromDmgNotNow: "Später",
    stepCounter: "Schritt {current} von {total} — {label}",
    skipSetup: "Einrichtung überspringen",
    backButton: "Zurück",
    leaveTitle: "Einrichtung verlassen?",
    leaveMessage:
      "Sie haben Einrichtungsoptionen geändert. Änderungen verwerfen und den Assistenten schließen, oder behalten und schließen?",
    leaveKeepEditing: "Weiter bearbeiten",
    leaveDiscard: "Verwerfen & schließen",
    leaveSave: "Änderungen behalten & schließen",
    localServiceStartingTitle: "Exo startet auf diesem Mac",
    localServiceStartingBody:
      "Exo bereitet sich im Hintergrund vor. Das dauert normalerweise nur einen Moment.",
    localServiceOfflineTitle: "Exo konnte auf diesem Mac nicht starten",
    localServiceOfflineBody:
      "Exo beenden (Cmd+Q) und aus Programme neu öffnen. Falls das weiterhin passiert, wenden Sie sich an den Support.",
    localServiceRetry: "Dienst neu starten",
    localServiceRetryBusy: "Wird neu gestartet…",
    localServiceSkipSetup: "Einrichtung überspringen",
    continueAnyway: "Trotzdem fortfahren",
    useLocalAiOnly: "Nur lokale KI verwenden",
    ctaNextWithGemini: "Mit Gemini fortfahren",
    signedInAs: "Angemeldet als {email}",
    switchAccount: "Konto wechseln",
  },
} as const;
