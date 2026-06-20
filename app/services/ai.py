"""Генерация писем нейросетью через OpenRouter."""

from __future__ import annotations

import logging

import requests

from app.config import get_settings

logger = logging.getLogger(__name__)


class AIPitchError(RuntimeError):
    """Ошибка генерации письма нейросетью."""


def _build_prompt(business_name: str, category_label: str, website: str | None, phone: str | None) -> str:
    return (
        "Ты — студент-разработчик 3 курса. Напиши короткое холодное предложение "
        f"о бесплатной аналитике данных для компании {business_name} (сфера: {category_label}).\n"
        f"Сайт заведения: {website or 'не указан'}.\n"
        f"Телефон: {phone or 'не указан'}.\n\n"
        "СТРОГИЕ ПРАВИЛА:\n"
        "1. Пиши на русском языке, просто и без пафоса, словно знакомому предпринимателю в Телеграм.\n"
        "2. Запрещены клише: 'Надеюсь, это письмо застанет вас в здравии', 'Уникальное предложение', "
        "'Революционный подход', 'Уважаемые господа'.\n"
        "3. Никаких списков со смайликами. Максимум 3-4 коротких абзаца. Начни сразу с сути: "
        "кто ты и чем конкретно можешь помочь их бизнесу бесплатно за отзыв."
    )


def generate_ai_pitch(
    business_name: str,
    category_label: str,
    website: str | None = None,
    phone: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> dict[str, str]:
    """Запрашивает у OpenRouter персональное письмо. Возвращает тему и тело.

    Если ``api_key`` не передан, берётся серверный ключ из настроек
    (``OPENROUTER_API_KEY``). При его отсутствии поднимается ``AIPitchError``.
    """
    settings = get_settings()
    key = api_key or settings.openrouter_api_key
    if not key:
        raise AIPitchError(
            "Не указан API-ключ OpenRouter. Передайте его в запросе "
            "или задайте переменную окружения OPENROUTER_API_KEY."
        )

    prompt = _build_prompt(business_name, category_label, website, phone)
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.openrouter_app_url,
        "X-Title": settings.openrouter_app_title,
    }
    payload = {
        "model": model or settings.openrouter_default_model,
        "messages": [{"role": "user", "content": prompt}],
    }

    try:
        res = requests.post(
            settings.openrouter_base_url,
            headers=headers,
            json=payload,
            timeout=settings.openrouter_timeout,
        )
    except requests.RequestException as exc:
        logger.error("Запрос к OpenRouter не удался: %s", exc)
        raise AIPitchError(f"Сетевая ошибка при обращении к OpenRouter: {exc}") from exc

    if res.status_code != 200:
        raise AIPitchError(f"OpenRouter вернул ошибку {res.status_code}: {res.text}")

    choices = res.json().get("choices", [])
    if not choices:
        raise AIPitchError("OpenRouter не вернул ни одного варианта ответа.")

    text = choices[0].get("message", {}).get("content", "")
    return {"subject": f"Предложение по аналитике для {business_name}", "body": text}
