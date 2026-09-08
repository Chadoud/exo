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
      ? 'Une alerte sur ce téléphone.'
      : 'A notification on this phone.';

  String get lockScreenTitle =>
      _fr ? 'Montrer le nom de la tâche' : 'Show the task name';

  String get lockScreenSubtitle => _fr
      ? 'Sinon la notif dit seulement qu’une tâche arrive (plus discret).'
      : 'Otherwise the notification only says a task is due (more private).';

  String get lockScreenNeedsReminders => _fr
      ? 'Active d’abord les rappels.'
      : 'Turn on reminders first.';

  String get permissionAskTitle =>
      _fr ? 'Te prévenir à l’échéance ?' : 'Remind you when something is due?';

  String get permissionAskBody => _fr
      ? 'Exo te prévient sur ce téléphone. Tu restes maître.'
      : 'Exo can remind you on this phone. You stay in control.';

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
      ? 'Ouvre Inbox — rien ne part tout seul.'
      : 'Open Inbox. Nothing sends itself.';

  String get actionSection => _fr ? 'À envoyer' : 'Ready to send';

  String get actionCardTitle => _fr ? 'Réponse prête' : 'Reply ready';

  String get actionCardWaitingTitle =>
      _fr ? 'En attente du Mac' : 'Waiting on your computer';

  String get actionCardStaleTitle =>
      _fr ? 'Brouillon périmé' : 'Draft out of date';

  String actionCardTitleFor({
    required bool ready,
    required bool waiting,
    required bool stale,
  }) {
    if (stale) return actionCardStaleTitle;
    if (waiting) return actionCardWaitingTitle;
    return actionCardTitle;
  }

  String get actionCardHint => _fr
      ? 'Relis leur message, puis ta réponse. Ça part du Mac, pas tout seul.'
      : 'Read their message, then your reply. It sends from your computer, not by itself.';

  String get actionContext => _fr ? 'Leur message' : 'Their message';

  String get actionReply => _fr ? 'Ta réponse' : 'Your reply';

  String get actionSubject => _fr ? 'Sujet' : 'Subject';

  String get actionBody => _fr ? 'Message' : 'Message';

  String get actionSend => _fr ? 'Envoyer' : 'Send';

  String get actionConfirmTitle =>
      _fr ? 'Envoyer ce brouillon ?' : 'Send this draft?';

  String get actionConfirmBody => _fr
      ? 'Ça partira dès que ton ordinateur Exo est ouvert. Rien ne part tout seul.'
      : 'It will send when Exo is open on your computer. Nothing sends itself.';

  String get actionWaitingDesktop => _fr
      ? 'C’est noté — ça partira dès qu’Exo est ouvert sur le Mac.'
      : 'Noted. It will send when Exo is open on your computer.';

  String get actionStale => _fr
      ? 'Ce brouillon n’est plus à jour. Rouvre-le sur l’ordinateur.'
      : 'This draft is out of date. Open it on the computer.';

  String actionsToSend(int count) {
    if (_fr) {
      return count == 1 ? '1 à envoyer' : '$count à envoyer';
    }
    return count == 1 ? '1 to send' : '$count to send';
  }
}
