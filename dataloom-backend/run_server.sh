#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
exec uvicorn app.main:app --host 0.0.0.0 --port 4200 --reload
