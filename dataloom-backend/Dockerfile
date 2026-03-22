FROM python:3.12-slim AS builder

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim

WORKDIR /app

RUN groupadd -r appuser && useradd -r -g appuser appuser

COPY --from=builder /app/.venv /app/.venv
COPY . .

RUN mkdir -p /app/uploads && chown -R appuser:appuser /app

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 4200

USER appuser

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4200"]

