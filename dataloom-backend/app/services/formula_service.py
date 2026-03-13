import pandas as pd

from app.services.transformation_service import TransformationError
from app.utils.security import validate_query_string


def add_formula_column(df: pd.DataFrame, name: str, expression: str) -> pd.DataFrame:
    if name in df.columns:
        raise TransformationError(f"Column '{name}' already exists")

    validate_query_string(expression)

    try:
        df = df.copy()
        df[name] = df.eval(expression, local_dict={"__builtins__": {}})
        return df
    except Exception as e:
        raise TransformationError(f"Formula error: {e}") from e
