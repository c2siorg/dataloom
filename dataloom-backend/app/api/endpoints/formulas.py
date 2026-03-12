"""Formula column and transformation pipeline API endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app import database, models
from app.api.dependencies import get_project_or_404
from app.services.formula_service import add_formula_column
from app.services.pipeline_service import replay_pipeline
from app.services.project_service import log_transformation
from app.services.transformation_service import TransformationError
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_csv_safe, save_csv_safe

logger = get_logger(__name__)

router = APIRouter()


# --- Formula column ---

class FormulaRequest(BaseModel):
    name: str
    expression: str


@router.post("/{project_id}/formula")
async def create_formula_column(
    project_id: uuid.UUID,
    request: FormulaRequest,
    db: Session = Depends(database.get_db),
):
    """Add a computed formula column to the project dataset."""
    project = get_project_or_404(project_id, db)
    df = read_csv_safe(project.file_path)

    try:
        result = add_formula_column(df, request.name, request.expression)
    except TransformationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    save_csv_safe(result, project.file_path)
    log_transformation(db, project_id, "formula", {
        "formula": {"name": request.name, "expression": request.expression}
    })

    resp = dataframe_to_response(result)
    return {"project_id": project_id, "operation_type": "formula", **resp}


# --- Pipelines ---

class PipelineCreate(BaseModel):
    name: str
    description: str | None = None
    steps: list[dict]


class PipelineResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    steps: list[dict]


@router.post("/pipelines", response_model=PipelineResponse)
async def save_pipeline(
    request: PipelineCreate,
    db: Session = Depends(database.get_db),
):
    """Save a reusable transformation pipeline."""
    pipeline = models.Pipeline(
        name=request.name,
        description=request.description,
        steps=request.steps,
    )
    db.add(pipeline)
    db.commit()
    db.refresh(pipeline)
    return pipeline


@router.get("/pipelines", response_model=list[PipelineResponse])
async def list_pipelines(db: Session = Depends(database.get_db)):
    """List all saved pipelines."""
    return db.query(models.Pipeline).all()


@router.post("/{project_id}/pipelines/{pipeline_id}/run")
async def run_pipeline(
    project_id: uuid.UUID,
    pipeline_id: uuid.UUID,
    db: Session = Depends(database.get_db),
):
    """Run a saved pipeline on a project dataset."""
    project = get_project_or_404(project_id, db)
    pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    df = read_csv_safe(project.file_path)

    try:
        result = replay_pipeline(df, pipeline.steps)
    except TransformationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    save_csv_safe(result, project.file_path)

    resp = dataframe_to_response(result)
    return {"project_id": project_id, "operation_type": "pipeline", "pipeline_name": pipeline.name, **resp}
