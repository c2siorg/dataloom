# Contributing to DataLoom

Thank you for your interest in contributing to DataLoom! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/dataloom.git
   cd dataloom
   ```
3. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites
Before you begin, ensure you have the following installed on your machine:
* **Python** (via `uv` package manager): [Install uv](https://github.com/astral-sh/uv)
* **Node.js** & **npm**: [Install Node.js](https://nodejs.org/)
* **PostgreSQL**: [Download PostgreSQL](https://www.postgresql.org/download/)

### Database Setup
DataLoom requires a PostgreSQL database to run. 
1. Install PostgreSQL from the official link above and start the service.
2. Create a new database specifically for this project named `dataloom`.
   - *Via Command Line (psql):* 
     ```bash
     psql -U postgres -c "CREATE DATABASE dataloom;"
     ```
   - *Via pgAdmin:* Right-click "Databases" -> Create -> Database -> Name it `dataloom`.

### Backend Setup

```bash
cd dataloom-backend
cp .env.example .env          # Configure DB credentials
uv sync
```

Edit the newly created `.env` file and set your `DATABASE_URL` to point to your running PostgreSQL instance. An example standard local connection string is:
`DATABASE_URL="postgresql://postgres:<your_password>@localhost:5432/dataloom"`

Start the backend development server:

```bash
uv run uvicorn app.main:app --reload --port 4200
```

> **Note:** If the above command fails or throws an error on your system, please try running it as a Python module instead:
> ```bash
> uv run python -m uvicorn app.main:app --reload --port 4200
> ```

The API will be available at `http://localhost:4200`.

### Frontend Setup

```bash
cd dataloom-frontend
npm install
npm run dev
```

The frontend development server will start at `http://localhost:3200`.

## Development Workflow

1. Make your changes in a feature branch.
2. Test your changes:
   - **Backend:** `cd dataloom-backend && uv run pytest`
   - **Frontend:** `cd dataloom-frontend && npm run test`
3. Lint and format your code:
   - **Backend:** `uv run ruff check .` and `uv run ruff format .`
   - **Frontend:** `npm run lint` and `npm run format`
4. Commit your changes with a clear, descriptive commit message.
5. Push your branch to your fork and open a pull request against the `main` branch.

### E2E Tests (Playwright)

End-to-end tests use [Playwright](https://playwright.dev/) and exercise the full stack (frontend + backend + database).

Make sure PostgreSQL is running (via Docker Compose or natively):

```bash
docker compose up -d db
```

From the repository root:

```bash
npm install                          # Install Playwright (first time only)
npx playwright install chromium      # Install browser (first time only)
npx playwright test                  # Run all E2E tests
npx playwright test --headed         # Run with visible browser
npx playwright test --debug          # Run in debug mode with inspector
```

Playwright automatically starts the backend and frontend servers. If they are already running, it reuses them.

Test files are in `e2e/` at the repository root. Import `{ test, expect }` from `e2e/fixtures.js` and rely on the provided fixtures for per-test project creation and automatic cleanup, rather than calling `createProject` or `deleteProjectApi` directly. Use `data-testid` selectors where available.

## Code Style

### Frontend

- **ESLint** is used for linting. Run `npm run lint` to check for issues.
- **Prettier** is used for formatting. Run `npm run format` to auto-format files.
- Follow existing patterns in the codebase for component structure and naming.

### Backend

- **Ruff** is used for linting and formatting. Run `uv run ruff check .` and `uv run ruff format .` from the backend directory.
- Use type hints for function signatures.
- Keep API endpoints in `app/api/endpoints/` and data models in `app/models.py`.
- Use Pydantic schemas in `app/schemas.py` for request/response validation.

## Reporting Bugs

Use the [Bug Report](https://github.com/c2siorg/dataloom/issues/new?template=bug_report.md) issue template. Include steps to reproduce, expected behavior, and your environment details.

## Requesting Features

Use the [Feature Request](https://github.com/c2siorg/dataloom/issues/new?template=feature_request.md) issue template. Describe the problem, your proposed solution, and any alternatives you have considered.

## License

By contributing to DataLoom, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
