import 'package:flutter/widgets.dart';

/// EN/FR copy for stopping mail/calendar harvest from the phone.
class SourceStopCopy {
  SourceStopCopy(this.locale);

  final Locale locale;

  factory SourceStopCopy.of(BuildContext context) {
    final locale = Localizations.maybeLocaleOf(context) ??
        WidgetsBinding.instance.platformDispatcher.locale;
    return SourceStopCopy(locale);
  }

  bool get _fr => locale.languageCode.toLowerCase() == 'fr';

  String get sectionTitle =>
      _fr ? 'Courrier et calendriers' : 'Mail & calendars';

  String get stop => _fr ? 'Arrêter' : 'Stop';

  String get waiting =>
      _fr ? 'En attente de l’ordinateur' : 'Waiting for computer';

  String get paused => _fr ? 'En pause' : 'Paused';

  String get failed => _fr
      ? 'Impossible de joindre Exo. Réessayez avec une connexion.'
      : 'Couldn’t reach Exo. Try again when you have a connection.';

  String sourceLabel(String source) {
    switch (source) {
      case 'gmail':
        return 'Gmail';
      case 'google-calendar':
        return _fr ? 'Google Agenda' : 'Google Calendar';
      case 'outlook':
        return 'Outlook';
      case 'outlook-calendar':
        return _fr ? 'Calendrier Outlook' : 'Outlook Calendar';
      default:
        return source;
    }
  }

  String fromChip(String source) =>
      _fr ? 'De ${sourceLabel(source)}' : 'From ${sourceLabel(source)}';

  String stopFrom(String source) => _fr
      ? 'Arrêter d’ajouter depuis ${sourceLabel(source)}'
      : 'Stop adding from ${sourceLabel(source)}';

  String confirmTitle(String source) =>
      _fr ? 'Arrêter ${sourceLabel(source)} ?' : 'Stop ${sourceLabel(source)}?';

  String confirmBody(String source) {
    final name = sourceLabel(source);
    if (_fr) {
      return 'Le courrier et les événements restent dans $name. '
          'Exo retire ces éléments partout et n’en ajoutera plus tant que '
          'vous n’aurez pas reconnecté $name sur l’ordinateur. '
          'Cela ne vous déconnecte pas de $name.';
    }
    return 'Mail and events stay in $name. Exo will remove these items '
        'everywhere and will not add new ones until you connect $name on '
        'your computer. This does not sign you out of $name.';
  }
}
