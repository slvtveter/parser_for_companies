"""Тесты ML-модели скоринга (пропускаются, если scikit-learn не установлен)."""

from __future__ import annotations

import pytest

pytest.importorskip("sklearn")

from app.ml.features import FEATURES, extract_features  # noqa: E402
from app.ml.model import predict, train_model  # noqa: E402


def test_model_trains_and_learns():
    _, metrics = train_model()
    assert metrics["roc_auc"] > 0.7  # модель действительно что-то выучивает
    assert metrics["n_test"] > 0


def test_feature_vector_length():
    vec = extract_features(
        is_chain=False, is_mini_chain=False, location_count=1, website=True,
        social=True, phone=True, email=False, opening_hours=True,
        has_profile=True, competition=3,
    )
    assert len(vec) == len(FEATURES)


def test_loaded_lead_outranks_bare():
    loaded = extract_features(
        is_chain=False, is_mini_chain=True, location_count=3, website=True,
        social=True, phone=True, email=True, opening_hours=True,
        has_profile=True, competition=6,
    )
    bare = extract_features(
        is_chain=False, is_mini_chain=False, location_count=1, website=False,
        social=False, phone=False, email=False, opening_hours=False,
        has_profile=False, competition=0,
    )
    proba_loaded, contribs = predict(loaded)
    proba_bare, _ = predict(bare)
    assert proba_loaded > proba_bare
    assert len(contribs) == len(FEATURES)
