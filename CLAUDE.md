# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DataLoom is a web-based data wrangling tool for CSV datasets. Users upload CSVs and apply pandas-powered transformations (filter, sort, pivot, deduplicate, cell editing) through a React GUI. It features a checkpoint/revert system for saving and restoring project states.

## Commands

### Backend (dataloom-backend/)

```bash
uv sync                                      # Install dependencies
uv run uvicorn app.main:app --reload --port 4200  # Start dev server
uv run pytest -v                             # Run all tests
uv run pytest tests/test_transformations.py  # Run single test file
uv run pytest -k "test_filter"               # Run tests matching pattern
uv run ruff check .                          # Lint
uv run ruff format .                         # Format
uv run ruff check --fix .                    # Lint with auto-fix
uv run alembic upgrade head                  # Run DB migrations
```

### Frontend (dataloom-frontend/)

```bash
npm install                        # Install dependencies
npm run dev                        # Start dev server (port 3200)
npm run build                      # Production build
npm run test                       # Run all tests (vitest)
npm run lint                       # ESLint
npm run format                     # Prettier
```

### Docker

```bash
docker-compose up                  # Start all services (db, backend, frontend)
```

### Prerequisites

- PostgreSQL running locally (or via `docker-compose up db`)
- Backend requires `.env` file — copy from `.env.example`
- Python 3.12+, Node.js 18+, `uv` for Python dependency management

## Architecture

### Two-directory structure (not a monorepo)

`dataloom-backend/` (FastAPI/Python) and `dataloom-frontend/` (React/Vite) are independent projects with no shared package manager or build system.

### Backend layers

```
app/main.py              → FastAPI app, CORS, lifespan (auto-runs Alembic migrations on startup)
app/api/endpoints/       → Route handlers (projects, transformations, user_logs)
app/api/dependencies.py  → Shared FastAPI deps (get_project_or_404)
app/services/            → Business logic layer
  project_service.py     → CRUD + checkpoint creation
  transformation_service.py → Pure DataFrame transforms (no side effects)
  file_service.py        → Upload storage, original/copy file management
app/utils/
  security.py            → Filename sanitization, upload validation, query injection prevention
  pandas_helpers.py      → Safe CSV I/O, DataFrame-to-response conversion
app/models.py            → SQLModel ORM (Project, ProjectChangeLog, Checkpoint)
app/schemas.py           → Pydantic request/response schemas + enums
app/config.py            → Pydantic BaseSettings with @lru_cache (get_settings())
app/database.py          → SQLModel engine + get_db session generator
```

**Key pattern: original + working copy files.** Each upload creates two files: `{name}.csv` (original, never modified during transforms) and `{name}_copy.csv` (working copy). The "save" operation replays logged transformations onto the original. The "revert" operation restores from the original.

**Transformation service functions are pure** — they take a DataFrame and return a new DataFrame. Side effects (saving to disk, logging) are handled by the endpoint layer.

**Tests use SQLite** — `conftest.py` swaps PostgreSQL for an in-memory SQLite database using dependency override on `get_db`.

### Frontend layers

```
src/App.jsx              → Routes: "/" (Homescreen), "/workspace/:projectId" (DataScreen)
src/api/                 → Axios-based API layer
  client.js              → Configured Axios instance (base URL from VITE_API_BASE_URL)
  index.js               → Barrel export for all API functions
  projects.js, transforms.js, logs.js → API functions (return response.data directly)
src/context/             → React Context providers
  ProjectContext.jsx     → Project state (columns, rows, loading, refresh)
  ToastContext.jsx       → Toast notification state
src/hooks/               → Custom hooks (useProject, useTransform, useModal, useContextMenu)
src/Components/          → NOTE: uppercase "C" in directory name
  common/                → Shared UI (Button, Modal, ConfirmDialog, ErrorBoundary, Toast)
  forms/                 → Transform forms (Filter, Sort, Pivot, DropDuplicate, AdvQuery)
  history/               → CheckpointsPanel, LogsPanel
  layout/                → AppLayout (Outlet wrapper)
  DataScreen.jsx         → Main data editing view
  Table.jsx              → Project table renderer
  Homescreen.jsx         → Landing/upload page
```

**Project navigation uses URL params** (`/workspace/:projectId`), not state-based routing.

**API functions return `response.data`** — callers receive the parsed body directly, not the Axios response wrapper.

### API routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | /projects/upload | Upload CSV |
| GET | /projects/get/{id} | Get project data |
| GET | /projects/recent | Recent projects |
| GET | /projects/{id}/export | Download saved CSV |
| DELETE | /projects/{id} | Delete project |
| POST | /projects/{id}/save | Save checkpoint |
| POST | /projects/{id}/revert | Revert to checkpoint |
| POST | /projects/{id}/transform | Apply transform (basic or complex) |
| GET | /logs/{project_id} | Change logs for project |
| GET | /logs/checkpoints/{project_id} | Checkpoint list for project |

The single `/transform` endpoint dispatches to basic or complex handlers based on `operation_type`. Complex ops (set in `transformations.py:COMPLEX_OPERATIONS`): `dropDuplicate`, `advQueryFilter`, `pivotTables`, `dropNa`, `melt`, `groupby`.

### Database models (PostgreSQL, SQLModel)

- **Project** → `projects` table: id, name, description, file_path, timestamps
- **ProjectChangeLog** → `user_logs` table: logged transformations with `applied` flag and optional `checkpoint_id`
- **Checkpoint** → `checkpoints` table: save points that mark sets of applied transformations

## Conventions

- Backend linting: Ruff with rules `E, F, I, UP, B, SIM`, line length 120, Python 3.12 target
- Backend formatting: Ruff format, double quotes
- Frontend linting: ESLint with react/react-hooks/react-refresh plugins
- Frontend formatting: Prettier
- Frontend styling: Tailwind CSS
- Frontend testing: Vitest + @testing-library/react + jsdom
- Backend testing: pytest + httpx + FastAPI TestClient
- Pre-commit hooks: trailing whitespace, end-of-file, debug statements, ruff lint+format
- Indentation: 2 spaces (JS/JSX/CSS/YAML), 4 spaces (Python)

## Gotchas

- The `Components/` directory has an uppercase C — imports must match exactly
- `change_cell_value` uses 1-based `col_index` from the frontend (accounts for the S.No. display column); `rename_column` uses 0-based `col_index`
- Backend auto-runs Alembic migrations on startup via the lifespan handler
- `advanced_query` passes user input to `df.query()` — always goes through `validate_query_string()` injection check
