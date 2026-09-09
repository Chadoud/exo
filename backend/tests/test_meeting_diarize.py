"""Speaker labels, name mapping, and meeting PCM buffer — no live Gemini calls."""

from __future__ import annotations

from types import SimpleNamespace

import meeting_audio
import meeting_diarize
import meeting_store


def test_display_speaker_numbers_and_names():
    assert meeting_diarize.display_speaker("spk_1") == "Speaker 1"
    assert meeting_diarize.display_speaker("speaker_2") == "Speaker 2"
    assert meeting_diarize.display_speaker("spk_1", {"spk_1": "Alex"}) == "Alex"
    assert meeting_diarize.display_speaker("spk_1", {"Speaker 1": "Alex"}) == "Alex"


def test_parse_speaker_text_merges_turns():
    raw = "spk_1: Hello team\nspk_2: Hi Alex I will send the deck\nwe need it Friday"
    segments = meeting_diarize.parse_speaker_text(raw)
    assert segments[0] == ("spk_1", "Hello team")
    assert segments[1][0] == "spk_2"
    assert "send the deck" in segments[1][1]
    assert "Friday" in segments[1][1]


def test_segments_from_audio_transcription_parts():
    def word(w):
        return SimpleNamespace(word=w)

    part1 = SimpleNamespace(
        audio_transcription=SimpleNamespace(
            speaker_label="spk_1",
            words=[word("Hello"), word("Alex")],
        ),
        text="",
    )
    part2 = SimpleNamespace(
        audio_transcription=SimpleNamespace(
            speaker_label="spk_2",
            words=[word("Hi")],
        ),
        text="",
    )
    response = SimpleNamespace(
        candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part1, part2]))],
        text="",
    )
    assert meeting_diarize.segments_from_response(response) == [
        ("spk_1", "Hello Alex"),
        ("spk_2", "Hi"),
    ]


def test_format_labeled_lines_uses_names():
    lines = meeting_diarize.format_labeled_lines(
        [("spk_1", "I'll send the deck")],
        {"spk_1": "Alex"},
    )
    assert lines == ["Alex: I'll send the deck"]


def test_pcm_roundtrip_and_discard():
    meeting_audio.discard_all()
    meeting_audio.append_pcm("m-audio", b"\x01\x00" * 32)
    assert meeting_audio.byte_count("m-audio") == 64
    wav = meeting_audio.pcm16_mono_to_wav(meeting_audio.snapshot("m-audio"))
    assert wav[:4] == b"RIFF"
    assert meeting_audio.snapshot_and_clear("m-audio")
    assert meeting_audio.byte_count("m-audio") == 0


def test_replace_spoken_keeps_manual_notes():
    meeting_store.start_meeting("m-replace", "Sync")
    meeting_store.append_line("m-replace", "live hello", source="stt")
    meeting_store.append_line("m-replace", "typed point", source="manual")
    meeting_store.replace_spoken_lines("m-replace", ["Speaker 1: Hello from the room"])
    notes = meeting_store.get_live_notes("m-replace")
    assert notes["lines"][0] == "Speaker 1: Hello from the room"
    assert notes["lines"][-1] == "typed point"
    meeting_store.clear_all_active_meetings()


def test_end_meeting_prefers_diarized_transcript(monkeypatch):
    captured: list[str] = []

    def fake_complete(_system: str, prompt: str) -> str:
        captured.append(prompt)
        return (
            '{"title":"Sync","overview":"Deck follows","highlights":[],'
            '"decisions":[],"action_items":["Alex — Send the deck"]}'
        )

    monkeypatch.setattr(meeting_store, "complete", fake_complete)
    monkeypatch.setattr(
        "meeting_diarize.labeled_lines_from_wav",
        lambda _wav: ["Alex: I will send the deck to the team before Friday"],
    )
    meeting_store.start_meeting("m-diarize", "Sync")
    meeting_store.append_line("m-diarize", "unlabeled live text")
    meeting_audio.append_pcm("m-diarize", b"\x00\x00" * 64)
    result = meeting_store.end_meeting("m-diarize")
    assert result["ok"] is True
    assert result.get("skipped") != "too_short"
    assert any("Alex: I will send the deck to the team" in prompt for prompt in captured)
    assert meeting_audio.byte_count("m-diarize") == 0
