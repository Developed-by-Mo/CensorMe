"""In-memory media job tracking for long-running media processing."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Literal
from uuid import uuid4


JobStatus = Literal["queued", "processing", "completed", "failed"]


@dataclass
class MediaJob:
    job_id: str
    status: JobStatus = "queued"
    workspace: Path | None = None
    input_path: Path | None = None
    output_path: Path | None = None
    original_name: str | None = None
    filename: str | None = None
    media_kind: str = "video"
    media_type: str = "video/mp4"
    batch_id: str | None = None
    progress: int = 0
    processed_frames: int = 0
    total_frames: int = 0
    error: str | None = None
    review_frame_path: Path | None = None
    review_width: int = 0
    review_height: int = 0
    selectable_faces: list[dict[str, int | str]] = field(default_factory=list)
    review_video_width: int = 0
    review_video_height: int = 0
    review_video_fps: float = 0.0
    review_detections: list[dict[str, object]] = field(default_factory=list)


class JobService:
    def __init__(self) -> None:
        self._jobs: dict[str, MediaJob] = {}
        self._lock = Lock()

    def create_job(
        self,
        *,
        workspace: Path,
        input_path: Path,
        output_path: Path,
        filename: str,
        media_type: str,
        media_kind: str,
        original_name: str | None = None,
        batch_id: str | None = None,
    ) -> MediaJob:
        job = MediaJob(
            job_id=str(uuid4()),
            workspace=workspace,
            input_path=input_path,
            output_path=output_path,
            filename=filename,
            media_type=media_type,
            media_kind=media_kind,
            original_name=original_name,
            batch_id=batch_id,
        )

        with self._lock:
            self._jobs[job.job_id] = job

        return job

    def get_job(self, job_id: str) -> MediaJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def get_batch_jobs(self, batch_id: str) -> list[MediaJob]:
        with self._lock:
            return [job for job in self._jobs.values() if job.batch_id == batch_id]

    def set_processing(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.status = "processing"
                job.progress = max(job.progress, 1)

    def update_progress(
        self,
        job_id: str,
        *,
        progress: int,
        processed_frames: int | None = None,
        total_frames: int | None = None,
    ) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return

            job.progress = max(0, min(100, int(progress)))
            if processed_frames is not None:
                job.processed_frames = max(0, int(processed_frames))
            if total_frames is not None:
                job.total_frames = max(0, int(total_frames))

    def set_review_data(
        self,
        job_id: str,
        *,
        review_frame_path: Path | None,
        review_width: int,
        review_height: int,
        selectable_faces: list[dict[str, int | str]],
        review_video_width: int = 0,
        review_video_height: int = 0,
        review_video_fps: float = 0.0,
        review_detections: list[dict[str, object]] | None = None,
    ) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return

            job.review_frame_path = review_frame_path
            job.review_width = max(0, int(review_width))
            job.review_height = max(0, int(review_height))
            job.selectable_faces = selectable_faces
            job.review_video_width = max(0, int(review_video_width))
            job.review_video_height = max(0, int(review_video_height))
            job.review_video_fps = max(0.0, float(review_video_fps))
            job.review_detections = review_detections or []

    def mark_completed(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.status = "completed"
                job.progress = 100
                job.error = None

    def mark_failed(self, job_id: str, error: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.status = "failed"
                job.error = error

    def serialize_job(self, job: MediaJob) -> dict[str, object]:
        has_review_frame = job.review_frame_path is not None and job.review_frame_path.exists()
        has_review_detections = bool(job.review_detections)
        return {
            "jobId": job.job_id,
            "status": job.status,
            "mediaKind": job.media_kind,
            "originalName": job.original_name,
            "filename": job.filename,
            "mediaType": job.media_type,
            "progress": job.progress,
            "processedFrames": job.processed_frames,
            "totalFrames": job.total_frames,
            "error": job.error,
            "downloadUrl": f"/media/jobs/{job.job_id}/download" if job.status == "completed" else None,
            "eventsUrl": f"/media/jobs/{job.job_id}/events",
            "reviewFrameUrl": f"/media/jobs/{job.job_id}/review-frame" if has_review_frame else None,
            "reviewDetectionsUrl": f"/media/jobs/{job.job_id}/review-detections" if has_review_detections else None,
            "reviewWidth": job.review_width,
            "reviewHeight": job.review_height,
            "videoWidth": job.review_video_width,
            "videoHeight": job.review_video_height,
            "videoFps": job.review_video_fps,
            "selectableFaces": job.selectable_faces,
        }


job_service = JobService()
