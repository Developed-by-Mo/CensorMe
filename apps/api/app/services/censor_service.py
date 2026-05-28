"""Frame censoring utilities."""

from __future__ import annotations

import cv2
import numpy as np

from app.schemas.media import CensorMode


class CensorService:
    @staticmethod
    def apply(frame: np.ndarray, faces: list[tuple[int, int, int, int]], mode: CensorMode | str, intensity: int) -> np.ndarray:
        output = frame.copy()
        selected_mode = mode.value if isinstance(mode, CensorMode) else str(mode)

        for (x1, y1, x2, y2) in faces:
            roi = output[y1:y2, x1:x2]
            if roi.size == 0:
                continue

            if selected_mode == "blur":
                kernel_size = int(np.interp(intensity, [1, 100], [3, 99])) | 1
                output[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (kernel_size, kernel_size), 0)
            elif selected_mode == "pixelate":
                block = max(3, int(np.interp(intensity, [1, 100], [3, 40])))
                height, width = roi.shape[:2]
                small = cv2.resize(
                    roi,
                    (max(1, width // block), max(1, height // block)),
                    interpolation=cv2.INTER_LINEAR,
                )
                output[y1:y2, x1:x2] = cv2.resize(small, (width, height), interpolation=cv2.INTER_NEAREST)
            elif selected_mode == "redact":
                output[y1:y2, x1:x2] = 0

        return output
