"""Image processing service."""

from __future__ import annotations

from pathlib import Path

import cv2

from app.core.errors import ProcessingError
from app.schemas.media import ProcessingOptions
from app.services.censor_service import CensorService
from app.services.detector_service import DetectorService


class ImageService:
    def __init__(self, detector: DetectorService | None = None, censor: CensorService | None = None) -> None:
        self.detector = detector
        self.censor = censor or CensorService()

    def process_image(self, input_path: Path, output_path: Path, options: ProcessingOptions) -> Path:
        frame = cv2.imread(str(input_path))
        if frame is None:
            raise ProcessingError("Could not read the uploaded image.")

        detector = self.detector or DetectorService()
        detector.configure(options)

        faces = detector.detect(frame)
        processed = self.censor.apply(frame, faces, options.mode, options.intensity)

        if not cv2.imwrite(str(output_path), processed):
            raise ProcessingError("Could not write the processed image.")

        return output_path
