import 'package:flutter/widgets.dart';

/// EN/FR first-run trial copy. Outcomes, not store mechanics.
class SetupCopy {
  SetupCopy(this.locale);

  final Locale locale;

  factory SetupCopy.of(BuildContext context) {
    final locale = Localizations.maybeLocaleOf(context) ??
        WidgetsBinding.instance.platformDispatcher.locale;
    return SetupCopy(locale);
  }

  bool get _fr => locale.languageCode.toLowerCase() == 'fr';

  String get trialEyebrow => _fr ? 'Essai' : 'Trial';

  String get trialTitle =>
      _fr ? 'Commence un essai de 30 jours' : 'Start a 30-day trial';

  String priceLine(String? storePrice) {
    final price = (storePrice == null || storePrice.isEmpty)
        ? (_fr ? 'le prix du store' : 'the store price')
        : storePrice;
    return _fr
        ? 'Essai de 30 jours, puis $price. Le store conserve la carte et te facture à la fin de l’essai. L’abonnement se renouvelle tant que tu ne l’annules pas.'
        : '30 days free, then $price. The store holds your card and charges when the trial ends. It renews until you cancel in the store.';
  }

  String get inboxEmptyHint => _fr
      ? 'Inbox et tâches restent vides jusqu’à ce que tu lies l’ordinateur.'
      : 'Inbox and tasks stay empty until you link the computer.';

  String get startTrial => _fr ? 'Commencer l’essai' : 'Start trial';

  String get restorePurchases =>
      _fr ? 'Restaurer les achats' : 'Restore purchases';

  String get privacy => _fr ? 'Confidentialité' : 'Privacy';

  String get terms => _fr ? 'Conditions' : 'Terms';

  String get signOut => _fr ? 'Se déconnecter' : 'Sign out';

  String get checkingAccount =>
      _fr ? 'Vérification du compte…' : 'Checking your account…';

  String get waitingStore =>
      _fr ? 'En attente du store…' : 'Waiting for the store…';

  String get confirming =>
      _fr ? 'Confirmation de l’essai…' : 'Confirming your trial…';

  String get storeUnavailable => _fr
      ? 'L’essai n’est pas encore disponible. Réessaie plus tard.'
      : 'The trial isn’t available yet. Try again later.';

  String get storePriceUnavailable => _fr
      ? 'Le store n’a pas renvoyé le prix. Réessaie.'
      : 'The store didn’t return a price. Try again.';

  String get purchaseFailed => _fr
      ? 'Le store n’a pas pu commencer l’essai. Réessaie.'
      : 'The store couldn’t start the trial. Try again.';

  String get verifyFailed => _fr
      ? 'L’essai n’a pas encore été confirmé. Réessaie ou restaure tes achats.'
      : 'The trial isn’t confirmed yet. Try again or restore purchases.';

  String get ownedByOtherAccount => _fr
      ? 'Cet achat est déjà lié à un autre compte Exo.'
      : 'This purchase is already linked to another Exo account.';

  String get restoreEmpty => _fr
      ? 'Aucun achat à restaurer sur ce store.'
      : 'No purchases to restore on this store.';

  String get meLoadFailed =>
      _fr ? 'Impossible de joindre Exo — réessaie.' : 'Couldn’t reach Exo — try again.';

  String get profileEyebrow => _fr ? 'Toi' : 'You';

  String get profileTitle =>
      _fr ? 'Pour que EXO te parle clairement' : 'So EXO can talk to you clearly';

  String get profileWorkPrompt => _fr
      ? 'Sur quoi portes-tu le plus souvent tes journées ?'
      : 'What do you spend most days on?';

  String get profileContinue => _fr ? 'Continuer' : 'Continue';

  String get profileSaveFailed =>
      _fr ? 'Impossible d’enregistrer — réessaie.' : 'Couldn’t save — try again.';

  String get firstNameLabel => _fr ? 'Prénom' : 'First name';

  String get lastNameLabel => _fr ? 'Nom' : 'Last name';

  String workRoleLabel(String role) {
    switch (role) {
      case 'investing':
        return _fr ? 'Investissement' : 'Investing';
      case 'sales':
        return _fr ? 'Vente' : 'Sales';
      case 'hiring':
        return _fr ? 'Recrutement' : 'Hiring';
      case 'founder':
        return _fr ? 'Fondateur' : 'Founder';
      case 'other':
        return _fr ? 'Autre' : 'Other';
      default:
        return role;
    }
  }

  String get sourcesEyebrow => _fr ? 'Calendriers' : 'Calendars';

  String get sourcesTitle =>
      _fr ? 'Ajoute tes calendriers' : 'Add your calendars';

  String get sourcesComputerHint => _fr
      ? 'Google et Outlook se connectent sur l’ordinateur. Rien n’est lié depuis ce téléphone.'
      : 'Google and Outlook connect on the computer. This phone does not sign into them.';

  String get sourcesGoogle => _fr
      ? 'Google Calendar — sur l’ordinateur'
      : 'Google Calendar — on the computer';

  String get sourcesOutlook =>
      _fr ? 'Outlook — sur l’ordinateur' : 'Outlook — on the computer';

  String get sourcesAppleAction =>
      _fr ? 'Utiliser les calendriers de cet iPhone' : 'Use calendars on this iPhone';

  String get sourcesApplePurpose => _fr
      ? 'EXO lit tes calendriers pour afficher ta journée. Ils restent sur cet iPhone.'
      : 'EXO reads calendars on this iPhone to show your day. They stay on this phone.';

  String get sourcesAppleUnavailable => _fr
      ? 'Les calendriers Apple ne sont pas disponibles sur Android.'
      : 'Apple Calendar isn’t available on Android.';

  String get sourcesAppleReady => _fr
      ? 'EXO peut lire les calendriers de cet iPhone.'
      : 'EXO can read calendars on this iPhone.';

  String get sourcesAppleNone => _fr
      ? 'Aucun calendrier sur cet iPhone. Ajoute iCloud ou un autre compte dans Réglages, puis réessaie.'
      : 'No calendars on this iPhone. Add iCloud or another account in iOS Settings, then try again.';

  String get sourcesAppleDenied => _fr
      ? 'Autorise les calendriers dans Réglages iOS pour les utiliser ici.'
      : 'Allow calendars in iOS Settings to use them here.';

  String get sourcesAppleRestricted => _fr
      ? 'Cet iPhone n’autorise pas l’accès aux calendriers.'
      : 'This iPhone doesn’t allow calendar access.';

  String get sourcesOpenSettings =>
      _fr ? 'Ouvrir Réglages' : 'Open Settings';

  String get sourcesContinue => _fr ? 'Continuer' : 'Continue';
}
