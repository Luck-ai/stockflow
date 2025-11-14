from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, Optional
import sys

import pandas as pd
from sqlalchemy.engine import Engine

from .database import get_engine

SALES_TABLE = "sales"
SKUS_TABLE = "skus"
STOCK_TABLE = "stock"

_this_dir = Path(__file__).resolve().parent.parent
_backend_dir = _this_dir
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from lib.etl import SpreadSheet

def load_sales_dataframe(file_path: Optional[str] = None) -> pd.DataFrame:
    sales_fpath = Path(file_path) if file_path else None
    sales = SpreadSheet(
        {
            "fpath": str(sales_fpath),
            "head_offset": 1,
            "head_cut": 1,
            "tail_cut": 3,
        },
    ).read()

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
    skus_fpath = Path(file_path) if file_path else None
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
                "หน่วยสินค้า": "unit",
            }
        )

    def normalize_body(df: pd.DataFrame) -> pd.DataFrame:
        df["unit"] = (
            df["unit"]
            .astype(str)
            .str.replace("ชิ้น", "piece", regex=False)
            .str.replace("เซต", "set", regex=False)
            .str.replace("ตัว", "one-unit", regex=False)
            .str.replace("แพ็ค", "pack", regex=False)
            .str.replace("คู่", "pairs", regex=False)
            .str.replace("ม้วน", "roll", regex=False)
            .str.replace("กล่อง", "box", regex=False)
            .str.replace("รายการ", "order", regex=False)
            .str.replace("ก้อน", "cell/lump", regex=False)
            .str.replace("กิโล", "kg", regex=False)
            .str.replace("แท่ง", "piece/stick", regex=False)
        )
        df["size"] = (
            df["size"]
            .astype(str)
            .str.replace("แบบหนา", "thick", regex=False)
            .str.replace("แบบบาง", "thin", regex=False)
            .str.replace("นิ้ว", "inchs", regex=False)
        )
        return df

    def separate(row: pd.Series) -> pd.Series:
        raw_id = str(row["raw_id"])
        parts = raw_id.rsplit("-", 1)

        white_lst = ["M", "L", "XL", "XXL", "3XL", "Free size"]
        black_lst = ["TTB", "OF", "WH"]

        row["size"] = None
        if len(parts) == 2 and parts[1] in white_lst:
            row["size"] = parts[1]
            return row
        if len(parts) < 2 or parts[0] in black_lst:
            return row
        matches = re.findall(r"\((.*?)\)", str(row["name"]))
        if matches:
            row["size"] = matches[-1]
        return row

    filtered = (
        skus.extract_columns([
            "รหัสสินค้า",
            "ชื่อสินค้า",
            "หมวดหมู่",
            "หมวดหมู่ย่อย",
            "หน่วยสินค้า",
        ])
        .df_opr(lambda df: df.sort_values(by="ชื่อสินค้า", ascending=True, ignore_index=True))
        .df_opr(normalize_head)
        .df_opr(lambda df: df.apply(separate, axis=1))
        .df_opr(normalize_body)
    )

    return filtered.get_df()


def load_stock_dataframe(file_path: Optional[str] = None) -> pd.DataFrame:
    stocks_fpath = Path(file_path) if file_path else None
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
                "รหัส": "raw_id",
                "สินค้า": "name",
                "หมวดหมู่": "category",
                "จำนวน": "quantity",
            }
        )

    filtered = (
        stocks.extract_columns([
            "รหัส",
            "สินค้า",
            "หมวดหมู่",
            "จำนวน",
        ])
        .df_opr(lambda df: df.sort_values(by="สินค้า", ascending=True, ignore_index=True))
        .df_opr(normalize_head)
    )

    return filtered.get_df()


# def run_pipeline(engine: Optional[Engine] = None):

#     db_engine = engine or get_engine()

#     sales_df = _load_sales_dataframe()
#     skus_df = _load_skus_dataframe()
#     stock_df = _load_stock_dataframe()

#     sales_df.to_sql(name="sales", con=db_engine, if_exists="replace", index=False)
#     skus_df.to_sql(name="skus", con=db_engine, if_exists="replace", index=False)
#     stock_df.to_sql(name="stock", con=db_engine, if_exists="replace", index=False)

