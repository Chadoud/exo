import 'package:flutter/widgets.dart';

/// EN/FR reminder copy. Outcomes, not APNs/FCM.
class DueReminderCopy {
  DueReminderCopy(this.locale);

  final Locale locale;

  factory DueReminderCopy.of(BuildContext context) {
    final locale = Localizations.maybeLocaleOf(context) ??
        WidgetsBinding.instance.platformDispatcher.locale;
    return DueReminderCopy(locale);
  }

  bool get _fr => locale.languageCode.toLowerCase() == 'fr';

  String get section => _fr ? 'Rappels' : 'Reminders';

  String get enableTitle => _fr ? 'Prévenir à l’échéance' : 'Remind me when due';

  String get enableSubtitle => _fr
      ? 'Exo peut te prévenir quand une tâche arrive.'
      : 'Exo can remind you when a task is due.';

  String get lockScreenTitle =>
      _fr ? 'Détail sur l’écran verrouillé' : 'Show task on lock screen';

  String get lockScreenSubtitle => _fr
      ? 'Par défaut, la notif dit seulement qu’une tâche arrive.'
      : 'Off by default. The notification only says a task is due.';

  String get permissionTitle => enableSubtitle;

  String get permissionAllow => _fr ? 'Autoriser' : 'Allow';

  String get permissionLater => _fr ? 'Plus tard' : 'Later';

  String get osOffHint => _fr
      ? 'Si rien n’arrive, active les notifications pour Exo dans les réglages du téléphone.'
      : 'If nothing arrives, turn on notifications for Exo in the phone settings.';

  String get genericTitle => _fr ? 'Tâche due' : 'Task due';

  String get genericBody =>
      _fr ? 'Ouvre Tasks pour voir laquelle.' : 'Open Tasks to see which one.';

  String get taskGone => _fr
      ? 'Plus là — déjà faite ou pas encore synchronisée.'
      : 'Not here — already done, or not synced yet.';

  String get actionReadyTitle =>
      _fr ? 'Prêt à revoir' : 'Ready to review';

  String get actionReadyBody => _fr
      ? 'Ouvre Tasks — rien ne part tout seul.'
      : 'Open Tasks. Nothing sends itself.';

  String get actionConfirmTitle => _fr ? 'Envoyer ce brouillon ?' : 'Send this draft?';

  String get actionConfirmBody => _fr
      ? 'Ça partira dès que ton ordinateur Exo est ouvert. Rien ne part tout seul.'
      : 'It will send when Exo is open on your computer. Nothing sends itself.';

  String get actionWaitingDesktop => _fr
      ? 'Confirmé. Ça partira quand Exo sera ouvert sur l’ordinateur.'
      : 'Confirmed. It will send when Exo is open on your computer.';

  String get actionStale => _fr
      ? 'Ce brouillon n’est plus à jour. Rouvre-le sur l’ordinateur.'
      : 'This draft is out of date. Open it on the computer.';
}
