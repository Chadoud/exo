"""Admit or refuse a proposed tool based on the artifact it can produce.

The model proposes. This module is the door: admit, redirect, or refuse.
It does not treat create/build/make as enough to open Codegen Studio.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

AdmitAction = Literal["admit", "redirect", "refuse"]
WantedArtifact = Literal["web_app", "video", "advice", "status", "ambiguous", "not_software"]

_HEAVY_TOOLS = frozenset({"start_codegen_studio", "plan_and_execute", "dev_scaffold_project"})
_CODEGEN_TOOLS = frozenset({"start_codegen_studio", "dev_scaffold_project"})

_HOW_TO_RE = re.compile(
    r"\b(?:how\s+can\s+i|how\s+do\s+i|how\s+to|comment\s+(?:puis-je|faire)|"
    r"wie\s+(?:kann|mache)|come\s+(?:posso|si\s+fa))\b",
    re.IGNORECASE,
)
_STATUS_RE = re.compile(
    r"\b(?:where\s+is|where'?s|what\s+happened|did\s+you\s+(?:make|finish|create)|"
    r"où\s+est|wo\s+ist|dov'?è)\b",
    re.IGNORECASE,
)
_COMPLAINT_NOT_CODE_RE = re.compile(
    r"\b(?:not\s+(?:a\s+)?(?:fucking\s+)?code|it'?s\s+a\s+video|"
    r"pas\s+(?:du\s+)?code|kein\s+code|non\s+(?:è\s+)?(?:un\s+)?codice)\b",
    re.IGNORECASE,
)
_CREATE_MEDIA_RE = re.compile(
    r"\b(?:create|make|generate|produce|render|export|film|shoot|need)\b"
    r"[\s\S]{0,80}\b(?:videos?|clips?|reels?|shorts?|tiktoks?|footage|films?)\b",
    re.IGNORECASE,
)
_MEDIA_FOR_SOFTWARE_RE = re.compile(
    r"\b(?:videos?|clips?|reels?)\b[\s\S]{0,48}\b(?:for|pour|für|per)\b"
    r"[\s\S]{0,48}\b(?:app|site|website|social)\b",
    re.IGNORECASE,
)
_APP_MEDIA_RE = re.compile(r"\bapp(?:lication)?\s+(?:videos?|clips?|reels?)\b", re.IGNORECASE)
_SOFTWARE_STACK_RE = re.compile(
    r"\b(?:react|typescript|tailwind|vite|next\.?js|vue|svelte|angular|"
    r"landing\s+page|web\s+app|website|html\s+page|app\.tsx|codebase)\b",
    re.IGNORECASE,
)
_MEDIA_AS_FEATURE_RE = re.compile(
    r"\b(?:video|clip)\s+(?:player|editor|app|site|website|platform|tool)\b",
    re.IGNORECASE,
)
_CREATE_SOFTWARE_RE = re.compile(
    r"\b(?:create|build|make|scaffold|implement)\b[\s\S]{0,80}\b"
    r"(?:website|web\s+app|landing\s+page|react|vue|svelte|next\.?js|"
    r"(?:an?|the|my|our|cool)\s+app(?:lication)?)\b(?!\s+video)",
    re.IGNORECASE,
)
_MEDIA_NOUN_RE = re.compile(
    r"\b(?:videos?|clips?|reels?|shorts?|tiktoks?|footage|films?)\b",
    re.IGNORECASE,
)
_SHORT_FOLLOW_RE = re.compile(
    r"^(?:do\s+it|go\s+ahead|yes(?:\s+do\s+it)?|yep|yeah|please|now|continue|"
    r"try\s+again|make\s+it(?:\s+happen)?|show\s+(?:me|it)|ok(?:ay)?|sure)"
    r"(?:\s*[.!]*)?$",
    re.IGNORECASE,
)

_USER_COPY = {
    "cannot_produce_video": (
        "I can't make that video. I can write a script or storyboard, "
        "or build a web page if that's what you want."
    ),
    "how_to": "I can explain how — I can't produce that file from here.",
    "status_or_followup": (
        "I don't have that file. I can't make a video here — "
        "I can write a script, or build a web page if you want one."
    ),
    "ambiguous_artifact": "Do you want a video file, or a web app I can build and preview?",
    "not_a_software_artifact": (
        "Codegen Studio builds a web app with a live preview. "
        "Say if you want a page or app built."
    ),
    "prior_refusal": (
        "I still can't make that video. I can write a script, "
        "or build a web page if that's what you want."
    ),
}

_MODEL_HINT = (
    "Reply in the user's language. Do not open or mention Codegen Studio "
    "unless they ask for a web page or app. Do not claim a file was produced."
)


@dataclass(frozen=True)
class LastRefusal:
    """Last admit-door refusal in this voice/chat session."""

    tool: str
    artifact: str
    reason: str


@dataclass(frozen=True)
class AdmitDecision:
    """Result of matching a proposed tool to a wanted artifact."""

    action: AdmitAction
    name: str
    args: dict[str, Any]
    reason: str | None = None
    wanted_artifact: str | None = None
    model_hint: str | None = None
    user_message: str | None = None

    def as_last_refusal(self) -> LastRefusal | None:
        """Session memory for the next turn, or None when the tool may run."""
        if self.action != "refuse" or not self.wanted_artifact:
            return None
        return LastRefusal(
            tool=self.name,
            artifact=self.wanted_artifact,
            reason=self.reason or "refused",
        )


def normalize_codegen_speech_typos(text: str) -> str:
    """Speech-to-text often turns 'app' into 'up'."""
    cleaned = re.sub(r"\b(a|an|the|my|our|some|cool)\s+up\b", r"\1 app", text, flags=re.I)
    return re.sub(r"\bup\s+for\s+(our|the|a|my)\s+demo\b", r"app for \1 demo", cleaned, flags=re.I)


def infer_wanted_artifact(text: str) -> WantedArtifact | None:
    """Return the primary deliverable, or None when the utterance is not a build."""
    speech = normalize_codegen_speech_typos(text.strip())
    if not speech:
        return None
    if _HOW_TO_RE.search(speech):
        return "advice"
    if _STATUS_RE.search(speech):
        return "status"
    if _COMPLAINT_NOT_CODE_RE.search(speech):
        return "video"
    media = bool(
        _CREATE_MEDIA_RE.search(speech)
        or _MEDIA_FOR_SOFTWARE_RE.search(speech)
        or _APP_MEDIA_RE.search(speech)
    )
    software = bool(
        _SOFTWARE_STACK_RE.search(speech)
        or _MEDIA_AS_FEATURE_RE.search(speech)
        or (_CREATE_SOFTWARE_RE.search(speech) and not media)
    )
    if software and media and not _MEDIA_AS_FEATURE_RE.search(speech):
        return "ambiguous"
    if software:
        return "web_app"
    if media:
        return "video"
    return None


def _blocked_by_prior_refusal(
    speech: str,
    last: LastRefusal | None,
    wanted: WantedArtifact | None,
) -> bool:
    if last is None or wanted == "web_app":
        return False
    if last.artifact not in {"video", "ambiguous"}:
        return False
    if wanted in {"video", "ambiguous"}:
        return True
    if wanted == "status" and _MEDIA_NOUN_RE.search(speech):
        return True
    return bool(_SHORT_FOLLOW_RE.match(speech.strip()))


def _refuse(name: str, args: dict[str, Any], reason: str, artifact: str) -> AdmitDecision:
    return AdmitDecision(
        action="refuse",
        name=name,
        args=args,
        reason=reason,
        wanted_artifact=artifact,
        model_hint=_MODEL_HINT,
        user_message=_USER_COPY.get(reason, _USER_COPY["not_a_software_artifact"]),
    )


def _admit(name: str, args: dict[str, Any], wanted: str | None) -> AdmitDecision:
    return AdmitDecision(action="admit", name=name, args=args, wanted_artifact=wanted)


def _redirect_codegen(args: dict[str, Any], goal: str) -> AdmitDecision:
    redirected = dict(args)
    redirected["goal"] = goal
    return AdmitDecision(
        action="redirect",
        name="start_codegen_studio",
        args=redirected,
        reason="plan_to_codegen_studio",
        wanted_artifact="web_app",
    )


def _goal_from_args(name: str, args: dict[str, Any], user_speech: str) -> str:
    if name == "plan_and_execute":
        goal = str(args.get("goal", "")).strip()
        if goal:
            return goal
    if name == "dev_scaffold_project":
        desc = str(args.get("description") or args.get("goal") or "").strip()
        if desc:
            return desc
    studio_goal = str(args.get("goal", "")).strip()
    return studio_goal or user_speech.strip()


def admit_proposed_tool(
    name: str,
    args: dict[str, Any],
    *,
    user_speech: str,
    last_refusal: LastRefusal | None = None,
) -> AdmitDecision:
    """Decide whether a proposed heavy tool may run."""
    merged = dict(args)
    if name not in _HEAVY_TOOLS:
        return _admit(name, merged, None)

    goal = _goal_from_args(name, merged, user_speech)
    speech = normalize_codegen_speech_typos((user_speech or goal).strip())
    wanted = infer_wanted_artifact(speech) or infer_wanted_artifact(goal)

    if _blocked_by_prior_refusal(speech, last_refusal, wanted):
        return _refuse(name, merged, "prior_refusal", wanted or last_refusal.artifact)

    if name in _CODEGEN_TOOLS:
        return _admit_codegen_family(name, merged, goal, wanted)
    return _admit_plan(merged, goal, wanted)


def _admit_codegen_family(
    name: str,
    args: dict[str, Any],
    goal: str,
    wanted: WantedArtifact | None,
) -> AdmitDecision:
    if wanted == "web_app":
        if name == "dev_scaffold_project":
            return _redirect_codegen(args, goal)
        return _admit(name, args, wanted)
    if name == "dev_scaffold_project" and wanted is None:
        return _admit(name, args, wanted)
    return _refuse_for_wanted(name, args, wanted)


def _admit_plan(args: dict[str, Any], goal: str, wanted: WantedArtifact | None) -> AdmitDecision:
    if wanted == "web_app":
        return _redirect_codegen(args, goal)
    if wanted in {"video", "ambiguous"}:
        return _refuse_for_wanted("plan_and_execute", args, wanted)
    if wanted == "advice" and _MEDIA_NOUN_RE.search(goal):
        return _refuse_for_wanted("plan_and_execute", args, wanted)
    return _admit("plan_and_execute", args, wanted)


def _refuse_for_wanted(
    name: str,
    args: dict[str, Any],
    wanted: WantedArtifact | None,
) -> AdmitDecision:
    if wanted == "video":
        return _refuse(name, args, "cannot_produce_video", "video")
    if wanted == "advice":
        return _refuse(name, args, "how_to", "advice")
    if wanted == "status":
        return _refuse(name, args, "status_or_followup", "status")
    if wanted == "ambiguous":
        return _refuse(name, args, "ambiguous_artifact", "ambiguous")
    return _refuse(name, args, "not_a_software_artifact", "not_software")


def refusal_tool_result(decision: AdmitDecision) -> dict[str, Any]:
    """Voice/tool payload when the admit door refuses. Renderer must not launch."""
    reason = decision.reason or "capability_refused"
    return {
        "ok": False,
        "error": reason,
        "hint": decision.model_hint or _MODEL_HINT,
        "data": {
            "action": "refuse",
            "artifact": decision.wanted_artifact,
            "user_message": decision.user_message or _USER_COPY.get(reason),
        },
    }
