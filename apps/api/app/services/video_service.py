"""Video processing service."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
import shutil
import subprocess

import cv2
import imageio_ffmpeg

from app.core.errors import ProcessingError
from app.schemas.media import ProcessingOptions
from app.services.censor_service import CensorService
from app.services.detector_service import DetectorService

ProgressCallback = Callable[[int, int, int], None]


class VideoService:
    def __init__(self, detector: DetectorService | None = None, censor: CensorService | None = None) -> None:
        self.detector = detector
        self.censor = censor or CensorService()

    def _find_ffmpeg(self) -> Path | None:
        ffmpeg_path = shutil.which("ffmpeg")
        if ffmpeg_path is not None:
            return Path(ffmpeg_path)

        bundled_path = Path(imageio_ffmpeg.get_ffmpeg_exe())
        if bundled_path.is_file():
            return bundled_path

        return None

    def _merge_audio(self, source_video: Path, processed_video: Path, output_path: Path) -> None:
        ffmpeg_path = self._find_ffmpeg()
        if ffmpeg_path is None:
            raise ProcessingError(
                "FFmpeg is required to preserve audio when processing video. "
                "Install FFmpeg or the imageio-ffmpeg package so a bundled executable is available."
            )

        command = [
            str(ffmpeg_path),
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(processed_video),
            "-i",
            str(source_video),
            "-map",
            "0:v",
            "-map",
            "1:a?",
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            str(output_path),
        ]

        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            raise ProcessingError(
                "Failed to preserve audio while processing video: "
                f"{result.stderr.strip() or result.stdout.strip()}"
            )

    def process_video(
        self,
        input_path: Path,
        output_path: Path,
        options: ProcessingOptions,
        on_progress: ProgressCallback | None = None,
    ) -> Path:
        capture = cv2.VideoCapture(str(input_path))
        if not capture.isOpened():
            raise ProcessingError("Could not open the uploaded video.")

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

        if width <= 0 or height <= 0:
            capture.release()
            raise ProcessingError("Could not determine the video dimensions.")

        temp_video_path = output_path.with_suffix(".tmp.mp4")
        writer = cv2.VideoWriter(
            str(temp_video_path),
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps,
            (width, height),
        )

        if not writer.isOpened():
            capture.release()
            raise ProcessingError("Could not open the output video writer.")

        detect_every = options.detect_every
        cached_faces: list[tuple[int, int, int, int]] = []
        detector = self.detector or DetectorService()
        detector.configure(options)

        if on_progress is not None:
            on_progress(1, 0, total_frames)

        try:
            frame_index = 0
            while True:
                has_frame, frame = capture.read()
                if not has_frame:
                    break

                if frame_index % detect_every == 0 or not cached_faces:
                    cached_faces = detector.detect(frame)

                faces = cached_faces
                processed = self.censor.apply(frame, faces, options.mode, options.intensity)
                writer.write(processed)
                frame_index += 1

                if on_progress is not None and (frame_index % 10 == 0 or frame_index == total_frames):
                    progress = int((frame_index / total_frames) * 98) if total_frames > 0 else 50
                    on_progress(min(progress, 98), frame_index, total_frames)
        finally:
            capture.release()
            writer.release()

        if on_progress is not None:
            on_progress(98, total_frames, total_frames)

        try:
            self._merge_audio(input_path, temp_video_path, output_path)
        finally:
            if temp_video_path.exists():
                temp_video_path.unlink()

        if on_progress is not None:
            on_progress(100, total_frames, total_frames)

        return output_path
