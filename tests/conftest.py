"""Общие фикстуры для тестов."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def sample_osm_payload() -> dict:
    """Минимальный, но реалистичный ответ Overpass API для офлайн-тестов."""
    return {
        "elements": [
            {
                # Независимая кофейня с полным набором контактов -> HIGH.
                "type": "node",
                "id": 1,
                "lat": 55.75,
                "lon": 37.61,
                "tags": {
                    "name": "Кофе у Дома",
                    "amenity": "cafe",
                    "phone": "+7 999 000-00-00",
                    "website": "https://coffee.example",
                    "addr:street": "Тверская улица",
                    "addr:housenumber": "10",
                    "opening_hours": "Mo-Su 08:00-22:00",
                },
            },
            {
                # Way с координатами в center и тегом сети -> LOW (сеть).
                "type": "way",
                "id": 2,
                "center": {"lat": 55.76, "lon": 37.62},
                "tags": {
                    "name": "Шоколадница",
                    "amenity": "cafe",
                    "brand": "Шоколадница",
                    "addr:street": "Арбат",
                },
            },
            {
                # Пекарня без контактов -> LOW (нет связи).
                "type": "node",
                "id": 3,
                "lat": 55.77,
                "lon": 37.63,
                "tags": {"name": "Пекарня №5", "shop": "bakery"},
            },
            {
                # Объект без координат — должен быть пропущен.
                "type": "node",
                "id": 4,
                "tags": {"name": "Без координат", "amenity": "cafe"},
            },
        ]
    }
