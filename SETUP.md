# Local Development Setup Guide — DataLoom

This guide sets up DataLoom locally on Windows, macOS, or Linux. For the contribution workflow (branches, linting, tests), see [CONTRIBUTING.md](CONTRIBUTING.md).

## Prerequisites

- Git
- Node.js (v18+) and npm
- Python 3.12+
- PostgreSQL (or Docker to run it in a container)
- [uv](https://github.com/astral-sh/uv) (manages Python and backend dependencies)

## 1. Fork & Clone the Repository

1. Go to https://github.com/c2siorg/dataloom
2. Click **Fork** → Create fork
3. Clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/dataloom.git
cd dataloom
```

4. Add upstream remote:

```bash
git remote add upstream https://github.com/c2siorg/dataloom.git
```

## 2. Start PostgreSQL

**Option A — Docker (recommended):** from the repository root:

```bash
docker compose up -d db
```

This creates a `dataloom` database with user `postgres` / password `postgres` on port 5432, matching the default `DATABASE_URL` in `.env.example`.

**Option B — Local install:** install PostgreSQL, start it, and create the database:

```bash
psql -U postgres -c "CREATE DATABASE dataloom;"
```

If your credentials differ, update `DATABASE_URL` in `dataloom-backend/.env` (step 3).

## 3. Backend Setup (FastAPI)

```bash
cd dataloom-backend
cp .env.example .env
uv sync
```

On Windows Command Prompt, use `copy .env.example .env` instead of `cp`.

### Local auth settings

Edit `dataloom-backend/.env` before starting the server:

- **`JWT_SECRET`** is required. Set it to a random value, for example the output of `openssl rand -hex 32`. If it is empty, signup fails with a 500 error.
- **`COOKIE_SECURE=false`** for local development. With `true`, the browser only sends the login cookie over HTTPS, so you stay logged out on `http://localhost`.

Start the backend (port 4200). Database migrations run automatically on startup:

```bash
uv run uvicorn app.main:app --reload --port 4200
```

## 4. Frontend Setup (React + Vite)

In a second terminal:

```bash
cd dataloom-frontend
npm install
npm run dev
```

Frontend runs on port 3200.

## 5. Verify Setup

- Backend API: http://localhost:4200/docs
- Frontend: http://localhost:3200

Create an account on the frontend to confirm the backend, database, and auth are working.

## 6. Running Tests

```bash
cd dataloom-backend && uv run pytest
cd ../dataloom-frontend && npm run test
```

## Troubleshooting

- **`database "dataloom" does not exist` while using Docker:** another PostgreSQL may already be running on port 5432 (check with `lsof -i :5432` on macOS/Linux). Either stop it, or create the `dataloom` database in that instance and skip the Docker container.
- **Signup returns 500, then "account already exists":** `JWT_SECRET` is empty. Set it, restart the backend, then sign in with the account that was created.
- **Changes to `.env` have no effect:** `.env` is only read at startup. Stop the backend (Ctrl + C) and start it again.