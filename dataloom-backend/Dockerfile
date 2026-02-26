FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies (layer cached separately from app code)
COPY pyproject.toml uv.lock ./
RUN mkdir -p app && touch app/__init__.py
RUN uv pip install --system --no-cache .

# Copy application code
COPY . .

# Create non-root user with home directory
RUN groupadd -r appuser && useradd -r -g appuser -m appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 4200

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4200"]