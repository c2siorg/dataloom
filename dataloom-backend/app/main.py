"""DataLoom FastAPI application entry point.

Configures middleware, exception handlers, and mounts all API routers.
"""

from contextlib import asynccontextmanager
from pathlib import Path
from app.api.endpoints import projects, user_logs, transformations, profiling, charts
from app.config import get_settings
from app.exceptions import AppException, app_exception_handler
from app.services.transformation_service import TransformationError
from app.utils.logging import setup_logging, get_logger
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app):
    """Application startup/shutdown lifecycle."""
    settings = get_settings()

    # Run Alembic migrations (skip for SQLite — tables managed manually)
    if not settings.database_url.startswith("sqlite"):
        try:
            from alembic import command
            from alembic.config import Config

            alembic_cfg = Config("alembic.ini")
            command.upgrade(alembic_cfg, "head")
        except Exception as e:
            logger.warning("Alembic migration skipped: %s", e)
    else:
        # Ensure tables exist via SQLModel for SQLite
        from sqlmodel import SQLModel
        from app.database import engine
        from app import models  # noqa: F401
        SQLModel.metadata.create_all(engine)

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
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


@app.exception_handler(TransformationError)
async def transformation_error_handler(request: Request, exc: TransformationError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


app.add_exception_handler(AppException, app_exception_handler)

app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(transformations.router, prefix="/projects", tags=["transformations"])
app.include_router(profiling.router, prefix="/projects", tags=["profiling"])
app.include_router(charts.router, prefix="/projects", tags=["charts"])
app.include_router(user_logs.router, prefix="/logs", tags=["user_logs"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4200)
