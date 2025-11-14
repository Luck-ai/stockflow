import pandas as pd
from prophet import Prophet
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error
import numpy as np
import warnings
import pprint
import matplotlib.pyplot as plt
import os

warnings.filterwarnings("ignore")

def run_forecasting(df, forecast_days=30, target_ids=None):
    """
    Takes a pre-loaded DataFrame, runs Prophet forecasting for a list of target IDs,
    and returns the results.
    """
    all_forecasts = {}
    all_time_series = {}
    all_accuracies = {}
    all_prophet_models = {}
    unique_products = df['product_id'].unique()

    if target_ids is not None:
        unique_products = [pid for pid in unique_products if pid in target_ids]
        if not unique_products:
            print(f"--- ERROR: None of the specified targets were found in the sales data. ---")
            return None, None, None, None
        print(f"\n--- Running forecast for {len(unique_products)} specified target(s) ---")
    else:
        print(f"\n--- Running forecast for all {len(unique_products)} products ---")

    for i, product_id in enumerate(unique_products):
        print(f"\n({i+1}/{len(unique_products)}) Processing: {product_id}")
        
        time_series = df[df['product_id'] == product_id].set_index('Order Date')['Amount'].resample('D').sum().fillna(0)
        
        if len(time_series) < 60:
            print(f"Skipping {product_id}: Insufficient data for accuracy testing (less than 60 days).")
            continue
            
        prophet_df = time_series.reset_index()
        prophet_df.columns = ['ds', 'y']
        train_df = prophet_df.iloc[:-30]
        test_df = prophet_df.iloc[-30:]
        
        accuracy_model = Prophet(
            weekly_seasonality=True, yearly_seasonality=True, daily_seasonality=False,
            changepoint_prior_scale=0.1, seasonality_mode='multiplicative'
        )
        accuracy_model.add_country_holidays(country_name='TH')
        accuracy_model.fit(train_df)
        
        test_future = accuracy_model.make_future_dataframe(periods=30, freq='D')
        test_forecast = accuracy_model.predict(test_future)
        test_predictions = test_forecast['yhat'].iloc[-30:]
        
        mae = mean_absolute_error(test_df['y'], test_predictions)
        mape = mean_absolute_percentage_error(test_df['y'], test_predictions) if test_df['y'].sum() > 0 else 0
        all_accuracies[product_id] = {'MAE': mae, 'MAPE': f"{mape:.2%}"}
        print(f"-> Accuracy for {product_id} -> MAE: {mae:.2f}, MAPE: {mape:.2%}")
        
        all_time_series[product_id] = time_series
        
        final_model = Prophet(
            weekly_seasonality=True, yearly_seasonality=True, daily_seasonality=False,
            changepoint_prior_scale=0.1, seasonality_mode='multiplicative' 
        )
        final_model.add_country_holidays(country_name='TH')
        final_model.fit(prophet_df)
        all_prophet_models[product_id] = final_model
        
        future = final_model.make_future_dataframe(periods=forecast_days, freq='D')
        forecast_df = final_model.predict(future)
        
        forecast_values = forecast_df['yhat'].iloc[-forecast_days:]
        forecast_dates = forecast_df['ds'].iloc[-forecast_days:]
        final_forecast = np.maximum(0, np.round(forecast_values)).astype(int)
        all_forecasts[product_id] = pd.Series(final_forecast.values, index=forecast_dates.values)
            
    return all_forecasts, all_time_series, all_accuracies, all_prophet_models

def get_user_choice(options, prompt):
    while True:
        try:
            choice = int(input(prompt))
            if 0 <= choice <= len(options):
                return choice
            else:
                print("Invalid number. Please try again.")
        except ValueError:
            print("Invalid input. Please enter a number.")

if __name__ == "__main__":
    try:
        main_df = pd.read_csv("sales.csv", parse_dates=['Order Date'])
        main_df['Product Name'] = main_df['Product Name'].astype(str)
        if main_df['Product Name'].str.contains('-').any():
            main_df['Size'] = main_df['Product Name'].str.split('-').str[-1]
            main_df['Clean Product Name'] = main_df['Product Name'].str.rsplit('-', n=1).str[0]
            main_df['product_id'] = main_df['Clean Product Name'] + '_' + main_df['Size']
        else:
            main_df['Clean Product Name'] = main_df['Product Name']
            main_df['product_id'] = main_df['Product Name']
    except FileNotFoundError:
        print("\n--- ERROR: 'sales.csv' not found. Please place it in the same folder as the script. ---")
        exit()

    print("\nPlease choose a forecast type:")
    print(" [1] Forecast for a specific product")
    print(" [2] Forecast for Total Combined Sales ONLY")
    
    main_choice = 0
    while main_choice not in [1, 2]:
        try:
            main_choice = int(input("Enter your choice (1 or 2): "))
        except ValueError:
            print("Invalid input. Please enter 1 or 2.")

    if main_choice == 1:
        targets_to_run = None
        products = sorted(main_df['Clean Product Name'].unique())
        
        print("\nPlease choose a product to forecast:")
        for i, p_name in enumerate(products, 1):
            print(f" [{i}] {p_name}")
        
        product_choice = 0
        while product_choice < 1 or product_choice > len(products):
             product_choice = get_user_choice(products, f"Enter your choice (number between 1 and {len(products)}): ")
             if product_choice == 0:
                 print("Invalid choice. Please select a number from the list.")

        selected_product = products[product_choice - 1]
        if 'Size' not in main_df.columns:
            main_df['Size'] = ''
        sizes = sorted(main_df[main_df['Clean Product Name'] == selected_product]['Size'].unique())
        print(f"\nPlease choose a size for '{selected_product}':")
        print(" [0] Forecast for ALL sizes of this product")
        for i, size in enumerate(sizes, 1):
            print(f" [{i}] {size}")
        size_choice = get_user_choice(sizes, "Enter your choice (number): ")

        if size_choice == 0:
            print(f"-> Targeting ALL sizes of '{selected_product}'.")
            targets_to_run = sorted(main_df[main_df['Clean Product Name'] == selected_product]['product_id'].unique())
        else:
            selected_size = sizes[size_choice - 1]
            target_id = f"{selected_product}_{selected_size}" if selected_size else selected_product
            print(f"-> Targeting single item: {target_id}")
            targets_to_run = [target_id]

        forecasts, historical_series, accuracies, prophet_models = run_forecasting(main_df, forecast_days=30, target_ids=targets_to_run)
        
        if accuracies:
            print("\n" + "="*50); print("--- Prophet Model Accuracy Summary ---"); pprint.pprint(accuracies)
        if forecasts:

            final_forecast_df = pd.concat([pd.DataFrame({'product_id': pid, 'forecast_date': ser.index, 'predicted_sales': ser.values}) for pid, ser in forecasts.items()], ignore_index=True)
            print("\n--- Saving final forecast data to 'sales_forecast.csv' ---")
            final_forecast_df.to_csv('sales_forecast.csv', index=False)
            print("Successfully saved forecast to sales_forecast.csv")
            
            plots_dir = "forecast_plots"; prophet_plots_dir = "prophet_plots"
            os.makedirs(plots_dir, exist_ok=True); os.makedirs(prophet_plots_dir, exist_ok=True)
            
            print(f"\n--- Generating and Saving All Plots ---")
            for pid, ser in forecasts.items():
                fig, ax = plt.subplots(figsize=(12, 6)); historical_series[pid].plot(ax=ax, label='Observed'); ser.plot(ax=ax, label='Forecast')
                ax.set_title(f'Sales Forecast for {pid}'); ax.legend(); plt.grid(True); plt.tight_layout()
                plt.savefig(os.path.join(plots_dir, f'sales_forecast_{pid.replace("/", "_")}.png')); plt.close(fig)
            
            for pid, model in prophet_models.items():
                future = model.make_future_dataframe(periods=30, freq='D'); forecast_df = model.predict(future)
                fig1 = model.plot(forecast_df); ax1 = fig1.gca(); ax1.set_title(f'Prophet Forecast for {pid}')
                plt.savefig(os.path.join(prophet_plots_dir, f'prophet_forecast_{pid.replace("/", "_")}.png')); plt.close(fig1)
                fig2 = model.plot_components(forecast_df)
                plt.savefig(os.path.join(prophet_plots_dir, f'prophet_components_{pid.replace("/", "_")}.png')); plt.close(fig2)
            print(f"All plots saved to '{plots_dir}' and '{prophet_plots_dir}'.")
        else:
            print("\nNo data was processed or the input file was not found.")

    elif main_choice == 2:
        FORECAST_DAYS = 30; OUTPUT_FOLDER = "total_sales_forecast"
        
        print("\n--- Generating Forecast for Total Combined Sales ONLY ---")
        
        total_sales_ts = main_df.set_index('Order Date')['Amount'].resample('D').sum().fillna(0)
        if len(total_sales_ts) < 60:
            print("\n--- ERROR: Insufficient data. At least 60 days of sales history are required. ---"); exit()
            
        prophet_df = total_sales_ts.reset_index(); prophet_df.columns = ['ds', 'y']

        print("\n--- Performing accuracy check on recent data ---")
        train_df = prophet_df.iloc[:-FORECAST_DAYS]; test_df = prophet_df.iloc[-FORECAST_DAYS:]
        accuracy_model = Prophet(weekly_seasonality=True, yearly_seasonality=True, daily_seasonality=False, changepoint_prior_scale=0.1, seasonality_mode='multiplicative')
        accuracy_model.add_country_holidays(country_name='TH'); accuracy_model.fit(train_df)
        test_future = accuracy_model.make_future_dataframe(periods=FORECAST_DAYS, freq='D'); test_forecast = accuracy_model.predict(test_future)
        test_predictions = test_forecast['yhat'].iloc[-FORECAST_DAYS:]
        mae = mean_absolute_error(test_df['y'], test_predictions); mape = mean_absolute_percentage_error(test_df['y'], test_predictions) if test_df['y'].sum() > 0 else 0
        print(f"-> Accuracy Check -> MAE: {mae:.2f}, MAPE: {mape:.2%}")

        print("\n--- Building final model and forecasting future sales ---")
        final_model = Prophet(weekly_seasonality=True, yearly_seasonality=True, daily_seasonality=False, changepoint_prior_scale=0.1, seasonality_mode='multiplicative')
        final_model.add_country_holidays(country_name='TH'); final_model.fit(prophet_df)
        future = final_model.make_future_dataframe(periods=FORECAST_DAYS, freq='D'); forecast_df = final_model.predict(future)

        os.makedirs(OUTPUT_FOLDER, exist_ok=True)
        print(f"\n--- Saving all results to the '{OUTPUT_FOLDER}' folder ---")

        final_forecast = forecast_df[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].iloc[-FORECAST_DAYS:]
        final_forecast.rename(columns={'ds': 'forecast_date', 'yhat': 'predicted_sales', 'yhat_lower': 'predicted_sales_lower', 'yhat_upper': 'predicted_sales_upper'}, inplace=True)
        final_forecast['predicted_sales'] = np.maximum(0, np.round(final_forecast['predicted_sales'])).astype(int)
        csv_path = os.path.join(OUTPUT_FOLDER, 'total_sales_forecast.csv')
        final_forecast.to_csv(csv_path, index=False)
        print(f"Successfully saved numerical forecast to '{csv_path}'")

        simple_plot_series = pd.Series(final_forecast['predicted_sales'].values, index=final_forecast['forecast_date'])
        fig, ax = plt.subplots(figsize=(12, 6)); total_sales_ts.plot(ax=ax, label='Observed'); simple_plot_series.plot(ax=ax, label='Forecast')
        ax.set_title('Total Sales Forecast'); ax.legend(); plt.grid(True); plt.tight_layout()
        plt.savefig(os.path.join(OUTPUT_FOLDER, 'total_sales_forecast_simple.png')); plt.close(fig)

        fig1 = final_model.plot(forecast_df); ax1 = fig1.gca(); ax1.set_title('Prophet Forecast for Total Sales')
        plt.savefig(os.path.join(OUTPUT_FOLDER, 'total_sales_forecast_detailed.png')); plt.close(fig1)

        fig2 = final_model.plot_components(forecast_df)
        plt.savefig(os.path.join(OUTPUT_FOLDER, 'total_sales_forecast_components.png')); plt.close(fig2)
        print("Successfully saved all plots.")
