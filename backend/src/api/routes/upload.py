from __future__ import annotations

import io
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine
from pydantic import BaseModel

from ..db import get_table, get_db_engine
from ..tables import SALES_TABLE, SKUS_TABLE, STOCK_TABLE, PO_TABLE
from ..schemas import CategoriesResponse

from ...etl_pipeline import load_sales_dataframe, load_skus_dataframe, load_stock_dataframe

router = APIRouter()


class UploadResponse(BaseModel):
    message: str
    rows_inserted: int


@router.post("/sales", response_model=UploadResponse)
async def upload_sales(
    file: UploadFile = File(..., description="Excel file containing sales data"),
    engine: AsyncEngine = Depends(get_db_engine)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")
    
    try:
        contents = await file.read()
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            tmp_file.write(contents)
            tmp_path = tmp_file.name
        
        try:
            sales_df = load_sales_dataframe(tmp_path)
            
            def _insert_sales(sync_conn):
                sales_df.to_sql(
                    name=SALES_TABLE,
                    con=sync_conn,
                    if_exists="append",
                    index=False
                )
                return len(sales_df)
            
            async with engine.begin() as conn:
                rows_inserted = await conn.run_sync(_insert_sales)
            
            return UploadResponse(
                message=f"Successfully uploaded sales data",
                rows_inserted=rows_inserted
            )
        finally:
            Path(tmp_path).unlink(missing_ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process sales data: {str(e)}")


@router.post("/stock", response_model=UploadResponse)
async def upload_stock(
    file: UploadFile = File(..., description="Excel file containing stock data"),
    engine: AsyncEngine = Depends(get_db_engine)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")
    
    try:
        contents = await file.read()
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            tmp_file.write(contents)
            tmp_path = tmp_file.name
        
        try:
            stock_df = load_stock_dataframe(tmp_path)
            
            def _insert_stock(sync_conn):
                stock_df.to_sql(
                    name=STOCK_TABLE,
                    con=sync_conn,
                    if_exists="append",
                    index=False
                )
                return len(stock_df)
            

            async with engine.begin() as conn:
                rows_inserted = await conn.run_sync(_insert_stock)

            return UploadResponse(
                message=f"Successfully uploaded stock and sku data",
                rows_inserted=rows_inserted
            )
        finally:
            Path(tmp_path).unlink(missing_ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process stock data: {str(e)}")


@router.post("/skus", response_model=UploadResponse)
async def upload_skus(
    file: UploadFile = File(..., description="Excel file containing SKUs data"),
    engine: AsyncEngine = Depends(get_db_engine)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")
    
    try:
        contents = await file.read()
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            tmp_file.write(contents)
            tmp_path = tmp_file.name
        
        try:
            skus_df = load_skus_dataframe(tmp_path)
            
            def _insert_skus(sync_conn):
                skus_df.to_sql(
                    name=SKUS_TABLE,
                    con=sync_conn,
                    if_exists="append",
                    index=False
                )
                return len(skus_df)
            
            async with engine.begin() as conn:
                rows_inserted = await conn.run_sync(_insert_skus)
            
            return UploadResponse(
                message=f"Successfully uploaded SKUs data",
                rows_inserted=rows_inserted
            )
        finally:
            Path(tmp_path).unlink(missing_ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process SKUs data: {str(e)}")

# @router.post("/po", response_model=UploadResponse)
# async def upload_po(
#     file: UploadFile = File(..., description="Excel file containing PO data"),
#     engine: AsyncEngine = Depends(get_db_engine)
# ):
#     if not file.filename.endswith(('.xlsx', '.xls')):
#         raise HTTPException(status_code=400, detail="File must be an Excel file (.xlsx or .xls)")
    
#     try:
#         contents = await file.read()
        
#         with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
#             tmp_file.write(contents)
#             tmp_path = tmp_file.name
        
#         try:
#             po_df = load_po_dataframe(tmp_path)

#             def _insert_po(sync_conn):
#                 po_df.to_sql(
#                     name=PO_TABLE,
#                     con=sync_conn,
#                     if_exists="append",
#                     index=False
#                 )
#                 return len(po_df)
            
#             async with engine.begin() as conn:
#                 rows_inserted = await conn.run_sync(_insert_po)

#             return UploadResponse(
#                 message=f"Successfully uploaded PO data",
#                 rows_inserted=rows_inserted
#             )
#         finally:
#             Path(tmp_path).unlink(missing_ok=True)
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Failed to process PO data: {str(e)}")
