"""Tests for the process-local DataFrame read cache.

Unit tests exercise ``DataFrameCache`` directly with a counting loader so the
fingerprint, eviction, and invalidation rules can be pinned without going
through the file-format layer. Integration tests exercise the same behaviour
through the real HTTP endpoints, proving the wiring into ``read_table_safe``
and ``save_table_safe`` actually engages the cache end to end.
"""

import os
from collections.abc import Callable
from pathlib import Path

import pandas as pd
import pytest

from app.config import get_settings
from app.utils import df_cache, pandas_helpers
from app.utils.df_cache import DataFrameCache


def _counting_loader(calls: list) -> Callable[[str | Path], pd.DataFrame]:
    def loader(path):
        calls.append(path)
        return pd.read_csv(path)

    return loader


class TestDataFrameCache:
    def test_unchanged_file_is_a_hit_on_second_read(self, tmp_path):
        path = tmp_path / "a.csv"
        path.write_text("x\n1\n")
        cache = DataFrameCache(max_bytes=10**9, max_entries=10)
        calls = []
        loader = _counting_loader(calls)

        cache.get_or_load(path, loader)
        cache.get_or_load(path, loader)

        assert len(calls) == 1
        assert cache.hits == 1
        assert cache.misses == 1

    def test_mutating_returned_frame_does_not_affect_next_read(self, tmp_path):
        path = tmp_path / "a.csv"
        path.write_text("x\n1\n")
        cache = DataFrameCache(max_bytes=10**9, max_entries=10)
        loader = _counting_loader([])

        first = cache.get_or_load(path, loader)
        first.loc[0, "x"] = 999

        second = cache.get_or_load(path, loader)

        assert second["x"].tolist() == [1]

    def test_different_size_rewrite_is_a_miss_with_new_data(self, tmp_path):
        path = tmp_path / "a.csv"
        path.write_text("x\n1\n")
        cache = DataFrameCache(max_bytes=10**9, max_entries=10)
        calls = []
        loader = _counting_loader(calls)

        cache.get_or_load(path, loader)
        path.write_text("x\n1\n2\n3\n")
        df = cache.get_or_load(path, loader)

        assert len(calls) == 2
        assert df["x"].tolist() == [1, 2, 3]

    def test_same_size_rewrite_in_one_tick_is_stale_until_invalidated(self, tmp_path):
        """Documents the known hazard: mtime+size alone cannot see a same-tick,
        same-length rewrite (e.g. a cell edit "3" -> "4"). This is exactly why
        ``save_table_safe`` invalidates explicitly rather than relying on the
        fingerprint alone.
        """
        path = tmp_path / "a.csv"
        path.write_text("x\n1\n")
        cache = DataFrameCache(max_bytes=10**9, max_entries=10)
        calls = []
        loader = _counting_loader(calls)

        cache.get_or_load(path, loader)

        st = os.stat(path)
        path.write_text("x\n2\n")  # same byte length
        os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns))  # pin the mtime back

        stale = cache.get_or_load(path, loader)
        assert stale["x"].tolist() == [1]
        assert len(calls) == 1

        cache.invalidate(path)
        fresh = cache.get_or_load(path, loader)
        assert fresh["x"].tolist() == [2]
        assert len(calls) == 2

    def test_invalidate_during_load_prevents_store(self, tmp_path):
        path = tmp_path / "a.csv"
        path.write_text("x\n1\n")
        cache = DataFrameCache(max_bytes=10**9, max_entries=10)
        calls = []

        def loader(p):
            calls.append(p)
            df = pd.read_csv(p)
            cache.invalidate(p)
            return df

        cache.get_or_load(path, loader)
        cache.get_or_load(path, loader)

        assert len(calls) == 2
        assert cache.hits == 0

    def test_loader_exception_is_not_cached(self, tmp_path):
        path = tmp_path / "a.csv"
        path.write_text("x\n1\n")
        cache = DataFrameCache(max_bytes=10**9, max_entries=10)
        calls = []

        def flaky_loader(p):
            calls.append(p)
            if len(calls) == 1:
                raise ValueError("boom")
            return pd.read_csv(p)

        with pytest.raises(ValueError):
            cache.get_or_load(path, flaky_loader)

        df = cache.get_or_load(path, flaky_loader)

        assert len(calls) == 2
        assert df["x"].tolist() == [1]

    def test_missing_path_raises_without_calling_loader(self, tmp_path):
        path = tmp_path / "missing.csv"
        cache = DataFrameCache(max_bytes=10**9, max_entries=10)
        calls = []
        loader = _counting_loader(calls)

        with pytest.raises(FileNotFoundError):
            cache.get_or_load(path, loader)

        assert calls == []

    def test_lru_eviction_by_entry_count(self, tmp_path):
        cache = DataFrameCache(max_bytes=10**9, max_entries=2)
        paths = []
        for i in range(3):
            p = tmp_path / f"f{i}.csv"
            p.write_text(f"x\n{i}\n")
            paths.append(p)

        warm_loader = _counting_loader([])
        for p in paths:
            cache.get_or_load(p, warm_loader)

        calls = []
        loader = _counting_loader(calls)

        # The least recently used file (index 0) was evicted to fit the cap.
        cache.get_or_load(paths[0], loader)
        assert len(calls) == 1

        # The most recently used file (index 2) is still resident.
        cache.get_or_load(paths[2], loader)
        assert len(calls) == 1

    def test_oversized_frame_is_returned_but_not_stored(self, tmp_path):
        path = tmp_path / "big.csv"
        path.write_text("x\n1\n2\n3\n")
        cache = DataFrameCache(max_bytes=1, max_entries=10)
        calls = []
        loader = _counting_loader(calls)

        df = cache.get_or_load(path, loader)
        assert df["x"].tolist() == [1, 2, 3]

        cache.get_or_load(path, loader)
        assert len(calls) == 2  # never stored, so every read misses

    def test_str_and_path_of_same_file_share_one_entry(self, tmp_path):
        path = tmp_path / "a.csv"
        path.write_text("x\n1\n")
        cache = DataFrameCache(max_bytes=10**9, max_entries=10)
        calls = []
        loader = _counting_loader(calls)

        cache.get_or_load(str(path), loader)
        cache.get_or_load(path, loader)

        assert len(calls) == 1
        assert cache.hits == 1


def _upload_csv(client, content: bytes, name: str = "data.csv", project_name: str = "Cache Test") -> str:
    response = client.post(
        "/projects/upload",
        files={"file": (name, content, "text/csv")},
        data={"projectName": project_name, "projectDescription": "df_cache test"},
    )
    assert response.status_code == 200
    return response.json()["project_id"]


class TestDataFrameCacheIntegration:
    def test_repeated_reads_of_working_copy_do_not_reparse(self, client, monkeypatch):
        """The upload's own read and the working copy's first read are each a
        miss (different files: original vs. `_copy`), but every read after
        that of the unchanged working copy — the GET and both profiling
        endpoints — must be a cache hit.
        """
        calls = []
        original = pandas_helpers._read_and_infer

        def counting(path):
            calls.append(path)
            return original(path)

        monkeypatch.setattr(pandas_helpers, "_read_and_infer", counting)

        project_id = _upload_csv(client, b"name,age\nAlice,30\nBob,25\n")

        get_resp = client.get(f"/projects/get/{project_id}")
        assert get_resp.status_code == 200
        after_first_get = len(calls)

        summary_resp = client.get(f"/projects/{project_id}/profile/summary")
        assert summary_resp.status_code == 200
        columns_resp = client.get(f"/projects/{project_id}/profile/columns")
        assert columns_resp.status_code == 200

        assert len(calls) == after_first_get

    def test_non_preview_transform_then_get_returns_transformed_data(self, client):
        project_id = _upload_csv(client, b"name,age\nAlice,30\nBob,25\n")

        transform_resp = client.post(
            f"/projects/{project_id}/transform",
            params={"preview": False},
            json={"operation_type": "delRow", "row_params": {"index": 0}},
        )
        assert transform_resp.status_code == 200

        get_resp = client.get(f"/projects/get/{project_id}")
        assert get_resp.status_code == 200
        body = get_resp.json()
        assert body["total_rows"] == 1
        assert body["rows"] == [["Bob", 25]]

    def test_same_length_cell_edit_is_visible_on_next_read(self, client):
        project_id = _upload_csv(client, b"name,age\nAlice,3\nBob,25\n")

        # Warm the cache so save_table_safe's invalidation is actually exercised.
        assert client.get(f"/projects/get/{project_id}").json()["rows"][0] == ["Alice", 3]

        transform_resp = client.post(
            f"/projects/{project_id}/transform",
            params={"preview": False},
            json={
                "operation_type": "changeCellValue",
                "change_cell_value": {"row_index": 0, "col_index": 2, "fill_value": 4},
            },
        )
        assert transform_resp.status_code == 200

        get_resp = client.get(f"/projects/get/{project_id}")
        assert get_resp.json()["rows"][0] == ["Alice", 4]

    def test_disabled_cache_reparses_every_request(self, client, monkeypatch):
        calls = []
        original = pandas_helpers._read_and_infer

        def counting(path):
            calls.append(path)
            return original(path)

        monkeypatch.setattr(pandas_helpers, "_read_and_infer", counting)
        monkeypatch.setenv("DF_CACHE_ENABLED", "false")
        get_settings.cache_clear()
        df_cache.clear()

        try:
            project_id = _upload_csv(client, b"name,age\nAlice,30\nBob,25\n")
            after_upload = len(calls)

            client.get(f"/projects/get/{project_id}")
            client.get(f"/projects/get/{project_id}")

            assert len(calls) == after_upload + 2
        finally:
            monkeypatch.undo()
            get_settings.cache_clear()
            df_cache.clear()
