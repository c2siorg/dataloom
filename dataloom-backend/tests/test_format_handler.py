"""Tests for the multi-format ingestion and export module."""

import pandas as pd
import pytest

from app.services.format_handler import (
    FormatError,
    detect_format,
    export,
    get_xlsx_sheet_names,
    ingest,
    load_csv,
    load_json,
    load_parquet,
    load_tsv,
    load_xlsx,
)


@pytest.fixture
def sample_df():
    """A small reference DataFrame used across all format tests."""
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie"],
            "age": [30, 25, 35],
            "city": ["New York", "Los Angeles", "Chicago"],
        }
    )


# -- fixtures that write sample files in each format -------------------------


@pytest.fixture
def csv_path(tmp_path, sample_df):
    path = tmp_path / "data.csv"
    sample_df.to_csv(path, index=False)
    return path


@pytest.fixture
def xlsx_path(tmp_path, sample_df):
    path = tmp_path / "data.xlsx"
    sample_df.to_excel(path, index=False, engine="openpyxl")
    return path


@pytest.fixture
def json_path(tmp_path, sample_df):
    path = tmp_path / "data.json"
    sample_df.to_json(path, orient="records", indent=2)
    return path


@pytest.fixture
def parquet_path(tmp_path, sample_df):
    path = tmp_path / "data.parquet"
    sample_df.to_parquet(path, index=False, engine="pyarrow")
    return path


@pytest.fixture
def tsv_path(tmp_path, sample_df):
    path = tmp_path / "data.tsv"
    sample_df.to_csv(path, index=False, sep="\t")
    return path


# -- detect_format -----------------------------------------------------------


class TestDetectFormat:
    def test_csv(self):
        assert detect_format("data.csv") == "csv"

    def test_xlsx(self):
        assert detect_format("report.xlsx") == "xlsx"

    def test_json(self):
        assert detect_format("records.json") == "json"

    def test_parquet(self):
        assert detect_format("table.parquet") == "parquet"

    def test_tsv(self):
        assert detect_format("export.tsv") == "tsv"

    def test_unknown_extension_raises(self):
        with pytest.raises(FormatError, match="Unsupported"):
            detect_format("file.xyz")


# -- individual loaders ------------------------------------------------------


class TestLoadCSV:
    def test_basic(self, csv_path, sample_df):
        result = load_csv(csv_path)
        assert list(result.columns) == list(sample_df.columns)
        assert len(result) == 3

    def test_values(self, csv_path):
        result = load_csv(csv_path)
        assert result.iloc[0]["name"] == "Alice"
        assert result.iloc[1]["age"] == 25


class TestLoadXlsx:
    def test_basic(self, xlsx_path, sample_df):
        result = load_xlsx(xlsx_path)
        assert list(result.columns) == list(sample_df.columns)
        assert len(result) == 3

    def test_sheet_names(self, xlsx_path):
        names = get_xlsx_sheet_names(xlsx_path)
        assert isinstance(names, list)
        assert len(names) >= 1


class TestLoadJson:
    def test_basic(self, json_path, sample_df):
        result = load_json(json_path)
        assert list(result.columns) == list(sample_df.columns)
        assert len(result) == 3


class TestLoadParquet:
    def test_basic(self, parquet_path, sample_df):
        result = load_parquet(parquet_path)
        assert list(result.columns) == list(sample_df.columns)
        assert len(result) == 3

    def test_types_preserved(self, parquet_path):
        result = load_parquet(parquet_path)
        assert pd.api.types.is_integer_dtype(result["age"])


class TestLoadTsv:
    def test_basic(self, tsv_path, sample_df):
        result = load_tsv(tsv_path)
        assert list(result.columns) == list(sample_df.columns)
        assert len(result) == 3


# -- ingest dispatcher -------------------------------------------------------


class TestIngest:
    def test_csv_auto(self, csv_path):
        df = ingest(csv_path)
        assert len(df) == 3

    def test_xlsx_auto(self, xlsx_path):
        df = ingest(xlsx_path)
        assert len(df) == 3

    def test_json_auto(self, json_path):
        df = ingest(json_path)
        assert len(df) == 3

    def test_parquet_auto(self, parquet_path):
        df = ingest(parquet_path)
        assert len(df) == 3

    def test_tsv_auto(self, tsv_path):
        df = ingest(tsv_path)
        assert len(df) == 3

    def test_explicit_format_override(self, tsv_path):
        """TSV file loaded with explicit format instead of auto-detect."""
        df = ingest(tsv_path, format="tsv")
        assert len(df) == 3


# -- export round-trip -------------------------------------------------------


class TestExportRoundTrip:
    """Write -> read for each format and verify data integrity."""

    def test_csv(self, tmp_path, sample_df):
        out = tmp_path / "out.csv"
        export(sample_df, "csv", out)
        result = load_csv(out)
        pd.testing.assert_frame_equal(result, sample_df)

    def test_xlsx(self, tmp_path, sample_df):
        out = tmp_path / "out.xlsx"
        export(sample_df, "xlsx", out)
        result = load_xlsx(out)
        pd.testing.assert_frame_equal(result, sample_df)

    def test_json(self, tmp_path, sample_df):
        out = tmp_path / "out.json"
        export(sample_df, "json", out)
        result = load_json(out)
        pd.testing.assert_frame_equal(result, sample_df)

    def test_parquet(self, tmp_path, sample_df):
        out = tmp_path / "out.parquet"
        export(sample_df, "parquet", out)
        result = load_parquet(out)
        pd.testing.assert_frame_equal(result, sample_df)

    def test_tsv(self, tmp_path, sample_df):
        out = tmp_path / "out.tsv"
        export(sample_df, "tsv", out)
        result = load_tsv(out)
        pd.testing.assert_frame_equal(result, sample_df)

    def test_unsupported_format_raises(self, tmp_path, sample_df):
        with pytest.raises(FormatError, match="No exporter"):
            export(sample_df, "xml", tmp_path / "out.xml")


# -- edge cases --------------------------------------------------------------


class TestEdgeCases:
    def test_empty_dataframe_roundtrip(self, tmp_path):
        empty = pd.DataFrame({"a": pd.Series(dtype="int64"), "b": pd.Series(dtype="str")})
        out = tmp_path / "empty.csv"
        export(empty, "csv", out)
        result = load_csv(out)
        assert len(result) == 0
        assert list(result.columns) == ["a", "b"]

    def test_ingest_nonexistent_file(self, tmp_path):
        with pytest.raises(Exception):
            ingest(tmp_path / "does_not_exist.csv")
