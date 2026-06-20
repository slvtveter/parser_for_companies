"""Совместимость: позволяет запускать сервер как `uvicorn main:app`.

Рекомендуемый способ запуска — `uvicorn app.main:app --reload`.
"""

from app.main import app

__all__ = ["app"]
