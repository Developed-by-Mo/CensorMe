# CensorMe

CensorMe is a portfolio-grade face censoring app that detects faces in images and videos and applies blur, pixelation, or redaction before returning the processed media for download.

The project started as a single Tkinter script called FaceLock. It has been restructured into a clean monorepo with a FastAPI backend and a Next.js frontend so the processing logic can be tested, extended, and presented professionally.

## Why it is useful

CensorMe helps anonymize people in screenshots, demo videos, public recordings, and internal assets before they are shared. It is useful anywhere privacy, compliance, or editorial redaction matters.

## Tech Stack

- Backend: Python, FastAPI, OpenCV, NumPy
- Frontend: Next.js, TypeScript, React
- Detection: OpenCV YuNet with Haar fallback

## Features

- Upload an image or video in the browser
- Choose blur, pixelate, or redact censoring modes
- Preview the original file before processing
- Download the processed output
- Health check and file validation on the API
- Service-based backend structure for easier testing and extension

## Project Structure

```text
censorme/
  apps/
    api/
    web/
  docs/
  README.md
```

See [docs/architecture.md](docs/architecture.md) for a deeper breakdown of the backend and frontend layers.

## Run the Backend

1. Open `apps/api`.
2. Create and activate a virtual environment.
3. Install dependencies from `requirements.txt`.
4. Start the API with Uvicorn.

Example:

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Run the Frontend

1. Open `apps/web`.
2. Install dependencies with npm, pnpm, or yarn.
3. Start the Next.js dev server.

Example:

```bash
cd apps/web
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` if your API is not running at `http://localhost:8000/api`.

## API Endpoints

- `GET /api/health` - health check
- `POST /api/media/image` - process an uploaded image
- `POST /api/media/video` - queue an uploaded video for processing
- `GET /api/media/jobs/{jobId}` - check queued video status
- `GET /api/media/jobs/{jobId}/download` - download the finished video

## Future Improvements

- Add batch processing for multiple uploads
- Add streaming progress for large videos
- Add model selection and detector tuning in the UI
- Add test coverage for service boundaries and API routes