"""Тесты определения сетей, эвристики и инвариантов score_lead."""

from __future__ import annotations

from app.services.scoring import _heuristic_score, check_is_chain, score_lead


def _signals(**overrides) -> dict:
    base = dict(
        is_chain=False,
        is_mini_chain=False,
        location_count=1,
        website=False,
        social=False,
        phone=False,
        email=False,
        opening_hours=False,
        has_profile=False,
        competition=0,
    )
    base.update(overrides)
    return base


class TestCheckIsChain:
    def test_brand_tag_marks_chain(self):
        assert check_is_chain("Любое имя", "Some Brand") is True

    def test_known_chain_name_detected(self):
        assert check_is_chain("Шоколадница на Тверской", None) is True
        assert check_is_chain("Cofix", "") is True

    def test_independent_business(self):
        assert check_is_chain("Кофе у Дома", None) is False

    def test_empty_name(self):
        assert check_is_chain("", None) is False
        assert check_is_chain(None, None) is False


class TestHeuristic:
    def test_strong_lead_high(self):
        score, factors = _heuristic_score(
            _signals(website=True, social=True, phone=True, email=True,
                     opening_hours=True, has_profile=True, competition=5)
        )
        assert score >= 65
        assert factors

    def test_bare_independent_low(self):
        score, _ = _heuristic_score(_signals())
        assert score < 40

    def test_mini_chain_bonus(self):
        base, _ = _heuristic_score(_signals(phone=True))
        mini, _ = _heuristic_score(_signals(phone=True, is_mini_chain=True, location_count=3))
        assert mini > base

    def test_competition_bonus(self):
        low, _ = _heuristic_score(_signals(phone=True, competition=0))
        high, _ = _heuristic_score(_signals(phone=True, competition=6))
        assert high > low


class TestScoreLeadInvariants:
    """Свойства, которые должны выполняться при любом движке (ML или эвристика)."""

    def test_chain_capped_low(self):
        res = score_lead(**_signals(is_chain=True, website=True, phone=True, email=True, social=True))
        assert res["score"] <= 18
        assert res["potential_score"] == "LOW"
        assert res["potential_color"] == "warning"

    def test_score_in_range_and_keys(self):
        res = score_lead(**_signals(phone=True, website=True))
        assert 0 <= res["score"] <= 100
        assert set(res) == {"score", "potential_score", "potential_color", "potential_reason", "factors"}

    def test_level_matches_score_for_independent(self):
        res = score_lead(**_signals(website=True, social=True, phone=True, email=True))
        score, level = res["score"], res["potential_score"]
        expected = "HIGH" if score >= 65 else "MEDIUM" if score >= 40 else "LOW"
        assert level == expected

    def test_strong_outranks_bare(self):
        strong = score_lead(**_signals(website=True, social=True, phone=True, email=True,
                                       opening_hours=True, has_profile=True, competition=5))
        bare = score_lead(**_signals())
        assert strong["score"] > bare["score"]
