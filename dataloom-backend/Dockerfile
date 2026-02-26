FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir "fastapi>=0.115" "uvicorn[standard]>=0.34" \
    "sqlmodel>=0.0.22" "alembic>=1.14" "psycopg2-binary>=2.9" \
    "pydantic-settings>=2.0" "pandas>=2.1" "python-dotenv>=1.0" \
    "python-multipart>=0.0.6"

# Copy application code
COPY . .

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 4200

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4200"]