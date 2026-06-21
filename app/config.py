"""Конфигурация приложения через переменные окружения (.env)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения. Значения читаются из переменных окружения или файла .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Метаданные сервиса ---
    app_name: str = "LeadAnalytics"
    app_description: str = (
        "Поиск локального бизнеса (OpenStreetMap) с ML-оценкой аналитического "
        "потенциала, фильтрами и обзором рынка."
    )
    version: str = "2.0.0"

    # --- CORS ---
    cors_origins: list[str] = ["*"]

    # --- Overpass API (OpenStreetMap) ---
    overpass_mirrors: list[str] = [
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
    ]
    overpass_query_timeout: int = 120
    request_timeout: int = 45

    # Время жизни кэша результатов поиска (в секундах).
    cache_ttl: int = 600


@lru_cache
def get_settings() -> Settings:
    """Возвращает закэшированный экземпляр настроек."""
    return Settings()
