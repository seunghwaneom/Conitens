from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_approval import ApprovalInterruptAdapter
from ensemble_events import load_events
from ensemble_forward_bridge import build_operator_task_detail_payload
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_room_service import RoomService
from ensemble_run_service import RunService


class ForwardRuntimeModeTests(unittest.TestCase):
    def cli_env(self) -> dict[str, str]:
        return {
            **os.environ,
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
        }

    def run_cli(
        self,
        *args: str,
        check: bool = True,
        extra_env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPTS / "ensemble.py"), *args],
            check=check,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env={**self.cli_env(), **(extra_env or {})},
        )

    def test_forward_status_json_reports_forward_runtime_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            result = self.run_cli("--workspace", str(workspace), "forward", "status", "--format", "json")
            payload = json.loads(result.stdout)
            self.assertEqual(payload["mode"], "forward")
            self.assertEqual(payload["entry_contract"]["default_runtime"], "legacy")
            self.assertIn("forward", payload["entry_contract"]["selector"])
            self.assertGreaterEqual(payload["runtime"]["schema_version"], 8)
            self.assertEqual(payload["workspace_root"], ".")
            self.assertNotIn(str(workspace.resolve()), result.stdout)
            self.assertTrue(payload["artifacts"]["loop_state_db"].endswith("loop_state.sqlite3"))
            self.assertFalse(Path(payload["artifacts"]["loop_state_db"]).is_absolute())
            self.assertIn("run_state", payload["runtime"]["authoritative_state_owners"])

    def test_forward_context_latest_uses_structured_public_state_and_omits_repo_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run_id = RunService(repository).create_run("RAW_REQUEST_DO_NOT_PUBLISH token=private")["run_id"]
            repository.upsert_task_plan(
                run_id=run_id,
                current_plan="PRIVATE_PLAN_DO_NOT_PUBLISH",
                objective="Public CLI objective",
                steps=[{"title": "Public CLI step", "status": "in_progress", "notes": "PRIVATE_NOTE"}],
                acceptance_criteria=["PRIVATE_ACCEPTANCE"],
                owner="private-owner",
            )
            runtime_context = workspace / ".conitens" / "context"
            runtime_context.mkdir(parents=True, exist_ok=True)
            (runtime_context / "LATEST_CONTEXT.md").write_text("RUNTIME_RAW_DO_NOT_PUBLISH", encoding="utf-8")
            repo_context = workspace / ".vibe" / "context"
            repo_context.mkdir(parents=True, exist_ok=True)
            (repo_context / "LATEST_CONTEXT.md").write_text("REPO_RAW_DO_NOT_PUBLISH", encoding="utf-8")

            result = self.run_cli("--workspace", str(workspace), "forward", "context-latest", "--format", "json")
            payload = json.loads(result.stdout)
            self.assertIn("Public CLI objective", payload["runtime_latest"]["content"])
            self.assertIn("Public CLI step", payload["runtime_latest"]["content"])
            self.assertIsNone(payload["repo_latest"])
            self.assertFalse(Path(payload["runtime_latest"]["path"]).is_absolute())
            self.assertNotIn(str(workspace.resolve()), result.stdout)
            self.assertNotIn("RAW_REQUEST_DO_NOT_PUBLISH", result.stdout)
            self.assertNotIn("PRIVATE_PLAN_DO_NOT_PUBLISH", result.stdout)
            self.assertNotIn("RUNTIME_RAW_DO_NOT_PUBLISH", result.stdout)
            self.assertNotIn("REPO_RAW_DO_NOT_PUBLISH", result.stdout)
            self.assertNotIn("private-owner", result.stdout)

    def test_forward_context_latest_json_is_safe_on_windows_legacy_stdout(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repository = LoopStateRepository(workspace)
            run_id = RunService(repository).create_run("private request")["run_id"]
            repository.upsert_task_plan(
                run_id=run_id,
                current_plan="private plan",
                objective="runtime\u2014digest \U0001f680",
                steps=[],
                acceptance_criteria=[],
                owner="private-owner",
            )
            runtime_context = workspace / ".conitens" / "context"
            runtime_context.mkdir(parents=True, exist_ok=True)
            (runtime_context / "LATEST_CONTEXT.md").write_text(
                "RAW_RUNTIME_MARKDOWN_DO_NOT_PUBLISH",
                encoding="utf-8",
            )

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "context-latest",
                "--format",
                "json",
                check=False,
                extra_env={"PYTHONIOENCODING": "cp949", "PYTHONUTF8": "0"},
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertIn("runtime\u2014digest \U0001f680", payload["runtime_latest"]["content"])
            self.assertNotIn("RAW_RUNTIME_MARKDOWN_DO_NOT_PUBLISH", result.stdout)

    def test_forward_doctor_evidence_reports_cli_and_privacy_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            result = self.run_cli("--workspace", str(workspace), "forward", "doctor-evidence", "--format", "json")
            payload = json.loads(result.stdout)

            self.assertEqual(payload["kind"], "forward_doctor_evidence")
            self.assertIn(payload["status"], {"ok", "warning", "danger"})
            self.assertEqual(payload["doctor"]["checks"][0]["id"], "loop-state")
            self.assertTrue(any(check["id"] == "python" for check in payload["runtime_cli_checks"]))
            self.assertFalse(payload["privacy"]["environment_dumped"])
            self.assertFalse(payload["privacy"]["auth_tokens_exposed"])
            self.assertEqual(payload["workspace_root"], ".")
            self.assertNotIn(str(workspace.resolve()), result.stdout)
            self.assertNotIn(str(Path(sys.executable).resolve()), result.stdout)
            self.assertNotIn("bearer-", result.stdout.lower())
            self.assertFalse((workspace / ".omx" / "artifacts" / "forward-doctor-evidence").exists())

    def test_forward_runtime_roster_reports_cli_runtime_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "runtime-roster",
                "--format",
                "json",
                "--no-version-probe",
            )
            payload = json.loads(result.stdout)

            self.assertEqual(payload["kind"], "forward_runtime_roster")
            self.assertEqual(payload["workspace_root"], ".")
            self.assertFalse(payload["probe_versions"])
            self.assertIn(payload["status"], {"ok", "warning", "danger"})
            self.assertGreaterEqual(payload["counts"]["agent_runtimes"], 4)
            self.assertTrue(any(runtime["id"] == "python" for runtime in payload["runtimes"]))
            self.assertFalse(payload["privacy"]["environment_dumped"])
            self.assertFalse(payload["privacy"]["auth_tokens_exposed"])
            self.assertFalse(payload["privacy"]["raw_session_content_exposed"])
            self.assertEqual(load_events(workspace), [])
            self.assertFalse((workspace / ".omx" / "artifacts" / "forward-doctor-evidence").exists())
            self.assertNotIn(str(workspace.resolve()), result.stdout)
            self.assertNotIn("Authorization", result.stdout)
            self.assertNotIn("Bearer", result.stdout)

    def test_forward_runtime_roster_can_filter_agent_runtime_with_ux_hints(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repo = LoopStateRepository(workspace)
            run_id = RunService(repo).create_run("Runtime roster UX")["run_id"]
            repo.append_orchestration_checkpoint(
                run_id=run_id,
                graph_kind="build",
                step_name="provider-call",
                state={"agent_id": "sample-agent"},
                loop_cost_metrics={
                    "provider": "codex",
                    "model": "gpt-5.4",
                    "total_tokens": 42,
                },
            )
            events_before = load_events(workspace)

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "runtime-roster",
                "--runtime",
                "codex",
                "--agent-runtimes-only",
                "--format",
                "json",
                "--no-version-probe",
            )
            payload = json.loads(result.stdout)

            self.assertEqual(payload["kind"], "forward_runtime_roster")
            self.assertEqual(payload["scope"]["runtime_id"], "codex")
            self.assertEqual(payload["scope"]["category"], "agent_runtime")
            self.assertFalse(payload["probe_versions"])
            self.assertEqual(payload["counts"]["total"], 1)
            self.assertEqual(payload["counts"]["agent_runtimes"], 1)
            self.assertEqual(payload["counts"]["toolchains"], 0)
            self.assertEqual(payload["runtimes"][0]["id"], "codex")
            self.assertEqual(payload["runtimes"][0]["session_status"], "observed")
            self.assertEqual(payload["ux_summary"]["preferred_agent_runtime"], "codex")
            self.assertIn("codex", payload["ux_summary"]["observed_agent_runtimes"])
            self.assertEqual(payload["operator_hints"][0]["runtime_id"], "codex")
            self.assertEqual(payload["operator_hints"][0]["readiness"], "observed")
            self.assertFalse(payload["privacy"]["environment_dumped"])
            self.assertFalse(payload["privacy"]["auth_tokens_exposed"])
            self.assertFalse(payload["privacy"]["provider_auth_commands_executed"])
            self.assertFalse(payload["privacy"]["raw_session_content_exposed"])
            self.assertEqual(load_events(workspace), events_before)
            self.assertNotIn("Authorization", result.stdout)
            self.assertNotIn("Bearer", result.stdout)

    def test_forward_turn_records_reports_metadata_without_transcript_content(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repo = LoopStateRepository(workspace)
            run_id = RunService(repo).create_run("Turn records")["run_id"]
            iteration_id = IterationService(repo).append_iteration(run_id, "Record turn metadata")["iteration_id"]
            room = RoomService(workspace).create_room(
                name="turn-room",
                room_type="review",
                participants=["user", "sample-agent"],
                actor="sample-agent",
                run_id=run_id,
                iteration_id=iteration_id,
            )
            RoomService(workspace).append_message(
                room_id=room["room_id"],
                sender="sample-agent",
                sender_kind="agent",
                text="SECRET transcript content should stay out of the projection",
                message_type="decision",
                evidence_refs=["event:sample"],
                metadata={"private_note": "do not expose"},
                run_id=run_id,
                iteration_id=iteration_id,
            )
            repo.append_tool_event(
                room_id=room["room_id"],
                run_id=run_id,
                iteration_id=iteration_id,
                actor="sample-agent",
                tool_name="shell",
                payload={"command": "echo SECRET"},
            )
            events_before = load_events(workspace)

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "turn-records",
                "--run-id",
                run_id,
                "--room-id",
                room["room_id"],
                "--limit",
                "10",
                "--format",
                "json",
            )
            payload = json.loads(result.stdout)

            self.assertEqual(payload["kind"], "forward_turn_records")
            self.assertEqual(payload["workspace_root"], ".")
            self.assertEqual(payload["scope"]["run_id"], run_id)
            self.assertEqual(payload["scope"]["room_id"], room["room_id"])
            self.assertEqual(payload["counts"]["messages"], 1)
            self.assertEqual(payload["counts"]["tool_events"], 1)
            self.assertEqual(payload["counts"]["returned"], 2)
            message = next(record for record in payload["records"] if record["record_type"] == "message")
            tool_event = next(record for record in payload["records"] if record["record_type"] == "tool_event")
            self.assertTrue(message["content_redacted"])
            self.assertGreater(message["content_length"], 0)
            self.assertEqual(message["metadata_keys"], ["attachments", "private_note"])
            self.assertTrue(tool_event["payload_redacted"])
            self.assertEqual(tool_event["payload_keys"], ["command"])
            self.assertFalse(payload["privacy"]["message_content_exposed"])
            self.assertFalse(payload["privacy"]["tool_payload_values_exposed"])
            self.assertFalse(payload["privacy"]["raw_transcript_exposed"])
            self.assertNotIn("SECRET transcript", result.stdout)
            self.assertNotIn("echo SECRET", result.stdout)
            self.assertNotIn("do not expose", result.stdout)
            self.assertEqual(load_events(workspace), events_before)

    def test_forward_workflow_contracts_reports_contracts_without_execution(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            workflows_dir = workspace / ".agent" / "workflows"
            workflows_dir.mkdir(parents=True, exist_ok=True)
            (workflows_dir / "review-build.md").write_text(
                """---
schema_v: 1
name: "Review Build"
slug: "review-build"
description: "Review-gated build workflow."
inputs:
  task_id:
    type: string
    required: true
  notes:
    type: string
    required: false
steps:
  - id: ask
    kind: approval
    question: "approve SECRET workflow {{task_id}}"
    on_fail: stop
  - id: run
    kind: cli
    cmd: "echo SECRET {{task_id}}"
    on_fail: stop
  - id: record
    kind: emit_event
    event_type: WORKFLOW_REVIEW_RECORDED
    payload:
      task_id: "{{task_id}}"
      leak: "payload-secret-value"
    on_fail: stop
---

# Notes
""",
                encoding="utf-8",
            )

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "workflow-contracts",
                "--workflow",
                "review-build",
                "--format",
                "json",
            )
            payload = json.loads(result.stdout)

            self.assertEqual(payload["kind"], "forward_workflow_contracts")
            self.assertEqual(payload["workspace_root"], ".")
            self.assertEqual(payload["counts"]["total"], 1)
            self.assertEqual(payload["counts"]["ready"], 1)
            self.assertEqual(payload["counts"]["requiring_approval"], 1)
            self.assertTrue(payload["router_contract"]["read_only"])
            self.assertFalse(payload["router_contract"]["execution_performed"])
            self.assertFalse(payload["router_contract"]["workflow_runs_created"])
            self.assertFalse(payload["router_contract"]["approval_bypassed"])
            contract = payload["contracts"][0]
            self.assertEqual(contract["slug"], "review-build")
            self.assertEqual(contract["required_inputs"], ["task_id"])
            self.assertEqual(contract["optional_inputs"], ["notes"])
            self.assertEqual(contract["step_count"], 3)
            self.assertIn("approval", contract["step_kinds"])
            self.assertIn("cli", contract["step_kinds"])
            self.assertIn("emit_event", contract["step_kinds"])
            self.assertTrue(contract["requires_approval"])
            self.assertTrue(contract["emits_events"])
            self.assertFalse(payload["privacy"]["raw_workflow_body_exposed"])
            self.assertFalse(payload["privacy"]["rendered_command_values_exposed"])
            self.assertFalse(payload["privacy"]["rendered_payload_values_exposed"])
            self.assertEqual(load_events(workspace), [])
            self.assertNotIn("echo SECRET", result.stdout)
            self.assertNotIn("approve SECRET workflow", result.stdout)
            self.assertNotIn("payload-secret-value", result.stdout)

    def test_forward_status_confidence_reports_reasons_without_raw_content(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repo = LoopStateRepository(workspace)
            run_id = RunService(repo).create_run("Status confidence")["run_id"]
            iteration_id = IterationService(repo).append_iteration(run_id, "Diagnose status")["iteration_id"]
            stale_at = (datetime.now(timezone.utc) - timedelta(hours=8)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            with repo.connect() as connection:
                connection.execute("UPDATE runs SET updated_at = ? WHERE run_id = ?", (stale_at, run_id))
            task = repo.create_operator_task(
                task_id="otask-status-confidence",
                title="Diagnose confidence",
                objective="Explain state confidence",
                status="in_review",
                priority="high",
                linked_run_id=run_id,
                linked_iteration_id=iteration_id,
                acceptance=["validator evidence exists"],
            )
            room = RoomService(workspace).create_room(
                name="status-room",
                room_type="review",
                participants=["user", "sample-agent"],
                actor="sample-agent",
                task_id=task["task_id"],
                run_id=run_id,
                iteration_id=iteration_id,
            )
            repo.update_operator_task(task_id=task["task_id"], linked_room_ids=[room["room_id"]])
            RoomService(workspace).append_message(
                room_id=room["room_id"],
                sender="sample-agent",
                sender_kind="agent",
                text="SECRET status transcript should stay out",
                message_type="decision",
                run_id=run_id,
                iteration_id=iteration_id,
            )
            repo.record_validator_result(
                run_id=run_id,
                iteration_id=iteration_id,
                passed=False,
                issues=[{"message": "SECRET validator issue should stay summarized"}],
                feedback_text="validation failed without leaking details",
            )
            ApprovalInterruptAdapter(workspace).enqueue_request(
                run_id=run_id,
                iteration_id=iteration_id,
                task_id=task["task_id"],
                actor="sample-agent",
                action_type="shell_execution",
                action_payload={"command": "echo SECRET approval payload"},
            )
            events_before = load_events(workspace)

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "status-confidence",
                "--run-id",
                run_id,
                "--format",
                "json",
            )
            payload = json.loads(result.stdout)

            self.assertEqual(payload["kind"], "forward_status_confidence")
            self.assertEqual(payload["workspace_root"], ".")
            self.assertEqual(payload["scope"]["run_id"], run_id)
            self.assertEqual(payload["counts"]["runs"], 1)
            self.assertEqual(payload["counts"]["tasks"], 1)
            self.assertEqual(payload["counts"]["rooms"], 1)
            self.assertGreaterEqual(payload["counts"]["stale"], 1)
            self.assertGreaterEqual(payload["counts"]["pending_approval"], 1)
            task_row = next(row for row in payload["diagnostics"] if row["id"] == f"task:{task['task_id']}")
            run_row = next(row for row in payload["diagnostics"] if row["id"] == f"run:{run_id}")
            self.assertIn("linked_run_stale", task_row["reason_codes"])
            self.assertIn("pending_approval", task_row["reason_codes"])
            self.assertIn("stale_active_run", run_row["reason_codes"])
            self.assertTrue(payload["diagnostic_contract"]["read_only"])
            self.assertFalse(payload["diagnostic_contract"]["mutations_performed"])
            self.assertFalse(payload["diagnostic_contract"]["external_fetch_performed"])
            self.assertFalse(payload["privacy"]["message_content_exposed"])
            self.assertFalse(payload["privacy"]["tool_payload_values_exposed"])
            self.assertFalse(payload["privacy"]["approval_payload_values_exposed"])
            self.assertEqual(load_events(workspace), events_before)
            self.assertNotIn("SECRET status transcript", result.stdout)
            self.assertNotIn("echo SECRET approval payload", result.stdout)
            self.assertNotIn("SECRET validator issue", result.stdout)

    def test_forward_wake_readiness_combines_sources_without_scheduling(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repo = LoopStateRepository(workspace)
            run_id = RunService(repo).create_run("Wake readiness")["run_id"]
            iteration_id = IterationService(repo).append_iteration(run_id, "Check wake readiness")["iteration_id"]
            task = repo.create_operator_task(
                task_id="otask-wake-readiness",
                title="Wake readiness",
                objective="Review whether a run can be woken",
                status="in_review",
                priority="high",
                linked_run_id=run_id,
                linked_iteration_id=iteration_id,
                acceptance=["validator passed"],
            )
            room = RoomService(workspace).create_room(
                name="wake-room",
                room_type="review",
                participants=["user", "sample-agent"],
                actor="sample-agent",
                task_id=task["task_id"],
                run_id=run_id,
                iteration_id=iteration_id,
            )
            repo.update_operator_task(task_id=task["task_id"], linked_room_ids=[room["room_id"]])
            RoomService(workspace).append_message(
                room_id=room["room_id"],
                sender="sample-agent",
                sender_kind="agent",
                text="SECRET wake transcript should stay out",
                message_type="decision",
                run_id=run_id,
                iteration_id=iteration_id,
            )
            repo.append_tool_event(
                room_id=room["room_id"],
                run_id=run_id,
                iteration_id=iteration_id,
                actor="sample-agent",
                tool_name="shell",
                payload={"command": "echo SECRET wake"},
            )
            repo.record_validator_result(
                run_id=run_id,
                iteration_id=iteration_id,
                passed=True,
                issues=[],
                feedback_text="validator passed",
            )
            repo.append_orchestration_checkpoint(
                run_id=run_id,
                graph_kind="build",
                step_name="provider-call",
                state={"agent_id": "sample-agent"},
                loop_cost_metrics={
                    "provider": "codex",
                    "model": "gpt-5.4",
                    "total_tokens": 42,
                },
            )
            events_before = load_events(workspace)

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "wake-readiness",
                "--run-id",
                run_id,
                "--limit",
                "10",
                "--format",
                "json",
            )
            payload = json.loads(result.stdout)

            self.assertEqual(payload["kind"], "forward_wake_readiness")
            self.assertEqual(payload["workspace_root"], ".")
            self.assertEqual(payload["scope"]["run_id"], run_id)
            self.assertGreaterEqual(payload["counts"]["returned"], 3)
            self.assertGreaterEqual(payload["counts"]["ready"], 1)
            self.assertEqual(payload["source_projections"]["runtime_roster"]["preferred_agent_runtime"], "codex")
            self.assertTrue(any(row["readiness"] == "ready" for row in payload["candidates"]))
            self.assertTrue(payload["wake_contract"]["read_only"])
            self.assertFalse(payload["wake_contract"]["scheduler_started"])
            self.assertFalse(payload["wake_contract"]["wake_messages_sent"])
            self.assertFalse(payload["wake_contract"]["task_status_mutated"])
            self.assertFalse(payload["wake_contract"]["provider_auth_commands_executed"])
            self.assertFalse(payload["privacy"]["message_content_exposed"])
            self.assertFalse(payload["privacy"]["tool_payload_values_exposed"])
            self.assertFalse(payload["privacy"]["raw_transcript_exposed"])
            self.assertEqual(load_events(workspace), events_before)
            self.assertNotIn("SECRET wake transcript", result.stdout)
            self.assertNotIn("echo SECRET wake", result.stdout)
            self.assertNotIn("Authorization", result.stdout)
            self.assertNotIn("Bearer", result.stdout)

    def test_forward_doctor_evidence_can_write_release_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "doctor-evidence",
                "--format",
                "json",
                "--write-artifact",
            )
            payload = json.loads(result.stdout)
            json_path = workspace / payload["artifact"]["json_path"]
            markdown_path = workspace / payload["artifact"]["markdown_path"]
            manifest_path = workspace / ".notes" / "artifacts" / "manifest.jsonl"

            self.assertTrue(json_path.exists())
            self.assertTrue(markdown_path.exists())
            self.assertEqual(json_path.parent, workspace / ".omx" / "artifacts" / "forward-doctor-evidence")
            stored_payload = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(stored_payload["kind"], "forward_doctor_evidence")
            self.assertEqual(stored_payload["artifact_manifest"]["artifact_type"], "forward_doctor_evidence")
            self.assertTrue(manifest_path.exists())
            self.assertIn(payload["artifact"]["json_path"], manifest_path.read_text(encoding="utf-8"))
            self.assertIn("Forward Doctor Evidence", markdown_path.read_text(encoding="utf-8"))

    @unittest.skipUnless(hasattr(os, "symlink"), "symlink support required")
    def test_forward_doctor_evidence_refuses_symlink_escape_artifact_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir, tempfile.TemporaryDirectory() as outside_dir:
            workspace = Path(temp_dir)
            artifact_parent = workspace / ".omx" / "artifacts"
            artifact_parent.mkdir(parents=True)
            os.symlink(outside_dir, artifact_parent / "forward-doctor-evidence")

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "doctor-evidence",
                "--format",
                "json",
                "--write-artifact",
                check=False,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Refusing to write forward doctor evidence outside workspace", result.stderr)

    def test_forward_doctor_evidence_redacts_secret_like_probe_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir) / "workspace"
            workspace.mkdir()
            fake_bin = Path(temp_dir) / "bin"
            fake_bin.mkdir()
            fake_node = fake_bin / ("node.cmd" if os.name == "nt" else "node")
            fake_node.write_text(
                "@echo api_key=SECRET1234567890 /home/example\n"
                if os.name == "nt"
                else "#!/bin/sh\necho 'api_key=SECRET1234567890 /home/example'\n",
                encoding="utf-8",
            )
            fake_node.chmod(0o755)

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "doctor-evidence",
                "--format",
                "json",
                extra_env={"PATH": f"{fake_bin}{os.pathsep}{os.environ.get('PATH', '')}"},
            )
            payload = json.loads(result.stdout)
            node_check = next(check for check in payload["runtime_cli_checks"] if check["id"] == "node")

            self.assertEqual(node_check["version"], "[REDACTED]")
            self.assertNotIn("SECRET1234567890", result.stdout)
            self.assertNotIn("/home/example", result.stdout)

    def test_forward_append_pr_ci_evidence_records_reviewed_metadata_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repo = LoopStateRepository(workspace)
            run_id = RunService(repo).create_run("PR CI producer")["run_id"]
            iteration_id = IterationService(repo).append_iteration(run_id, "Attach evidence")["iteration_id"]
            task = repo.create_operator_task(
                task_id="otask-pr-ci-producer",
                title="Attach producer evidence",
                objective="Record reviewed PR and CI metadata",
                status="in_review",
                priority="high",
                linked_run_id=run_id,
                linked_iteration_id=iteration_id,
            )
            evidence_file = workspace / "reviewed-pr-ci.json"
            evidence_file.write_text(
                json.dumps(
                    {
                        "items": [
                            {
                                "kind": "pull_request",
                                "provider": "github",
                                "repository": "owner/repo",
                                "pr_number": 42,
                                "title": "Add task evidence sk-testSECRET1234567890",
                                "status": "open",
                                "url": "https://user:pass@github.com/owner/repo/pull/42?token=SECRET#files",
                                "branch": "feature/evidence",
                                "commit_sha": "abcdef1234567890",
                                "task_id": task["task_id"],
                                "summary": "Reviewed PR metadata only.",
                                "evidence_refs": ["github:pr:42"],
                            },
                            {
                                "kind": "ci",
                                "provider": "github-actions",
                                "repository": "owner/repo",
                                "workflow": "tests token=SECRET123456",
                                "job": "unit",
                                "ci_run_id": "100",
                                "status": "completed",
                                "conclusion": "success",
                                "url": "https://github.com/owner/repo/actions/runs/100?check_suite_focus=true",
                                "task_id": task["task_id"],
                                "run_id": run_id,
                                "summary": "Unit checks passed.",
                            },
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "append-pr-ci-evidence",
                "--input",
                str(evidence_file),
                "--format",
                "json",
                "--reviewer",
                "test/reviewer",
            )
            payload = json.loads(result.stdout)
            events = [event for event in load_events(workspace) if event["type"] in {"pr.evidence_observed", "ci.evidence_observed"}]
            detail = build_operator_task_detail_payload(workspace, task["task_id"])
            serialized_events = json.dumps(events, ensure_ascii=False)

            self.assertEqual(payload["kind"], "forward_pr_ci_evidence_append")
            self.assertEqual(payload["counts"]["total"], 2)
            self.assertEqual(payload["counts"]["pull_requests"], 1)
            self.assertEqual(payload["counts"]["ci_runs"], 1)
            self.assertEqual(len(events), 2)
            self.assertEqual(events[0]["actor"]["name"], "test/reviewer")
            self.assertEqual(events[0]["payload"]["task_id"], task["task_id"])
            self.assertEqual(events[1]["payload"]["task_id"], task["task_id"])
            self.assertEqual(events[0]["payload"]["url"], "https://github.com/owner/repo/pull/42")
            self.assertTrue(payload["privacy"]["metadata_redaction_applied"])
            self.assertIn("token", payload["privacy"]["metadata_redaction_rules"])
            self.assertNotIn("SECRET", result.stdout)
            self.assertNotIn("SECRET", serialized_events)
            self.assertNotIn("user:pass", serialized_events)
            self.assertFalse(payload["privacy"]["external_fetch_performed"])
            self.assertFalse(payload["privacy"]["auth_commands_executed"])
            self.assertFalse(payload["privacy"]["raw_external_content_accepted"])
            self.assertEqual(detail["pr_ci_evidence"]["counts"]["total"], 2)
            self.assertEqual(detail["pr_ci_evidence"]["counts"]["successful"], 1)

    def test_forward_append_pr_ci_evidence_rejects_raw_content_without_partial_write(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repo = LoopStateRepository(workspace)
            run_id = RunService(repo).create_run("PR CI producer rejection")["run_id"]
            iteration_id = IterationService(repo).append_iteration(run_id, "Reject raw evidence")["iteration_id"]
            task = repo.create_operator_task(
                task_id="otask-pr-ci-reject",
                title="Reject raw producer evidence",
                objective="Reject raw CI logs",
                status="in_review",
                priority="high",
                linked_run_id=run_id,
                linked_iteration_id=iteration_id,
            )
            evidence_file = workspace / "raw-pr-ci.json"
            evidence_file.write_text(
                json.dumps(
                    {
                        "kind": "ci",
                        "provider": "github-actions",
                        "workflow": "tests",
                        "status": "completed",
                        "conclusion": "failure",
                        "task_id": task["task_id"],
                        "rawLog": "SECRET raw log should never be written",
                    }
                ),
                encoding="utf-8",
            )

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "append-pr-ci-evidence",
                "--input",
                str(evidence_file),
                "--format",
                "json",
                check=False,
            )

            events = [event for event in load_events(workspace) if event["type"] in {"pr.evidence_observed", "ci.evidence_observed"}]
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("forbids raw external content fields", result.stderr)
            self.assertNotIn("SECRET raw log", result.stderr)
            self.assertEqual(events, [])

    def test_forward_import_pr_ci_evidence_prepares_local_github_export_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repo = LoopStateRepository(workspace)
            run_id = RunService(repo).create_run("PR CI importer")["run_id"]
            iteration_id = IterationService(repo).append_iteration(run_id, "Import local export")["iteration_id"]
            task = repo.create_operator_task(
                task_id="otask-pr-ci-import",
                title="Import local GitHub export",
                objective="Prepare reviewed PR and CI metadata",
                status="in_review",
                priority="high",
                linked_run_id=run_id,
                linked_iteration_id=iteration_id,
            )
            export_file = workspace / "github-export.json"
            export_file.write_text(
                json.dumps(
                    {
                        "pull_request": {
                            "number": 42,
                            "id": 9001,
                            "title": "Add task evidence sk-testSECRET1234567890",
                            "state": "open",
                            "html_url": "https://user:pass@github.com/owner/repo/pull/42?token=SECRET#files",
                            "head": {"ref": "feature/token=SECRET123456", "sha": "abcdef1234567890", "repo": {"full_name": "owner/repo"}},
                            "base": {"ref": "main", "repo": {"full_name": "owner/repo"}},
                            "body": "SECRET body should be ignored",
                            "updated_at": "2026-06-07T10:00:00Z",
                        },
                        "workflow_runs": [
                            {
                                "id": 100,
                                "name": "tests token=SECRET123456",
                                "display_title": "Add task evidence Bearer abcdefghijklmnop",
                                "status": "completed",
                                "conclusion": "success",
                                "html_url": "https://github.com/owner/repo/actions/runs/100?check_suite_focus=true",
                                "head_branch": "feature/token=SECRET123456",
                                "head_sha": "abcdef1234567890",
                                "logs": "SECRET logs should be ignored",
                                "updated_at": "2026-06-07T10:02:00Z",
                            }
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            import_result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "import-pr-ci-evidence",
                "--input",
                str(export_file),
                "--task-id",
                task["task_id"],
                "--format",
                "json",
            )
            imported = json.loads(import_result.stdout)
            self.assertEqual(imported["kind"], "forward_pr_ci_evidence_import")
            self.assertEqual(imported["counts"]["total"], 2)
            self.assertEqual(imported["counts"]["pull_requests"], 1)
            self.assertEqual(imported["counts"]["ci_runs"], 1)
            self.assertEqual(imported["run_id"], run_id)
            self.assertFalse(imported["privacy"]["append_performed"])
            self.assertFalse(imported["privacy"]["external_fetch_performed"])
            self.assertTrue(imported["privacy"]["raw_export_fields_ignored"])
            self.assertTrue(imported["privacy"]["metadata_redaction_applied"])
            self.assertIn("token", imported["privacy"]["metadata_redaction_rules"])
            self.assertEqual(load_events(workspace), [])
            self.assertEqual(imported["items"][0]["url"], "https://github.com/owner/repo/pull/42")
            self.assertEqual(imported["items"][1]["url"], "https://github.com/owner/repo/actions/runs/100")
            self.assertEqual(imported["items"][0]["task_id"], task["task_id"])
            self.assertEqual(imported["items"][1]["task_id"], task["task_id"])
            self.assertNotIn("SECRET", import_result.stdout)
            self.assertNotIn("user:pass", import_result.stdout)

            reviewed_file = workspace / "reviewed-import.json"
            reviewed_file.write_text(json.dumps({"items": imported["items"]}, ensure_ascii=False), encoding="utf-8")
            append_result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "append-pr-ci-evidence",
                "--input",
                str(reviewed_file),
                "--format",
                "json",
            )
            appended = json.loads(append_result.stdout)
            detail = build_operator_task_detail_payload(workspace, task["task_id"])
            self.assertEqual(appended["counts"]["total"], 2)
            self.assertEqual(detail["pr_ci_evidence"]["counts"]["total"], 2)
            self.assertEqual(detail["pr_ci_evidence"]["counts"]["successful"], 1)

    def test_forward_import_pr_ci_evidence_rejects_mismatched_run_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            repo = LoopStateRepository(workspace)
            run_id = RunService(repo).create_run("PR CI importer rejection")["run_id"]
            iteration_id = IterationService(repo).append_iteration(run_id, "Reject mismatched run")["iteration_id"]
            task = repo.create_operator_task(
                task_id="otask-pr-ci-import-reject",
                title="Reject mismatched import",
                objective="Reject evidence for wrong run",
                status="in_review",
                priority="high",
                linked_run_id=run_id,
                linked_iteration_id=iteration_id,
            )
            export_file = workspace / "github-export.json"
            export_file.write_text(
                json.dumps(
                    {
                        "workflow_runs": [
                            {
                                "id": 100,
                                "name": "tests",
                                "status": "completed",
                                "conclusion": "success",
                                "html_url": "https://github.com/owner/repo/actions/runs/100",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            result = self.run_cli(
                "--workspace",
                str(workspace),
                "forward",
                "import-pr-ci-evidence",
                "--input",
                str(export_file),
                "--task-id",
                task["task_id"],
                "--run-id",
                "other-run",
                "--format",
                "json",
                check=False,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("does not match task", result.stderr)
            self.assertEqual(load_events(workspace), [])

    def test_forward_flag_alias_maps_status_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            result = self.run_cli("--workspace", str(workspace), "--forward", "status")
            self.assertIn("Forward Runtime Status", result.stdout)
            self.assertIn("Default runtime: legacy", result.stdout)

    def test_forward_flag_rejects_non_status_legacy_commands(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            result = self.run_cli("--workspace", str(workspace), "--forward", "start", check=False)
            self.assertEqual(result.returncode, 2)
            self.assertIn("--forward currently supports only the read-only 'status' command", result.stderr)
