# DataLoom

Project is to design and implement a web-based GUI for data wrangling, aimed at simplifying the process of managing and transforming tabular datasets. This application will serve as a graphical interface for the powerful Python library, allowing users to perform complex data manipulation tasks without the need for in-depth programming knowledge. 

## Apps and Packages

| Name | Description |
|---|---|
| `frontend` | React.js app (Vite) — served at `http://localhost:5173` |
| `backend` | Python FastAPI app — served at `http://127.0.0.1:8000` |

This project uses [TurboRepo](https://turbo.build/repo) to manage the monorepo and run both apps together with a single command.

---

## Prerequisites

Make sure you have the following installed before getting started:

- **Node.js** `>= 18` — [Download](https://nodejs.org/)
- **npm** `>= 10` (comes with Node.js)
- **Python** `>= 3.10` — [Download](https://www.python.org/)
- **PostgreSQL** — [Download](https://www.postgresql.org/download/)
- **TurboRepo** (see install step below)

---

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/c2siorg/dataloom.git
cd dataloom
```

### 2. Install TurboRepo

TurboRepo is used to manage and run all packages in this monorepo. Install it globally:

```bash
npm install -g turbo
```

Or use `npx` to run Turbo commands without a global install:

```bash
npx turbo <command>
```

> For more information, see the [TurboRepo documentation](https://turbo.build/repo/docs).

### 3. Install Node.js Dependencies

From the root of the project, install all dependencies for both `frontend` and all packages at once:

```bash
npm install
```

### 4. Set Up the Python Backend

Navigate to the `backend` directory and create a virtual environment:

```bash
cd backend
python -m venv env
```

Activate the virtual environment:

- **Windows:**
  ```bash
  .\env\Scripts\activate
  ```
- **macOS / Linux:**
  ```bash
  source env/bin/activate
  ```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

### 5. Set Up Environment Variables

Create a `.env` file inside the `backend/` directory. Use the provided sample as a reference:

```bash
cp backend/.env.sample backend/.env   # macOS/Linux
copy backend\.env.sample backend\.env  # Windows
```

Open the file and fill in your PostgreSQL database URL:

```env
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<database_name>
```

### 6. Run the Project

Go back to the project root and start both the frontend and backend with a single command:

```bash
cd ..         # if you're still inside backend/
npm run dev
```

TurboRepo will start both services in parallel:

- **Frontend:** `http://localhost:5173`
- **Backend API:** `http://127.0.0.1:8000`
- **API Docs (Swagger):** `http://127.0.0.1:8000/docs`

---

## Available Scripts

Run these from the project root:

| Command | Description |
|---|---|
| `npm run dev` | Start all apps in development mode |
| `npm run build` | Build all apps |
| `npm run lint` | Lint all packages |

---

## Troubleshooting

**`turbo: command not found`**
> Install TurboRepo globally: `npm install -g turbo`, or prefix commands with `npx turbo`.

**`npm run dev` only starts the frontend, not the backend**
> Make sure you have activated your Python virtual environment and installed dependencies in `backend/` before running `npm run dev` from the root.

**`psycopg2` install fails on Windows**
> Use the binary version: `pip install psycopg2-binary`

**Database connection errors**
> Ensure PostgreSQL is running and the `DATABASE_URL` in `backend/.env` is correct.

**Node.js version mismatch**
> This project requires Node.js `>= 18`. Check your version with `node --version` and upgrade if needed.
