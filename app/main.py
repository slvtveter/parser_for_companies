"""Точка сборки приложения FastAPI."""

from __future__ import annotations

import logging
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import requests as _requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

# Каталог со статикой фронтенда (../static относительно этого файла).
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

_PING_URL = "https://lead-analytics.onrender.com/api/health"
_PING_INTERVAL = 12 * 60  # 12 минут


def _keep_alive() -> None:
    time.sleep(60)  # ждём пока сервис полностью поднимется
    while True:
        try:
            _requests.get(_PING_URL, timeout=10)
            logger.info("keep-alive ping ok")
        except Exception as exc:
            logger.warning("keep-alive ping failed: %s", exc)
        time.sleep(_PING_INTERVAL)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    t = threading.Thread(target=_keep_alive, daemon=True, name="keep-alive")
    t.start()
    yield


def create_app() -> FastAPI:
    """Создаёт и настраивает экземпляр приложения."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description=settings.app_description,
        version=settings.version,
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Отключаем кэширование статики, чтобы браузер всегда брал свежие JS/CSS.
    @app.middleware("http")
    async def _no_store(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    # Сначала маршруты API, затем — отдача статики на "/".
    app.include_router(router)

    if STATIC_DIR.is_dir():
        app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

    return app


app = create_app()
