"""Tests for the multi-format file registry and format-aware I/O helpers."""

import json

import pandas as pd
import pytest
from fastapi import HTTPException

from app.utils.file_formats import get_format, supported_extensions
from app.utils.pandas_helpers import read_table_safe, save_table_safe


class TestRegistry:
    def test_supported_extensions(self):
        assert set(supported_extensions()) == {".csv", ".tsv", ".json", ".xlsx", ".parquet"}

    def test_get_format_is_case_insensitive(self):
        assert get_format("DATA.CSV").extension == ".csv"

    def test_get_format_unsupported_raises(self):
        with pytest.raises(ValueError, match="Unsupported file format '.txt'"):
            get_format("notes.txt")


class TestRoundTrip:
    """Each format must survive a write → read round-trip via the helpers."""

    @pytest.mark.parametrize("ext", [".csv", ".tsv", ".xlsx", ".parquet"])
    def test_tabular_round_trip(self, ext, tmp_path):
        df = pd.DataFrame({"name": ["Alice", "Bob"], "age": [30, 25]})
        path = tmp_path / f"data{ext}"

        save_table_safe(df, path)
        result = read_table_safe(path)

        pd.testing.assert_frame_equal(result.reset_index(drop=True), df)

    def test_tsv_splits_on_tab_from_fixture(self, tmp_path):
        """Read a hand-authored TSV to prove it splits on tabs, not commas.

        A write→read round-trip can't catch this: if both sides wrongly used a
        comma they'd still agree. Reading content we typed by hand can't be
        fooled — and the comma inside a value confirms it isn't a delimiter.
        """
        path = tmp_path / "data.tsv"
        path.write_text("name\tnote\nAlice\tlives in NYC, USA\n")

        df = read_table_safe(path)

        assert df.columns.tolist() == ["name", "note"]
        assert df.iloc[0]["note"] == "lives in NYC, USA"

    def test_parquet_write_survives_mixed_type_column(self, tmp_path):
        """A mixed-type object column must not crash the parquet writer.

        pyarrow rejects columns holding e.g. both ints and strings; the writer
        falls back to stringifying object columns so export never 500s.
        """
        df = pd.DataFrame({"id": [1, 2, 3], "val": [10, "oops", 3.5]})
        path = tmp_path / "mixed.parquet"

        save_table_safe(df, path)  # must not raise
        result = read_table_safe(path)

        assert result["val"].tolist() == ["10", "oops", "3.5"]
        assert result["id"].tolist() == [1, 2, 3]

    def test_parquet_preserves_dtypes(self, tmp_path):
        """Parquet is binary and should keep integer dtype (unlike CSV)."""
        df = pd.DataFrame({"age": [30, 25]})
        path = tmp_path / "data.parquet"

        save_table_safe(df, path)
        result = read_table_safe(path)

        assert result["age"].dtype == df["age"].dtype


class TestJson:
    def test_flat_records(self, tmp_path):
        path = tmp_path / "data.json"
        path.write_text(json.dumps([{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]))

        df = read_table_safe(path)

        assert df.columns.tolist() == ["name", "age"]
        assert df.iloc[0]["name"] == "Alice"

    def test_single_object_is_treated_as_one_record(self, tmp_path):
        path = tmp_path / "data.json"
        path.write_text(json.dumps({"name": "Alice", "age": 30}))

        df = read_table_safe(path)

        assert len(df) == 1

    def test_one_level_nesting_is_flattened(self, tmp_path):
        path = tmp_path / "data.json"
        path.write_text(json.dumps([{"name": "Alice", "address": {"city": "NYC", "zip": "10001"}}]))

        df = read_table_safe(path)

        assert "address.city" in df.columns
        assert df.iloc[0]["address.city"] == "NYC"

    def test_arrays_become_json_strings(self, tmp_path):
        path = tmp_path / "data.json"
        path.write_text(json.dumps([{"name": "Alice", "tags": ["a", "b"]}]))

        df = read_table_safe(path)

        assert df.iloc[0]["tags"] == '["a", "b"]'

    def test_deep_nesting_rejected_as_400(self, tmp_path):
        path = tmp_path / "data.json"
        path.write_text(json.dumps([{"name": "Alice", "address": {"geo": {"lat": 1, "lng": 2}}}]))

        with pytest.raises(HTTPException) as exc:
            read_table_safe(path)
        assert exc.value.status_code == 400
        assert "only one level of nesting" in exc.value.detail

    def test_non_object_records_rejected_as_400(self, tmp_path):
        path = tmp_path / "data.json"
        path.write_text(json.dumps([1, 2, 3]))

        with pytest.raises(HTTPException) as exc:
            read_table_safe(path)
        assert exc.value.status_code == 400


class TestHelperErrors:
    def test_missing_file_is_404(self, tmp_path):
        with pytest.raises(HTTPException) as exc:
            read_table_safe(tmp_path / "nope.csv")
        assert exc.value.status_code == 404
