"""Serialization coverage for comparison response value types."""

from app.schemas import ComparisonCellChange, ComparisonRowChange


def test_comparison_schemas_accept_nested_json_values():
    cell = ComparisonCellChange(
        row={"key": [1, None]},
        column="metadata",
        checkpoint_value={"enabled": True, "values": [1, 2.5, None]},
        current_value=[{"name": "updated"}],
    )
    row = ComparisonRowChange(
        type="added",
        row={"identifier": "row-1", "tags": ["one", "two"]},
        checkpoint_index=None,
        current_index=3,
    )

    assert cell.model_dump(mode="json")["checkpoint_value"] == {"enabled": True, "values": [1, 2.5, None]}
    assert row.model_dump(mode="json")["row"] == {"identifier": "row-1", "tags": ["one", "two"]}
