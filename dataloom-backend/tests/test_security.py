"""Tests for security utilities.

These tests verify that dangerous patterns are correctly BLOCKED
by the security module. The test strings are never evaluated.
"""

import pytest
from fastapi import HTTPException

from app.utils.security import (
    prepare_formula_expression,
    prepare_query_expression,
    sanitize_filename,
    validate_query_string,
)


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

    def test_giant_constant_power_blocked(self):
        # 10 ** 10 ** 8 asks pandas to build a hundred-million-digit integer
        # and stalls the worker; the validator must reject it, not evaluate it.
        with pytest.raises(HTTPException) as exc_info:
            prepare_query_expression("x > 10 ** 10 ** 8", ["x"])
        assert "too large" in exc_info.value.detail

    def test_power_exponent_above_limit_blocked(self):
        with pytest.raises(HTTPException):
            prepare_query_expression("x > 10 ** 1001", ["x"])

    def test_nested_constant_power_result_blocked(self):
        # Each exponent is within the limit, but the result has ~1M digits.
        with pytest.raises(HTTPException):
            prepare_query_expression("x > (10 ** 999) ** 1000", ["x"])

    def test_ordinary_powers_still_allowed(self):
        assert prepare_query_expression("x > 2 ** 70", ["x"]) == "x > 2 ** 70"
        assert prepare_query_expression("x > 10 ** 1000", ["x"]) == "x > 10 ** 1000"

    def test_column_driven_power_is_not_statically_bounded(self):
        # 10 ** x depends on the data, so the validator cannot bound it;
        # only constant powers are rejected.
        assert prepare_query_expression("x > 10 ** y", ["x", "y"]) == "x > 10 ** y"

    def test_floordiv_exponent_blocked(self):
        # 100000000 // 1 folds to 100000000, so the exponent check must catch it.
        with pytest.raises(HTTPException):
            prepare_query_expression("x > 10 ** (100000000 // 1)", ["x"])

    def test_mod_exponent_blocked(self):
        with pytest.raises(HTTPException):
            prepare_query_expression("x > 10 ** (100000001 % 200000000)", ["x"])

    def test_nested_power_with_floordiv_exponent_blocked(self):
        with pytest.raises(HTTPException):
            prepare_query_expression("x > (10 ** (100000000 // 1)) ** 2", ["x"])

    def test_small_floordiv_exponent_allowed(self):
        assert prepare_query_expression("x > 10 ** (100 // 2)", ["x"]) == "x > 10 ** (100 // 2)"

    def test_negative_exponent_does_not_crash_validation(self):
        # A negative exponent yields a float, never a giant int: validation
        # must not crash folding it, and the harmless expression passes.
        assert prepare_query_expression("x > 10 ** ((2 ** -1) ** 2)", ["x"]) == "x > 10 ** ((2 ** -1) ** 2)"
        assert prepare_query_expression("x > 2 ** -1", ["x"]) == "x > 2 ** -1"

    def test_large_negative_exponent_is_allowed(self):
        # Negative exponents only produce floats, so even a large one is
        # harmless — the old code rejected 2 ** -2000 as "too large".
        assert prepare_query_expression("x > 2 ** -2000", ["x"]) == "x > 2 ** -2000"

    def test_bool_operand_exponent_blocked(self):
        # True folds to 1, so this is 10 ** 100000000 with the hang intact.
        with pytest.raises(HTTPException):
            prepare_query_expression("x > 10 ** (True * 100000000)", ["x"])

    def test_small_bool_operand_exponent_allowed(self):
        # The same shape with a small value folds exactly and stays allowed.
        assert prepare_query_expression("x > 10 ** (True * 5)", ["x"]) == "x > 10 ** (True * 5)"

    def test_boolop_exponent_blocked(self):
        # `and`/`or` fold to their selected operand, so both are 10 ** 100000000.
        with pytest.raises(HTTPException):
            prepare_query_expression("x > 10 ** (100000000 and 100000000)", ["x"])
        with pytest.raises(HTTPException):
            prepare_query_expression("x > 10 ** (100000000 or 1)", ["x"])

    def test_bitwise_exponent_blocked(self):
        # Bitwise ops and `~` are query-only, but the same fail-open applies.
        with pytest.raises(HTTPException):
            prepare_query_expression("x > 10 ** (100000000 | 0)", ["x"])
        with pytest.raises(HTTPException):
            prepare_query_expression("x > 10 ** (~-100000001)", ["x"])

    def test_unfoldable_constant_base_blocked(self):
        # The exponent is in range, but the base cannot be bounded either:
        # (True * 100000000) ** 999 would build an ~80M-digit integer.
        with pytest.raises(HTTPException):
            prepare_query_expression("x > (True * 100000000) ** 999", ["x"])
        with pytest.raises(HTTPException):
            prepare_query_expression("x > (100000000 | 0) ** 999", ["x"])

    def test_column_driven_boolop_exponent_allowed(self):
        # A Name anywhere in the exponent makes it column-driven, so the
        # validator still leaves it to evaluation.
        assert prepare_query_expression("x > 10 ** (y and 5)", ["x", "y"]) == "x > 10 ** (y and 5)"

    def test_fractional_exponent_allowed(self):
        # A float exponent yields a float, never a giant int.
        assert prepare_query_expression("x > 10 ** (7 / 2)", ["x"]) == "x > 10 ** (7 / 2)"

    def test_zero_to_negative_power_does_not_crash_validation(self):
        assert prepare_query_expression("x > 10 ** (0 ** -1)", ["x"]) == "x > 10 ** (0 ** -1)"

    def test_floordiv_by_zero_in_exponent_does_not_crash_validation(self):
        assert prepare_query_expression("x > 10 ** (1 // 0)", ["x"]) == "x > 10 ** (1 // 0)"

    def test_string_operand_under_unary_minus_does_not_crash_validation(self):
        # `-\"a\"` used to raise an uncaught TypeError inside the constant
        # folder, surfacing as a 500. A string operand can never build a
        # giant int, so validation passes it through and evaluation rejects
        # it with a 400 instead.
        assert prepare_query_expression('x > 10 ** -"a"', ["x"]) == 'x > 10 ** -"a"'
        assert prepare_query_expression('x > 10 ** ("a" * 3)', ["x"]) == 'x > 10 ** ("a" * 3)'

    def test_comparison_exponent_allowed(self):
        # A constant comparison folds to 0/1, so it is a small exponent, not
        # an unmodelled one: `2 ** (1 < 2)` is 2, and used to evaluate fine.
        assert prepare_query_expression("x > 2 ** (1 < 2)", ["x"]) == "x > 2 ** (1 < 2)"
        assert prepare_query_expression("x > 2 ** (1 < 2 < 3)", ["x"]) == "x > 2 ** (1 < 2 < 3)"

    def test_not_exponent_allowed(self):
        # pandas evaluates `not` as bitwise inversion, so `not 0` is -1, a
        # negative exponent that yields a float, never a giant int.
        assert prepare_query_expression("x > 10 ** (not 0)", ["x"]) == "x > 10 ** (not 0)"
        assert prepare_query_expression("x > 10 ** (not 2.5)", ["x"]) == "x > 10 ** (not 2.5)"


class TestPrepareFormulaExpressionPowerBounds:
    """The same power guard runs behind add-column formulas."""

    def test_floordiv_exponent_blocked_in_formula(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("10 ** (100000000 // 1)", ["x"])

    def test_negative_exponent_does_not_crash_formula_validation(self):
        assert prepare_formula_expression("10 ** ((2 ** -1) ** 2)", ["x"]) == "10 ** ((2 ** -1) ** 2)"

    def test_large_negative_exponent_allowed_in_formula(self):
        assert prepare_formula_expression("2 ** -2000", ["x"]) == "2 ** -2000"

    def test_bool_and_boolop_exponents_blocked_in_formula(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("10 ** (True * 100000000)", ["x"])
        with pytest.raises(HTTPException):
            prepare_formula_expression("10 ** (100000000 and 100000000)", ["x"])

    def test_unfoldable_constant_base_blocked_in_formula(self):
        with pytest.raises(HTTPException):
            prepare_formula_expression("(True * 100000000) ** 999", ["x"])

    def test_string_operand_under_unary_minus_does_not_crash_formula_validation(self):
        assert prepare_formula_expression('10 ** -"a"', ["x"]) == '10 ** -"a"'

    def test_comparison_exponent_allowed_in_formula(self):
        assert prepare_formula_expression("2 ** (1 < 2)", ["x"]) == "2 ** (1 < 2)"
