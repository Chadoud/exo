"""Blackboard: the agent's shared working memory for a single task.

The planner, executors, and critic all read and write here. It holds the goal,
the current plan, each step's result, and a running log — and renders a compact
text view that gets injected into prompts so every agent reasons from the same
up-to-date state.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

# A step's raw output is already capped at 1500 chars when it's recorded
# (see orchestrator/agents.py _run_step). Re-truncating to 200 chars here used
# to silently starve any goal that needs to reason over a full result (e.g.
# "count the unique names across these 20 calendar events") — the model would
# never see more than the first couple of entries. Match the storage cap so
# rendering doesn't lose data that was already kept.
_PER_STEP_CONTEXT_CHARS = 1500
# Bounds total prompt size across all recorded steps (plan budget caps at 12
# steps); 12000 chars (~3k tokens) comfortably fits every provider Conductor
# routes to without materially affecting latency/cost.
_DEFAULT_CONTEXT_MAX_CHARS = 12000


@dataclass
class Step:
    """One planned unit of work."""

    id: int
    description: str
    kind: str  # "reason" | "tool"
    tool: str | None = None
    args: dict[str, Any] = field(default_factory=dict)
    success_check: str = ""


@dataclass
class StepResult:
    """Outcome of executing a step."""

    step_id: int
    ok: bool
    output: str
    critic_ok: bool | None = None
    critic_feedback: str = ""


class Blackboard:
    """Mutable working memory for one orchestrated task."""

    def __init__(self, goal: str) -> None:
        self.goal = goal
        self.facts: dict[str, str] = {}
        self.plan: list[Step] = []
        self.results: list[StepResult] = []
        self.log: list[str] = []

    def note(self, message: str) -> None:
        self.log.append(message)

    def add_fact(self, key: str, value: str) -> None:
        self.facts[key] = value

    def set_plan(self, steps: list[Step]) -> None:
        self.plan = steps
        self.note(f"planned {len(steps)} step(s)")

    def record(self, result: StepResult) -> None:
        self.results.append(result)
        self.note(f"step {result.step_id}: {'ok' if result.ok else 'failed'}")

    def render_context(self, *, max_chars: int = _DEFAULT_CONTEXT_MAX_CHARS) -> str:
        """Compact text snapshot for prompting the agents."""
        lines: list[str] = [f"Goal: {self.goal}"]
        if self.facts:
            lines.append("Known facts:")
            lines.extend(f"- {k}: {v}" for k, v in self.facts.items())
        if self.results:
            lines.append("Results so far:")
            for r in self.results:
                status = "ok" if r.ok else "failed"
                lines.append(f"- step {r.step_id} [{status}]: {r.output[:_PER_STEP_CONTEXT_CHARS]}")
        text = "\n".join(lines)
        return text[:max_chars]

    def summary(self) -> dict[str, Any]:
        """Machine-readable snapshot for the tool result / API response."""
        return {
            "goal": self.goal,
            "facts": dict(self.facts),
            "steps": [
                {"id": r.step_id, "ok": r.ok, "output": r.output[:500],
                 "critic_ok": r.critic_ok, "critic_feedback": r.critic_feedback}
                for r in self.results
            ],
            "log": list(self.log),
        }


def parse_plan(raw: Any) -> list[Step]:
    """Coerce a model's JSON plan into typed ``Step`` objects (best-effort, safe)."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    items = raw.get("steps") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        return []
    steps: list[Step] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "reason").strip().lower()
        if kind not in ("reason", "tool"):
            kind = "reason"
        args = item.get("args")
        steps.append(
            Step(
                id=int(item.get("id") or index + 1),
                description=str(item.get("description") or "").strip(),
                kind=kind,
                tool=(str(item["tool"]).strip() if item.get("tool") else None),
                args=args if isinstance(args, dict) else {},
                success_check=str(item.get("success_check") or "").strip(),
            )
        )
    return steps
