"""DataLoom FastAPI application entry point.

Configures middleware, exception handlers, and mounts all API routers.
"""

import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.endpoints import auth, profiling, projects, transformations, user_logs
from app.config import get_settings
from app.database import verify_database_connection
from app.exceptions import AppException, app_exception_handler
from app.services.transformation_service import TransformationError
from app.utils.logging import get_logger, request_id_var, setup_logging

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app):
    """Application startup/shutdown lifecycle."""
    verify_database_connection()
    from alembic.config import Config

    from alembic import command

    settings = get_settings()

    if not settings.database_url.startswith("sqlite"):
        try:
            alembic_cfg = Config("alembic.ini")
            command.upgrade(alembic_cfg, "head")
        except Exception as e:
            logger.error("Alembic migration failed: %s", e)
            raise

    setup_logging(settings.debug)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

    logger.info("DataLoom backend starting (debug=%s)", settings.debug)
    yield
    logger.info("DataLoom backend shutting down")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Attach a correlation ID (request_id) to every request.

    Reads the ``X-Request-ID`` header from the client when present so that
    downstream consumers can correlate their own tracing IDs; otherwise
    generates a new UUID hex string.  The ID is set on a ``ContextVar`` that
    propagates to all log entries emitted during the request lifecycle.
    """
    rid = (request.headers.get("X-Request-ID") or "").strip() or uuid.uuid4().hex
    request_id_var.set(rid)

    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)

    response.headers["X-Request-ID"] = rid

    logger.info(
        "request complete",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


@app.exception_handler(TransformationError)
async def transformation_error_handler(request: Request, exc: TransformationError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


app.add_exception_handler(AppException, app_exception_handler)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(transformations.router, prefix="/projects", tags=["transformations"])
app.include_router(profiling.router, prefix="/projects", tags=["profiling"])
app.include_router(user_logs.router, prefix="/logs", tags=["user_logs"])

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=4200)
