"""Клиент Overpass API (OpenStreetMap) и обработка сырых данных в лиды."""

from __future__ import annotations

import logging

import requests

from app.config import get_settings
from app.constants import (
    DEFAULT_CATEGORY,
    OSM_CATEGORY_LABELS,
    OSM_TAG_MAPPING,
)
from app.services.scoring import calculate_potential_score, check_is_chain

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "LeadAnalyticsPortfolio/1.0 (contact: portfolio-project@example.com)",
    "Accept": "application/json",
}


class OverpassError(RuntimeError):
    """Ошибка обращения к Overpass API (все зеркала недоступны)."""


def build_overpass_query(city: str, categories: list[str]) -> str:
    """Собирает запрос Overpass QL по городу и списку категорий."""
    selectors = [
        f'nwr["{key}"="{value}"](area.searchArea);'
        for cat in categories
        if (mapping := OSM_TAG_MAPPING.get(cat))
        for key, value in [mapping]
    ]
    if not selectors:
        key, value = OSM_TAG_MAPPING["cafe"]
        selectors.append(f'nwr["{key}"="{value}"](area.searchArea);')

    body = "\n  ".join(selectors)
    timeout = get_settings().overpass_query_timeout
    return (
        f"[out:json][timeout:{timeout}];\n"
        f'area["name"="{city}"]->.searchArea;\n'
        f"(\n  {body}\n);\n"
        "out tags center;"
    )


def query_osm_businesses(city: str, categories: list[str]) -> dict:
    """Выполняет запрос к Overpass API, перебирая зеркала с фолбэком POST -> GET."""
    settings = get_settings()
    query = build_overpass_query(city, categories)
    timeout = settings.request_timeout

    for method in ("post", "get"):
        for url in settings.overpass_mirrors:
            try:
                if method == "post":
                    res = requests.post(
                        url, data={"data": query}, headers=_HEADERS, timeout=timeout
                    )
                else:
                    res = requests.get(
                        url, params={"data": query}, headers=_HEADERS, timeout=timeout
                    )
            except requests.RequestException as exc:
                logger.warning("Overpass-зеркало %s (%s) недоступно: %s", url, method.upper(), exc)
                continue

            if res.status_code == 200:
                logger.info("Overpass: данные получены с %s (%s)", url, method.upper())
                return res.json()

            logger.warning(
                "Overpass %s (%s) вернул статус %s", url, method.upper(), res.status_code
            )

    raise OverpassError("Не удалось получить данные ни с одного зеркала Overpass API.")


def _extract_coords(element: dict) -> tuple[float | None, float | None]:
    """Возвращает координаты объекта (для way/relation берётся center)."""
    lat = element.get("lat")
    lon = element.get("lon")
    if lat is None or lon is None:
        center = element.get("center", {})
        lat = center.get("lat")
        lon = center.get("lon")
    return lat, lon


def _extract_contacts(tags: dict) -> tuple[str, str]:
    """Достаёт сайт/соцсеть и телефон из множества возможных тегов OSM."""
    website = (
        tags.get("website")
        or tags.get("contact:website")
        or tags.get("contact:instagram")
        or tags.get("contact:vk")
        or tags.get("contact:facebook")
        or ""
    )
    phone = (
        tags.get("phone")
        or tags.get("contact:phone")
        or tags.get("contact:mobile")
        or ""
    )
    if phone:
        phone = phone.replace(";", ", ")
    return website, phone


def _extract_address(tags: dict) -> str:
    """Формирует адрес из тегов улицы и номера дома."""
    street = tags.get("addr:street", "")
    housenumber = tags.get("addr:housenumber", "")
    if not street:
        return "Адрес не указан (см. координаты)"
    return f"{street}, {housenumber}" if housenumber else street


def _resolve_category(tags: dict) -> tuple[str, str]:
    """Определяет человекочитаемую категорию и внутренний ключ по тегам OSM."""
    for key in ("shop", "amenity"):
        value = tags.get(key)
        if value and (key, value) in OSM_CATEGORY_LABELS:
            return OSM_CATEGORY_LABELS[(key, value)]
    return DEFAULT_CATEGORY


def process_osm_data(osm_data: dict) -> list[dict]:
    """Преобразует сырой ответ Overpass в список структурированных лидов."""
    leads: list[dict] = []

    for element in osm_data.get("elements", []):
        tags = element.get("tags", {})

        lat, lon = _extract_coords(element)
        if lat is None or lon is None:
            continue

        name = tags.get("name") or tags.get("name:ru") or "Без названия"
        brand = tags.get("brand") or tags.get("brand:ru") or ""
        website, phone = _extract_contacts(tags)
        address = _extract_address(tags)
        category_label, category_key = _resolve_category(tags)

        is_chain = check_is_chain(name, brand)
        potential = calculate_potential_score(is_chain, website, phone)

        leads.append(
            {
                "id": element.get("id"),
                "name": name,
                "brand": brand or None,
                "is_chain": is_chain,
                "website": website or None,
                "phone": phone or None,
                "address": address,
                "lat": lat,
                "lon": lon,
                "category_label": category_label,
                "category_key": category_key,
                "potential_score": potential["score"],
                "potential_reason": potential["reason"],
                "potential_color": potential["color"],
                "opening_hours": tags.get("opening_hours"),
            }
        )

    return leads
