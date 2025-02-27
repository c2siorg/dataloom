FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY . .
# Create the uploads directory to store the uploaded files
RUN mkdir -p /app/uploads
# The database URL will be provided through environment variables
EXPOSE 8000

# Wait for PostgreSQL to be ready before starting the app
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000"]