"""Replay a project's change log onto its original dataset.

The change log only grows. Every action is a row, and a save, a revert or a
checkpoint delete never removes or hides one. A checkpoint therefore *points
at* a row — ``Checkpoint.log_position`` is the last row the save covered —
instead of owning a group of rows, and a revert is logged as a row of its own
that points at the position it restored.

Restoring is then one rule: start from the original file and replay the log up
to the target position, where a normal row applies its transform and a revert
row replaces the data with the state at its own target before replay continues.
Because the log is never rewritten, deleting a checkpoint removes only the
pointer, and every revert row that points at that position keeps working.
"""

from collections.abc import Sequence

import pandas as pd

from app import models
from app.services.transformation_service import apply_logged_transformation
from app.utils.pandas_helpers import read_table_safe

# Action type of the row a revert appends. It is change-log bookkeeping, not a
# transformation, so it has no TRANSFORMATION_REGISTRY entry.
REVERT_ACTION_TYPE = "revert"

_REVERT_POSITION_KEY = "log_position"
_REVERT_CHECKPOINT_KEY = "checkpoint_id"


def revert_action_details(checkpoint_id: object | None, log_position: int | None) -> dict:
    """Serialize the row a revert appends.

    Both values are the ones resolved when the revert ran: the checkpoint the
    user went back to (``None`` for a full revert to the original file) and the
    log position that checkpoint points at. Storing the position rather than
    looking the checkpoint up later is what lets a checkpoint be deleted
    without breaking the reverts that targeted it.
    """
    return {
        _REVERT_CHECKPOINT_KEY: str(checkpoint_id) if checkpoint_id is not None else None,
        _REVERT_POSITION_KEY: log_position,
    }


def load_log_rows(
    db: object,
    project_id: object,
    upto_position: int | None = None,
) -> list[models.ProjectChangeLog]:
    """Fetch a project's change log, oldest first.

    Ordered by ``change_log_id`` and never by ``timestamp``: every row of a
    pipeline Run shares one timestamp, and the row id is the log's only total
    order.

    Args:
        db: Database session.
        project_id: The project whose log to read.
        upto_position: Replay stops here. ``None`` reads the whole log, which
            is what rebuilds an unsaved working copy.

    Returns:
        The rows, in log order.
    """
    query = db.query(models.ProjectChangeLog).filter(models.ProjectChangeLog.project_id == project_id)
    if upto_position is not None:
        query = query.filter(models.ProjectChangeLog.change_log_id <= upto_position)
    return query.order_by(models.ProjectChangeLog.change_log_id).all()


def replay_log_rows(df: pd.DataFrame, rows: Sequence[models.ProjectChangeLog]) -> pd.DataFrame:
    """Replay ``rows``, already in log order, onto ``df``.

    Args:
        df: The project's original data, or whatever the caller is replaying onto.
        rows: The change-log rows to apply, oldest first.

    Returns:
        The replayed DataFrame.

    Raises:
        ValueError: If a revert row's target position is not one of the rows
            being replayed, which means the log no longer holds that state.
    """
    original_df = df
    wanted_positions = _revert_target_positions(rows)
    states: dict[int, pd.DataFrame] = {}

    for row in rows:
        if row.action_type == REVERT_ACTION_TYPE:
            df = _restore_target_state(original_df, row.action_details, states)
        else:
            df = apply_logged_transformation(df, row.action_type, row.action_details)
        if row.change_log_id in wanted_positions:
            states[row.change_log_id] = df
    return df


def restore_checkpoint_state(
    db: object,
    project_id: object,
    original_path: str,
    log_position: int | None,
) -> pd.DataFrame:
    """Rebuild the data a checkpoint was saved with.

    A ``None`` position means the checkpoint was taken before any row was
    written, so it holds the original file — which is also the state a full
    revert goes back to.
    """
    df = read_table_safe(original_path)
    if log_position is None:
        return df
    return replay_log_rows(df, load_log_rows(db, project_id, upto_position=log_position))


def _revert_target_positions(rows: Sequence[models.ProjectChangeLog]) -> set[int]:
    """Every log position some revert row in ``rows`` restores."""
    positions = set()
    for row in rows:
        if row.action_type != REVERT_ACTION_TYPE:
            continue
        position = row.action_details.get(_REVERT_POSITION_KEY)
        if position is not None:
            positions.add(position)
    return positions


def _restore_target_state(
    original_df: pd.DataFrame,
    details: dict,
    states: dict[int, pd.DataFrame],
) -> pd.DataFrame:
    """Return the state a revert row points at.

    A row with no target position is a revert to the original file. Anything
    else must have been replayed already: a revert can only go back to a
    checkpoint that existed when it ran, so its position is always earlier in
    the log than the revert row itself."""
    if not isinstance(details, dict):
        raise ValueError(f"Revert row has unreadable details: {details!r}")

    position = details.get(_REVERT_POSITION_KEY)
    if position is None:
        return original_df

    state = states.get(position)
    if state is None:
        raise ValueError(f"Revert row targets log position {position}, which the replay never reached")
    return state
