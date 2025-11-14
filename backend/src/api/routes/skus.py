from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine

from ..db import get_table, get_db_engine
from ..tables import SKUS_TABLE
from ..schemas import SKUResponse, SKURecord

router = APIRouter()


@router.get('/skus', response_model=SKUResponse)
async def get_skus(
    limit: Optional[int] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    unit: Optional[str] = None,
    engine: AsyncEngine = Depends(get_db_engine),
) -> SKUResponse:
    table = await get_table(engine, SKUS_TABLE)

    count_stmt = select(func.count()).select_from(table)
    data_stmt = select(
        table.c.raw_id,
        table.c.name,
        table.c.category,
        table.c.subcategory,
        table.c.unit,
        table.c.size,
    )

    filters = []
    if category:
        filters.append(table.c.category == category)
    if subcategory:
        filters.append(table.c.subcategory == subcategory)
    if unit:
        filters.append(table.c.unit == unit)

    for condition in filters:
        count_stmt = count_stmt.where(condition)
        data_stmt = data_stmt.where(condition)

    data_stmt = data_stmt.order_by(table.c.name.asc())
    if limit is not None:
        data_stmt = data_stmt.limit(limit).offset(offset)

    async with engine.connect() as connection:
        total = int((await connection.execute(count_stmt)).scalar() or 0)
        rows = [dict(row) for row in (await connection.execute(data_stmt)).mappings().all()]

    items = [
        SKURecord(
            raw_id=row['raw_id'],
            name=row['name'],
            category=row.get('category'),
            subcategory=row.get('subcategory'),
            unit=row.get('unit'),
            size=row.get('size'),
        )
        for row in rows
    ]
    return SKUResponse(total=total, items=items)
