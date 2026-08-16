"""Gmail OAuth and import → sort job."""

from __future__ import annotations

import asyncio
import logging
import os
import pathlib
import sys
import uuid
from collections.abc import Callable
from typing import Annotated

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from api_schemas import FileJobRequest, GmailImportJobRequest
from constants import APP_STATE_DIR, GMAIL_EXPORT_MAX_MESSAGES
from deps import get_job_service, get_jobs, get_save_jobs
from gmail_google_oauth import (
    abort_gmail_oauth_flow,
    begin_gmail_oauth_browser_flow,
    delete_gmail_token_file,
    get_gmail_oauth_flow_error,
    get_valid_access_token,
    google_client_credentials,
    is_gmail_connected,
    is_gmail_oauth_flow_active,
    oauth_redirect_uri,
)
from gmail_import import canonical_gmail_list_query
from gmail_setup_checks import build_gmail_developer_setup_steps
from job_service import JobService
from routes.job_enqueue_helpers import enqueue_gmail_streaming_import_sort

logger = logging.getLogger(__name__)


def _main_py_path_for_dotenv() -> str:
    """``main`` module path when running under uvicorn; else ``backend/main.py`` next to this package."""
    main_mod = sys.modules.get("main")
    if main_mod is not None and getattr(main_mod, "__file__", None):
        return str(main_mod.__file__)
    return str(pathlib.Path(__file__).resolve().parent.parent / "main.py")


def create_gmail_router() -> APIRouter:
    router = APIRouter(prefix="/gmail", tags=["gmail"])

    @router.get("/status")
    def gmail_status():
        from dotenv_bootstrap import refresh_gmail_oauth_env_from_dotenv

        refresh_gmail_oauth_env_from_dotenv(_main_py_path_for_dotenv())

        cid = (os.environ.get("EXOSITES_GOOGLE_CLIENT_ID") or "").strip()
        oauth_cid_env = (os.environ.get("EXOSITES_GOOGLE_OAUTH_CLIENT_ID") or "").strip()
        sec = (os.environ.get("EXOSITES_GOOGLE_CLIENT_SECRET") or "").strip()
        backend_root = pathlib.Path(__file__).resolve().parent.parent
        backend_dotenv = backend_root / ".env"
        default_json = APP_STATE_DIR / "gmail_oauth_client.json"
        home_dotenv = pathlib.Path.home() / ".ai-file-sorter" / ".env"
        rd = (os.environ.get("EXOSITES_BACKEND_RESOURCE_DIR") or "").strip()
        resource_dotenv = pathlib.Path(rd) / ".env" if rd else None
        resource_dotenv_exists = resource_dotenv.is_file() if resource_dotenv else False
        env_json = (os.environ.get("EXOSITES_GOOGLE_OAUTH_CLIENT_JSON") or "").strip()
        json_at_env_path = pathlib.Path(env_json).expanduser().is_file() if env_json else False
        cred = google_client_credentials()
        oauth_ok = cred is not None

        gmail_profile_probe_ok: bool | None = None
        if is_gmail_connected():
            try:
                tok = get_valid_access_token()
                with httpx.Client(timeout=8.0) as client:
                    r = client.get(
                        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
                        headers={"Authorization": f"Bearer {tok}"},
                    )
                gmail_profile_probe_ok = r.status_code == 200
            except Exception:
                gmail_profile_probe_ok = False

        redirect_uri = oauth_redirect_uri()
        developer_setup_steps = build_gmail_developer_setup_steps(
            oauth_configured=oauth_ok,
            oauth_env_id_present=bool(cid or oauth_cid_env),
            oauth_env_secret_present=bool(sec),
            backend_dotenv_file_exists=backend_dotenv.is_file(),
            user_dotenv_file_exists=home_dotenv.is_file(),
            resource_dotenv_file_exists=resource_dotenv_exists,
            oauth_json_path_env_present=bool(env_json),
            oauth_json_file_at_path_exists=json_at_env_path,
            oauth_default_json_exists=default_json.is_file(),
            redirect_uri_effective=redirect_uri,
            gmail_profile_probe_ok=gmail_profile_probe_ok,
        )
        return {
            "gmail_import_max_messages": int(GMAIL_EXPORT_MAX_MESSAGES),
            "connected": is_gmail_connected(),
            "oauth_flow_active": is_gmail_oauth_flow_active(),
            "oauth_flow_error": get_gmail_oauth_flow_error(),
            "gmail_oauth_redirect_uri": redirect_uri,
            "oauth_configured": oauth_ok,
            "oauth_env_id_present": bool(cid or oauth_cid_env),
            "oauth_env_secret_present": bool(sec),
            "oauth_json_path_env_present": bool(env_json),
            "oauth_default_json_exists": default_json.is_file(),
            "backend_dotenv_file_exists": backend_dotenv.is_file(),
            "user_dotenv_file_exists": home_dotenv.is_file(),
            "resource_dotenv_file_exists": resource_dotenv_exists,
            "developer_setup_steps": developer_setup_steps,
        }

    @router.post("/oauth/begin")
    async def gmail_oauth_begin():
        if not google_client_credentials():
            raise HTTPException(
                status_code=503,
                detail="Gmail OAuth is not configured on this build (missing client credentials).",
            )
        loop = asyncio.get_running_loop()
        try:
            auth_url = await loop.run_in_executor(None, begin_gmail_oauth_browser_flow)
        except RuntimeError as exc:
            msg = str(exc)
            if "already in progress" in msg.lower():
                raise HTTPException(status_code=409, detail=msg) from exc
            raise HTTPException(status_code=400, detail=msg) from exc
        return {"auth_url": auth_url}

    @router.post("/oauth/abort")
    async def gmail_oauth_abort():
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, abort_gmail_oauth_flow)
        return {"ok": True}

    @router.delete("/oauth")
    def gmail_oauth_disconnect():
        delete_gmail_token_file()
        from mail_initiative.store import clear_all as clear_mail_replies

        clear_mail_replies()
        return {"ok": True, "connected": False}

    @router.post("/import-sort")
    async def gmail_import_sort(
        body: GmailImportJobRequest,
        background_tasks: BackgroundTasks,
        jobs: Annotated[dict[str, dict], Depends(get_jobs)],
        save_jobs: Annotated[Callable[..., None], Depends(get_save_jobs)],
        job_service: Annotated[JobService, Depends(get_job_service)],
    ):
        """
        Gmail export runs in a background thread while the job classifies each staged file as it
        appears (bounded queue). Same end state as before: review before apply.
        """
        try:
            token = await asyncio.get_running_loop().run_in_executor(None, get_valid_access_token)
        except RuntimeError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

        staging_root = APP_STATE_DIR / "gmail_imports" / uuid.uuid4().hex
        staging_root.mkdir(parents=True, exist_ok=True)
        cq = canonical_gmail_list_query(body.gmail_query.strip())

        req = FileJobRequest(
            file_paths=[],
            output_dir=body.output_dir,
            model=body.model,
            mode=body.mode,
            language=body.language,
            session_id=body.session_id,
            vision_model=body.vision_model,
            rules=body.rules,
            dry_run=body.dry_run,
            on_collision=body.on_collision,
            min_confidence=body.min_confidence,
            tesseract_lang=body.tesseract_lang,
            tesseract_langs=body.tesseract_langs,
            tesseract_auto=body.tesseract_auto,
            sort_system_prompt=body.sort_system_prompt,
            document_briefing_enable=body.document_briefing_enable,
            sort_structure_template=body.sort_structure_template,
        )
        result = enqueue_gmail_streaming_import_sort(
            jobs,
            save_jobs,
            job_service,
            req,
            background_tasks,
            auto_apply=False,
            browser_staging=staging_root,
            access_token=token,
            gmail_query=cq,
            max_messages=body.max_messages,
            gmail_import_content=body.gmail_import_content,
            gmail_ui_parameters_json=body.gmail_ui_parameters_json,
        )
        logger.info(
            "gmail_import_sort_stream_started job_id=%s max_messages=%s import_content=%s staging_dir=%s",
            result.get("job_id"),
            body.max_messages,
            body.gmail_import_content,
            staging_root.name,
        )
        return result

    return router
