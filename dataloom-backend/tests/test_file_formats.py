"""Tests for the multi-format file registry and format-aware I/O helpers."""

import json

import pandas as pd
import pytest
from fastapi import HTTPException

from app.utils.file_formats import TableWriteOptions, get_format, supported_extensions
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

    def test_csv_write_uses_delimited_options(self, tmp_path):
        df = pd.DataFrame({"name": ["Alice"], "city": ["Málaga"]})
        path = tmp_path / "data.csv"

        save_table_safe(
            df,
            path,
            TableWriteOptions(delimiter="pipe", include_header=False, encoding="latin-1"),
        )

        assert path.read_bytes() == "Alice|Málaga\n".encode("latin-1")

    def test_tsv_write_defaults_to_tab_with_options(self, tmp_path):
        df = pd.DataFrame({"name": ["Alice"], "note": ["lives in NYC, USA"]})
        path = tmp_path / "data.tsv"

        save_table_safe(df, path, TableWriteOptions(include_header=False))

        assert path.read_text() == "Alice\tlives in NYC, USA\n"

    def test_invalid_delimited_options_are_400(self, tmp_path):
        df = pd.DataFrame({"name": ["Alice"]})
        path = tmp_path / "data.csv"

        with pytest.raises(HTTPException) as exc:
            save_table_safe(df, path, TableWriteOptions(delimiter="colon"))

        assert exc.value.status_code == 400
        assert "Unsupported delimiter" in exc.value.detail

    def test_delimited_encoding_errors_are_400(self, tmp_path):
        df = pd.DataFrame({"name": ["Málaga"]})
        path = tmp_path / "data.csv"

        with pytest.raises(HTTPException) as exc:
            save_table_safe(df, path, TableWriteOptions(encoding="ascii"))

        assert exc.value.status_code == 400
        assert "ascii" in exc.value.detail

    def test_non_delimited_writers_ignore_options(self, tmp_path):
        df = pd.DataFrame({"name": ["Alice"]})
        path = tmp_path / "data.json"

        save_table_safe(df, path, TableWriteOptions(delimiter="colon", include_header=False, encoding="utf-16"))

        assert json.loads(path.read_text()) == [{"name": "Alice"}]

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

    def test_read_table_safe_infers_datetime_column(self, tmp_path):
        path = tmp_path / "dates.csv"
        path.write_text("created_at,value\n2024-01-01,10\n2024-02-01,20\n2024-03-01,30\n")

        result = read_table_safe(path)

        assert pd.api.types.is_datetime64_any_dtype(result["created_at"])
        assert pd.api.types.is_integer_dtype(result["value"])
        assert result["created_at"].tolist() == [
            pd.Timestamp("2024-01-01"),
            pd.Timestamp("2024-02-01"),
            pd.Timestamp("2024-03-01"),
        ]

    def test_read_table_safe_does_not_infer_string_years_as_datetime(
        self,
        tmp_path,
    ):
        # JSON preserves these values as strings, unlike CSV, which may infer
        # an integer dtype before datetime inference runs.
        path = tmp_path / "years.json"
        path.write_text(
            json.dumps(
                [
                    {"grad_year": "2024"},
                    {"grad_year": "2025"},
                    {"grad_year": "2023"},
                    {"grad_year": "2022"},
                ]
            )
        )

        result = read_table_safe(path)

        assert not pd.api.types.is_datetime64_any_dtype(result["grad_year"])
        assert result["grad_year"].tolist() == [
            "2024",
            "2025",
            "2023",
            "2022",
        ]


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

    def test_raw_utf8_read_is_locale_independent(self, tmp_path, monkeypatch):
        """A JSON upload with raw UTF-8 bytes must decode correctly anywhere.

        Most tools emit JSON as raw UTF-8 (ensure_ascii=False), but ``open()``
        without an explicit encoding uses the platform default codec, so the
        same file decodes to mojibake (or raises UnicodeDecodeError) on non-UTF-8
        locales: Western Windows (cp1252), or an ASCII C/POSIX locale in slim
        containers. This can't reproduce on the maintainers' UTF-8 dev boxes, so
        we simulate the platform default by forcing cp1252 whenever the reader
        opens the file in text mode without asking for an encoding.
        """
        import app.utils.file_formats as file_formats

        real_open = open

        def platform_default_open(file, mode="r", *args, **kwargs):
            if "b" not in mode and "encoding" not in kwargs and len(args) < 2:
                kwargs["encoding"] = "cp1252"
            return real_open(file, mode, *args, **kwargs)

        monkeypatch.setattr(file_formats, "open", platform_default_open, raising=False)

        path = tmp_path / "data.json"
        path.write_bytes(json.dumps([{"city": "München", "note": "café"}], ensure_ascii=False).encode("utf-8"))

        df = read_table_safe(path)

        assert df.iloc[0]["city"] == "München"
        assert df.iloc[0]["note"] == "café"


class TestHelperErrors:
    def test_missing_file_is_404(self, tmp_path):
        with pytest.raises(HTTPException) as exc:
            read_table_safe(tmp_path / "nope.csv")
        assert exc.value.status_code == 404
