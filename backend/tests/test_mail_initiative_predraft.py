"""Pre-draft: skip unchanged LLM, hide undraftable, re-check body snippet."""

from __future__ import annotations

import base64
from unittest.mock import patch

import pytest

from mail_initiative import harvest, store
from mail_initiative.draft import create_draft


def _compose(_text: str, subject: str) -> tuple[str, str]:
    return (f"Re: {subject}"[:200], "See you then.")


def _full(tid: str, *, text: str, last_id: str = "m1", labels: list[str] | None = None) -> dict:
    data = base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")
    return {
        "id": tid,
        "messages": [
            {
                "id": last_id,
                "labelIds": labels or ["INBOX"],
                "payload": {
                    "mimeType": "text/plain",
                    "headers": [
                        {"name": "From", "value": "Ada <ada@example.com>"},
                        {"name": "Subject", "value": "Lunch tomorrow?"},
                    ],
                    "body": {"data": data},
                },
            }
        ],
    }


def _meta(tid: str, *, last_id: str = "m1") -> dict:
    return {
        "id": tid,
        "messages": [
            {
                "id": last_id,
                "labelIds": ["INBOX"],
                "payload": {
                    "headers": [
                        {"name": "From", "value": "Ada Lovelace <ada@example.com>"},
                        {"name": "Subject", "value": "Lunch tomorrow?"},
                    ]
                },
            }
        ],
    }


@pytest.fixture
def mail_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("EXOSITES_DISABLE_GMAIL_READY_REPLIES", raising=False)
    store.remember_mailbox("me@exosites.ch")
    return tmp_path


@pytest.fixture
def ungated(monkeypatch):
    monkeypatch.setattr(harvest, "gated_reason", lambda: None)


def test_unchanged_thread_skips_compose(mail_dir, ungated):
    store.upsert_candidate(
        thread_id="t-ok",
        message_ids=["m1"],
        last_message_id="m1",
        from_name="Ada Lovelace",
        from_email="ada@example.com",
        subject="Lunch tomorrow?",
        draft_subject="Re: Lunch tomorrow?",
        draft_body="Already written.",
    )
    called = {"n": 0}

    def compose(_text: str, _subject: str) -> tuple[str, str]:
        called["n"] += 1
        return ("Re: x", "new")

    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-ok"],
        get_meta=lambda tid: _meta(tid),
        get_full=lambda tid: _full(tid, text="Can we meet tomorrow at noon to go over the plan?"),
        compose=compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 1
    assert called["n"] == 0
    assert store.list_candidates(drafted_only=True)[0]["draft_body"] == "Already written."


def test_reuse_drops_when_meta_snippet_is_list_footer(mail_dir, ungated):
    store.upsert_candidate(
        thread_id="t-ok",
        message_ids=["m1"],
        last_message_id="m1",
        from_name="Ada Lovelace",
        from_email="ada@example.com",
        subject="Lunch tomorrow?",
        draft_subject="Re: Lunch tomorrow?",
        draft_body="Already written.",
    )
    noisy = _meta("t-ok")
    noisy["snippet"] = "You've received this email because you signed up. Unsubscribe."
    called = {"n": 0}

    def compose(_text: str, _subject: str) -> tuple[str, str]:
        called["n"] += 1
        return ("Re: x", "new")

    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-ok"],
        get_meta=lambda _tid: noisy,
        get_full=lambda tid: _full(tid, text="Can we meet tomorrow at noon to go over the plan?"),
        compose=compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 0
    assert called["n"] == 0
    assert store.list_candidates(drafted_only=True) == []


def test_reuse_drops_when_labels_turn_promo(mail_dir, ungated):
    store.upsert_candidate(
        thread_id="t-ok",
        message_ids=["m1"],
        last_message_id="m1",
        from_name="Ada Lovelace",
        from_email="ada@example.com",
        subject="Lunch tomorrow?",
        draft_subject="Re: Lunch tomorrow?",
        draft_body="Already written.",
    )
    promo_meta = _meta("t-ok")
    promo_meta["messages"][0]["labelIds"] = ["INBOX", "CATEGORY_PROMOTIONS"]
    called = {"n": 0}

    def compose(_text: str, _subject: str) -> tuple[str, str]:
        called["n"] += 1
        return ("Re: x", "new")

    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-ok"],
        get_meta=lambda _tid: promo_meta,
        get_full=lambda tid: _full(tid, text="Can we meet tomorrow at noon to go over the plan?"),
        compose=compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 0
    assert called["n"] == 0
    assert store.list_candidates(drafted_only=True) == []


def test_empty_compose_hides_card(mail_dir, ungated):
    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-ok"],
        get_meta=lambda tid: _meta(tid),
        get_full=lambda tid: _full(tid, text="Can we meet tomorrow at noon to go over the plan?"),
        compose=lambda _t, _s: ("Re: Lunch", ""),
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 0
    assert store.list_candidates(drafted_only=True) == []


def test_thin_thread_hides_card(mail_dir, ungated):
    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-ok"],
        get_meta=lambda tid: _meta(tid),
        get_full=lambda tid: _full(tid, text="ok"),
        compose=_compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 0
    assert store.list_candidates(drafted_only=True) == []


def test_list_footer_hides_card(mail_dir, ungated):
    padding = "Please tell us which artists you want on stage next year. "
    footer = "Vous recevez cet e-mail parce que vous etes abonne. Se desinscrire."
    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-ok"],
        get_meta=lambda tid: _meta(tid),
        get_full=lambda tid: _full(tid, text=padding * 20 + footer),
        compose=_compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 0
    assert store.list_candidates(drafted_only=True) == []


def test_promo_body_snippet_hides_card(mail_dir, ungated):
    promo = "Exclusive offer — 50% off this weekend only. Unsubscribe anytime."
    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-ok"],
        get_meta=lambda tid: _meta(tid),
        get_full=lambda tid: _full(tid, text=promo),
        compose=_compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 0
    assert store.list_candidates(drafted_only=True) == []


def test_create_draft_uses_saved_body_no_llm(mail_dir):
    row = store.upsert_candidate(
        thread_id="thr-1",
        message_ids=["m1"],
        last_message_id="m1",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Lunch?",
        draft_subject="Re: Lunch?",
        draft_body="Saved reply.",
    )
    thread = _full("thr-1", text="Can we meet tomorrow at noon to go over the plan?", last_id="m1")
    with (
        patch("mail_initiative.gmail_api.get_thread_full", return_value=thread),
        patch("mail_initiative.draft.compose_reply") as compose,
    ):
        data = create_draft(int(row["id"]))
    compose.assert_not_called()
    assert data["body"] == "Saved reply."
    assert data["draft_token"]
    assert data["to_email"] == "ada@example.com"
