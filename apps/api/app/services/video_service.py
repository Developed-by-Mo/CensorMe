"""Video processing service."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
import math
import shutil
import subprocess
import cv2
import imageio_ffmpeg
import numpy as np

from app.core.errors import ProcessingError
from app.schemas.media import ProcessingOptions
from app.services.censor_service import CensorService
from app.services.detector_service import DetectorService

ProgressCallback = Callable[[int, int, int], None]
FaceBox = tuple[int, int, int, int]
TrackedFace = tuple[FaceBox, int]
ReviewDetectionFrame = dict[str, object]


@dataclass
class _TrackState:
    track_id: int
    box: FaceBox
    last_seen_frame: int
    hit_count: int = 1
    crop: np.ndarray | None = None
    source_box: FaceBox | None = None
    source_frame_index: int = 0


@dataclass(frozen=True)
class VideoProcessingResult:
    output_path: Path
    review_frame_path: Path | None
    review_width: int
    review_height: int
    selectable_faces: list[dict[str, int | str]]
    video_width: int
    video_height: int
    video_fps: float
    review_detections: list[ReviewDetectionFrame]


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

    @staticmethod
    def _box_iou(a: FaceBox, b: FaceBox) -> float:
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
        intersection = iw * ih
        if intersection <= 0:
            return 0.0

        area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
        area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
        union = area_a + area_b - intersection
        if union <= 0:
            return 0.0
        return intersection / union

    @staticmethod
    def _center_distance_ratio(a: FaceBox, b: FaceBox) -> float:
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        acx, acy = (ax1 + ax2) / 2, (ay1 + ay2) / 2
        bcx, bcy = (bx1 + bx2) / 2, (by1 + by2) / 2
        distance = math.hypot(acx - bcx, acy - bcy)
        avg_w = max(1.0, ((ax2 - ax1) + (bx2 - bx1)) / 2)
        avg_h = max(1.0, ((ay2 - ay1) + (by2 - by1)) / 2)
        return distance / math.hypot(avg_w, avg_h)

    @staticmethod
    def _crop_face(frame: np.ndarray, box: FaceBox) -> np.ndarray | None:
        height, width = frame.shape[:2]
        x1, y1, x2, y2 = box
        box_w = max(1, x2 - x1)
        box_h = max(1, y2 - y1)
        pad_x = int(box_w * 0.45)
        pad_y = int(box_h * 0.55)
        cx1 = max(0, x1 - pad_x)
        cy1 = max(0, y1 - pad_y)
        cx2 = min(width, x2 + pad_x)
        cy2 = min(height, y2 + pad_y)
        crop = frame[cy1:cy2, cx1:cx2]
        if crop.size == 0:
            return None
        return crop.copy()

    def _assign_tracks(
        self,
        faces: list[FaceBox],
        tracks: dict[int, _TrackState],
        frame: np.ndarray,
        frame_index: int,
        next_track_id: int,
        *,
        max_review_faces: int,
        active_window: int,
    ) -> tuple[list[TrackedFace], int]:
        tracked_faces: list[TrackedFace] = []
        used_track_ids: set[int] = set()

        for face in faces:
            best_track: _TrackState | None = None
            best_score = -1.0

            for track in tracks.values():
                if track.track_id in used_track_ids:
                    continue
                if frame_index - track.last_seen_frame > active_window:
                    continue

                iou = self._box_iou(face, track.box)
                distance_ratio = self._center_distance_ratio(face, track.box)
                distance_score = max(0.0, 1.0 - distance_ratio)
                score = (iou * 1.4) + distance_score

                if (iou >= 0.18 or distance_ratio <= 0.70) and score > best_score:
                    best_track = track
                    best_score = score

            if best_track is None:
                crop = self._crop_face(frame, face) if len(tracks) < max_review_faces else None
                best_track = _TrackState(
                    track_id=next_track_id,
                    box=face,
                    last_seen_frame=frame_index,
                    crop=crop,
                    source_box=face,
                    source_frame_index=frame_index,
                )
                tracks[next_track_id] = best_track
                next_track_id += 1
            else:
                best_track.box = face
                best_track.last_seen_frame = frame_index
                best_track.hit_count += 1
                if best_track.crop is None and best_track.track_id < max_review_faces:
                    best_track.crop = self._crop_face(frame, face)
                    best_track.source_box = face
                    best_track.source_frame_index = frame_index

            used_track_ids.add(best_track.track_id)
            tracked_faces.append((face, best_track.track_id))

        return tracked_faces, next_track_id

    def _build_review_contact_sheet(
        self,
        tracks: dict[int, _TrackState],
        review_frame_path: Path | None,
        *,
        max_review_faces: int,
    ) -> tuple[Path | None, int, int, list[dict[str, int | str]]]:
        selectable_tracks = [
            track for track in sorted(tracks.values(), key=lambda item: item.track_id)
            if track.crop is not None
        ][:max_review_faces]

        if review_frame_path is None or not selectable_tracks:
            return None, 0, 0, []

        tile_size = 180
        label_height = 26
        padding = 12
        columns = min(4, len(selectable_tracks))
        rows = int(math.ceil(len(selectable_tracks) / columns))
        width = columns * tile_size
        height = rows * tile_size
        sheet = np.full((height, width, 3), (8, 11, 16), dtype=np.uint8)
        selectable_faces: list[dict[str, int | str]] = []

        for index, track in enumerate(selectable_tracks):
            row = index // columns
            col = index % columns
            tile_x = col * tile_size
            tile_y = row * tile_size
            inner_x = tile_x + padding
            inner_y = tile_y + padding + label_height
            inner_w = tile_size - padding * 2
            inner_h = tile_size - padding * 2 - label_height

            crop = track.crop
            if crop is None or crop.size == 0:
                continue

            crop_h, crop_w = crop.shape[:2]
            scale = min(inner_w / max(1, crop_w), inner_h / max(1, crop_h))
            resized_w = max(1, int(crop_w * scale))
            resized_h = max(1, int(crop_h * scale))
            resized = cv2.resize(crop, (resized_w, resized_h), interpolation=cv2.INTER_AREA)
            paste_x = inner_x + (inner_w - resized_w) // 2
            paste_y = inner_y + (inner_h - resized_h) // 2
            sheet[paste_y:paste_y + resized_h, paste_x:paste_x + resized_w] = resized

            label = f"Face {track.track_id + 1}"
            cv2.putText(
                sheet,
                label,
                (tile_x + padding, tile_y + 20),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (230, 237, 244),
                1,
                cv2.LINE_AA,
            )
            cv2.rectangle(
                sheet,
                (tile_x + 6, tile_y + 6),
                (tile_x + tile_size - 6, tile_y + tile_size - 6),
                (80, 95, 110),
                1,
            )

            source_box = track.source_box or track.box
            selectable_faces.append(
                {
                    "id": track.track_id,
                    "label": label,
                    "x1": tile_x + 6,
                    "y1": tile_y + 6,
                    "x2": tile_x + tile_size - 6,
                    "y2": tile_y + tile_size - 6,
                    "sourceFrameIndex": track.source_frame_index,
                    "sourceX1": source_box[0],
                    "sourceY1": source_box[1],
                    "sourceX2": source_box[2],
                    "sourceY2": source_box[3],
                }
            )

        review_frame_path.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(review_frame_path), sheet):
            return None, 0, 0, []

        return review_frame_path, width, height, selectable_faces

    def process_video(
        self,
        input_path: Path,
        output_path: Path,
        options: ProcessingOptions,
        on_progress: ProgressCallback | None = None,
        *,
        excluded_track_ids: set[int] | None = None,
        review_frame_path: Path | None = None,
        max_review_faces: int = 48,
    ) -> VideoProcessingResult:
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
        excluded = excluded_track_ids or set()
        cached_tracked_faces: list[TrackedFace] = []
        detector = self.detector or DetectorService()
        detector.configure(options)
        tracks: dict[int, _TrackState] = {}
        next_track_id = 0
        active_window = max(30, detect_every * 12)
        review_detections: list[ReviewDetectionFrame] = []
        max_review_detection_frames = 900
        estimated_detection_frames = int(math.ceil(total_frames / max(1, detect_every))) if total_frames > 0 else 0
        review_detection_stride = max(1, int(math.ceil(estimated_detection_frames / max_review_detection_frames)))

        if on_progress is not None:
            on_progress(1, 0, total_frames)

        try:
            frame_index = 0
            while True:
                has_frame, frame = capture.read()
                if not has_frame:
                    break

                should_detect = frame_index % detect_every == 0 or not cached_tracked_faces
                if should_detect:
                    faces = detector.detect(frame)
                    cached_tracked_faces, next_track_id = self._assign_tracks(
                        faces,
                        tracks,
                        frame,
                        frame_index,
                        next_track_id,
                        max_review_faces=max_review_faces,
                        active_window=active_window,
                    )

                    detection_sample_index = frame_index // max(1, detect_every)
                    if cached_tracked_faces and detection_sample_index % review_detection_stride == 0:
                        review_detections.append(
                            {
                                "frameIndex": frame_index,
                                "time": frame_index / max(fps, 1.0),
                                "faces": [
                                    {
                                        "id": track_id,
                                        "label": f"Face {track_id + 1}",
                                        "x1": face[0],
                                        "y1": face[1],
                                        "x2": face[2],
                                        "y2": face[3],
                                    }
                                    for face, track_id in cached_tracked_faces
                                ],
                            }
                        )

                faces_to_censor = [face for face, track_id in cached_tracked_faces if track_id not in excluded]
                processed = self.censor.apply(frame, faces_to_censor, options.mode, options.intensity)
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

        review_path, review_width, review_height, selectable_faces = self._build_review_contact_sheet(
            tracks,
            review_frame_path,
            max_review_faces=max_review_faces,
        )

        if on_progress is not None:
            on_progress(100, total_frames, total_frames)

        return VideoProcessingResult(
            output_path=output_path,
            review_frame_path=review_path,
            review_width=review_width,
            review_height=review_height,
            selectable_faces=selectable_faces,
            video_width=width,
            video_height=height,
            video_fps=fps,
            review_detections=review_detections,
        )
