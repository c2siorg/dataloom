"""DataLoom FastAPI application entry point.

Configures middleware, exception handlers, and mounts all API routers.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.endpoints import projects, transformations, user_logs
from app.config import get_settings
from app.exceptions import AppException, app_exception_handler
from app.services.transformation_service import TransformationError
from app.utils.logging import get_logger, setup_logging

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app):
    """Application startup/shutdown lifecycle."""
    from alembic.config import Config

    from alembic import command

    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")

    settings = get_settings()
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
app.include_router(user_logs.router, prefix="/logs", tags=["user_logs"])

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=4200)
