"""Тесты построения запроса и обработки данных Overpass (без сети)."""

from __future__ import annotations

from app.services.osm import build_overpass_query, process_osm_data


class TestBuildQuery:
    def test_includes_selected_categories(self):
        query = build_overpass_query("Москва", ["cafe", "bakery"])
        assert 'area["name"="Москва"]' in query
        assert 'nwr["amenity"="cafe"]' in query
        assert 'nwr["shop"="bakery"]' in query

    def test_unknown_category_falls_back_to_cafe(self):
        query = build_overpass_query("Казань", ["unknown"])
        assert 'nwr["amenity"="cafe"]' in query


class TestProcessOsmData:
    def test_skips_elements_without_coords(self, sample_osm_payload):
        leads = process_osm_data(sample_osm_payload)
        # Из 4 элементов один без координат — должно остаться 3.
        assert len(leads) == 3
        assert all(lead["lat"] is not None and lead["lon"] is not None for lead in leads)

    def test_high_potential_independent_cafe(self, sample_osm_payload):
        leads = process_osm_data(sample_osm_payload)
        cafe = next(lead for lead in leads if lead["id"] == 1)
        assert cafe["potential_score"] == "HIGH"
        assert cafe["is_chain"] is False
        assert cafe["address"] == "Тверская улица, 10"
        assert cafe["category_key"] == "cafe"
        assert cafe["opening_hours"] == "Mo-Su 08:00-22:00"

    def test_chain_detected_from_brand(self, sample_osm_payload):
        leads = process_osm_data(sample_osm_payload)
        chain = next(lead for lead in leads if lead["id"] == 2)
        assert chain["is_chain"] is True
        assert chain["potential_score"] == "LOW"
        # Координаты взяты из center.
        assert chain["lat"] == 55.76

    def test_bakery_without_contacts(self, sample_osm_payload):
        leads = process_osm_data(sample_osm_payload)
        bakery = next(lead for lead in leads if lead["id"] == 3)
        assert bakery["category_label"] == "Пекарня"
        assert bakery["potential_score"] == "LOW"
        assert bakery["phone"] is None
        assert bakery["address"].startswith("Адрес не указан")

    def test_empty_payload(self):
        assert process_osm_data({}) == []
