"""Image processing service."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2

from app.core.errors import ProcessingError
from app.schemas.media import ProcessingOptions
from app.services.censor_service import CensorService
from app.services.detector_service import DetectorService


@dataclass(frozen=True)
class ImageSelectableFace:
    id: int
    x1: int
    y1: int
    x2: int
    y2: int
    frame_index: int = 0

    def to_dict(self) -> dict[str, int | str]:
        return {
            "id": self.id,
            "label": f"Face {self.id + 1}",
            "x1": self.x1,
            "y1": self.y1,
            "x2": self.x2,
            "y2": self.y2,
            "sourceFrameIndex": self.frame_index,
        }


@dataclass(frozen=True)
class ImageProcessingResult:
    output_path: Path
    review_frame_path: Path | None
    review_width: int
    review_height: int
    selectable_faces: list[dict[str, int | str]]


class ImageService:
    def __init__(self, detector: DetectorService | None = None, censor: CensorService | None = None) -> None:
        self.detector = detector
        self.censor = censor or CensorService()

    def process_image(
        self,
        input_path: Path,
        output_path: Path,
        options: ProcessingOptions,
        *,
        excluded_face_ids: set[int] | None = None,
        review_frame_path: Path | None = None,
    ) -> ImageProcessingResult:
        frame = cv2.imread(str(input_path))
        if frame is None:
            raise ProcessingError("Could not read the uploaded image.")

        detector = self.detector or DetectorService()
        detector.configure(options)

        all_faces = detector.detect(frame)
        excluded = excluded_face_ids or set()
        faces_to_censor = [face for index, face in enumerate(all_faces) if index not in excluded]
        processed = self.censor.apply(frame, faces_to_censor, options.mode, options.intensity)

        if not cv2.imwrite(str(output_path), processed):
            raise ProcessingError("Could not write the processed image.")

        h, w = frame.shape[:2]
        saved_review_path: Path | None = None
        selectable_faces = [
            ImageSelectableFace(id=index, x1=x1, y1=y1, x2=x2, y2=y2).to_dict()
            for index, (x1, y1, x2, y2) in enumerate(all_faces)
        ]

        if review_frame_path is not None and selectable_faces:
            review_frame_path.parent.mkdir(parents=True, exist_ok=True)
            if cv2.imwrite(str(review_frame_path), frame):
                saved_review_path = review_frame_path

        return ImageProcessingResult(
            output_path=output_path,
            review_frame_path=saved_review_path,
            review_width=w,
            review_height=h,
            selectable_faces=selectable_faces,
        )
