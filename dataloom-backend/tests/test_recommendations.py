"""Tests for rule-based operation suggestions derived from column profiles."""

import uuid

import pandas as pd
import pytest

from app import schemas
from app.services import profiling_service as ps
from app.services import recommendation_service as rs


class TestSuggestOperationsRules:
    def test_constant_column_returns_manual_drop_suggestion(self):
        df = pd.DataFrame(
            {
                "status": ["active", "active", "active", "active"],
                "value": [10, 20, 30, 40],
            }
        )
        suggestions = rs.suggest_operations(ps.all_column_profiles(df)["profiles"])
        assert len(suggestions) == 1
        assert suggestions[0]["column"] == "status"
        assert suggestions[0]["operation"] is None
        assert suggestions[0]["signal"] == "constant"
        assert "dropping" in suggestions[0]["suggestion"]

    def test_low_cardinality_categorical_with_numeric_suggests_groupby(self):
        df = pd.DataFrame(
            {
                "region": ["North", "South", "North", "South"],
                "revenue": [100, 200, 150, 250],
            }
        )
        suggestions = rs.suggest_operations(ps.all_column_profiles(df)["profiles"])
        assert len(suggestions) == 1
        assert suggestions[0]["column"] == "region"
        assert suggestions[0]["operation"] == schemas.OperationType.groupby.value
        assert suggestions[0]["signal"] == "low_cardinality"

    def test_low_cardinality_without_numeric_column_is_skipped(self):
        df = pd.DataFrame(
            {
                "region": ["North", "South", "North", "South"],
                "tier": ["gold", "silver", "gold", "silver"],
            }
        )
        suggestions = rs.suggest_operations(ps.all_column_profiles(df)["profiles"])
        assert suggestions == []

    def test_categorical_above_low_cardinality_max_is_skipped(self):
        categories = [f"cat_{i % (rs.LOW_CARDINALITY_MAX + 1)}" for i in range(60)]
        df = pd.DataFrame({"category": categories, "amount": list(range(60))})
        suggestions = rs.suggest_operations(ps.all_column_profiles(df)["profiles"])
        assert suggestions == []

    def test_large_row_count_suggests_sample_once(self):
        profiles = [
            {
                "column": "a",
                "dtype": "int",
                "row_count": rs.LARGE_ROW_THRESHOLD,
                "null_count": 0,
                "unique_count": rs.LARGE_ROW_THRESHOLD,
                "distribution": "high-cardinality",
            },
            {
                "column": "b",
                "dtype": "float",
                "row_count": rs.LARGE_ROW_THRESHOLD,
                "null_count": 0,
                "unique_count": rs.LARGE_ROW_THRESHOLD,
                "distribution": "normal-ish",
            },
        ]
        suggestions = rs.suggest_operations(profiles)
        assert len(suggestions) == 1
        assert suggestions[0]["column"] is None
        assert suggestions[0]["operation"] == schemas.OperationType.sample.value
        assert suggestions[0]["signal"] == "large_row_count"

    def test_small_clean_dataset_returns_no_suggestions(self):
        df = pd.DataFrame(
            {
                "name": ["Alice", "Bob", "Charlie", "Diana"],
                "age": [30, 25, 35, 28],
            }
        )
        assert rs.suggest_operations(ps.all_column_profiles(df)["profiles"]) == []
        assert rs.suggest_operations([]) == []

    def test_accepts_all_column_profiles_wrapper_or_list(self):
        df = pd.DataFrame(
            {
                "region": ["East", "West", "East", "West"],
                "sales": [10, 20, 30, 40],
            }
        )
        wrapped = ps.all_column_profiles(df)
        assert rs.suggest_operations(wrapped) == rs.suggest_operations(wrapped["profiles"])

    def test_all_suggested_operations_exist_in_operation_type_enum(self):
        profiles = [
            {
                "column": "const_col",
                "dtype": "str",
                "row_count": rs.LARGE_ROW_THRESHOLD,
                "null_count": 0,
                "unique_count": 1,
                "cardinality": 1,
                "distribution": "constant",
            },
            {
                "column": "region",
                "dtype": "str",
                "row_count": rs.LARGE_ROW_THRESHOLD,
                "null_count": 0,
                "unique_count": 3,
                "cardinality": 3,
                "distribution": "unknown",
            },
            {
                "column": "revenue",
                "dtype": "float",
                "row_count": rs.LARGE_ROW_THRESHOLD,
                "null_count": 0,
                "unique_count": 500,
                "distribution": "normal-ish",
            },
        ]
        suggestions = rs.suggest_operations(profiles)
        assert [s["signal"] for s in suggestions] == ["constant", "low_cardinality", "large_row_count"]
        for item in suggestions:
            assert set(item.keys()) == {"column", "suggestion", "operation", "signal"}
            if item["operation"] is not None:
                assert item["operation"] in schemas.OperationType._value2member_map_


@pytest.fixture
def project_id(client, sample_csv):
    """Upload the sample CSV and return the created project's ID."""
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": "Recommendations", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


class TestProfileSuggestionsEndpoint:
    def test_returns_suggestions_for_project(self, client, project_id):
        response = client.get(f"/projects/{project_id}/profile/suggestions")
        assert response.status_code == 200, response.text
        body = response.json()
        assert "suggestions" in body
        # sample_csv has repeating low-cardinality columns ("name", "city") and numeric "age"
        signals = {(s["column"], s["operation"], s["signal"]) for s in body["suggestions"]}
        assert ("name", "groupby", "low_cardinality") in signals
        assert ("city", "groupby", "low_cardinality") in signals

    def test_returns_empty_list_for_small_clean_dataset(self, client, tmp_path):
        csv_path = tmp_path / "clean.csv"
        csv_path.write_text("id,score\nid-1,10\nid-2,20\nid-3,30\nid-4,40\n")
        with open(csv_path, "rb") as f:
            upload = client.post(
                "/projects/upload",
                files={"file": ("clean.csv", f, "text/csv")},
                data={"projectName": "Clean", "projectDescription": "fixture"},
            )
        assert upload.status_code == 200, upload.text
        pid = upload.json()["project_id"]

        response = client.get(f"/projects/{pid}/profile/suggestions")
        assert response.status_code == 200, response.text
        assert response.json() == {"suggestions": []}

    def test_unknown_project_returns_404(self, client):
        response = client.get(f"/projects/{uuid.uuid4()}/profile/suggestions")
        assert response.status_code == 404

    def test_requires_auth(self, anon_client, project_id):
        response = anon_client.get(f"/projects/{project_id}/profile/suggestions")
        assert response.status_code == 401
