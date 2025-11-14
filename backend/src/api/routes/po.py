from __future__ import annotations

from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine

from ..db import get_table, get_db_engine
from ..tables import PO_TABLE
from ..schemas import POListResponse, PORecord

router = APIRouter()


@router.get("/po", response_model=POListResponse)
async def list_po(
    item_id: Optional[str] = Query(None, description="Filter by SKU / item_id"),
    limit: int = Query(200, ge=1, le=2000, description="Max rows to return"),
    days: Optional[int] = Query(None, ge=0, le=36500, description="Return PO rows within the last N days"),
    start_date: Optional[str] = Query(None, description="Return PO rows on or after this ISO date (YYYY-MM-DD or full ISO)") ,
    engine: AsyncEngine = Depends(get_db_engine),
):
    """
    Return PO rows stored in the `po` table. Columns returned: quantity, transaction_date, item_id, name
    """
    table = await get_table(engine, PO_TABLE)

    count_stmt = select(func.count()).select_from(table)
    data_stmt = select(
        table.c.quantity,
        table.c.transaction_date,
        table.c.item_id,
        table.c.name,
    )

    if item_id:
        count_stmt = count_stmt.where(table.c.item_id == item_id)
        data_stmt = data_stmt.where(table.c.item_id == item_id)

    # Filter by start_date or days window if provided
    if start_date:
        try:
            # attempt to parse ISO date or datetime
            parsed = datetime.fromisoformat(start_date)
        except Exception:
            # fallback: try parsing date-only
            try:
                parsed = datetime.fromisoformat(start_date + 'T00:00:00')
            except Exception:
                parsed = None
        if parsed:
            count_stmt = count_stmt.where(table.c.transaction_date >= parsed)
            data_stmt = data_stmt.where(table.c.transaction_date >= parsed)
    elif days is not None:
        threshold = datetime.utcnow() - timedelta(days=days)
        count_stmt = count_stmt.where(table.c.transaction_date >= threshold)
        data_stmt = data_stmt.where(table.c.transaction_date >= threshold)

    data_stmt = data_stmt.order_by(table.c.transaction_date.desc()).limit(limit)

    async with engine.connect() as connection:
        total = int((await connection.execute(count_stmt)).scalar() or 0)
        rows = [dict(row) for row in (await connection.execute(data_stmt)).mappings().all()]

    items = [
        PORecord(
            quantity=int(row.get('quantity') or 0),
            transaction_date=row.get('transaction_date'),
            item_id=row.get('item_id') or '',
            name=row.get('name')
        )
        for row in rows
    ]
    return POListResponse(total=len(items), items=items)


@router.get('/po/{sku}', response_model=POListResponse)
async def po_by_sku(
    sku: str,
    limit: int = Query(200, ge=1, le=2000, description='Max rows to return'),
    engine: AsyncEngine = Depends(get_db_engine),
):
    return await list_po(item_id=sku, limit=limit, engine=engine)
