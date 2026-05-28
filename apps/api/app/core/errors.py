"""Custom exceptions and API error handlers."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class CensorMeError(Exception):
    """Base class for expected application errors."""

    status_code = 400

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code


class UnsupportedMediaTypeError(CensorMeError):
    """Raised when an uploaded file is not a supported image or video."""

    status_code = 415


class ProcessingError(CensorMeError):
    """Raised when OpenCV processing fails for a media file."""

    status_code = 500


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(CensorMeError)
    async def _handle_censor_me_error(request: Request, exc: CensorMeError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message},
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"detail": "Unexpected server error"},
        )
