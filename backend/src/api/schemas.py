from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class PipelineSummary(BaseModel):
    sales: int
    skus: int
    stock: int


class SalesRecord(BaseModel):
    transaction_date: datetime
    item_id: str
    platform: Optional[str]
    quantity: int


class SalesResponse(BaseModel):
    total: int
    items: list[SalesRecord]


class PORecord(BaseModel):
    quantity: int
    transaction_date: datetime
    item_id: str
    name: Optional[str] = None


class POListResponse(BaseModel):
    total: int
    items: list[PORecord]


class SKURecord(BaseModel):
    raw_id: str
    name: str
    category: Optional[str]
    subcategory: Optional[str]
    unit: Optional[str]
    size: Optional[str]


class SKUResponse(BaseModel):
    total: int
    items: list[SKURecord]


class ProductRecord(BaseModel):
    # Product record combines SKU table and STOCK quantity when available.
    raw_id: str
    name: str
    category: Optional[str]
    subcategory: Optional[str]
    unit: Optional[str]
    size: Optional[str]
    quantity: Optional[int]
    # Optional sales metric: average daily sales over a configurable recent window (units/day)
    daily_sales_rate: Optional[float] = None


class ProductsResponse(BaseModel):
    total: int
    items: list[ProductRecord]


class CategoryRecord(BaseModel):
    id: int
    name: str


class CategoriesResponse(BaseModel):
    total: int
    items: list[CategoryRecord]


class StockRecord(BaseModel):
    raw_id: str
    name: str
    category: Optional[str]
    quantity: int
    # Optional last sale datetime (available from endpoints that join sales)
    last_sale_date: Optional[datetime] = None


class StockResponse(BaseModel):
    total: int
    items: list[StockRecord]


class ActivityRecord(BaseModel):
    raw_id: str
    is_active: bool
    last_sale_date: Optional[datetime] = None


class ActivityResponse(BaseModel):
    raw_id: str
    is_active: bool
    last_sale_date: Optional[datetime] = None


class TopSkuRecord(BaseModel):
    sku: str
    total_quantity: int


class TopSkusResponse(BaseModel):
    items: list[TopSkuRecord]


class TopCategoryRecord(BaseModel):
    category: Optional[str]
    total_quantity: int
    # Number of distinct products (SKUs) in this category
    product_count: int = 0


class TopCategoriesResponse(BaseModel):
    items: list[TopCategoryRecord]


class TimeSeriesDataPoint(BaseModel):
    period: str
    total: int


class ChannelDataPoint(BaseModel):
    period: str
    total: int
    model_config = {"extra": "allow"}


class CategoryDataPoint(BaseModel):
    period: str
    total: int
    model_config = {"extra": "allow"}


class SalesTimeSeriesResponse(BaseModel):
    granularity: str
    data: list[TimeSeriesDataPoint]


class SalesByChannelResponse(BaseModel):
    granularity: str
    channels: list[str]
    data: list[ChannelDataPoint]


class ChannelSummary(BaseModel):
    channel: str
    total: int


class SalesByChannelSummaryResponse(BaseModel):
    total: int
    items: list[ChannelSummary]


class SalesByCategoryResponse(BaseModel):
    granularity: str
    categories: list[str]
    data: list[CategoryDataPoint]


class MarketShareResponse(BaseModel):
    sku: str
    product_total: int
    category: Optional[str]
    category_total: int
    overall_total: int
    product_share_of_category: float
    product_share_of_overall: float
