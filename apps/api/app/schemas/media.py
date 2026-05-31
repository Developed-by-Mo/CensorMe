"""Shared media processing schemas."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class CensorMode(str, Enum):
    blur = "blur"
    pixelate = "pixelate"
    redact = "redact"


class FilterMode(str, Enum):
    sensitive = "sensitive"
    balanced = "balanced"
    strict = "strict"


class DetectorModel(str, Enum):
    auto = "auto"
    yunet = "yunet"
    haar = "haar"


class MediaKind(str, Enum):
    image = "image"
    video = "video"


class ProcessingOptions(BaseModel):
    mode: CensorMode = Field(default=CensorMode.blur)
    intensity: int = Field(default=30, ge=1, le=100)
    filter_mode: FilterMode = Field(default=FilterMode.balanced)

    detector_model: DetectorModel = Field(default=DetectorModel.auto)
    score_threshold: float | None = Field(default=None, ge=0.05, le=0.95)
    nms_threshold: float | None = Field(default=None, ge=0.05, le=0.90)
    top_k: int | None = Field(default=None, ge=100, le=20000)
    detect_every: int = Field(default=4, ge=1, le=30)
    use_landmark_filter: bool | None = Field(default=None)
    min_face_pixels: int | None = Field(default=None, ge=4, le=200)


class JobResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    job_id: str = Field(alias="jobId")
    status: str
    media_kind: str = Field(alias="mediaKind")
    original_name: str | None = Field(default=None, alias="originalName")
    filename: str | None = None
    media_type: str = Field(alias="mediaType")
    progress: int = 0
    processed_frames: int = Field(default=0, alias="processedFrames")
    total_frames: int = Field(default=0, alias="totalFrames")
    error: str | None = None
    download_url: str | None = Field(default=None, alias="downloadUrl")
    events_url: str | None = Field(default=None, alias="eventsUrl")


class BatchResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    batch_id: str = Field(alias="batchId")
    jobs: list[JobResponse]
