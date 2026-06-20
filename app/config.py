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
        "Парсер локального бизнеса (OpenStreetMap) с оценкой аналитического "
        "потенциала и генератором холодных писем."
    )
    version: str = "1.0.0"

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

    # --- OpenRouter (генерация писем нейросетью) ---
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1/chat/completions"
    openrouter_default_model: str = "openai/gpt-oss-20b:free"
    openrouter_app_url: str = "http://localhost:8000"
    openrouter_app_title: str = "LeadAnalytics"
    openrouter_timeout: int = 40


@lru_cache
def get_settings() -> Settings:
    """Возвращает закэшированный экземпляр настроек."""
    return Settings()
