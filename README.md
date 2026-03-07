# DataLoom

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A web-based GUI for data wrangling — manage and transform tabular datasets (CSV) through a graphical interface powered by pandas, without writing code.

## Features

- Upload and manage CSV datasets through a graphical interface
- Apply pandas-powered transformations: filter, sort, pivot, deduplicate, and more
- Inline cell editing and row/column management
- Checkpoint system — save and revert dataset states
- Full action history tracking via change logs

## Prerequisites

- Node.js >= 18
- Python 3.12+
- PostgreSQL

## Getting Started

### Backend

```bash
cd dataloom-backend
cp .env.example .env          # Configure DB credentials
uv sync
uv run uvicorn app.main:app --reload --port 4200
```

### Frontend

```bash
cd dataloom-frontend
npm install
npm run dev
```

| Service  | Port |
|----------|------|
| Frontend | 3200 |
| Backend  | 4200 |

## Running Tests

```bash
# Backend
cd dataloom-backend && uv run pytest

# Frontend
cd dataloom-frontend && npm run test
```

## Project Structure

```
dataloom/
  dataloom-backend/    # Python FastAPI server
  dataloom-frontend/   # React + Vite SPA
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[Apache 2.0](LICENSE)

## Author

[Oshan Mudannayake](mailto:oshan.ivantha@gmail.com)

For questions or queries about this project, please reach out via email.
