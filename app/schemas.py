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


class Factor(BaseModel):
    label: str
    points: int
    positive: bool = True


class Lead(BaseModel):
    id: int | None = None
    name: str
    brand: str | None = None
    is_chain: bool = False
    is_mini_chain: bool = False
    location_count: int = 1
    website: str | None = None
    social: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str
    district: str | None = None
    lat: float
    lon: float
    category_label: str
    category_key: str
    cuisine: str | None = None
    delivery: bool = False
    takeaway: bool = False
    outdoor_seating: bool = False
    wheelchair: bool = False
    competition: int = 0
    score: int = 0
    potential_score: str
    potential_reason: str
    potential_color: str
    factors: list[Factor] = []
    opening_hours: str | None = None


class CategoryStat(BaseModel):
    key: str
    label: str
    count: int


class DistrictStat(BaseModel):
    name: str
    count: int


class Overview(BaseModel):
    total: int
    independent_share: int
    contacts_share: int
    avg_score: float
    high: int
    medium: int
    low: int
    by_category: list[CategoryStat] = []
    top_districts: list[DistrictStat] = []


class SearchResponse(BaseModel):
    status: str = "success"
    total: int
    leads: list[Lead]
    overview: Overview | None = None
    cached: bool = False


class ExportRequest(BaseModel):
    leads: list[dict]
    format: str = Field("csv", examples=["csv", "xlsx"])


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
