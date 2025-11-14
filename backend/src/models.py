from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, DateTime, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Sales(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    item_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    platform: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class Skus(Base):
    __tablename__ = "skus"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    raw_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    subcategory: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    size: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class Stock(Base):
    __tablename__ = "stock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    raw_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


# class PurchaseOrder(Base):
#     __tablename__ = "po"

#     id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
#     transaction_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
#     item_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
#     name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
#     quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
