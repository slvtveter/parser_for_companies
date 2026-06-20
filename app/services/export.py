"""Экспорт списка лидов в CSV или XLSX."""

from __future__ import annotations

import io

import pandas as pd

# Порядок и русские названия колонок при экспорте.
COLUMNS_MAPPING: dict[str, str] = {
    "name": "Название",
    "category_label": "Категория",
    "address": "Адрес",
    "phone": "Телефон",
    "website": "Сайт/Соцсеть",
    "brand": "Сеть/Бренд",
    "potential_score": "Потенциал аналитики",
    "potential_reason": "Обоснование оценки",
    "lat": "Широта",
    "lon": "Долгота",
    "opening_hours": "Режим работы",
}


def build_export(leads: list[dict], fmt: str = "csv") -> tuple[bytes, str, str]:
    """Готовит файл выгрузки.

    Возвращает кортеж ``(содержимое, media_type, имя_файла)``.
    """
    df = pd.DataFrame(leads)
    cols = [col for col in COLUMNS_MAPPING if col in df.columns]
    df_export = df[cols].rename(columns={c: COLUMNS_MAPPING[c] for c in cols})

    if fmt.lower() == "xlsx":
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            df_export.to_excel(writer, index=False, sheet_name="Лиды")
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        return buffer.getvalue(), media_type, "analytics_leads.xlsx"

    csv_text = df_export.to_csv(index=False)
    return csv_text.encode("utf-8-sig"), "text/csv", "analytics_leads.csv"
