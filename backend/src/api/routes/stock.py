from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine

from ..db import get_db_engine, get_table
from ..tables import STOCK_TABLE, SALES_TABLE
from ..schemas import StockResponse, StockRecord

router = APIRouter()


@router.get("/stock", response_model=StockResponse)
async def get_stock(
    limit: Optional[int] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    category: Optional[str] = None,
    engine: AsyncEngine = Depends(get_db_engine),
) -> StockResponse:
    table = await get_table(engine, STOCK_TABLE)

    count_stmt = select(func.count()).select_from(table)
    data_stmt = select(
        table.c.raw_id,
        table.c.name,
        table.c.category,
        table.c.quantity,
    )

    filters = []
    if category:
        filters.append(table.c.category == category)

    for condition in filters:
        count_stmt = count_stmt.where(condition)
        data_stmt = data_stmt.where(condition)

    # avoid returning rows with NULL raw_id which would fail Pydantic validation
    data_stmt = data_stmt.where(table.c.raw_id != None)

    data_stmt = data_stmt.order_by(table.c.name.asc())
    if limit is not None:
        data_stmt = data_stmt.limit(limit).offset(offset)

    async with engine.connect() as connection:
        total = int((await connection.execute(count_stmt)).scalar() or 0)
        rows = [dict(row) for row in (await connection.execute(data_stmt)).mappings().all()]

    items = [
        StockRecord(
            raw_id=row["raw_id"],
            name=row["name"],
            category=row.get("category"),
            quantity=int(row.get("quantity") or 0),
        )
        for row in rows
    ]
    return StockResponse(total=total, items=items)


@router.get("/stock/out_of_stock", response_model=StockResponse)
async def get_out_of_stock(
    limit: Optional[int] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    category: Optional[str] = None,
    engine: AsyncEngine = Depends(get_db_engine),
) -> StockResponse:
    table = await get_table(engine, STOCK_TABLE)

    count_stmt = select(func.count()).select_from(table)
    data_stmt = select(
        table.c.raw_id,
        table.c.name,
        table.c.category,
        table.c.quantity,
    )

    filters = [table.c.quantity == 0]
    if category:
        filters.append(table.c.category == category)

    for condition in filters:
        count_stmt = count_stmt.where(condition)
        data_stmt = data_stmt.where(condition)

    # avoid returning rows with NULL raw_id which would fail Pydantic validation
    count_stmt = count_stmt.where(table.c.raw_id != None)
    data_stmt = data_stmt.where(table.c.raw_id != None)

    data_stmt = data_stmt.order_by(table.c.name.asc())
    if limit is not None:
        data_stmt = data_stmt.limit(limit).offset(offset)

    async with engine.connect() as connection:
        total = int((await connection.execute(count_stmt)).scalar() or 0)
        rows = [dict(row) for row in (await connection.execute(data_stmt)).mappings().all()]

    items = [
        StockRecord(
            raw_id=row["raw_id"],
            name=row["name"],
            category=row.get("category"),
            quantity=int(row.get("quantity") or 0),
        )
        for row in rows
    ]
    return StockResponse(total=total, items=items)


@router.get("/stock/low", response_model=StockResponse)
async def get_low_stock(
    threshold: int = Query(..., description="Max quantity to consider low stock"),
    limit: Optional[int] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    category: Optional[str] = None,
    engine: AsyncEngine = Depends(get_db_engine),
) -> StockResponse:
    table = await get_table(engine, STOCK_TABLE)

    count_stmt = select(func.count()).select_from(table).where(table.c.quantity <= threshold)
    data_stmt = select(
        table.c.raw_id,
        table.c.name,
        table.c.category,
        table.c.quantity,
    ).where(table.c.quantity <= threshold)

    if category:
        count_stmt = count_stmt.where(table.c.category == category)
        data_stmt = data_stmt.where(table.c.category == category)

    # avoid returning rows with NULL raw_id which would fail Pydantic validation
    count_stmt = count_stmt.where(table.c.raw_id != None)
    data_stmt = data_stmt.where(table.c.raw_id != None)

    data_stmt = data_stmt.order_by(table.c.quantity.asc(), table.c.name.asc())
    if limit is not None:
        data_stmt = data_stmt.limit(limit).offset(offset)

    async with engine.connect() as connection:
        total = int((await connection.execute(count_stmt)).scalar() or 0)
        rows = [dict(row) for row in (await connection.execute(data_stmt)).mappings().all()]

    items = [
        StockRecord(
            raw_id=row["raw_id"],
            name=row["name"],
            category=row.get("category"),
            quantity=int(row.get("quantity") or 0),
        )
        for row in rows
    ]
    return StockResponse(total=total, items=items)


# /stock/dead removed in favor of /stock/activity?status=dead


# /stock/active removed in favor of /stock/activity?status=active


@router.get("/stock/activity")
async def get_stock_activity(
    sku: Optional[str] = Query(default=None, description="Optional SKU to check activity for"),
    status: Optional[str] = Query(default=None, description="When provided: 'active' or 'dead' to list items"),
    months: int = Query(default=6, description="Month window to consider for activity"),
    limit: Optional[int] = Query(default=None),
    offset: int = Query(default=0, ge=0),
    category: Optional[str] = None,
    engine: AsyncEngine = Depends(get_db_engine),
) :
    """
    When `sku` is provided, return a small ActivityResponse indicating whether the
    SKU is active (has a last_sale_date within the months window). When `sku` is not
    provided, behave like the previous /stock/active endpoint and return a StockResponse
    listing active items.
    """
    stock_table = await get_table(engine, STOCK_TABLE)
    sales_table = await get_table(engine, SALES_TABLE)

    cutoff = datetime.utcnow() - timedelta(days=months * 30)

    latest_sale_stmt = select(
        sales_table.c.item_id.label("raw_id"),
        func.max(sales_table.c.transaction_date).label("last_sale_date"),
    ).group_by(sales_table.c.item_id).subquery()

    data_stmt = select(
        stock_table.c.raw_id,
        stock_table.c.name,
        stock_table.c.category,
        stock_table.c.quantity,
        latest_sale_stmt.c.last_sale_date,
    ).select_from(stock_table.outerjoin(latest_sale_stmt, stock_table.c.raw_id == latest_sale_stmt.c.raw_id))

    # If sku provided, we only need to check that SKU
    if sku:
        data_stmt = data_stmt.where(stock_table.c.raw_id == sku)

    # If listing requested via status param, apply appropriate filters
    if status:
        if status.lower() == 'active':
            data_stmt = data_stmt.where(latest_sale_stmt.c.last_sale_date != None)
            data_stmt = data_stmt.where(latest_sale_stmt.c.last_sale_date > cutoff)
        elif status.lower() == 'dead':
            data_stmt = data_stmt.where((latest_sale_stmt.c.last_sale_date == None) | (latest_sale_stmt.c.last_sale_date <= cutoff))
        else:
            # Unrecognized status -> return empty
            return StockResponse(total=0, items=[])

    data_stmt = data_stmt.order_by(stock_table.c.name.asc())
    # avoid returning rows with NULL raw_id which would fail Pydantic validation
    data_stmt = data_stmt.where(stock_table.c.raw_id != None)
    if limit is not None:
        data_stmt = data_stmt.limit(limit).offset(offset)

    async with engine.connect() as connection:
        rows = [dict(row) for row in (await connection.execute(data_stmt)).mappings().all()]

    if sku:
        # Response for single SKU: return a simple dict with activity info
        if len(rows) == 0:
            return {"raw_id": sku, "is_active": False, "last_sale_date": None}
        row = rows[0]
        last_sale = row.get("last_sale_date")
        is_active = bool(last_sale and last_sale > cutoff)
        return {"raw_id": row.get("raw_id"), "is_active": is_active, "last_sale_date": last_sale}

    # Otherwise return a StockResponse listing items filtered by status
    items = [
        StockRecord(
            raw_id=row["raw_id"],
            name=row["name"],
            category=row.get("category"),
            quantity=int(row.get("quantity") or 0),
            last_sale_date=row.get("last_sale_date"),
        )
        for row in rows
    ]
    return StockResponse(total=len(items), items=items)
