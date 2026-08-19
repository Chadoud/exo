"""
Evaluate whether text or mail metadata is personal signal vs promotional noise.

Used at every durable write boundary (memory, tasks, digest inputs).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

from signal_quality.constants import (
    AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD,
    GMAIL_NOISE_LABELS,
    GMAIL_UPDATES_LABEL,
)

# ── Tiers ─────────────────────────────────────────────────────────────────────


class SignalTier(str, Enum):
    ALLOW = "allow"
    QUARANTINE = "quarantine"
    REJECT = "reject"


@dataclass(frozen=True)
class SignalVerdict:
    tier: SignalTier
    score: float  # 0 = clean, 1 = definite noise
    reason: str


# ── Heuristic patterns (multilingual promo / list mail) ───────────────────────

_PROMO_SUBJECT_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\b\d+\s*%\s*off\b",
        r"\b(sale|clearance|flash\s+sale|limited\s+time|act\s+now|last\s+chance)\b",
        r"\b(unsubscribe|newsletter|digest|weekly\s+roundup|daily\s+deal)\b",
        r"\b(free\s+shipping|promo\s+code|coupon|discount\s+code)\b",
        r"\b(exclusive\s+offer|special\s+offer|don'?t\s+miss)\b",
        r"\b(your\s+order\s+has\s+shipped)\b",  # shipping marketing, not action
        r"\b(re:|fwd:).*(offer|sale|promo)\b",
        r"\b(black\s+friday|cyber\s+monday|prime\s+day)\b",
        r"\b(sonderangebot|rabatt|angebot|gratis|gutschein)\b",
        r"\b(offre|promo|réduction|soldes|bon\s+de\s+réduction)\b",
        r"\b(gratuit|gratuitement|week-end|jouez|jouer|disponible\s+d[èe]s)\b",
        r"\b(prot[ée]gez|nouvelle\s+surface|ubisoft|division)\b",
        r"\b(profitez\s+de|éditions?\s*!)\b",
        r"\b(sconto|offerta|promozione|gratis)\b",
        r"\b(kostenlos|gratis\s+versand|jetzt\s+spielen)\b",
    )
)

_STRICT_AUTO_PROVENANCE = frozenset(
    {"mail", "integration", "chat", "meeting", "calendar"}
)

_NO_REPLY_FROM = re.compile(
    r"(^|\b)(no[-_.]?reply|noreply|donotreply|marketing|newsletter|promo|mailer-daemon)@",
    re.IGNORECASE,
)

# RFC list mail — newsletters always send at least one. Do not treat as 1:1.
_LIST_MAIL_HEADERS = frozenset(
    {"list-unsubscribe", "list-unsubscribe-post", "list-id"}
)

_PERCENT_OFF = re.compile(r"-?\d+\s*%", re.IGNORECASE)
_EMDASH_IN_TEXT = re.compile(r"\s[—–-]\s")

# Automated account/security mail — informational, not user to-dos.
_SECURITY_NOTIFICATION_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\bnew\s+sign[\s-]?in\b",
        r"\bsign[\s-]?in\s+(?:alert|detected|notification|to\s+your)\b",
        r"\b(new|recent|suspicious|unusual)\s+(?:login|log[\s-]?in|sign[\s-]?in)\b",
        r"\bsecurity\s+alert\b",
        r"\bverify\s+your\s+(?:email|account|identity)\b",
        r"\baccount\s+(?:activity|security|verification)\b",
        r"\bpassword\s+(?:was\s+)?(?:changed|reset|updated)\b",
        r"\b(new|unknown)\s+device\b",
        r"\bunrecognized\s+(?:device|login|sign[\s-]?in)\b",
        r"\btwo[\s-]?factor\s+(?:authentication|code)\b",
        r"\b(?:connexion|connection)\s+inhabituelle\b",
        r"\bnouvelle\s+connexion\b",
        r"\bidentifiant\s+de\s+connexion\b",
    )
)


def _clamp(score: float) -> float:
    return max(0.0, min(1.0, score))


def evaluate_text(
    text: str,
    *,
    from_addr: str = "",
    user_starred: bool = False,
    user_important: bool = False,
) -> SignalVerdict:
    """
    Score free text (subject, snippet, memory value) for promotional noise.

    User-starred / important signals override to ALLOW.
    """
    if user_starred or user_important:
        return SignalVerdict(SignalTier.ALLOW, 0.0, "user_flagged_important")

    combined = f"{from_addr} {text}".strip()
    if len(combined) < 4:
        return SignalVerdict(SignalTier.REJECT, 0.9, "too_short")

    lower = combined.lower()
    score = 0.0
    reasons: list[str] = []

    promo_hits = sum(1 for pat in _PROMO_SUBJECT_PATTERNS if pat.search(combined))
    if promo_hits:
        score += max(0.35, 0.22 * promo_hits)
        reasons.append("promo_pattern")

    if _PERCENT_OFF.search(combined):
        score += 0.22
        reasons.append("percent_off")

    if _EMDASH_IN_TEXT.search(combined):
        score += 0.15
        reasons.append("emdash_title")

    if _NO_REPLY_FROM.search(from_addr or combined):
        score += 0.2
        reasons.append("no_reply_sender")

    if any(
        cue in lower
        for cue in ("unsubscribe", "list-unsubscribe", "désinscrire", "desinscrire")
    ):
        score += 0.3
        reasons.append("unsubscribe_cue")

    if re.search(
        r"\b(view in browser|view\s+online|email preferences|manage preferences|"
        r"afficher dans le navigateur|choisir ses pr[ée]f[ée]rences|"
        r"vous recevez cet e-?mail|you(?:'ve| have) received this email because)\b",
        lower,
    ):
        score += 0.2
        reasons.append("bulk_mail_footer")

    score = _clamp(score)

    if score >= 0.55:
        return SignalVerdict(SignalTier.REJECT, score, reasons[0] if reasons else "promotional")
    if score >= 0.3:
        return SignalVerdict(SignalTier.QUARANTINE, score, reasons[0] if reasons else "ambiguous")
    return SignalVerdict(SignalTier.ALLOW, score, "clean")


def evaluate_gmail_message(
    *,
    label_ids: list[str] | None = None,
    from_addr: str = "",
    subject: str = "",
    snippet: str = "",
    headers: dict[str, str] | None = None,
    strict_updates: bool = False,
) -> SignalVerdict:
    """Evaluate a Gmail message before task/memory ingestion."""
    labels = set(label_ids or [])
    if labels.intersection(GMAIL_NOISE_LABELS):
        hit = next(iter(labels.intersection(GMAIL_NOISE_LABELS)))
        return SignalVerdict(SignalTier.REJECT, 0.95, f"gmail_label:{hit}")

    if strict_updates and GMAIL_UPDATES_LABEL in labels:
        return SignalVerdict(SignalTier.REJECT, 0.85, "gmail_label:updates")

    starred = "STARRED" in labels
    important = "IMPORTANT" in labels

    hdrs = {k.lower(): v for k, v in (headers or {}).items()}
    if not starred and not important:
        if any(hdrs.get(name) for name in _LIST_MAIL_HEADERS):
            return SignalVerdict(SignalTier.REJECT, 0.9, "list_header")
        if hdrs.get("precedence", "").lower() in ("bulk", "list", "junk"):
            return SignalVerdict(SignalTier.REJECT, 0.8, "bulk_header")

    text_verdict = evaluate_text(
        f"{subject} — {snippet}",
        from_addr=from_addr,
        user_starred=starred,
        user_important=important,
    )
    return text_verdict


def evaluate_outlook_message(
    *,
    from_addr: str = "",
    subject: str = "",
    preview: str = "",
    inference_classification: str | None = None,
    importance: str | None = None,
    is_flagged: bool = False,
) -> SignalVerdict:
    """Evaluate an Outlook / Graph message before task/memory ingestion."""
    ic = (inference_classification or "").lower()
    if ic == "other" and not is_flagged:
        text_only = evaluate_text(f"{subject} — {preview}", from_addr=from_addr)
        if text_only.tier != SignalTier.ALLOW:
            return text_only
        return SignalVerdict(SignalTier.QUARANTINE, 0.4, "outlook_focused_other")

    imp = (importance or "").lower()
    important = imp == "high" or is_flagged
    return evaluate_text(
        f"{subject} — {preview}",
        from_addr=from_addr,
        user_important=important,
        user_starred=is_flagged,
    )


def evaluate_memory_item(
    key: str,
    value: str,
    *,
    provenance: str | None = None,
    skip_check: bool = False,
) -> SignalVerdict:
    """Gate memory writes (key + value combined)."""
    if skip_check:
        return SignalVerdict(SignalTier.ALLOW, 0.0, "bypass")

    text = f"{key}: {value}"
    verdict = evaluate_text(text)

    # Auto-ingested memories: QUARANTINE is not stored (same strictness as mail).
    if provenance in _STRICT_AUTO_PROVENANCE and verdict.tier == SignalTier.QUARANTINE:
        label = provenance or "auto"
        return SignalVerdict(SignalTier.REJECT, verdict.score, f"{label}_{verdict.reason}")

    return verdict


def is_prompt_visible(entry: dict[str, Any]) -> bool:
    """Whether a stored memory row should appear in prompts / briefing."""
    if entry.get("archived_at"):
        return False
    if entry.get("source") == "manual":
        return True
    if entry.get("reviewed"):
        return True
    noise = float(entry.get("noise_score") or 0)
    return noise < AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD


def is_recall_visible(entry: dict[str, Any], *, include_unreviewed: bool = False) -> bool:
    """Whether a memory row should appear in search/recall by default."""
    if entry.get("archived_at"):
        return False
    if not include_unreviewed and entry.get("source") == "auto" and not entry.get("reviewed"):
        noise = float(entry.get("noise_score") or 0)
        if noise >= AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD:
            return False
    return True


def is_mail_security_notification(text: str, *, from_addr: str = "") -> bool:
    """True for automated login/security/account alerts — not actionable tasks."""
    combined = f"{from_addr} {text}".strip()
    if len(combined) < 4:
        return False
    return any(pat.search(combined) for pat in _SECURITY_NOTIFICATION_PATTERNS)


def mail_task_allowed(description: str) -> bool:
    """Mail-sourced tasks require ALLOW tier — QUARANTINE and REJECT are dropped."""
    if is_mail_security_notification(description):
        return False
    return evaluate_text(description).tier == SignalTier.ALLOW


def auto_memory_visibility_sql() -> str:
    """SQL fragment: hide archived and noisy unreviewed auto-memories."""
    threshold = AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD
    return (
        "archived_at IS NULL AND NOT "
        f"(source='auto' AND reviewed=0 AND noise_score >= {threshold})"
    )
