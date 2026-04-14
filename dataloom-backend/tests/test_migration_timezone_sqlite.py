"""Regression tests for SQLite timezone normalization migration helpers."""

import sqlite3
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


def _load_migration_module():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "c4d5e6f7a8b9_make_project_datetimes_timezone_aware.py"
    )
    spec = spec_from_file_location("migration_c4d5e6f7a8b9", migration_path)
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_sqlite_strip_utc_offset_handles_trailing_z(monkeypatch):
    """Downgrade helper should remove trailing Z timezone designators."""
    migration = _load_migration_module()
    conn = sqlite3.connect(":memory:")
    try:
        conn.execute("CREATE TABLE projects (last_modified TEXT)")
        conn.executemany(
            "INSERT INTO projects (last_modified) VALUES (?)",
            [
                ("2026-03-19 12:30:45Z",),
                ("2026-03-19 12:30:45+00:00",),
                ("2026-03-19 12:30:45-05:30",),
                ("2026-03-19 12:30:45",),
                (None,),
            ],
        )
        conn.commit()

        def _execute(statement):
            conn.execute(str(statement))
            conn.commit()

        monkeypatch.setattr(migration.op, "execute", _execute)

        migration._sqlite_strip_utc_offset("last_modified")

        actual = [row[0] for row in conn.execute("SELECT last_modified FROM projects ORDER BY rowid").fetchall()]
        assert actual == [
            "2026-03-19 12:30:45",
            "2026-03-19 12:30:45",
            "2026-03-19 12:30:45",
            "2026-03-19 12:30:45",
            None,
        ]
    finally:
        conn.close()
