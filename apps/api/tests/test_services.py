from pathlib import Path

import numpy as np

from app.schemas.media import CensorMode, DetectorModel, FilterMode, ProcessingOptions
from app.services.censor_service import CensorService
from app.services.video_service import VideoService
from app.services.job_service import JobService


def test_censor_service_redacts_selected_box():
    frame = np.full((20, 20, 3), 255, dtype=np.uint8)

    processed = CensorService.apply(frame, [(5, 5, 15, 15)], CensorMode.redact, 30)

    assert processed[10, 10].tolist() == [0, 0, 0]
    assert processed[0, 0].tolist() == [255, 255, 255]


def test_job_service_tracks_progress(tmp_path: Path):
    service = JobService()
    job = service.create_job(
        workspace=tmp_path,
        input_path=tmp_path / "input.mp4",
        output_path=tmp_path / "processed.mp4",
        filename="processed.mp4",
        media_type="video/mp4",
        media_kind="video",
        original_name="input.mp4",
        batch_id="batch-1",
    )

    service.set_processing(job.job_id)
    service.update_progress(job.job_id, progress=42, processed_frames=21, total_frames=50)

    stored = service.get_job(job.job_id)
    assert stored is not None
    assert stored.status == "processing"
    assert stored.progress == 42
    assert stored.processed_frames == 21
    assert stored.total_frames == 50

    service.mark_completed(job.job_id)
    payload = service.serialize_job(job)

    assert payload["status"] == "completed"
    assert payload["progress"] == 100
    assert payload["downloadUrl"] == f"/media/jobs/{job.job_id}/download"


def test_processing_options_accept_detector_tuning():
    options = ProcessingOptions(
        mode=CensorMode.blur,
        intensity=30,
        filter_mode=FilterMode.balanced,
        detector_model=DetectorModel.yunet,
        score_threshold=0.62,
        nms_threshold=0.35,
        top_k=3000,
        detect_every=2,
        use_landmark_filter=True,
        min_face_pixels=20,
    )

    assert options.detector_model == DetectorModel.yunet
    assert options.score_threshold == 0.62
    assert options.detect_every == 2


def test_video_service_uses_bundled_ffmpeg_when_path_missing(monkeypatch, tmp_path: Path):
    bundled_ffmpeg = tmp_path / "ffmpeg.exe"
    bundled_ffmpeg.write_bytes(b"")

    monkeypatch.setattr("app.services.video_service.shutil.which", lambda _: None)
    monkeypatch.setattr(
        "app.services.video_service.imageio_ffmpeg.get_ffmpeg_exe",
        lambda: str(bundled_ffmpeg),
    )

    service = VideoService()

    assert service._find_ffmpeg() == bundled_ffmpeg
