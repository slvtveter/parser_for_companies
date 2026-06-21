"""Маршруты REST API."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Response

from app.config import get_settings
from app.constants import CATEGORIES, CITIES
from app.schemas import (
    Category,
    City,
    ExportRequest,
    HealthResponse,
    SearchRequest,
    SearchResponse,
)
from app.services.cache import TTLCache
from app.services.export import build_export
from app.services.osm import OverpassError, process_osm_data, query_osm_businesses
from app.services.overview import build_overview

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["leads"])

# Кэш результатов поиска: повторные одинаковые запросы не идут в Overpass.
_search_cache = TTLCache(ttl=get_settings().cache_ttl)


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Проверка доступности сервиса."""
    return HealthResponse(version=get_settings().version)


@router.get("/cities", response_model=list[City])
def get_cities() -> list[dict]:
    """Список городов, доступных для поиска."""
    return CITIES


@router.get("/categories", response_model=list[Category])
def get_categories() -> list[dict]:
    """Список категорий бизнеса."""
    return CATEGORIES


@router.post("/search", response_model=SearchResponse)
def search_leads(req: SearchRequest) -> SearchResponse:
    """Ищет заведения через Overpass API, считает ML-скоринг и обзор рынка."""
    cache_key = (req.city.strip().lower(), tuple(sorted(set(req.categories))))
    cached = _search_cache.get(cache_key)
    if cached is not None:
        return SearchResponse(
            total=len(cached), leads=cached, overview=build_overview(cached), cached=True
        )

    try:
        raw = query_osm_businesses(req.city, req.categories)
        leads = process_osm_data(raw)
    except OverpassError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - возвращаем читаемую ошибку клиенту
        logger.exception("Ошибка при поиске лидов")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    _search_cache.set(cache_key, leads)
    return SearchResponse(
        total=len(leads), leads=leads, overview=build_overview(leads), cached=False
    )


@router.post("/export")
def export_leads(req: ExportRequest) -> Response:
    """Выгружает выбранные лиды в CSV или XLSX."""
    if not req.leads:
        raise HTTPException(status_code=400, detail="Нет данных для экспорта")

    content, media_type, filename = build_export(req.leads, req.format)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=content, media_type=media_type, headers=headers)
