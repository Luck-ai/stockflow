from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.products import router as products_router
from .routes.categories import router as categories_router
from .routes.sales import router as sales_router
from .routes.skus import router as skus_router
from .routes.stock import router as stock_router
from .routes.analytics import router as analytics_router
from .routes.upload import router as upload_router
from .routes.po import router as po_router
from .routes.predictions import router as predictions_router
from src.database import get_engine
from src.models import Base
from fastapi import HTTPException
from sqlalchemy import text


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(title="Inventory Prediction API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products_router)
app.include_router(categories_router)
app.include_router(sales_router)
app.include_router(skus_router)
app.include_router(stock_router)
app.include_router(analytics_router)
app.include_router(upload_router, prefix="/upload", tags=["Upload"])
app.include_router(po_router, prefix="/upload", tags=["PO"])
app.include_router(predictions_router, tags=["Predictions"])


@app.get("/db/tables", tags=["Database"])
async def list_db_tables(schema: str = "public") -> list[str]:
    """Return a list of table names in the given schema.

    This uses the async engine returned by `src.database.get_engine()` and
    queries information_schema.tables. The endpoint returns only table names
    for the supplied schema.
    """
    engine = get_engine()
    query = text(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = :schema AND table_type = 'BASE TABLE' "
        "ORDER BY table_name"
    )
    try:
        async with engine.connect() as conn:
            result = await conn.execute(query, {"schema": schema})
            rows = result.scalars().all()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return rows
