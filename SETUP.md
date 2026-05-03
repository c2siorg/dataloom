# Local Development Setup Guide — DataLoom

This document describes how to set up the DataLoom project locally on Windows 11.

## Prerequisites

- Git
- Node.js (v18+)
- Python 3.12+
- Git Bash

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

## 2. Backend Setup (Python/FastAPI)

```bash
cd dataloom-backend
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
```

Start the backend server (runs on port 4200):

```bash
uvicorn app.main:app --reload --port 4200
```

## 3. Frontend Setup (Next.js)

```bash
cd ../dataloom-frontend
npm install
npm run dev
```

Frontend runs on port 3200.

## 4. Verify Setup

- Backend API: http://localhost:4200/docs
- Frontend: http://localhost:3200

## 5. Running Tests

```bash
cd dataloom-backend
source .venv/Scripts/activate
python -m pytest
```

## Environment

- OS: Windows 11
- Backend: FastAPI + SQLite
- Frontend: Next.js
- Python: 3.12
