<div align="center">

# 📦 Inventory Management System

**A full-stack stock-management platform — Next.js + Electron frontend, FastAPI + PostgreSQL backend, with forecasting baked in.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&labelColor=0E1626)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&labelColor=0E1626)](https://nextjs.org/)
[![Electron](https://img.shields.io/badge/Electron-38-47848F?style=for-the-badge&labelColor=0E1626)](https://www.electronjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&labelColor=0E1626)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Docker-336791?style=for-the-badge&labelColor=0E1626)](https://www.postgresql.org/)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&labelColor=0E1626)](https://www.python.org/)

</div>

---

## 🎯 What is it

A stock-management system with a **Next.js 15 / React 18** dashboard (also packageable as a **Windows Electron desktop app**), a **FastAPI** backend powered by **SQLAlchemy + asyncpg**, a **PostgreSQL** store provisioned via Docker Compose, and a built-in **ETL + forecasting pipeline** (Prophet, scikit-learn) that loads sales, SKUs and stock data and serves predictions through the API.

---

## ✨ Features

### 🖥 Frontend
- **Next.js 15** App Router with **React 18** + **TypeScript 5**
- **shadcn/ui** components on top of **Radix UI** primitives
- **Tailwind CSS 4** styling, **Recharts** dashboards, **react-window** virtualization
- **Electron 38** packaging via `electron-builder` for a Windows desktop build

### 🔌 Backend
- **FastAPI** with `uvicorn[standard]`
- **SQLAlchemy 2** + **asyncpg** async DB access
- **Pydantic-AI** integration for assistant flows
- **PyInstaller** spec (`api.spec`) for bundling the API as a single executable

### 📊 Data & forecasting
- ETL pipeline populates the `sales`, `skus`, and `stock` tables
- **Prophet** + **scikit-learn** for demand prediction (see `backend/PREDICTION_API.md`)
- **pandas**, **pyarrow**, **fastparquet** for data wrangling

### 🐳 Ops
- `docker-compose.yaml` defines `frontend`, `backend`, and a `postgres` service
- Per-service `Dockerfile`s in `frontend/` and `backend/`

---

## 🚀 Quick start

### Prerequisites

| Tool       | Version          | Notes                                              |
|------------|------------------|----------------------------------------------------|
| 🐍 Python   | 3.12+            | Backend + ETL                                      |
| 📦 Node.js  | 18+              | Frontend dev server                                |
| 🐳 Docker   | with Compose v2  | Postgres (and full-stack run)                      |
| 🐘 Postgres | via compose      | Default credentials `admin` / `admin`              |

### 1. Start Postgres

```bash
docker compose up -d postgres
```

### 2. Install backend deps and run the ETL pipeline

```bash
pip install -r backend/requirements.txt
python run_main.py
```

> ⏳ The ETL load can take **5–10 minutes** on first run due to the dataset size.

Override the connection by setting any of `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, or `DB_URL`. For a host-side run against the compose Postgres, set `DB_HOST=localhost`.

### 3. Start the FastAPI server

```bash
python run_api.py
# or, directly:
uvicorn src.api.app:app --host 0.0.0.0 --port 8000
```

Set `UVICORN_RELOAD=1` before `python run_api.py` to enable autoreload during development. Use `run_api_prod.py` for the production entrypoint.

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3005
```

### 5. (Optional) Run everything via Compose

```bash
docker compose up --build
```

---

## 🖥 Desktop build (Electron, Windows)

The frontend ships an Electron shell that wraps the Next.js standalone output and bundles the backend executable as extra resources.

```bash
cd frontend
npm run build
npm run electron:build      # → frontend/dist/*.exe (NSIS installer)
```

The installer is non-one-click, lets the user pick the install path, and creates Desktop + Start Menu shortcuts (configured in `package.json` → `build.nsis`).

---

## 🗂 Project structure

```text
inventory-management-system/
├── docker-compose.yaml          # frontend + backend + postgres
├── run_main.py                  # ETL entrypoint
├── run_api.py / run_api_prod.py # FastAPI entrypoints
├── pyproject.toml  poetry.lock  uv.lock
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── api.spec                 # PyInstaller bundle spec
│   ├── PREDICTION_API.md        # forecasting API notes
│   └── src/
│       ├── api/
│       │   ├── app.py           # FastAPI app
│       │   ├── routes/
│       │   ├── schemas.py
│       │   ├── tables.py
│       │   └── db.py
│       ├── config.py
│       ├── database.py
│       ├── etl_pipeline.py / etl_pipeline2.py
│       ├── models.py
│       ├── prediction.py
│       └── prediction_db.py
│
└── frontend/
    ├── Dockerfile
    ├── package.json             # Next 15 + Electron 38 + shadcn/ui
    ├── next.config.mjs
    ├── electron/                # Electron main process
    ├── app/                     # Next App Router (dashboard, layout, …)
    ├── components/  components.json
    ├── lib/  styles/  public/
    └── NOTIFICATION_SYSTEM.md
```

---

## 🆘 Troubleshooting

| Symptom                                       | Fix                                                                                       |
|-----------------------------------------------|-------------------------------------------------------------------------------------------|
| Backend can't reach Postgres                  | Make sure `docker compose up -d postgres` is running and set `DB_HOST=localhost`.         |
| ETL takes a long time                         | Expected — first import processes a large dataset (5–10 min).                              |
| Frontend port conflict                        | The dev script binds **3005**; change it in `frontend/package.json` → `scripts.dev`.       |
| Electron build fails on non-Windows host      | The `electron:build` target uses `--win --x64`; build it from a Windows host or in CI.    |

---

<div align="center">

**Inventory Management System** · [GitHub](https://github.com/Luck-ai/inventory-management-system) · [Issues](https://github.com/Luck-ai/inventory-management-system/issues)

</div>
