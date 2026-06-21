"""Инженерия признаков для модели скоринга лида.

Один и тот же набор признаков используется и при обучении (синтетические данные
на основе доменных правил), и при инференсе на реальных данных из OSM.
"""

from __future__ import annotations

# Порядок признаков фиксирован: он связывает обучение и инференс.
FEATURES: list[str] = [
    "independent",
    "phone",
    "website",
    "social",
    "email",
    "hours",
    "profile",
    "mini_chain",
    "competition",
]

# Человекочитаемые подписи для объяснения вклада (панель «Почему этот лид»).
FEATURE_LABELS: dict[str, str] = {
    "independent": "Независимое заведение",
    "phone": "Указан телефон",
    "website": "Есть свой сайт",
    "social": "Активны в соцсетях",
    "email": "Указан email",
    "hours": "Указаны часы работы",
    "profile": "Детальный профиль (кухня/доставка)",
    "mini_chain": "Мини-сеть (2–5 точек)",
    "competition": "Конкуренция рядом",
}

# Подписи для отсутствующего бинарного признака (отрицательный вклад).
FEATURE_LABELS_ABSENT: dict[str, str] = {
    "independent": "Сетевое заведение",
    "phone": "Нет телефона",
    "website": "Нет своего сайта",
    "social": "Нет соцсетей",
    "email": "Нет email",
    "hours": "Не указаны часы",
    "profile": "Скудный профиль",
    "mini_chain": "Одиночная точка",
    "contacts": "Мало каналов связи",
}

_COMPETITION_CAP = 12


def extract_features(
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
) -> list[float]:
    """Превращает сигналы лида в числовой вектор признаков (порядок == FEATURES)."""
    values = {
        "independent": 0.0 if is_chain else 1.0,
        "phone": float(phone),
        "website": float(website),
        "social": float(social),
        "email": float(email),
        "hours": float(opening_hours),
        "profile": float(has_profile),
        "mini_chain": float(is_mini_chain),
        "competition": float(min(competition, _COMPETITION_CAP)),
    }
    return [values[name] for name in FEATURES]


def is_binary_feature(name: str) -> bool:
    return name != "competition"
