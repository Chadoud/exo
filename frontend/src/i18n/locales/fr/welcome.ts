/** Welcome / onboarding copy (fr). */
export const frWelcomeLocaleSlice = {
  welcome: {
    ctaNext: "Suivant",
    ctaStart: "Commencer",
    setupStepConnectAi: "Connecter l’IA",
    setupStepSortSetup: "Dossier & modèle de tri",
    setupStepSortSetupCloud: "Dossier & tri",
    setupStepPrivacy: "Conditions & confidentialité",
    sortSetupHeading: "Configurer le tri de fichiers",
    sortSetupSubtitle:
      "Choisissez le dossier de sortie et téléchargez un modèle local de tri. Les modèles vision pour les scans peuvent attendre — ajoutez-les plus tard dans Réglages.",
    sortSetupSubtitleCloud:
      "Choisissez où vont les fichiers triés. Exo classe sur des serveurs sécurisés — rien à installer pour le tri.",
    sortSetupVisionHint:
      "Liez Gmail, Drive et d’autres comptes à tout moment depuis l’onglet Sources.",
    sortSetupVisionHintCloud:
      "Les pages scannées sont lues sur ce Mac avec Tesseract. Des modèles vision optionnels peuvent être ajoutés plus tard dans Réglages.",
    aiProviderHeading: "Obtenir votre clé API Gemini",
    aiProviderSubtitle:
      "Facultatif pour le chat et la voix. Collez une clé Google AI Studio gratuite ci-dessous, ou Suivant pour configurer uniquement des modèles locaux — elle reste sur cet appareil.",
    geminiCardTitle: "Gemini",
    geminiCardSubline: "Google IA · Cloud",
    geminiBulletFast: "Réponses plus rapides",
    geminiBulletVoice: "Voix en temps réel",
    geminiBulletFreeTier: "Palier API gratuit",
    providerSelectedBadge: "Voix",
    geminiFreeKeyCta: "Ouvrir Google AI Studio",
    geminiFreeKeyStep1: "Ouvrez Google AI Studio et connectez-vous avec votre compte Google.",
    geminiFreeKeyStep2: "Ouvrez « API keys » dans la barre latérale, puis cliquez sur « Create API key » en haut à droite.",
    geminiFreeKeyStep3: "Copiez la clé et collez-la ci-dessous. Elle reste sur cet appareil uniquement.",
    geminiFreeTierHint:
      "Google AI Studio affiche l’usage gratuit et les limites. Un passage au payant n’est utile que si vous le choisissez là-bas.",
    geminiSetupVisualTitle: "Où cliquer",
    geminiSetupScreenshotAlt:
      "Capture d’écran Google AI Studio : entrée API Keys sélectionnée dans la barre latérale et Create API key dans l’en-tête.",
    geminiSetupScreenshotCaption:
      "Les libellés et la mise en page peuvent légèrement changer — utilisez API Keys et Create API key comme ici.",
    geminiApiKeyLabel: "Clé API Gemini",
    geminiApiKeyPlaceholder: "AIza… ou AQ.…",
    geminiShowKey: "Afficher",
    geminiHideKey: "Masquer",
    geminiKeyPrivacyLine:
      "Votre clé est enregistrée localement et n’est envoyée à Google que lorsque vous utilisez Gemini dans cette app.",
    geminiKeySavedShort: "Clé enregistrée — le chat et la voix utiliseront Gemini",
    geminiKeyFormatOk: "Format de clé correct — enregistrez pour connecter",
    geminiKeyInvalidFormat:
      "Ce n’est pas une clé Google AI Studio. Copiez la clé complète depuis aistudio.google.com (commence par AIza ou AQ.).",
    geminiKeyRequiredHint: "Collez votre clé API ci-dessus pour activer le chat et la voix Gemini.",
    privacyStepHeading: "Conditions & confidentialité",
    privacyStepSubtitle:
      "Acceptez les Conditions et la Politique de confidentialité pour terminer. L’analytique et les rapports de plantage y sont décrits (intérêt légitime ; opposition dans Réglages).",
    diagnosticsNoticeTitle: "Diagnostics produit",
    diagnosticsNoticeBody:
      "Exo peut envoyer des signaux d’usage génériques et des rapports de plantage sur la base de notre intérêt légitime (Politique de confidentialité). Jamais noms de fichiers, chemins ou contenu organisé. Opposition : Réglages → Confidentialité.",
    privacyStepFooter: "Les détails figurent dans la Politique de confidentialité liée ci-dessus.",
    legalAcceptHeading: "Conditions & confidentialité",
    legalAcceptPrefix: "J’ai lu et j’accepte",
    legalAcceptCombinedLink: "les Conditions d’utilisation et la Politique de confidentialité",
    legalTermsLink: "Conditions d’utilisation",
    legalAcceptAnd: "et",
    legalPrivacyLink: "Politique de confidentialité",
    legalAcceptSuffix: ".",
    legalAcceptOffline:
      "J’ai lu et j’accepte les conditions et pratiques de confidentialité applicables à cette version. Pour le texte juridique complet, utilisez l’Aide ou contactez qui vous a fourni l’app.",
    legalAcceptHint:
      "Cochez la case ci-dessus après lecture et accord. Vous ne pouvez pas terminer la configuration sans cela.",
    legalAcceptHintNoLinks:
      "Si les liens Conditions ou Confidentialité n’apparaissent pas, demandez les documents officiels à qui vous a fourni l’app ou via l’Aide.",
    skipBlockedUntilLegalAccept: "Acceptez les Conditions et la Politique de confidentialité pour ignorer ou continuer depuis cette étape.",
    finishSetupBody: "Terminez la configuration — choisissez votre modèle IA pour que le tri des fichiers fonctionne.",
    finishSetupBodyCloud: "Terminez la configuration — choisissez le dossier de sortie pour que Exo puisse trier.",
    finishSetupAction: "Terminer la configuration",
    installFromDmgBody:
      "Installez dans Applications pour les mises à jour et de meilleures performances. Glissez Exo depuis la fenêtre du disque vers Applications, puis lancez-le depuis là.",
    installFromDmgAction: "Ouvrir Applications",
    installFromDmgNotNow: "Plus tard",
    stepCounter: "Étape {current} sur {total} — {label}",
    skipSetup: "Passer la configuration",
    backButton: "Retour",
    leaveTitle: "Quitter la configuration ?",
    leaveMessage:
      "Vous avez modifié des options de configuration. Abandonner ces modifications et fermer l’assistant, ou les conserver et fermer ?",
    leaveKeepEditing: "Continuer la modification",
    leaveDiscard: "Abandonner et fermer",
    leaveSave: "Conserver et fermer",
    localServiceStartingTitle: "Démarrage d’Exo sur cet ordinateur",
    localServiceStartingBody:
      "Exo se prépare en arrière-plan. Cela ne prend généralement qu’un instant.",
    localServiceOfflineTitle: "Exo n’a pas pu démarrer sur cet ordinateur",
    localServiceOfflineBody:
      "Quittez Exo (Cmd+Q) et rouvrez-le depuis Applications. Si cela persiste, contactez le support.",
    localServiceRetry: "Redémarrer le service",
    localServiceRetryBusy: "Redémarrage…",
    localServiceSkipSetup: "Passer la configuration",
    continueAnyway: "Continuer quand même",
    useLocalAiOnly: "Utiliser l’IA locale uniquement",
    ctaNextWithGemini: "Continuer avec Gemini",
    signedInAs: "Connecté en tant que {email}",
    switchAccount: "Changer de compte",
  },
} as const;
