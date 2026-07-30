"""Pipeline service: save logged transformation sequences and replay them.

A pipeline step stores the exact ``action_type`` + ``action_details`` of a
``user_logs`` row, so both the compatibility check and the apply path replay
through the same ``TRANSFORMATION_REGISTRY`` the save path uses — pipelines
add no transformation logic of their own.
"""

import uuid
from typing import NamedTuple

import pandas as pd
from fastapi import HTTPException
from sqlmodel import Session

from app import models
from app.schemas import OperationType, PipelineStepInput
from app.services.transformation_service import TransformationError, apply_logged_transformation
from app.utils.logging import get_logger

logger = get_logger(__name__)

_VALID_ACTION_TYPES = {op.value for op in OperationType}


class _DraftStep(NamedTuple):
    """One step queued for a dry run: its position plus what to replay."""

    number: int
    action_type: str
    action_details: dict


def _step_rejection_reason(action_type: str) -> str | None:
    """Return why a step may not belong to a pipeline, or None if it is allowed.

    The single rule shared by the save path and the draft check, so a draft can
    never pass the check and then be rejected on save.
    """
    if action_type not in _VALID_ACTION_TYPES:
        return f"Unknown action type: {action_type}"
    if action_type == OperationType.addFile:
        return "addFile steps cannot be included in a pipeline"
    return None


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
        HTTPException: 400 if a step has an unknown action_type, or an addFile
            step is included (its stored file is project-scoped).
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


def _ordered_steps(pipeline: models.Pipeline) -> list[models.PipelineStep]:
    return sorted(pipeline.steps, key=lambda step: step.step_order)


def _incompatible(step: _DraftStep, reason: str) -> dict:
    """Build a PipelineCompatibilityResponse-shaped failure for one step."""
    return {
        "compatible": False,
        "failing_step": step.number,
        "action_type": step.action_type,
        "reason": reason,
    }


def _dry_run_steps(df: pd.DataFrame, steps: list[_DraftStep]) -> dict:
    """Replay draft steps against a DataFrame and report the first failure.

    Shared by the saved-pipeline check and the unsaved-draft check. A step the
    save path would reject fails here too, so a draft that reports compatible is
    always saveable.

    Returns:
        Dict shaped like PipelineCompatibilityResponse.
    """
    for step in steps:
        rejection = _step_rejection_reason(step.action_type)
        if rejection is not None:
            return _incompatible(step, rejection)
        try:
            df = apply_logged_transformation(df, step.action_type, step.action_details)
        except (TransformationError, HTTPException, KeyError, TypeError) as e:
            reason = e.detail if isinstance(e, HTTPException) else str(e)
            return _incompatible(step, str(reason))
    return {"compatible": True, "failing_step": None, "action_type": None, "reason": None}


def check_pipeline_compatibility(df: pd.DataFrame, pipeline: models.Pipeline) -> dict:
    """Dry-run a saved pipeline against a DataFrame and report the first failure."""
    steps = [_DraftStep(step.step_order, step.action_type, step.action_details) for step in _ordered_steps(pipeline)]
    return _dry_run_steps(df, steps)


def check_steps_compatibility(df: pd.DataFrame, steps: list[PipelineStepInput]) -> dict:
    """Dry-run an unsaved list of draft steps against a DataFrame (0-based step numbers)."""
    drafts = [_DraftStep(order, step.action_type, step.action_details) for order, step in enumerate(steps)]
    return _dry_run_steps(df, drafts)


def apply_pipeline(df: pd.DataFrame, pipeline: models.Pipeline) -> pd.DataFrame:
    """Replay every pipeline step on the DataFrame.

    Args:
        df: The target project's current data.
        pipeline: The pipeline to apply.

    Returns:
        The transformed DataFrame.

    Raises:
        TransformationError: If a step fails, with the step context prepended.
    """
    for step in _ordered_steps(pipeline):
        try:
            df = apply_logged_transformation(df, step.action_type, step.action_details)
        except (TransformationError, HTTPException, KeyError, TypeError) as e:
            reason = e.detail if isinstance(e, HTTPException) else str(e)
            raise TransformationError(f"Pipeline step {step.step_order} ({step.action_type}) failed: {reason}") from e
    return df
