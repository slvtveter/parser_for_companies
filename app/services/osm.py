"""Клиент Overpass API (OpenStreetMap) и обработка сырых данных в лиды."""

from __future__ import annotations

import logging
from collections import Counter

import requests

from app.config import get_settings
from app.constants import (
    DEFAULT_CATEGORY,
    OSM_CATEGORY_LABELS,
    OSM_TAG_MAPPING,
)
from app.services.scoring import check_is_chain, score_lead

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "LeadAnalyticsPortfolio/1.0 (contact: portfolio-project@example.com)",
    "Accept": "application/json",
}

# Размер ячейки пространственной сетки для оценки конкуренции (~0.5 км).
_GRID_CELL = 0.005

# Слишком общие названия не считаем признаком мини-сети.
_GENERIC_NAMES = {
    "кофейня", "кафе", "бар", "пекарня", "столовая", "буфет", "ресторан",
    "кофе", "bar", "cafe", "coffee", "без названия",
}
_YES = {"yes", "limited", "designated"}


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
    lat = element.get("lat")
    lon = element.get("lon")
    if lat is None or lon is None:
        center = element.get("center", {})
        lat = center.get("lat")
        lon = center.get("lon")
    return lat, lon


def _resolve_category(tags: dict) -> tuple[str, str]:
    for key in ("shop", "amenity"):
        value = tags.get(key)
        if value and (key, value) in OSM_CATEGORY_LABELS:
            return OSM_CATEGORY_LABELS[(key, value)]
    return DEFAULT_CATEGORY


def _parse_element(element: dict) -> dict | None:
    """Превращает один объект OSM в базовую запись лида (без скоринга)."""
    tags = element.get("tags", {})
    lat, lon = _extract_coords(element)
    if lat is None or lon is None:
        return None

    name = tags.get("name") or tags.get("name:ru") or "Без названия"
    brand = tags.get("brand") or tags.get("brand:ru") or ""

    website = tags.get("website") or tags.get("contact:website") or ""
    social = (
        tags.get("contact:instagram") or tags.get("instagram")
        or tags.get("contact:vk") or tags.get("vk")
        or tags.get("contact:facebook") or ""
    )
    phone = tags.get("phone") or tags.get("contact:phone") or tags.get("contact:mobile") or ""
    if phone:
        phone = phone.replace(";", ", ")
    email = tags.get("email") or tags.get("contact:email") or ""

    street = tags.get("addr:street", "")
    house = tags.get("addr:housenumber", "")
    if street:
        address = f"{street}, {house}" if house else street
    else:
        address = "Адрес не указан (см. координаты)"
    district = (
        tags.get("addr:suburb")
        or tags.get("addr:city_district")
        or tags.get("addr:district")
        or ""
    )

    cuisine = (tags.get("cuisine") or "").replace(";", ", ")
    delivery = tags.get("delivery") in _YES
    takeaway = tags.get("takeaway") in _YES
    outdoor = tags.get("outdoor_seating") in _YES
    wheelchair = tags.get("wheelchair") in _YES

    label, key = _resolve_category(tags)

    return {
        "id": element.get("id"),
        "name": name,
        "brand": brand or None,
        "is_chain": check_is_chain(name, brand),
        "website": website or None,
        "social": social or None,
        "phone": phone or None,
        "email": email or None,
        "address": address,
        "district": district or None,
        "lat": lat,
        "lon": lon,
        "category_label": label,
        "category_key": key,
        "opening_hours": tags.get("opening_hours"),
        "cuisine": cuisine or None,
        "delivery": delivery,
        "takeaway": takeaway,
        "outdoor_seating": outdoor,
        "wheelchair": wheelchair,
    }


def _norm_name(name: str) -> str:
    return name.strip().lower()


def _grid_cell(lead: dict) -> tuple[str, int, int]:
    """Ячейка пространственной сетки для оценки конкуренции."""
    return (
        lead["category_key"],
        round(lead["lat"] / _GRID_CELL),
        round(lead["lon"] / _GRID_CELL),
    )


def process_osm_data(osm_data: dict) -> list[dict]:
    """Преобразует ответ Overpass в обогащённые и оценённые лиды."""
    leads = [lead for el in osm_data.get("elements", []) if (lead := _parse_element(el))]
    if not leads:
        return []

    # Подсчёт повторов названия (мини-сети) и плотности конкурентов по сетке.
    name_counts: Counter[str] = Counter()
    cell_counts: Counter[tuple[str, int, int]] = Counter()
    for lead in leads:
        norm = _norm_name(lead["name"])
        if norm not in _GENERIC_NAMES:
            name_counts[norm] += 1
        cell_counts[_grid_cell(lead)] += 1

    for lead in leads:
        norm = _norm_name(lead["name"])
        location_count = name_counts.get(norm, 1) if norm not in _GENERIC_NAMES else 1
        is_mini_chain = (not lead["is_chain"]) and (2 <= location_count <= 5)
        competition = max(0, cell_counts.get(_grid_cell(lead), 1) - 1)
        has_profile = bool(
            lead["cuisine"] or lead["delivery"] or lead["takeaway"] or lead["outdoor_seating"]
        )

        lead["location_count"] = location_count
        lead["is_mini_chain"] = is_mini_chain
        lead["competition"] = competition

        scored = score_lead(
            is_chain=lead["is_chain"],
            is_mini_chain=is_mini_chain,
            location_count=location_count,
            website=bool(lead["website"]),
            social=bool(lead["social"]),
            phone=bool(lead["phone"]),
            email=bool(lead["email"]),
            opening_hours=bool(lead["opening_hours"]),
            has_profile=has_profile,
            competition=competition,
        )
        lead.update(scored)

    leads.sort(key=lambda x: x["score"], reverse=True)
    return leads
