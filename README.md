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
```

**1. Create a copy of the environment config and fill in your credentials:**

```bash
cp .env.example .env
```

Open `.env` and set your PostgreSQL connection string and other settings:

```env
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<dbname>
CORS_ORIGINS=["http://localhost:3200"]
UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE_BYTES=10485760
DEBUG=false
```

**2. Create the PostgreSQL database:**

Log in to PostgreSQL and create the database:

```bash
psql -U postgres
```

```sql
CREATE DATABASE <dbname>;
\q
```

**3. Install dependencies:**

```bash
uv sync
```

**4. Run database migrations to create all tables:**

```bash
uv run alembic upgrade head
```

**5. Start the development server:**

```bash
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
├── dataloom-backend/          # Python FastAPI server
│   ├── app/
│   │   ├── main.py            # App entry point & lifespan
│   │   ├── models.py          # SQLModel ORM models
│   │   ├── schemas.py         # Pydantic request/response schemas
│   │   ├── database.py        # Database engine & session
│   │   ├── config.py          # App settings (env vars)
│   │   ├── exceptions.py      # Custom exception handlers
│   │   ├── api/
│   │   │   ├── dependencies.py        # Shared FastAPI dependencies
│   │   │   └── endpoints/
│   │   │       ├── projects.py        # Project CRUD endpoints
│   │   │       ├── transformations.py # Transformation endpoints
│   │   │       └── user_logs.py       # Change log endpoints
│   │   ├── services/
│   │   │   ├── file_service.py        # CSV file handling
│   │   │   ├── project_service.py     # Project & checkpoint logic
│   │   │   └── transformation_service.py  # Pandas transformations
│   │   └── utils/
│   │       ├── logging.py             # Logging setup
│   │       ├── pandas_helpers.py      # DataFrame utilities
│   │       └── security.py            # Input validation helpers
│   ├── alembic/               # Database migrations
│   ├── tests/                 # Pytest test suite
│   ├── pyproject.toml
│   └── alembic.ini
└── dataloom-frontend/         # React + Vite SPA
    └── src/
        ├── api/               # Axios API client modules
        ├── Components/        # UI components (Table, Navbar, forms…)
        ├── context/           # React context providers
        ├── hooks/             # Custom React hooks
        ├── pages/             # Page-level components
        ├── constants/         # Shared constants
        ├── utils/             # Frontend utility helpers
        └── config/            # API base URL config
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[Apache 2.0](LICENSE)

## Author

[Oshan Mudannayake](mailto:oshan.ivantha@gmail.com)

For questions or queries about this project, please reach out via email.
