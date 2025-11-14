from functools import lru_cache
from typing import Optional

from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine

from .config import get_settings


@lru_cache(maxsize=1)
def get_engine(url: Optional[str] = None) -> AsyncEngine:

    settings = get_settings()
    real_url = url or settings.sqlalchemy_url
    if real_url.startswith('postgresql://') and '+asyncpg' not in real_url:
        real_url = real_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
    return create_async_engine('')

