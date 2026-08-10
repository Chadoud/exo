/** Welcome / onboarding copy (it). */
export const itWelcomeLocaleSlice = {
  welcome: {
    ctaNext: "Avanti",
    ctaStart: "Inizia",
    setupStepConnectAi: "Connetti l’IA",
    setupStepSortSetup: "Cartella & modello di ordinamento",
    setupStepSortSetupCloud: "Cartella & ordinamento",
    setupStepPrivacy: "Termini e privacy",
    sortSetupHeading: "Configura l’ordinamento file",
    sortSetupSubtitle:
      "Scegli la cartella di output e scarica un modello locale di ordinamento. I modelli visione per le scansioni possono attendere — aggiungili più tardi in Impostazioni.",
    sortSetupSubtitleCloud:
      "Scegli dove vanno i file ordinati. Exo classifica su server sicuri — nulla da installare per l’ordinamento.",
    sortSetupVisionHint:
      "Collega Gmail, Drive e altri account in qualsiasi momento dalla scheda Origini.",
    sortSetupVisionHintCloud:
      "Le pagine scansionate vengono lette su questo Mac con Tesseract. Modelli visione opzionali possono essere aggiunti più tardi in Impostazioni.",
    aiProviderHeading: "Ottieni la chiave API Gemini",
    aiProviderSubtitle:
      "Facoltativo per chat e voce. Incolla una chiave Google AI Studio gratuita sotto, oppure Avanti per configurare solo modelli locali — resta su questo dispositivo.",
    geminiCardTitle: "Gemini",
    geminiCardSubline: "Google IA · Cloud",
    geminiBulletFast: "Risposte più rapide",
    geminiBulletVoice: "Voce in tempo reale",
    geminiBulletFreeTier: "Piano API gratuito",
    providerSelectedBadge: "Voce",
    geminiFreeKeyCta: "Apri Google AI Studio",
    geminiFreeKeyStep1: "Apri Google AI Studio e accedi con il tuo account Google.",
    geminiFreeKeyStep2: "Apri « API keys » nella barra laterale, poi fai clic su « Create API key » in alto a destra.",
    geminiFreeKeyStep3: "Copia la chiave e incollala sotto. Resta solo su questo dispositivo.",
    geminiFreeTierHint:
      "Google AI Studio mostra uso gratuito e limiti. Il piano a pagamento serve solo se lo attivi lì.",
    geminiSetupVisualTitle: "Dove fare clic",
    geminiSetupScreenshotAlt:
      "Screenshot di Google AI Studio: voce API Keys selezionata nella barra laterale e Create API key nell’intestazione.",
    geminiSetupScreenshotCaption:
      "Etichette e layout possono cambiare leggermente — usa API Keys e Create API key come in figura.",
    geminiApiKeyLabel: "Chiave API Gemini",
    geminiApiKeyPlaceholder: "AIza… o AQ.…",
    geminiShowKey: "Mostra",
    geminiHideKey: "Nascondi",
    geminiKeyPrivacyLine:
      "La chiave è salvata in locale e inviata a Google solo quando usi le funzioni Gemini in questa app.",
    geminiKeySavedShort: "Chiave salvata — chat e voce useranno Gemini",
    geminiKeyFormatOk: "Formato chiave corretto — salva per connettere",
    geminiKeyInvalidFormat:
      "Non sembra una chiave Google AI Studio. Copia la chiave completa da aistudio.google.com (inizia con AIza o AQ.).",
    geminiKeyRequiredHint: "Incolla la chiave API sopra per attivare chat e voce Gemini.",
    privacyStepHeading: "Termini e privacy",
    privacyStepSubtitle:
      "Accetta Termini e Informativa sulla privacy per completare. Analisi e segnalazioni arresti sono descritte lì (interesse legittimo; opposizione in Impostazioni).",
    diagnosticsNoticeTitle: "Diagnostica prodotto",
    diagnosticsNoticeBody:
      "Exo può inviare segnali d’uso generici e segnalazioni di arresto anomalo in base al nostro interesse legittimo (Informativa privacy). Mai nomi file, percorsi o contenuti organizzati. Opposizione: Impostazioni → Privacy.",
    privacyStepFooter: "I dettagli sono nell’Informativa sulla privacy collegata sopra.",
    legalAcceptHeading: "Termini e privacy",
    legalAcceptPrefix: "Ho letto e accetto",
    legalAcceptCombinedLink: "Termini di servizio e Informativa sulla privacy",
    legalTermsLink: "Termini di servizio",
    legalAcceptAnd: "e",
    legalPrivacyLink: "Informativa sulla privacy",
    legalAcceptSuffix: ".",
    legalAcceptOffline:
      "Ho letto e accetto termini e pratiche sulla privacy applicabili a questa versione. Per il testo legale completo usa la Guida o contatta chi ti ha fornito l’app.",
    legalAcceptHint:
      "Spunta la casella sopra dopo aver letto e accettato. Non puoi completare la configurazione senza.",
    legalAcceptHintNoLinks:
      "Se non vedi i link a Termini o Privacy, chiedi i documenti ufficiali a chi ti ha fornito l’app o dalla Guida.",
    skipBlockedUntilLegalAccept: "Accetta Termini e Informativa sulla privacy per saltare o continuare da questo passaggio.",
    finishSetupBody: "Completa la configurazione — scegli il tuo modello IA per far funzionare l'ordinamento dei file.",
    finishSetupBodyCloud: "Completa la configurazione — scegli la cartella di output così Exo può ordinare.",
    finishSetupAction: "Completa la configurazione",
    installFromDmgBody:
      "Installa in Applicazioni per aggiornamenti e prestazioni migliori. Trascina Exo dalla finestra del disco in Applicazioni, poi avvialo da lì.",
    installFromDmgAction: "Apri Applicazioni",
    installFromDmgNotNow: "Non ora",
    stepCounter: "Passo {current} di {total} — {label}",
    skipSetup: "Salta la configurazione",
    backButton: "Indietro",
    leaveTitle: "Uscire dalla configurazione?",
    leaveMessage:
      "Hai modificato le opzioni di configurazione. Scartare le modifiche e chiudere la procedura, oppure mantenerle e chiudere?",
    leaveKeepEditing: "Continua a modificare",
    leaveDiscard: "Scarta e chiudi",
    leaveSave: "Mantieni e chiudi",
    localServiceStartingTitle: "Avvio di Exo su questo Mac",
    localServiceStartingBody:
      "Exo si sta preparando in background. Di solito richiede solo un momento.",
    localServiceOfflineTitle: "Exo non ha potuto avviarsi su questo computer",
    localServiceOfflineBody:
      "Chiudi Exo (Cmd+Q) e riaprilo da Applicazioni. Se il problema persiste, contatta l’assistenza.",
    localServiceRetry: "Riavvia servizio",
    localServiceRetryBusy: "Riavvio…",
    localServiceSkipSetup: "Salta configurazione",
    continueAnyway: "Continua comunque",
    useLocalAiOnly: "Usa solo IA locale",
    ctaNextWithGemini: "Continua con Gemini",
    signedInAs: "Accesso effettuato come {email}",
    switchAccount: "Cambia account",
  },
} as const;
