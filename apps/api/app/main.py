"""FastAPI application entrypoint."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router
from app.api.routes.media import router as media_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)
    app.include_router(health_router, prefix=settings.api_prefix)
    app.include_router(media_router, prefix=settings.api_prefix)

    @app.get("/")
    async def root() -> dict[str, str]:
        return {"service": "CensorMe API", "status": "ready"}

    return app


app = create_app()
