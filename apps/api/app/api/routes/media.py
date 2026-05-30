"""Media processing endpoints."""

from __future__ import annotations

import asyncio
import json
import threading
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

from app.schemas.media import (
    BatchResponse,
    CensorMode,
    DetectorModel,
    FilterMode,
    JobResponse,
    MediaKind,
    ProcessingOptions,
)
from app.services.job_service import MediaJob, job_service
from app.services.image_service import ImageService
from app.services.video_service import VideoService
from app.utils.file_utils import (
    build_output_path,
    create_job_workspace,
    delete_path,
    infer_media_kind,
    save_upload_file,
    validate_upload_file,
)


router = APIRouter(tags=["media"])
image_service = ImageService()
video_service = VideoService()


def _cleanup_workspace(paths: list[Path]) -> None:
    for path in paths:
        delete_path(path)


def _media_type_for_kind(kind: MediaKind) -> str:
    return "image/png" if kind == MediaKind.image else "video/mp4"


def _output_suffix_for_kind(kind: MediaKind) -> str:
    return ".png" if kind == MediaKind.image else ".mp4"


def _create_options(
    *,
    mode: CensorMode,
    intensity: int,
    filter_mode: FilterMode,
    detector_model: DetectorModel,
    score_threshold: float | None,
    nms_threshold: float | None,
    top_k: int | None,
    detect_every: int,
    use_landmark_filter: bool | None,
    min_face_pixels: int | None,
) -> ProcessingOptions:
    return ProcessingOptions(
        mode=mode,
        intensity=intensity,
        filter_mode=filter_mode,
        detector_model=detector_model,
        score_threshold=score_threshold,
        nms_threshold=nms_threshold,
        top_k=top_k,
        detect_every=detect_every,
        use_landmark_filter=use_landmark_filter,
        min_face_pixels=min_face_pixels,
    )


def _serialize_job_response(job: MediaJob) -> JobResponse:
    return JobResponse.model_validate(job_service.serialize_job(job))


def _process_media_job(job_id: str, options: ProcessingOptions) -> None:
    job = job_service.get_job(job_id)
    if job is None or job.input_path is None or job.output_path is None:
        return

    job_service.set_processing(job_id)

    try:
        if job.media_kind == MediaKind.image.value:
            image_service.process_image(job.input_path, job.output_path, options)
            job_service.update_progress(job_id, progress=100)
        else:
            video_service.process_video(
                job.input_path,
                job.output_path,
                options,
                on_progress=lambda progress, processed, total: job_service.update_progress(
                    job_id,
                    progress=progress,
                    processed_frames=processed,
                    total_frames=total,
                ),
            )

        job_service.mark_completed(job_id)
    except Exception as exc:
        job_service.mark_failed(job_id, str(exc))


async def _create_upload_job(
    upload_file: UploadFile,
    expected_kind: MediaKind | None,
    options: ProcessingOptions,
    *,
    batch_id: str | None = None,
) -> MediaJob:
    media_kind = infer_media_kind(upload_file.filename)
    if expected_kind is not None and media_kind != expected_kind:
        raise HTTPException(status_code=415, detail=f"Expected a {expected_kind.value} file.")

    workspace = create_job_workspace()
    original_name = upload_file.filename or f"input.{media_kind.value}"
    input_path = workspace / original_name
    output_path = build_output_path(workspace, original_name, _output_suffix_for_kind(media_kind))

    await save_upload_file(upload_file, input_path)

    job = job_service.create_job(
        workspace=workspace,
        input_path=input_path,
        output_path=output_path,
        original_name=original_name,
        filename=output_path.name,
        media_kind=media_kind.value,
        media_type=_media_type_for_kind(media_kind),
        batch_id=batch_id,
    )

    thread = threading.Thread(target=_process_media_job, args=(job.job_id, options), daemon=True)
    thread.start()

    return job


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
    detector_model: DetectorModel = Form(default=DetectorModel.auto),
    score_threshold: float | None = Form(default=None, ge=0.05, le=0.95),
    nms_threshold: float | None = Form(default=None, ge=0.05, le=0.90),
    top_k: int | None = Form(default=None, ge=100, le=20000),
    detect_every: int = Form(default=4, ge=1, le=30),
    use_landmark_filter: bool | None = Form(default=None),
    min_face_pixels: int | None = Form(default=None, ge=4, le=200),
) -> FileResponse:
    options = _create_options(
        mode=mode,
        intensity=intensity,
        filter_mode=filter_mode,
        detector_model=detector_model,
        score_threshold=score_threshold,
        nms_threshold=nms_threshold,
        top_k=top_k,
        detect_every=detect_every,
        use_landmark_filter=use_landmark_filter,
        min_face_pixels=min_face_pixels,
    )
    return await _process_upload(file, MediaKind.image, options)


@router.post("/media/video")
async def process_video(
    file: UploadFile = File(...),
    mode: CensorMode = Form(default=CensorMode.blur),
    intensity: int = Form(default=30, ge=1, le=100),
    filter_mode: FilterMode = Form(default=FilterMode.balanced),
    detector_model: DetectorModel = Form(default=DetectorModel.auto),
    score_threshold: float | None = Form(default=None, ge=0.05, le=0.95),
    nms_threshold: float | None = Form(default=None, ge=0.05, le=0.90),
    top_k: int | None = Form(default=None, ge=100, le=20000),
    detect_every: int = Form(default=4, ge=1, le=30),
    use_landmark_filter: bool | None = Form(default=None),
    min_face_pixels: int | None = Form(default=None, ge=4, le=200),
) -> JSONResponse:
    options = _create_options(
        mode=mode,
        intensity=intensity,
        filter_mode=filter_mode,
        detector_model=detector_model,
        score_threshold=score_threshold,
        nms_threshold=nms_threshold,
        top_k=top_k,
        detect_every=detect_every,
        use_landmark_filter=use_landmark_filter,
        min_face_pixels=min_face_pixels,
    )
    job = await _create_upload_job(file, MediaKind.video, options)

    return JSONResponse(status_code=202, content=job_service.serialize_job(job))


@router.post("/media/batch", response_model=BatchResponse)
async def process_batch(
    files: list[UploadFile] = File(...),
    mode: CensorMode = Form(default=CensorMode.blur),
    intensity: int = Form(default=30, ge=1, le=100),
    filter_mode: FilterMode = Form(default=FilterMode.balanced),
    detector_model: DetectorModel = Form(default=DetectorModel.auto),
    score_threshold: float | None = Form(default=None, ge=0.05, le=0.95),
    nms_threshold: float | None = Form(default=None, ge=0.05, le=0.90),
    top_k: int | None = Form(default=None, ge=100, le=20000),
    detect_every: int = Form(default=4, ge=1, le=30),
    use_landmark_filter: bool | None = Form(default=None),
    min_face_pixels: int | None = Form(default=None, ge=4, le=200),
) -> BatchResponse:
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one file.")

    options = _create_options(
        mode=mode,
        intensity=intensity,
        filter_mode=filter_mode,
        detector_model=detector_model,
        score_threshold=score_threshold,
        nms_threshold=nms_threshold,
        top_k=top_k,
        detect_every=detect_every,
        use_landmark_filter=use_landmark_filter,
        min_face_pixels=min_face_pixels,
    )
    batch_id = str(uuid4())
    jobs = [await _create_upload_job(file, None, options, batch_id=batch_id) for file in files]

    return BatchResponse(batch_id=batch_id, jobs=[_serialize_job_response(job) for job in jobs])


@router.get("/media/jobs/{job_id}")
async def get_media_job(job_id: str) -> JSONResponse:
    job = job_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    return JSONResponse(content=job_service.serialize_job(job))


@router.get("/media/jobs/{job_id}/events")
async def stream_media_job_events(job_id: str) -> StreamingResponse:
    if job_service.get_job(job_id) is None:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_stream():
        while True:
            job = job_service.get_job(job_id)
            if job is None:
                yield "event: error\ndata: {\"detail\": \"Job not found\"}\n\n"
                break

            payload = json.dumps(job_service.serialize_job(job))
            yield f"data: {payload}\n\n"

            if job.status in {"completed", "failed"}:
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/media/jobs/{job_id}/download")
async def download_media_job(job_id: str) -> FileResponse:
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
