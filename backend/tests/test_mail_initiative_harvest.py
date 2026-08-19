"""Harvest: metadata pass, then compose; caps, noise skips, interval, no Gmail when gated."""

from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from mail_initiative import harvest, store
from mail_initiative.gmail_api import _META_HEADERS, HarvestRateLimited, get_thread_metadata


def _compose(_text: str, subject: str) -> tuple[str, str]:
    return (f"Re: {subject}"[:200], "See you then.")


def _full(tid: str, *, text: str = "Can we meet tomorrow at noon to go over the plan?", last_id: str = "m1") -> dict:
    data = base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")
    return {
        "id": tid,
        "messages": [
            {
                "id": last_id,
                "labelIds": ["INBOX"],
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


def _thread(
    thread_id: str,
    *,
    from_addr: str,
    subject: str,
    last_id: str = "m1",
    labels: list[str] | None = None,
    reply_to: str = "",
    extra_ids: list[str] | None = None,
    extra_headers: dict[str, str] | None = None,
) -> dict:
    headers = [
        {"name": "From", "value": from_addr},
        {"name": "Subject", "value": subject},
    ]
    if reply_to:
        headers.append({"name": "Reply-To", "value": reply_to})
    for name, value in (extra_headers or {}).items():
        headers.append({"name": name, "value": value})
    messages = []
    for mid in extra_ids or []:
        messages.append({"id": mid, "payload": {"headers": headers}, "labelIds": labels or []})
    messages.append({"id": last_id, "payload": {"headers": headers}, "labelIds": labels or []})
    return {"id": thread_id, "messages": messages, "snippet": "SECRET_BODY"}


@pytest.fixture
def mail_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("EXOSITES_DISABLE_GMAIL_READY_REPLIES", raising=False)
    return tmp_path


@pytest.fixture
def _ungated(monkeypatch):
    monkeypatch.setattr(harvest, "gated_reason", lambda: None)


def test_harvest_skips_last_from_me(mail_dir, _ungated):
    calls = {"list": 0, "get": 0}

    def list_ids(query: str, max_results: int) -> list[str]:
        calls["list"] += 1
        assert max_results <= 8
        assert "newer_than:7d" in query
        assert "-category:updates" not in query
        assert "-category:promotions" in query
        return ["t1"]

    def get_meta(tid: str) -> dict:
        calls["get"] += 1
        return _thread(tid, from_addr="Me <me@exosites.ch>", subject="Re: Hello")

    out = harvest.run_harvest(
        list_ids=list_ids, get_meta=get_meta, profile=lambda: "me@exosites.ch", force=True
    )
    assert out["created"] == 0
    assert store.list_candidates() == []
    assert calls["list"] == 1
    assert calls["get"] == 1


def test_harvest_skips_noreply_and_promo(mail_dir, _ungated):
    threads = {
        "t-noreply": _thread("t-noreply", from_addr="noreply@brand.com", subject="Hi"),
        "t-promo": _thread(
            "t-promo",
            from_addr="Ada <ada@example.com>",
            subject="Lunch?",
            labels=["CATEGORY_PROMOTIONS"],
        ),
        "t-ok": _thread("t-ok", from_addr="Ada Lovelace <ada@example.com>", subject="Lunch tomorrow?"),
    }

    out = harvest.run_harvest(
        list_ids=lambda _q, _n: list(threads),
        get_meta=lambda tid: threads[tid],
        get_full=lambda tid: _full(tid),
        compose=_compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 1
    items = store.list_candidates(drafted_only=True)
    assert len(items) == 1
    assert items[0]["from_email"] == "ada@example.com"
    assert items[0]["from_name"] == "Ada Lovelace"
    assert items[0]["draft_body"] == "See you then."
    assert "SECRET_BODY" not in str(items[0])
    raw = (mail_dir / "mail_replies.sqlite").read_bytes()
    assert b"SECRET_BODY" not in raw


def test_harvest_caps_three_and_five_gets(mail_dir, _ungated):
    gets: list[str] = []

    def get_meta(tid: str) -> dict:
        gets.append(tid)
        return _thread(tid, from_addr=f"P{tid} <p{tid}@example.com>", subject=f"Q {tid}")

    ids = [f"t{i}" for i in range(8)]
    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ids,
        get_meta=get_meta,
        get_full=lambda tid: _full(tid),
        compose=_compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 3
    assert len(gets) <= 5
    assert len(store.list_candidates(drafted_only=True)) == 3


def test_harvest_honors_14_day_dismiss(mail_dir, _ungated):
    store.dismiss_thread("t-silent")
    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-silent"],
        get_meta=lambda tid: _thread(tid, from_addr="Ada <ada@example.com>", subject="Hi"),
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 0
    assert store.list_candidates() == []


def test_harvest_interval_skips_gmail(mail_dir, _ungated):
    store.set_last_harvest_at(datetime.now(UTC) - timedelta(minutes=5))
    called = {"n": 0}

    def list_ids(_q: str, _n: int) -> list[str]:
        called["n"] += 1
        return []

    out = harvest.run_harvest(list_ids=list_ids, get_meta=lambda _t: {}, profile=lambda: "me@x.com")
    assert out["skipped"] == "interval"
    assert called["n"] == 0


def test_harvest_429_aborts_tick(mail_dir, _ungated):
    def get_meta(_tid: str) -> dict:
        raise HarvestRateLimited()

    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t1", "t2"],
        get_meta=get_meta,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["skipped"] == "rate_limited"
    assert store.last_harvest_at() is not None


def test_harvest_kill_switch_zero_gmail(mail_dir, monkeypatch):
    monkeypatch.setenv("EXOSITES_DISABLE_GMAIL_READY_REPLIES", "1")
    called = {"n": 0}

    def list_ids(_q: str, _n: int) -> list[str]:
        called["n"] += 1
        return ["t1"]

    out = harvest.run_harvest(
        list_ids=list_ids, get_meta=lambda _t: {}, profile=lambda: "me@x.com", force=True
    )
    assert out["skipped"] == "disabled"
    assert called["n"] == 0


def test_harvest_toggle_off_zero_gmail(mail_dir, monkeypatch):
    monkeypatch.setattr("entitlement_gate.may_use_proactive", lambda: (True, None))
    monkeypatch.setattr("mail_initiative.settings.has_send_scope", lambda: True)
    store.set_setting("enabled", "false")
    called = {"n": 0}
    out = harvest.run_harvest(
        list_ids=lambda *_a: called.__setitem__("n", 1) or [],
        get_meta=lambda _t: {},
        profile=lambda: "me@x.com",
        force=True,
    )
    assert out["skipped"] == "toggle_off"
    assert called["n"] == 0


def test_replace_keeps_live_draft_thread(mail_dir):
    store.upsert_candidate(
        thread_id="keep-me",
        message_ids=["m1"],
        last_message_id="m1",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Hi",
    )
    cand = store.list_candidates()[0]
    store.save_draft_token(
        token="tok-live",
        candidate_id=cand["id"],
        thread_id="keep-me",
        in_reply_to="",
        references_hdr="",
        to_email="ada@example.com",
        to_name="Ada",
        last_message_id="m1",
        message_ids=["m1"],
    )
    store.replace_candidates([])
    left = store.list_candidates()
    assert len(left) == 1
    assert left[0]["thread_id"] == "keep-me"


def test_metadata_request_asks_for_list_headers():
    assert "List-Unsubscribe" in _META_HEADERS
    assert "List-Id" in _META_HEADERS


@patch("mail_initiative.gmail_api.try_get_token", return_value="tok")
@patch("mail_initiative.gmail_api.httpx.get")
def test_get_thread_metadata_repeats_list_headers(mock_get, _token):
    mock_get.return_value = MagicMock(status_code=200)
    mock_get.return_value.json.return_value = {"id": "t1", "messages": []}
    get_thread_metadata("t1")
    params = mock_get.call_args.kwargs["params"]
    assert ("format", "metadata") in params
    names = [value for key, value in params if key == "metadataHeaders"]
    assert names[0] == "From"
    assert "List-Unsubscribe" in names
    assert "List-Id" in names
    assert "Precedence" in names
    assert all(key != "metadataHeaders" or isinstance(value, str) for key, value in params)


def test_harvest_skips_list_unsubscribe_updates(mail_dir, _ungated):
    thread = _thread(
        "t-list",
        from_addr="Allen <hello@brand.example>",
        subject="Meet the Super Sync Chrome Extension",
        labels=["INBOX", "CATEGORY_UPDATES"],
        extra_headers={"List-Unsubscribe": "<https://example.com/unsub>"},
    )
    called = {"full": 0}

    def get_full(_tid: str) -> dict:
        called["full"] += 1
        return _full("t-list")

    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-list"],
        get_meta=lambda _t: thread,
        get_full=get_full,
        compose=_compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 0
    assert out["drops"].get("list") == 1
    assert called["full"] == 0
    assert store.list_candidates(drafted_only=True) == []


def test_harvest_includes_updates_tab_personal(mail_dir, _ungated):
    thread = _thread(
        "t-upd",
        from_addr="Ada <ada@example.com>",
        subject="Are you free Thursday?",
        labels=["INBOX", "CATEGORY_UPDATES"],
    )
    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-upd"],
        get_meta=lambda _t: thread,
        get_full=lambda tid: _full(tid),
        compose=_compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 1
    assert out["drops"] == {}
    assert store.list_candidates(drafted_only=True)[0]["from_email"] == "ada@example.com"


def test_harvest_keeps_unscanned_drafted(mail_dir, _ungated):
    store.remember_mailbox("me@exosites.ch")
    store.upsert_candidate(
        thread_id="t-old",
        message_ids=["m0"],
        last_message_id="m0",
        from_name="Bea",
        from_email="bea@example.com",
        subject="Earlier",
        draft_subject="Re: Earlier",
        draft_body="Saved draft.",
    )
    out = harvest.run_harvest(
        list_ids=lambda _q, _n: ["t-new"],
        get_meta=lambda _t: _thread("t-new", from_addr="Me <me@exosites.ch>", subject="Re: Hi"),
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    assert out["created"] == 0
    left = store.list_candidates(drafted_only=True)
    assert len(left) == 1
    assert left[0]["thread_id"] == "t-old"


def test_harvest_drops_cards_when_mailbox_changes(mail_dir, _ungated):
    store.remember_mailbox("old@example.com")
    store.upsert_candidate(
        thread_id="t-old-box",
        message_ids=["m0"],
        last_message_id="m0",
        from_name="Bea",
        from_email="bea@old.example",
        subject="Earlier",
        draft_subject="Re: Earlier",
        draft_body="Saved draft.",
    )
    store.set_last_harvest_at(datetime.now(UTC) - timedelta(minutes=2))
    listed = {"n": 0}

    def list_ids(_q: str, _n: int) -> list[str]:
        listed["n"] += 1
        return []

    out = harvest.run_harvest(
        list_ids=list_ids,
        get_meta=lambda _t: {},
        profile=lambda: "new@example.com",
    )
    assert store.list_candidates() == []
    assert listed["n"] == 1
    assert out["skipped"] is None


def test_harvest_first_seen_mailbox_drops_leftover_cards(mail_dir, _ungated):
    store.upsert_candidate(
        thread_id="t-pre",
        message_ids=["m0"],
        last_message_id="m0",
        from_name="Bea",
        from_email="bea@old.example",
        subject="Earlier",
        draft_subject="Re: Earlier",
        draft_body="Saved draft.",
    )
    harvest.run_harvest(
        list_ids=lambda _q, _n: [],
        get_meta=lambda _t: {},
        profile=lambda: "new@example.com",
        force=True,
    )
    assert store.list_candidates() == []


def test_reply_to_locks_recipient(mail_dir, _ungated):
    thread = _thread(
        "t1",
        from_addr="Ada <ada@example.com>",
        subject="Hi",
        reply_to="Ada Desk <desk@example.com>",
    )
    harvest.run_harvest(
        list_ids=lambda _q, _n: ["t1"],
        get_meta=lambda _t: thread,
        get_full=lambda _t: _full("t1"),
        compose=_compose,
        profile=lambda: "me@exosites.ch",
        force=True,
    )
    item = store.list_candidates(drafted_only=True)[0]
    assert item["from_email"] == "desk@example.com"
