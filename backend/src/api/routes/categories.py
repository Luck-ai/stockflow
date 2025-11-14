from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine

from ..db import get_table, get_db_engine
from ..tables import SKUS_TABLE
from ..schemas import CategoriesResponse

router = APIRouter()


@router.get('/categories', response_model=CategoriesResponse)
async def categories(engine: AsyncEngine = Depends(get_db_engine)):
    skus_table = await get_table(engine, SKUS_TABLE)
    stmt = select(func.distinct(skus_table.c.category)).where(skus_table.c.category != None)

    async with engine.connect() as conn:
        result = await conn.execute(stmt)
        rows = [r[0] for r in result.all()]
    items = [{'id': idx + 1, 'name': r} for idx, r in enumerate(rows if rows else [])]
    return CategoriesResponse(total=len(items), items=items)
