from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_contracts import parse_contract_file
from ensemble_events import append_event, load_events
from ensemble_gate import list_gate_records, read_gate_record
from ensemble_hooks import check_action_policy, install_hooks, run_post_commit
from ensemble_handoff import list_handoffs
from ensemble_agents import hire_agent
from ensemble_memory import append_long_term_memory, append_shared_memory, initialize_agent_memory, show_memory
from ensemble_mcp_server import call_tool, handle_request
from ensemble_meeting import end_meeting, list_meetings, meeting_path, start_meeting, summary_path, say
from ensemble_office import collect_office_snapshot, generate_report
from ensemble_provider_render import build_provider_command, build_provider_render_values
from ensemble_room import create_room, export_room_markdown, post_room_message, show_room
from ensemble_registry import registry_summary
from ensemble_spawn import start_spawn
from ensemble_ui import launch_web_ui, render_tui_snapshot
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
            Path(".agent/policies/blocking_gates.yaml"),
            *sorted((path.relative_to(ROOT) for path in (ROOT / ".agent" / "providers").glob("*.yaml")), key=lambda item: str(item)),
            *sorted((path.relative_to(ROOT) for path in (ROOT / ".agent" / "workspaces").glob("*.yaml")), key=lambda item: str(item)),
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

    def test_parallel_workcell_runs_when_feature_flag_is_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            result = run_workflow(
                workspace,
                "wf.parallel-workcell",
                {"task_id": "TASK-1", "parallel_feature_flag": "true"},
                actor="TEST",
            )
            self.assertEqual(result["status"], "passed")
            self.assertEqual(result["steps"][0]["status"], "passed")
            self.assertEqual(result["steps"][1]["status"], "passed")
            self.assertEqual(len(list_handoffs(workspace)), 1)

    def test_parallel_workcell_fails_on_lease_conflict(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            conflict_workflow = workspace / ".agent" / "workflows" / "conflict.md"
            conflict_workflow.write_text(
                "---\n"
                "schema_v: 1\n"
                "name: \"Conflict\"\n"
                "slug: \"conflict\"\n"
                "inputs:\n"
                "  task_id:\n"
                "    type: string\n"
                "    required: true\n"
                "steps:\n"
                "  - id: fanout\n"
                "    kind: parallel\n"
                "    on_fail: stop\n"
                "    branches:\n"
                "      - id: a\n"
                "        lease_paths: [\"workspace/shared\"]\n"
                "        cmd: \"python -c \\\"print('a')\\\"\"\n"
                "      - id: b\n"
                "        lease_paths: [\"workspace/shared\"]\n"
                "        cmd: \"python -c \\\"print('b')\\\"\"\n"
                "---\n",
                encoding="utf-8",
            )
            result = run_workflow(
                workspace,
                "conflict",
                {"task_id": "TASK-1", "parallel_feature_flag": "true"},
                actor="TEST",
            )
            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["steps"][0]["status"], "failed")
            self.assertTrue(result["steps"][0]["lease_conflicts"])

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

            cli_resources = subprocess.run(
                [sys.executable, str(SCRIPTS / "ensemble.py"), "--workspace", str(workspace), "mcp", "resources"],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )
            self.assertIn("conitens://office/snapshot", cli_resources.stdout)
            cli_prompt = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "ensemble.py"),
                    "--workspace",
                    str(workspace),
                    "mcp",
                    "prompt-get",
                    "--prompt",
                    "workflow.blocked-summary",
                    "--arguments",
                    "{}",
                ],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )
            self.assertIn("run-20260311-demo", cli_prompt.stdout)

    def test_blocking_hook_and_spawn_flow_require_approval_then_launch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            provider_dir = workspace / ".agent" / "providers"
            provider_dir.mkdir(parents=True, exist_ok=True)
            (provider_dir / "python-test.yaml").write_text(
                "\n".join(
                    [
                        "schema_v: 1",
                        "provider_id: python-test",
                        "label: Python Test",
                        "command: python",
                        "args: [-c, \"print('spawn-ok')\"]",
                        "supports_workspace_launch: true",
                        "supports_subagents: false",
                        "platforms: [windows, linux, macos]",
                        "",
                    ]
                ),
                encoding="utf-8",
            )

            blocked = check_action_policy(workspace, action="spawn.start", actor="TEST", task_id="TASK-1", subject_ref="TASK-1")
            self.assertEqual(blocked["status"], "blocked")
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

            launched = start_spawn(
                workspace,
                provider_id="python-test",
                agent_id="validator-sentinel",
                workspace_id="default",
                actor="TEST",
                task_id="TASK-1",
            )
            self.assertEqual(launched["status"], "running")
            self.assertTrue((workspace / ".notes" / "subagents" / "ACTIVE" / f"{launched['spawn_id']}.json").exists())
            self.assertGreaterEqual(len(list_gate_records(workspace)), 1)

    def test_spawn_approval_is_consumed_after_one_launch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            subprocess.run(
                [sys.executable, str(SCRIPTS / "ensemble.py"), "--workspace", str(workspace), "init-owner"],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )
            blocked = check_action_policy(workspace, action="spawn.start", actor="TEST", task_id="TASK-1", subject_ref="TASK-1")
            gate_id = blocked["gate_id"]
            subprocess.run(
                [sys.executable, str(SCRIPTS / "ensemble.py"), "--workspace", str(workspace), "approve", "--latest"],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )

            allowed = check_action_policy(workspace, action="spawn.start", actor="TEST", task_id="TASK-1", subject_ref="TASK-1")
            self.assertEqual(allowed["status"], "allow")
            self.assertEqual(read_gate_record(workspace, gate_id)["status"], "consumed")

            blocked_again = check_action_policy(
                workspace,
                action="spawn.start",
                actor="TEST",
                task_id="TASK-1",
                subject_ref="TASK-1",
                consume_on_allow=False,
            )
            self.assertEqual(blocked_again["status"], "blocked")

    def test_hire_agent_respects_spawn_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            blocked = hire_agent(
                workspace,
                agent_id="validator-sentinel",
                provider_id="claude-code",
                task_prompt="Inspect auth changes.",
                actor="TEST",
                task_id="TASK-2",
                workspace_id="root",
                spawn_process=False,
            )
            self.assertEqual(blocked["status"], "blocked")
            self.assertIn("question_id", blocked)

    def test_provider_workflow_waits_for_spawn_approval(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            provider_dir = workspace / ".agent" / "providers"
            provider_dir.mkdir(parents=True, exist_ok=True)
            (provider_dir / "python-test.yaml").write_text(
                "\n".join(
                    [
                        "schema_v: 1",
                        "provider_id: python-test",
                        "runtime: python",
                        "display_name: Python Test",
                        "launch_mode: prompt",
                        "command: python",
                        'args: ["-c", "print(\\"spawn-ok\\")"]',
                        "supported_platforms: [win32, linux, darwin]",
                        "capabilities: [prompt, cwd, detached]",
                        "notes: test",
                        "",
                    ]
                ),
                encoding="utf-8",
            )
            workflow_path = workspace / ".agent" / "workflows" / "spawn-gated.md"
            workflow_path.write_text(
                "\n".join(
                    [
                        "---",
                        "schema_v: 1",
                        'name: "Spawn Gated Workflow"',
                        'slug: "spawn-gated"',
                        "inputs:",
                        "  task_id:",
                        "    type: string",
                        "    required: true",
                        "steps:",
                        "  - id: launch",
                        "    kind: agent",
                        "    agent_id: validator-sentinel",
                        "    provider_id: python-test",
                        "    workspace_id: default",
                        '    task_prompt: "Validate {{task_id}}"',
                        "    on_fail: stop",
                        "---",
                        "",
                    ]
                ),
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS / "ensemble_workflow.py"),
                    "--workspace",
                    str(workspace),
                    "run",
                    "--workflow",
                    "spawn-gated",
                    "--set",
                    "task_id=TASK-3",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.cli_env(),
            )
            self.assertEqual(result.returncode, 2)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "waiting-approval")
            self.assertEqual(payload["waiting_on"]["kind"], "approval")

    def test_provider_render_values_support_single_and_double_braces(self) -> None:
        provider = {
            "provider_id": "render-test",
            "command": "python",
            "args": [
                "-c",
                "print('{workspace_root}|{{task_prompt}}|{persona_file}|{{shared_memory_file}}')",
            ],
        }
        values = build_provider_render_values(
            workspace_root="/tmp/work",
            workspace_path="/tmp/work",
            task_id="TASK-9",
            agent_id="agent-a",
            room_id="room-1",
            memory_file="/tmp/memory.md",
            persona_file="/tmp/persona.md",
            shared_memory_file="/tmp/shared.md",
            task_prompt="do the thing",
            task_prompt_file="/tmp/prompt.md",
        )
        command = build_provider_command(provider, values)
        self.assertEqual(command[0], "python")
        self.assertIn("/tmp/work|do the thing|/tmp/persona.md|/tmp/shared.md", command[2])

    def test_memory_and_room_artifacts_are_append_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            paths = initialize_agent_memory(workspace, "claude-code", "implementer-subagent")
            self.assertTrue(Path(paths["persona_file"]).exists())

            append_long_term_memory(
                workspace,
                provider_id="claude-code",
                agent_id="implementer-subagent",
                author="TEST",
                text="Remember to verify auth changes before close.",
                tags=["auth", "verify"],
                task_id="TASK-1",
            )
            append_shared_memory(workspace, author="TEST", text="Shared reminder", task_id="TASK-1")
            room = create_room(workspace, name="auth-room", participants=["user", "implementer"], actor="TEST", task_id="TASK-1")
            post_room_message(workspace, room_id=room["room_id"], sender="user", text="Check the login flow.", task_id="TASK-1")

            longterm = show_memory(workspace, kind="longterm", provider_id="claude-code", agent_id="implementer-subagent")
            shared = show_memory(workspace, kind="shared")
            transcript = show_room(workspace, room["room_id"])
            export_path = export_room_markdown(workspace, room["room_id"])

            self.assertEqual(len(longterm["entries"]), 1)
            self.assertIn("Shared reminder", shared["content"])
            self.assertEqual(len(transcript["messages"]), 1)
            self.assertTrue(export_path.exists())

    def test_ui_helpers_render_terminal_and_web_views(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            (workspace / ".notes" / "ACTIVE").mkdir(parents=True, exist_ok=True)
            snapshot_text = render_tui_snapshot(workspace)
            self.assertIn("Conitens TUI", snapshot_text)

            launched = launch_web_ui(workspace, host="127.0.0.1", port=8876)
            try:
                self.assertTrue(Path(launched["path"]).exists())
                self.assertIn("http://127.0.0.1:8876/index.html", launched["url"])
                with urlopen("http://127.0.0.1:8876/api/dashboard", timeout=10) as response:
                    dashboard = json.loads(response.read().decode("utf-8"))
                self.assertIn("snapshot", dashboard)
                self.assertIn("shared_memory", dashboard)

                body = json.dumps({}).encode("utf-8")
                request = Request(
                    "http://127.0.0.1:8876/api/actions/update-context",
                    data=body,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with self.assertRaises(HTTPError) as exc_info:
                    urlopen(request, timeout=10)
                self.assertEqual(exc_info.exception.code, 403)
                exc_info.exception.close()

                authorized = Request(
                    "http://127.0.0.1:8876/api/actions/update-context",
                    data=body,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {launched['token']}",
                    },
                    method="POST",
                )
                with urlopen(authorized, timeout=10) as response:
                    update_result = json.loads(response.read().decode("utf-8"))
                self.assertTrue(update_result["ok"])
            finally:
                launched["server"].shutdown()

    def test_ui_launch_rejects_non_loopback_hosts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.prepare_control_plane_workspace(workspace)
            with self.assertRaises(ValueError):
                launch_web_ui(workspace, host="0.0.0.0", port=8877)


if __name__ == "__main__":
    unittest.main()
