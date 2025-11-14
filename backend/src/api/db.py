from __future__ import annotations

from typing import Optional, Dict

from sqlalchemy import MetaData, Table
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.future import select
from sqlalchemy import inspect

from ..database import get_engine


def get_db_engine() -> AsyncEngine:
    return get_engine()

_table_cache: Dict[str, Table] = {}


async def get_table(engine: AsyncEngine, table_name: str) -> Table:

    table = _table_cache.get(table_name)
    if table is not None:
        return table

    metadata = MetaData()

    def _reflect(sync_conn):
        return Table(table_name, metadata, autoload_with=sync_conn)

    async with engine.connect() as conn:
        table = await conn.run_sync(_reflect)
    _table_cache[table_name] = table
    return table
