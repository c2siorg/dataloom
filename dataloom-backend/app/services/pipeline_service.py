import pandas as pd

from app.services.formula_service import add_formula_column
from app.services.transformation_service import (
    TransformationError,
    add_column,
    add_row,
    advanced_query,
    apply_filter,
    apply_sort,
    change_cell_value,
    delete_column,
    delete_row,
    drop_duplicates,
    fill_empty,
    pivot_table,
)


def replay_pipeline(df: pd.DataFrame, steps: list[dict]) -> pd.DataFrame:
    for i, step in enumerate(steps):
        try:
            df = _apply_step(df, step)
        except Exception as e:
            raise TransformationError(f"Pipeline step {i + 1} ({step.get('operation_type', '?')}): {e}") from e
    return df


def _apply_step(df: pd.DataFrame, step: dict) -> pd.DataFrame:
    op = step.get("operation_type")

    if op == "filter":
        p = step["parameters"]
        return apply_filter(df, p["column"], p["condition"], p["value"])
    elif op == "sort":
        p = step["sort_params"]
        return apply_sort(df, p["column"], p["ascending"])
    elif op == "addRow":
        return add_row(df, step["row_params"]["index"])
    elif op == "delRow":
        return delete_row(df, step["row_params"]["index"])
    elif op == "addCol":
        p = step["col_params"]
        return add_column(df, p["index"], p["name"])
    elif op == "delCol":
        return delete_column(df, step["col_params"]["index"])
    elif op == "changeCellValue":
        p = step["change_cell_value"]
        return change_cell_value(df, p["row_index"], p["col_index"], p["fill_value"])
    elif op == "fillEmpty":
        p = step["fill_empty_params"]
        return fill_empty(df, p["fill_value"], p.get("index"))
    elif op == "dropDuplicate":
        p = step["drop_duplicate"]
        return drop_duplicates(df, p["columns"], p["keep"])
    elif op == "advQueryFilter":
        return advanced_query(df, step["adv_query"]["query"])
    elif op == "pivotTables":
        p = step["pivot_query"]
        return pivot_table(df, p["index"], p["value"], p.get("column"), p.get("aggfun", "sum"))
    elif op == "formula":
        return add_formula_column(df, step["formula"]["name"], step["formula"]["expression"])
    else:
        raise TransformationError(f"Unknown operation: {op}")
