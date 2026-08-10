"""
EXO — FastAPI backend
Provides REST endpoints consumed by the Electron/React frontend.
"""

from __future__ import annotations

import importlib.util
import os
import sys

# ── Dependency pre-flight ─────────────────────────────────────────────────────
# Check critical optional packages early so the error message is actionable
# instead of a buried ImportError deep inside a route handler. Uses find_spec
# (locate only) rather than a real import — actually importing google.genai
# here would add ~3s to every backend boot just to prove it's installed.
_REQUIRED_PACKAGES: list[tuple[str, str]] = [
    ("google.genai", "google-genai>=1.0"),
    ("psutil", "psutil>=5.9.0"),
]
_missing: list[str] = []
for _mod, _pip in _REQUIRED_PACKAGES:
    try:
        found = importlib.util.find_spec(_mod) is not None
    except ImportError:
        found = False
    if not found:
        _missing.append(_pip)

if _missing:
    print(
        "\n[STARTUP] Missing Python packages — run the following then restart:\n"
        f"  pip install {' '.join(_missing)}\n"
        "Or from the backend/ directory:\n"
        "  pip install -r requirements.txt\n",
        file=sys.stderr,
    )
    sys.exit(1)

# Load ``.env`` before any module reads ``os.environ`` (e.g. ``constants``, Gmail).
from dotenv_bootstrap import load_dotenv_early

load_dotenv_early(main_file=__file__)

# Configure logging immediately after .env is loaded so LOG_LEVEL is respected.
from logging_config import setup_logging

setup_logging()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app_auth import app_token_auth_enabled, require_app_token, validate_app_token
from classifier import classify_candidates, classify_scored
from codegen.routes import router as codegen_router
from codegen.session_store import load_persisted_sessions
from constants import CONFIDENCE_THRESHOLD, UNCERTAIN_FOLDER
from context_index import ContextIndex
from crash_reports.routes import router as crash_reports_router
from history import HistoryLog
from ingestor import extract_content, extract_text
from job_lifecycle import bootstrap_persisted_jobs
from job_service import JobService
from job_store import JobStore
from request_logging import RequestLoggingMiddleware
from routes.activity_routes import router as activity_router
from routes.agent_routes import router as agent_router
from routes.ai_routes import router as ai_router
from routes.assistant_routes import create_assistant_router
from routes.brain_routes import create_brain_router
from routes.calendar_routes import router as calendar_router
from routes.conversation_routes import router as conversation_router
from routes.gmail_routes import create_gmail_router
from routes.history_routes import create_history_router
from routes.job_routes import create_job_router
from routes.meeting_routes import router as meeting_router
from routes.memory_routes import router as memory_router
from routes.meta_routes import router as meta_router
from routes.ollama_routes import router as ollama_router
from routes.privacy_routes import router as privacy_router
from routes.proactive_routes import router as proactive_router
from routes.recall_routes import router as recall_router
from routes.sort_defaults_routes import router as sort_defaults_router
from routes.sync_routes import router as sync_local_router
from routes.system_routes import router as system_router
from routes.task_routes import router as task_router
from routes.vision_routes import router as vision_router
from routes.voice_routes import router as voice_router
from routes.web_nav_routes import desktop_router as desktop_nav_router
from routes.web_nav_routes import router as web_nav_router
from sorter import get_folder_tree, sort_file
from telemetry.public_routes import router as public_config_router
from telemetry.routes import router as telemetry_router


def _cors_origins() -> list[str]:
    """
    Allowed CORS origins for the local FastAPI server.

    Electron HTTP now goes through main-process ``backend:http`` (no browser CORS).
    Keep Vite dev origins; do not allow the opaque ``null`` origin (M2.9).
    ``EXOSITES_CORS_EXTRA_ORIGINS`` is ignored when packaged auth is required.
    """
    origins = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "app://.",
    ]
    if require_app_token():
        return origins
    extra = os.environ.get("EXOSITES_CORS_EXTRA_ORIGINS", "").strip()
    if extra:
        origins += [o.strip() for o in extra.split(",") if o.strip()]
    return origins


# Paths the Electron health-check polls before the frontend has a token.
_TOKEN_EXEMPT_PATHS = {"/health", "/ready", "/meta/version"}


def _path_exempt_from_app_token(path: str) -> bool:
    if path in _TOKEN_EXEMPT_PATHS:
        return True
    # Public client contract (telemetry / crash hints). Must work without X-App-Token.
    if path.startswith("/v1/public/"):
        return True
    return False


class AppTokenMiddleware(BaseHTTPMiddleware):
    """
    Validates the X-App-Token header against EXOSITES_APP_TOKEN (set by Electron).

    Auth is enabled when EXOSITES_APP_TOKEN is set, or when EXOSITES_REQUIRE_APP_TOKEN=1
    (packaged builds). It is disabled when EXOSITES_INSECURE_LOCAL=1 *and*
    EXOSITES_REQUIRE_APP_TOKEN is unset (pytest / break-glass only). Missing token with
    REQUIRE unset also disables auth — do not run packaged backends that way.
    """

    async def dispatch(self, request, call_next):  # type: ignore[override]
        if app_token_auth_enabled() and not _path_exempt_from_app_token(request.url.path):
            provided = request.headers.get("X-App-Token", "")
            if not validate_app_token(provided):
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)


def _build_app() -> FastAPI:
    """Construct FastAPI app, routers, and ``app.state`` (factory for ``main.app`` and tests)."""
    from constants import APP_DISPLAY_NAME

    application = FastAPI(title=APP_DISPLAY_NAME, version="1.0.0")
    application.add_middleware(RequestLoggingMiddleware)
    # Token middleware before CORS so rogue requests are rejected before origin handling.
    application.add_middleware(AppTokenMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(telemetry_router)
    application.include_router(crash_reports_router)
    application.include_router(public_config_router)
    application.include_router(meta_router)
    application.include_router(ollama_router)
    application.include_router(memory_router)
    application.include_router(task_router)
    application.include_router(conversation_router)
    application.include_router(activity_router)
    application.include_router(meeting_router)
    application.include_router(proactive_router)
    application.include_router(privacy_router)
    application.include_router(recall_router)
    application.include_router(sync_local_router)
    application.include_router(ai_router)
    application.include_router(sort_defaults_router)
    application.include_router(system_router)
    application.include_router(calendar_router)
    application.include_router(voice_router)
    application.include_router(vision_router)
    application.include_router(agent_router)
    application.include_router(codegen_router)
    application.include_router(web_nav_router)
    application.include_router(desktop_nav_router)

    history = HistoryLog()
    context_index = ContextIndex()
    job_store = JobStore()
    jobs, save_jobs, touch_job = bootstrap_persisted_jobs(job_store)

    job_service = JobService(
        jobs=jobs,
        save_jobs=save_jobs,
        touch_job=touch_job,
        context_index=context_index,
        history=history,
        classify_scored=lambda text, existing_folders, folder_contexts, model, language, _filename_tokens=None, **_kw: (  # noqa: E501
            classify_scored(
                text,
                existing_folders,
                folder_contexts,
                model,
                language,
                source_filename=_kw.get("source_filename"),
                document_hint=_kw.get("document_hint"),
                document_briefing=_kw.get("document_briefing"),
                classification_language=_kw.get("classification_language"),
                sort_system_prompt=_kw.get("sort_system_prompt"),
                structure_contract=_kw.get("structure_contract"),
            )
        ),
        classify_candidates=lambda text, existing_folders, folder_contexts, model, language, filename_tokens=None, **kw: (  # noqa: E501
            classify_candidates(
                text,
                existing_folders,
                folder_contexts,
                model,
                language,
                filename_tokens,
                extraction_quality=kw.get("extraction_quality"),
                source_filename=kw.get("source_filename"),
                document_hint=kw.get("document_hint"),
                document_briefing=kw.get("document_briefing"),
                classification_language=kw.get("classification_language"),
                sort_system_prompt=kw.get("sort_system_prompt"),
                structure_contract=kw.get("structure_contract"),
            )
        ),
        extract_text=lambda *args, **kwargs: extract_text(*args, **kwargs),
        extract_content=lambda *args, **kwargs: extract_content(*args, **kwargs),
        sort_file=lambda *args, **kwargs: sort_file(*args, **kwargs),
        get_folder_tree=get_folder_tree,
        uncertain_folder=UNCERTAIN_FOLDER,
        confidence_threshold=CONFIDENCE_THRESHOLD,
    )

    application.state.jobs = jobs
    application.state.save_jobs = save_jobs
    application.state.job_service = job_service
    application.state.history = history
    application.state.context_index = context_index

    from voice_job_runtime import bind_voice_job_enqueue_runtime, capture_main_event_loop_for_tools

    bind_voice_job_enqueue_runtime(jobs, save_jobs, job_service)

    @application.on_event("startup")
    async def _capture_main_loop_for_voice_tools() -> None:
        capture_main_event_loop_for_tools()
        load_persisted_sessions()
        if os.environ.get("EXOSITES_DISABLE_SCHEDULER", "").strip() != "1":
            from proactive_scheduler import start_proactive_scheduler

            start_proactive_scheduler()

    @application.on_event("shutdown")
    async def _stop_proactive_scheduler() -> None:
        from proactive_scheduler import stop_proactive_scheduler

        stop_proactive_scheduler()

        from actions.web_agent import close_web_agent_sessions

        close_web_agent_sessions()

    application.include_router(create_job_router())
    application.include_router(create_assistant_router())
    application.include_router(create_gmail_router())
    application.include_router(create_history_router())
    application.include_router(create_brain_router())

    return application


def create_app() -> FastAPI:
    """Fresh app instance for tests (isolated ``app.state``). Production uses ``main.app``."""
    return _build_app()


app = _build_app()

# Shared job table for tests that mutate ``main.jobs`` / patch ``main.history``
# (same objects as ``app.state``).
jobs = app.state.jobs
history = app.state.history
context_index = app.state.context_index
