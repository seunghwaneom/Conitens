#!/usr/bin/env python3
"""
SQLite-backed loop state repository for Ralph-aware execution.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from ensemble_loop_paths import loop_state_db_path, loop_state_debug_path


SCHEMA_VERSION = 8
ACTIVE_RUN_STATUSES = ("active", "running")
FINDING_CATEGORIES = (
    "discovery",
    "constraint",
    "failed_hypothesis",
    "validation_issue",
    "dependency_note",
)
AUTHORITATIVE_STATE_OWNERS = {
    "run_state": {
        "owner": "sqlite:runs",
        "artifact": None,
        "mode": "authoritative",
    },
    "iteration_state": {
        "owner": "sqlite:iterations",
        "artifact": None,
        "mode": "authoritative",
    },
    "room_event_log": {
        "owner": "sqlite:messages",
        "artifact": ".notes/rooms/*.jsonl",
        "mode": "authoritative_with_legacy_mirror",
    },
    "validator_result": {
        "owner": "sqlite:validator_results",
        "artifact": None,
        "mode": "authoritative",
    },
    "approval_decision": {
        "owner": "sqlite:approval_requests",
        "artifact": None,
        "mode": "authoritative",
    },
    "task_plan_status": {
        "owner": "sqlite:context_task_plans",
        "artifact": ".conitens/context/task_plan.md",
        "mode": "deterministic_projection",
    },
    "immutable_progress_log": {
        "owner": "sqlite:context_progress_entries",
        "artifact": ".conitens/context/progress.md",
        "mode": "append_only_projection",
        "append_only": True,
    },
}


def utc_iso(ts: datetime | None = None) -> str:
    current = ts or datetime.now(timezone.utc)
    return current.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def encode_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def decode_json(value: str | None, default: Any) -> Any:
    if not value:
        return default
    return json.loads(value)


def debug_json_path(workspace: str | Path) -> Path:
    return loop_state_debug_path(workspace)


MIGRATIONS: dict[int, str] = {
    1: """
    CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        status TEXT NOT NULL,
        user_request TEXT NOT NULL,
        current_iteration INTEGER NOT NULL DEFAULT 0,
        stop_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS iterations (
        iteration_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        seq_no INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        objective TEXT NOT NULL,
        summary TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
        UNIQUE (run_id, seq_no)
    );

    CREATE TABLE IF NOT EXISTS validator_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        iteration_id TEXT NOT NULL,
        passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
        issues_json TEXT NOT NULL,
        feedback_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
        FOREIGN KEY (iteration_id) REFERENCES iterations(iteration_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stop_conditions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        iteration_id TEXT,
        kind TEXT NOT NULL,
        value_json TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
        FOREIGN KEY (iteration_id) REFERENCES iterations(iteration_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS escalations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        iteration_id TEXT NOT NULL,
        escalation_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
        FOREIGN KEY (iteration_id) REFERENCES iterations(iteration_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_runs_status_updated_at
        ON runs (status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_iterations_run_seq
        ON iterations (run_id, seq_no ASC);
    CREATE INDEX IF NOT EXISTS idx_validator_results_run_iteration
        ON validator_results (run_id, iteration_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stop_conditions_run_triggered
        ON stop_conditions (run_id, triggered_at ASC);
    CREATE INDEX IF NOT EXISTS idx_escalations_run_created
        ON escalations (run_id, created_at ASC);
    """,
    2: """
    CREATE TABLE IF NOT EXISTS context_task_plans (
        run_id TEXT PRIMARY KEY,
        current_plan TEXT NOT NULL,
        objective TEXT NOT NULL,
        owner TEXT,
        acceptance_json TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS context_findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        iteration_id TEXT,
        category TEXT NOT NULL,
        actor TEXT,
        summary TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
        FOREIGN KEY (iteration_id) REFERENCES iterations(iteration_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS context_progress_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        iteration_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
        FOREIGN KEY (iteration_id) REFERENCES iterations(iteration_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_context_findings_run_created
        ON context_findings (run_id, created_at ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_context_progress_run_created
        ON context_progress_entries (run_id, created_at ASC, id ASC);
    """,
    3: """
    CREATE TABLE IF NOT EXISTS memory_records (
        record_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        salience REAL NOT NULL,
        ttl_days INTEGER,
        approved INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS candidate_policy_patches (
        patch_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        namespace TEXT NOT NULL,
        target_persona_id TEXT NOT NULL,
        patch_path TEXT NOT NULL,
        summary TEXT NOT NULL,
        approved INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_records_namespace
        ON memory_records (agent_id, namespace, kind, approved, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_records_salience
        ON memory_records (namespace, salience DESC, confidence DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_candidate_policy_patches_namespace
        ON candidate_policy_patches (agent_id, namespace, approved, created_at DESC);
    """,
    4: """
    CREATE TABLE IF NOT EXISTS orchestration_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        graph_kind TEXT NOT NULL,
        step_name TEXT NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_orchestration_checkpoints_run_graph
        ON orchestration_checkpoints (run_id, graph_kind, created_at DESC, id DESC);
    """,
    5: """
    ALTER TABLE orchestration_checkpoints ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orchestration_checkpoints ADD COLUMN validator_issues_json TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE orchestration_checkpoints ADD COLUMN approval_pending INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orchestration_checkpoints ADD COLUMN stop_reason TEXT;
    ALTER TABLE orchestration_checkpoints ADD COLUMN loop_cost_metrics_json TEXT NOT NULL DEFAULT '{}';
    """,
    6: """
    CREATE TABLE IF NOT EXISTS orchestration_retry_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        graph_kind TEXT NOT NULL,
        retry_index INTEGER NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orchestration_retry_run_graph
        ON orchestration_retry_decisions (run_id, graph_kind, retry_index ASC, created_at ASC);
    """,
    7: """
    CREATE TABLE IF NOT EXISTS approval_requests (
        request_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        iteration_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_payload_json TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        status TEXT NOT NULL,
        reviewer TEXT,
        reviewer_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_approval_requests_run_status
        ON approval_requests (run_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_iteration
        ON approval_requests (iteration_id, created_at DESC);
    """,
    8: """
    CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        run_id TEXT,
        iteration_id TEXT,
        task_id TEXT,
        room_type TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_by TEXT NOT NULL,
        participants_json TEXT NOT NULL,
        session_boundary_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL,
        FOREIGN KEY (iteration_id) REFERENCES iterations(iteration_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        run_id TEXT,
        iteration_id TEXT,
        sender TEXT NOT NULL,
        sender_kind TEXT NOT NULL,
        message_type TEXT NOT NULL,
        content TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL,
        FOREIGN KEY (iteration_id) REFERENCES iterations(iteration_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tool_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT,
        run_id TEXT,
        iteration_id TEXT,
        actor TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE SET NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL,
        FOREIGN KEY (iteration_id) REFERENCES iterations(iteration_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT,
        iteration_id TEXT,
        room_id TEXT,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE SET NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL,
        FOREIGN KEY (iteration_id) REFERENCES iterations(iteration_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS handoff_packets (
        handoff_id TEXT PRIMARY KEY,
        run_id TEXT,
        iteration_id TEXT,
        from_actor TEXT NOT NULL,
        to_actor TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        packet_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL,
        FOREIGN KEY (iteration_id) REFERENCES iterations(iteration_id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_run_updated
        ON rooms (run_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_room_created
        ON messages (room_id, created_at ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_tool_events_room_created
        ON tool_events (room_id, created_at ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_insights_scope_created
        ON insights (run_id, iteration_id, room_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_handoff_packets_run_updated
        ON handoff_packets (run_id, updated_at DESC);
    """,
}


class LoopStateRepository:
    def __init__(self, workspace: str | Path):
        self.workspace = Path(workspace)
        self.db_path = loop_state_db_path(self.workspace)
        self.ensure_schema()

    def _connect_raw(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA synchronous = NORMAL")
        return connection

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect_raw()
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def ensure_schema(self) -> None:
        with self.connect() as connection:
            version = int(connection.execute("PRAGMA user_version").fetchone()[0])
            for target_version in sorted(MIGRATIONS):
                if target_version <= version:
                    continue
                script = MIGRATIONS[target_version]
                if target_version == 5:
                    columns = {
                        row["name"]
                        for row in connection.execute("PRAGMA table_info(orchestration_checkpoints)").fetchall()
                    }
                    if "retry_count" not in columns:
                        connection.execute("ALTER TABLE orchestration_checkpoints ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0")
                    if "validator_issues_json" not in columns:
                        connection.execute("ALTER TABLE orchestration_checkpoints ADD COLUMN validator_issues_json TEXT NOT NULL DEFAULT '[]'")
                    if "approval_pending" not in columns:
                        connection.execute("ALTER TABLE orchestration_checkpoints ADD COLUMN approval_pending INTEGER NOT NULL DEFAULT 0")
                    if "stop_reason" not in columns:
                        connection.execute("ALTER TABLE orchestration_checkpoints ADD COLUMN stop_reason TEXT")
                    if "loop_cost_metrics_json" not in columns:
                        connection.execute("ALTER TABLE orchestration_checkpoints ADD COLUMN loop_cost_metrics_json TEXT NOT NULL DEFAULT '{}'")
                else:
                    connection.executescript(script)
                connection.execute(f"PRAGMA user_version = {target_version}")

    def schema_version(self) -> int:
        with self.connect() as connection:
            return int(connection.execute("PRAGMA user_version").fetchone()[0])

    def create_run(self, *, run_id: str, user_request: str, status: str = "active") -> dict[str, Any]:
        now = utc_iso()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO runs (
                    run_id, created_at, updated_at, status, user_request, current_iteration, stop_reason
                ) VALUES (?, ?, ?, ?, ?, ?, NULL)
                """,
                (run_id, now, now, status, user_request, 0),
            )
            row = connection.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        return dict(row)

    def get_run(self, run_id: str) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if row is None:
            raise ValueError(f"Unknown run_id: {run_id}")
        return dict(row)

    def list_runs(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute("SELECT * FROM runs ORDER BY created_at ASC, run_id ASC").fetchall()
        return [dict(row) for row in rows]

    def get_latest_active_run(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            placeholders = ", ".join("?" for _ in ACTIVE_RUN_STATUSES)
            row = connection.execute(
                f"""
                SELECT *
                  FROM runs
                 WHERE status IN ({placeholders})
                 ORDER BY updated_at DESC, created_at DESC
                 LIMIT 1
                """,
                ACTIVE_RUN_STATUSES,
            ).fetchone()
        return dict(row) if row is not None else None

    def get_most_recent_run(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT *
                  FROM runs
                 ORDER BY updated_at DESC, created_at DESC
                 LIMIT 1
                """
            ).fetchone()
        return dict(row) if row is not None else None

    def update_run(
        self,
        *,
        run_id: str,
        status: str | None = None,
        stop_reason: str | None = None,
        current_iteration: int | None = None,
    ) -> dict[str, Any]:
        current = self.get_run(run_id)
        now = utc_iso()
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE runs
                   SET status = ?,
                       stop_reason = ?,
                       current_iteration = ?,
                       updated_at = ?
                 WHERE run_id = ?
                """,
                (
                    status if status is not None else current["status"],
                    stop_reason if stop_reason is not None else current["stop_reason"],
                    current_iteration if current_iteration is not None else current["current_iteration"],
                    now,
                    run_id,
                ),
            )
            row = connection.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        return dict(row)

    def create_iteration(
        self,
        *,
        iteration_id: str,
        run_id: str,
        seq_no: int,
        started_at: str,
        status: str,
        objective: str,
        summary: str | None = None,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO iterations (
                    iteration_id, run_id, seq_no, started_at, ended_at, status, objective, summary
                ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
                """,
                (iteration_id, run_id, seq_no, started_at, status, objective, summary),
            )
            connection.execute(
                "UPDATE runs SET current_iteration = ?, updated_at = ?, status = ? WHERE run_id = ?",
                (seq_no, started_at, "active", run_id),
            )
            row = connection.execute("SELECT * FROM iterations WHERE iteration_id = ?", (iteration_id,)).fetchone()
        return dict(row)

    def get_iteration(self, iteration_id: str) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM iterations WHERE iteration_id = ?", (iteration_id,)).fetchone()
        if row is None:
            raise ValueError(f"Unknown iteration_id: {iteration_id}")
        return dict(row)

    def update_iteration(
        self,
        *,
        iteration_id: str,
        status: str,
        ended_at: str,
        summary: str | None = None,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute("SELECT run_id FROM iterations WHERE iteration_id = ?", (iteration_id,)).fetchone()
            if row is None:
                raise ValueError(f"Unknown iteration_id: {iteration_id}")
            run_id = str(row["run_id"])
            connection.execute(
                """
                UPDATE iterations
                   SET status = ?,
                       ended_at = ?,
                       summary = COALESCE(?, summary)
                 WHERE iteration_id = ?
                """,
                (status, ended_at, summary, iteration_id),
            )
            connection.execute("UPDATE runs SET updated_at = ? WHERE run_id = ?", (ended_at, run_id))
            updated = connection.execute("SELECT * FROM iterations WHERE iteration_id = ?", (iteration_id,)).fetchone()
        return dict(updated)

    def list_iterations(self, run_id: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM iterations WHERE run_id = ? ORDER BY seq_no ASC, iteration_id ASC",
                (run_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def record_validator_result(
        self,
        *,
        run_id: str,
        iteration_id: str,
        passed: bool,
        issues: Any,
        feedback_text: str,
    ) -> dict[str, Any]:
        created_at = utc_iso()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO validator_results (
                    run_id, iteration_id, passed, issues_json, feedback_text, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (run_id, iteration_id, int(passed), encode_json(issues), feedback_text, created_at),
            )
            row = connection.execute(
                "SELECT * FROM validator_results WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
        item = dict(row)
        item["passed"] = bool(item["passed"])
        item["issues_json"] = decode_json(item["issues_json"], [])
        return item

    def list_validator_results(self, run_id: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM validator_results
                 WHERE run_id = ?
                 ORDER BY created_at ASC, id ASC
                """,
                (run_id,),
            ).fetchall()
        results = []
        for row in rows:
            item = dict(row)
            item["passed"] = bool(item["passed"])
            item["issues_json"] = decode_json(item["issues_json"], [])
            results.append(item)
        return results

    def list_orchestration_checkpoints(
        self,
        *,
        run_id: str,
        graph_kind: str | None = None,
    ) -> list[dict[str, Any]]:
        query = """
            SELECT * FROM orchestration_checkpoints
             WHERE run_id = ?
        """
        params: list[Any] = [run_id]
        if graph_kind is not None:
            query += " AND graph_kind = ?"
            params.append(graph_kind)
        query += " ORDER BY created_at ASC, id ASC"
        with self.connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._decode_orchestration_checkpoint(dict(row)) for row in rows]

    def record_stop_condition(
        self,
        *,
        run_id: str,
        iteration_id: str | None,
        kind: str,
        value: Any,
    ) -> dict[str, Any]:
        triggered_at = utc_iso()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO stop_conditions (
                    run_id, iteration_id, kind, value_json, triggered_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (run_id, iteration_id, kind, encode_json(value), triggered_at),
            )
            row = connection.execute(
                "SELECT * FROM stop_conditions WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
        item = dict(row)
        item["value_json"] = decode_json(item["value_json"], {})
        return item

    def list_stop_conditions(self, run_id: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM stop_conditions
                 WHERE run_id = ?
                 ORDER BY triggered_at ASC, id ASC
                """,
                (run_id,),
            ).fetchall()
        conditions = []
        for row in rows:
            item = dict(row)
            item["value_json"] = decode_json(item["value_json"], {})
            conditions.append(item)
        return conditions

    def record_escalation(
        self,
        *,
        run_id: str,
        iteration_id: str,
        escalation_type: str,
        reason: str,
    ) -> dict[str, Any]:
        created_at = utc_iso()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO escalations (
                    run_id, iteration_id, escalation_type, reason, created_at, resolved_at
                ) VALUES (?, ?, ?, ?, ?, NULL)
                """,
                (run_id, iteration_id, escalation_type, reason, created_at),
            )
            row = connection.execute(
                "SELECT * FROM escalations WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
        return dict(row)

    def resolve_escalation(self, escalation_id: int) -> dict[str, Any]:
        resolved_at = utc_iso()
        with self.connect() as connection:
            connection.execute(
                "UPDATE escalations SET resolved_at = ? WHERE id = ?",
                (resolved_at, escalation_id),
            )
            row = connection.execute("SELECT * FROM escalations WHERE id = ?", (escalation_id,)).fetchone()
        if row is None:
            raise ValueError(f"Unknown escalation id: {escalation_id}")
        return dict(row)

    def list_escalations(self, run_id: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM escalations
                 WHERE run_id = ?
                 ORDER BY created_at ASC, id ASC
                """,
                (run_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def upsert_task_plan(
        self,
        *,
        run_id: str,
        current_plan: str,
        objective: str,
        steps: list[dict[str, Any]],
        acceptance_criteria: list[str] | None = None,
        owner: str | None = None,
    ) -> dict[str, Any]:
        acceptance_json = encode_json(acceptance_criteria or [])
        steps_json = encode_json(steps)
        with self.connect() as connection:
            existing = connection.execute(
                "SELECT * FROM context_task_plans WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            if existing is not None:
                existing_row = dict(existing)
                unchanged = (
                    existing_row["current_plan"] == current_plan
                    and existing_row["objective"] == objective
                    and existing_row["owner"] == owner
                    and existing_row["acceptance_json"] == acceptance_json
                    and existing_row["steps_json"] == steps_json
                )
                updated_at = existing_row["updated_at"] if unchanged else utc_iso()
            else:
                updated_at = utc_iso()
            connection.execute(
                """
                INSERT INTO context_task_plans (
                    run_id, current_plan, objective, owner, acceptance_json, steps_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(run_id) DO UPDATE SET
                    current_plan = excluded.current_plan,
                    objective = excluded.objective,
                    owner = excluded.owner,
                    acceptance_json = excluded.acceptance_json,
                    steps_json = excluded.steps_json,
                    updated_at = excluded.updated_at
                """,
                (run_id, current_plan, objective, owner, acceptance_json, steps_json, updated_at),
            )
            row = connection.execute(
                "SELECT * FROM context_task_plans WHERE run_id = ?",
                (run_id,),
            ).fetchone()
        return self._decode_task_plan(dict(row))

    def get_task_plan(self, run_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM context_task_plans WHERE run_id = ?",
                (run_id,),
            ).fetchone()
        if row is None:
            return None
        return self._decode_task_plan(dict(row))

    def get_latest_task_plan(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM context_task_plans
                 ORDER BY updated_at DESC, run_id DESC
                 LIMIT 1
                """
            ).fetchone()
        if row is None:
            return None
        return self._decode_task_plan(dict(row))

    def append_finding(
        self,
        *,
        run_id: str,
        iteration_id: str | None,
        category: str,
        actor: str | None,
        summary: str,
        details: str | None = None,
    ) -> dict[str, Any]:
        if category not in FINDING_CATEGORIES:
            raise ValueError(f"Unsupported finding category: {category}")
        created_at = utc_iso()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO context_findings (
                    run_id, iteration_id, category, actor, summary, details, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (run_id, iteration_id, category, actor, summary, details, created_at),
            )
            row = connection.execute(
                "SELECT * FROM context_findings WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
        return dict(row)

    def list_findings(self, run_id: str | None = None) -> list[dict[str, Any]]:
        query = """
            SELECT * FROM context_findings
        """
        params: tuple[Any, ...] = ()
        if run_id is not None:
            query += " WHERE run_id = ?"
            params = (run_id,)
        query += " ORDER BY created_at ASC, id ASC"
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def append_progress_entry(
        self,
        *,
        run_id: str,
        iteration_id: str,
        actor: str,
        summary: str,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        entry_time = created_at or utc_iso()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO context_progress_entries (
                    run_id, iteration_id, actor, summary, created_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (run_id, iteration_id, actor, summary, entry_time),
            )
            row = connection.execute(
                "SELECT * FROM context_progress_entries WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
        return dict(row)

    def list_progress_entries(self, run_id: str | None = None) -> list[dict[str, Any]]:
        query = """
            SELECT * FROM context_progress_entries
        """
        params: tuple[Any, ...] = ()
        if run_id is not None:
            query += " WHERE run_id = ?"
            params = (run_id,)
        query += " ORDER BY created_at ASC, id ASC"
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def load_run_snapshot(self, run_id: str) -> dict[str, Any]:
        run = self.get_run(run_id)
        iterations = self.list_iterations(run_id)
        latest_iteration = iterations[-1] if iterations else None
        return {
            "source_of_truth": self.authoritative_state_owners(),
            "recovery_contract": {
                "source": "sqlite",
                "restore_service": "scripts/ensemble_state_restore.py",
                "debug_writer": "scripts/ensemble_loop_debug.py",
                "chat_history_authoritative": False,
            },
            "run": run,
            "iterations": iterations,
            "latest_iteration": latest_iteration,
            "validator_results": self.list_validator_results(run_id),
            "stop_conditions": self.list_stop_conditions(run_id),
            "escalations": self.list_escalations(run_id),
            "task_plan": self.get_task_plan(run_id),
            "findings": self.list_findings(run_id),
            "progress_entries": self.list_progress_entries(run_id),
            "orchestration_checkpoints": self.list_orchestration_checkpoints(run_id=run_id),
            "retry_decisions": self.list_retry_decisions(run_id=run_id),
            "approval_requests": self.list_approval_requests(run_id=run_id),
            "rooms": self.list_room_records(run_id=run_id),
            "messages": self.list_room_messages(run_id=run_id),
            "tool_events": self.list_tool_events(run_id=run_id),
            "insights": self.list_insights(run_id=run_id),
            "handoff_packets": self.list_handoff_packets(run_id=run_id),
            "memory_records": self.list_memory_records(source_ref=run_id),
            "candidate_policy_patches": self.list_candidate_policy_patches(source_ref=run_id),
        }

    def authoritative_state_owners(self) -> dict[str, Any]:
        return json.loads(json.dumps(AUTHORITATIVE_STATE_OWNERS))

    def append_memory_record(
        self,
        *,
        record_id: str,
        agent_id: str,
        namespace: str,
        kind: str,
        summary: str,
        tags: list[str],
        evidence_refs: list[str],
        confidence: float,
        salience: float,
        ttl_days: int | None,
        approved: bool,
        source_type: str,
        source_ref: str,
        created_at: str,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO memory_records (
                    record_id, agent_id, namespace, kind, summary, tags_json, evidence_refs_json,
                    confidence, salience, ttl_days, approved, source_type, source_ref, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    agent_id,
                    namespace,
                    kind,
                    summary,
                    encode_json(tags),
                    encode_json(evidence_refs),
                    confidence,
                    salience,
                    ttl_days,
                    int(bool(approved)),
                    source_type,
                    source_ref,
                    created_at,
                ),
            )
            row = connection.execute(
                "SELECT * FROM memory_records WHERE record_id = ?",
                (record_id,),
            ).fetchone()
        return self._decode_memory_record(dict(row))

    def list_memory_records(
        self,
        *,
        agent_id: str | None = None,
        namespace: str | None = None,
        kinds: list[str] | None = None,
        approved_only: bool = False,
        source_ref: str | None = None,
    ) -> list[dict[str, Any]]:
        clauses = []
        params: list[Any] = []
        if agent_id is not None:
            clauses.append("agent_id = ?")
            params.append(agent_id)
        if namespace is not None:
            clauses.append("namespace = ?")
            params.append(namespace)
        if kinds:
            clauses.append("kind IN (" + ", ".join("?" for _ in kinds) + ")")
            params.extend(kinds)
        if source_ref is not None:
            clauses.append("source_ref = ?")
            params.append(source_ref)
        if approved_only:
            clauses.append("approved = 1")
        query = "SELECT * FROM memory_records"
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY salience DESC, confidence DESC, created_at DESC"
        with self.connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._decode_memory_record(dict(row)) for row in rows]

    def append_candidate_policy_patch(
        self,
        *,
        patch_id: str,
        agent_id: str,
        namespace: str,
        target_persona_id: str,
        patch_path: str,
        summary: str,
        approved: bool,
        source_type: str,
        source_ref: str,
        created_at: str,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO candidate_policy_patches (
                    patch_id, agent_id, namespace, target_persona_id, patch_path, summary,
                    approved, source_type, source_ref, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    patch_id,
                    agent_id,
                    namespace,
                    target_persona_id,
                    patch_path,
                    summary,
                    int(bool(approved)),
                    source_type,
                    source_ref,
                    created_at,
                ),
            )
            row = connection.execute(
                "SELECT * FROM candidate_policy_patches WHERE patch_id = ?",
                (patch_id,),
            ).fetchone()
        item = dict(row)
        item["approved"] = bool(item["approved"])
        return item

    def list_candidate_policy_patches(
        self,
        *,
        agent_id: str | None = None,
        namespace: str | None = None,
        approved_only: bool = False,
        source_ref: str | None = None,
    ) -> list[dict[str, Any]]:
        clauses = []
        params: list[Any] = []
        if agent_id is not None:
            clauses.append("agent_id = ?")
            params.append(agent_id)
        if namespace is not None:
            clauses.append("namespace = ?")
            params.append(namespace)
        if source_ref is not None:
            clauses.append("source_ref = ?")
            params.append(source_ref)
        if approved_only:
            clauses.append("approved = 1")
        query = "SELECT * FROM candidate_policy_patches"
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC"
        with self.connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["approved"] = bool(item["approved"])
            result.append(item)
        return result

    def append_orchestration_checkpoint(
        self,
        *,
        run_id: str,
        graph_kind: str,
        step_name: str,
        state: dict[str, Any],
        retry_count: int = 0,
        validator_issues: list[Any] | None = None,
        approval_pending: bool = False,
        stop_reason: str | None = None,
        loop_cost_metrics: dict[str, Any] | None = None,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        checkpoint_time = created_at or utc_iso()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO orchestration_checkpoints (
                    run_id, graph_kind, step_name, state_json, retry_count,
                    validator_issues_json, approval_pending, stop_reason, loop_cost_metrics_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    graph_kind,
                    step_name,
                    encode_json(state),
                    retry_count,
                    encode_json(validator_issues or []),
                    int(bool(approval_pending)),
                    stop_reason,
                    encode_json(loop_cost_metrics or {}),
                    checkpoint_time,
                ),
            )
            row = connection.execute(
                "SELECT * FROM orchestration_checkpoints WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
        return self._decode_orchestration_checkpoint(dict(row))

    def get_latest_orchestration_checkpoint(
        self,
        *,
        run_id: str,
        graph_kind: str,
    ) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM orchestration_checkpoints
                 WHERE run_id = ? AND graph_kind = ?
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1
                """,
                (run_id, graph_kind),
            ).fetchone()
        if row is None:
            return None
        return self._decode_orchestration_checkpoint(dict(row))

    def append_retry_decision(
        self,
        *,
        run_id: str,
        graph_kind: str,
        retry_index: int,
        decision: str,
        reason: str,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        decision_time = created_at or utc_iso()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO orchestration_retry_decisions (
                    run_id, graph_kind, retry_index, decision, reason, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (run_id, graph_kind, retry_index, decision, reason, decision_time),
            )
            row = connection.execute(
                "SELECT * FROM orchestration_retry_decisions WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
        return dict(row)

    def list_retry_decisions(
        self,
        *,
        run_id: str,
        graph_kind: str | None = None,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM orchestration_retry_decisions WHERE run_id = ?"
        params: list[Any] = [run_id]
        if graph_kind is not None:
            query += " AND graph_kind = ?"
            params.append(graph_kind)
        query += " ORDER BY retry_index ASC, created_at ASC, id ASC"
        with self.connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [dict(row) for row in rows]

    def append_approval_request(
        self,
        *,
        request_id: str,
        run_id: str,
        iteration_id: str,
        actor: str,
        action_type: str,
        action_payload: dict[str, Any],
        risk_level: str,
        status: str,
        reviewer: str | None,
        reviewer_note: str | None,
        created_at: str,
        updated_at: str,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO approval_requests (
                    request_id, run_id, iteration_id, actor, action_type, action_payload_json,
                    risk_level, status, reviewer, reviewer_note, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request_id,
                    run_id,
                    iteration_id,
                    actor,
                    action_type,
                    encode_json(action_payload),
                    risk_level,
                    status,
                    reviewer,
                    reviewer_note,
                    created_at,
                    updated_at,
                ),
            )
            row = connection.execute(
                "SELECT * FROM approval_requests WHERE request_id = ?",
                (request_id,),
            ).fetchone()
        return self._decode_approval_request(dict(row))

    def update_approval_request(
        self,
        *,
        request_id: str,
        status: str,
        reviewer: str | None = None,
        reviewer_note: str | None = None,
        action_payload: dict[str, Any] | None = None,
        updated_at: str | None = None,
    ) -> dict[str, Any]:
        current = self.get_approval_request(request_id)
        if current is None:
            raise ValueError(f"Approval request not found: {request_id}")
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE approval_requests
                   SET status = ?,
                       reviewer = ?,
                       reviewer_note = ?,
                       action_payload_json = ?,
                       updated_at = ?
                 WHERE request_id = ?
                """,
                (
                    status,
                    reviewer if reviewer is not None else current["reviewer"],
                    reviewer_note if reviewer_note is not None else current["reviewer_note"],
                    encode_json(action_payload if action_payload is not None else current["action_payload"]),
                    updated_at or utc_iso(),
                    request_id,
                ),
            )
            row = connection.execute(
                "SELECT * FROM approval_requests WHERE request_id = ?",
                (request_id,),
            ).fetchone()
        return self._decode_approval_request(dict(row))

    def get_approval_request(self, request_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM approval_requests WHERE request_id = ?",
                (request_id,),
            ).fetchone()
        if row is None:
            return None
        return self._decode_approval_request(dict(row))

    def list_approval_requests(
        self,
        *,
        run_id: str | None = None,
        iteration_id: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM approval_requests"
        clauses = []
        params: list[Any] = []
        if run_id is not None:
            clauses.append("run_id = ?")
            params.append(run_id)
        if iteration_id is not None:
            clauses.append("iteration_id = ?")
            params.append(iteration_id)
        if status is not None:
            clauses.append("status = ?")
            params.append(status)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY updated_at DESC, created_at DESC, request_id DESC"
        with self.connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._decode_approval_request(dict(row)) for row in rows]

    def upsert_room(
        self,
        *,
        room_id: str,
        room_type: str,
        name: str,
        status: str,
        created_by: str,
        participants: list[str],
        session_boundary: dict[str, Any] | None = None,
        run_id: str | None = None,
        iteration_id: str | None = None,
        task_id: str | None = None,
        created_at: str | None = None,
        updated_at: str | None = None,
    ) -> dict[str, Any]:
        run_id, iteration_id = self._normalize_run_iteration_refs(run_id, iteration_id)
        now = updated_at or utc_iso()
        created = created_at or now
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO rooms (
                    room_id, run_id, iteration_id, task_id, room_type, name, status,
                    created_by, participants_json, session_boundary_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(room_id) DO UPDATE SET
                    run_id = excluded.run_id,
                    iteration_id = excluded.iteration_id,
                    task_id = excluded.task_id,
                    room_type = excluded.room_type,
                    name = excluded.name,
                    status = excluded.status,
                    created_by = excluded.created_by,
                    participants_json = excluded.participants_json,
                    session_boundary_json = excluded.session_boundary_json,
                    updated_at = excluded.updated_at
                """,
                (
                    room_id,
                    run_id,
                    iteration_id,
                    task_id,
                    room_type,
                    name,
                    status,
                    created_by,
                    encode_json(participants),
                    encode_json(session_boundary or {}),
                    created,
                    now,
                ),
            )
            row = connection.execute("SELECT * FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
        return self._decode_room(dict(row))

    def get_room_record(self, room_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM rooms WHERE room_id = ?", (room_id,)).fetchone()
        if row is None:
            return None
        return self._decode_room(dict(row))

    def list_room_records(
        self,
        *,
        run_id: str | None = None,
        iteration_id: str | None = None,
        room_type: str | None = None,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM rooms"
        clauses = []
        params: list[Any] = []
        if run_id is not None:
            clauses.append("run_id = ?")
            params.append(run_id)
        if iteration_id is not None:
            clauses.append("iteration_id = ?")
            params.append(iteration_id)
        if room_type is not None:
            clauses.append("room_type = ?")
            params.append(room_type)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY updated_at DESC, created_at DESC, room_id DESC"
        with self.connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._decode_room(dict(row)) for row in rows]

    def append_room_message(
        self,
        *,
        room_id: str,
        sender: str,
        sender_kind: str,
        message_type: str,
        content: str,
        evidence_refs: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        run_id: str | None = None,
        iteration_id: str | None = None,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        run_id, iteration_id = self._normalize_run_iteration_refs(run_id, iteration_id)
        message_time = created_at or utc_iso()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO messages (
                    room_id, run_id, iteration_id, sender, sender_kind, message_type,
                    content, evidence_refs_json, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    room_id,
                    run_id,
                    iteration_id,
                    sender,
                    sender_kind,
                    message_type,
                    content,
                    encode_json(evidence_refs or []),
                    encode_json(metadata or {}),
                    message_time,
                ),
            )
            row = connection.execute("SELECT * FROM messages WHERE id = ?", (int(cursor.lastrowid),)).fetchone()
        return self._decode_message(dict(row))

    def list_room_messages(
        self,
        *,
        room_id: str | None = None,
        run_id: str | None = None,
        iteration_id: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM messages"
        clauses = []
        params: list[Any] = []
        if room_id is not None:
            clauses.append("room_id = ?")
            params.append(room_id)
        if run_id is not None:
            clauses.append("run_id = ?")
            params.append(run_id)
        if iteration_id is not None:
            clauses.append("iteration_id = ?")
            params.append(iteration_id)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at ASC, id ASC"
        if limit is not None:
            query += " LIMIT ?"
            params.append(limit)
        with self.connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._decode_message(dict(row)) for row in rows]

    def append_tool_event(
        self,
        *,
        actor: str,
        tool_name: str,
        payload: dict[str, Any],
        room_id: str | None = None,
        run_id: str | None = None,
        iteration_id: str | None = None,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        run_id, iteration_id = self._normalize_run_iteration_refs(run_id, iteration_id)
        event_time = created_at or utc_iso()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO tool_events (
                    room_id, run_id, iteration_id, actor, tool_name, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (room_id, run_id, iteration_id, actor, tool_name, encode_json(payload), event_time),
            )
            row = connection.execute("SELECT * FROM tool_events WHERE id = ?", (int(cursor.lastrowid),)).fetchone()
        return self._decode_tool_event(dict(row))

    def list_tool_events(
        self,
        *,
        room_id: str | None = None,
        run_id: str | None = None,
        iteration_id: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM tool_events"
        clauses = []
        params: list[Any] = []
        if room_id is not None:
            clauses.append("room_id = ?")
            params.append(room_id)
        if run_id is not None:
            clauses.append("run_id = ?")
            params.append(run_id)
        if iteration_id is not None:
            clauses.append("iteration_id = ?")
            params.append(iteration_id)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at ASC, id ASC"
        if limit is not None:
            query += " LIMIT ?"
            params.append(limit)
        with self.connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._decode_tool_event(dict(row)) for row in rows]

    def append_insight(
        self,
        *,
        kind: str,
        summary: str,
        evidence_refs: list[str] | None = None,
        details: dict[str, Any] | None = None,
        run_id: str | None = None,
        iteration_id: str | None = None,
        room_id: str | None = None,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        run_id, iteration_id = self._normalize_run_iteration_refs(run_id, iteration_id)
        insight_time = created_at or utc_iso()
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO insights (
                    run_id, iteration_id, room_id, kind, summary,
                    evidence_refs_json, details_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    iteration_id,
                    room_id,
                    kind,
                    summary,
                    encode_json(evidence_refs or []),
                    encode_json(details or {}),
                    insight_time,
                ),
            )
            row = connection.execute("SELECT * FROM insights WHERE id = ?", (int(cursor.lastrowid),)).fetchone()
        return self._decode_insight(dict(row))

    def list_insights(
        self,
        *,
        run_id: str | None = None,
        iteration_id: str | None = None,
        room_id: str | None = None,
        kinds: list[str] | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM insights"
        clauses = []
        params: list[Any] = []
        if run_id is not None:
            clauses.append("run_id = ?")
            params.append(run_id)
        if iteration_id is not None:
            clauses.append("iteration_id = ?")
            params.append(iteration_id)
        if room_id is not None:
            clauses.append("room_id = ?")
            params.append(room_id)
        if kinds:
            clauses.append("kind IN (" + ", ".join("?" for _ in kinds) + ")")
            params.extend(kinds)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC, id DESC"
        if limit is not None:
            query += " LIMIT ?"
            params.append(limit)
        with self.connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._decode_insight(dict(row)) for row in rows]

    def upsert_handoff_packet(
        self,
        *,
        handoff_id: str,
        from_actor: str,
        to_actor: str,
        status: str,
        summary: str,
        packet: dict[str, Any],
        run_id: str | None = None,
        iteration_id: str | None = None,
        created_at: str | None = None,
        updated_at: str | None = None,
    ) -> dict[str, Any]:
        run_id, iteration_id = self._normalize_run_iteration_refs(run_id, iteration_id)
        now = updated_at or utc_iso()
        created = created_at or now
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO handoff_packets (
                    handoff_id, run_id, iteration_id, from_actor, to_actor, status,
                    summary, packet_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(handoff_id) DO UPDATE SET
                    run_id = excluded.run_id,
                    iteration_id = excluded.iteration_id,
                    from_actor = excluded.from_actor,
                    to_actor = excluded.to_actor,
                    status = excluded.status,
                    summary = excluded.summary,
                    packet_json = excluded.packet_json,
                    updated_at = excluded.updated_at
                """,
                (
                    handoff_id,
                    run_id,
                    iteration_id,
                    from_actor,
                    to_actor,
                    status,
                    summary,
                    encode_json(packet),
                    created,
                    now,
                ),
            )
            row = connection.execute("SELECT * FROM handoff_packets WHERE handoff_id = ?", (handoff_id,)).fetchone()
        return self._decode_handoff_packet(dict(row))

    def get_handoff_packet(self, handoff_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM handoff_packets WHERE handoff_id = ?", (handoff_id,)).fetchone()
        if row is None:
            return None
        return self._decode_handoff_packet(dict(row))

    def list_handoff_packets(
        self,
        *,
        run_id: str | None = None,
        iteration_id: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM handoff_packets"
        clauses = []
        params: list[Any] = []
        if run_id is not None:
            clauses.append("run_id = ?")
            params.append(run_id)
        if iteration_id is not None:
            clauses.append("iteration_id = ?")
            params.append(iteration_id)
        if status is not None:
            clauses.append("status = ?")
            params.append(status)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY updated_at DESC, created_at DESC, handoff_id DESC"
        with self.connect() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._decode_handoff_packet(dict(row)) for row in rows]

    def _decode_task_plan(self, row: dict[str, Any]) -> dict[str, Any]:
        row["acceptance_json"] = decode_json(row["acceptance_json"], [])
        row["steps_json"] = decode_json(row["steps_json"], [])
        return row

    def _decode_memory_record(self, row: dict[str, Any]) -> dict[str, Any]:
        row["tags_json"] = decode_json(row["tags_json"], [])
        row["evidence_refs_json"] = decode_json(row["evidence_refs_json"], [])
        row["approved"] = bool(row["approved"])
        return row

    def _decode_orchestration_checkpoint(self, row: dict[str, Any]) -> dict[str, Any]:
        row["state_json"] = decode_json(row.get("state_json"), {})
        row["retry_count"] = int(row.get("retry_count") or 0)
        row["validator_issues_json"] = decode_json(row.get("validator_issues_json"), [])
        row["approval_pending"] = bool(row.get("approval_pending"))
        row["loop_cost_metrics_json"] = decode_json(row.get("loop_cost_metrics_json"), {})
        return row

    def _decode_approval_request(self, row: dict[str, Any]) -> dict[str, Any]:
        decoded_payload = decode_json(row.get("action_payload_json"), {})
        row["action_payload_json"] = decoded_payload
        row["action_payload"] = decoded_payload
        return row

    def _decode_room(self, row: dict[str, Any]) -> dict[str, Any]:
        row["participants_json"] = decode_json(row.get("participants_json"), [])
        row["session_boundary_json"] = decode_json(row.get("session_boundary_json"), {})
        return row

    def _decode_message(self, row: dict[str, Any]) -> dict[str, Any]:
        row["evidence_refs_json"] = decode_json(row.get("evidence_refs_json"), [])
        row["metadata_json"] = decode_json(row.get("metadata_json"), {})
        return row

    def _decode_tool_event(self, row: dict[str, Any]) -> dict[str, Any]:
        row["payload_json"] = decode_json(row.get("payload_json"), {})
        return row

    def _decode_insight(self, row: dict[str, Any]) -> dict[str, Any]:
        row["evidence_refs_json"] = decode_json(row.get("evidence_refs_json"), [])
        row["details_json"] = decode_json(row.get("details_json"), {})
        return row

    def _decode_handoff_packet(self, row: dict[str, Any]) -> dict[str, Any]:
        row["packet_json"] = decode_json(row.get("packet_json"), {})
        return row

    def _normalize_run_iteration_refs(
        self,
        run_id: str | None,
        iteration_id: str | None,
    ) -> tuple[str | None, str | None]:
        normalized_run_id = run_id
        normalized_iteration_id = iteration_id
        if iteration_id is not None:
            try:
                iteration = self.get_iteration(iteration_id)
            except ValueError:
                normalized_iteration_id = None
            else:
                normalized_run_id = iteration["run_id"]
        if normalized_run_id is not None:
            try:
                self.get_run(normalized_run_id)
            except ValueError:
                normalized_run_id = None
                normalized_iteration_id = None
        return normalized_run_id, normalized_iteration_id


__all__ = [
    "ACTIVE_RUN_STATUSES",
    "AUTHORITATIVE_STATE_OWNERS",
    "FINDING_CATEGORIES",
    "LoopStateRepository",
    "SCHEMA_VERSION",
    "decode_json",
    "encode_json",
    "utc_iso",
]
