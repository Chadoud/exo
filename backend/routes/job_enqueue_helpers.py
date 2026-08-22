"""Shared job enqueue helpers (path expansion, job record creation, multipart staging)."""

from __future__ import annotations

import asyncio
import logging
import pathlib
import time
import uuid
from collections.abc import Callable

from fastapi import BackgroundTasks, HTTPException
from fastapi.datastructures import UploadFile

from api_schemas import AnalyzeUploadPayload, DriveStreamStartRequest, FileJobRequest
from entitlement_gate import assert_may_start_analyze
from gmail_google_oauth import get_valid_access_token
from gmail_import import (
    canonical_gmail_list_query,
    estimate_gmail_messages_to_process,
    gmail_list_query_for_import,
    resolve_gmail_import_message_count,
)
from job_import_sources import apply_job_import_sources
from job_model_resolve import resolve_job_classify_model
from job_models import JobConfig, JobFile, JobRecord
from job_service import JobService
from job_start_record import record_job_start
from output_dir_guard import assert_safe_output_dir
from path_expand import expand_input_paths
from upload_staging import save_browser_uploads

logger = logging.getLogger(__name__)


def _guard_output_and_entitlement(output_dir: str, route: str) -> None:
    try:
        assert_safe_output_dir(output_dir)
    except ValueError as exc:
        record_job_start(ok=False, route=route, status=400, code="unsafe_output")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        assert_may_start_analyze()
    except HTTPException as exc:
        code = "trial_expired" if exc.status_code == 402 else "error"
        record_job_start(ok=False, route=route, status=int(exc.status_code), code=code)
        raise


def require_job(jobs: dict[str, dict], job_id: str) -> dict:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def dedup_staging_dir_strings(paths: list[pathlib.Path]) -> list[str]:
    return list(dict.fromkeys(str(p) for p in paths))


def _schedule_analyze_on_running_loop(
    loop: asyncio.AbstractEventLoop,
    job_service: JobService,
    job_id: str,
    *,
    auto_apply: bool,
) -> None:
    """
    Spawn ``analyze_files`` on FastAPI's loop from a worker thread (voice tool path).
    Mirrors Starlette BackgroundTasks semantics for failures (log, do not crash the process).
    """
    fut = asyncio.run_coroutine_threadsafe(
        job_service.analyze_files(job_id, False, auto_apply),
        loop,
    )

    def _done(f: asyncio.Future[None]) -> None:
        try:
            f.result()
        except Exception:
            logger.exception(
                "analyze_files failed outside HTTP request handler job_id=%s",
                job_id,
            )

    fut.add_done_callback(_done)


def enqueue_analyze_job_core(
    jobs: dict[str, dict],
    save_jobs: Callable[..., None],
    job_service: JobService,
    req: FileJobRequest,
    auto_apply: bool,
    expanded_file_paths: list[str],
    staging_dirs: list[pathlib.Path],
    *,
    background_tasks: BackgroundTasks | None = None,
    threadsafe_delivery_loop: asyncio.AbstractEventLoop | None = None,
):
    _guard_output_and_entitlement(req.output_dir, "analyze")
    if not expanded_file_paths:
        record_job_start(ok=False, route="analyze", status=400, code="no_files")
        raise HTTPException(status_code=400, detail="No files found in selected paths.")

    job_id = str(uuid.uuid4())
    session_id = req.session_id or job_id

    files = [JobFile(path=fp, name=pathlib.Path(fp).name) for fp in expanded_file_paths]
    record = JobRecord(
        id=job_id,
        session_id=session_id,
        total=len(files),
        completed=0,
        created_at=time.time(),
        updated_at=time.time(),
        config=JobConfig(
            output_dir=req.output_dir,
            model=resolve_job_classify_model(req.model),
            mode=req.mode,
            language=req.language,
            vision_model=req.vision_model,
            rules=req.rules,
            dry_run=req.dry_run,
            on_collision=req.on_collision,
            min_confidence=req.min_confidence,
            tesseract_lang=req.tesseract_lang,
            tesseract_langs=req.tesseract_langs,
            tesseract_auto=req.tesseract_auto,
            sort_system_prompt=req.sort_system_prompt,
            document_briefing_enable=req.document_briefing_enable,
            sort_structure_template=req.sort_structure_template,
        ),
        files=files,
    )

    jobs[job_id] = record.model_dump()
    apply_job_import_sources(jobs[job_id], getattr(req, "import_sources", None))
    jobs[job_id]["worker_active"] = True
    ss = dedup_staging_dir_strings(staging_dirs)
    if ss:
        jobs[job_id]["_browser_staging_dirs"] = ss
    save_jobs(force=True)
    if background_tasks is not None and threadsafe_delivery_loop is None:
        background_tasks.add_task(job_service.analyze_files, job_id, False, auto_apply)
    elif threadsafe_delivery_loop is not None and background_tasks is None:
        _schedule_analyze_on_running_loop(
            threadsafe_delivery_loop,
            job_service,
            job_id,
            auto_apply=auto_apply,
        )
    else:
        raise TypeError(
            "enqueue_analyze_job_core requires exactly one of "
            "background_tasks or threadsafe_delivery_loop",
        )
    record_job_start(ok=True, route="analyze", status=200, code="ok")
    return {"job_id": job_id, "session_id": session_id}


def enqueue_gmail_streaming_import_sort(
    jobs: dict[str, dict],
    save_jobs: Callable[..., None],
    job_service: JobService,
    req: FileJobRequest,
    background_tasks: BackgroundTasks,
    auto_apply: bool,
    *,
    browser_staging: pathlib.Path,
    access_token: str,
    gmail_query: str,
    max_messages: int,
    gmail_import_content: str,
    gmail_ui_parameters_json: str | None = None,
) -> dict[str, str]:
    """
    Start a Gmail import job with **no** pre-fetched files: export runs in a thread while
    ``JobService.run_gmail_import_streaming`` classifies each path as it is queued.
    """
    _guard_output_and_entitlement(req.output_dir, "gmail_import_sort")
    job_id = str(uuid.uuid4())
    session_id = req.session_id or job_id

    record = JobRecord(
        id=job_id,
        session_id=session_id,
        total=0,
        completed=0,
        created_at=time.time(),
        updated_at=time.time(),
        config=JobConfig(
            output_dir=req.output_dir,
            model=resolve_job_classify_model(req.model),
            mode=req.mode,
            language=req.language,
            vision_model=req.vision_model,
            rules=req.rules,
            dry_run=req.dry_run,
            on_collision=req.on_collision,
            min_confidence=req.min_confidence,
            tesseract_lang=req.tesseract_lang,
            tesseract_langs=req.tesseract_langs,
            tesseract_auto=req.tesseract_auto,
            sort_system_prompt=req.sort_system_prompt,
            document_briefing_enable=req.document_briefing_enable,
            sort_structure_template=req.sort_structure_template,
        ),
        files=[],
    )

    jobs[job_id] = record.model_dump()
    apply_job_import_sources(jobs[job_id], getattr(req, "import_sources", None))
    if "gmail" not in (jobs[job_id].get("job_import_sources") or []):
        apply_job_import_sources(jobs[job_id], ["gmail"])
    jobs[job_id]["worker_active"] = True
    cq = canonical_gmail_list_query(gmail_query)
    jobs[job_id]["gmail_query"] = cq
    jobs[job_id]["gmail_list_query"] = gmail_list_query_for_import(cq, str(gmail_import_content))
    jobs[job_id]["gmail_import_fetching"] = True
    jobs[job_id]["gmail_import_content"] = gmail_import_content
    jobs[job_id]["gmail_max_messages"] = max_messages
    exact = resolve_gmail_import_message_count(
        access_token,
        query=gmail_query,
        import_content=str(gmail_import_content),
        max_messages=int(max_messages),
        get_token=get_valid_access_token,
    )
    if exact is not None:
        jobs[job_id]["gmail_messages_total_estimate"] = int(exact)
    else:
        est = estimate_gmail_messages_to_process(
            access_token,
            query=gmail_query,
            import_content=str(gmail_import_content),
            max_messages=int(max_messages),
        )
        if est is not None:
            jobs[job_id]["gmail_messages_total_estimate"] = int(est)
    jobs[job_id]["gmail_export_messages"] = 0
    jobs[job_id]["gmail_export_text_files"] = 0
    jobs[job_id]["gmail_export_attachment_files"] = 0
    jobs[job_id]["gmail_export_attachment_fetch_failures"] = 0
    jobs[job_id]["gmail_export_staging_capped"] = False
    if gmail_ui_parameters_json and str(gmail_ui_parameters_json).strip():
        jobs[job_id]["gmail_ui_parameters_json"] = str(gmail_ui_parameters_json).strip()[:4096]
    jobs[job_id]["_browser_staging_dirs"] = dedup_staging_dir_strings([browser_staging])
    save_jobs(force=True)
    background_tasks.add_task(
        job_service.run_gmail_import_streaming,
        job_id,
        access_token,
        staging_root=browser_staging,
        query=gmail_query,
        max_messages=max_messages,
        import_content=gmail_import_content,
        auto_apply=auto_apply,
    )
    record_job_start(ok=True, route="gmail_import_sort", status=200, code="ok")
    return {"job_id": job_id, "session_id": session_id}


def enqueue_drive_streaming_analyze(
    jobs: dict[str, dict],
    save_jobs: Callable[..., None],
    job_service: JobService,
    req: DriveStreamStartRequest,
    background_tasks: BackgroundTasks,
    auto_apply: bool,
) -> dict[str, str]:
    """
    One job, empty total: ``JobService.run_drive_import_streaming`` classifies as the client
    appends paths from progressive Drive list → import.
    Optional ``req.gmail`` runs Gmail export on the server in parallel with Drive chunks.
    """
    try:
        assert_safe_output_dir(req.output_dir)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    assert_may_start_analyze()
    expanded: list[str] = []
    if req.initial_file_paths:
        exp, expand_err = expand_input_paths(req.initial_file_paths, req.output_dir)
        if expand_err:
            raise HTTPException(status_code=400, detail=expand_err)
        expanded = exp

    gmail_access_token: str | None = None
    gmail_staging_dir: pathlib.Path | None = None
    if req.gmail is not None:
        gmail_access_token = get_valid_access_token()
        if not gmail_access_token:
            raise HTTPException(
                status_code=401,
                detail="Connect Google in the app to include Gmail in this sort.",
            )
        gmail_staging_dir = pathlib.Path(req.output_dir) / ".exosites_gmail_stream" / uuid.uuid4().hex
        gmail_staging_dir.mkdir(parents=True, exist_ok=True)

    job_id = str(uuid.uuid4())
    session_id = req.session_id or job_id

    record = JobRecord(
        id=job_id,
        session_id=session_id,
        total=0,
        completed=0,
        created_at=time.time(),
        updated_at=time.time(),
        config=JobConfig(
            output_dir=req.output_dir,
            model=resolve_job_classify_model(req.model),
            mode=req.mode,
            language=req.language,
            vision_model=req.vision_model,
            rules=req.rules,
            dry_run=req.dry_run,
            on_collision=req.on_collision,
            min_confidence=req.min_confidence,
            tesseract_lang=req.tesseract_lang,
            tesseract_langs=req.tesseract_langs,
            tesseract_auto=req.tesseract_auto,
            sort_system_prompt=req.sort_system_prompt,
            document_briefing_enable=req.document_briefing_enable,
            sort_structure_template=req.sort_structure_template,
        ),
        files=[],
    )
    jobs[job_id] = record.model_dump()
    apply_job_import_sources(jobs[job_id], req.import_sources)
    if req.gmail is not None:
        apply_job_import_sources(jobs[job_id], ["gmail"])
    jobs[job_id]["worker_active"] = True
    jobs[job_id]["drive_import_fetching"] = True
    jobs[job_id]["drive_listing_discovered"] = 0
    if req.gmail is not None:
        g = req.gmail
        cq = canonical_gmail_list_query(g.gmail_query)
        jobs[job_id]["gmail_query"] = cq
        jobs[job_id]["gmail_list_query"] = gmail_list_query_for_import(cq, str(g.gmail_import_content))
        jobs[job_id]["gmail_import_fetching"] = True
        jobs[job_id]["gmail_import_content"] = g.gmail_import_content
        jobs[job_id]["gmail_max_messages"] = g.max_messages
        exact = resolve_gmail_import_message_count(
            gmail_access_token,
            query=g.gmail_query,
            import_content=str(g.gmail_import_content),
            max_messages=int(g.max_messages),
            get_token=get_valid_access_token,
        )
        if exact is not None:
            jobs[job_id]["gmail_messages_total_estimate"] = int(exact)
        else:
            est = estimate_gmail_messages_to_process(
                gmail_access_token,
                query=g.gmail_query,
                import_content=str(g.gmail_import_content),
                max_messages=int(g.max_messages),
            )
            if est is not None:
                jobs[job_id]["gmail_messages_total_estimate"] = int(est)
        jobs[job_id]["gmail_export_messages"] = 0
        jobs[job_id]["gmail_export_text_files"] = 0
        jobs[job_id]["gmail_export_attachment_files"] = 0
        jobs[job_id]["gmail_export_attachment_fetch_failures"] = 0
        jobs[job_id]["gmail_export_staging_capped"] = False
        if g.gmail_ui_parameters_json and str(g.gmail_ui_parameters_json).strip():
            jobs[job_id]["gmail_ui_parameters_json"] = str(g.gmail_ui_parameters_json).strip()[:4096]
        jobs[job_id]["_browser_staging_dirs"] = dedup_staging_dir_strings([gmail_staging_dir])
    save_jobs(force=True)
    job_service.prepare_drive_stream_queue(job_id)
    if req.gmail is not None:
        assert gmail_access_token and gmail_staging_dir
        background_tasks.add_task(
            job_service.run_drive_import_streaming,
            job_id,
            auto_apply=auto_apply,
            initial_file_paths=expanded,
            gmail_query=req.gmail.gmail_query,
            max_messages=req.gmail.max_messages,
            gmail_import_content=req.gmail.gmail_import_content,
            access_token=gmail_access_token,
            gmail_staging_root=gmail_staging_dir,
        )
    else:
        background_tasks.add_task(
            job_service.run_drive_import_streaming,
            job_id,
            auto_apply=auto_apply,
            initial_file_paths=expanded,
        )
    return {"job_id": job_id, "session_id": session_id}


def enqueue_analyze_job(
    jobs: dict[str, dict],
    save_jobs: Callable[..., None],
    job_service: JobService,
    req: FileJobRequest,
    background_tasks: BackgroundTasks,
    auto_apply: bool,
    *,
    browser_staging: pathlib.Path | None = None,
    browser_staging_dirs: list[pathlib.Path] | None = None,
):
    expanded, expand_err = expand_input_paths(req.file_paths, req.output_dir)
    if expand_err:
        record_job_start(ok=False, route="analyze", status=400, code="error")
        raise HTTPException(status_code=400, detail=expand_err)
    if not expanded:
        record_job_start(ok=False, route="analyze", status=400, code="no_files")
        raise HTTPException(status_code=400, detail="No files found in selected paths.")

    extra_dirs: list[pathlib.Path] = list(browser_staging_dirs or [])
    if browser_staging is not None:
        extra_dirs.insert(0, browser_staging)

    return enqueue_analyze_job_core(
        jobs,
        save_jobs,
        job_service,
        req,
        auto_apply,
        expanded,
        extra_dirs,
        background_tasks=background_tasks,
    )


async def enqueue_browser_multipart_job(
    payload: str,
    files: list[UploadFile],
    *,
    jobs: dict[str, dict],
    save_jobs: Callable[..., None],
    job_service: JobService,
    background_tasks: BackgroundTasks,
    auto_apply: bool,
):
    """Save multipart uploads to disk and enqueue the same pipeline as ``/analyze`` or ``/sort``."""
    body = AnalyzeUploadPayload.model_validate_json(payload)
    expanded, staging = await save_browser_uploads(files)
    req = FileJobRequest(
        file_paths=expanded,
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
    return enqueue_analyze_job_core(
        jobs,
        save_jobs,
        job_service,
        req,
        auto_apply,
        expanded,
        [staging],
        background_tasks=background_tasks,
    )
