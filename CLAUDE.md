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
npm run lint                       # ESLint (js/jsx/ts/tsx) + TypeScript (tsc --noEmit)
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
  job_service.py         → Job rows: create under the 409/429 limits, transitions, recovery, purge
app/jobs/                → Background jobs, executed in-process off the request path
  runner.py              → JobRunner: ThreadPoolExecutor, cancel Events, session_factory, inline test mode
  registry.py            → JOB_REGISTRY: JobKind → validate + run (takes the same locks as the sync path)
  context.py             → JobContext: throttled progress, cooperative cancel, enter_commit_phase()
app/utils/
  security.py            → Filename sanitization, upload validation, query injection prevention, error redaction
  pandas_helpers.py      → Safe CSV I/O, DataFrame-to-response conversion
  df_cache.py            → Process-local LRU cache of parsed DataFrames, keyed on path/mtime/size
app/models.py            → SQLModel ORM (Project, ProjectChangeLog, Checkpoint, UndoStep)
app/schemas.py           → Pydantic request/response schemas + enums
app/config.py            → Pydantic BaseSettings with @lru_cache (get_settings())
app/database.py          → SQLModel engine + get_db session generator
```

**Key pattern: original + working copy files.** Each upload creates two files: `{name}.csv` (original, never modified during transforms) and `{name}_copy.csv` (working copy). A transform called with `preview=true` reads the working copy and writes nothing; with `preview=false` it writes the working copy and appends a change log entry. The "save" operation creates a checkpoint from the working copy as it stands and marks pending logs applied, without replaying anything. The "revert" operation rebuilds the working copy from the original, replaying logged transformations up to the chosen checkpoint, or restoring the bare original when no checkpoint is given.

**Undo and redo use snapshots, not replay.** Every logged write (a transform, a whole pipeline Run, a file append) goes through `project_service.commit_undoable_change`: it byte-copies the working copy to `{upload_dir}/snapshots/{project_id}/` first, then writes, logs, and records one `UndoStep` whose change-log rows carry its `undo_step_id`. Undo restores that snapshot atomically (temp file + `os.replace`) and deletes the step's rows; redo restores the snapshot taken at undo time and re-inserts the rows from `UndoStep.entries`. Undo/redo cover unsaved work only — Save and Revert clear them — and a new logged change clears redo. Past `undo_snapshot_limit` (default 20; `0` disables) and for rows logged before undo steps existed, undo falls back to replaying the change log from the original. Snapshot files are deleted only after the commit that stops referencing them.

**Preview before persist.** A preview lives only in frontend state, so a reload (`GET /projects/get/{id}`) and a CSV export both read the working copy and an unsaved preview is discarded. Apply issues `preview=true`; Save Changes reissues the same payload with `preview=false`, and that second call is the one that persists.

**Slow writes run as jobs.** A pipeline Run and a revert can outlast the frontend's 30 s timeout, so `POST /projects/{id}/jobs` returns 202 and the work runs on `app/jobs/runner.py`'s thread pool, started and stopped by the lifespan. The workers are threads, not processes, because `project_locks` and `df_cache` are process-local. A job takes the same `project_write_lock`, in the same order, as the sync endpoint, and calls the same service function (`pipeline_service.apply_pipeline_to_project`, `project_service.revert_project`), passing plain `on_step` / `before_commit` callables for progress and cancel. Services import nothing job-related. Cancel is honoured between steps and never after `before_commit`, so a cancelled job changed nothing. At most one exclusive (write) job is active per project, enforced by a partial unique index; while one is, the sync `/apply` and `/revert`, project delete and account delete answer 409 with `active_job_id`. Startup marks jobs left `queued`/`running` as failed ("Interrupted by a server restart"). Errors pass through `safe_transformation_error_detail` / `safe_http_exception_detail` before they are stored.

**Transformation service functions are pure** — they take a DataFrame and return a new DataFrame. Side effects (saving to disk, logging) are handled by the endpoint layer.

**Tests use SQLite** — `conftest.py` swaps PostgreSQL for an in-memory SQLite database using dependency override on `get_db`. It also points `runner.session_factory` at the test engine and runs jobs inline (to completion inside the submitting request); use the `threaded_job_runner` fixture for real worker threads.

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
  ActiveJobContext.tsx   → Per-workspace active job: startJob, resume on reload, outcome handling
src/hooks/               → Custom hooks (useProject, useTransform, useModal, useContextMenu, useJob polling)
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

**Pipeline Runs and reverts go through `useActiveJob().startJob`**, not the sync API. The context polls the job (`useJob`), shows it in the workspace banner (`JobProgress`), and on success reloads the table and calls `markDataChanged()` (`refreshProject` alone does not bump `dataVersion`). Reads of the project wait while `useProjectReadsOnHold()` is true, since they would queue behind the job's write lock.

**Transform forms wire into preview mode** — after a successful `preview=true` request call `enterPreviewMode` from ProjectContext, and `cancelPreview` from the Cancel handler. Use the shared `usePreviewSave` hook for Save Changes; it reissues the pending transform with `preview: false` and calls `confirmPreview` on success.

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
| POST | /projects/{id}/undo | Undo the last unsaved action (404 when nothing is unsaved) |
| POST | /projects/{id}/redo | Redo the last undone action (404 when nothing to redo) |
| GET | /projects/{id}/undo-state | `{can_undo, can_redo}` for enabling the buttons |
| GET | /logs/{project_id} | Change logs for project |
| GET | /logs/checkpoints/{project_id} | Checkpoint list for project |
| POST | /projects/{id}/jobs | Submit a background job (`pipelineRun`, `revert`) → 202 |
| GET | /jobs/{job_id} | Poll a job's status and progress |
| GET | /projects/{id}/jobs?active=true | A project's jobs (active ones, to resume after a reload) |
| POST | /jobs/{job_id}/cancel | Cancel a queued job, or stop a running one before it writes |

The single `/transform` endpoint dispatches to basic or complex handlers based on `operation_type`. Complex ops (set in `transformations.py:COMPLEX_OPERATIONS`): `dropDuplicate`, `advQueryFilter`, `pivotTables`, `dropNa`, `melt`, `groupby`.

### Database models (PostgreSQL, SQLModel)

- **Project** → `projects` table: id, name, description, file_path, timestamps
- **ProjectChangeLog** → `user_logs` table: logged transformations with `applied` flag and optional `checkpoint_id`
- **Checkpoint** → `checkpoints` table: save points that mark sets of applied transformations
- **UndoStep** → `undo_steps` table: one user action's unsaved work (`done` or `undone`), its log entries, and its before/after snapshot paths; `user_logs.undo_step_id` links rows to it
- **Job** → `jobs` table: one background execution — kind, status, progress, params, small result, redacted error (never row data)

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
- Never pass the request's Session to a job: it is closed once the response is sent. Jobs get Sessions from `runner.session_factory`, re-load rows by id, and write progress through their own short-lived Sessions (SQLite allows one writer at a time)
- Call replay hooks (`on_step`, `before_commit`) outside the per-step `try/except` in `pipeline_service._replay` and the revert loop, or a cancel is reported as "Pipeline step N failed"
- Keep a single Alembic head: startup runs `upgrade head`, which refuses two. A new migration's `down_revision` is the current `uv run alembic heads`; `tests/test_job_runner.py::test_single_alembic_head` fails otherwise
