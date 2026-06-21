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
    routes._search_cache.clear()
    monkeypatch.setattr(routes, "query_osm_businesses", lambda city, cats: sample_osm_payload)
    res = client.post("/api/search", json={"city": "Москва", "categories": ["cafe"]})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["total"] == 3
    assert data["cached"] is False
    assert data["overview"]["total"] == 3
    assert "score" in data["leads"][0]


def test_search_uses_cache_on_repeat(client, sample_osm_payload, monkeypatch):
    """Повторный одинаковый запрос обслуживается из кэша без вызова Overpass."""
    routes._search_cache.clear()
    calls = {"n": 0}

    def fake_query(city, cats):
        calls["n"] += 1
        return sample_osm_payload

    monkeypatch.setattr(routes, "query_osm_businesses", fake_query)

    first = client.post("/api/search", json={"city": "Казань", "categories": ["cafe"]})
    second = client.post("/api/search", json={"city": "Казань", "categories": ["cafe"]})

    assert first.json()["cached"] is False
    assert second.json()["cached"] is True
    assert calls["n"] == 1  # Overpass вызван только один раз
