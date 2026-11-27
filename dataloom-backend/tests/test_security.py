"""Tests for security utilities.

These tests verify that dangerous patterns are correctly BLOCKED
by the security module. The test strings are never evaluated.
"""

import pytest
from fastapi import HTTPException

from app.utils.security import prepare_query_expression, resolve_upload_path, sanitize_filename, validate_query_string


class TestSanitizeFilename:
    def test_strips_path_components(self):
        result = sanitize_filename("../../../etc/passwd")
        assert ".." not in result
        assert "/" not in result

    def test_replaces_unsafe_chars(self):
        result = sanitize_filename("file name (1).csv")
        # Should not contain spaces or parens
        assert " " not in result

    def test_preserves_extension(self):
        result = sanitize_filename("data.csv")
        assert result.endswith(".csv")

    def test_adds_uniqueness(self):
        result1 = sanitize_filename("test.csv")
        result2 = sanitize_filename("test.csv")
        assert result1 != result2


class TestValidateQueryString:
    """Verify that validate_query_string blocks dangerous inputs."""

    def test_safe_query_passes(self):
        result = validate_query_string("age > 25")
        assert result == "age > 25"

    def test_dunder_import_blocked(self):
        with pytest.raises(HTTPException):
            validate_query_string("__import__('something')")

    def test_dunder_builtins_blocked(self):
        with pytest.raises(HTTPException):
            validate_query_string("__builtins__")

    def test_dunder_class_blocked(self):
        with pytest.raises(HTTPException):
            validate_query_string("x.__class__")

    def test_lambda_blocked(self):
        with pytest.raises(HTTPException):
            validate_query_string("lambda x: x")

    def test_arbitrary_dunder_blocked(self):
        with pytest.raises(HTTPException):
            validate_query_string("obj.__globals__")


class TestPrepareQueryExpression:
    """Verify the AST-allowlist validation behind advanced_query."""

    def test_simple_query_passes_through(self):
        assert prepare_query_expression("age > 25", ["age"]) == "age > 25"

    def test_non_identifier_column_is_backticked(self):
        assert prepare_query_expression("unit cost > 5", ["unit cost"]) == "`unit cost` > 5"

    def test_literal_matching_column_name_is_preserved(self):
        result = prepare_query_expression('city == "unit cost"', ["city", "unit cost"])
        assert result == 'city == "unit cost"'

    def test_already_backticked_column_round_trips(self):
        assert prepare_query_expression("`unit cost` > 5", ["unit cost"]) == "`unit cost` > 5"

    def test_unknown_bare_name_is_left_for_pandas(self):
        # A bare name can only resolve to a column in df.query; an unknown one
        # raises there and surfaces as a transformation error, as before.
        assert prepare_query_expression("nope > 1", ["age"]) == "nope > 1"

    def test_empty_query_blocked(self):
        with pytest.raises(HTTPException):
            prepare_query_expression("   ", ["age"])

    def test_at_reference_blocked(self):
        with pytest.raises(HTTPException):
            prepare_query_expression("@pd.read_csv('/etc/passwd')", ["age"])

    def test_function_call_blocked(self):
        with pytest.raises(HTTPException):
            prepare_query_expression("age.isin([30])", ["age"])

    def test_attribute_access_blocked(self):
        with pytest.raises(HTTPException):
            prepare_query_expression("name.str.len() > 3", ["name"])

    def test_subscript_blocked(self):
        with pytest.raises(HTTPException):
            prepare_query_expression("age[0] > 3", ["age"])


class TestResolveUploadPath:
    """Verify that resolve_upload_path confines targets inside upload_dir."""

    @pytest.fixture()
    def upload_dir(self, tmp_path, monkeypatch):
        path = (tmp_path / "uploads").resolve()
        monkeypatch.setattr("app.utils.security.get_settings", lambda: type("S", (), {"upload_dir": str(path)})())
        return path

    def test_valid_filename_resolves_inside_upload_dir(self, upload_dir):
        assert resolve_upload_path("data.csv") == upload_dir / "data.csv"

    def test_nested_snapshot_path_resolves_inside_upload_dir(self, upload_dir):
        assert resolve_upload_path("snapshots/proj/snap.csv") == upload_dir / "snapshots" / "proj" / "snap.csv"

    def test_parent_traversal_blocked(self, upload_dir):
        with pytest.raises(HTTPException) as exc:
            resolve_upload_path("../outside.csv")
        assert exc.value.status_code == 400

    def test_sibling_prefix_traversal_blocked(self, upload_dir):
        with pytest.raises(HTTPException) as exc:
            resolve_upload_path("../uploads_evil/secret.csv")
        assert exc.value.status_code == 400

    @pytest.mark.parametrize("filename", ["", "."])
    def test_upload_dir_itself_blocked(self, upload_dir, filename):
        with pytest.raises(HTTPException) as exc:
            resolve_upload_path(filename)
        assert exc.value.status_code == 400
