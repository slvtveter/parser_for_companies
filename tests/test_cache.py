"""Тесты TTL-кэша."""

from __future__ import annotations

import time

from app.services.cache import TTLCache


def test_set_and_get():
    cache = TTLCache(ttl=60)
    cache.set("k", [1, 2, 3])
    assert cache.get("k") == [1, 2, 3]


def test_missing_key_returns_none():
    assert TTLCache().get("nope") is None


def test_expiry():
    cache = TTLCache(ttl=0)  # запись истекает мгновенно
    cache.set("k", "v")
    time.sleep(0.01)
    assert cache.get("k") is None


def test_maxsize_eviction():
    cache = TTLCache(ttl=60, maxsize=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)  # должно вытеснить самую раннюю запись
    assert len(cache._store) == 2


def test_clear():
    cache = TTLCache()
    cache.set("a", 1)
    cache.clear()
    assert cache.get("a") is None
