"""In-memory media job tracking for long-running video processing."""

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
    filename: str | None = None
    media_type: str = "video/mp4"
    error: str | None = None


class JobService:
    def __init__(self) -> None:
        self._jobs: dict[str, MediaJob] = {}
        self._lock = Lock()

    def create_job(self, *, workspace: Path, input_path: Path, output_path: Path, filename: str, media_type: str) -> MediaJob:
        job = MediaJob(
            job_id=str(uuid4()),
            workspace=workspace,
            input_path=input_path,
            output_path=output_path,
            filename=filename,
            media_type=media_type,
        )

        with self._lock:
            self._jobs[job.job_id] = job

        return job

    def get_job(self, job_id: str) -> MediaJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def set_processing(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.status = "processing"

    def mark_completed(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.status = "completed"
                job.error = None

    def mark_failed(self, job_id: str, error: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.status = "failed"
                job.error = error


job_service = JobService()
