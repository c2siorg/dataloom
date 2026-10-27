"""HTTP semantics and integration tests for dataset merging endpoints.

Validates the full request/response lifecycle for relational joins across projects
and uploaded files: pre-merge diagnostic analysis, preview vs. commit execution,
transactional write locking, snapshot-backed undo/redo, error handling, and authorization.
"""

from __future__ import annotations

import uuid

import pytest

from app import models
from app.services.auth_service import create_access_token


@pytest.fixture(autouse=True)
def _mock_fsync_on_windows(monkeypatch):
    """Bypass Windows CRT _commit EBADF issue on read-only file handles during tests."""
    monkeypatch.setattr("os.fsync", lambda fd: None)


def _create_project_from_csv(client, name: str, csv_content: str) -> str:
    """Helper to upload a CSV and return the created project's ID."""
    response = client.post(
        "/projects/upload",
        files={"file": (f"{name}.csv", csv_content.encode("utf-8"), "text/csv")},
        data={"projectName": name, "projectDescription": f"Fixture for {name}"},
    )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


@pytest.fixture
def left_customers_project(client):
    """Left dataset: 4 customers with ID, name, and city."""
    csv_data = "cust_id,name,city\n1,Alice,Berlin\n2,Bob,Paris\n3,Charlie,Tokyo\n4,Diana,Madrid\n"
    return _create_project_from_csv(client, "customers", csv_data)


@pytest.fixture
def right_orders_project(client):
    """Right dataset: 5 orders mapped to customer IDs (including duplicate keys and one unmatched)."""
    csv_data = (
        "order_id,cust_id,total,status\n"
        "101,1,250.0,shipped\n"
        "102,1,90.0,pending\n"
        "103,2,140.0,delivered\n"
        "104,3,320.0,shipped\n"
        "105,99,500.0,cancelled\n"
    )
    return _create_project_from_csv(client, "orders", csv_data)


class TestMergeAnalyzeEndpoints:
    """Tests for the pre-join diagnostic endpoints."""

    def test_analyze_project_merge_inner_join_cardinality_and_stats(
        self, client, left_customers_project, right_orders_project
    ):
        """Pre-join analysis must compute match rates, cardinality, and overlap accurately."""
        payload = {
            "target_project_id": right_orders_project,
            "left_on": ["cust_id"],
            "right_on": ["cust_id"],
            "how": "inner",
        }
        response = client.post(f"/projects/{left_customers_project}/merge/analyze", json=payload)
        assert response.status_code == 200, response.text

        data = response.json()
        assert data["left_row_count"] == 4
        assert data["right_row_count"] == 5
        # Customers 1, 2, 3 matched; Customer 4 unmatched
        assert data["matched_left_rows"] == 3
        assert data["unmatched_left_rows"] == 1
        assert data["unmatched_right_rows"] == 1
        assert data["relationship"] == "one-to-many"
        assert data["estimated_output_rows"] == 4  # Alice appears twice, Bob once, Charlie once
        assert data["has_duplicate_left_keys"] is False
        assert data["has_duplicate_right_keys"] is True  # cust_id 1 appears twice in orders

    def test_analyze_project_merge_unmatched_key_samples(self, client, left_customers_project, right_orders_project):
        """Unmatched keys should be surfaced in sample keys for user inspection."""
        payload = {
            "target_project_id": right_orders_project,
            "left_on": ["cust_id"],
            "right_on": ["cust_id"],
            "how": "left",
        }
        response = client.post(f"/projects/{left_customers_project}/merge/analyze", json=payload)
        assert response.status_code == 200, response.text

        data = response.json()
        # Customer 4 (Diana) is unmatched on right
        assert 4 in data["sample_unmatched_left_keys"]
        # Order 105 (cust_id 99) is unmatched on left
        assert 99 in data["sample_unmatched_right_keys"]

    def test_analyze_project_merge_target_project_not_found(self, client, left_customers_project):
        """404 returned when target project id does not exist."""
        payload = {
            "target_project_id": str(uuid.uuid4()),
            "left_on": ["cust_id"],
            "right_on": ["cust_id"],
            "how": "inner",
        }
        response = client.post(f"/projects/{left_customers_project}/merge/analyze", json=payload)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_analyze_project_merge_missing_keys_raises_400(self, client, left_customers_project, right_orders_project):
        """400 returned when specified key columns do not exist in the datasets."""
        payload = {
            "target_project_id": right_orders_project,
            "left_on": ["non_existent_key"],
            "right_on": ["cust_id"],
            "how": "inner",
        }
        response = client.post(f"/projects/{left_customers_project}/merge/analyze", json=payload)
        assert response.status_code == 400
        assert "Left key column(s)" in response.json()["detail"]
        assert "non_existent_key" in response.json()["detail"]

    def test_analyze_project_merge_key_length_mismatch_raises_400(
        self, client, left_customers_project, right_orders_project
    ):
        """400 returned when left_on and right_on key lengths differ."""
        payload = {
            "target_project_id": right_orders_project,
            "left_on": ["cust_id", "name"],
            "right_on": ["cust_id"],
            "how": "inner",
        }
        response = client.post(f"/projects/{left_customers_project}/merge/analyze", json=payload)
        assert response.status_code == 400
        assert "does not match right keys" in response.json()["detail"]

    def test_analyze_file_merge_multipart_upload(self, client, left_customers_project):
        """Analyze merge with a direct multipart uploaded CSV file without creating a project."""
        csv_bytes = b"cust_id,tier,points\n1,gold,1200\n2,silver,450\n5,bronze,50\n"
        response = client.post(
            f"/projects/{left_customers_project}/merge/analyze-file",
            files={"file": ("loyalty.csv", csv_bytes, "text/csv")},
            data={"left_on": "cust_id", "right_on": "cust_id", "how": "inner"},
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["left_row_count"] == 4
        assert data["right_row_count"] == 3
        assert data["matched_left_rows"] == 2  # Customers 1 and 2
        assert data["estimated_output_rows"] == 2


class TestMergeExecuteEndpoints:
    """Tests for executing joins in preview and commit modes."""

    def test_merge_project_preview_does_not_mutate_dataset_or_create_logs(
        self, client, left_customers_project, right_orders_project
    ):
        """Preview mode returns joined response without updating disk or change logs."""
        payload = {
            "target_project_id": right_orders_project,
            "left_on": ["cust_id"],
            "right_on": ["cust_id"],
            "how": "inner",
        }
        # Execute with preview=True
        response = client.post(
            f"/projects/{left_customers_project}/merge",
            params={"preview": "true"},
            json=payload,
        )
        assert response.status_code == 200, response.text
        preview_data = response.json()
        assert preview_data["total_rows"] == 4
        assert "total" in preview_data["columns"]

        # Fetch the project directly: should still have original columns and 4 rows
        proj_get = client.get(f"/projects/get/{left_customers_project}")
        assert proj_get.status_code == 200
        assert "total" not in proj_get.json()["columns"]
        assert proj_get.json()["total_rows"] == 4

        # Verify no change logs were written
        logs = client.get(f"/logs/{left_customers_project}")
        assert logs.status_code == 200
        assert len(logs.json()) == 0

    def test_merge_project_commit_mutates_file_and_logs_operation(
        self, client, left_customers_project, right_orders_project
    ):
        """Non-preview execution updates dataset file and logs mergeDataset action."""
        payload = {
            "target_project_id": right_orders_project,
            "left_on": ["cust_id"],
            "right_on": ["cust_id"],
            "how": "inner",
        }
        response = client.post(
            f"/projects/{left_customers_project}/merge",
            params={"preview": "false"},
            json=payload,
        )
        assert response.status_code == 200, response.text
        committed_data = response.json()
        assert committed_data["total_rows"] == 4
        assert "total" in committed_data["columns"]
        assert "order_id" in committed_data["columns"]

        # Query project again to ensure disk state persisted
        fresh_proj = client.get(f"/projects/get/{left_customers_project}").json()
        assert fresh_proj["total_rows"] == 4
        assert "total" in fresh_proj["columns"]

    def test_merge_project_undo_and_redo_workflow(self, client, left_customers_project, right_orders_project):
        """Committed merge can be undone and redone via undo/redo endpoints."""
        payload = {
            "target_project_id": right_orders_project,
            "left_on": ["cust_id"],
            "right_on": ["cust_id"],
            "how": "left",
        }
        # Commit left merge
        commit_res = client.post(
            f"/projects/{left_customers_project}/merge",
            params={"preview": "false"},
            json=payload,
        )
        assert commit_res.status_code == 200
        assert "total" in commit_res.json()["columns"]

        # Trigger Undo
        undo_res = client.post(f"/projects/{left_customers_project}/undo")
        assert undo_res.status_code == 200, undo_res.text
        # Project should be reverted back to 3 original customer columns
        undone_proj = client.get(f"/projects/get/{left_customers_project}").json()
        assert "total" not in undone_proj["columns"]
        assert undone_proj["columns"] == ["cust_id", "name", "city"]

        # Trigger Redo
        redo_res = client.post(f"/projects/{left_customers_project}/redo")
        assert redo_res.status_code == 200, redo_res.text
        redone_proj = client.get(f"/projects/get/{left_customers_project}").json()
        assert "total" in redone_proj["columns"]

    def test_merge_project_cartesian_explosion_aborts_with_400(self, client):
        """Cross join exceeding max_rows_limit must be safely rejected."""
        # Create two datasets with 100 rows each
        csv_a = "val_a\n" + "\n".join(f"a_{i}" for i in range(100))
        csv_b = "val_b\n" + "\n".join(f"b_{i}" for i in range(100))
        proj_a = _create_project_from_csv(client, "big_a", csv_a)
        proj_b = _create_project_from_csv(client, "big_b", csv_b)

        # Cross join of 100 * 100 = 10,000 rows. Set max_rows_limit=500
        payload = {
            "target_project_id": proj_b,
            "left_on": [],
            "right_on": [],
            "how": "cross",
            "max_rows_limit": 500,
        }
        response = client.post(
            f"/projects/{proj_a}/merge",
            params={"preview": "true"},
            json=payload,
        )
        assert response.status_code == 400
        assert "exceeding the safety limit" in response.json()["detail"]

    def test_merge_file_preview_and_commit(self, client, left_customers_project):
        """Merging directly from an uploaded file supports preview and persistent commit."""
        csv_bytes = b"cust_id,balance\n1,9500\n2,1200\n"

        # 1. Preview
        prev_res = client.post(
            f"/projects/{left_customers_project}/merge/file",
            params={"preview": "true"},
            files={"file": ("balance.csv", csv_bytes, "text/csv")},
            data={"left_on": "cust_id", "right_on": "cust_id", "how": "inner"},
        )
        assert prev_res.status_code == 200
        assert prev_res.json()["total_rows"] == 2
        assert "balance" in prev_res.json()["columns"]

        # Ensure project was untouched
        assert "balance" not in client.get(f"/projects/get/{left_customers_project}").json()["columns"]

        # 2. Commit
        commit_res = client.post(
            f"/projects/{left_customers_project}/merge/file",
            params={"preview": "false"},
            files={"file": ("balance.csv", csv_bytes, "text/csv")},
            data={"left_on": "cust_id", "right_on": "cust_id", "how": "inner"},
        )
        assert commit_res.status_code == 200
        assert "balance" in commit_res.json()["columns"]

        # Ensure disk has the committed state
        after_commit = client.get(f"/projects/get/{left_customers_project}").json()
        assert "balance" in after_commit["columns"]
        assert after_commit["total_rows"] == 2

    def test_project_to_project_merge_undo_redo_immutable_replay(
        self, client, db, left_customers_project, right_orders_project
    ):
        """Replay during undo/redo uses an immutable snapshot unaffected by target mutations."""
        import pandas as pd

        from app.utils.pandas_helpers import save_table_safe

        payload = {
            "target_project_id": right_orders_project,
            "left_on": ["cust_id"],
            "right_on": ["cust_id"],
            "how": "inner",
        }
        # 1. Commit merge
        commit_res = client.post(
            f"/projects/{left_customers_project}/merge",
            params={"preview": "false"},
            json=payload,
        )
        assert commit_res.status_code == 200
        assert "total" in commit_res.json()["columns"]

        # 2. Mutate right_orders_project
        target_proj = (
            db.query(models.Project).filter(models.Project.project_id == uuid.UUID(right_orders_project)).first()
        )
        mutated_df = pd.DataFrame({"cust_id": [999], "completely_new_col": ["corrupted"]})
        save_table_safe(mutated_df, target_proj.file_path)

        # 3. Undo in left_customers_project
        undo_res = client.post(f"/projects/{left_customers_project}/undo")
        assert undo_res.status_code == 200
        undone = client.get(f"/projects/get/{left_customers_project}").json()
        assert "total" not in undone["columns"]

        # 4. Redo in left_customers_project
        redo_res = client.post(f"/projects/{left_customers_project}/redo")
        assert redo_res.status_code == 200, redo_res.text
        redone = client.get(f"/projects/get/{left_customers_project}").json()
        # 'total' must still be present and 'completely_new_col' must NOT appear
        assert "total" in redone["columns"]
        assert "completely_new_col" not in redone["columns"]

    def test_failed_file_merge_leaves_no_orphaned_records(self, client, db, left_customers_project):
        """Failed file merge validation does not leave orphaned files in uploads or records in project_files."""
        from pathlib import Path

        from app.config import get_settings

        settings = get_settings()
        upload_path = Path(settings.upload_dir)
        initial_files = set(upload_path.glob("*orphaned_test*"))
        initial_db_files = (
            db.query(models.ProjectFile)
            .filter(models.ProjectFile.project_id == uuid.UUID(left_customers_project))
            .count()
        )

        csv_bytes = b"wrong_id,val\n1,100\n"
        response = client.post(
            f"/projects/{left_customers_project}/merge/file",
            params={"preview": "false"},
            files={"file": ("orphaned_test.csv", csv_bytes, "text/csv")},
            data={"left_on": "non_existent_key", "right_on": "wrong_id", "how": "inner"},
        )
        assert response.status_code == 400
        assert "Left key column(s) ['non_existent_key'] not found" in response.json()["detail"]

        # Ensure no ProjectFile DB rows were inserted
        final_db_files = (
            db.query(models.ProjectFile)
            .filter(models.ProjectFile.project_id == uuid.UUID(left_customers_project))
            .count()
        )
        assert final_db_files == initial_db_files

        # Ensure no files matching orphaned_test were saved
        final_files = set(upload_path.glob("*orphaned_test*"))
        assert final_files == initial_files


class TestMergeAuthAndSecurity:
    """Security, tenant isolation, and authentication guardrails."""

    def test_unauthenticated_requests_are_rejected(self, anon_client):
        """Anonymous access to merge endpoints must return 401."""
        dummy_id = str(uuid.uuid4())
        res = anon_client.post(f"/projects/{dummy_id}/merge/analyze", json={})
        assert res.status_code == 401

    def test_merge_cross_user_isolation(self, client, db, left_customers_project):
        """Users cannot merge with or analyze datasets belonging to another user."""
        # Create second user and project
        other_user = models.User(email="other@user.com", password_hash="hash")
        db.add(other_user)
        db.commit()
        db.refresh(other_user)

        other_token = create_access_token(other_user.id)
        from fastapi.testclient import TestClient

        from app.main import app

        with TestClient(app) as other_client:
            other_client.headers["Cookie"] = f"access_token={other_token}"
            other_proj_id = _create_project_from_csv(other_client, "secret_data", "key,secret\n1,classified\n")

        # Attempt to analyze other user's project using first client
        payload = {
            "target_project_id": other_proj_id,
            "left_on": ["cust_id"],
            "right_on": ["key"],
            "how": "inner",
        }
        res = client.post(f"/projects/{left_customers_project}/merge/analyze", json=payload)
        # Should return 404 to avoid leaking existence of other user's resource
        assert res.status_code == 404
