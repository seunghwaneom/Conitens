#!/usr/bin/env python3
"""
SQLite/FTS persistence for the .vibe repo intelligence sidecar.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


SCHEMA_VERSION = 1


def load_config(repo_root: str | Path) -> dict[str, Any]:
    config_path = Path(repo_root) / ".vibe" / "config.json"
    return json.loads(config_path.read_text(encoding="utf-8"))


def file_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


class ContextDB:
    def __init__(self, repo_root: str | Path):
        self.repo_root = Path(repo_root)
        self.config = load_config(self.repo_root)
        self.db_path = self.repo_root / self.config["db_path"]
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._fts_enabled: bool | None = None
        self.ensure_schema()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path, timeout=30.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 30000")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def fts_enabled(self) -> bool:
        if self._fts_enabled is None:
            with self.connect() as connection:
                row = connection.execute(
                    "SELECT sql FROM sqlite_master WHERE name = 'fts'"
                ).fetchone()
                self._fts_enabled = bool(row and row["sql"] and "fts5" in row["sql"].lower())
        return self._fts_enabled

    def ensure_schema(self) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS files (
                    path TEXT PRIMARY KEY,
                    mtime REAL NOT NULL,
                    hash TEXT NOT NULL,
                    loc INTEGER NOT NULL,
                    parse_error TEXT,
                    indexed_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS functions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    file TEXT NOT NULL,
                    line INTEGER NOT NULL,
                    params_json TEXT NOT NULL,
                    returns TEXT,
                    jsdoc TEXT,
                    tags_json TEXT NOT NULL,
                    exported_int INTEGER NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS deps (
                    from_file TEXT NOT NULL,
                    to_file TEXT NOT NULL,
                    kind TEXT NOT NULL
                )
                """
            )
            file_columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(files)").fetchall()
            }
            if "parse_error" not in file_columns:
                connection.execute("ALTER TABLE files ADD COLUMN parse_error TEXT")
            if "indexed_at" not in file_columns:
                connection.execute(
                    "ALTER TABLE files ADD COLUMN indexed_at TEXT NOT NULL DEFAULT ''"
                )
            try:
                connection.execute(
                    """
                    CREATE VIRTUAL TABLE IF NOT EXISTS fts
                    USING fts5(name, file, jsdoc, tags, free_text)
                    """
                )
                self._fts_enabled = True
            except sqlite3.OperationalError:
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS fts (
                        name TEXT,
                        file TEXT,
                        jsdoc TEXT,
                        tags TEXT,
                        free_text TEXT
                    )
                    """
                )
                connection.execute(
                    "CREATE INDEX IF NOT EXISTS idx_fts_name_file ON fts (name, file)"
                )
                self._fts_enabled = False

    def upsert_file(
        self,
        *,
        path: str,
        mtime: float,
        hash_value: str,
        loc: int,
        indexed_at: str,
        parse_error: str | None = None,
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO files (path, mtime, hash, loc, parse_error, indexed_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    mtime = excluded.mtime,
                    hash = excluded.hash,
                    loc = excluded.loc,
                    parse_error = excluded.parse_error,
                    indexed_at = excluded.indexed_at
                """,
                (path, mtime, hash_value, loc, parse_error, indexed_at),
            )

    def replace_file_rows(
        self,
        *,
        path: str,
        functions: list[dict[str, Any]],
        deps: list[dict[str, Any]],
        fts_rows: list[dict[str, str]],
    ) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM functions WHERE file = ?", (path,))
            connection.execute("DELETE FROM deps WHERE from_file = ?", (path,))
            connection.execute("DELETE FROM fts WHERE file = ?", (path,))
            if functions:
                connection.executemany(
                    """
                    INSERT INTO functions (
                        name, file, line, params_json, returns, jsdoc, tags_json, exported_int
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            item["name"],
                            item["file"],
                            int(item["line"]),
                            json.dumps(item.get("params", []), ensure_ascii=False, sort_keys=True),
                            item.get("returns"),
                            item.get("jsdoc"),
                            json.dumps(item.get("tags", []), ensure_ascii=False, sort_keys=True),
                            int(bool(item.get("exported_int", 0))),
                        )
                        for item in functions
                    ],
                )
            if deps:
                connection.executemany(
                    """
                    INSERT INTO deps (from_file, to_file, kind)
                    VALUES (?, ?, ?)
                    """,
                    [(item["from_file"], item["to_file"], item["kind"]) for item in deps],
                )
            if fts_rows:
                connection.executemany(
                    """
                    INSERT INTO fts (name, file, jsdoc, tags, free_text)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            item.get("name", ""),
                            item["file"],
                            item.get("jsdoc", ""),
                            item.get("tags", ""),
                            item.get("free_text", ""),
                        )
                        for item in fts_rows
                    ],
                )

    def apply_record(self, record: dict[str, Any], *, indexed_at: str) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO files (path, mtime, hash, loc, parse_error, indexed_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    mtime = excluded.mtime,
                    hash = excluded.hash,
                    loc = excluded.loc,
                    parse_error = excluded.parse_error,
                    indexed_at = excluded.indexed_at
                """,
                (
                    record["path"],
                    record["mtime"],
                    record["hash"],
                    record["loc"],
                    record.get("parse_error"),
                    indexed_at,
                ),
            )
            connection.execute("DELETE FROM functions WHERE file = ?", (record["path"],))
            connection.execute("DELETE FROM deps WHERE from_file = ?", (record["path"],))
            connection.execute("DELETE FROM fts WHERE file = ?", (record["path"],))
            for item in record["functions"]:
                connection.execute(
                    """
                    INSERT INTO functions (
                        name, file, line, params_json, returns, jsdoc, tags_json, exported_int
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item["name"],
                        record["path"],
                        int(item["line"]),
                        json.dumps(item.get("params", []), ensure_ascii=False, sort_keys=True),
                        item.get("returns"),
                        item.get("jsdoc"),
                        json.dumps(item.get("tags", []), ensure_ascii=False, sort_keys=True),
                        int(bool(item.get("exported_int", 0))),
                    ),
                )
            for item in record["deps"]:
                connection.execute(
                    "INSERT INTO deps (from_file, to_file, kind) VALUES (?, ?, ?)",
                    (record["path"], item["to_file"], item["kind"]),
                )
            for item in record["fts"]:
                connection.execute(
                    "INSERT INTO fts (name, file, jsdoc, tags, free_text) VALUES (?, ?, ?, ?, ?)",
                    (
                        item.get("name", ""),
                        record["path"],
                        item.get("jsdoc", ""),
                        item.get("tags", ""),
                        item.get("free_text", ""),
                    ),
                )

    def list_recent_files(self, limit: int = 12) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT path, mtime, hash, loc, parse_error, indexed_at
                  FROM files
                 ORDER BY mtime DESC, indexed_at DESC, path ASC
                 LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_files(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute("SELECT * FROM files ORDER BY path ASC").fetchall()
        return [dict(row) for row in rows]

    def list_files(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT path, mtime, hash, loc, parse_error, indexed_at FROM files ORDER BY path ASC"
            ).fetchall()
        return [dict(row) for row in rows]

    def delete_file_rows(self, path: str) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM files WHERE path = ?", (path,))
            connection.execute("DELETE FROM functions WHERE file = ?", (path,))
            connection.execute("DELETE FROM deps WHERE from_file = ? OR to_file = ?", (path, path))
            connection.execute("DELETE FROM fts WHERE file = ?", (path,))

    def file_summary(self, file_path: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            file_row = connection.execute(
                "SELECT path, mtime, hash, loc, parse_error, indexed_at FROM files WHERE path = ?",
                (file_path,),
            ).fetchone()
        if file_row is None:
            return None
        item = dict(file_row)
        item["functions"] = self.list_functions(file_path)
        item["deps"] = [dep for dep in self.list_deps() if dep["from_file"] == file_path]
        return item

    def query_scalar(self, query: str, params: tuple[Any, ...] = ()) -> Any:
        with self.connect() as connection:
            row = connection.execute(query, params).fetchone()
        return row[0] if row is not None else None

    def list_functions(self, file_path: str | None = None) -> list[dict[str, Any]]:
        with self.connect() as connection:
            if file_path is None:
                rows = connection.execute(
                    "SELECT * FROM functions ORDER BY file ASC, line ASC, id ASC"
                ).fetchall()
            else:
                rows = connection.execute(
                    "SELECT * FROM functions WHERE file = ? ORDER BY line ASC, id ASC",
                    (file_path,),
                ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["params_json"] = json.loads(item["params_json"])
            item["tags_json"] = json.loads(item["tags_json"])
            item["exported_int"] = bool(item["exported_int"])
            result.append(item)
        return result

    def list_deps(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM deps ORDER BY from_file ASC, to_file ASC, kind ASC"
            ).fetchall()
        return [dict(row) for row in rows]

    def search_fts(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        with self.connect() as connection:
            if self.fts_enabled():
                rows = connection.execute(
                    "SELECT * FROM fts WHERE fts MATCH ? LIMIT ?",
                    (query, limit),
                ).fetchall()
            else:
                like_query = f"%{query}%"
                rows = connection.execute(
                    """
                    SELECT * FROM fts
                     WHERE name LIKE ? OR file LIKE ? OR jsdoc LIKE ? OR tags LIKE ? OR free_text LIKE ?
                     LIMIT ?
                    """,
                    (like_query, like_query, like_query, like_query, like_query, limit),
                ).fetchall()
        return [dict(row) for row in rows]

    def summarize_hotspots(self, limit: int) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    files.path AS file,
                    files.loc AS loc,
                    COALESCE(function_counts.fn_count, 0) AS fn_count,
                    COALESCE(inbound.dep_count, 0) AS inbound_dep_count
                FROM files
                LEFT JOIN (
                    SELECT file, COUNT(*) AS fn_count
                    FROM functions
                    GROUP BY file
                ) AS function_counts
                  ON function_counts.file = files.path
                LEFT JOIN (
                    SELECT to_file, COUNT(*) AS dep_count
                    FROM deps
                    GROUP BY to_file
                ) AS inbound
                  ON inbound.to_file = files.path
                ORDER BY inbound_dep_count DESC, fn_count DESC, loc DESC, file ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def query_scalar(self, query: str, params: tuple[Any, ...] = ()) -> Any:
        with self.connect() as connection:
            row = connection.execute(query, params).fetchone()
        return row[0] if row else None

    def file_rows(self) -> list[dict[str, Any]]:
        return self.list_files()

    def function_rows(self) -> list[dict[str, Any]]:
        return self.list_functions()

    def dep_rows(self) -> list[dict[str, Any]]:
        return self.list_deps()


ContextDatabase = ContextDB


__all__ = ["ContextDB", "SCHEMA_VERSION", "file_hash", "load_config"]
