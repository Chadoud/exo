"""HTTP route smoke + behavior tests for the second-brain endpoints.

Mirrors the ``TestClient`` style of ``test_api_routes_smoke.py`` but adds
data-dir isolation (so SQLite stores write to a temp dir) and a few behavior
assertions (rate-limit 429s, meeting lifecycle). Guards against router
registration regressions like the ``main.py`` import bug.
"""

import os
import pathlib
import sys
import tempfile
import unittest

# Isolate stores to a temp dir and keep the background scheduler off BEFORE
# importing the app (stores read EXOSITES_DATA_DIR per-connection).
_TMP_DATA_DIR = tempfile.mkdtemp(prefix="exosites-routes-")
os.environ["EXOSITES_DATA_DIR"] = _TMP_DATA_DIR
os.environ["EXOSITES_DISABLE_SCHEDULER"] = "1"
os.environ.pop("EXOSITES_APP_TOKEN", None)

from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import telemetry.rate_limit_memory as rate_limit_memory  # noqa: E402
from main import app  # noqa: E402


class TestSecondBrainRoutes(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        # Reset the process-global rate-limit windows so 429 assertions are
        # deterministic regardless of test ordering.
        with rate_limit_memory._lock:
            rate_limit_memory._windows.clear()

    def test_tasks_list(self) -> None:
        r = self.client.get("/tasks?exclude_manual=true")
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.json(), list)

    def test_tasks_sync_shape(self) -> None:
        r = self.client.post("/tasks/sync")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("created", data)
        self.assertIn("statuses", data)
        self.assertIn("total_created", data)

    def test_tasks_forget_source_rejects_manual(self) -> None:
        r = self.client.post("/tasks/forget-source", json={"source": "manual"})
        self.assertEqual(r.status_code, 422)

    def test_tasks_forget_source_ok(self) -> None:
        r = self.client.post("/tasks/forget-source", json={"source": "gmail"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data.get("ok"))
        self.assertIn("dropped", data)

    def test_memory_routes(self) -> None:
        r = self.client.get("/memory")
        self.assertEqual(r.status_code, 200)
        r_all = self.client.get("/memory?all_scopes=true")
        self.assertEqual(r_all.status_code, 200)
        self.assertIsInstance(r_all.json(), list)

    def test_memory_all_scopes_hides_briefing_v2_flag(self) -> None:
        created = self.client.post(
            "/memory",
            json={
                "category": "preferences",
                "key": "startup_briefing_consent_v2",
                "value": "1",
            },
        )
        self.assertEqual(created.status_code, 200)
        listed = self.client.get("/memory?all_scopes=true")
        self.assertEqual(listed.status_code, 200)
        keys = {row.get("key") for row in listed.json()}
        self.assertNotIn("startup_briefing_consent_v2", keys)
        category_dict = self.client.get("/memory")
        self.assertEqual(category_dict.status_code, 200)
        prefs = category_dict.json().get("preferences") or {}
        self.assertNotIn("startup_briefing_consent_v2", prefs)
        exported = self.client.get("/memory/export")
        self.assertEqual(exported.status_code, 200)
        self.assertEqual(
            (exported.json().get("preferences") or {}).get("startup_briefing_consent_v2"),
            "1",
        )

    def test_conversations_list_and_search(self) -> None:
        self.assertEqual(self.client.get("/conversations").status_code, 200)
        r = self.client.get("/conversations/search?q=launch")
        self.assertEqual(r.status_code, 200)
        self.assertIsInstance(r.json(), list)

    def test_distill_rate_limited(self) -> None:
        body = {"messages": [{"role": "user", "content": "hi"}]}
        statuses = [
            self.client.post("/conversations/rate-test/distill", json=body).status_code
            for _ in range(5)
        ]
        # 4 allowed per hour; the 5th is rejected.
        self.assertEqual(statuses[-1], 429)
        self.assertTrue(all(s in (200, 429) for s in statuses))

    def test_digest_latest_builds_today_without_generate(self) -> None:
        latest = self.client.get("/digest/latest")
        self.assertEqual(latest.status_code, 200)
        self.assertIn("headline", latest.json())

    def test_digest_generate_and_latest(self) -> None:
        # No digest yet for a fresh data dir-scoped date is possible; generate one.
        gen = self.client.post("/digest/generate")
        self.assertEqual(gen.status_code, 200)
        self.assertIn("headline", gen.json())
        latest = self.client.get("/digest/latest")
        self.assertEqual(latest.status_code, 200)
        self.assertIn("headline", latest.json())

    def test_digest_rate_limited(self) -> None:
        statuses = [self.client.post("/digest/generate").status_code for _ in range(7)]
        # 6 allowed per day; the 7th is rejected.
        self.assertEqual(statuses[-1], 429)

    def test_nudges_list_and_dismiss_missing(self) -> None:
        self.assertEqual(self.client.get("/nudges").status_code, 200)
        # Dismissing a non-existent nudge is a 404.
        self.assertEqual(self.client.post("/nudges/999999/dismiss").status_code, 404)

    def test_scheduler_status_shape(self) -> None:
        r = self.client.get("/proactive/scheduler/status")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("running", data)
        self.assertIn("jobs", data)
        self.assertIsInstance(data["jobs"], list)

    def test_meeting_lifecycle(self) -> None:
        start = self.client.post("/meetings/start", json={"id": "route-meeting", "title": "Sync"})
        self.assertEqual(start.status_code, 200)
        note = self.client.post(
            "/meetings/route-meeting/note",
            json={"text": "We agreed to ship the release on Friday and update the changelog."},
        )
        self.assertEqual(note.status_code, 200)
        notes = self.client.get("/meetings/route-meeting/notes")
        self.assertEqual(notes.status_code, 200)
        self.assertGreaterEqual(notes.json()["line_count"], 1)
        end = self.client.post("/meetings/route-meeting/end")
        self.assertEqual(end.status_code, 200)
        self.assertTrue(end.json().get("ok"))

    def test_brain_files_shape(self) -> None:
        r = self.client.get("/brain/files")
        self.assertEqual(r.status_code, 200)
        self.assertIn("folders", r.json())

    def test_activity_status_shape(self) -> None:
        r = self.client.get("/activity/status")
        self.assertEqual(r.status_code, 200)
        self.assertIn("running", r.json())

    def test_recall_search(self) -> None:
        r = self.client.get("/recall/search?q=launch")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("results", data)
        self.assertIn("count", data)


class TestProactiveEntitlementGate(unittest.TestCase):
    """Past the free-tier trial without a license, the paid proactive routes 402."""

    def setUp(self) -> None:
        self.client = TestClient(app)
        self._user_data = tempfile.mkdtemp(prefix="exosites-ent-")
        # Force the unlicensed past-trial state: expired trial, no dev bypass.
        import json
        from datetime import datetime, timedelta, timezone

        started = datetime.now(timezone.utc) - timedelta(days=30)
        ended = started + timedelta(days=14)
        with open(os.path.join(self._user_data, "trial.json"), "w", encoding="utf-8") as f:
            json.dump(
                {
                    "v": 1,
                    "trialStartedAt": started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "trialEndsAt": ended.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "source": "test",
                },
                f,
            )
        self._prev = {
            "EXOSITES_USER_DATA": os.environ.get("EXOSITES_USER_DATA"),
            "EXOSITES_DEV_BYPASS_ENTITLEMENT": os.environ.get("EXOSITES_DEV_BYPASS_ENTITLEMENT"),
            "NODE_ENV": os.environ.get("NODE_ENV"),
        }
        os.environ["EXOSITES_USER_DATA"] = self._user_data
        os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
        os.environ["NODE_ENV"] = "production"

    def tearDown(self) -> None:
        for key, val in self._prev.items():
            if val is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = val

    def test_tasks_sync_blocked(self) -> None:
        self.assertEqual(self.client.post("/tasks/sync").status_code, 402)

    def test_tasks_forget_source_not_blocked(self) -> None:
        r = self.client.post("/tasks/forget-source", json={"source": "gmail"})
        self.assertEqual(r.status_code, 200)

    def test_digest_generate_blocked(self) -> None:
        self.assertEqual(self.client.post("/digest/generate").status_code, 402)

    def test_meeting_start_blocked(self) -> None:
        r = self.client.post("/meetings/start", json={"id": "gated", "title": "x"})
        self.assertEqual(r.status_code, 402)

    def test_activity_start_blocked(self) -> None:
        self.assertEqual(self.client.post("/activity/start", json={}).status_code, 402)

    def test_dev_bypass_unlocks(self) -> None:
        os.environ["EXOSITES_DEV_BYPASS_ENTITLEMENT"] = "1"
        self.assertEqual(self.client.post("/tasks/sync").status_code, 200)


if __name__ == "__main__":
    unittest.main()
