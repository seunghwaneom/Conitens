from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_contracts import parse_contract_file
from ensemble_events import append_event, load_events
from ensemble_gate import list_gate_records, read_gate_record
from ensemble_hooks import install_hooks, run_post_commit
from ensemble_handoff import list_handoffs
from ensemble_mcp_server import call_tool, handle_request
from ensemble_meeting import end_meeting, list_meetings, meeting_path, start_meeting, summary_path, say
from ensemble_office import collect_office_snapshot, generate_report
from ensemble_registry import registry_summary
from ensemble_workflow import explain_workflow, resume_workflow, run_workflow


class OperationsLayerTests(unittest.TestCase):
    def cli_env(self) -> dict[str, str]:
        return {
            **os.environ,
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
        }

    def test_contract_parser_reads_workflow(self) -> None:
        document = parse_contract_file(ROOT / ".agent" / "workflows" / "verify-close.md")
        self.assertEqual(document.frontmatter["schema_v"], 1)
        self.assertEqual(document.frontmatter["slug"], "verify-close")
        self.assertEqual(len(document.frontmatter["steps"]), 2)

    def prepare_registered_workspace(self, workspace: Path, *workflow_names: str) -> None:
        (workspace / ".agent" / "rules").mkdir(parents=True, exist_ok=True)
        (workspace / ".agent" / "workflows").mkdir(parents=True, exist_ok=True)
        (workspace / ".agent" / "rules" / "ensemble-protocol.md").write_text(
            (ROOT / ".agent" / "rules" / "ensemble-protocol.md").read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        for name in workflow_names:
            source = ROOT / "tests" / "fixtures" / "workflows" / name
            (workspace / ".agent" / "workflows" / name).write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    def prepare_control_plane_workspace(self, workspace: Path) -> None:
        for relative in [
            Path(".agent/rules/ensemble-protocol.md"),
            *sorted((path.relative_to(ROOT) for path in (ROOT / ".agent" / "workflows").glob("*.md")), key=lambda item: str(item)),
            *sorted((path.relative_to(ROOT) for path in (ROOT / ".agent" / "agents").glob("*.yaml")), key=lambda item: str(item)),
            *sorted((path.relative_to(ROOT) for path in (ROOT / ".agent" / "skills").glob("*.yaml")), key=lambda item: str(item)),
            Path(".agent/policies/gates.yaml"),
        ]:
            destination = workspace / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text((ROOT / relative).read_text(encoding="utf-8"), encoding="utf-8")

    def test_event_append_redacts_sensitive_values(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            event = append_event(
                workspace,
                event_type="TEST_EVENT",
                payload={"token": "sk-secret123", "path": r"C:\\Users\\tester\\secret.txt"},
            )
            self.assertTrue((workspace / ".notes" / "events" / "events.jsonl").exists())
            self.assertTrue(event["redaction"]["applied"])
            self.assertIn("[REDACTED]", json.dumps(event["payload"]))

    def test_meeting_flow_creates_append_only_transcript_and_summary(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            result = start_meeting(workspace, topic="Decide rollout", actor="CODEX", task_id="TASK-001")
            meeting_id = result["meeting_id"]
            say(workspace, meeting_id=meeting_id, sender="GEMINI", text="DECISION: use static office first")
            say(workspace, meeting_id=meeting_id, sender="CLAUDE", text="ACTION: add html report", content_type="action_item")
            end_meeting(workspace, meeting_id=meeting_id, actor="CODEX", summary_mode="decisions")

            transcript_rows = meeting_path(workspace, meeting_id).read_text(encoding="utf-8").strip().splitlines()
            self.assertEqual(len(transcript_rows), 4)
            self.assertTrue(summary_path(workspace, meeting_id).exists())
            meetings = list_meetings(workspace)
            self.assertEqual(meetings[0]["status"], "ended")

    def test_workflow_verify_close_smoke(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_registered_workspace(workspace)
            (workspace / ".agent" / "workflows" / "verify-close.md").write_text(
                (ROOT / ".agent" / "workflows" / "verify-close.md").read_text(encoding="utf-8"),
                encoding="utf-8",
            )

            sample = workspace / "sample_smoke.py"
            sample.write_text("print('ok')\n", encoding="utf-8")

            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "ensemble.py"),
                    "--workspace",
                    str(workspace),
                    "new",
                    "--mode",
                    "SOLO",
                    "--case",
                    "MODIFY",
                    "--agent",
                    "CODEX",
                    "--title",
                    "workflow smoke",
                ],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )
            subprocess.run(
                [sys.executable, str(SCRIPTS / "ensemble.py"), "--workspace", str(workspace), "start", "--agent", "CODEX"],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "ensemble.py"),
                    "--workspace",
                    str(workspace),
                    "log",
                    "--done",
                    "created smoke file",
                    "--change",
                    "sample_smoke.py",
                    "--next",
                    "DONE",
                    "--agent",
                    "CODEX",
                ],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )

            focus_file = workspace / ".notes" / "ACTIVE" / "_focus.md"
            task_id = None
            for line in focus_file.read_text(encoding="utf-8").splitlines():
                if line.startswith("current_task:"):
                    task_id = line.split(":", 1)[1].strip()
            self.assertIsNotNone(task_id)

            result = run_workflow(workspace, "verify-close", {"task_id": task_id, "files": "sample_smoke.py"}, actor="TEST")
            self.assertEqual(result["status"], "passed")
            completed = list((workspace / ".notes" / "COMPLETED").glob("TASK-COMPLETED-*.md"))
            self.assertTrue(completed)
            event_types = [event["type"] for event in load_events(workspace)]
            self.assertIn("VERIFY_RESULT", event_types)
            self.assertIn("TASK_STATUS_CHANGED", event_types)

    def test_workflow_explain_rejects_invalid_kind(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_registered_workspace(workspace, "invalid-kind.md")
            result = explain_workflow(workspace, "invalid-kind")
            self.assertFalse(result["ready"])
            self.assertTrue(any("unsupported kind" in error for error in result["errors"]))

    def test_workflow_explain_rejects_undefined_template_variable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_registered_workspace(workspace, "missing-input-definition.md")
            result = explain_workflow(workspace, "missing-input-definition", {"task_id": "TASK-1"})
            self.assertFalse(result["ready"])
            self.assertTrue(any("template variable" in error for error in result["errors"]))

    def test_workflow_dry_run_returns_preview_without_step_execution(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_registered_workspace(workspace, "valid-explain.md")
            result = run_workflow(workspace, "valid-explain", {"name": "codex"}, actor="TEST", dry_run=True)
            self.assertEqual(result["status"], "dry-run")
            events = load_events(workspace)
            self.assertFalse(any(event["type"] == "WORKFLOW_STEP_STARTED" for event in events))

    def test_registry_summary_reads_control_plane_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            summary = registry_summary(workspace)
            self.assertEqual(summary["metrics"]["agent_count"], 4)
            self.assertEqual(summary["metrics"]["skill_count"], 7)
            self.assertGreaterEqual(summary["metrics"]["workflow_count"], 6)
            self.assertEqual(summary["metrics"]["gate_action_count"], 4)
            self.assertEqual(summary["errors"], [])

    def test_workflow_explain_supports_agent_parallel_and_emit_event_kinds(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            research = explain_workflow(
                workspace,
                "wf.research-plan-validate",
                {"task_id": "TASK-1", "topic": "workflow", "research_cmd": "python -c \"print('research')\""},
            )
            parallel = explain_workflow(workspace, "wf.parallel-workcell", {"task_id": "TASK-1"})
            self.assertTrue(research["ready"])
            self.assertTrue(parallel["ready"])
            self.assertTrue(any(step["kind"] == "emit_event" for step in research["steps"]))
            self.assertTrue(any(step["kind"] == "parallel" for step in parallel["steps"]))
            self.assertTrue(any(step["kind"] == "join" for step in parallel["steps"]))

    def test_parallel_workcell_is_reserved_without_feature_flag(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            result = run_workflow(workspace, "wf.parallel-workcell", {"task_id": "TASK-1"}, actor="TEST")
            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["steps"][0]["status"], "reserved")

    def test_manager_owned_agent_step_does_not_force_typed_handoff(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            result = run_workflow(
                workspace,
                "wf.research-plan-validate",
                {"task_id": "TASK-1", "topic": "manager-call", "research_cmd": "python -c \"print('research')\""},
                actor="MANAGER",
            )
            self.assertEqual(result["status"], "passed")
            self.assertEqual(list_handoffs(workspace), [])

    def test_workflow_pause_resume_creates_handoff_and_office_visibility(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)

            sample = workspace / "sample_smoke.py"
            sample.write_text("print('ok')\n", encoding="utf-8")

            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "ensemble.py"),
                    "--workspace",
                    str(workspace),
                    "new",
                    "--mode",
                    "SOLO",
                    "--case",
                    "MODIFY",
                    "--agent",
                    "CODEX",
                    "--title",
                    "workflow pause resume",
                ],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )
            subprocess.run(
                [sys.executable, str(SCRIPTS / "ensemble.py"), "--workspace", str(workspace), "start", "--agent", "CODEX"],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )
            subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "ensemble.py"),
                    "--workspace",
                    str(workspace),
                    "log",
                    "--done",
                    "prepared workflow file",
                    "--change",
                    "sample_smoke.py",
                    "--next",
                    "Run plan workflow",
                    "--agent",
                    "CODEX",
                ],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )

            task_id = None
            for line in (workspace / ".notes" / "ACTIVE" / "_focus.md").read_text(encoding="utf-8").splitlines():
                if line.startswith("current_task:"):
                    task_id = line.split(":", 1)[1].strip()
            self.assertIsNotNone(task_id)

            paused = run_workflow(
                workspace,
                "wf.plan-execute-validate",
                {
                    "task_id": task_id,
                    "files": "sample_smoke.py",
                    "summary": "Implement delegated sample flow",
                    "implement_cmd": "python -c \"print('delegated implementation')\"",
                    "approval_question": "Approve delegated sample flow?",
                },
                actor="MANAGER",
            )
            self.assertEqual(paused["status"], "waiting-approval")
            self.assertTrue(paused["waiting_on"]["question_id"].startswith("Q-"))
            self.assertTrue(paused["waiting_on"]["gate_id"].startswith("G-"))
            gate_record = read_gate_record(workspace, paused["waiting_on"]["gate_id"])
            self.assertIsNotNone(gate_record)
            self.assertEqual(gate_record["status"], "pending")

            subprocess.run(
                [sys.executable, str(SCRIPTS / "ensemble.py"), "--workspace", str(workspace), "init-owner"],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )
            subprocess.run(
                [sys.executable, str(SCRIPTS / "ensemble.py"), "--workspace", str(workspace), "approve", "--latest"],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )

            resumed = resume_workflow(workspace, paused["run_id"], actor="MANAGER")
            self.assertEqual(resumed["status"], "passed")
            self.assertTrue((workspace / ".notes" / "workflows" / f"{paused['run_id']}.json").exists())
            self.assertTrue((workspace / ".notes" / "WORKFLOWS" / f"{paused['run_id']}.json").exists())
            handoffs = list_handoffs(workspace)
            self.assertEqual(len(handoffs), 1)
            self.assertEqual(handoffs[0]["status"], "completed")
            self.assertTrue((workspace / ".notes" / "handoffs" / f"{handoffs[0]['handoff_id']}.json").exists())
            self.assertTrue((workspace / ".notes" / "HANDOFFS" / f"{handoffs[0]['handoff_id']}.json").exists())
            gate_records = list_gate_records(workspace)
            self.assertEqual(len(gate_records), 1)
            self.assertEqual(gate_records[0]["status"], "resumed")
            self.assertTrue((workspace / ".notes" / "gates" / f"{gate_records[0]['gate_id']}.json").exists())
            self.assertTrue((workspace / ".notes" / "GATES" / f"{gate_records[0]['gate_id']}.json").exists())

            snapshot = collect_office_snapshot(workspace)
            self.assertEqual(snapshot["metrics"]["handoffs"], 1)
            self.assertEqual(snapshot["metrics"]["gates"], 1)
            self.assertGreaterEqual(snapshot["metrics"]["workflow_runs"], 1)
            report = generate_report(workspace, "md")
            report_text = report.read_text(encoding="utf-8")
            self.assertIn("Gates", report_text)
            self.assertIn("Handoffs", report_text)
            self.assertIn("Control Plane", report_text)

    def test_office_report_hooks_and_mcp_smoke(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            (workspace / ".notes" / "ACTIVE").mkdir(parents=True, exist_ok=True)
            (workspace / ".notes" / "WORKFLOWS").mkdir(parents=True, exist_ok=True)
            (workspace / ".notes" / "context").mkdir(parents=True, exist_ok=True)
            (workspace / ".notes" / "ACTIVE" / "TASK-ACTIVE-20260311-001-demo.md").write_text(
                "---\n"
                "task_id: TASK-ACTIVE-20260311-001-demo\n"
                "status: ACTIVE\n"
                "verify_status: PASS\n"
                "owner: CODEX\n"
                "updated_at: 2026-03-10T10:00:00+09:00\n"
                "---\n"
                "# Demo Task\n",
                encoding="utf-8",
            )
            (workspace / ".notes" / "context" / "LATEST_CONTEXT.md").write_text("# LATEST CONTEXT\n", encoding="utf-8")
            (workspace / ".notes" / "WORKFLOWS" / "run-20260311-demo.json").write_text(
                json.dumps(
                    {
                        "run_id": "run-20260311-demo",
                        "workflow_id": "verify-close",
                        "status": "failed",
                        "actor": "CODEX",
                        "started_at": "2026-03-11T00:00:00Z",
                        "steps": [{"id": "verify", "status": "failed", "stderr": "verify failed"}],
                        "validation_errors": [],
                    }
                ),
                encoding="utf-8",
            )

            hook_dir = install_hooks(workspace)
            self.assertTrue((hook_dir / "pre-commit").exists())
            post_commit = run_post_commit(workspace)
            self.assertEqual(post_commit["status"], "PASS")

            report = generate_report(workspace, "md")
            self.assertTrue(report.exists())
            report_text = report.read_text(encoding="utf-8")
            self.assertIn("Conitens Office Report", report_text)
            self.assertIn("Workflow Runs", report_text)
            self.assertIn("Gates", report_text)
            self.assertIn("Control Plane", report_text)
            self.assertIn("Context Freshness", report_text)
            self.assertIn("Why Blocked", report_text)

            tasks = call_tool(workspace, "task.list")
            self.assertEqual(len(tasks), 1)
            registry = call_tool(workspace, "registry.summary")
            self.assertEqual(registry["metrics"]["agent_count"], 4)
            self.assertEqual(call_tool(workspace, "handoffs.list"), [])
            workflow_runs = call_tool(workspace, "workflow.runs")
            self.assertEqual(len(workflow_runs), 1)
            office_snapshot = call_tool(workspace, "office.snapshot")
            self.assertEqual(office_snapshot["metrics"]["workflow_runs"], 1)
            self.assertEqual(office_snapshot["metrics"]["gates"], 0)
            response = handle_request(workspace, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
            self.assertIn("tools", response["result"])
            tool_names = {tool["name"] for tool in response["result"]["tools"]}
            self.assertIn("registry.summary", tool_names)
            self.assertIn("handoffs.list", tool_names)
            self.assertIn("workflow.runs", tool_names)
            resources = handle_request(workspace, {"jsonrpc": "2.0", "id": 2, "method": "resources/list"})
            self.assertIn("resources", resources["result"])
            prompts = handle_request(workspace, {"jsonrpc": "2.0", "id": 3, "method": "prompts/list"})
            self.assertIn("prompts", prompts["result"])
            prompt = handle_request(
                workspace,
                {"jsonrpc": "2.0", "id": 4, "method": "prompts/get", "params": {"name": "workflow.blocked-summary", "arguments": {}}},
            )
            self.assertIn("prompt", prompt["result"])


if __name__ == "__main__":
    unittest.main()
