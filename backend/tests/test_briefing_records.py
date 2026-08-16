from voice.briefing.records import (
    SECTION_RECORD_OUTCOMES,
    briefing_outcome_injection,
    remaining_section_labels,
    requested_section_labels,
    routine_requests_tasks,
)


def test_section_record_outcomes_are_closed():
    assert SECTION_RECORD_OUTCOMES == {
        "skipped_fail",
        "skipped_reconnect",
        "nothing",
        "aborted",
        "dropped",
    }


def test_routine_requests_tasks():
    assert routine_requests_tasks("news, weather, pending tasks, mail") is True
    assert routine_requests_tasks("news and weather for Geneva") is False


def test_requested_and_remaining_labels_follow_registry_order():
    requested = requested_section_labels(
        {"mail": ["gmail"], "news": ["news"], "calendar": ["google_cal"]}
    )
    assert requested == ["news", "calendar", "mail"]
    assert remaining_section_labels(requested, "calendar") == ["calendar", "mail"]


def test_skip_injection_is_static_and_has_no_fetch_payload():
    msg = briefing_outcome_injection("mail", "skipped_fail")
    assert msg is not None
    assert msg.startswith("[BRIEFING: MAIL SKIP")
    assert "Preview:" not in msg
    assert "Subject:" not in msg
    assert "From:" not in msg
    assert briefing_outcome_injection("calendar", "aborted") is None
    assert briefing_outcome_injection("news", "nothing") is not None
