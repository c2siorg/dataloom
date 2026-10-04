import pandas as pd
import pytest
from fastapi import HTTPException

from app.utils import pandas_helpers


def test_save_table_safe_replaces_destination(tmp_path):
    path = tmp_path / "dataset.csv"
    path.write_text("name,age\nAlice,20\n", encoding="utf-8")

    df = pd.DataFrame({"name": ["Bob"], "age": [30]})

    pandas_helpers.save_table_safe(df, path)

    assert path.read_text(encoding="utf-8") == "name,age\nBob,30\n"


def test_save_table_safe_preserves_existing_file_when_writer_fails(tmp_path, monkeypatch):
    path = tmp_path / "dataset.csv"
    original = "name,age\nAlice,20\n"
    path.write_text(original, encoding="utf-8")

    class FailingFormat:
        def write(self, df, destination, options):
            assert destination != path
            destination.write_text("name,age\nPARTIAL", encoding="utf-8")
            raise OSError("simulated serialization failure")

    monkeypatch.setattr(
        pandas_helpers,
        "get_format",
        lambda _: FailingFormat(),
    )

    with pytest.raises(HTTPException, match="Error saving file"):
        pandas_helpers.save_table_safe(
            pd.DataFrame({"name": ["Bob"], "age": [30]}),
            path,
        )

    assert path.read_text(encoding="utf-8") == original


def test_save_table_safe_removes_temp_file_after_failure(tmp_path, monkeypatch):
    path = tmp_path / "dataset.csv"

    class FailingFormat:
        def write(self, df, destination, options):
            destination.write_text("partial", encoding="utf-8")
            raise OSError("simulated serialization failure")

    monkeypatch.setattr(
        pandas_helpers,
        "get_format",
        lambda _: FailingFormat(),
    )

    with pytest.raises(HTTPException, match="Error saving file"):
        pandas_helpers.save_table_safe(
            pd.DataFrame({"name": ["Bob"]}),
            path,
        )

    assert list(tmp_path.glob(f".{path.name}.*{path.suffix}")) == []


def test_save_table_safe_invalidates_cache_after_success(tmp_path, monkeypatch):
    path = tmp_path / "dataset.csv"
    invalidated = []

    monkeypatch.setattr(
        pandas_helpers.df_cache,
        "invalidate",
        lambda target: invalidated.append(target),
    )

    pandas_helpers.save_table_safe(
        pd.DataFrame({"name": ["Bob"]}),
        path,
    )

    assert invalidated == [path]


def test_save_table_safe_does_not_invalidate_cache_on_failure(tmp_path, monkeypatch):
    path = tmp_path / "dataset.csv"
    invalidated = []

    class FailingFormat:
        def write(self, df, destination, options):
            raise OSError("simulated serialization failure")

    monkeypatch.setattr(
        pandas_helpers,
        "get_format",
        lambda _: FailingFormat(),
    )
    monkeypatch.setattr(
        pandas_helpers.df_cache,
        "invalidate",
        lambda target: invalidated.append(target),
    )

    with pytest.raises(HTTPException, match="Error saving file"):
        pandas_helpers.save_table_safe(
            pd.DataFrame({"name": ["Bob"]}),
            path,
        )

    assert invalidated == []


def test_save_table_safe_writer_receives_sibling_temp_file(tmp_path, monkeypatch):
    path = tmp_path / "dataset.csv"
    received = []

    class TrackingFormat:
        def write(self, df, destination, options):
            received.append(destination)
            destination.write_text("name\nBob\n", encoding="utf-8")

    monkeypatch.setattr(
        pandas_helpers,
        "get_format",
        lambda _: TrackingFormat(),
    )

    pandas_helpers.save_table_safe(
        pd.DataFrame({"name": ["Bob"]}),
        path,
    )

    assert len(received) == 1
    assert received[0] != path
    assert received[0].parent == path.parent
    assert received[0].suffix == path.suffix
    assert not received[0].exists()
    assert path.read_text(encoding="utf-8") == "name\nBob\n"
