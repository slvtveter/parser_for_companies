"""Pydantic-модели запросов и ответов API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class City(BaseModel):
    name: str
    latin: str


class Category(BaseModel):
    id: str
    name: str


class SearchRequest(BaseModel):
    city: str = Field(..., examples=["Москва"])
    categories: list[str] = Field(..., examples=[["cafe", "bakery"]])


class Lead(BaseModel):
    id: int | None = None
    name: str
    brand: str | None = None
    is_chain: bool = False
    website: str | None = None
    phone: str | None = None
    address: str
    lat: float
    lon: float
    category_label: str
    category_key: str
    potential_score: str
    potential_reason: str
    potential_color: str
    opening_hours: str | None = None


class SearchResponse(BaseModel):
    status: str = "success"
    total: int
    leads: list[Lead]


class ExportRequest(BaseModel):
    leads: list[dict]
    format: str = Field("csv", examples=["csv", "xlsx"])


class PitchRequest(BaseModel):
    business_name: str
    category_key: str
    website: str | None = None
    phone: str | None = None
    pitch_type: str = Field("analytics", examples=["analytics", "startup"])


class AIPitchRequest(BaseModel):
    business_name: str
    category_label: str
    website: str | None = None
    phone: str | None = None
    # Если ключ не передан, используется серверный из настроек (OPENROUTER_API_KEY).
    api_key: str | None = None
    model: str | None = None


class PitchResponse(BaseModel):
    subject: str
    body: str


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
