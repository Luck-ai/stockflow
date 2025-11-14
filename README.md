# Stock Management Project

## Prerequisites

- Python 3.12+
- A running PostgreSQL instance (docker-compose.yaml provides one with credentials `admin` / `admin`).
- Install dependencies (e.g. `poetry install` or `pip install -r requirements.txt` if you export them).

## Starting the Postgres Server

Run the folloing from the repository root
```bash
docker compose up -d 'postgres'
```
## Running the ETL pipeline

Use the helper script to populate the database tables (`sales`, `skus`, `stock`):
This process can take around 5-10 minutes due to the large dataset.

```bash
python run_main.py
```

Environment variables `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, or `DB_URL` can override the default connection string.
Set DB_HOST to "localhost".

## Starting the FastAPI server

Start the API with uvicorn:

```bash
python run_api.py
# or
uvicorn src.api.app:app --host 0.0.0.0 --port 8000
```

Set `UVICORN_RELOAD=1` before running `python run_api.py` to enable autoreload.

## Starting the frontend

Run the following commands inside the frontend folder
```bash
npm i
npm run dev
```
