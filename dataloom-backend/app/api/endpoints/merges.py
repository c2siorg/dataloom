"""Relational dataset merging API endpoints.

Enables horizontal joining of a project's dataset with another project in the
workspace or with an uploaded file: pre-join alignment analysis (match rates,
cardinality, Cartesian warnings, unmatched key samples), interactive preview,
and transactional merge commit with full undo/redo integration.
"""

from __future__ import annotations

import shutil
import tempfile
import uuid
from contextlib import suppress
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlmodel import Session
from starlette.concurrency import run_in_threadpool

from app import database, models, schemas
from app.api.dependencies import (
    fetch_owned_project,
    get_current_user,
    get_project_or_404,
    load_project_df,
    read_project_df,
)
from app.services.file_service import store_added_file
from app.services.merge_service import MergeError, analyze_merge, merge_dataframes
from app.services.project_service import commit_undoable_change, create_project_file
from app.utils.logging import get_logger
from app.utils.pandas_helpers import (
    dataframe_to_response,
    paginate_dataframe,
    read_table_safe,
    save_table_safe,
)
from app.utils.project_locks import project_write_lock
from app.utils.security import resolve_upload_path, sanitize_filename, validate_upload_file

logger = get_logger(__name__)

router = APIRouter()


def _format_project_response(project: models.Project, df, page: int, page_size: int) -> dict:
    """Format a DataFrame and pagination parameters into a ProjectResponse payload."""
    response_df, pagination = paginate_dataframe(df, page, page_size)
    resp = dataframe_to_response(response_df)
    return {
        "filename": project.name,
        "file_path": str(project.file_path),
        "project_id": project.project_id,
        **resp,
        **pagination,
    }


def _read_upload_df(file: UploadFile):
    """Parse an uploaded file into a temporary DataFrame without storing it."""
    file.file.seek(0)
    suffix = Path(file.filename or "data.csv").suffix.lower()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)
    try:
        return read_table_safe(tmp_path, use_cache=False)
    except HTTPException as e:
        raise HTTPException(status_code=400, detail=f"Could not parse uploaded {suffix} file: {e.detail}") from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse uploaded {suffix} file: {e}") from e
    finally:
        with suppress(FileNotFoundError):
            tmp_path.unlink()


@router.post(
    "/{project_id}/merge/analyze",
    response_model=schemas.MergeAnalysisResponse,
    summary="Analyze alignment for a join with another project",
)
def analyze_project_merge(
    project_id: uuid.UUID,
    request: schemas.MergeAnalyzeRequest,
    project: models.Project = Depends(get_project_or_404),
    db: Session = Depends(database.get_db),
    user: models.User = Depends(get_current_user),
):
    """Stateless diagnostic analysis comparing current project with another project on join keys."""
    # Ensure target project exists and belongs to the same user
    target_project = fetch_owned_project(db, request.target_project_id, user)

    left_df = load_project_df(project)
    right_df = load_project_df(target_project)

    try:
        return analyze_merge(
            left_df,
            right_df,
            left_on=request.left_on,
            right_on=request.right_on,
            how=request.how,
            suffixes=request.suffixes,
        )
    except MergeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


def _parse_form_keys(key_str: str | None) -> list[str] | None:
    """Parse comma-delimited form input into a clean list of key column names."""
    if not key_str:
        return None
    keys = [k.strip() for k in key_str.split(",") if k.strip()]
    return keys if keys else None


@router.post(
    "/{project_id}/merge/analyze-file",
    response_model=schemas.MergeAnalysisResponse,
    summary="Analyze alignment for a join with an uploaded file",
)
async def analyze_file_merge(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    left_on: str = Form(""),
    right_on: str = Form(""),
    how: schemas.JoinType = Form(schemas.JoinType.inner),
    suffix_left: str = Form("_left"),
    suffix_right: str = Form("_right"),
    project: models.Project = Depends(get_project_or_404),
):
    """Stateless diagnostic analysis comparing current project with an uploaded file on join keys."""
    await validate_upload_file(file)
    right_df = await run_in_threadpool(_read_upload_df, file)
    left_df = await run_in_threadpool(load_project_df, project)

    left_keys = _parse_form_keys(left_on)
    right_keys = _parse_form_keys(right_on)

    try:
        return await run_in_threadpool(
            analyze_merge,
            left_df,
            right_df,
            left_on=left_keys,
            right_on=right_keys,
            how=how,
            suffixes=(suffix_left, suffix_right),
        )
    except MergeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post(
    "/{project_id}/merge",
    response_model=schemas.ProjectResponse,
    summary="Execute or preview a merge with another project",
)
def execute_project_merge(
    project_id: uuid.UUID,
    request: schemas.MergeExecuteRequest,
    preview: bool = Query(True, description="Preview merge without committing"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    project: models.Project = Depends(get_project_or_404),
    db: Session = Depends(database.get_db),
    user: models.User = Depends(get_current_user),
):
    """Execute a relational join between two projects.

    When ``preview=True``, returns paginated result without modifying the project.
    When ``preview=False``, acquires an exclusive project lock, commits an undoable
    change, logs the ``mergeDataset`` action in user_logs, and updates the working file.
    """
    target_project = fetch_owned_project(db, request.target_project_id, user)

    if preview:
        left_df = load_project_df(project)
        right_df = load_project_df(target_project)
        try:
            merged_df = merge_dataframes(
                left_df,
                right_df,
                left_on=request.left_on,
                right_on=request.right_on,
                how=request.how,
                suffixes=request.suffixes,
                max_rows_limit=request.max_rows_limit,
            )
        except MergeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        return _format_project_response(project, merged_df, page=page, page_size=page_size)

    # Commit execution under project write lock
    with project_write_lock(project.project_id):
        left_df = read_project_df(project)
        right_df = read_project_df(target_project)
        try:
            merged_df = merge_dataframes(
                left_df,
                right_df,
                left_on=request.left_on,
                right_on=request.right_on,
                how=request.how,
                suffixes=request.suffixes,
                max_rows_limit=request.max_rows_limit,
            )
        except MergeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        # Snapshot right_df to an immutable file in upload_dir so future mutations to target_project
        # cannot alter replay during undo/redo or pipeline execution.
        clean_target_name = sanitize_filename(f"{target_project.name}_merged.csv")
        snapshot_filename = f"{uuid.uuid4().hex}_{clean_target_name}"
        snapshot_path = resolve_upload_path(snapshot_filename)
        save_table_safe(right_df, snapshot_path)

        project_file = create_project_file(
            db,
            project.project_id,
            str(snapshot_path),
            f"{target_project.name}.csv",
        )

        action_details = {
            "target_project_id": str(request.target_project_id),
            "target_project_name": target_project.name,
            "project_file_id": str(project_file.id),
            "file_path": str(snapshot_path),
            "left_on": request.left_on,
            "right_on": request.right_on,
            "how": request.how.value if hasattr(request.how, "value") else str(request.how),
            "suffixes": list(request.suffixes),
            "result_rows": len(merged_df),
        }
        commit_undoable_change(
            db,
            project,
            merged_df,
            [(schemas.OperationType.mergeDataset, action_details)],
        )

        return _format_project_response(project, merged_df, page=page, page_size=page_size)


def _commit_file_merge(
    db: Session,
    project: models.Project,
    file: UploadFile,
    right_df,
    left_keys: list[str] | None,
    right_keys: list[str] | None,
    how: schemas.JoinType,
    suffixes: tuple[str, str],
    page: int,
    page_size: int,
) -> dict:
    """Commit file merge under write lock, creating inventory and log entries only after merge validation."""
    with project_write_lock(project.project_id):
        left_df = read_project_df(project)
        try:
            merged_df = merge_dataframes(
                left_df,
                right_df,
                left_on=left_keys,
                right_on=right_keys,
                how=how,
                suffixes=suffixes,
            )
        except MergeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        # Only after merge succeeds do we store the uploaded file and create DB records
        file.file.seek(0)
        try:
            stored_path = store_added_file(file)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        project_file = create_project_file(
            db,
            project.project_id,
            str(stored_path),
            file.filename or "merged_file.csv",
        )

        action_details = {
            "project_file_id": str(project_file.id),
            "file_path": str(stored_path),
            "filename": file.filename,
            "left_on": left_keys,
            "right_on": right_keys,
            "how": how.value if hasattr(how, "value") else str(how),
            "suffixes": list(suffixes),
            "result_rows": len(merged_df),
        }
        commit_undoable_change(
            db,
            project,
            merged_df,
            [(schemas.OperationType.mergeDataset, action_details)],
        )

        return _format_project_response(project, merged_df, page=page, page_size=page_size)


@router.post(
    "/{project_id}/merge/file",
    response_model=schemas.ProjectResponse,
    summary="Merge an uploaded file directly into the project",
)
async def execute_file_merge(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    left_on: str = Form(""),
    right_on: str = Form(""),
    how: schemas.JoinType = Form(schemas.JoinType.inner),
    suffix_left: str = Form("_left"),
    suffix_right: str = Form("_right"),
    preview: bool = Query(True, description="Preview merge without committing"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    project: models.Project = Depends(get_project_or_404),
    db: Session = Depends(database.get_db),
):
    """Merge an uploaded file directly into the current project.

    When ``preview=True``, returns the joined dataset without saving the file or modifying state.
    When ``preview=False``, acquires project write lock, validates the merge, saves the file in
    inventory, updates the dataset, and logs an undoable change.
    """
    await validate_upload_file(file)
    right_df = await run_in_threadpool(_read_upload_df, file)
    left_keys = _parse_form_keys(left_on)
    right_keys = _parse_form_keys(right_on)

    if preview:
        left_df = await run_in_threadpool(load_project_df, project)
        try:
            merged_df = await run_in_threadpool(
                merge_dataframes,
                left_df,
                right_df,
                left_on=left_keys,
                right_on=right_keys,
                how=how,
                suffixes=(suffix_left, suffix_right),
            )
        except MergeError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        return _format_project_response(project, merged_df, page=page, page_size=page_size)

    return await run_in_threadpool(
        _commit_file_merge,
        db,
        project,
        file,
        right_df,
        left_keys,
        right_keys,
        how,
        (suffix_left, suffix_right),
        page,
        page_size,
    )
