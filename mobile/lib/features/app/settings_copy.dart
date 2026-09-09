import 'package:flutter/widgets.dart';

import 'app_sub_tab.dart';

/// EN/FR Settings chrome. Outcomes, not sync keys.
class SettingsCopy {
  SettingsCopy(this.locale);

  final Locale locale;

  factory SettingsCopy.of(BuildContext context) {
    final locale = Localizations.maybeLocaleOf(context) ??
        WidgetsBinding.instance.platformDispatcher.locale;
    return SettingsCopy(locale);
  }

  bool get _fr => locale.languageCode.toLowerCase() == 'fr';

  String chip(AppSubTab tab) {
    switch (tab) {
      case AppSubTab.account:
        return _fr ? 'Compte' : 'Account';
      case AppSubTab.link:
        return _fr ? 'Lien' : 'Link';
      case AppSubTab.reminders:
        return _fr ? 'Rappels' : 'Reminders';
      case AppSubTab.sources:
        return _fr ? 'Comptes' : 'Sources';
      case AppSubTab.privacy:
        return _fr ? 'Confidentialité' : 'Privacy';
    }
  }

  String get desktopSection => _fr ? 'Ordinateur' : 'Desktop';

  String get accountSection => _fr ? 'Compte' : 'Account';

  String get signedIn => _fr ? 'Connecté' : 'Signed in';

  String get signedOut =>
      _fr ? 'Connecte-toi pour continuer.' : 'Sign in to continue.';

  String get privacySection => _fr ? 'Confidentialité' : 'Privacy';

  String get crashTitle =>
      _fr ? 'Envoyer les rapports de plantage' : 'Send crash reports';

  String get crashOn => _fr
      ? 'Aide à corriger les bugs en envoyant des données anonymes si l’app échoue.'
      : 'Help fix bugs by sending anonymous crash data when the app fails.';

  String get crashOff => _fr
      ? 'Les rapports de plantage ne sont pas configurés dans cette version.'
      : 'Crash reporting is not configured in this build.';

  String get privacyPolicy => _fr ? 'Politique de confidentialité' : 'Privacy policy';

  String get terms => _fr ? 'Conditions d’utilisation' : 'Terms of service';

  String get signOut => _fr ? 'Se déconnecter' : 'Sign out';

  String get signOutTitle => _fr
      ? 'Se déconnecter et retirer les données de ce téléphone ?'
      : 'Sign out and remove this phone’s data?';

  String get signOutBody => _fr
      ? 'Cela retire la connexion, le lien avec l’ordinateur et la copie locale de ce téléphone.'
      : 'This removes sign-in, the desktop link, and this phone’s local copy.';

  String get cancel => _fr ? 'Annuler' : 'Cancel';

  String get signedOutSnack => _fr
      ? 'Déconnecté — les données de ce téléphone ont été retirées.'
      : 'Signed out — this phone’s data was removed.';

  String get scanDesktopCode =>
      _fr ? 'Scanner le code de l’ordinateur' : 'Scan desktop code';

  String get scanNewCode =>
      _fr ? 'Scanner un nouveau code' : 'Scan a new code';

  String get linkUnpaired => _fr
      ? 'Scanne le code de l’ordinateur pour déverrouiller tes notes.'
      : 'Scan the desktop code to unlock your notes.';

  String get linkPaired => _fr
      ? 'Lié à ton ordinateur — notes et tâches peuvent se mettre à jour ici.'
      : 'Linked to your computer — notes and tasks can update here.';

  String get linkPairedPending => _fr
      ? 'Lié — tire une fois pour finir de lier notes et tâches.'
      : 'Linked — pull once to finish linking notes and tasks.';

  String get lastUpdateNever => _fr
      ? 'Pas encore mis à jour — tape Sync sur Inbox ou Tasks.'
      : 'Not updated yet — tap Sync on Inbox or Tasks.';

  String lastUpdate(String when) =>
      _fr ? 'Dernière mise à jour $when' : 'Last updated $when';

  String factsOnPhone(int count) {
    if (_fr) {
      return count == 1
          ? '1 fait sur ce téléphone'
          : '$count faits sur ce téléphone';
    }
    return count == 1 ? '1 fact on this phone' : '$count facts on this phone';
  }

  String get sourcesTitle => _fr ? 'Comptes externes' : 'External accounts';

  String get sourcesBody => _fr
      ? 'Connecte Gmail, les calendriers et Drive sur l’ordinateur. '
          'Ce téléphone peut seulement arrêter d’en ajouter.'
      : 'Connect Gmail, calendars, and Drive on your computer. '
          'This phone can only stop them from adding more.';
}
