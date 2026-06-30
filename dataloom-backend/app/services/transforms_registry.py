"""Transformation registry mapping operation types to their specifications.

Holds the ``TransformationSpec`` dataclass, the ``TRANSFORMATION_REGISTRY``
that maps every ``OperationType`` enum member to its spec, and the log-replay
function ``apply_logged_transformation`` that drives the save-and-revert flow.
"""

from collections.abc import Callable
from dataclasses import dataclass

import pandas as pd

from app.schemas import OperationType
from app.utils.logging import get_logger

logger = get_logger(__name__)


class TransformationError(Exception):
    """Raised when a transformation cannot be applied due to invalid input."""

    pass


@dataclass(frozen=True)
class TransformationSpec:
    """Describes how to validate, dispatch, and persist one transformation.

    Attributes:
        func: Name of the pure transformation function in this module, resolved at
            dispatch time as ``func(df, *args)``. Stored as a name (not a direct
            reference) so the function stays a patchable module-level seam.
        params_field: Key of this transformation's parameters on the serialized
            ``TransformationInput`` dict (and on a log entry's ``action_details``).
            ``None`` means the transformation takes no parameter object.
        missing_error: Client-facing 400 detail raised by the execution path when
            ``params_field`` is absent. ``None`` skips the presence check (the
            parameters are optional, e.g. dropNa).
        persist: Whether a successful result is saved to disk and logged. Read-only
            previews (advanced query, pivot, melt) set this to ``False``.
        build_args: Maps the full serialized details dict to the positional args
            passed to ``func`` after ``df``.
        replay_tolerant: When ``True``, a replay whose parameters are missing/
            incomplete is skipped (returns ``df`` unchanged) instead of raising.
    """

    func: str
    params_field: str | None
    missing_error: str | None
    persist: bool
    build_args: Callable[[dict], tuple]
    replay_tolerant: bool = False


def _col_params(details: dict, field: str) -> dict:
    """Resolve column params, falling back to the legacy ``col_params`` log key."""
    return details.get(field) or details.get("col_params")


def resolve_transformation(name: str) -> Callable[..., pd.DataFrame]:
    """Resolve a registry function name to the module-level callable.

    Uses a lazy import so that transformation functions can be imported
    (and patched by tests) on ``app.services.transformation_service`` without
    creating a circular import between the two modules.

    Looked up dynamically so tests (and any future wrapping) can patch the
    function on ``transformation_service`` and have both the execution and
    replay paths honor it.
    """
    import app.services.transformation_service as _ts_mod  # noqa: PLC0415

    return getattr(_ts_mod, name)


TRANSFORMATION_REGISTRY: dict[OperationType, TransformationSpec] = {
    OperationType.filter: TransformationSpec(
        func="apply_filter",
        params_field="parameters",
        missing_error="Filter parameters required",
        persist=True,
        build_args=lambda d: (d["parameters"]["column"], d["parameters"]["condition"], d["parameters"]["value"]),
    ),
    OperationType.sort: TransformationSpec(
        func="apply_sort",
        params_field="sort_params",
        missing_error="Sort parameters required",
        persist=True,
        build_args=lambda d: (
            d["sort_params"].get("column"),
            d["sort_params"].get("ascending", True),
            d["sort_params"].get("criteria"),
        ),
    ),
    OperationType.addRow: TransformationSpec(
        func="add_row",
        params_field="row_params",
        missing_error="Row parameters required",
        persist=True,
        build_args=lambda d: (d["row_params"]["index"],),
    ),
    OperationType.delRow: TransformationSpec(
        func="delete_row",
        params_field="row_params",
        missing_error="Row parameters required",
        persist=True,
        build_args=lambda d: (d["row_params"]["index"],),
    ),
    OperationType.addCol: TransformationSpec(
        func="add_column",
        params_field="add_col_params",
        missing_error="Column parameters required",
        persist=True,
        build_args=lambda d: (
            _col_params(d, "add_col_params")["index"],
            _col_params(d, "add_col_params")["name"],
        ),
    ),
    OperationType.delCol: TransformationSpec(
        func="delete_column",
        params_field="del_col_params",
        missing_error="Column index required",
        persist=True,
        build_args=lambda d: (_col_params(d, "del_col_params")["index"],),
    ),
    OperationType.changeCellValue: TransformationSpec(
        func="change_cell_value",
        params_field="change_cell_value",
        missing_error="Cell value parameters required",
        persist=True,
        build_args=lambda d: (
            d["change_cell_value"]["row_index"],
            d["change_cell_value"]["col_index"],
            d["change_cell_value"]["fill_value"],
        ),
    ),
    OperationType.fillEmpty: TransformationSpec(
        func="fill_empty",
        params_field="fill_empty_params",
        missing_error="Fill parameters required",
        persist=True,
        build_args=lambda d: (
            d["fill_empty_params"].get("fill_value"),
            d["fill_empty_params"].get("index"),
            d["fill_empty_params"].get("strategy", "custom"),
        ),
    ),
    OperationType.renameCol: TransformationSpec(
        func="rename_column",
        params_field="rename_col_params",
        missing_error="Rename column parameters required",
        persist=True,
        build_args=lambda d: (d["rename_col_params"]["col_index"], d["rename_col_params"]["new_name"]),
    ),
    OperationType.castDataType: TransformationSpec(
        func="cast_data_type",
        params_field="cast_data_type_params",
        missing_error="Cast data type parameters required",
        persist=True,
        build_args=lambda d: (d["cast_data_type_params"]["column"], d["cast_data_type_params"]["target_type"]),
    ),
    OperationType.trimWhitespace: TransformationSpec(
        func="trim_whitespace",
        params_field="trim_whitespace_params",
        missing_error="Trim whitespace parameters required",
        persist=True,
        build_args=lambda d: (d["trim_whitespace_params"]["column"],),
    ),
    OperationType.sample: TransformationSpec(
        func="sample_rows",
        params_field="sample_params",
        missing_error="Sample parameters required",
        persist=True,
        build_args=lambda d: (d["sample_params"]["sample_size"], d["sample_params"].get("random_seed")),
    ),
    OperationType.stringReplace: TransformationSpec(
        func="string_replace",
        params_field="string_replace_params",
        missing_error="String replace parameters required",
        persist=True,
        build_args=lambda d: (
            d["string_replace_params"]["column"],
            d["string_replace_params"]["find_value"],
            d["string_replace_params"]["replace_value"],
        ),
        replay_tolerant=True,
    ),
    OperationType.dropDuplicate: TransformationSpec(
        func="drop_duplicates",
        params_field="drop_duplicate",
        missing_error="Drop duplicate parameters required",
        persist=True,
        build_args=lambda d: (d["drop_duplicate"]["columns"], d["drop_duplicate"]["keep"]),
    ),
    OperationType.advQueryFilter: TransformationSpec(
        func="advanced_query",
        params_field="adv_query",
        missing_error="Query parameter required",
        persist=False,
        build_args=lambda d: (d["adv_query"]["query"],),
    ),
    OperationType.pivotTables: TransformationSpec(
        func="pivot_table",
        params_field="pivot_query",
        missing_error="Pivot parameters required",
        persist=False,
        build_args=lambda d: (
            d["pivot_query"]["index"],
            d["pivot_query"]["value"],
            d["pivot_query"]["column"],
            d["pivot_query"]["aggfun"],
        ),
    ),
    OperationType.dropNa: TransformationSpec(
        func="drop_na",
        params_field="drop_na_params",
        missing_error=None,
        persist=True,
        build_args=lambda d: ((d.get("drop_na_params") or {}).get("columns"),),
    ),
    OperationType.melt: TransformationSpec(
        func="melt_dataframe",
        params_field="melt_params",
        missing_error="Melt parameters required",
        persist=False,
        build_args=lambda d: (d["melt_params"],),
    ),
    OperationType.groupby: TransformationSpec(
        func="group_by",
        params_field="groupby_params",
        missing_error="GroupBy parameters required",
        persist=True,
        build_args=lambda d: (
            d["groupby_params"]["columns"],
            d["groupby_params"]["agg_column"],
            d["groupby_params"]["agg_function"],
        ),
    ),
}

# Fail loudly at import if a new OperationType is added without a registry entry,
# keeping the enum and the registry from drifting apart.
_missing = set(OperationType) - set(TRANSFORMATION_REGISTRY)
if _missing:
    raise RuntimeError(f"OperationType members missing a TRANSFORMATION_REGISTRY entry: {sorted(_missing)}")


def apply_logged_transformation(df: pd.DataFrame, action_type: str, action_details: dict) -> pd.DataFrame:
    """Replay a logged transformation from its serialized form.

    Used by the save endpoint to apply pending transformations to the original
    dataset file. Each action_details dict contains the serialized parameters
    from the original TransformationInput, so dispatch resolves through the same
    TRANSFORMATION_REGISTRY the execution path uses.

    Args:
        df: Source DataFrame.
        action_type: The operation type string.
        action_details: Dict of the full transformation parameters.

    Returns:
        Transformed DataFrame.

    Raises:
        TransformationError: If the transformation cannot be applied.
    """
    spec = TRANSFORMATION_REGISTRY.get(action_type)
    if spec is None:
        logger.warning("Unknown action type in log replay: %s", action_type)
        raise TransformationError(f"Unknown action type in log replay: {action_type}")

    try:
        args = spec.build_args(action_details)
    except (KeyError, TypeError):
        if spec.replay_tolerant:
            logger.warning("Missing params for %s replay: %s", action_type, action_details)
            return df
        raise

    return resolve_transformation(spec.func)(df, *args)
