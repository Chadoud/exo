import 'package:flutter/widgets.dart';

/// EN/FR Inbox copy. Outcomes, not sync collection names.
class InboxCopy {
  InboxCopy(this.locale);

  final Locale locale;

  factory InboxCopy.of(BuildContext context) {
    final locale = Localizations.maybeLocaleOf(context) ??
        WidgetsBinding.instance.platformDispatcher.locale;
    return InboxCopy(locale);
  }

  bool get _fr => locale.languageCode.toLowerCase() == 'fr';

  String get title => 'Inbox';

  String get toSend => _fr ? 'À envoyer' : 'To send';

  String get needsLook => _fr ? 'À reprendre' : 'Needs a look';

  String get emptyTitle =>
      _fr ? 'Rien à revoir' : 'Nothing to review';

  String get emptySubtitle => _fr
      ? 'Quand Exo prépare une réponse ou a besoin d’un regard, ça arrive ici.'
      : 'When EXO drafts a reply or needs a look, it shows up here.';

  String get toSendEmptyTitle => _fr ? 'Rien à envoyer' : 'Nothing to send';

  String get toSendEmptySubtitle => _fr
      ? 'Quand Exo prépare une réponse, elle arrive ici.'
      : 'When EXO drafts a reply, it shows up here.';

  String get needsLookEmptyTitle =>
      _fr ? 'Rien à reprendre' : 'Nothing needs a look';

  String get needsLookEmptySubtitle => _fr
      ? 'Quand Exo a besoin d’un regard, ça arrive ici.'
      : 'When EXO needs a look, it shows up here.';

  String get nudgeSection => _fr ? 'Suggestions' : 'Suggestions';

  String get failureSection => _fr ? 'À reprendre' : 'Needs another look';

  String get dismiss => _fr ? 'Masquer' : 'Dismiss';

  String get failureHint => _fr
      ? 'Rouvre Exo sur l’ordinateur pour réessayer.'
      : 'Open Exo on your computer to try again.';

  String get failureAsk => _fr ? 'Demande' : 'Ask';
}
