from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.job_service import job_service


def test_image_route_returns_processed_file(monkeypatch):
    client = TestClient(create_app())

    def fake_process_image(input_path: Path, output_path: Path, options):
        output_path.write_bytes(b"processed image")
        return output_path

    monkeypatch.setattr("app.api.routes.media.image_service.process_image", fake_process_image)

    response = client.post(
        "/api/media/image",
        files={"file": ("face.png", b"fake image", "image/png")},
        data={"mode": "blur", "intensity": "30", "filter_mode": "balanced"},
    )

    assert response.status_code == 200
    assert response.content == b"processed image"


def test_batch_route_creates_jobs_and_reports_completion(monkeypatch):
    client = TestClient(create_app())

    class ImmediateThread:
        def __init__(self, target, args=(), daemon=None):
            self.target = target
            self.args = args

        def start(self):
            self.target(*self.args)

    def fake_process_image(input_path: Path, output_path: Path, options):
        output_path.write_bytes(b"processed image")
        return output_path

    monkeypatch.setattr("app.api.routes.media.threading.Thread", ImmediateThread)
    monkeypatch.setattr("app.api.routes.media.image_service.process_image", fake_process_image)

    response = client.post(
        "/api/media/batch",
        files=[("files", ("face.png", b"fake image", "image/png"))],
        data={
            "mode": "blur",
            "intensity": "30",
            "filter_mode": "balanced",
            "detector_model": "auto",
            "score_threshold": "0.55",
            "nms_threshold": "0.30",
            "top_k": "5000",
            "detect_every": "4",
            "use_landmark_filter": "true",
            "min_face_pixels": "14",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["batchId"]
    assert len(payload["jobs"]) == 1
    assert payload["jobs"][0]["status"] == "completed"
    assert payload["jobs"][0]["progress"] == 100

    job_id = payload["jobs"][0]["jobId"]
    status_response = client.get(f"/api/media/jobs/{job_id}")
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "completed"

    stored_job = job_service.get_job(job_id)
    assert stored_job is not None
    assert stored_job.media_kind == "image"
