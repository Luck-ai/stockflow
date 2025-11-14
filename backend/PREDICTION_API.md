# Sales Forecasting API Endpoints

## Overview
The prediction API endpoints use Prophet forecasting to predict future sales for SKUs and categories. All forecasts include accuracy metrics (MAE and MAPE) based on backtesting.

## Requirements
- Minimum 60 days of historical sales data required for forecasting
- Missing SKU information is handled gracefully with default values

## Endpoints

### 1. Forecast Single SKU
**GET** `/predictions/sku/{sku_id}`

Generates a sales forecast for a specific SKU.

**Parameters:**
- `sku_id` (path): The SKU identifier
- `forecast_days` (query, optional): Number of days to forecast (7-90, default: 30)

**Response:**
```json
{
  "sku_id": "string",
  "sku_name": "string",
  "category": "string",
  "forecast_days": 30,
  "mae": 12.45,
  "mape": "15.30%",
  "forecast": [
    {
      "date": "2025-10-29T00:00:00",
      "predicted_quantity": 45,
      "lower_bound": 35.2,
      "upper_bound": 54.8
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:8000/predictions/sku/SKU123?forecast_days=30"
```

---

### 2. Forecast Single Category
**GET** `/predictions/category/{category_name}`

Generates a sales forecast for a specific product category.

**Parameters:**
- `category_name` (path): The category name
- `forecast_days` (query, optional): Number of days to forecast (7-90, default: 30)

**Response:**
```json
{
  "category": "Electronics",
  "forecast_days": 30,
  "mae": 45.67,
  "mape": "12.40%",
  "forecast": [
    {
      "date": "2025-10-29T00:00:00",
      "predicted_quantity": 120,
      "lower_bound": 98.5,
      "upper_bound": 141.5
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:8000/predictions/category/Electronics?forecast_days=30"
```

---

### 3. Bulk Forecast All SKUs
**GET** `/predictions/skus/bulk`

Generates forecasts for all SKUs with sufficient historical data.

**Parameters:**
- `forecast_days` (query, optional): Number of days to forecast (7-90, default: 30)
- `limit` (query, optional): Maximum number of SKUs to forecast (1-100)

**Response:**
```json
{
  "total_skus": 15,
  "forecasts": [
    {
      "sku_id": "SKU123",
      "sku_name": "Product Name",
      "category": "Electronics",
      "forecast_days": 30,
      "mae": 12.45,
      "mape": "15.30%",
      "forecast": [...]
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:8000/predictions/skus/bulk?forecast_days=30&limit=10"
```

---

### 4. Bulk Forecast All Categories
**GET** `/predictions/categories/bulk`

Generates forecasts for all product categories with sufficient historical data.

**Parameters:**
- `forecast_days` (query, optional): Number of days to forecast (7-90, default: 30)

**Response:**
```json
{
  "total_categories": 8,
  "forecasts": [
    {
      "category": "Electronics",
      "forecast_days": 30,
      "mae": 45.67,
      "mape": "12.40%",
      "forecast": [...]
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:8000/predictions/categories/bulk?forecast_days=30"
```

---

## Forecast Model Details

### Algorithm
- **Model**: Facebook Prophet
- **Seasonality**: Weekly and yearly patterns
- **Country Holidays**: Thailand holidays incorporated
- **Mode**: Multiplicative seasonality

### Accuracy Metrics
- **MAE (Mean Absolute Error)**: Average absolute difference between predicted and actual values
- **MAPE (Mean Absolute Percentage Error)**: Percentage-based error metric

### Backtesting
Each forecast includes accuracy metrics calculated by:
1. Training on all data except the last 30 days
2. Predicting the last 30 days
3. Comparing predictions to actual values

### Handling Missing Data
- SKUs without matching records in the `skus` table are labeled as "Unknown Product" and "Uncategorized"
- Missing category data defaults to "Uncategorized"
- Only SKUs/categories with at least 60 days of data are forecasted

---

## Error Handling

### Common Error Responses

**404 Not Found**
```json
{
  "detail": "SKU 'ABC123' not found in sales data"
}
```

**400 Bad Request**
```json
{
  "detail": "Insufficient data: At least 60 days of historical data required"
}
```

**500 Internal Server Error**
```json
{
  "detail": "Forecasting error: [error details]"
}
```

---

## Installation

1. Install required packages:
```bash
pip install -r requirements.txt
```

2. Required dependencies:
- `prophet>=1.1.5`
- `scikit-learn>=1.5.0`
- `matplotlib>=3.9.0`

3. Start the API server:
```bash
uvicorn src.api.app:app --reload
```

---

## Performance Notes

- **Single SKU/Category**: ~2-5 seconds per forecast
- **Bulk Operations**: Time scales linearly with number of items
- **Recommended**: Use `limit` parameter for bulk SKU forecasts to manage response time
- **Caching**: Consider implementing caching for frequently accessed forecasts

---

## Database Schema

The API queries the following tables:
- `sales`: Transaction history (transaction_date, item_id, quantity)
- `skus`: SKU metadata (raw_id, name, category, subcategory, size)

Join condition: `sales.item_id = skus.raw_id`
