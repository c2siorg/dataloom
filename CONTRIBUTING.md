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

### Backend

```bash
cd dataloom-backend
python3 -m venv env
source env/bin/activate        # On macOS/Linux
pip install -r requirements.txt
```

Copy the example environment file and configure it with your PostgreSQL connection:

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL` to point to a running PostgreSQL instance with a database named `dataloom`.

Start the backend development server:

```bash
uvicorn app.main:app --reload --port 4200
```

The API will be available at `http://localhost:4200`.

### Frontend

```bash
cd dataloom-frontend
npm install
npm run dev
```

The frontend development server will start at `http://localhost:3200`.

### Full Stack (Turborepo)

To run both the frontend and backend together from the repository root:

```bash
npm install
npm run dev
```

## Development Workflow

1. Make your changes in a feature branch.
2. Test your changes:
   - **Backend:** `cd dataloom-backend && pytest`
   - **Frontend:** `cd dataloom-frontend && npm run test`
3. Lint and format your code:
   - **Frontend:** `npm run lint` and `npm run format`
4. Commit your changes with a clear, descriptive commit message.
5. Push your branch to your fork and open a pull request against the `main` branch.

## Code Style

### Frontend

- **ESLint** is used for linting. Run `npm run lint` to check for issues.
- **Prettier** is used for formatting. Run `npm run format` to auto-format files.
- Follow existing patterns in the codebase for component structure and naming.

### Backend

- Follow standard Python conventions (PEP 8).
- Use type hints for function signatures.
- Keep API endpoints in `app/api/endpoints/` and data models in `app/models.py`.
- Use Pydantic schemas in `app/schemas.py` for request/response validation.

## Reporting Bugs

Use the [Bug Report](https://github.com/c2siorg/dataloom/issues/new?template=bug_report.md) issue template. Include steps to reproduce, expected behavior, and your environment details.

## Requesting Features

Use the [Feature Request](https://github.com/c2siorg/dataloom/issues/new?template=feature_request.md) issue template. Describe the problem, your proposed solution, and any alternatives you have considered.

## License

By contributing to DataLoom, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
