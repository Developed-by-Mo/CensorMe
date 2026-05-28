"""File validation and temporary workspace helpers."""

from __future__ import annotations

from pathlib import Path
import shutil
import tempfile

from fastapi import UploadFile

from app.core.config import get_settings
from app.core.errors import UnsupportedMediaTypeError
from app.schemas.media import MediaKind


def create_job_workspace(prefix: str = "censorme-") -> Path:
    return Path(tempfile.mkdtemp(prefix=prefix))


def delete_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
    elif path.exists():
        try:
            path.unlink()
        except OSError:
            pass


def get_extension(filename: str | None) -> str:
    if not filename:
        return ""
    return Path(filename).suffix.lower()


def infer_media_kind(filename: str | None) -> MediaKind:
    extension = get_extension(filename)
    settings = get_settings()
    if extension in settings.image_extensions:
        return MediaKind.image
    if extension in settings.video_extensions:
        return MediaKind.video
    raise UnsupportedMediaTypeError("Unsupported file type. Upload an image or video.")


def validate_upload_file(upload_file: UploadFile, expected_kind: MediaKind) -> None:
    actual_kind = infer_media_kind(upload_file.filename)
    if actual_kind != expected_kind:
        raise UnsupportedMediaTypeError(f"Expected a {expected_kind.value} file.")


async def save_upload_file(upload_file: UploadFile, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    upload_file.file.seek(0)
    with destination.open("wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)
    return destination


def build_output_path(workspace: Path, filename: str, suffix: str | None = None) -> Path:
    extension = suffix or Path(filename).suffix or ".bin"
    return workspace / f"processed{extension}"

