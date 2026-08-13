"""Assistant intent classification — server authority for text chat routing."""

from __future__ import annotations

import re
from typing import Literal

AssistantIntent = Literal[
    "read_calendar",
    "read_mail",
    "read_both",
    "mail_manage",
    "write_calendar",
    "write_calendar_delete",
    "send_message",
    "agent_task",
    "external_source_task",
    "codegen_studio",
    "generic_chat",
]

_SEND_MESSAGE_RE = re.compile(
    r"\b(send|envoie[rz]?|envoyer|schick[e]?|invia|manda|أرسل)\b[^.!?]*?\b"
    r"(message|msg|text|whatsapp|telegram|signal|discord|instagram|sms|imessage)\b|"
    r"\b(envoie|send)\s+(?:un\s+)?(?:message|msg|texto?)\s+à\b|"
    r"\b(tell|say|write|dis|sag|scrivi|écris|di[st])\s+"
    r"(?:to\s+|à\s+|an\s+|a\s+)?[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏ][a-zàáâãäåæçèéêëìíîïðñòóôõöøùúûüý]",
    re.IGNORECASE,
)
_EXTERNAL_SOURCE_TASK_RE = re.compile(
    r"\b((?:google\s+)?drive|dropbox|one\s*drive|onedrive|s3|amazon\s+s3|slack|icloud|infomaniak)\b.*"
    r"\b(move|copy|upload|download|list|search|find|create|delete|rename|share|send|post|message|channel|bucket|object|folder)\b|"
    r"\b(move|copy|upload|download|create\s+folder|delete|rename)\b.*"
    r"\b((?:google\s+)?drive|dropbox|one\s*drive|onedrive|s3|amazon\s+s3|icloud|infomaniak)\b|"
    r"\b(send\s+(?:an?\s+)?email|compose\s+(?:an?\s+)?email|write\s+(?:an?\s+)?email|"
    r"envoyer\s+(?:un\s+)?(?:e-?mail|mail)|e-?mail\s+senden)\b|"
    r"\b(post\s+(?:a\s+)?(?:message|msg)|send\s+(?:a\s+)?(?:message|msg)\s+(?:to|in|on)\s+slack|slack\s+message)\b",
    re.IGNORECASE,
)
_AGENT_TASK_RE = re.compile(
    r"\b(plan\s+step|autonomously|step[\s-]by[\s-]step|automatically|do everything|"
    r"execute|carry\s+out|handle\s+everything|multiple steps?|find.*then.*then|"
    r"then.*and\s+then|"
    # Analytical asks over retrieved data (filter/extract/count/compute) need real
    # reasoning, not the deterministic "just list it" read_calendar/read_mail path —
    # those paths render prefetched items as-is with no LLM step at all. Without this,
    # a goal like "find events matching X, extract and count unique names" gets caught
    # by the calendar/mail noun check below and silently dumped unfiltered.
    r"extract\s+and\s+count|count\s+the\s+(?:number|total)|how\s+many\s+unique|"
    r"determine\s+how\s+many|cross[\s-]?reference|tally\b)",
    re.IGNORECASE,
)
# Inbox "Retry in Chat" prefills — must win over mail nouns like "invoices".
# Keep in sync with frontend `AGENT_FAILURE_RETRY_PREFIX`.
_AGENT_RETRY_RE = re.compile(
    r"^please\s+retry\s+this(?:\s+autonomously)?\s*:\s*(.+)$",
    re.IGNORECASE | re.DOTALL,
)
_CODEGEN_TASK_RE = re.compile(
    r"\b(create|build|make|generate|scaffold|implement|write)\b[\s\S]{0,120}\b"
    r"(app(?:lication)?|project|website|web\s+app|chat\s+app|codebase|program)\b|"
    r"\b(react|typescript|tailwind|vite|next\.?js|vue|svelte|angular)\b[\s\S]{0,200}\b"
    r"(component|app\.tsx|npm\s+install|deliverables?)\b|"
    r"\bgenerate\s+all\s+source\s+code\b|\bnpm\s+install[\s\S]{0,60}npm\s+run\s+dev\b",
    re.IGNORECASE,
)
_SHORT_FOLLOW_UP_RE = re.compile(
    r"^(do\s+it|go\s+ahead|yes|please|now|continue|try\s+again|same\s+thing|make\s+it\s+happen)\b",
    re.IGNORECASE,
)
_TIME_FOLLOW_UP_RE = re.compile(
    r"^(?:à\s+)?(?:midi|minuit|noon|midnight|matin|soir|\d{1,2}\s*h(?:eures?)?|\d{1,2}:\d{2}|"
    r"(?:une|1)\s+heure(?:s)?)(?:\s+pour\s+(?:une|1)\s+heure(?:s)?)?\.?$",
    re.IGNORECASE,
)
_CALENDAR_NOUN_RE = re.compile(
    r"\b(calendar|meeting|event|schedule|appointment|agenda|upcoming|rendez-vous|rendez vous|"
    r"réunion|reunion|séance|seance|kalender|termin|sitzung|besprechung|riunione|appuntamento|"
    r"calendario|ordre du jour)\b",
    re.IGNORECASE,
)
_TIME_REFERENCE_RE = re.compile(
    r"\b(today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|"
    r"sunday|aujourd'hui|demain|cette semaine|la semaine prochaine|lundi|mardi|mercredi|jeudi|"
    r"vendredi|samedi|dimanche|heute|morgen|diese woche|n[äa]chste[n]?\s+woche|montag|dienstag|"
    r"mittwoch|donnerstag|freitag|samstag|sonntag|oggi|domani|questa settimana|la settimana "
    r"prossima|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\b",
    re.IGNORECASE,
)
_MAIL_NOUN_RE = re.compile(
    r"\b(emails?|e-mails?|mails?|inbox|messages?|recap|newsletters?|received|subject|boite|"
    r"boîte|courriers?|courriel|posteingang|nachrichten?|posta|casella|messaggi[oa]?|invoices?|"
    r"bills?|receipts?|payments?|transactions?|contracts?|agreements?|statements?|factures?|"
    r"rechnung(?:en)?|quittung(?:en)?|zahlung(?:en)?|vertrag|vertr[äa]ge|fattur[ae]|ricevut[ae]|"
    r"pagament[oi]|contratt[oi])\b",
    re.IGNORECASE,
)
_CALENDAR_WRITE_RE = re.compile(
    r"\b(create|set\s+up|book|cancel|delete|reschedule|fix\s+(?:me|a|the|my|an)|"
    r"add\s+(?:a|an|the|my)|schedule(?:\s+(?:a|an|the|my))?|"
    r"(?:update|edit|remove|move)\s+(?:a|an|the|my|this)|"
    r"cr[eé]er?|planifier|annuler|supprimer|modifier|d[eé]placer|erstell[etn]+|anlegen|"
    r"l[oö]sch[etn]+|absag[etn]+|verschieb[etn]+|crea[re]+|pianificare|annullare|elimina[re]+|"
    r"modifica[re]+|il\s+faut|pour\s+que\s+(?:je|j')|rappelle(?:-moi)?|n'oublie\s+pas|remind\s+me)\b",
    re.IGNORECASE,
)
_CALENDAR_DELETE_RE = re.compile(
    r"\b(delete|remove|cancel|clear|drop|supprim|effac|annul|lösch|entfern|elimina)\b",
    re.IGNORECASE,
)
_MAIL_WRITE_RE = re.compile(
    r"\b(send\s+(?:an?\s+)?email|compose\s+(?:an?\s+)?email|write\s+(?:an?\s+)?email|"
    r"envoyer\s+(?:un\s+)?(?:e-?mail|mail)|e-?mail\s+senden|draft\s+(?:an?\s+)?email)\b",
    re.IGNORECASE,
)
_MAIL_MANAGE_RE = re.compile(
    r"(?:"
    r"\b(block|unsubscribe|stop|filter|spam|junk|mute|ignore|unwanted)\b.*"
    r"\b(emails?|e-mails?|mails?|newsletters?|sender|from)\b|"
    r"\b(emails?|e-mails?|mails?|newsletters?)\b.*"
    r"\b(block|unsubscribe|stop|filter|spam|junk|mute|ignore|unwanted)\b|"
    r"\b(don'?t|do not) want\b.*\b(receive|get|see)\b.*\b(emails?|e-mails?|mails?|newsletters?)\b|"
    r"\b(ne veux plus|plus recevoir|bloquer|d[eé]sabonn|desabonn|filtrer)\b"
    r")",
    re.IGNORECASE,
)


def is_time_follow_up_reply(text: str) -> bool:
    """True when the message is only a time answer to a prior calendar question."""
    return bool(_TIME_FOLLOW_UP_RE.match(text.strip()))


def merge_calendar_write_context(previous_user_message: str | None, current_message: str) -> str:
    """Merge a short time follow-up with the prior calendar-create utterance."""
    cur = current_message.strip()
    prev = (previous_user_message or "").strip()
    if not prev or not is_time_follow_up_reply(cur):
        return cur
    if cur.lower() in prev.lower():
        return cur
    time_fragment = (
        f"à {cur}"
        if re.match(r"^(midi|minuit|noon|midnight)$", cur, re.IGNORECASE)
        else cur
    )
    return f"{prev} {time_fragment}".strip()


def is_mail_manage_intent(text: str) -> bool:
    """True when the user wants to block, filter, or stop receiving mail."""
    return bool(_MAIL_MANAGE_RE.search(text.strip()))


def is_mail_write_intent(text: str) -> bool:
    """True when the user wants to compose/send email (not read inbox)."""
    return bool(_MAIL_WRITE_RE.search(text.strip()))


def extract_agent_retry_goal(text: str) -> str:
    """Return the original goal when ``text`` is an Inbox Retry prefill."""
    cur = text.strip()
    match = _AGENT_RETRY_RE.match(cur)
    if not match:
        return cur
    goal = match.group(1).strip()
    return goal or cur


def is_agent_retry_prefill(text: str) -> bool:
    """True when the message is an Inbox agent-failure Retry prefill."""
    return bool(_AGENT_RETRY_RE.match(text.strip()))


def _classify_body_without_retry(text: str) -> AssistantIntent:
    """Classify a bare user utterance (no Inbox Retry wrapper)."""
    if _CODEGEN_TASK_RE.search(text):
        return "codegen_studio"
    if _AGENT_TASK_RE.search(text):
        return "agent_task"
    if _CALENDAR_WRITE_RE.search(text):
        if _CALENDAR_DELETE_RE.search(text):
            return "write_calendar_delete"
        return "write_calendar"
    if is_mail_manage_intent(text):
        return "mail_manage"
    is_calendar = bool(_CALENDAR_NOUN_RE.search(text) or _TIME_REFERENCE_RE.search(text))
    is_mail = bool(_MAIL_NOUN_RE.search(text))
    if is_calendar and is_mail:
        return "read_both"
    if is_calendar:
        return "read_calendar"
    if is_mail:
        return "read_mail"
    if _EXTERNAL_SOURCE_TASK_RE.search(text):
        return "external_source_task"
    if _SEND_MESSAGE_RE.search(text) and not _MAIL_WRITE_RE.search(text):
        return "send_message"
    return "generic_chat"


def classify_intent_from_message_body(text: str) -> AssistantIntent:
    """Classify one message body without follow-up reuse.

    Inbox Retry prefills are classified from the *underlying goal* so mail/invoice
    asks use ``read_mail`` (same as typing the goal). Only fall back to
    ``agent_task`` when the goal has no specialized route.
    """
    if is_agent_retry_prefill(text):
        goal = extract_agent_retry_goal(text)
        intent = _classify_body_without_retry(goal)
        if intent == "generic_chat":
            return "agent_task"
        return intent
    return _classify_body_without_retry(text)


def classify_intent(text: str, previous_user_message: str | None = None) -> AssistantIntent:
    """Classify routing intent for one user turn."""
    cur = text.strip()
    prev = (previous_user_message or "").strip()
    if prev and 0 < len(cur) < 120:
        if _SHORT_FOLLOW_UP_RE.match(cur):
            prior = classify_intent_from_message_body(prev)
            if prior in ("read_calendar", "read_both", "read_mail", "mail_manage"):
                return prior
        if _TIME_FOLLOW_UP_RE.match(cur):
            prior = classify_intent_from_message_body(prev)
            if prior == "write_calendar":
                return "write_calendar"
    return classify_intent_from_message_body(text)
