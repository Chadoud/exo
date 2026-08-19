"""Join drafted ready-replies onto mail tasks by message id."""

from mail_initiative import store
from mail_initiative.task_join import attach_mail_reply_ids, reply_id_for_external_id


def test_reply_id_matches_gmail_message(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    store.remember_mailbox("me@example.com")
    row = store.upsert_candidate(
        thread_id="thr-1",
        message_ids=["mid-a", "mid-b"],
        last_message_id="mid-b",
        from_name="Ada",
        from_email="ada@example.com",
        subject="Lunch?",
        draft_subject="Re: Lunch?",
        draft_body="Noon works.",
    )
    assert reply_id_for_external_id("gmail:mail:mid-b") == int(row["id"])
    assert reply_id_for_external_id("gmail:mail:mid-a") == int(row["id"])
    assert reply_id_for_external_id("gmail:mail:other") is None
    assert reply_id_for_external_id("google-calendar:cal:evt") is None


def test_attach_mail_reply_ids_skips_non_mail() -> None:
    tasks = [{"id": 1, "external_id": None, "source": "manual"}]
    attach_mail_reply_ids(tasks)
    assert "mail_reply_id" not in tasks[0]
