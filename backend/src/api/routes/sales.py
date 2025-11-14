from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine

from ..db import get_table, get_db_engine
from ..tables import SALES_TABLE
from ..tables import SKUS_TABLE
from ..schemas import SalesResponse, SalesRecord
from ..schemas import TopSkusResponse, TopSkuRecord, TopCategoriesResponse, TopCategoryRecord

router = APIRouter()


@router.get('/sales', response_model=SalesResponse)
async def get_sales(
    limit: Optional[int] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    platform: Optional[str] = None,
    item_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    engine: AsyncEngine = Depends(get_db_engine),
) -> SalesResponse:
    table = await get_table(engine, SALES_TABLE)

    count_stmt = select(func.count()).select_from(table)
    data_stmt = select(
        table.c.transaction_date,
        table.c.item_id,
        table.c.platform,
        table.c.quantity,
    )

    filters = []
    if platform:
        filters.append(table.c.platform == platform)
    if item_id:
        filters.append(table.c.item_id == item_id)
    if start_date:
        filters.append(table.c.transaction_date >= start_date)
    if end_date:
        filters.append(table.c.transaction_date <= end_date)

    for condition in filters:
        count_stmt = count_stmt.where(condition)
        data_stmt = data_stmt.where(condition)

    data_stmt = data_stmt.order_by(table.c.transaction_date.desc())
    if limit is not None:
        data_stmt = data_stmt.limit(limit).offset(offset)

    async with engine.connect() as connection:
        total = int((await connection.execute(count_stmt)).scalar() or 0)
        rows = [dict(row) for row in (await connection.execute(data_stmt)).mappings().all()]

    items = [
        SalesRecord(
            transaction_date=row['transaction_date'],
            item_id=row.get('item_id') or '',
            platform=row.get('platform'),
            quantity=int(row.get('quantity') or 0),
        )
        for row in rows
    ]
    return SalesResponse(total=total, items=items)




@router.get('/sales/top_skus', response_model=TopSkusResponse)
async def top_skus(
    limit: int = 5,
    engine: AsyncEngine = Depends(get_db_engine),
):
    table = await get_table(engine, SALES_TABLE)

    stmt = select(
        table.c.item_id.label('sku'),
        func.sum(table.c.quantity).label('total_quantity')
    ).where(table.c.item_id != None).group_by(table.c.item_id).order_by(func.sum(table.c.quantity).desc()).limit(limit)

    async with engine.connect() as connection:
        rows = [dict(r) for r in (await connection.execute(stmt)).mappings().all()]

    items = [TopSkuRecord(sku=row.get('sku') or '', total_quantity=int(row.get('total_quantity') or 0)) for row in rows]
    return TopSkusResponse(items=items)



@router.get('/sales/top_categories', response_model=TopCategoriesResponse)
async def top_categories(
    engine: AsyncEngine = Depends(get_db_engine),
):
    sales_table = await get_table(engine, SALES_TABLE)
    skus_table = await get_table(engine, SKUS_TABLE)

    # Join sales -> skus to aggregate by authoritative SKU category
    stmt = select(
        skus_table.c.category.label('category'),
        func.sum(sales_table.c.quantity).label('total_quantity')
        , func.count(func.distinct(skus_table.c.raw_id)).label('product_count')
    ).select_from(
        sales_table.join(skus_table, sales_table.c.item_id == skus_table.c.raw_id)
    ).group_by(skus_table.c.category).order_by(func.sum(sales_table.c.quantity).desc())

    async with engine.connect() as connection:
        rows = [dict(r) for r in (await connection.execute(stmt)).mappings().all()]

    items = [TopCategoryRecord(
        category=row.get('category'),
        total_quantity=int(row.get('total_quantity') or 0),
        product_count=int(row.get('product_count') or 0)
    ) for row in rows]
    return TopCategoriesResponse(items=items)



@router.get('/sales/{sku}', response_model=SalesResponse)
async def sales_by_sku(
    sku: str = Path(..., description='SKU or item id'),
    limit: Optional[int] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    engine: AsyncEngine = Depends(get_db_engine),
):
    table = await get_table(engine, SALES_TABLE)

    count_stmt = select(func.count()).select_from(table).where(table.c.item_id == sku)
    data_stmt = select(
        table.c.transaction_date,
        table.c.item_id,
        table.c.platform,
        table.c.quantity,
    ).where(table.c.item_id == sku).order_by(table.c.transaction_date.desc())

    if limit is not None:
        data_stmt = data_stmt.limit(limit).offset(offset)

    async with engine.connect() as connection:
        total = int((await connection.execute(count_stmt)).scalar() or 0)
        rows = [dict(row) for row in (await connection.execute(data_stmt)).mappings().all()]

    items = [
        SalesRecord(
            transaction_date=row['transaction_date'],
            item_id=row.get('item_id') or '',
            platform=row.get('platform'),
            quantity=int(row.get('quantity') or 0),
        )
        for row in rows
    ]
    return SalesResponse(total=total, items=items)
