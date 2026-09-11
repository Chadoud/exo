"""Briefing section registry: fetch specs and spoken turn formatters."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from signal_quality.constants import GMAIL_NOISE_QUERY_EXCLUSIONS

# ── City extractor ─────────────────────────────────────────────────────────────

_CITY_RE = re.compile(
    r'\b(?:weather|météo|meteo|wetter)\s+(?:for|in|de|à|a|für|fur)\s+'
    r'([A-Za-zÀ-ÿ\s\-]{2,30}?)(?:\s*,|\s*\.|\s+and\b|\s+get\b|$)',
    re.IGNORECASE,
)


def _extract_city(routine: str) -> str | None:
    """
    Extract an explicit city name from the startup routine string.

    Matches patterns like "weather for Geneva", "météo à Genève", "weather in Zurich".
    Returns None when no city is found so the weather step is skipped.
    """
    match = _CITY_RE.search(routine)
    return match.group(1).strip() if match else None


# ── Low-level text helpers ────────────────────────────────────────────────────

def _truncate_briefing_field(text: str, max_len: int) -> str:
    """Single-line-ish truncation for briefing text injected into session turns."""
    cleaned = " ".join(str(text).split())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1] + "…"


def _format_calendar_event_lines(events: list[dict], *, max_events: int = 12) -> list[str]:
    lines: list[str] = []
    for ev in events[:max_events]:
        summary = _truncate_briefing_field(
            str(ev.get("summary") or ev.get("subject") or ev.get("title") or "(no title)"),
            90,
        )
        start = ev.get("start") or ev.get("startDateTime") or ""
        start_s = _truncate_briefing_field(str(start), 40) if start else ""
        lines.append(f"- {summary} @ {start_s}" if start_s else f"- {summary}")
    return lines


def _format_mail_detail_lines(messages: list[dict], provider_label: str) -> list[str]:
    """
    Sender + subject + a short body preview per message.

    The preview is included so the voice model can understand what each email is
    about and summarise it in one short spoken sentence, rather than reading the
    raw sender and subject verbatim.
    """
    if not messages:
        return []
    lines = [f"{provider_label} (raw data for you to summarise — see directive above):"]
    for i, m in enumerate(messages[:10], 1):
        subj = _truncate_briefing_field(str(m.get("subject") or "(no subject)"), 120)
        from_raw = m.get("from")
        if isinstance(from_raw, dict):
            from_s = str(from_raw.get("emailAddress", {}).get("address", "") or "")
        else:
            from_s = str(from_raw or "")
        from_s = _truncate_briefing_field(from_s, 100)
        # Gmail exposes "snippet"; Microsoft Graph exposes "preview" (bodyPreview).
        preview_raw = m.get("snippet") or m.get("preview") or ""
        preview = _truncate_briefing_field(str(preview_raw), 220)
        line = f"  {i}. From: {from_s} — Subject: {subj}"
        if preview:
            line += f" — Preview: {preview}"
        lines.append(line)
    return lines


def _resolve_greeting(routine: str) -> str | None:
    """Return a time-appropriate greeting string if the routine requests one."""
    lower = routine.lower()
    if not any(k in lower for k in (
        "greet", "good morning", "good afternoon", "good evening",
        "hello sir", "morning sir", "afternoon sir", "bonjour", "hallo", "ciao",
    )):
        return None
    hour = datetime.now().hour
    if 5 <= hour < 12:
        return "Good morning sir"
    if 12 <= hour < 18:
        return "Good afternoon sir"
    return "Good evening sir"


# ── Section registry ──────────────────────────────────────────────────────────
#
# Single source of truth for every briefing section:
#   keywords     — substrings that, if found in the routine, activate this section
#   needs_token  — True → waits for OAuth tokens before launching the fetch
#   build        — returns [(sublabel, tool_name, params)] for this section
#   fmt          — formats {sublabel: result_dict} into an atomic [BRIEFING: X] turn


@dataclass(frozen=True)
class _SectionSpec:
    keywords: tuple[str, ...]
    needs_token: bool
    build: Callable[[str], list[tuple[str, str, dict]]]
    fmt: Callable[[dict[str, dict], str | None, str], str | None]


def _build_news_fetch(routine: str) -> list[tuple[str, str, dict]]:
    return [("news", "web_search", {
        "query": "top news today",
        "mode": "news",
        "max_results": 3,
        "depth": "snippet",
    })]


def _fmt_news(results: dict[str, dict], city: str | None, routine: str) -> str | None:
    r = results.get("news", {})
    data = r.get("data", {})
    snippet = (data.get("snippet") or "").strip()
    if not snippet:
        raw = data.get("results") or []
        snippet = "\n".join(
            f"- {(item.get('title') or '').strip()}"
            for item in raw[:5]
            if (item.get("title") or "").strip()
        )
    if not snippet:
        return None
    return (
        "[BRIEFING: NEWS — understand these headlines and give the user the gist in 1-3 natural spoken sentences.\n"
        "Lead with the most important or interesting story. Group related stories. Skip filler, sport scores, or "
        "purely local items unless they are clearly significant. Do NOT read the list verbatim. "
        "Do NOT greet the user or say good morning/evening/sir — they were already greeted. "
        "Start directly with the news, no preamble like 'here is the news'. "
        "Do NOT call any tools. Only mention what is in the data below.]\n"
        + snippet
        + "\n[/BRIEFING: NEWS]"
    )


def _build_weather_fetch(routine: str) -> list[tuple[str, str, dict]]:
    city = _extract_city(routine)
    if not city:
        return []
    return [("weather", "weather_report", {"city": city})]


def _fmt_weather(results: dict[str, dict], city: str | None, routine: str) -> str | None:
    r = results.get("weather", {})
    summary = r.get("data", {}).get("summary", "").strip()
    if not summary:
        return None
    label = f"WEATHER ({city})" if city else "WEATHER"
    return (
        f"[BRIEFING: {label} — present this naturally in one sentence as if you're telling a friend the weather. "
        "Do NOT greet again or add preamble — just say the weather directly. "
        "Do NOT call any tools. Only use the data below.]\n"
        + summary
        + f"\n[/BRIEFING: {label}]"
    )


def _build_calendar_fetch(routine: str) -> list[tuple[str, str, dict]]:
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    day_end = now.replace(hour=23, minute=59, second=59, microsecond=0).isoformat()
    params = {"operation": "list_calendar_events", "time_min": day_start, "time_max": day_end, "max_results": 10}
    return [
        ("google_cal", "google_workspace", params),
        ("ms_cal", "microsoft_graph", params),
    ]


def _fmt_calendar(results: dict[str, dict], city: str | None, routine: str) -> str | None:
    parts: list[str] = []
    for sublabel, provider in (("google_cal", "Google Calendar"), ("ms_cal", "Microsoft Calendar")):
        r = results.get(sublabel, {})
        events = r.get("data", {}).get("events", [])
        if events:
            parts.append(
                f"{provider} ({len(events)} event(s) today — read each line):\n"
                + "\n".join(_format_calendar_event_lines(events))
            )
    if not parts:
        return None
    body = "\n".join(parts)
    return (
        "[BRIEFING: CALENDAR — tell the user about today's schedule conversationally in 1-3 sentences.\n"
        "Highlight the most important events (work meetings, deadlines, appointments). "
        "If there is nothing notable, say so briefly. Use the exact times from the data below — do not invent or shift times. "
        "Do NOT greet again or add preamble — go straight into the schedule. "
        "Do NOT call any tools. Only mention events present in the data below.]\n"
        + body
        + "\n[/BRIEFING: CALENDAR]"
    )


def _build_mail_fetch(routine: str) -> list[tuple[str, str, dict]]:
    gmail_query = f"in:inbox is:unread {GMAIL_NOISE_QUERY_EXCLUSIONS}"
    return [
        ("gmail", "google_workspace", {"operation": "search_mail", "query": gmail_query, "max_results": 20}),
        ("outlook", "microsoft_graph", {"operation": "search_mail", "query": "isRead:false", "max_results": 8}),
    ]


def _fmt_mail(results: dict[str, dict], city: str | None, routine: str) -> str | None:
    mail_lines: list[str] = []
    if "gmail" in results:
        msgs = results["gmail"].get("data", {}).get("messages", [])
        mail_lines.extend(_format_mail_detail_lines(msgs, "Gmail"))
    if "outlook" in results:
        msgs = results["outlook"].get("data", {}).get("messages", [])
        mail_lines.extend(_format_mail_detail_lines(msgs, "Outlook"))
    if not mail_lines:
        return None
    # Check if tasks/reminders were also requested — add a note
    rlow = routine.lower()
    if any(k in rlow for k in ("pending task", "todo", "to-do", "reminder", "google task")):
        mail_lines.append(
            "(Note: no separate task-list pre-fetch — mention tasks only if "
            "calendar events above qualify as standalone tasks.)"
        )
    return (
        "[BRIEFING: MAIL — do NOT read these verbatim and do NOT call any tools.\n"
        "Understand what each email is actually about using the subject and preview. "
        "Then give the user a concise spoken summary: lead with anything that needs action "
        "(payment due, meeting request, important message from a real person), "
        "group obvious newsletters/promotions in one dismissive sentence, skip pure automated noise. "
        "Aim for 2-4 spoken sentences total — never a line-by-line reading. "
        "Do NOT greet again or add preamble — go straight into the email summary. "
        "Only mention emails present in the data below; never invent senders, subjects, or content.]\n"
        + "\n".join(mail_lines)
        + "\n[/BRIEFING: MAIL]"
    )


# Ordered mapping — iteration order defines spoken order.
SECTION_REGISTRY: dict[str, _SectionSpec] = {
    "news": _SectionSpec(
        keywords=("news", "headline", "actualit", "nachrichten", "nouvelles"),
        needs_token=False,
        build=_build_news_fetch,
        fmt=_fmt_news,
    ),
    "weather": _SectionSpec(
        keywords=("weather", "météo", "meteo", "wetter", "climat"),
        needs_token=False,
        build=_build_weather_fetch,
        fmt=_fmt_weather,
    ),
    "calendar": _SectionSpec(
        keywords=("calendar", "event", "agenda", "task", "schedule", "meeting", "tâche", "tache"),
        needs_token=True,
        build=_build_calendar_fetch,
        fmt=_fmt_calendar,
    ),
    "mail": _SectionSpec(
        keywords=("email", "mail", "gmail", "unread", "message", "inbox", "outlook"),
        needs_token=True,
        build=_build_mail_fetch,
        fmt=_fmt_mail,
    ),
}
