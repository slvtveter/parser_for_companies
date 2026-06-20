"""Тесты определения сетей и скоринга потенциала."""

from __future__ import annotations

import pytest

from app.services.scoring import calculate_potential_score, check_is_chain


class TestCheckIsChain:
    def test_brand_tag_marks_chain(self):
        assert check_is_chain("Любое имя", "Some Brand") is True

    def test_known_chain_name_detected(self):
        assert check_is_chain("Шоколадница на Тверской", None) is True
        assert check_is_chain("STARBUCKS", None) is False  # нет в списке
        assert check_is_chain("Cofix", "") is True

    def test_independent_business(self):
        assert check_is_chain("Кофе у Дома", None) is False

    def test_empty_name(self):
        assert check_is_chain("", None) is False
        assert check_is_chain(None, None) is False


class TestPotentialScore:
    def test_chain_is_low(self):
        result = calculate_potential_score(is_chain=True, website="x", phone="y")
        assert result["score"] == "LOW"
        assert result["color"] == "warning"

    def test_no_contacts_is_low(self):
        result = calculate_potential_score(is_chain=False, website=None, phone=None)
        assert result["score"] == "LOW"
        assert result["color"] == "danger"

    def test_full_contacts_is_high(self):
        result = calculate_potential_score(is_chain=False, website="x", phone="y")
        assert result["score"] == "HIGH"
        assert result["color"] == "success"

    @pytest.mark.parametrize(
        ("website", "phone"),
        [("x", None), (None, "y")],
    )
    def test_single_channel_is_medium(self, website, phone):
        result = calculate_potential_score(is_chain=False, website=website, phone=phone)
        assert result["score"] == "MEDIUM"
        assert result["color"] == "primary"
