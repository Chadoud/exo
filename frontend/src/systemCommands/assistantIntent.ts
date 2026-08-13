/**
 * UI intent hints for panel routing. Text chat routing authority is POST /assistant/turn.
 */

export { MS_GRAPH_PROVIDER_IDS } from "../assistant/connectorContext";
import { isCodegenTask, isMailWriteIntent } from "./assistantIntentHelpers";

export type AssistantIntent =
  | "read_calendar"
  | "read_mail"
  | "read_both"
  | "mail_manage"
  | "write_calendar"
  | "write_calendar_delete"
  | "send_message"
  | "agent_task"
  | "external_source_task"
  | "codegen_studio"
  | "generic_chat";

const SEND_MESSAGE_RE =
  /\b(send|envoie[rz]?|envoyer|schick[e]?|invia|manda|أرسل)\b[^.!?]*?\b(message|msg|text|whatsapp|telegram|signal|discord|instagram|sms|imessage)\b|\b(envoie|send)\s+(?:un\s+)?(?:message|msg|texto?)\s+à\b|\b(tell|say|write|dis|sag|scrivi|écris|di[st])\s+(?:to\s+|à\s+|an\s+|a\s+)?[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏ][a-zàáâãäåæçèéêëìíîïðñòóôõöøùúûüý]/;

const EXTERNAL_SOURCE_TASK_RE =
  /\b((?:google\s+)?drive|dropbox|one\s*drive|onedrive|s3|amazon\s+s3|slack|icloud|infomaniak)\b.*\b(move|copy|upload|download|list|search|find|create|delete|rename|share|send|post|message|channel|bucket|object|folder)\b|\b(move|copy|upload|download|create\s+folder|delete|rename)\b.*\b((?:google\s+)?drive|dropbox|one\s*drive|onedrive|s3|amazon\s+s3|icloud|infomaniak)\b|\b(send\s+(?:an?\s+)?email|compose\s+(?:an?\s+)?email|write\s+(?:an?\s+)?email|envoyer\s+(?:un\s+)?(?:e-?mail|mail)|e-?mail\s+senden)\b|\b(post\s+(?:a\s+)?(?:message|msg)|send\s+(?:a\s+)?(?:message|msg)\s+(?:to|in|on)\s+slack|slack\s+message)\b/i;

// Analytical asks over retrieved data (filter/extract/count/compute) need real
// reasoning, not the deterministic "just list it" read_calendar/read_mail path —
// keep in sync with backend `_AGENT_TASK_RE` (services/assistant/intent.py).
const AGENT_TASK_RE =
  /\b(plan\s+step|autonomously|step[\s-]by[\s-]step|automatically|do everything|execute|carry\s+out|handle\s+everything|multiple steps?|find.*then.*then|then.*and\s+then|extract\s+and\s+count|count\s+the\s+(?:number|total)|how\s+many\s+unique|determine\s+how\s+many|cross[\s-]?reference|tally\b)/i;

/** Inbox Retry prefills — classify underlying goal (sync with backend `_AGENT_RETRY_RE`). */
const AGENT_RETRY_RE = /^please\s+retry\s+this(?:\s+autonomously)?\s*:\s*(.+)$/i;

const SHORT_FOLLOW_UP_RE =
  /^(do\s+it|go\s+ahead|yes|please|now|continue|try\s+again|same\s+thing|make\s+it\s+happen)\b/i;

const TIME_FOLLOW_UP_RE =
  /^(?:à\s+)?(?:midi|minuit|noon|midnight|matin|soir|\d{1,2}\s*h(?:eures?)?|\d{1,2}:\d{2}|(?:une|1)\s+heure(?:s)?)(?:\s+pour\s+(?:une|1)\s+heure(?:s)?)?\.?$/i;

const CALENDAR_NOUN_RE =
  /\b(calendar|meeting|event|schedule|appointment|agenda|upcoming|rendez-vous|rendez vous|réunion|reunion|séance|seance|kalender|termin|sitzung|besprechung|riunione|appuntamento|calendario|ordre du jour)\b/i;

const TIME_REFERENCE_RE =
  /\b(today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|aujourd'hui|aujourd'hui|demain|cette semaine|la semaine prochaine|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|heute|morgen|diese woche|n[äa]chste[n]?\s+woche|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|oggi|domani|questa settimana|la settimana prossima|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\b/i;

const MAIL_NOUN_RE =
  /\b(emails?|e-mails?|mails?|inbox|messages?|recap|newsletters?|received|subject|boite|boîte|courriers?|courriel|posteingang|nachrichten?|posta|casella|messaggi[oa]?|invoices?|bills?|receipts?|payments?|transactions?|contracts?|agreements?|statements?|factures?|rechnung(?:en)?|quittung(?:en)?|zahlung(?:en)?|vertrag|vertr[äa]ge|fattur[ae]|ricevut[ae]|pagament[oi]|contratt[oi])\b/i;

const MAIL_MANAGE_RE =
  /(?:\b(block|unsubscribe|stop|filter|spam|junk|mute|ignore|unwanted)\b.*\b(emails?|e-mails?|mails?|newsletters?|sender|from)\b|\b(emails?|e-mails?|mails?|newsletters?)\b.*\b(block|unsubscribe|stop|filter|spam|junk|mute|ignore|unwanted)\b|\b(don'?t|do not) want\b.*\b(receive|get|see)\b.*\b(emails?|e-mails?|mails?|newsletters?)\b|\b(ne veux plus|plus recevoir|bloquer|d[eé]sabonn|desabonn|filtrer)\b)/i;

const CALENDAR_WRITE_RE =
  /\b(create|set\s+up|book|cancel|delete|reschedule|fix\s+(?:me|a|the|my|an)|add\s+(?:a|an|the|my)|schedule(?:\s+(?:a|an|the|my))?|(?:update|edit|remove|move)\s+(?:a|an|the|my|this)|cr[eé]er?|planifier|annuler|supprimer|modifier|d[eé]placer|erstell[etn]+|anlegen|l[oö]sch[etn]+|absag[etn]+|verschieb[etn]+|crea[re]+|pianificare|annullare|elimina[re]+|modifica[re]+|il\s+faut|pour\s+que\s+(?:je|j')|rappelle(?:-moi)?|n'oublie\s+pas|remind\s+me)\b/i;

const CALENDAR_DELETE_RE =
  /\b(delete|remove|cancel|clear|drop|supprim|effac|annul|lösch|entfern|elimina)\b/i;

function classifyIntentBodyWithoutRetry(text: string): AssistantIntent {
  if (isCodegenTask(text)) return "codegen_studio";
  if (AGENT_TASK_RE.test(text)) return "agent_task";
  if (CALENDAR_WRITE_RE.test(text)) {
    if (CALENDAR_DELETE_RE.test(text)) return "write_calendar_delete";
    return "write_calendar";
  }
  if (MAIL_MANAGE_RE.test(text)) return "mail_manage";
  const isCalendar = CALENDAR_NOUN_RE.test(text) || TIME_REFERENCE_RE.test(text);
  const isMail = MAIL_NOUN_RE.test(text);
  if (isCalendar && isMail) return "read_both";
  if (isCalendar) return "read_calendar";
  if (isMail) return "read_mail";
  if (EXTERNAL_SOURCE_TASK_RE.test(text)) return "external_source_task";
  if (SEND_MESSAGE_RE.test(text) && !isMailWriteIntent(text)) return "send_message";
  return "generic_chat";
}

function classifyIntentFromMessageBody(text: string): AssistantIntent {
  const trimmed = text.trim();
  const retryMatch = AGENT_RETRY_RE.exec(trimmed);
  if (retryMatch) {
    const goal = (retryMatch[1] ?? "").trim() || trimmed;
    const intent = classifyIntentBodyWithoutRetry(goal);
    return intent === "generic_chat" ? "agent_task" : intent;
  }
  return classifyIntentBodyWithoutRetry(trimmed);
}

/** Classify UI routing hints for one user message (server owns text chat routing). */
export function classifyIntent(text: string, previousUserMessage?: string | null): AssistantIntent {
  const cur = text.trim();
  const prev = (previousUserMessage ?? "").trim();
  if (prev && cur.length > 0 && cur.length < 120) {
    if (SHORT_FOLLOW_UP_RE.test(cur)) {
      const priorIntent = classifyIntentFromMessageBody(prev);
      if (priorIntent === "read_calendar" || priorIntent === "read_both") return priorIntent;
      if (priorIntent === "read_mail" || priorIntent === "mail_manage") return priorIntent;
    }
    if (TIME_FOLLOW_UP_RE.test(cur)) {
      const priorIntent = classifyIntentFromMessageBody(prev);
      if (priorIntent === "write_calendar") return "write_calendar";
    }
  }
  return classifyIntentFromMessageBody(text);
}

export {
  isCodegenTask,
  isCodegenDeliverablesTask,
  isTimeFollowUpReply,
  mergeCalendarWriteContext,
  computeCalendarWindow,
  buildCalendarDeeplinks,
  extractEventTitleFromText,
  buildEventStartIso,
  isMailWriteIntent,
  extractMailComposeParamsFromText,
  buildMailComposeDeeplinks,
  buildMailSearchQuery,
  calendarContextForSystemPrompt,
  extractEventTimeFromText,
} from "./assistantIntentHelpers";
export type { CalendarDeeplink, MailComposeDeeplink } from "./assistantIntentHelpers";
