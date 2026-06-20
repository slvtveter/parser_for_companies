"""Потокобезопасный TTL-кэш в памяти для результатов поиска."""

from __future__ import annotations

import time
from collections.abc import Hashable
from threading import Lock
from typing import Any


class TTLCache:
    """Простой кэш «ключ-значение» с временем жизни записей и ограничением размера.

    Используется, чтобы не дёргать Overpass API повторно при одинаковых запросах
    (один и тот же город и набор категорий) в течение ``ttl`` секунд.
    """

    def __init__(self, ttl: int = 600, maxsize: int = 64) -> None:
        self.ttl = ttl
        self.maxsize = maxsize
        self._store: dict[Hashable, tuple[Any, float]] = {}
        self._lock = Lock()

    def get(self, key: Hashable) -> Any | None:
        with self._lock:
            item = self._store.get(key)
            if item is None:
                return None
            value, expires_at = item
            if time.monotonic() > expires_at:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: Hashable, value: Any) -> None:
        with self._lock:
            if key not in self._store and len(self._store) >= self.maxsize:
                # Вытесняем запись с самым ранним сроком истечения.
                oldest = min(self._store, key=lambda k: self._store[k][1])
                self._store.pop(oldest, None)
            self._store[key] = (value, time.monotonic() + self.ttl)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
