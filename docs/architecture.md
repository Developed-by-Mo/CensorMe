# CensorMe Architecture

## Monorepo Structure

CensorMe is split into two top-level apps:

- `apps/api` contains the FastAPI backend and OpenCV processing services.
- `apps/web` contains the Next.js frontend used to upload files, configure censoring, and download results.

This separation keeps the media processing logic isolated from the presentation layer and makes it easier to evolve either side independently.

## Backend Architecture

The backend is organized around thin route handlers and reusable services:

- `app/api/routes` exposes HTTP endpoints only.
- `app/services/detector_service.py` owns face detection with YuNet and Haar fallback.
- `app/services/censor_service.py` applies blur, pixelation, or redaction to detected regions.
- `app/services/image_service.py` handles image file processing.
- `app/services/video_service.py` handles video decoding and re-encoding.
- `app/utils/file_utils.py` contains file validation and safe temp-file helpers.
- `app/core/config.py` centralizes runtime configuration.

The backend returns processed files directly to the frontend, which keeps the API simple and easy to integrate.

Video exports are handled as queued jobs rather than a single blocking request. That avoids the frozen-button behavior from the original desktop workflow and makes long-running video processing observable from the UI.

## Frontend Architecture

The frontend is built as a single-page workflow:

- The landing page introduces the product and focuses on a single action path.
- `components/upload-panel.tsx` handles file selection.
- `components/processing-options.tsx` collects censoring settings.
- `components/preview-panel.tsx` renders original and processed previews.
- `lib/api.ts` isolates API communication and file upload logic.

When the selected file is a video, the frontend submits the job, polls the backend status endpoint, and downloads the result once it is ready.

The UI is intentionally lightweight and professional so it works as a portfolio piece rather than a demo prototype.

## Migration from FaceLock

The original FaceLock script mixed face detection, censorship, canvas rendering, webcam handling, file dialogs, and Tkinter state into one file.

What was migrated cleanly:

- YuNet and Haar-based face detection logic
- Blur, pixelation, and redaction effects
- Frame-level processing for images and videos
- File validation and safe temporary file handling

What was not migrated into the backend runtime:

- Tkinter UI and all windowing code
- Manual face box interaction on the canvas
- Live webcam preview and recording controls
- OpenCV HUD overlays used only for the desktop interface

Those desktop-only behaviors were removed so the new project can operate as a clean web app.
