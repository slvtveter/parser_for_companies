"""Определение сетей и балльная оценка потенциала лида (ML + эвристика-fallback)."""

from __future__ import annotations

import logging
import re

from app.ml.features import (
    FEATURE_LABELS,
    FEATURE_LABELS_ABSENT,
    FEATURES,
    extract_features,
    is_binary_feature,
)

logger = logging.getLogger(__name__)

# Известные сети и франшизы в России.
KNOWN_CHAINS: list[str] = [
    r"шоколадница", r"кофе хауз", r"правда кофе", r"даблби", r"cofix", r"stars coffee",
    r"one price coffee", r"хлеб насущный", r"волконский", r"буше", r"синнабон", r"цех 85",
    r"теремок", r"крошка картошка", r"додо пицца", r"додо", r"папа джонс", r"домино'с",
    r"subway", r"burger king", r"доминос", r"kfc", r"ростикс", r"вкусвилл", r"пятерочка",
    r"перекресток", r"магнит", r"дикси", r"ашан", r"метро", r"лента", r"окей",
    r"кофемания", r"surf coffee", r"skuratov", r"кофе тайм", r"coffee like",
    r"baggin's", r"кофейня №1", r"поль бейкери", r"север-метрополь", r"коржов",
]

_CHAIN_PATTERN = re.compile("|".join(KNOWN_CHAINS), re.IGNORECASE)

HIGH_THRESHOLD = 65
MEDIUM_THRESHOLD = 40


def check_is_chain(name: str | None, brand: str | None) -> bool:
    """Сеть ли это: по тегу ``brand`` или совпадению названия с известными сетями."""
    if not name:
        return False
    if brand:
        return True
    return bool(_CHAIN_PATTERN.search(name))


def _factors_from_contributions(
    contributions: list[tuple[str, float]], present: dict[str, float]
) -> list[dict]:
    """Превращает вклады модели в человекочитаемый разбор «почему»."""
    factors: list[dict] = []
    for name, contrib in contributions:
        points = round(contrib * 12)
        if points == 0:
            continue
        if is_binary_feature(name) and present.get(name, 0) <= 0:
            label = FEATURE_LABELS_ABSENT.get(name, FEATURE_LABELS[name])
        else:
            label = FEATURE_LABELS[name]
        factors.append({"label": label, "points": int(points), "positive": contrib > 0})
    factors.sort(key=lambda f: abs(f["points"]), reverse=True)
    return factors[:6]


def _ml_score(signals: dict) -> tuple[int, list[dict]]:
    """Оценка моделью. Бросает исключение, если ML недоступен."""
    from app.ml.model import predict

    features = extract_features(**signals)
    proba, contributions = predict(features)
    present = dict(zip(FEATURES, features, strict=True))
    return round(proba * 100), _factors_from_contributions(contributions, present)


def _heuristic_score(signals: dict) -> tuple[int, list[dict]]:
    """Прозрачная эвристика на случай, когда scikit-learn недоступен."""
    factors: list[dict] = []

    def add(label: str, points: int, positive: bool = True) -> None:
        factors.append({"label": label, "points": points, "positive": positive})

    score = 0
    if signals["phone"]:
        score += 15
        add("Указан телефон", 15)
    if signals["website"]:
        score += 14
        add("Есть свой сайт", 14)
    if signals["social"]:
        score += 10
        add("Активны в соцсетях", 10)
    if signals["email"]:
        score += 8
        add("Указан email", 8)
    if signals["opening_hours"]:
        score += 6
        add("Указаны часы работы", 6)
    if signals["has_profile"]:
        score += 4
        add("Детальный профиль (кухня/доставка)", 4)
    if not signals["is_chain"] and signals["location_count"] <= 6:
        score += 22
        add("Независимое заведение", 22)
    if signals["is_mini_chain"]:
        score += 10
        add("Мини-сеть 2–5 точек: данные есть, аналитика нет", 10)
    if signals["competition"] >= 4:
        score += 14
        add(f"Высокая конкуренция рядом ({signals['competition']})", 14)
    elif signals["competition"] >= 1:
        score += 7
        add(f"Есть конкуренты рядом ({signals['competition']})", 7)

    factors.sort(key=lambda f: abs(f["points"]), reverse=True)
    return max(0, min(100, score)), factors


def score_lead(
    *,
    is_chain: bool,
    is_mini_chain: bool,
    location_count: int,
    website: bool,
    social: bool,
    phone: bool,
    email: bool,
    opening_hours: bool,
    has_profile: bool,
    competition: int,
) -> dict:
    """Считает балл 0–100 и разбор факторов. Основной путь — ML, fallback — эвристика."""
    signals = {
        "is_chain": is_chain,
        "is_mini_chain": is_mini_chain,
        "location_count": location_count,
        "website": website,
        "social": social,
        "phone": phone,
        "email": email,
        "opening_hours": opening_hours,
        "has_profile": has_profile,
        "competition": competition,
    }

    try:
        score, factors = _ml_score(signals)
    except Exception:  # noqa: BLE001 - любой сбой ML -> прозрачная эвристика
        score, factors = _heuristic_score(signals)

    chainish = is_chain or location_count > 6
    if chainish:
        score = min(score, 18)
        positives = [f for f in factors if f["positive"]][:3]
        chain_factor = {
            "label": "Крупная сеть — обычно есть штатный аналитик",
            "points": -20,
            "positive": False,
        }
        factors = [chain_factor, *positives]

    score = max(0, min(100, int(score)))

    if chainish:
        level, color = "LOW", "warning"
        reason = "Крупная сеть (обычно уже есть свои аналитики и CRM)"
    elif score >= HIGH_THRESHOLD:
        level, color = "HIGH", "success"
        reason = "Сильный лид: независимый бизнес с контактами и данными"
    elif score >= MEDIUM_THRESHOLD:
        level, color = "MEDIUM", "primary"
        reason = "Средний лид: часть нужных сигналов уже есть"
    else:
        level, color = "LOW", "danger"
        reason = "Слабый лид: мало контактов и сигналов"

    return {
        "score": score,
        "potential_score": level,
        "potential_color": color,
        "potential_reason": reason,
        "factors": factors,
    }
