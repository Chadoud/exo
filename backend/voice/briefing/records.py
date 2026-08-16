"""Closed briefing section outcomes for the chat record (no fetch payloads)."""

from __future__ import annotations

from voice.briefing.sections import SECTION_REGISTRY

# Wire values — must stay a closed enum (no error strings / subjects).
SECTION_RECORD_OUTCOMES = frozenset(
    {
        "skipped_fail",
        "skipped_reconnect",
        "nothing",
        "aborted",
        "dropped",
    }
)

_TASK_ROUTINE_KEYWORDS = (
    "pending task",
    "todo",
    "to-do",
    "to do",
    "reminder",
    "google task",
    "task",
    "tâche",
    "tache",
)


def routine_requests_tasks(routine: str) -> bool:
    """True when the saved routine asked for tasks (not a briefing section)."""
    lower = routine.lower()
    return any(keyword in lower for keyword in _TASK_ROUTINE_KEYWORDS)


def requested_section_labels(section_sublabels: dict[str, list[str]]) -> list[str]:
    """Registry order, only sections this routine selected."""
    return [label for label in SECTION_REGISTRY if label in section_sublabels]


def remaining_section_labels(requested: list[str], from_label: str) -> list[str]:
    """from_label and every requested section after it."""
    if from_label not in requested:
        return []
    start = requested.index(from_label)
    return requested[start:]


def briefing_outcome_injection(label: str, outcome: str) -> str | None:
    """
    Short Gemini speak line for skip / nothing-to-report.

    Abort / drop return None — the user already has the floor.
    Copy is static. Never interpolate fetch results.
    """
    if outcome not in SECTION_RECORD_OUTCOMES:
        return None
    if outcome in ("aborted", "dropped"):
        return None

    if outcome == "nothing":
        spoken = {
            "news": "No headlines to share right now.",
            "weather": "I didn't have the weather.",
            "calendar": "Nothing on the calendar to mention.",
            "mail": "No unread mail to mention.",
        }.get(label, "Nothing to mention for this part.")
    elif outcome == "skipped_reconnect":
        what = "calendar" if label == "calendar" else "unread mail" if label == "mail" else label
        spoken = (
            f"I couldn't reach your {what} — the account may need reconnecting in "
            "Settings, External sources."
        )
    else:
        what = "calendar" if label == "calendar" else "unread mail" if label == "mail" else label
        spoken = f"I couldn't reach your {what} right now."

    return (
        f"[BRIEFING: {label.upper()} SKIP — say exactly this once, briefly, then continue: "
        f'"{spoken}" Do NOT call any tools or add anything else.]'
    )
