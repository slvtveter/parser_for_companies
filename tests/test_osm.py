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
        assert len(leads) == 3  # один объект без координат пропущен
        assert all(lead["lat"] is not None and lead["lon"] is not None for lead in leads)

    def test_leads_are_scored_and_enriched(self, sample_osm_payload):
        leads = process_osm_data(sample_osm_payload)
        for lead in leads:
            assert 0 <= lead["score"] <= 100
            assert lead["potential_score"] in {"HIGH", "MEDIUM", "LOW"}
            assert "factors" in lead and "competition" in lead and "location_count" in lead

    def test_independent_cafe_outranks_empty_bakery(self, sample_osm_payload):
        leads = {lead["id"]: lead for lead in process_osm_data(sample_osm_payload)}
        cafe = leads[1]   # есть телефон, сайт, часы
        bakery = leads[3]  # без контактов
        assert cafe["score"] > bakery["score"]
        assert cafe["is_chain"] is False
        assert cafe["address"] == "Тверская улица, 10"
        assert cafe["category_key"] == "cafe"

    def test_chain_detected_from_brand(self, sample_osm_payload):
        chain = {lead["id"]: lead for lead in process_osm_data(sample_osm_payload)}[2]
        assert chain["is_chain"] is True
        assert chain["potential_score"] == "LOW"
        assert chain["score"] <= 18
        assert chain["lat"] == 55.76  # координаты взяты из center

    def test_bakery_without_contacts(self, sample_osm_payload):
        bakery = {lead["id"]: lead for lead in process_osm_data(sample_osm_payload)}[3]
        assert bakery["category_label"] == "Пекарня"
        assert bakery["phone"] is None
        assert bakery["address"].startswith("Адрес не указан")

    def test_sorted_by_score_desc(self, sample_osm_payload):
        scores = [lead["score"] for lead in process_osm_data(sample_osm_payload)]
        assert scores == sorted(scores, reverse=True)

    def test_empty_payload(self):
        assert process_osm_data({}) == []
