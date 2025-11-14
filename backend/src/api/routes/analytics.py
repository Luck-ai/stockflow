from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, cast, String
from sqlalchemy.ext.asyncio import AsyncEngine

from ..db import get_table, get_db_engine
from ..tables import SALES_TABLE, SKUS_TABLE
from ..schemas import (
    SalesTimeSeriesResponse, 
    TimeSeriesDataPoint,
    SalesByChannelResponse,
    ChannelDataPoint,
    SalesByCategoryResponse,
    CategoryDataPoint
)
from ..schemas import SalesByChannelSummaryResponse, ChannelSummary
from ..schemas import MarketShareResponse

router = APIRouter()


@router.get('/analytics/sales/timeseries', response_model=SalesTimeSeriesResponse)
async def get_sales_timeseries(
    granularity: Literal['monthly', 'weekly'] = Query(default='monthly'),
    engine: AsyncEngine = Depends(get_db_engine),
) -> SalesTimeSeriesResponse:
    """
    Get aggregated sales data over time (monthly or weekly).
    Much faster than client-side aggregation.
    """
    table = await get_table(engine, SALES_TABLE)

    if granularity == 'monthly':
        period_expr = func.to_char(table.c.transaction_date, 'YYYY-MM')
    else:
        period_expr = func.to_char(
            func.date_trunc('week', table.c.transaction_date),
            'YYYY-MM-DD'
        )

    stmt = select(
        period_expr.label('period'),
        func.sum(table.c.quantity).label('total')
    ).group_by(
        period_expr
    ).order_by(
        period_expr
    )

    async with engine.connect() as connection:
        rows = [dict(r) for r in (await connection.execute(stmt)).mappings().all()]

    data = [
        TimeSeriesDataPoint(
            period=row['period'],
            total=int(row['total'] or 0)
        )
        for row in rows
    ]

    return SalesTimeSeriesResponse(granularity=granularity, data=data)


@router.get('/analytics/sales/by-channel', response_model=SalesByChannelResponse)
async def get_sales_by_channel(
    granularity: Literal['monthly', 'weekly'] = Query(default='monthly'),
    channel: str = Query(default=None, description='Filter by specific channel, or omit for all'),
    sku: Optional[str] = Query(default=None, description='Filter by specific SKU/item_id'),
    engine: AsyncEngine = Depends(get_db_engine),
) -> SalesByChannelResponse:
    """
    Get sales aggregated by channel over time.
    Returns data pre-aggregated by SQL for optimal performance.
    """
    table = await get_table(engine, SALES_TABLE)

    if granularity == 'monthly':
        period_expr = func.to_char(table.c.transaction_date, 'YYYY-MM')
    else:
        period_expr = func.to_char(
            func.date_trunc('week', table.c.transaction_date),
            'YYYY-MM-DD'
        )

    stmt = select(
        period_expr.label('period'),
        func.coalesce(table.c.platform, 'unknown').label('channel'),
        func.sum(table.c.quantity).label('quantity')
    ).group_by(
        period_expr,
        table.c.platform
    ).order_by(
        period_expr,
        table.c.platform
    )

    if channel:
        stmt = stmt.where(table.c.platform == channel)

    if sku:
        # restrict to the specific SKU/item_id when requested
        stmt = stmt.where(table.c.item_id == sku)

    async with engine.connect() as connection:
        all_channels_stmt = select(
            func.coalesce(table.c.platform, 'unknown').label('channel')
        ).distinct()
        if sku:
            all_channels_stmt = all_channels_stmt.where(table.c.item_id == sku)
        
        all_channels_rows = (await connection.execute(all_channels_stmt)).mappings().all()
        channels = sorted(list(set(row['channel'] for row in all_channels_rows)))
        
        rows = [dict(r) for r in (await connection.execute(stmt)).mappings().all()]
    
    period_map = {}
    for row in rows:
        period = row['period']
        channel = row['channel'] or 'unknown'
        quantity = int(row['quantity'] or 0)
        
        if period not in period_map:
            if granularity == 'monthly':
                period_map[period] = {'period': period, 'month': period, 'total': 0}
            else:
                period_map[period] = {'period': period, 'total': 0}
        
        period_map[period][channel] = quantity
        period_map[period]['total'] += quantity
    
    data = [
        ChannelDataPoint(**period_data)
        for period_data in sorted(period_map.values(), key=lambda x: x['period'])
    ]

    return SalesByChannelResponse(
        granularity=granularity,
        channels=channels,
        data=data
    )


@router.get('/analytics/sales/by-channel/sku', response_model=SalesByChannelSummaryResponse)
async def get_sales_by_channel_summary_for_sku(
    sku: str = Query(..., description='SKU or item_id to aggregate'),
    engine: AsyncEngine = Depends(get_db_engine),
):
    """
    Return overall sales totals grouped by channel for a single SKU.
    This endpoint is optimized for the product details page which needs
    overall per-channel totals instead of timeseries.
    """
    table = await get_table(engine, SALES_TABLE)

    stmt = select(
        func.coalesce(table.c.platform, 'unknown').label('channel'),
        func.sum(table.c.quantity).label('total')
    ).where(
        table.c.item_id == sku
    ).group_by(
        table.c.platform
    ).order_by(
        func.sum(table.c.quantity).desc()
    )

    async with engine.connect() as connection:
        rows = [dict(r) for r in (await connection.execute(stmt)).mappings().all()]

    items = [ChannelSummary(channel=row.get('channel') or 'unknown', total=int(row.get('total') or 0)) for row in rows]
    total = sum(item.total for item in items)
    return SalesByChannelSummaryResponse(total=total, items=items)


@router.get('/analytics/sales/market-share', response_model=MarketShareResponse)
async def get_market_share_for_sku(
    sku: str = Query(..., description='SKU or item_id to compute market share for'),
    engine: AsyncEngine = Depends(get_db_engine),
):
    """
    Return market share information for a SKU: totals for the SKU, its category, and overall sales.
    """
    sales_table = await get_table(engine, SALES_TABLE)
    skus_table = await get_table(engine, SKUS_TABLE)

    async with engine.connect() as connection:
        # product total for sku
        prod_stmt = select(func.coalesce(func.sum(sales_table.c.quantity), 0).label('product_total')).where(sales_table.c.item_id == sku)
        prod_row = (await connection.execute(prod_stmt)).mappings().one_or_none()
        product_total = int(prod_row['product_total'] or 0) if prod_row else 0

        # find category for this sku from skus table
        cat_stmt = select(skus_table.c.category).where(skus_table.c.raw_id == sku)
        cat_row = (await connection.execute(cat_stmt)).mappings().one_or_none()
        category = cat_row['category'] if cat_row and cat_row['category'] is not None else None

        # category total (if category known) else 0
        if category:
            cat_total_stmt = select(func.coalesce(func.sum(sales_table.c.quantity), 0).label('category_total')).select_from(
                sales_table.join(skus_table, sales_table.c.item_id == skus_table.c.raw_id)
            ).where(skus_table.c.category == category)
            cat_row2 = (await connection.execute(cat_total_stmt)).mappings().one_or_none()
            category_total = int(cat_row2['category_total'] or 0) if cat_row2 else 0
        else:
            category_total = 0

        # overall total across all sales
        overall_stmt = select(func.coalesce(func.sum(sales_table.c.quantity), 0).label('overall_total'))
        overall_row = (await connection.execute(overall_stmt)).mappings().one_or_none()
        overall_total = int(overall_row['overall_total'] or 0) if overall_row else 0

    product_share_of_category = (product_total / category_total * 100) if category_total > 0 else 0.0
    product_share_of_overall = (product_total / overall_total * 100) if overall_total > 0 else 0.0

    return MarketShareResponse(
        sku=sku,
        product_total=product_total,
        category=category,
        category_total=category_total,
        overall_total=overall_total,
        product_share_of_category=round(product_share_of_category, 4),
        product_share_of_overall=round(product_share_of_overall, 4),
    )


@router.get('/analytics/sales/by-category', response_model=SalesByCategoryResponse)
async def get_sales_by_category(
    granularity: Literal['monthly', 'weekly'] = Query(default='monthly'),
    category: str = Query(default=None, description='Filter by specific category, or omit for all'),
    min_sales: int = Query(default=1000, description='Minimum total sales across returned periods to include a category'),
    engine: AsyncEngine = Depends(get_db_engine),
) -> SalesByCategoryResponse:
    """
    Get sales aggregated by category over time.
    Joins sales with SKUs table to get category information.
    """
    sales_table = await get_table(engine, SALES_TABLE)
    skus_table = await get_table(engine, SKUS_TABLE)

    if granularity == 'monthly':
        period_expr = func.to_char(sales_table.c.transaction_date, 'YYYY-MM')
    else:
        period_expr = func.to_char(
            func.date_trunc('week', sales_table.c.transaction_date),
            'YYYY-MM-DD'
        )

    stmt = select(
        period_expr.label('period'),
        func.coalesce(skus_table.c.category, 'Unknown').label('category'),
        func.sum(sales_table.c.quantity).label('quantity')
    ).select_from(
        sales_table.join(
            skus_table,
            sales_table.c.item_id == skus_table.c.raw_id
        )
    ).group_by(
        period_expr,
        skus_table.c.category
    ).order_by(
        period_expr,
        skus_table.c.category
    )

    if category:
        stmt = stmt.where(skus_table.c.category == category)

    async with engine.connect() as connection:
        all_categories_stmt = select(
            func.coalesce(skus_table.c.category, 'Unknown').label('category')
        ).select_from(skus_table).distinct()
        
        all_categories_rows = (await connection.execute(all_categories_stmt)).mappings().all()
        categories = sorted(list(set(row['category'] for row in all_categories_rows)))
        
        rows = [dict(r) for r in (await connection.execute(stmt)).mappings().all()]
    
    period_map = {}
    for row in rows:
        period = row['period']
        category = row['category'] or 'Unknown'
        quantity = int(row['quantity'] or 0)
        
        if period not in period_map:
            if granularity == 'monthly':
                period_map[period] = {'period': period, 'month': period, 'total': 0}
            else:
                period_map[period] = {'period': period, 'total': 0}
        
        period_map[period][category] = quantity
        period_map[period]['total'] += quantity
    
    # compute total per category across all returned periods
    category_totals = {c: 0 for c in categories}
    for period_obj in period_map.values():
        for c in categories:
            if c in period_obj:
                category_totals[c] += float(period_obj[c])

    # filter categories by min_sales threshold
    filtered_categories = [c for c, t in category_totals.items() if t >= min_sales]

    # fallback: if nothing meets the threshold, include top categories up to 5
    if len(filtered_categories) == 0 and len(categories) > 0:
        filtered_categories = sorted(categories, key=lambda x: category_totals.get(x, 0), reverse=True)[:5]

    # prune each period object to only include filtered categories and recompute totals
    for period_obj in period_map.values():
        # remove keys that are category names but not in filtered_categories
        keys_to_remove = [k for k in period_obj.keys() if k not in ('period', 'total', 'month') and k not in filtered_categories]
        for k in keys_to_remove:
            del period_obj[k]
        # recompute total as sum of remaining category values
        period_obj['total'] = sum(int(period_obj.get(c, 0)) for c in filtered_categories)

    data = [
        CategoryDataPoint(**period_data)
        for period_data in sorted(period_map.values(), key=lambda x: x['period'])
    ]

    return SalesByCategoryResponse(
        granularity=granularity,
        categories=filtered_categories,
        data=data
    )
