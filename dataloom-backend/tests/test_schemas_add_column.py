import pytest

from app import schemas


def test_add_column_schema_requires_name():
    with pytest.raises(ValueError):
        schemas.AddColumn(index=1)


def test_transformation_input_rejects_add_col_without_name():
    with pytest.raises(ValueError):
        schemas.TransformationInput(
            operation_type=schemas.OperationType.addCol,
            add_col_params={"index": 1},
        )


def test_transformation_input_rejects_blank_add_col_name():
    with pytest.raises(ValueError, match="cannot be empty or whitespace"):
        schemas.TransformationInput(
            operation_type=schemas.OperationType.addCol,
            add_col_params={"index": 1, "name": "   "},
        )


def test_transformation_input_accepts_valid_add_col_name():
    payload = schemas.TransformationInput(
        operation_type=schemas.OperationType.addCol,
        add_col_params={"index": 1, "name": "new_column"},
    )
    assert payload.add_col_params.name == "new_column"
