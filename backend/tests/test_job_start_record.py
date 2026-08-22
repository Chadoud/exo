"""last_job_start.json writes no paths and records entitlement rejects."""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


class TestJobStartRecord(unittest.TestCase):
    def test_writes_safe_payload(self):
        import os

        from job_start_record import record_job_start

        prev = os.environ.get("EXOSITES_USER_DATA")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                record_job_start(ok=False, route="analyze", status=402, code="trial_expired")
                data = json.loads((pathlib.Path(tmp) / "last_job_start.json").read_text(encoding="utf-8"))
                self.assertEqual(data["ok"], False)
                self.assertEqual(data["route"], "analyze")
                self.assertEqual(data["status"], 402)
                self.assertEqual(data["code"], "trial_expired")
                self.assertNotIn("path", data)
                self.assertNotIn("output_dir", data)
        finally:
            if prev is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev

    def test_unknown_code_is_error(self):
        import os

        from job_start_record import record_job_start

        prev = os.environ.get("EXOSITES_USER_DATA")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                record_job_start(ok=False, route="analyze", status=400, code="C:\\Users\\secret")
                data = json.loads((pathlib.Path(tmp) / "last_job_start.json").read_text(encoding="utf-8"))
                self.assertEqual(data["code"], "error")
        finally:
            if prev is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev


if __name__ == "__main__":
    unittest.main()
