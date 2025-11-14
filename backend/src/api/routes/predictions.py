from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine
import pandas as pd
import numpy as np
from prophet import Prophet
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error
import warnings

from ..db import get_db_engine
from ..schemas import BaseModel

warnings.filterwarnings("ignore")

router = APIRouter()


class ForecastDataPoint(BaseModel):
    date: datetime
    predicted_quantity: int
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None


class SKUForecastResponse(BaseModel):
    sku_id: str
    sku_name: Optional[str]
    category: Optional[str]
    forecast_days: int
    mae: float
    mape: str
    forecast: List[ForecastDataPoint]


class CategoryForecastResponse(BaseModel):
    category: str
    forecast_days: int
    mae: float
    mape: str
    forecast: List[ForecastDataPoint]


class BulkSKUForecastResponse(BaseModel):
    total_skus: int
    forecasts: List[SKUForecastResponse]


class BulkCategoryForecastResponse(BaseModel):
    total_categories: int
    forecasts: List[CategoryForecastResponse]


class ChannelForecastResponse(BaseModel):
    channel: str
    forecast_days: int
    mae: float
    mape: str
    forecast: List[ForecastDataPoint]


class BulkChannelForecastResponse(BaseModel):
    total_channels: int
    forecasts: List[ChannelForecastResponse]


async def get_sales_data_async(engine: AsyncEngine):
    query = text("""
    SELECT 
        s.transaction_date,
        s.item_id,
        s.quantity,
        s.platform,
        sk.name,
        sk.category,
        sk.subcategory,
        sk.size
    FROM sales s
    LEFT JOIN skus sk ON s.item_id = sk.raw_id
    WHERE s.transaction_date IS NOT NULL 
        AND s.quantity IS NOT NULL
        AND s.quantity > 0
    ORDER BY s.transaction_date
    """)
    
    async with engine.begin() as connection:
        result = await connection.execute(query)
        rows = result.fetchall()
    
    df = pd.DataFrame(rows, columns=['transaction_date', 'item_id', 'quantity', 'platform', 'name', 'category', 'subcategory', 'size'])
    
    df['transaction_date'] = pd.to_datetime(df['transaction_date'])
    df['item_id'] = df['item_id'].fillna('UNKNOWN_SKU')
    df['platform'] = df['platform'].fillna('unknown')
    df['name'] = df['name'].fillna('Unknown Product')
    df['category'] = df['category'].fillna('Uncategorized')
    df['subcategory'] = df['subcategory'].fillna('N/A')
    df['size'] = df['size'].fillna('N/A')
    
    return df


def forecast_single_series(time_series, forecast_days=30):
    if len(time_series) < 60:
        raise ValueError("Insufficient data: At least 60 days of historical data required")
    
    prophet_df = time_series.reset_index()
    prophet_df.columns = ['ds', 'y']
    train_df = prophet_df.iloc[:-30]
    test_df = prophet_df.iloc[-30:]
    
    accuracy_model = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=True,
        daily_seasonality=False,
        changepoint_prior_scale=0.1,
        seasonality_mode='multiplicative'
    )
    accuracy_model.add_country_holidays(country_name='TH')
    accuracy_model.fit(train_df)
    
    test_future = accuracy_model.make_future_dataframe(periods=30, freq='D')
    test_forecast = accuracy_model.predict(test_future)
    test_predictions = test_forecast['yhat'].iloc[-30:]
    
    mae = mean_absolute_error(test_df['y'], test_predictions)
    mape = mean_absolute_percentage_error(test_df['y'], test_predictions) if test_df['y'].sum() > 0 else 0
    
    final_model = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=True,
        daily_seasonality=False,
        changepoint_prior_scale=0.1,
        seasonality_mode='multiplicative'
    )
    final_model.add_country_holidays(country_name='TH')
    final_model.fit(prophet_df)
    
    future = final_model.make_future_dataframe(periods=forecast_days, freq='D')
    forecast_df = final_model.predict(future)
    
    forecast_data = forecast_df[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].iloc[-forecast_days:]
    
    return mae, mape, forecast_data


@router.get('/predictions/sku/{sku_id}', response_model=SKUForecastResponse)
async def forecast_sku(
    sku_id: str,
    forecast_days: int = Query(default=30, ge=7, le=90, description="Number of days to forecast"),
    engine: AsyncEngine = Depends(get_db_engine)
):
    try:
        df = await get_sales_data_async(engine)
        
        sku_data = df[df['item_id'] == sku_id]
        if sku_data.empty:
            raise HTTPException(status_code=404, detail=f"SKU '{sku_id}' not found in sales data")
        
        time_series = sku_data.set_index('transaction_date')['quantity'].resample('D').sum().fillna(0)
        
        mae, mape, forecast_data = forecast_single_series(time_series, forecast_days)
        
        sku_name = sku_data['name'].iloc[0]
        sku_category = sku_data['category'].iloc[0]
        
        forecast_points = [
            ForecastDataPoint(
                date=row['ds'],
                predicted_quantity=int(max(0, round(row['yhat']))),
                lower_bound=row['yhat_lower'],
                upper_bound=row['yhat_upper']
            )
            for _, row in forecast_data.iterrows()
        ]
        
        return SKUForecastResponse(
            sku_id=sku_id,
            sku_name=sku_name,
            category=sku_category,
            forecast_days=forecast_days,
            mae=round(mae, 2),
            mape=f"{mape:.2%}",
            forecast=forecast_points
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecasting error: {str(e)}")


@router.get('/predictions/category/{category_name}', response_model=CategoryForecastResponse)
async def forecast_category(
    category_name: str,
    forecast_days: int = Query(default=30, ge=7, le=90, description="Number of days to forecast"),
    engine: AsyncEngine = Depends(get_db_engine)
):
    try:
        df = await get_sales_data_async(engine)
        
        category_data = df[df['category'] == category_name]
        if category_data.empty:
            raise HTTPException(status_code=404, detail=f"Category '{category_name}' not found in sales data")
        
        time_series = category_data.set_index('transaction_date')['quantity'].resample('D').sum().fillna(0)
        
        mae, mape, forecast_data = forecast_single_series(time_series, forecast_days)
        
        forecast_points = [
            ForecastDataPoint(
                date=row['ds'],
                predicted_quantity=int(max(0, round(row['yhat']))),
                lower_bound=row['yhat_lower'],
                upper_bound=row['yhat_upper']
            )
            for _, row in forecast_data.iterrows()
        ]
        
        return CategoryForecastResponse(
            category=category_name,
            forecast_days=forecast_days,
            mae=round(mae, 2),
            mape=f"{mape:.2%}",
            forecast=forecast_points
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecasting error: {str(e)}")


@router.get('/predictions/skus/bulk', response_model=BulkSKUForecastResponse)
async def forecast_all_skus(
    forecast_days: int = Query(default=30, ge=7, le=90, description="Number of days to forecast"),
    limit: Optional[int] = Query(default=None, ge=1, le=100, description="Limit number of SKUs to forecast"),
    engine: AsyncEngine = Depends(get_db_engine)
):
    try:
        df = await get_sales_data_async(engine)
        
        sku_sales = df.groupby('item_id')['quantity'].sum().sort_values(ascending=False)
        top_skus = sku_sales.index.tolist()
        
        if limit:
            top_skus = top_skus[:limit]
        
        forecasts = []
        
        for sku_id in top_skus:
            try:
                sku_data = df[df['item_id'] == sku_id]
                time_series = sku_data.set_index('transaction_date')['quantity'].resample('D').sum().fillna(0)
                
                if len(time_series) < 60:
                    continue
                
                mae, mape, forecast_data = forecast_single_series(time_series, forecast_days)
                
                sku_name = sku_data['name'].iloc[0]
                sku_category = sku_data['category'].iloc[0]
                
                forecast_points = [
                    ForecastDataPoint(
                        date=row['ds'],
                        predicted_quantity=int(max(0, round(row['yhat']))),
                        lower_bound=row['yhat_lower'],
                        upper_bound=row['yhat_upper']
                    )
                    for _, row in forecast_data.iterrows()
                ]
                
                forecasts.append(SKUForecastResponse(
                    sku_id=sku_id,
                    sku_name=sku_name,
                    category=sku_category,
                    forecast_days=forecast_days,
                    mae=round(mae, 2),
                    mape=f"{mape:.2%}",
                    forecast=forecast_points
                ))
            except Exception as e:
                continue
        
        return BulkSKUForecastResponse(
            total_skus=len(forecasts),
            forecasts=forecasts
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk forecasting error: {str(e)}")


@router.get('/predictions/categories/bulk', response_model=BulkCategoryForecastResponse)
async def forecast_all_categories(
    forecast_days: int = Query(default=30, ge=7, le=90, description="Number of days to forecast"),
    limit: Optional[int] = Query(default=None, ge=1, le=50, description="Limit number of categories to forecast"),
    engine: AsyncEngine = Depends(get_db_engine)
):
    try:
        df = await get_sales_data_async(engine)
        
        category_sales = df.groupby('category')['quantity'].sum().sort_values(ascending=False)
        top_categories = [c for c in category_sales.index.tolist() if c != 'Uncategorized']
        
        if limit:
            top_categories = top_categories[:limit]
        
        forecasts = []
        
        for category_name in top_categories:
            try:
                category_data = df[df['category'] == category_name]
                time_series = category_data.set_index('transaction_date')['quantity'].resample('D').sum().fillna(0)
                
                if len(time_series) < 60:
                    continue
                
                mae, mape, forecast_data = forecast_single_series(time_series, forecast_days)
                
                forecast_points = [
                    ForecastDataPoint(
                        date=row['ds'],
                        predicted_quantity=int(max(0, round(row['yhat']))),
                        lower_bound=row['yhat_lower'],
                        upper_bound=row['yhat_upper']
                    )
                    for _, row in forecast_data.iterrows()
                ]
                
                forecasts.append(CategoryForecastResponse(
                    category=category_name,
                    forecast_days=forecast_days,
                    mae=round(mae, 2),
                    mape=f"{mape:.2%}",
                    forecast=forecast_points
                ))
            except Exception as e:
                continue
        
        return BulkCategoryForecastResponse(
            total_categories=len(forecasts),
            forecasts=forecasts
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk forecasting error: {str(e)}")


@router.get('/predictions/channel/{channel_name}', response_model=ChannelForecastResponse)
async def forecast_channel(
    channel_name: str,
    forecast_days: int = Query(default=30, ge=7, le=90, description="Number of days to forecast"),
    engine: AsyncEngine = Depends(get_db_engine)
):
    try:
        df = await get_sales_data_async(engine)
        
        channel_data = df[df['platform'] == channel_name]
        if channel_data.empty:
            raise HTTPException(status_code=404, detail=f"Channel '{channel_name}' not found in sales data")
        
        time_series = channel_data.set_index('transaction_date')['quantity'].resample('D').sum().fillna(0)
        
        mae, mape, forecast_data = forecast_single_series(time_series, forecast_days)
        
        forecast_points = [
            ForecastDataPoint(
                date=row['ds'],
                predicted_quantity=int(max(0, round(row['yhat']))),
                lower_bound=row['yhat_lower'],
                upper_bound=row['yhat_upper']
            )
            for _, row in forecast_data.iterrows()
        ]
        
        return ChannelForecastResponse(
            channel=channel_name,
            forecast_days=forecast_days,
            mae=round(mae, 2),
            mape=f"{mape:.2%}",
            forecast=forecast_points
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecasting error: {str(e)}")


@router.get('/predictions/channels/bulk', response_model=BulkChannelForecastResponse)
async def forecast_all_channels(
    forecast_days: int = Query(default=30, ge=7, le=90, description="Number of days to forecast"),
    limit: Optional[int] = Query(default=None, ge=1, le=50, description="Limit number of channels to forecast"),
    engine: AsyncEngine = Depends(get_db_engine)
):
    try:
        df = await get_sales_data_async(engine)
        
        channel_sales = df.groupby('platform')['quantity'].sum().sort_values(ascending=False)
        top_channels = [c for c in channel_sales.index.tolist() if c != 'unknown']
        
        if limit:
            top_channels = top_channels[:limit]
        
        forecasts = []
        
        for channel_name in top_channels:
            try:
                channel_data = df[df['platform'] == channel_name]
                time_series = channel_data.set_index('transaction_date')['quantity'].resample('D').sum().fillna(0)
                
                if len(time_series) < 60:
                    continue
                
                mae, mape, forecast_data = forecast_single_series(time_series, forecast_days)
                
                forecast_points = [
                    ForecastDataPoint(
                        date=row['ds'],
                        predicted_quantity=int(max(0, round(row['yhat']))),
                        lower_bound=row['yhat_lower'],
                        upper_bound=row['yhat_upper']
                    )
                    for _, row in forecast_data.iterrows()
                ]
                
                forecasts.append(ChannelForecastResponse(
                    channel=channel_name,
                    forecast_days=forecast_days,
                    mae=round(mae, 2),
                    mape=f"{mape:.2%}",
                    forecast=forecast_points
                ))
            except Exception as e:
                continue
        
        return BulkChannelForecastResponse(
            total_channels=len(forecasts),
            forecasts=forecasts
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk forecasting error: {str(e)}")
