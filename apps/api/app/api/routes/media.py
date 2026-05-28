"""Media processing endpoints."""

from __future__ import annotations

import threading
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.schemas.media import CensorMode, FilterMode, MediaKind, ProcessingOptions
from app.services.job_service import job_service
from app.services.image_service import ImageService
from app.services.video_service import VideoService
from app.utils.file_utils import build_output_path, create_job_workspace, delete_path, save_upload_file, validate_upload_file


router = APIRouter(tags=["media"])
image_service = ImageService()
video_service = VideoService()


def _cleanup_workspace(paths: list[Path]) -> None:
    for path in paths:
        delete_path(path)


def _process_video_job(job_id: str, options: ProcessingOptions) -> None:
    job = job_service.get_job(job_id)
    if job is None or job.input_path is None or job.output_path is None:
        return

    job_service.set_processing(job_id)

    try:
        video_service.process_video(job.input_path, job.output_path, options)
        job_service.mark_completed(job_id)
    except Exception as exc:
        job_service.mark_failed(job_id, str(exc))



async def _process_upload(
    upload_file: UploadFile,
    expected_kind: MediaKind,
    options: ProcessingOptions,
) -> FileResponse:
    validate_upload_file(upload_file, expected_kind)

    workspace = create_job_workspace()
    input_path = workspace / (upload_file.filename or f"input.{expected_kind.value}")
    output_suffix = ".png" if expected_kind == MediaKind.image else ".mp4"
    output_path = build_output_path(workspace, upload_file.filename or expected_kind.value, output_suffix)

    await save_upload_file(upload_file, input_path)

    if expected_kind == MediaKind.image:
        image_service.process_image(input_path, output_path, options)
        response_media_type = "image/png"
    else:
        video_service.process_video(input_path, output_path, options)
        response_media_type = "video/mp4"

    background = BackgroundTask(_cleanup_workspace, [workspace])
    return FileResponse(
        path=str(output_path),
        filename=output_path.name,
        media_type=response_media_type,
        background=background,
    )


@router.post("/media/image")
async def process_image(
    file: UploadFile = File(...),
    mode: CensorMode = Form(default=CensorMode.blur),
    intensity: int = Form(default=30, ge=1, le=100),
    filter_mode: FilterMode = Form(default=FilterMode.balanced),
) -> FileResponse:
    options = ProcessingOptions(mode=mode, intensity=intensity, filter_mode=filter_mode)
    return await _process_upload(file, MediaKind.image, options)


@router.post("/media/video")
async def process_video(
    file: UploadFile = File(...),
    mode: CensorMode = Form(default=CensorMode.blur),
    intensity: int = Form(default=30, ge=1, le=100),
    filter_mode: FilterMode = Form(default=FilterMode.balanced),
) -> JSONResponse:
    options = ProcessingOptions(mode=mode, intensity=intensity, filter_mode=filter_mode)
    validate_upload_file(file, MediaKind.video)

    workspace = create_job_workspace()
    input_path = workspace / (file.filename or "input.mp4")
    output_path = build_output_path(workspace, file.filename or "video", ".mp4")

    await save_upload_file(file, input_path)

    job = job_service.create_job(
        workspace=workspace,
        input_path=input_path,
        output_path=output_path,
        filename=output_path.name,
        media_type="video/mp4",
    )

    thread = threading.Thread(target=_process_video_job, args=(job.job_id, options), daemon=True)
    thread.start()

    return JSONResponse(
        status_code=202,
        content={
            "jobId": job.job_id,
            "status": job.status,
            "downloadUrl": f"/media/jobs/{job.job_id}/download",
        },
    )


@router.get("/media/jobs/{job_id}")
async def get_video_job(job_id: str) -> JSONResponse:
    job = job_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    return JSONResponse(
        content={
            "jobId": job.job_id,
            "status": job.status,
            "error": job.error,
            "downloadUrl": f"/media/jobs/{job.job_id}/download" if job.status == "completed" else None,
        }
    )


@router.get("/media/jobs/{job_id}/download")
async def download_video_job(job_id: str) -> FileResponse:
    job = job_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != "completed" or job.output_path is None or not job.output_path.exists():
        raise HTTPException(status_code=409, detail="Job is not ready yet")

    if job.workspace is None:
        raise HTTPException(status_code=500, detail="Job workspace missing")

    background = BackgroundTask(_cleanup_workspace, [job.workspace])
    return FileResponse(
        path=str(job.output_path),
        filename=job.filename or job.output_path.name,
        media_type=job.media_type,
        background=background,
    )
