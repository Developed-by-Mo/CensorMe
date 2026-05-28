"""Shared media processing schemas."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class CensorMode(str, Enum):
    blur = "blur"
    pixelate = "pixelate"
    redact = "redact"


class FilterMode(str, Enum):
    sensitive = "sensitive"
    balanced = "balanced"
    strict = "strict"


class MediaKind(str, Enum):
    image = "image"
    video = "video"


class ProcessingOptions(BaseModel):
    mode: CensorMode = Field(default=CensorMode.blur)
    intensity: int = Field(default=30, ge=1, le=100)
    filter_mode: FilterMode = Field(default=FilterMode.balanced)

