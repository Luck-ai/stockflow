from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine

from ..db import get_table, get_db_engine
from ..tables import SKUS_TABLE, STOCK_TABLE
from ..schemas import ProductsResponse
from ..tables import SALES_TABLE
from datetime import datetime, timedelta

router = APIRouter()


@router.get("/products", response_model=ProductsResponse)
async def get_products(
    limit: Optional[int] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    category: Optional[str] = None,
    size: Optional[str] = None,
    unit: Optional[str] = None,
    sales_window_days: int = Query(default=90, ge=1, description='Window in days to compute average daily sales'),
    engine: AsyncEngine = Depends(get_db_engine),
) -> ProductsResponse:
    skus_table = await get_table(engine, SKUS_TABLE)
    stock_table = await get_table(engine, STOCK_TABLE)

    # Build select list defensively: reflected tables may lack optional columns
    from sqlalchemy import null

    skus_cols = {c.name for c in skus_table.columns}
    cols = []
    cols.append(skus_table.c.raw_id.label('raw_id'))
    cols.append(skus_table.c.name.label('name'))
    cols.append(skus_table.c.category.label('category') if 'category' in skus_cols else null().label('category'))
    cols.append(skus_table.c.subcategory.label('subcategory') if 'subcategory' in skus_cols else null().label('subcategory'))
    cols.append(skus_table.c.unit.label('unit') if 'unit' in skus_cols else null().label('unit'))
    cols.append(skus_table.c.size.label('size') if 'size' in skus_cols else null().label('size'))
    # stock_table may also be missing; use NULL if needed
    stock_cols = {c.name for c in stock_table.columns}
    cols.append(stock_table.c.quantity.label('quantity') if 'quantity' in stock_cols else null().label('quantity'))

    data_stmt = select(*cols).select_from(skus_table.outerjoin(stock_table, skus_table.c.raw_id == stock_table.c.raw_id))

    count_stmt = select(func.count()).select_from(skus_table)

    filters = []
    # Support filtering by category name
    if category:
        filters.append(skus_table.c.category == category)
    if size:
        filters.append(skus_table.c.size == size)
    if unit:
        filters.append(skus_table.c.unit == unit)

    for condition in filters:
        count_stmt = count_stmt.where(condition)
        data_stmt = data_stmt.where(condition)

    # avoid returning rows with NULL raw_id which would fail Pydantic validation
    data_stmt = data_stmt.where(skus_table.c.raw_id != None)

    data_stmt = data_stmt.order_by(skus_table.c.name.asc())
    if limit is not None:
        data_stmt = data_stmt.limit(limit).offset(offset)

    async with engine.connect() as connection:
        total = int((await connection.execute(count_stmt)).scalar() or 0)
        rows = [dict(row) for row in (await connection.execute(data_stmt)).mappings().all()]

        # Fetch recent sales (last sales_window_days) aggregated by item_id to compute average daily sales
        sales_table = await get_table(engine, SALES_TABLE)
        window_ago = datetime.utcnow() - timedelta(days=sales_window_days)
        sales_stmt = select(
            sales_table.c.item_id.label('raw_id'),
            func.sum(sales_table.c.quantity).label('sum_qty')
        ).where(sales_table.c.transaction_date >= window_ago).group_by(sales_table.c.item_id)
        sales_rows = {r['raw_id']: r for r in (await connection.execute(sales_stmt)).mappings().all()}

    items = [
        {
            'raw_id': row.get('raw_id'),
            'name': row.get('name'),
            'category': row.get('category'),
            'subcategory': row.get('subcategory'),
            'unit': row.get('unit'),
            'size': row.get('size'),
            'quantity': int(row.get('quantity')) if row.get('quantity') is not None else None,
            # Attach sales metric placeholder
            'daily_sales_rate': None,
        }
        for row in rows
    ]

    # Enrich items with sales metrics using the aggregated recent sales rows
    for item in items:
        rid = item.get('raw_id')
        sr = sales_rows.get(rid)
        if sr:
            sum_qty = sr.get('sum_qty') or 0
            # average per day over the window
            daily = float(sum_qty) / float(sales_window_days)
            item['daily_sales_rate'] = round(daily, 6)

    return ProductsResponse(total=total, items=items)


@router.get('/products/facets')
async def products_facets(engine: AsyncEngine = Depends(get_db_engine)):
    skus_table = await get_table(engine, SKUS_TABLE)
    sizes_stmt = select(func.distinct(skus_table.c.size)).where(skus_table.c.size != None)
    async with engine.connect() as connection:
        result = await connection.execute(sizes_stmt)
        sizes = [r[0] for r in result.all()]
    return {'sizes': [s for s in sizes if s]}
