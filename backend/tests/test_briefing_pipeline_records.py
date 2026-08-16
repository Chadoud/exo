"""Pipeline emits closed section records — never fetch payloads."""

from __future__ import annotations

import asyncio

from voice.briefing.pipeline import stream_briefing_sections


def _ok(data: dict) -> dict:
    return {"ok": True, "data": data}


async def _run_pipeline(
    *,
    routine: str,
    dispatch_results: dict[str, dict],
    user_spoke_after: str | None = None,
    tokens_ready: bool = True,
) -> tuple[list[tuple[str, str]], list[str], int]:
    records: list[tuple[str, str]] = []
    honesty = {"n": 0}
    audio: asyncio.Queue = asyncio.Queue()
    turn_done: asyncio.Queue = asyncio.Queue()
    spoke = asyncio.Event()
    tokens = asyncio.Event()
    if tokens_ready:
        tokens.set()
    turn_done.put_nowait(None)

    async def send_progress(section: str | None) -> None:
        if section is None:
            return

        async def _signal_turn() -> None:
            await asyncio.sleep(0)
            turn_done.put_nowait(None)

        asyncio.create_task(_signal_turn())

    async def send_record(section: str, outcome: str) -> None:
        records.append((section, outcome))
        if user_spoke_after and section == user_spoke_after:
            spoke.set()

    async def send_honesty() -> None:
        honesty["n"] += 1

    def fake_dispatch(tool: str, params: dict, approval_granted: bool = False) -> dict:
        key = params.get("operation") or params.get("mode") or tool
        if tool == "web_search":
            key = "news"
        elif tool == "weather_report":
            key = "weather"
        elif tool == "google_workspace":
            key = f"google:{params.get('operation')}"
        elif tool == "microsoft_graph":
            key = f"ms:{params.get('operation')}"
        return dispatch_results.get(key, {"ok": False, "error": "missing"})

    import voice.briefing.pipeline as pipeline_mod

    original = pipeline_mod.dispatch_sync
    original_timeout = pipeline_mod._TURN_PACING_TIMEOUT_S
    pipeline_mod.dispatch_sync = fake_dispatch  # type: ignore[method-assign]
    pipeline_mod._TURN_PACING_TIMEOUT_S = 0.4
    try:
        await stream_briefing_sections(
            routine=routine,
            audio_queue=audio,
            tokens_ready=tokens,
            turn_done=turn_done,
            user_spoke=spoke,
            send_progress=send_progress,
            send_section_record=send_record,
            send_tasks_honesty=send_honesty,
        )
    finally:
        pipeline_mod.dispatch_sync = original  # type: ignore[method-assign]
        pipeline_mod._TURN_PACING_TIMEOUT_S = original_timeout

    injections: list[str] = []
    while not audio.empty():
        item = audio.get_nowait()
        if isinstance(item, str):
            injections.append(item)
    return records, injections, honesty["n"]


def test_empty_calendar_emits_nothing_record():
    records, injections, honesty = asyncio.run(
        _run_pipeline(
            routine="calendar for today",
            dispatch_results={
                "google:list_calendar_events": _ok({"events": []}),
                "ms:list_calendar_events": _ok({"events": []}),
            },
        )
    )
    assert records == [("calendar", "nothing")]
    assert honesty == 0
    assert all("Preview:" not in msg for msg in injections)
    assert all(not msg.startswith("[BRIEFING: CALENDAR —") for msg in injections)


def test_failed_mail_emits_skip_record():
    records, injections, _honesty = asyncio.run(
        _run_pipeline(
            routine="unread mail",
            dispatch_results={
                "google:search_mail": {"ok": False, "error": "nope"},
                "ms:search_mail": {"ok": False, "needs_reconnect": True},
            },
        )
    )
    assert records == [("mail", "skipped_reconnect")]
    assert all("Subject:" not in msg and "Preview:" not in msg for msg in injections)


def test_barge_in_emits_aborted_for_remaining_and_tasks_honesty():
    records, _injections, honesty = asyncio.run(
        _run_pipeline(
            routine="news, weather for Geneva, calendar for today, pending tasks, mail",
            dispatch_results={
                "news": _ok({"snippet": ""}),
                "weather": _ok({"summary": ""}),
            },
            user_spoke_after="news",
        )
    )
    # News fmt empty → nothing record, then send_record sets user_spoke.
    # Remaining calendar + mail abort. Weather may already have been next...
    # After news nothing, loop continues to weather unless spoke is set.
    # send_record sets spoke on news, then weather iteration sees user_spoke.
    assert ("news", "nothing") in records
    assert ("weather", "aborted") in records
    assert ("calendar", "aborted") in records
    assert ("mail", "aborted") in records
    assert honesty == 1


def test_news_nothing_does_not_persist_headlines_payload():
    records, injections, _honesty = asyncio.run(
        _run_pipeline(
            routine="news headlines",
            dispatch_results={"news": _ok({"snippet": ""})},
        )
    )
    assert records == [("news", "nothing")]
    assert all("[/BRIEFING: NEWS]" not in msg for msg in injections)
