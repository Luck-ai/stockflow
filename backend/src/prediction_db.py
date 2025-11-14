import pandas as pd
from prophet import Prophet
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error
import numpy as np
import warnings
import matplotlib.pyplot as plt
import os
from sqlalchemy import create_engine, text
from datetime import datetime

warnings.filterwarnings("ignore")

DATABASE_URL = "postgresql://postgres.dfpaohapemjvjclufvnj:toogtons123@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"

def get_sales_data_from_db():
    engine = create_engine(DATABASE_URL)
    
    query = """
    SELECT 
        s.transaction_date,
        s.item_id,
        s.quantity,
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
    """
    
    df = pd.read_sql(query, engine)
    engine.dispose()
    
    df['transaction_date'] = pd.to_datetime(df['transaction_date'])
    
    df['item_id'] = df['item_id'].fillna('UNKNOWN_SKU')
    df['name'] = df['name'].fillna('Unknown Product')
    df['category'] = df['category'].fillna('Uncategorized')
    df['subcategory'] = df['subcategory'].fillna('N/A')
    df['size'] = df['size'].fillna('N/A')
    
    return df

def run_forecasting_by_sku(df, forecast_days=30, target_skus=None):
    all_forecasts = {}
    all_time_series = {}
    all_accuracies = {}
    all_prophet_models = {}
    
    unique_skus = df['item_id'].dropna().unique()
    
    if target_skus is not None:
        unique_skus = [sku for sku in unique_skus if sku in target_skus]
        if not unique_skus:
            print(f"--- WARNING: None of the specified SKUs were found in the data. ---")
            return {}, {}, {}, {}
    
    print(f"\n--- Running forecast for {len(unique_skus)} SKUs ---")

    for i, sku_id in enumerate(unique_skus):
        print(f"\n({i+1}/{len(unique_skus)}) Processing SKU: {sku_id}")
        
        sku_data = df[df['item_id'] == sku_id]
        time_series = sku_data.set_index('transaction_date')['quantity'].resample('D').sum().fillna(0)
        
        if len(time_series) < 60:
            print(f"Skipping {sku_id}: Insufficient data for accuracy testing (less than 60 days).")
            continue
            
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
        all_accuracies[sku_id] = {'MAE': mae, 'MAPE': f"{mape:.2%}"}
        print(f"-> Accuracy for {sku_id} -> MAE: {mae:.2f}, MAPE: {mape:.2%}")
        
        all_time_series[sku_id] = time_series
        
        final_model = Prophet(
            weekly_seasonality=True, 
            yearly_seasonality=True, 
            daily_seasonality=False,
            changepoint_prior_scale=0.1, 
            seasonality_mode='multiplicative' 
        )
        final_model.add_country_holidays(country_name='TH')
        final_model.fit(prophet_df)
        all_prophet_models[sku_id] = final_model
        
        future = final_model.make_future_dataframe(periods=forecast_days, freq='D')
        forecast_df = final_model.predict(future)
        
        forecast_values = forecast_df['yhat'].iloc[-forecast_days:]
        forecast_dates = forecast_df['ds'].iloc[-forecast_days:]
        final_forecast = np.maximum(0, np.round(forecast_values)).astype(int)
        all_forecasts[sku_id] = pd.Series(final_forecast.values, index=forecast_dates.values)
            
    return all_forecasts, all_time_series, all_accuracies, all_prophet_models

def run_forecasting_by_category(df, forecast_days=30, target_categories=None):
    all_forecasts = {}
    all_time_series = {}
    all_accuracies = {}
    all_prophet_models = {}
    
    unique_categories = df['category'].dropna().unique()
    unique_categories = [c for c in unique_categories if c != 'Uncategorized']
    
    if target_categories is not None:
        unique_categories = [cat for cat in unique_categories if cat in target_categories]
        if not unique_categories:
            print(f"--- WARNING: None of the specified categories were found in the data. ---")
            return {}, {}, {}, {}
    
    print(f"\n--- Running forecast for {len(unique_categories)} Categories ---")

    for i, category in enumerate(unique_categories):
        print(f"\n({i+1}/{len(unique_categories)}) Processing Category: {category}")
        
        category_data = df[df['category'] == category]
        time_series = category_data.set_index('transaction_date')['quantity'].resample('D').sum().fillna(0)
        
        if len(time_series) < 60:
            print(f"Skipping {category}: Insufficient data for accuracy testing (less than 60 days).")
            continue
            
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
        all_accuracies[category] = {'MAE': mae, 'MAPE': f"{mape:.2%}"}
        print(f"-> Accuracy for {category} -> MAE: {mae:.2f}, MAPE: {mape:.2%}")
        
        all_time_series[category] = time_series
        
        final_model = Prophet(
            weekly_seasonality=True, 
            yearly_seasonality=True, 
            daily_seasonality=False,
            changepoint_prior_scale=0.1, 
            seasonality_mode='multiplicative' 
        )
        final_model.add_country_holidays(country_name='TH')
        final_model.fit(prophet_df)
        all_prophet_models[category] = final_model
        
        future = final_model.make_future_dataframe(periods=forecast_days, freq='D')
        forecast_df = final_model.predict(future)
        
        forecast_values = forecast_df['yhat'].iloc[-forecast_days:]
        forecast_dates = forecast_df['ds'].iloc[-forecast_days:]
        final_forecast = np.maximum(0, np.round(forecast_values)).astype(int)
        all_forecasts[category] = pd.Series(final_forecast.values, index=forecast_dates.values)
            
    return all_forecasts, all_time_series, all_accuracies, all_prophet_models

def save_results(forecasts, accuracies, historical_series, prophet_models, output_prefix, plots_dir, prophet_plots_dir):
    if not forecasts:
        print("\nNo forecasts generated.")
        return
    
    forecast_records = []
    for identifier, series in forecasts.items():
        for date, value in series.items():
            forecast_records.append({
                'identifier': identifier,
                'forecast_date': date,
                'predicted_quantity': value
            })
    
    forecast_df = pd.DataFrame(forecast_records)
    csv_filename = f'{output_prefix}_forecast.csv'
    forecast_df.to_csv(csv_filename, index=False)
    print(f"\n--- Saved forecast to '{csv_filename}' ---")
    
    os.makedirs(plots_dir, exist_ok=True)
    os.makedirs(prophet_plots_dir, exist_ok=True)
    
    print(f"\n--- Generating and Saving Plots ---")
    for identifier, series in forecasts.items():
        fig, ax = plt.subplots(figsize=(12, 6))
        historical_series[identifier].plot(ax=ax, label='Observed')
        series.plot(ax=ax, label='Forecast')
        ax.set_title(f'Sales Forecast for {identifier}')
        ax.legend()
        plt.grid(True)
        plt.tight_layout()
        safe_name = str(identifier).replace("/", "_").replace("\\", "_")
        plt.savefig(os.path.join(plots_dir, f'forecast_{safe_name}.png'))
        plt.close(fig)
    
    for identifier, model in prophet_models.items():
        future = model.make_future_dataframe(periods=30, freq='D')
        forecast_df = model.predict(future)
        
        fig1 = model.plot(forecast_df)
        ax1 = fig1.gca()
        ax1.set_title(f'Prophet Forecast for {identifier}')
        safe_name = str(identifier).replace("/", "_").replace("\\", "_")
        plt.savefig(os.path.join(prophet_plots_dir, f'prophet_forecast_{safe_name}.png'))
        plt.close(fig1)
        
        fig2 = model.plot_components(forecast_df)
        plt.savefig(os.path.join(prophet_plots_dir, f'prophet_components_{safe_name}.png'))
        plt.close(fig2)
    
    print(f"All plots saved to '{plots_dir}' and '{prophet_plots_dir}'.")
    
    print("\n" + "="*50)
    print("--- Accuracy Summary ---")
    for identifier, metrics in accuracies.items():
        print(f"{identifier}: MAE={metrics['MAE']:.2f}, MAPE={metrics['MAPE']}")

if __name__ == "__main__":
    print("\n=== Sales Forecasting System (Database Edition) ===\n")
    print("Fetching sales data from database...")
    
    try:
        sales_df = get_sales_data_from_db()
        print(f"Successfully loaded {len(sales_df)} sales records from database")
        print(f"Date range: {sales_df['transaction_date'].min()} to {sales_df['transaction_date'].max()}")
        print(f"Unique SKUs: {sales_df['item_id'].nunique()}")
        print(f"Unique Categories: {sales_df['category'].nunique()}")
    except Exception as e:
        print(f"\n--- ERROR: Failed to fetch data from database ---")
        print(f"Error: {e}")
        exit(1)
    
    print("\nPlease choose forecast type:")
    print(" [1] Forecast by SKU")
    print(" [2] Forecast by Category")
    print(" [3] Both SKU and Category forecasts")
    
    choice = 0
    while choice not in [1, 2, 3]:
        try:
            choice = int(input("Enter your choice (1, 2, or 3): "))
        except ValueError:
            print("Invalid input. Please enter 1, 2, or 3.")
    
    if choice == 1 or choice == 3:
        print("\n" + "="*70)
        print("FORECASTING BY SKU")
        print("="*70)
        forecasts, historical, accuracies, models = run_forecasting_by_sku(sales_df)
        save_results(
            forecasts, 
            accuracies, 
            historical, 
            models, 
            'sku_sales', 
            'sku_forecast_plots', 
            'sku_prophet_plots'
        )
    
    if choice == 2 or choice == 3:
        print("\n" + "="*70)
        print("FORECASTING BY CATEGORY")
        print("="*70)
        forecasts, historical, accuracies, models = run_forecasting_by_category(sales_df)
        save_results(
            forecasts, 
            accuracies, 
            historical, 
            models, 
            'category_sales', 
            'category_forecast_plots', 
            'category_prophet_plots'
        )
    
    print("\n" + "="*70)
    print("=== Forecasting Complete ===")
    print("="*70)
