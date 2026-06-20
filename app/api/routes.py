"""Маршруты REST API."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Response

from app.config import get_settings
from app.constants import CATEGORIES, CITIES
from app.schemas import (
    AIPitchRequest,
    Category,
    City,
    ExportRequest,
    HealthResponse,
    PitchRequest,
    PitchResponse,
    SearchRequest,
    SearchResponse,
)
from app.services.ai import AIPitchError, generate_ai_pitch
from app.services.export import build_export
from app.services.osm import OverpassError, process_osm_data, query_osm_businesses
from app.services.pitch import build_template_pitch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["leads"])


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
    """Ищет заведения через Overpass API и оценивает их потенциал."""
    try:
        raw = query_osm_businesses(req.city, req.categories)
        leads = process_osm_data(raw)
    except OverpassError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - возвращаем читаемую ошибку клиенту
        logger.exception("Ошибка при поиске лидов")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return SearchResponse(total=len(leads), leads=leads)


@router.post("/pitch", response_model=PitchResponse)
def generate_pitch(req: PitchRequest) -> PitchResponse:
    """Генерирует шаблонное письмо под тип бизнеса."""
    pitch = build_template_pitch(req.business_name, req.category_key, req.pitch_type)
    return PitchResponse(**pitch)


@router.post("/pitch/ai", response_model=PitchResponse)
def generate_pitch_ai(req: AIPitchRequest) -> PitchResponse:
    """Генерирует персональное письмо нейросетью через OpenRouter."""
    try:
        pitch = generate_ai_pitch(
            business_name=req.business_name,
            category_label=req.category_label,
            website=req.website,
            phone=req.phone,
            api_key=req.api_key,
            model=req.model,
        )
    except AIPitchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return PitchResponse(**pitch)


@router.post("/export")
def export_leads(req: ExportRequest) -> Response:
    """Выгружает выбранные лиды в CSV или XLSX."""
    if not req.leads:
        raise HTTPException(status_code=400, detail="Нет данных для экспорта")

    content, media_type, filename = build_export(req.leads, req.format)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=content, media_type=media_type, headers=headers)
