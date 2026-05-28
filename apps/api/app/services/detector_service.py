"""Face detection service using YuNet with Haar fallback."""

from __future__ import annotations

from pathlib import Path
import logging

import cv2
import numpy as np

from app.core.config import get_settings


logger = logging.getLogger(__name__)

FaceBox = tuple[int, int, int, int]


class DetectorService:
    def __init__(self, model_path: Path | None = None) -> None:
        settings = get_settings()
        self.model_path = model_path or settings.model_path
        self.backup_model_path = settings.backup_model_path

        self.use_yunet = False
        self.yunet_tried_loading = False
        self.yunet_detector = None

        self.yunet_internal_score_threshold = 0.30
        self.yunet_score_threshold = 0.55
        self.yunet_nms_threshold = 0.30
        self.yunet_top_k = 5000

        self.filter_mode = "balanced"
        self.use_landmark_filter = True
        self.min_face_pixels = 14
        self.min_face_area_ratio = 0.00008
        self.min_aspect_ratio = 0.45
        self.max_aspect_ratio = 1.95
        self.scales = [1.0, 1.5, 2.0]
        self.max_detection_side = 2400
        self.use_haar_fallback = True

        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.cascade = cv2.CascadeClassifier(cascade_path)

        if self.cascade.empty():
            logger.warning("Haar cascade failed to load")

    def set_filter_mode(self, mode: str) -> None:
        if mode not in ("sensitive", "balanced", "strict"):
            mode = "balanced"

        self.filter_mode = mode

        if mode == "sensitive":
            self.yunet_score_threshold = 0.38
            self.scales = [1.0, 2.0, 3.0]
            self.min_face_pixels = 8
            self.min_face_area_ratio = 0.00003
            self.min_aspect_ratio = 0.30
            self.max_aspect_ratio = 2.40
            self.use_landmark_filter = False
        elif mode == "strict":
            self.yunet_score_threshold = 0.70
            self.scales = [1.0, 1.5]
            self.min_face_pixels = 20
            self.min_face_area_ratio = 0.00015
            self.min_aspect_ratio = 0.55
            self.max_aspect_ratio = 1.70
            self.use_landmark_filter = True
        else:
            self.yunet_score_threshold = 0.55
            self.scales = [1.0, 1.5, 2.0]
            self.min_face_pixels = 14
            self.min_face_area_ratio = 0.00008
            self.min_aspect_ratio = 0.45
            self.max_aspect_ratio = 1.95
            self.use_landmark_filter = True

    def _score_threshold_for_scale(self, actual_scale: float) -> float:
        extra = 0.0
        if actual_scale >= 2.5:
            extra = 0.18
        elif actual_scale >= 2.0:
            extra = 0.12
        elif actual_scale >= 1.5:
            extra = 0.07
        return min(0.95, self.yunet_score_threshold + extra)

    def _valid_yunet_landmarks(self, det: np.ndarray, x: float, y: float, bw: float, bh: float) -> bool:
        if not self.use_landmark_filter:
            return True
        if bw <= 0 or bh <= 0:
            return False

        points = [(float(det[4 + i * 2]), float(det[5 + i * 2])) for i in range(5)]
        margin_x = bw * 0.30
        margin_y = bh * 0.30

        inside_count = 0
        for px, py in points:
            if (x - margin_x) <= px <= (x + bw + margin_x) and (y - margin_y) <= py <= (y + bh + margin_y):
                inside_count += 1

        if inside_count < 4:
            return False

        left_eye, right_eye, nose, left_mouth, right_mouth = points
        eye_distance = float(np.hypot(right_eye[0] - left_eye[0], right_eye[1] - left_eye[1]))
        if eye_distance < bw * 0.12 or eye_distance > bw * 0.95:
            return False

        eye_mid_y = (left_eye[1] + right_eye[1]) / 2
        mouth_mid_y = (left_mouth[1] + right_mouth[1]) / 2
        if mouth_mid_y < eye_mid_y - bh * 0.15:
            return False

        _, nose_y = nose
        if nose_y < y - bh * 0.15 or nose_y > y + bh * 1.15:
            return False

        return True

    def _load_yunet(self, frame: np.ndarray) -> None:
        if self.yunet_tried_loading:
            return

        self.yunet_tried_loading = True

        model_path = self.model_path
        if not model_path.exists() and self.backup_model_path.exists():
            model_path = self.backup_model_path

        try:
            if not hasattr(cv2, "FaceDetectorYN_create"):
                logger.warning("OpenCV FaceDetectorYN is unavailable; using Haar fallback")
                return

            if not model_path.exists():
                logger.warning("YuNet model file not found at %s", model_path)
                return

            h, w = frame.shape[:2]
            self.yunet_detector = cv2.FaceDetectorYN_create(
                str(model_path),
                "",
                (w, h),
                self.yunet_internal_score_threshold,
                self.yunet_nms_threshold,
                self.yunet_top_k,
            )
            self.use_yunet = True
        except Exception:
            logger.exception("YuNet could not load; falling back to Haar")
            self.use_yunet = False

    def detect(self, frame: np.ndarray) -> list[FaceBox]:
        self._load_yunet(frame)

        if self.use_yunet and self.yunet_detector is not None:
            faces: list[FaceBox] = []
            for scale in self.scales:
                faces.extend(self._detect_yunet_scaled(frame, scale))
            return self._remove_duplicate_boxes(faces)

        if self.use_haar_fallback:
            return self._remove_duplicate_boxes(self._detect_haar(frame))

        return []

    def _detect_yunet_scaled(self, frame: np.ndarray, scale: float) -> list[FaceBox]:
        h, w = frame.shape[:2]
        target_w = int(w * scale)
        target_h = int(h * scale)

        if max(target_w, target_h) > self.max_detection_side:
            if scale == 1.0:
                actual_scale = 1.0
            else:
                return []
        else:
            actual_scale = scale

        if actual_scale == 1.0:
            work_frame = frame
        else:
            work_frame = cv2.resize(frame, None, fx=actual_scale, fy=actual_scale, interpolation=cv2.INTER_CUBIC)

        wh, ww = work_frame.shape[:2]

        try:
            self.yunet_detector.setInputSize((ww, wh))
        except Exception:
            self.yunet_detector = cv2.FaceDetectorYN_create(
                str(self.model_path),
                "",
                (ww, wh),
                self.yunet_internal_score_threshold,
                self.yunet_nms_threshold,
                self.yunet_top_k,
            )

        _, detections = self.yunet_detector.detect(work_frame)
        faces: list[FaceBox] = []

        if detections is None:
            return faces

        for det in detections:
            x = float(det[0])
            y = float(det[1])
            bw = float(det[2])
            bh = float(det[3])
            score = float(det[14])

            if score < self._score_threshold_for_scale(actual_scale):
                continue
            if bw <= 0 or bh <= 0:
                continue
            if not self._valid_yunet_landmarks(det, x, y, bw, bh):
                continue

            x1 = int(x / actual_scale)
            y1 = int(y / actual_scale)
            x2 = int((x + bw) / actual_scale)
            y2 = int((y + bh) / actual_scale)

            box_w = x2 - x1
            box_h = y2 - y1
            if box_w <= 0 or box_h <= 0:
                continue

            aspect_ratio = box_w / box_h
            if aspect_ratio < self.min_aspect_ratio or aspect_ratio > self.max_aspect_ratio:
                continue

            frame_area = w * h
            box_area = box_w * box_h
            area_ratio = box_area / frame_area
            if area_ratio > 0.80 or area_ratio < self.min_face_area_ratio:
                continue
            if box_w < self.min_face_pixels or box_h < self.min_face_pixels:
                continue

            pad_x = int(box_w * 0.25)
            pad_y = int(box_h * 0.35)
            x1 = max(0, x1 - pad_x)
            y1 = max(0, y1 - pad_y)
            x2 = min(w, x2 + pad_x)
            y2 = min(h, y2 + pad_y)

            if x2 > x1 and y2 > y1:
                faces.append((x1, y1, x2, y2))

        return faces

    def _detect_haar(self, frame: np.ndarray) -> list[FaceBox]:
        h, w = frame.shape[:2]
        frame_area = w * h

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)

        min_face_size = int(min(w, h) * 0.045)
        min_face_size = max(35, min_face_size)

        haar_faces = self.cascade.detectMultiScale(
            gray,
            scaleFactor=1.06,
            minNeighbors=7,
            minSize=(min_face_size, min_face_size),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )

        faces: list[FaceBox] = []
        for (x, y, fw, fh) in haar_faces:
            area_ratio = (fw * fh) / frame_area
            aspect_ratio = fw / fh

            if area_ratio < 0.001 or area_ratio > 0.70:
                continue
            if aspect_ratio < 0.45 or aspect_ratio > 1.90:
                continue

            faces.append((x, y, x + fw, y + fh))

        return faces

    def _remove_duplicate_boxes(self, boxes: list[FaceBox]) -> list[FaceBox]:
        if len(boxes) <= 1:
            return boxes

        boxes = sorted(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)
        kept: list[FaceBox] = []

        for box in boxes:
            if all(self._iou(box, kept_box) <= 0.30 for kept_box in kept):
                kept.append(box)

        return kept

    def _iou(self, box_a: FaceBox, box_b: FaceBox) -> float:
        ax1, ay1, ax2, ay2 = box_a
        bx1, by1, bx2, by2 = box_b

        inter_x1 = max(ax1, bx1)
        inter_y1 = max(ay1, by1)
        inter_x2 = min(ax2, bx2)
        inter_y2 = min(ay2, by2)

        inter_w = max(0, inter_x2 - inter_x1)
        inter_h = max(0, inter_y2 - inter_y1)

        inter_area = inter_w * inter_h
        area_a = (ax2 - ax1) * (ay2 - ay1)
        area_b = (bx2 - bx1) * (by2 - by1)
        union_area = area_a + area_b - inter_area

        if union_area == 0:
            return 0.0
        return inter_area / union_area
