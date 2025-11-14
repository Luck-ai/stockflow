from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Dict, Optional

import pandas as pd
from sqlalchemy.engine import Engine
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncEngine

# Make backend/lib importable when running this module directly.
# We add the backend directory to sys.path so `from lib.etl import SpreadSheet` works.
_this_dir = Path(__file__).resolve().parent.parent
_backend_dir = _this_dir
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from lib.etl import SpreadSheet
from src.database import get_engine


def _resolve_asset(*parts: str) -> Path:
    """Return an absolute Path to an asset relative to this module.

    Raises FileNotFoundError with a readable message that lists files in the
    target directory when the resolved path does not exist.
    """
    base = Path(__file__).resolve().parent.parent / "assets"
    candidate = base.joinpath(*parts)
    if candidate.exists():
        return candidate

    # Build helpful diagnostics
    parent_dir = candidate.parent
    found = []
    if parent_dir.exists() and parent_dir.is_dir():
        # list files (non-recursive)
        found = [p.name for p in sorted(parent_dir.iterdir())]

    raise FileNotFoundError(
        f"Asset not found: {candidate!s}\n"
        f"Searched in: {parent_dir!s}\n"
        f"Available files: {found}\n"
    )

SALES_TABLE = "sales"
SKUS_TABLE = "skus"
STOCK_TABLE = "stock"


def load_sales_dataframe(file_path: Optional[str] = None) -> pd.DataFrame:
    if file_path is None:
        sales_fpath = _resolve_asset("pajara", "Sales Order 1.xlsx")
    else:
        sales_fpath = Path(file_path)
    
    sales = SpreadSheet({
        "fpath": str(sales_fpath),
        "head_offset": 1,
        "head_cut": 1,
        "tail_cut": 3,
    }).read()

    def rename_entry(df: pd.DataFrame) -> pd.DataFrame:
        return df.rename(
            columns={
                "วันที่ทำรายการ": "transaction_date",
                "รหัสสินค้า": "item_id",
                "ช่องทางการขาย": "platform",
                "จำนวน": "quantity",
            }
        )

    def reformat_date(df: pd.DataFrame) -> pd.DataFrame:
        df["transaction_date"] = pd.to_datetime(df["transaction_date"], format="%d/%m/%Y")
        return df

    filtered = (
        sales.extract_columns([
            "วันที่ทำรายการ",
            "รหัสสินค้า",
            "ช่องทางการขาย",
            "จำนวน",
        ])
        .df_opr(lambda df: df.sort_values(by="วันที่ทำรายการ", ascending=True, ignore_index=True))
        .df_opr(rename_entry)
        .df_opr(reformat_date)
    )

    return filtered.get_df()


def load_skus_dataframe(file_path: Optional[str] = None) -> pd.DataFrame:
    if file_path is None:
        skus_fpath = _resolve_asset("pajara", "Stock.xlsx")
    else:
        skus_fpath = Path(file_path)
    
    skus = SpreadSheet(
        {
            "fpath": str(skus_fpath),
            "head_offset": 1,
            "head_cut": 1,
            "tail_cut": 3,
        }
    ).read()

    def normalize_head(df: pd.DataFrame) -> pd.DataFrame:
        return df.rename(
            columns={
                "ชื่อสินค้า": "name",
                "รหัสสินค้า": "raw_id",
                "หมวดหมู่": "category",
                "หมวดหมู่ย่อย": "subcategory",
            }
        )

    # def normalize_body(df: pd.DataFrame) -> pd.DataFrame:
    #     df["unit"] = (
    #         df["unit"]
    #         .astype(str)
    #         .str.replace("ชิ้น", "piece", regex=False)
    #         .str.replace("เซต", "set", regex=False)
    #         .str.replace("ตัว", "one-unit", regex=False)
    #         .str.replace("แพ็ค", "pack", regex=False)
    #         .str.replace("คู่", "pairs", regex=False)
    #         .str.replace("ม้วน", "roll", regex=False)
    #         .str.replace("กล่อง", "box", regex=False)
    #         .str.replace("รายการ", "order", regex=False)
    #         .str.replace("ก้อน", "cell/lump", regex=False)
    #         .str.replace("กิโล", "kg", regex=False)
    #         .str.replace("แท่ง", "piece/stick", regex=False)
    #     )
    #     df["size"] = (
    #         df["size"]
    #         .astype(str)
    #         .str.replace("แบบหนา", "thick", regex=False)
    #         .str.replace("แบบบาง", "thin", regex=False)
    #         .str.replace("นิ้ว", "inchs", regex=False)
    #     )
    #     return df

    def separate(row: pd.Series) -> pd.Series:
        raw_id = str(row.get("raw_id", ""))
        parts = raw_id.rsplit("-", 1)

        row["size"] = None
        if len(parts) == 2:
            suffix = parts[1].strip()
            if suffix and not suffix.isdigit():
                row["size"] = suffix
                return row
        return row

    filtered = (
        skus.extract_columns([
            "รหัสสินค้า",
            "ชื่อสินค้า",
            "หมวดหมู่",
            "หมวดหมู่ย่อย",
        ])
        .df_opr(lambda df: df.sort_values(by="ชื่อสินค้า", ascending=True, ignore_index=True))
        .df_opr(normalize_head)
        .df_opr(lambda df: df.apply(separate, axis=1))
        # .df_opr(normalize_body)
    )

    return filtered.get_df()


def load_stock_dataframe(file_path: Optional[str] = None) -> pd.DataFrame:
    if file_path is None:
        stocks_fpath = _resolve_asset("pajara", "Stock.xlsx")
    else:
        stocks_fpath = Path(file_path)
    
    stocks = SpreadSheet(
        {
            "fpath": str(stocks_fpath),
            "head_offset": 1,
            "head_cut": 1,
            "tail_cut": 3,
        }
    ).read()

    def normalize_head(df: pd.DataFrame) -> pd.DataFrame:
        return df.rename(
            columns={
                "รหัสสินค้า": "raw_id",
                "ชื่อสินค้า": "name",
                "หมวดหมู่": "category",
                "จำนวน": "quantity",
            }
        )

    filtered = (
        stocks.extract_columns([
            "รหัสสินค้า",
            "ชื่อสินค้า",
            "หมวดหมู่",
            "จำนวน",
        ])
        .df_opr(lambda df: df.sort_values(by="ชื่อสินค้า", ascending=True, ignore_index=True))
        .df_opr(normalize_head)
    )

    return filtered.get_df()

def load_po_dataframe(file_path: Optional[str] = None) -> pd.DataFrame:
    if file_path is None:
        sales_fpath = _resolve_asset("pajara", "PO.xlsx")
    else:
        sales_fpath = Path(file_path)
    
    sales = SpreadSheet({
        "fpath": str(sales_fpath),
        "head_offset": 1,
        "head_cut": 1,
        "tail_cut": 3,
    }).read()

    def rename_entry(df: pd.DataFrame) -> pd.DataFrame:
        return df.rename(
            columns={
                "วันที่ทำรายการ": "transaction_date",
                "รหัสสินค้า": "item_id",
                "ชื่อสินค้า": "name",
                "จำนวน": "quantity",
            }
        )

    def reformat_date(df: pd.DataFrame) -> pd.DataFrame:
        df["transaction_date"] = pd.to_datetime(df["transaction_date"], format="%d/%m/%Y")
        return df

    filtered = (
        sales.extract_columns([
            "วันที่ทำรายการ",
            "รหัสสินค้า",
            "ชื่อสินค้า",
            "จำนวน",
        ])
        .df_opr(lambda df: df.sort_values(by="วันที่ทำรายการ", ascending=True, ignore_index=True))
        .df_opr(rename_entry)
        .df_opr(reformat_date)
    )

    return filtered.get_df()


def run_pipeline():
    pass

    # sync_engine = create_engine("postgresql://admin2:admin2@localhost:5432/postgres")

    # skus_df = load_skus_dataframe()

    # skus_df.to_sql(name="skus", con=sync_engine, if_exists="replace", index=False)

