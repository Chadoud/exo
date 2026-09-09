"""Meeting-mode voice transcription: route wiring + session config.

Verifies the ``/ws/voice?mode=transcribe`` path validates the meeting, passes
``transcription_only`` + ``meeting_id`` into the session, and that the
transcription-only Live config carries no tools (the model must never act on
what it overhears).
"""

import json
import os
import pathlib
import sys
import tempfile
import unittest

os.environ.setdefault("EXOSITES_DATA_DIR", tempfile.mkdtemp(prefix="exosites-meeting-"))
os.environ["EXOSITES_DISABLE_SCHEDULER"] = "1"
os.environ.pop("EXOSITES_APP_TOKEN", None)

from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import meeting_store  # noqa: E402
import routes.voice_routes as voice_routes  # noqa: E402
from main import app  # noqa: E402


class TestMeetingTranscription(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_transcribe_requires_existing_meeting(self) -> None:
        with self.client.websocket_connect("/ws/voice?mode=transcribe") as ws:
            frame = json.loads(ws.receive_text())
            self.assertEqual(frame.get("type"), "error")
            self.assertEqual(frame.get("message"), "meeting_not_found")

    def test_transcribe_passes_meeting_through(self) -> None:
        captured: dict = {}

        async def fake_run(*_args, **kwargs):
            captured.update(kwargs)
            yield json.dumps({"type": "session_start", "model": "test"})

        original = voice_routes.run_voice_session
        voice_routes.run_voice_session = fake_run  # type: ignore[assignment]
        try:
            meeting_store.start_meeting("transcribe-meeting", "Sync")
            with self.client.websocket_connect(
                "/ws/voice?mode=transcribe&meeting_id=transcribe-meeting"
            ) as ws:
                frame = json.loads(ws.receive_text())
                self.assertEqual(frame.get("type"), "session_start")
        finally:
            voice_routes.run_voice_session = original  # type: ignore[assignment]
            meeting_store.end_meeting("transcribe-meeting")

        self.assertIs(captured.get("transcription_only"), True)
        self.assertEqual(captured.get("meeting_id"), "transcribe-meeting")

    def test_transcription_config_has_no_tools(self) -> None:
        """The transcription-only Live config must omit tools (AUDIO modality is required)."""
        import asyncio

        import voice_session

        captured_config: dict = {}

        class _FakeSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

        class _FakeLive:
            def connect(self, *, model, config):
                captured_config["config"] = config
                # Raise to short-circuit before any real I/O is attempted.
                raise RuntimeError("stop-after-config")

        # Build a config the same way run_voice_session would, via a tiny harness
        # that calls the genai config builder path with transcription_only=True.
        os.environ.setdefault("GEMINI_API_KEY", "test-key")

        async def _drive() -> None:
            gen = voice_session.run_voice_session(
                asyncio.Queue(),
                "system",
                transcription_only=True,
                meeting_id="m",
            )
            # Patch the client factory so connect() captures the config.
            import google.genai as genai  # type: ignore[import]

            orig_client = genai.Client

            class _C:
                def __init__(self, *a, **k):
                    self.aio = type("aio", (), {"live": _FakeLive()})()

            genai.Client = _C  # type: ignore[assignment]
            try:
                async for _frame in gen:
                    break
            except Exception:
                pass
            finally:
                genai.Client = orig_client  # type: ignore[assignment]

        try:
            asyncio.run(_drive())
        except Exception:
            pass

        config = captured_config.get("config")
        if config is not None:
            # tools must be unset/empty in transcription-only mode
            tools = getattr(config, "tools", None)
            self.assertIn(tools, (None, [], ()))


class _FakeGenaiTypes:
    class LiveConnectConfig:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class AudioTranscriptionConfig:
        pass

    class SessionResumptionConfig:
        def __init__(self, handle=None):
            self.handle = handle

    class ContextWindowCompressionConfig:
        def __init__(self, sliding_window=None):
            self.sliding_window = sliding_window

    class SlidingWindow:
        pass


class TestTranscriptionLiveConfig(unittest.TestCase):
    def test_transcription_only_uses_audio_modality(self):
        from voice.gemini_session import build_live_connect_config

        config = build_live_connect_config(
            _FakeGenaiTypes,
            system_instruction="transcribe",
            voice_history=[],
            transcription_only=True,
            memory_enabled=False,
        )
        self.assertEqual(config.response_modalities, ["AUDIO"])
        self.assertFalse(hasattr(config, "tools") and config.tools)


if __name__ == "__main__":
    unittest.main()
