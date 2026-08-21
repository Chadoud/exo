"""Skip drafts for mail that already closed the loop.

Promo, list-unsubscribe, and noreply@ are filtered in harvest. This layer
catches transactional receipts that look personal (an application, a ticket)
but do not ask the user to write back.
"""

from __future__ import annotations

import re
from typing import Any

_AUTO_SUBMITTED_SKIP = frozenset({"auto-replied", "auto-generated", "auto-notified"})

_AUTO_LOCAL = re.compile(
    r"(^|\b)("
    r"no[-_.]?reply|donotreply|mailer-daemon|"
    r"auto[-_.]?(?:confirm|notify|notification)|"
    r"notifications?|do[-_.]?not[-_.]?reply"
    r")@",
    re.IGNORECASE,
)

# Receipt desks. Not enough alone — a recruiter may still ask a real question.
_RECEIPT_LOCAL = re.compile(
    r"(^|\b)(recruitment|recrutement|careers?|jobs?|hiring|talent[-_.]?acq)@",
    re.IGNORECASE,
)

_ATS = re.compile(
    r"\b("
    r"smartrecruiters|greenhouse\.io|boards\.greenhouse|"
    r"lever\.co|myworkdayjobs|successfactors|icims\.com|"
    r"jobvite|ashbyhq|workable\.com|recruitee"
    r")\b",
    re.IGNORECASE,
)

_ACK = re.compile(
    r"("
    r"thank you for (?:your )?(?:applying|application|submitting|your interest)|"
    r"we(?:'ve| have) (?:safely )?(?:received|got) your "
    r"(?:application|cv|résumé|resume|request|submission)|"
    r"we(?:'ll| will) (?:review your application|get back to you)|"
    r"this is an automated (?:message|email|notification|response)|"
    r"do not reply to this (?:email|message)|"
    r"please do not (?:reply to|share or forward) this|"
    r"if you were not expecting this message|"
    r"merci (?:pour )?(?:votre )?(?:candidature|postulation)|"
    r"nous (?:avons bien reçu|reviendrons vers vous)|"
    r"vielen dank für (?:ihre )?bewerbung|"
    r"wir (?:haben Ihre bewerbung|melden uns)"
    r")",
    re.IGNORECASE,
)

_STANDALONE_AUTO = re.compile(
    r"this is an automated|"
    r"(?:please )?do not reply to this (?:email|message)",
    re.IGNORECASE,
)

_RHETORICAL_Q = re.compile(
    r"what(?:'s| is| will)?(?:\s+happen)?\s+next\s*\?",
    re.IGNORECASE,
)

_ASKS = re.compile(
    r"("
    r"\b(?:are|can|could|would|do|will|have) you\b[^?]{0,120}\?|"
    r"\bwhen (?:are|can|could|would) you\b|"
    r"\bwhat(?:'s| is) your\b|"
    r"\bplease (?:reply|respond|confirm|complete|send|schedule|book|fill|upload|sign)\b|"
    r"\b(?:let us know|kindly confirm|get back to us|await(?:ing)? your)\b|"
    r"\bpouvez[- ]vous\b|"
    r"\bmerci de (?:nous )?(?:répondre|confirmer|compléter)\b|"
    r"\bkönnen sie\b|"
    r"\bbitte (?:antworten|bestätigen|ausfüllen)\b"
    r")",
    re.IGNORECASE,
)


def _norm(text: str) -> str:
    return (text or "").replace("\xa0", " ").replace("&nbsp;", " ")


def _asks_for_reply(text: str) -> bool:
    return bool(_ASKS.search(_RHETORICAL_Q.sub(" ", text)))


def header_skip_reason(
    *,
    from_addr: str = "",
    to_addr: str = "",
    headers: dict[str, Any] | None = None,
) -> str | None:
    """RFC auto-reply / machine local-part — safe on metadata alone."""
    hdrs = {str(k).lower(): str(v or "") for k, v in (headers or {}).items()}
    auto = hdrs.get("auto-submitted", "").split(";", 1)[0].strip().lower()
    if auto in _AUTO_SUBMITTED_SKIP:
        return "auto_submitted"
    if hdrs.get("precedence", "").strip().lower() == "auto_reply":
        return "auto_reply"
    from_l = (from_addr or "").strip().lower()
    to_l = (to_addr or "").strip().lower()
    if _AUTO_LOCAL.search(from_l) or _AUTO_LOCAL.search(to_l):
        return "noreply"
    return None


def skip_reason_for_draft(
    *,
    from_addr: str = "",
    to_addr: str = "",
    subject: str = "",
    text: str = "",
    headers: dict[str, Any] | None = None,
) -> str | None:
    """Return a drop reason, or None if a human reply may still help."""
    header_reason = header_skip_reason(
        from_addr=from_addr, to_addr=to_addr, headers=headers
    )
    if header_reason:
        return header_reason
    from_l = (from_addr or "").strip().lower()
    to_l = (to_addr or "").strip().lower()
    blob = _norm(f"{subject}\n{text}")
    if _asks_for_reply(blob):
        return None
    if _ACK.search(blob) and (
        _ATS.search(blob) or _RECEIPT_LOCAL.search(from_l) or _RECEIPT_LOCAL.search(to_l)
    ):
        return "auto_ack"
    if _ACK.search(_norm(subject)):
        return "auto_ack"
    if _STANDALONE_AUTO.search(blob):
        return "auto_ack"
    return None
