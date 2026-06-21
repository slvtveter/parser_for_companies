"""Сводная аналитика по найденной выборке заведений (обзор рынка)."""

from __future__ import annotations

from collections import Counter


def build_overview(leads: list[dict]) -> dict:
    """Считает агрегаты по списку лидов для панели «Обзор рынка»."""
    total = len(leads)
    if total == 0:
        return {
            "total": 0,
            "independent_share": 0,
            "contacts_share": 0,
            "avg_score": 0.0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "by_category": [],
            "top_districts": [],
        }

    independent = sum(1 for lead in leads if not lead.get("is_chain"))
    with_contacts = sum(
        1 for lead in leads if lead.get("phone") or lead.get("website") or lead.get("social")
    )
    avg_score = round(sum(lead.get("score", 0) for lead in leads) / total, 1)
    levels = Counter(lead.get("potential_score") for lead in leads)

    cat_counts: Counter[str] = Counter()
    cat_labels: dict[str, str] = {}
    for lead in leads:
        key = lead.get("category_key", "other")
        cat_counts[key] += 1
        cat_labels[key] = lead.get("category_label", key)
    by_category = [
        {"key": key, "label": cat_labels[key], "count": count}
        for key, count in cat_counts.most_common()
    ]

    district_counts: Counter[str] = Counter()
    for lead in leads:
        district = lead.get("district")
        if district:
            district_counts[district] += 1
    top_districts = [
        {"name": name, "count": count} for name, count in district_counts.most_common(5)
    ]

    return {
        "total": total,
        "independent_share": round(independent / total * 100),
        "contacts_share": round(with_contacts / total * 100),
        "avg_score": avg_score,
        "high": levels.get("HIGH", 0),
        "medium": levels.get("MEDIUM", 0),
        "low": levels.get("LOW", 0),
        "by_category": by_category,
        "top_districts": top_districts,
    }
