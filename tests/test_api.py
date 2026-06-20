"""Тесты HTTP-эндпоинтов через FastAPI TestClient (без обращения к сети)."""

from __future__ import annotations

import app.api.routes as routes


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_cities(client):
    res = client.get("/api/cities")
    assert res.status_code == 200
    data = res.json()
    assert any(city["name"] == "Москва" for city in data)


def test_categories(client):
    res = client.get("/api/categories")
    assert res.status_code == 200
    ids = {cat["id"] for cat in res.json()}
    assert {"cafe", "bakery", "beauty"}.issubset(ids)


def test_template_pitch_analytics(client):
    res = client.post(
        "/api/pitch",
        json={"business_name": "Кофе Тест", "category_key": "cafe", "pitch_type": "analytics"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "Кофе Тест" in body["subject"]
    assert "iiko" in body["body"]


def test_template_pitch_startup(client):
    res = client.post(
        "/api/pitch",
        json={"business_name": "Стартап Тест", "category_key": "cafe", "pitch_type": "startup"},
    )
    assert res.status_code == 200
    assert "FastAPI" in res.json()["body"]


def test_export_csv(client):
    leads = [
        {
            "name": "Кофе Тест",
            "category_label": "Кофейня/Кафе",
            "address": "Тверская, 1",
            "phone": "+7 999",
            "website": None,
            "potential_score": "HIGH",
        }
    ]
    res = client.post("/api/export", json={"leads": leads, "format": "csv"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "Название" in res.content.decode("utf-8-sig")


def test_export_empty_rejected(client):
    res = client.post("/api/export", json={"leads": [], "format": "csv"})
    assert res.status_code == 400


def test_search_with_mocked_overpass(client, sample_osm_payload, monkeypatch):
    """Эндпоинт /api/search с подменённым Overpass-клиентом (без реальной сети)."""
    monkeypatch.setattr(routes, "query_osm_businesses", lambda city, cats: sample_osm_payload)
    res = client.post("/api/search", json={"city": "Москва", "categories": ["cafe"]})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["total"] == 3
