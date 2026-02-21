"""Tests for security utilities.

These tests verify that dangerous patterns are correctly BLOCKED
by the security module. The test strings are never evaluated.
"""

import pytest
from fastapi import HTTPException
from app.utils.security import sanitize_filename, validate_query_string


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
