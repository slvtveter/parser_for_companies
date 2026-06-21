"""Справочные данные: города, категории бизнеса и сопоставление с тегами OSM."""

from __future__ import annotations

# Города, доступные для поиска (название -> латиница для справки).
CITIES: list[dict[str, str]] = [
    {"name": "Москва", "latin": "Moscow"},
    {"name": "Санкт-Петербург", "latin": "Saint Petersburg"},
    {"name": "Новосибирск", "latin": "Novosibirsk"},
    {"name": "Екатеринбург", "latin": "Yekaterinburg"},
    {"name": "Казань", "latin": "Kazan"},
    {"name": "Нижний Новгород", "latin": "Nizhny Novgorod"},
    {"name": "Краснодар", "latin": "Krasnodar"},
    {"name": "Сочи", "latin": "Sochi"},
    {"name": "Владивосток", "latin": "Vladivostok"},
]

# Категории бизнеса для UI (короткие подписи для чипов).
CATEGORIES: list[dict[str, str]] = [
    {"id": "cafe", "name": "Кофейни"},
    {"id": "bakery", "name": "Пекарни"},
    {"id": "confectionery", "name": "Кондитерские"},
    {"id": "restaurant", "name": "Рестораны"},
    {"id": "fast_food", "name": "Фастфуд"},
    {"id": "beauty", "name": "Красота"},
    {"id": "florist", "name": "Цветы"},
]

# Сопоставление наших категорий с тегами OpenStreetMap (ключ, значение).
OSM_TAG_MAPPING: dict[str, tuple[str, str]] = {
    "cafe": ("amenity", "cafe"),
    "bakery": ("shop", "bakery"),
    "confectionery": ("shop", "confectionery"),
    "beauty": ("shop", "beauty"),
    "florist": ("shop", "florist"),
    "restaurant": ("amenity", "restaurant"),
    "fast_food": ("amenity", "fast_food"),
}

# Обратное сопоставление тегов OSM в человекочитаемую категорию.
# Ключ — кортеж (osm_key, osm_value), значение — (подпись, внутренний ключ).
OSM_CATEGORY_LABELS: dict[tuple[str, str], tuple[str, str]] = {
    ("shop", "bakery"): ("Пекарня", "bakery"),
    ("shop", "confectionery"): ("Кондитерская", "confectionery"),
    ("shop", "beauty"): ("Салон красоты", "beauty"),
    ("shop", "florist"): ("Цветочный магазин", "florist"),
    ("amenity", "restaurant"): ("Ресторан", "restaurant"),
    ("amenity", "fast_food"): ("Быстрое питание", "fast_food"),
    ("amenity", "cafe"): ("Кофейня/Кафе", "cafe"),
}

DEFAULT_CATEGORY: tuple[str, str] = ("Кофейня/Кафе", "cafe")
