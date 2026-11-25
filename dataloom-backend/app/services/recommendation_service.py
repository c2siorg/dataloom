"""Rule-based operation suggestions derived from column profiles.

Pure functions over the profile dicts produced by
:func:`app.services.profiling_service.all_column_profiles` — no extra pass over
the DataFrame, no side effects, and nothing is applied automatically.

Where :func:`app.services.quality_service.suggest_remediations` maps detected
quality issues ("what's broken?") to fixes, this module maps descriptive profile
signals ("what's a useful next step for exploring this dataset?") to existing
``OperationType`` values. The output shape mirrors ``suggest_remediations()``
(``column``, ``suggestion``, ``operation``) plus the profile ``signal`` that
triggered it, so the frontend can wire both through the same transform flow.
"""

from typing import Any

from app.services.visualization_service import LOW_CARDINALITY_MAX, NUMERIC_LABELS

# Datasets at or above this row count (matching the 100k benchmark frame size)
# receive a dataset-level suggestion to explore a random sample first.
LARGE_ROW_THRESHOLD = 100_000


def suggest_operations(
    profiles: list[dict[str, Any]] | dict[str, Any],
) -> list[dict[str, Any]]:
    """Return rule-based exploration suggestions from column profile dicts.

    Accepts either the ``list[dict]`` of column profiles or the
    ``{"profiles": [...]}`` wrapper returned by
    :func:`app.services.profiling_service.all_column_profiles`.

    Rules evaluated:
    - ``constant``: a column labelled ``constant`` carries no variance; returns
      ``operation: None`` because dropping a column is destructive and has no
      docked form (matching ``suggest_remediations()`` on mostly-empty columns).
    - ``low_cardinality``: a categorical (``str``) column with ``2 <= distinct
      <= LOW_CARDINALITY_MAX`` repeating values when at least one numeric column
      is present suggests ``groupby``.
    - ``large_row_count``: a dataset with ``row_count >= LARGE_ROW_THRESHOLD``
      suggests ``sample`` (dataset-level, ``column: None``).
    """
    profile_list: list[dict[str, Any]] = profiles.get("profiles", []) if isinstance(profiles, dict) else list(profiles)
    if not profile_list:
        return []

    has_numeric = any(p.get("dtype") in NUMERIC_LABELS for p in profile_list)
    suggestions: list[dict[str, Any]] = []

    for profile in profile_list:
        column = profile.get("column")
        distribution = profile.get("distribution")

        if distribution == "constant":
            suggestions.append(
                {
                    "column": column,
                    "suggestion": f"Column '{column}' has a single constant value, consider dropping it",
                    "operation": None,
                    "signal": "constant",
                }
            )
            continue

        if has_numeric and profile.get("dtype") == "str":
            cardinality = profile.get("cardinality")
            unique_count = int(cardinality if cardinality is not None else profile.get("unique_count", 0))
            row_count = int(profile.get("row_count", 0))
            null_count = int(profile.get("null_count", 0))
            non_null = row_count - null_count

            if (
                2 <= unique_count <= LOW_CARDINALITY_MAX
                and distribution != "high-cardinality"
                and (non_null <= 0 or unique_count < non_null)
            ):
                suggestions.append(
                    {
                        "column": column,
                        "suggestion": f"Group by '{column}' ({unique_count} categories) to summarize numeric columns",
                        "operation": "groupby",
                        "signal": "low_cardinality",
                    }
                )

    dataset_rows = max((int(p.get("row_count", 0)) for p in profile_list), default=0)
    if dataset_rows >= LARGE_ROW_THRESHOLD:
        suggestions.append(
            {
                "column": None,
                "suggestion": f"Dataset has {dataset_rows:,} rows — sample a subset for faster exploration",
                "operation": "sample",
                "signal": "large_row_count",
            }
        )

    return suggestions
