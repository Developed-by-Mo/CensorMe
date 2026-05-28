"""Video processing service."""

from __future__ import annotations

from pathlib import Path

import cv2

from app.core.errors import ProcessingError
from app.schemas.media import ProcessingOptions
from app.services.censor_service import CensorService
from app.services.detector_service import DetectorService


class VideoService:
    def __init__(self, detector: DetectorService | None = None, censor: CensorService | None = None) -> None:
        self.detector = detector or DetectorService()
        self.censor = censor or CensorService()

    def process_video(self, input_path: Path, output_path: Path, options: ProcessingOptions) -> Path:
        capture = cv2.VideoCapture(str(input_path))
        if not capture.isOpened():
            raise ProcessingError("Could not open the uploaded video.")

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

        if width <= 0 or height <= 0:
            capture.release()
            raise ProcessingError("Could not determine the video dimensions.")

        writer = cv2.VideoWriter(
            str(output_path),
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps,
            (width, height),
        )

        if not writer.isOpened():
            capture.release()
            raise ProcessingError("Could not open the output video writer.")

        # Detecting every frame is the main cost for long videos.
        # Reuse the last detection result for a few frames to keep output quality
        # acceptable while cutting the processing time substantially.
        detect_every = 4
        cached_faces: list[tuple[int, int, int, int]] = []

        try:
            self.detector.set_filter_mode(options.filter_mode.value)
            frame_index = 0
            while True:
                has_frame, frame = capture.read()
                if not has_frame:
                    break

                if frame_index % detect_every == 0 or not cached_faces:
                    cached_faces = self.detector.detect(frame)

                faces = cached_faces
                processed = self.censor.apply(frame, faces, options.mode, options.intensity)
                writer.write(processed)
                frame_index += 1
        finally:
            capture.release()
            writer.release()

        return output_path
