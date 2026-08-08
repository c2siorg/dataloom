"""Pipeline service: save logged transformation sequences and replay them.

A pipeline step stores the exact ``action_type`` + ``action_details`` of a
``user_logs`` row, so both the compatibility check and the apply path replay
through the same ``TRANSFORMATION_REGISTRY`` the save path uses — pipelines
add no transformation logic of their own.
"""

import uuid
from collections.abc import Sequence

import pandas as pd
from fastapi import HTTPException
from sqlmodel import Session

from app import models
from app.schemas import PipelineCompatibilityResponse, PipelineStepInput
from app.services.project_service import log_transformations_or_restore
from app.services.transformation_service import (
    TRANSFORMATION_REGISTRY,
    TransformationError,
    apply_logged_transformation,
)
from app.utils.logging import get_logger
from app.utils.pandas_helpers import save_table_safe

logger = get_logger(__name__)

# One replayable step, as both a saved pipeline and an unsaved draft express it.
Step = tuple[str, dict]


def _step_rejection_reason(action_type: str) -> str | None:
    """Return why a step may not belong to a pipeline, or None if it is allowed.

    Reusability is a property of the operation, so the registry owns it: an
    operation bound to one project is marked ``reusable=False`` there. This is
    the single rule shared by the save path and the draft check, so a draft can
    never pass the check and then be rejected on save.
    """
    spec = TRANSFORMATION_REGISTRY.get(action_type)
    if spec is None:
        return f"Unknown action type: {action_type}"
    if not spec.reusable:
        return f"{action_type} steps cannot be included in a pipeline"
    return None


def pipeline_steps(pipeline: models.Pipeline) -> list[Step]:
    """The pipeline's steps in run order, as replayable pairs."""
    return [(step.action_type, step.action_details) for step in sorted(pipeline.steps, key=lambda s: s.step_order)]


def create_pipeline_from_steps(
    db: Session,
    owner_id: uuid.UUID,
    name: str,
    description: str | None,
    steps: list[PipelineStepInput],
) -> models.Pipeline:
    """Persist an ordered list of steps as a new pipeline.

    Steps come from the builder as ``action_type`` + ``action_details`` pairs —
    whether picked from the change log or authored from scratch — and are stored
    in the order given.

    Args:
        db: Database session.
        owner_id: The authenticated user who will own the pipeline.
        name: Pipeline name.
        description: Optional pipeline description.
        steps: The ordered steps to store.

    Returns:
        The persisted Pipeline with its steps.

    Raises:
        HTTPException: 400 if a step has an unknown action_type, or is an
            operation the registry marks as not reusable.
    """
    for step in steps:
        rejection = _step_rejection_reason(step.action_type)
        if rejection is not None:
            raise HTTPException(status_code=400, detail=rejection)

    pipeline = models.Pipeline(name=name, description=description, owner_id=owner_id)
    db.add(pipeline)
    db.flush()

    for order, step in enumerate(steps):
        db.add(
            models.PipelineStep(
                pipeline_id=pipeline.id,
                step_order=order,
                action_type=step.action_type,
                action_details=step.action_details,
            )
        )

    db.commit()
    db.refresh(pipeline)
    logger.info("Created pipeline %s with %d steps for user %s", pipeline.id, len(steps), owner_id)
    return pipeline


def _replay(df: pd.DataFrame, steps: Sequence[Step]) -> tuple[pd.DataFrame, PipelineCompatibilityResponse | None]:
    """Replay steps in order, stopping at the first one that fails.

    The single replay path behind both the compatibility check and the apply, so
    the two can never disagree about what a pipeline accepts.

    Returns:
        The DataFrame as far as it got, plus the failure for the first bad step
        (None when every step ran).
    """
    for number, (action_type, action_details) in enumerate(steps):
        reason = _step_rejection_reason(action_type)
        if reason is None:
            try:
                df = apply_logged_transformation(df, action_type, action_details)
                continue
            except (TransformationError, HTTPException, KeyError, TypeError) as e:
                reason = str(e.detail if isinstance(e, HTTPException) else e)
        return df, PipelineCompatibilityResponse(
            compatible=False,
            failing_step=number,
            action_type=action_type,
            reason=reason,
        )
    return df, None


def check_steps_compatibility(df: pd.DataFrame, steps: Sequence[Step]) -> PipelineCompatibilityResponse:
    """Dry-run steps against a DataFrame and report the first failing one."""
    _, failure = _replay(df, steps)
    return failure or PipelineCompatibilityResponse(compatible=True)


def apply_pipeline(df: pd.DataFrame, steps: Sequence[Step]) -> pd.DataFrame:
    """Replay every step on the DataFrame.

    Args:
        df: The target project's current data.
        steps: The steps to replay, in run order.

    Returns:
        The transformed DataFrame.

    Raises:
        TransformationError: If a step fails, with the step context prepended.
    """
    result_df, failure = _replay(df, steps)
    if failure is not None:
        raise TransformationError(
            f"Pipeline step {failure.failing_step} ({failure.action_type}) failed: {failure.reason}"
        )
    return result_df


def apply_pipeline_to_project(
    db: Session, project: models.Project, pipeline: models.Pipeline, df: pd.DataFrame
) -> pd.DataFrame:
    """Replay a pipeline onto a project's working copy and log every step.

    Logging each step as a change-log row is what keeps save, undo and
    checkpoint replay working on a pipeline run exactly as on a manual
    transform. The caller supplies the loaded DataFrame so the file is read
    through the endpoint layer's redacting reader.

    Args:
        db: Database session.
        project: The target project.
        pipeline: The pipeline to replay.
        df: The project's current data.

    Returns:
        The transformed DataFrame.

    Raises:
        TransformationError: If a step fails; nothing is written.
    """
    steps = pipeline_steps(pipeline)
    result_df = apply_pipeline(df, steps)
    save_table_safe(result_df, project.file_path)
    log_transformations_or_restore(db, project.project_id, project.file_path, df, steps)
    return result_df
