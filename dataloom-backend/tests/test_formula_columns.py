"""Tests for the formula column transformation (addFormulaCol)."""

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException

from app.services.transformation_service import (
    TransformationError,
    add_formula_column,
    apply_logged_transformation,
)
from app.utils.security import prepare_formula_expression


@pytest.fixture
def sample_df():
    return pd.DataFrame(
        {
            "price": [10.0, 20.0, 30.0],
            "quantity": [1, 2, 3],
            "unit cost": [4.0, 5.0, 6.0],
            "status": ["active", "inactive", "active"],
        }
    )


class TestPrepareFormulaExpression:
    def test_arithmetic_allowed(self):
        prepare_formula_expression("price * quantity", ["price", "quantity"])

    def test_comparison_allowed(self):
        prepare_formula_expression("price > 100", ["price"])

    def test_boolean_logic_allowed(self):
        prepare_formula_expression("price > 10 and quantity < 5", ["price", "quantity"])

    def test_string_literal_allowed(self):
        prepare_formula_expression('status == "active"', ["status"])

    def test_spaced_column_allowed(self):
        prepare_formula_expression("unit cost * 2", ["unit cost"])

    def test_empty_rejected(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("   ", ["price"])

    def test_function_call_rejected(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("abs(price)", ["price"])

    def test_attribute_access_rejected(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("price.T", ["price"])

    def test_subscript_rejected(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("price[0]", ["price"])

    def test_dunder_rejected(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("__import__", ["price"])

    def test_lambda_rejected(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("lambda x: x", ["price"])

    def test_statement_rejected(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("import osmodule", ["price"])

    def test_unknown_name_rejected(self):
        with pytest.raises(HTTPException) as exc_info:
            prepare_formula_expression("prices * 2", ["price", "quantity"])
        assert "prices" in exc_info.value.detail

    def test_returns_backtick_wrapped_expression(self):
        assert prepare_formula_expression("unit cost * 2", ["unit cost"]) == "`unit cost` * 2"

    def test_apostrophe_column_is_wrapped_not_quote_normalized(self):
        assert prepare_formula_expression("buyer's price * 2", ["buyer's price"]) == "`buyer's price` * 2"

    def test_string_literal_quotes_are_normalized(self):
        assert prepare_formula_expression("status == 'active'", ["status"]) == 'status == "active"'

    def test_overlapping_column_names_use_longest_match(self):
        expr = prepare_formula_expression("total amount due + 1", ["amount due", "total amount due"])
        assert expr == "`total amount due` + 1"

    def test_keyword_column_is_wrapped(self):
        assert prepare_formula_expression("True", ["True"]) == "`True`"

    def test_literal_matching_a_column_name_stays_a_literal(self):
        expr = prepare_formula_expression('status == "unit cost"', ["status", "unit cost"])
        assert expr == 'status == "unit cost"'

    def test_literal_matching_a_column_name_survives_quote_normalization(self):
        expr = prepare_formula_expression("status == 'unit cost'", ["status", "unit cost"])
        assert expr == 'status == "unit cost"'

    def test_apostrophe_column_before_a_literal(self):
        expr = prepare_formula_expression("buyer's price > 1 and status == 'active'", ["buyer's price", "status"])
        assert expr == '`buyer\'s price` > 1 and status == "active"'

    def test_mixed_quote_literal_rejected(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("status == 'he said \"hi\"'", ["status"])

    def test_reserved_placeholder_prefix_rejected(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("_dataloom_col_0 * 2", ["unit cost"])


class TestAddFormulaColumn:
    def test_arithmetic(self, sample_df):
        result = add_formula_column(sample_df, "total", "price * quantity")
        assert result["total"].tolist() == [10.0, 40.0, 90.0]

    def test_source_columns_untouched(self, sample_df):
        result = add_formula_column(sample_df, "total", "price * quantity")
        assert list(result.columns) == ["price", "quantity", "unit cost", "status", "total"]
        pd.testing.assert_frame_equal(result.drop(columns=["total"]), sample_df)

    def test_comparison_produces_bool(self, sample_df):
        result = add_formula_column(sample_df, "expensive", "price > 15")
        assert result["expensive"].tolist() == [False, True, True]

    def test_spaced_column_name(self, sample_df):
        result = add_formula_column(sample_df, "margin", "price - unit cost")
        assert result["margin"].tolist() == [6.0, 15.0, 24.0]

    def test_string_comparison(self, sample_df):
        result = add_formula_column(sample_df, "is_active", 'status == "active"')
        assert result["is_active"].tolist() == [True, False, True]

    def test_scalar_broadcasts(self, sample_df):
        result = add_formula_column(sample_df, "constant", "2 + 3")
        assert result["constant"].tolist() == [5, 5, 5]

    def test_division_by_zero_yields_inf(self, sample_df):
        result = add_formula_column(sample_df, "ratio", "price / 0")
        assert np.isinf(result["ratio"]).all()

    def test_blank_name_raises(self, sample_df):
        with pytest.raises(TransformationError, match="empty"):
            add_formula_column(sample_df, "   ", "price * 2")

    def test_duplicate_name_raises(self, sample_df):
        with pytest.raises(TransformationError, match="already exists"):
            add_formula_column(sample_df, "price", "quantity * 2")

    def test_unknown_column_raises(self, sample_df):
        with pytest.raises(HTTPException):
            add_formula_column(sample_df, "total", "missing * 2")

    def test_apostrophe_column_name(self):
        df = pd.DataFrame({"buyer's price": [1.0, 2.0]})
        result = add_formula_column(df, "doubled", "buyer's price * 2")
        assert result["doubled"].tolist() == [2.0, 4.0]

    def test_overlapping_column_names(self):
        df = pd.DataFrame({"amount due": [1, 2], "total amount due": [10, 20]})
        result = add_formula_column(df, "sum", "total amount due + amount due")
        assert result["sum"].tolist() == [11, 22]

    def test_keyword_column_name_uses_column_values(self):
        df = pd.DataFrame({"True": [1, 0, 1]})
        result = add_formula_column(df, "copy", "True")
        assert result["copy"].tolist() == [1, 0, 1]

    def test_literal_equal_to_a_column_name_compares_values(self, sample_df):
        df = sample_df.assign(status=["unit cost", "other", "unit cost"])
        result = add_formula_column(df, "is_unit_cost", 'status == "unit cost"')
        assert result["is_unit_cost"].tolist() == [True, False, True]

    def test_replay_matches_direct_apply(self, sample_df):
        details = {"formula_col_params": {"column_name": "total", "expression": "price * quantity"}}
        replayed = apply_logged_transformation(sample_df, "addFormulaCol", details)
        direct = add_formula_column(sample_df, "total", "price * quantity")
        pd.testing.assert_frame_equal(replayed, direct)


@pytest.fixture
def project_id(client, sample_csv):
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": "Formula Columns", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


class TestFormulaColumnEndpoint:
    def _payload(self, name="double_age", expression="age * 2"):
        return {
            "operation_type": "addFormulaCol",
            "formula_col_params": {"column_name": name, "expression": expression},
        }

    def test_apply_persists_column(self, client, project_id):
        response = client.post(f"/projects/{project_id}/transform", json=self._payload())
        assert response.status_code == 200, response.text
        assert "double_age" in response.json()["columns"]

        details = client.get(f"/projects/get/{project_id}").json()
        assert "double_age" in details["columns"]

    def test_apply_is_logged(self, client, project_id):
        client.post(f"/projects/{project_id}/transform", json=self._payload())

        logs = client.get(f"/logs/{project_id}").json()
        assert any(log["action_type"] == "addFormulaCol" for log in logs)

    def test_preview_does_not_persist(self, client, project_id):
        response = client.post(f"/projects/{project_id}/transform?preview=true", json=self._payload())
        assert response.status_code == 200
        assert "double_age" in response.json()["columns"]

        details = client.get(f"/projects/get/{project_id}").json()
        assert "double_age" not in details["columns"]

    def test_missing_params_returns_400(self, client, project_id):
        response = client.post(f"/projects/{project_id}/transform", json={"operation_type": "addFormulaCol"})
        assert response.status_code == 400
        assert response.json()["detail"] == "Formula column parameters required"

    def test_dangerous_expression_returns_400(self, client, project_id):
        response = client.post(
            f"/projects/{project_id}/transform",
            json=self._payload(name="evil", expression="__import__('os').system('true')"),
        )
        assert response.status_code == 400

    def test_unknown_column_returns_400(self, client, project_id):
        response = client.post(
            f"/projects/{project_id}/transform",
            json=self._payload(name="oops", expression="missing_column * 2"),
        )
        assert response.status_code == 400

    def test_blank_params_return_422(self, client, project_id):
        response = client.post(
            f"/projects/{project_id}/transform",
            json=self._payload(name="", expression=""),
        )
        assert response.status_code == 422
