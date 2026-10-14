"""Tests for the sampled pre-gates: they skip work only, never change a result."""

import json

import numpy as np
import pandas as pd
import pytest

from app.services import profiling_service, quality_service, visualization_service
from app.services.profiling_service import MISSING_VALUE_SENTINELS, _coerce_sentinels
from app.utils.pandas_helpers import _DATETIME_SAMPLE_SIZE, sample_exceeds_distinct, sample_rules_out_rate


def _coerce_sentinels_by_map(series: pd.Series) -> pd.Series:
    """The per-value implementation _coerce_sentinels replaced, kept as the reference."""
    if profiling_service.map_dtype(series.dtype) != "str":
        return series
    normalized = series.map(lambda v: v.strip().lower() if isinstance(v, str) else v)
    return series.where(~normalized.isin(MISSING_VALUE_SENTINELS), other=None)


def _parses_as_date(values: pd.Series) -> pd.Series:
    return pd.to_datetime(values, errors="coerce", format="mixed").notna()


# ---------------------------------------------------------------------------
# _coerce_sentinels parity
# ---------------------------------------------------------------------------

TEXT_CASES = {
    "plain": ["a", " NA ", "null", "None", "", "-", "x", None, "Unknown", "n/a", "NaN"],
    "nbsp": ["\xa0na\xa0", "n/a\xa0", "\xa0", "value\xa0", "keep"],
    "control_whitespace": ["\x1cnull\x1c", "\x85none", "ok\x85", "\x1c", "\x85-\x85", "real"],
}

OBJECT_ONLY_CASES = {
    "mixed_types": [1, "na", None, 2.5, True, " N/A ", b"na", "keep"],
    "all_none": [None, None, None],
    "no_strings": [1, 2, 3],
}


class TestCoerceSentinelsParity:
    @pytest.mark.parametrize("dtype", ["str", object])
    @pytest.mark.parametrize("values", TEXT_CASES.values(), ids=TEXT_CASES.keys())
    def test_text_values_match_the_per_value_map(self, values, dtype):
        series = pd.Series(values, dtype=dtype)

        pd.testing.assert_series_equal(_coerce_sentinels(series), _coerce_sentinels_by_map(series))

    @pytest.mark.parametrize("values", OBJECT_ONLY_CASES.values(), ids=OBJECT_ONLY_CASES.keys())
    def test_object_columns_match_the_per_value_map(self, values):
        series = pd.Series(values, dtype=object)

        pd.testing.assert_series_equal(_coerce_sentinels(series), _coerce_sentinels_by_map(series))

    def test_default_string_dtype_is_covered(self):
        # pandas 3 infers its default string dtype for text; make sure the
        # parity cases above exercise it and not only object columns.
        assert profiling_service.map_dtype(pd.Series(["a"]).dtype) == "str"
        assert pd.Series(["a"]).dtype != object


# ---------------------------------------------------------------------------
# sample_rules_out_rate / sample_exceeds_distinct
# ---------------------------------------------------------------------------


def _column(rate: float, size: int, arrangement: str) -> pd.Series:
    """A text column where exactly ``rate`` of the values are dates."""
    n_dates = round(size * rate)
    dates = pd.date_range("2020-01-01", periods=n_dates, freq="h").strftime("%Y-%m-%d %H:%M").tolist()
    junk = [f"note {i} about widgets" for i in range(size - n_dates)]
    if arrangement == "dates_first":
        values = dates + junk
    elif arrangement == "junk_first":
        values = junk + dates
    elif arrangement == "interleaved":
        junk_every = size / max(len(junk), 1)
        junk_slots = {int(i * junk_every) for i in range(len(junk))}
        date_iter, junk_iter = iter(dates), iter(junk)
        values = [next(junk_iter) if i in junk_slots else next(date_iter) for i in range(size)]
    else:
        values = dates + junk
        np.random.default_rng(7).shuffle(values)
    return pd.Series(values, dtype="str")


class TestSampleRulesOutRate:
    def test_never_skips_at_or_below_the_sample_size(self):
        free_text = pd.Series([f"word {i}" for i in range(_DATETIME_SAMPLE_SIZE)])

        assert sample_rules_out_rate(free_text, _parses_as_date) is False

    def test_skips_a_large_free_text_column(self):
        free_text = pd.Series([f"word {i} and more" for i in range(5000)])

        assert sample_rules_out_rate(free_text, _parses_as_date) is True

    @pytest.mark.parametrize("arrangement", ["dates_first", "junk_first", "interleaved", "shuffled"])
    @pytest.mark.parametrize("rate", [0.8, 0.85, 0.9, 1.0])
    @pytest.mark.parametrize("size", [_DATETIME_SAMPLE_SIZE + 1, 5000, 20_000])
    def test_never_skips_a_column_at_or_above_the_threshold(self, rate, size, arrangement):
        column = _column(rate, size, arrangement)
        full_rate = _parses_as_date(column).mean()
        assert full_rate >= quality_service.TYPE_PARSE_THRESHOLD

        assert sample_rules_out_rate(column, _parses_as_date) is False

    def test_sample_is_reproducible(self):
        column = _column(0.3, 5000, "shuffled")

        results = {sample_rules_out_rate(column, _parses_as_date) for _ in range(5)}

        assert results == {True}


class TestSampleExceedsDistinct:
    def test_never_decides_at_or_below_the_sample_size(self):
        unique = pd.Series([f"v{i}" for i in range(_DATETIME_SAMPLE_SIZE)])

        assert sample_exceeds_distinct(unique, 25) is False

    def test_proves_a_high_cardinality_column(self):
        unique = pd.Series([f"v{i}" for i in range(5000)])

        assert sample_exceeds_distinct(unique, 25) is True

    @pytest.mark.parametrize("distinct", [1, 10, 25, 26, 40])
    def test_never_true_unless_the_full_column_exceeds_the_limit(self, distinct):
        column = pd.Series([f"cat {i % distinct}" for i in range(5000)] + [None] * 200)

        if sample_exceeds_distinct(column, 25):
            assert column.nunique(dropna=True) > 25
        if distinct <= 25:
            assert sample_exceeds_distinct(column, 25) is False


# ---------------------------------------------------------------------------
# Identical output with the gates on and off
# ---------------------------------------------------------------------------


def _generated_frame(rows: int = 3000) -> pd.DataFrame:
    rng = np.random.default_rng(20260929)
    words = np.array(["lorem", "ipsum", "dolor", "amet", "tempor", "aliqua", "magna", "elit"])
    dates = pd.date_range("2019-01-01", periods=rows, freq="7h")

    free_text = [" ".join(rng.choice(words, size=6)) for _ in range(rows)]
    free_text[5] = "  padded text  "
    free_text[6] = "N/A"

    mostly_numeric = [str(round(float(v), 2)) for v in rng.normal(100, 15, rows)]
    for i in (3, 250, 1999):
        mostly_numeric[i] = f"{i}abc"

    mostly_dates = dates.strftime("%Y-%m-%d").tolist()
    for i in rng.choice(rows, size=int(rows * 0.15), replace=False):
        mostly_dates[i] = f"pending review {i}"

    mixed_format_dates = [d.strftime("%Y-%m-%d") if i % 2 else d.strftime("%B %d, %Y") for i, d in enumerate(dates)]

    categories = rng.choice(["Books", "books ", "Toys", "Garden", "Beauty"], size=rows).tolist()
    categories[10] = " null "

    return pd.DataFrame(
        {
            "free_text": free_text,
            "email": [f"user{i}@example{i % 97}.com" for i in range(rows)],
            "iso_dates": dates.strftime("%Y-%m-%d %H:%M:%S").tolist(),
            "day_first_dates": dates.strftime("%d/%m/%Y").tolist(),
            "mixed_format_dates": mixed_format_dates,
            "mostly_numeric": mostly_numeric,
            "mostly_dates": mostly_dates,
            "category": categories,
            "amount": rng.gamma(2.0, 30.0, rows).round(2),
            "quantity": rng.integers(0, 20, rows),
            "created_at": dates,
        }
    ).astype({c: "str" for c in ("free_text", "email", "iso_dates", "day_first_dates", "category")})


def _all_outputs(df: pd.DataFrame) -> str:
    outputs = {
        "assess_quality": quality_service.assess_quality(df),
        "dataset_summary": profiling_service.dataset_summary(df),
        "all_column_profiles": profiling_service.all_column_profiles(df),
        "suggest_charts": visualization_service.suggest_charts(df),
    }
    return json.dumps(outputs, sort_keys=True, default=str)


class _Recording:
    """Wrap a gate so a test can see what it decided."""

    def __init__(self, gate):
        self.gate = gate
        self.results: list[bool] = []

    def __call__(self, *args, **kwargs):
        result = self.gate(*args, **kwargs)
        self.results.append(result)
        return result


class TestIdenticalOutput:
    def test_gates_and_vectorized_sentinels_change_no_result(self, monkeypatch):
        df = _generated_frame()
        # Mix storage: the gate must behave the same on object and str columns.
        df["mostly_dates"] = df["mostly_dates"].astype(object)
        df["mixed_format_dates"] = df["mixed_format_dates"].astype(object)

        rate_gate = _Recording(sample_rules_out_rate)
        distinct_gate = _Recording(sample_exceeds_distinct)
        monkeypatch.setattr(quality_service, "sample_rules_out_rate", rate_gate)
        monkeypatch.setattr(visualization_service, "sample_exceeds_distinct", distinct_gate)
        after = _all_outputs(df)

        # Both gates must actually have skipped something, or the test proves nothing.
        assert True in rate_gate.results and False in rate_gate.results
        assert True in distinct_gate.results and False in distinct_gate.results

        monkeypatch.setattr(quality_service, "sample_rules_out_rate", lambda *a, **k: False)
        monkeypatch.setattr(visualization_service, "sample_exceeds_distinct", lambda *a, **k: False)
        monkeypatch.setattr(quality_service, "_coerce_sentinels", _coerce_sentinels_by_map)
        monkeypatch.setattr(profiling_service, "_coerce_sentinels", _coerce_sentinels_by_map)
        before = _all_outputs(df)

        assert after == before

    def test_frame_exercises_the_date_issues(self):
        issues = quality_service.assess_quality(_generated_frame())["issues"]
        found = {(i["issue_type"], i["column"], i["severity"]) for i in issues}

        assert ("type_mismatch", "mostly_dates", "high") in found
        assert ("type_mismatch", "iso_dates", "medium") in found
        assert ("type_mismatch", "mostly_numeric", "high") in found
        assert ("inconsistent_format", "mixed_format_dates", "medium") in found
