"""Тесты сводной аналитики по выборке."""

from __future__ import annotations

from app.services.osm import process_osm_data
from app.services.overview import build_overview


def test_empty_overview():
    ov = build_overview([])
    assert ov["total"] == 0
    assert ov["by_category"] == []


def test_overview_on_sample(sample_osm_payload):
    leads = process_osm_data(sample_osm_payload)
    ov = build_overview(leads)
    assert ov["total"] == 3
    assert 0 <= ov["independent_share"] <= 100
    assert 0 <= ov["contacts_share"] <= 100
    assert ov["high"] + ov["medium"] + ov["low"] == 3
    assert ov["by_category"]  # есть разбивка по категориям
    assert isinstance(ov["avg_score"], float)
