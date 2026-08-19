"""Approval gating for tool_registry.dispatch_sync (M3.1)."""

from __future__ import annotations

from tool_registry.dispatch import dispatch_sync
from tool_registry.risk_tiers import APPROVAL_TOOLS


def test_send_message_denied_without_approval():
    result = dispatch_sync("send_message", {"channel": "slack", "text": "hi"}, approval_granted=False)
    assert result["ok"] is False
    assert "approval" in result["error"].lower()


def test_send_message_passes_approval_gate_when_granted(monkeypatch):
    monkeypatch.setitem(
        __import__("tool_registry.dispatch", fromlist=["HANDLERS"]).HANDLERS,
        "send_message",
        lambda _args: {"ok": True, "data": {"sent": True}},
    )
    result = dispatch_sync("send_message", {"channel": "slack", "text": "hi"}, approval_granted=True)
    assert result["ok"] is True


def test_send_mail_blocked_when_unpaid(monkeypatch):
    monkeypatch.setattr(
        "entitlement_gate.may_use_proactive",
        lambda: (False, "trial_expired"),
    )
    result = dispatch_sync(
        "google_workspace",
        {"operation": "send_mail", "to": "me", "body": "hi"},
        approval_granted=True,
    )
    assert result["ok"] is False
    assert "paused" in str(result.get("error", "")).lower()


def test_approval_tools_include_write_connectors():
    for name in (
        "send_message",
        "google_workspace",
        "slack_messaging",
        "write_project_files",
        "run_google_drive_workspace_sort",
    ):
        assert name in APPROVAL_TOOLS
