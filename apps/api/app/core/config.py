"""Application settings for the CensorMe API."""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
import os


PROJECT_ROOT = Path(__file__).resolve().parents[4]

DEFAULT_IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".bmp", ".webp"})
DEFAULT_VIDEO_EXTENSIONS = frozenset({".mp4", ".avi", ".mov", ".mkv", ".webm"})


def _parse_csv_env(value: str | None, default: tuple[str, ...]) -> tuple[str, ...]:
    if not value:
        return default
    values = tuple(item.strip() for item in value.split(",") if item.strip())
    return values or default


@dataclass(frozen=True)
class Settings:
    app_name: str = "CensorMe API"
    api_prefix: str = "/api"
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: _parse_csv_env(
            os.getenv("CENSOR_ME_CORS_ORIGINS"),
            (
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3001",
            ),
        )
    )
    cors_origin_regex: str | None = os.getenv(
        "CENSOR_ME_CORS_ORIGIN_REGEX",
        r"^https?://(localhost|127\.0\.0\.1):\d+$",
    )
    model_path: Path = PROJECT_ROOT / "face_detection_yunet_2023mar.onnx"
    backup_model_path: Path = PROJECT_ROOT / "apps" / "api" / "app" / "assets" / "face_detection_yunet_2023mar.onnx"
    max_upload_size_mb: int = 250
    image_extensions: frozenset[str] = DEFAULT_IMAGE_EXTENSIONS
    video_extensions: frozenset[str] = DEFAULT_VIDEO_EXTENSIONS

    @property
    def allowed_extensions(self) -> frozenset[str]:
        return self.image_extensions | self.video_extensions


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
