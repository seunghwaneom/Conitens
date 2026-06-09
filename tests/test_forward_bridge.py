from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_approval import ApprovalInterruptAdapter
from ensemble_context_markdown import ContextRegenerator, TaskPlanWriterReader
from ensemble_events import append_event, load_events
from ensemble_forward_bridge import (
    build_operator_evidence_summary_payload,
    build_operator_runtime_roster_payload,
    build_operator_status_confidence_payload,
    build_operator_task_detail_payload,
    build_operator_turn_records_payload,
    build_operator_wake_readiness_payload,
    build_operator_workflow_contracts_payload,
    launch_forward_bridge,
)
from ensemble_insight_extractor import InsightExtractor
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_room_service import RoomService
from ensemble_run_service import RunService


class ForwardBridgeTests(unittest.TestCase):
    def prepare_workspace(self) -> tuple[Path, LoopStateRepository, str, str]:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".conitens" / "personas").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context" / "LATEST_CONTEXT.md").write_text("# LATEST_CONTEXT\n\nrepo digest\n", encoding="utf-8")
        repo = LoopStateRepository(root)
        run_id = RunService(repo).create_run("BE-1a bridge test")["run_id"]
        iteration_id = IterationService(repo).append_iteration(run_id, "Bridge iteration")["iteration_id"]
        TaskPlanWriterReader(repo).update_from_structured_input(
            run_id=run_id,
            current_plan="Forward bridge plan",
            objective="Expose read-only bridge routes",
            steps=[{"title": "Bridge step", "status": "in_progress", "owner": "sample-agent"}],
            acceptance_criteria=["bridge route returns json"],
            owner="sample-agent",
        )
        repo.record_validator_result(
            run_id=run_id,
            iteration_id=iteration_id,
            passed=False,
            issues=[{"message": "validator history visible"}],
            feedback_text="validator history visible",
        )
        approval = ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="shell_execution",
            action_payload={"command": "echo hi"},
        )
        ApprovalInterruptAdapter(root).decide(
            request_id=approval["request_id"],
            status="approved",
            reviewer="owner",
            reviewer_note="ok",
        )
        room = RoomService(root).create_room(
            name="review-room",
            room_type="review",
            participants=["user", "sample-agent"],
            actor="sample-agent",
            task_id=run_id,
            run_id=run_id,
            iteration_id=iteration_id,
        )
        RoomService(root).append_message(
            room_id=room["room_id"],
            sender="sample-agent",
            sender_kind="agent",
            text="DECISION: bridge stays read-only",
            run_id=run_id,
            iteration_id=iteration_id,
        )
        InsightExtractor(root).extract_from_room(room["room_id"])
        ContextRegenerator(repo).regenerate_all(run_id)
        return root, repo, run_id, iteration_id

    def test_runs_endpoint_requires_auth_and_returns_run_list(self) -> None:
        root, _repo, run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8882)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8882/api/runs", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                "http://127.0.0.1:8882/api/runs",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["runs"][0]["run_id"], run_id)
        self.assertIn("counts", payload["runs"][0])

    def test_run_detail_and_replay_endpoints_return_forward_data(self) -> None:
        root, _repo, run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8883)
        try:
            detail_request = Request(
                f"http://127.0.0.1:8883/api/runs/{run_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            replay_request = Request(
                f"http://127.0.0.1:8883/api/runs/{run_id}/replay",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail_payload = json.loads(response.read().decode("utf-8"))
            with urlopen(replay_request, timeout=10) as response:
                replay_payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(detail_payload["run"]["run_id"], run_id)
        self.assertTrue(detail_payload["iterations"])
        self.assertTrue(replay_payload["timeline"])
        self.assertTrue(replay_payload["validator_history"])
        self.assertTrue(replay_payload["approvals"])

    def test_operator_summary_endpoint_returns_projection_shape(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8887)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8887/api/operator/summary", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                "http://127.0.0.1:8887/api/operator/summary",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(payload["runs"]["total"], 1)
        self.assertEqual(payload["approvals"]["pending"], 1)
        self.assertEqual(payload["runs"]["awaiting_approval"], 1)
        self.assertEqual(payload["validation"]["failing_runs"], 1)
        self.assertEqual(payload["runs"]["latest_run_id"], run_id)
        self.assertIn("evidence", payload)
        self.assertIn("doctor", payload)
        self.assertIn("runtime_roster", payload)

    def test_operator_runtime_roster_endpoint_returns_read_only_projection(self) -> None:
        root, repo, run_id, _iteration_id = self.prepare_workspace()
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
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8911)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8911/api/operator/runtime-roster", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                "http://127.0.0.1:8911/api/operator/runtime-roster",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload_text = response.read().decode("utf-8")
                payload = json.loads(payload_text)
        finally:
            launched["server"].shutdown()

        self.assertIn(payload["status"], {"ok", "warning", "danger"})
        self.assertFalse(payload["privacy"]["environment_dumped"])
        self.assertFalse(payload["privacy"]["auth_tokens_exposed"])
        self.assertFalse(payload["privacy"]["raw_session_content_exposed"])
        self.assertGreaterEqual(payload["counts"]["agent_runtimes"], 4)
        codex = next(item for item in payload["runtimes"] if item["id"] == "codex")
        self.assertEqual(codex["category"], "agent_runtime")
        self.assertEqual(codex["session_status"], "observed")
        self.assertEqual(codex["latest_run_id"], run_id)
        self.assertTrue(codex["evidence_refs"])
        self.assertNotIn(str(root), payload_text)
        self.assertNotIn("Authorization", payload_text)
        self.assertNotIn("Bearer", payload_text)

    def test_operator_runtime_roster_endpoint_filters_agent_runtime_with_ux_hints(self) -> None:
        root, repo, run_id, _iteration_id = self.prepare_workspace()
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
        events_before = load_events(root)
        direct_payload = build_operator_runtime_roster_payload(
            root,
            probe_versions=False,
            runtime_id="codex",
            category="agent_runtime",
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8915)
        try:
            request = Request(
                "http://127.0.0.1:8915/api/operator/runtime-roster?runtime=codex&category=agent_runtime&probe_versions=0",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload_text = response.read().decode("utf-8")
                payload = json.loads(payload_text)
        finally:
            launched["server"].shutdown()

        self.assertEqual(direct_payload["counts"]["total"], 1)
        self.assertEqual(payload["scope"]["runtime_id"], "codex")
        self.assertEqual(payload["scope"]["category"], "agent_runtime")
        self.assertFalse(payload["scope"]["probe_versions"])
        self.assertEqual(payload["counts"]["total"], 1)
        self.assertEqual(payload["counts"]["agent_runtimes"], 1)
        self.assertEqual(payload["counts"]["toolchains"], 0)
        self.assertEqual(payload["runtimes"][0]["id"], "codex")
        self.assertEqual(payload["runtimes"][0]["session_status"], "observed")
        self.assertEqual(payload["ux_summary"]["preferred_agent_runtime"], "codex")
        self.assertTrue(payload["ux_summary"]["filter_active"])
        self.assertEqual(payload["operator_hints"][0]["readiness"], "observed")
        self.assertFalse(payload["privacy"]["provider_auth_commands_executed"])
        self.assertEqual(load_events(root), events_before)
        self.assertNotIn(str(root), payload_text)
        self.assertNotIn("Authorization", payload_text)
        self.assertNotIn("Bearer", payload_text)

    def test_operator_turn_records_endpoint_returns_metadata_without_transcript_content(self) -> None:
        root, repo, run_id, _iteration_id = self.prepare_workspace()
        room = repo.list_room_records(run_id=run_id)[0]
        repo.append_tool_event(
            room_id=room["room_id"],
            run_id=run_id,
            actor="sample-agent",
            tool_name="shell",
            payload={"command": "echo SECRET"},
        )
        direct_payload = build_operator_turn_records_payload(root, run_id=run_id, room_id=room["room_id"], limit=10)
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8912)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8912/api/operator/turn-records", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                f"http://127.0.0.1:8912/api/operator/turn-records?run_id={run_id}&room_id={room['room_id']}&limit=10",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload_text = response.read().decode("utf-8")
                payload = json.loads(payload_text)
        finally:
            launched["server"].shutdown()

        self.assertEqual(direct_payload["counts"]["messages"], 1)
        self.assertEqual(payload["counts"]["messages"], 1)
        self.assertEqual(payload["counts"]["tool_events"], 1)
        self.assertFalse(payload["privacy"]["message_content_exposed"])
        self.assertFalse(payload["privacy"]["tool_payload_values_exposed"])
        self.assertFalse(payload["privacy"]["raw_transcript_exposed"])
        self.assertNotIn("DECISION: bridge stays read-only", payload_text)
        self.assertNotIn("echo SECRET", payload_text)
        self.assertNotIn("Authorization", payload_text)
        self.assertNotIn("Bearer", payload_text)

    def test_operator_workflow_contracts_endpoint_returns_contracts_without_execution(self) -> None:
        root, _repo, _run_id, _iteration_id = self.prepare_workspace()
        workflows_dir = root / ".agent" / "workflows"
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
steps:
  - id: ask
    kind: approval
    question: "approve SECRET workflow {{task_id}}"
    on_fail: stop
  - id: run
    kind: cli
    cmd: "echo SECRET {{task_id}}"
    on_fail: stop
---

# Notes
""",
            encoding="utf-8",
        )
        events_before = load_events(root)
        direct_payload = build_operator_workflow_contracts_payload(root, workflow_ref="review-build")
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8913)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8913/api/operator/workflow-contracts", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                "http://127.0.0.1:8913/api/operator/workflow-contracts?workflow=review-build",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload_text = response.read().decode("utf-8")
                payload = json.loads(payload_text)
        finally:
            launched["server"].shutdown()

        self.assertEqual(direct_payload["counts"]["total"], 1)
        self.assertEqual(payload["counts"]["total"], 1)
        self.assertEqual(payload["counts"]["ready"], 1)
        self.assertEqual(payload["counts"]["requiring_approval"], 1)
        self.assertTrue(payload["router_contract"]["read_only"])
        self.assertFalse(payload["router_contract"]["execution_performed"])
        self.assertFalse(payload["router_contract"]["workflow_runs_created"])
        self.assertFalse(payload["router_contract"]["approval_bypassed"])
        self.assertFalse(payload["privacy"]["raw_workflow_body_exposed"])
        self.assertFalse(payload["privacy"]["rendered_command_values_exposed"])
        self.assertFalse(payload["privacy"]["rendered_payload_values_exposed"])
        contract = payload["contracts"][0]
        self.assertEqual(contract["slug"], "review-build")
        self.assertEqual(contract["required_inputs"], ["task_id"])
        self.assertTrue(contract["requires_approval"])
        self.assertEqual(load_events(root), events_before)
        self.assertNotIn("echo SECRET", payload_text)
        self.assertNotIn("approve SECRET workflow", payload_text)
        self.assertNotIn("Authorization", payload_text)
        self.assertNotIn("Bearer", payload_text)

    def test_operator_status_confidence_endpoint_returns_reasons_without_raw_content(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        room = repo.list_room_records(run_id=run_id)[0]
        task = repo.create_operator_task(
            task_id="otask-status-confidence",
            title="Status confidence",
            objective="Explain read-only status posture",
            status="in_review",
            priority="high",
            owner_agent_id="sample-agent",
            linked_run_id=run_id,
            linked_iteration_id=iteration_id,
            linked_room_ids=[room["room_id"]],
            acceptance=["bridge returns diagnostics"],
        )
        events_before = load_events(root)
        direct_payload = build_operator_status_confidence_payload(root, run_id=run_id, limit=20)
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8914)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8914/api/operator/status-confidence", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                f"http://127.0.0.1:8914/api/operator/status-confidence?run_id={run_id}&limit=20",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload_text = response.read().decode("utf-8")
                payload = json.loads(payload_text)
        finally:
            launched["server"].shutdown()

        self.assertEqual(direct_payload["counts"]["runs"], 1)
        self.assertEqual(payload["counts"]["runs"], 1)
        self.assertEqual(payload["counts"]["tasks"], 1)
        self.assertEqual(payload["counts"]["rooms"], 1)
        self.assertGreaterEqual(payload["counts"]["partial"], 1)
        self.assertTrue(payload["diagnostic_contract"]["read_only"])
        self.assertFalse(payload["diagnostic_contract"]["mutations_performed"])
        self.assertFalse(payload["diagnostic_contract"]["external_fetch_performed"])
        self.assertFalse(payload["privacy"]["message_content_exposed"])
        self.assertFalse(payload["privacy"]["tool_payload_values_exposed"])
        run_row = next(row for row in payload["diagnostics"] if row["id"] == f"run:{run_id}")
        task_row = next(row for row in payload["diagnostics"] if row["id"] == f"task:{task['task_id']}")
        self.assertIn("latest_validator_failed", run_row["reason_codes"])
        self.assertIn("latest_validator_failed", task_row["reason_codes"])
        self.assertEqual(load_events(root), events_before)
        self.assertNotIn("DECISION: bridge stays read-only", payload_text)
        self.assertNotIn("validator history visible", payload_text)
        self.assertNotIn("Authorization", payload_text)
        self.assertNotIn("Bearer", payload_text)

    def test_operator_wake_readiness_endpoint_combines_sources_without_scheduling(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        room = repo.list_room_records(run_id=run_id)[0]
        task = repo.create_operator_task(
            task_id="otask-wake-readiness",
            title="Wake readiness",
            objective="Expose read-only wake planning posture",
            status="in_review",
            priority="high",
            owner_agent_id="sample-agent",
            linked_run_id=run_id,
            linked_iteration_id=iteration_id,
            linked_room_ids=[room["room_id"]],
            acceptance=["bridge returns wake readiness"],
        )
        repo.append_tool_event(
            room_id=room["room_id"],
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            tool_name="shell",
            payload={"command": "echo SECRET wake bridge"},
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
        events_before = load_events(root)
        direct_payload = build_operator_wake_readiness_payload(root, run_id=run_id, limit=20)
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8916)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8916/api/operator/wake-readiness", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                f"http://127.0.0.1:8916/api/operator/wake-readiness?run_id={run_id}&limit=20",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload_text = response.read().decode("utf-8")
                payload = json.loads(payload_text)
        finally:
            launched["server"].shutdown()

        self.assertEqual(direct_payload["counts"]["returned"], payload["counts"]["returned"])
        self.assertEqual(payload["scope"]["run_id"], run_id)
        self.assertGreaterEqual(payload["counts"]["returned"], 3)
        self.assertGreaterEqual(payload["counts"]["needs_review"], 1)
        self.assertEqual(payload["source_projections"]["runtime_roster"]["preferred_agent_runtime"], "codex")
        task_candidate = next(row for row in payload["candidates"] if row["subject_id"] == task["task_id"])
        self.assertIn(task_candidate["readiness"], {"needs_review", "ready", "hold"})
        self.assertTrue(payload["wake_contract"]["read_only"])
        self.assertFalse(payload["wake_contract"]["scheduler_started"])
        self.assertFalse(payload["wake_contract"]["wake_messages_sent"])
        self.assertFalse(payload["wake_contract"]["task_status_mutated"])
        self.assertFalse(payload["wake_contract"]["provider_auth_commands_executed"])
        self.assertFalse(payload["privacy"]["message_content_exposed"])
        self.assertFalse(payload["privacy"]["tool_payload_values_exposed"])
        self.assertFalse(payload["privacy"]["raw_transcript_exposed"])
        self.assertEqual(load_events(root), events_before)
        self.assertNotIn("DECISION: bridge stays read-only", payload_text)
        self.assertNotIn("echo SECRET wake bridge", payload_text)
        self.assertNotIn("validator history visible", payload_text)
        self.assertNotIn("Authorization", payload_text)
        self.assertNotIn("Bearer", payload_text)

    def test_operator_runtime_and_evidence_payloads_redact_metric_labels(self) -> None:
        root, repo, run_id, _iteration_id = self.prepare_workspace()
        repo.append_orchestration_checkpoint(
            run_id=run_id,
            graph_kind="build",
            step_name="provider-call",
            state={"agent_id": "sample-agent"},
            loop_cost_metrics={
                "provider": "api_key=SECRET1234567890 /home/example",
                "model": "/home/example/model",
                "total_tokens": 42,
            },
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8912)
        try:
            headers = {"Authorization": f"Bearer {launched['token']}"}
            with urlopen(
                Request("http://127.0.0.1:8912/api/operator/evidence-summary", headers=headers),
                timeout=10,
            ) as response:
                evidence_text = response.read().decode("utf-8")
                evidence_payload = json.loads(evidence_text)
            with urlopen(
                Request("http://127.0.0.1:8912/api/operator/summary", headers=headers),
                timeout=10,
            ) as response:
                summary_text = response.read().decode("utf-8")
        finally:
            launched["server"].shutdown()

        self.assertEqual(evidence_payload["provider_calls"]["latest_provider"], "[REDACTED]")
        self.assertIsNone(evidence_payload["provider_calls"]["latest_model"])
        for payload_text in (evidence_text, summary_text):
            self.assertNotIn("SECRET1234567890", payload_text)
            self.assertNotIn("/home/example", payload_text)
            self.assertNotIn(str(root), payload_text)

    def test_operator_evidence_summary_prefers_provider_call_events(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        repo.append_orchestration_checkpoint(
            run_id=run_id,
            graph_kind="build",
            step_name="provider-call",
            state={"agent_id": "sample-agent"},
            loop_cost_metrics={
                "provider": "checkpoint-runtime",
                "model": "checkpoint-model",
                "total_tokens": 999,
                "estimated_cost": 9.99,
            },
        )
        with self.assertRaisesRegex(ValueError, "forbids raw content fields"):
            append_event(
                root,
                event_type="provider.call_recorded",
                actor={"type": "agent", "name": "sample-agent"},
                payload={
                    "provider": "codex",
                    "model": "gpt-5.4",
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "total_tokens": 15,
                    "estimated_cost": 0.03,
                    "latency_ms": 50,
                    "tool_calls_count": 2,
                    "pii_findings": 1,
                    "run_id": run_id,
                    "iteration_id": iteration_id,
                    "task_id": "otask-provider",
                    "agent_id": "sample-agent",
                    "evidence_refs": [f"run:{run_id}"],
                    "prompt": "raw prompt should not be accepted",
                },
            )
        append_event(
            root,
            event_type="provider.call_recorded",
            actor={"type": "agent", "name": "sample-agent"},
            payload={
                "provider": "codex",
                "model": "gpt-5.4",
                "input_tokens": 10,
                "output_tokens": 5,
                "total_tokens": 15,
                "estimated_cost": 0.03,
                "latency_ms": 50,
                "tool_calls_count": 2,
                "pii_findings": 1,
                "run_id": run_id,
                "iteration_id": iteration_id,
                "task_id": "otask-provider",
                "agent_id": "sample-agent",
                "evidence_refs": [f"run:{run_id}"],
            },
        )

        payload = build_operator_evidence_summary_payload(root)
        payload_text = json.dumps(payload, ensure_ascii=False)

        self.assertEqual(payload["provider_calls"]["source"], "event_log")
        self.assertTrue(payload["provider_calls"]["checkpoint_fallback_available"])
        self.assertEqual(payload["provider_calls"]["observed"], 1)
        self.assertEqual(payload["provider_calls"]["total_tokens"], 15)
        self.assertEqual(payload["provider_calls"]["tool_calls_count"], 2)
        self.assertEqual(payload["provider_calls"]["latest_provider"], "codex")
        self.assertEqual(payload["provider_calls"]["latest_model"], "gpt-5.4")
        self.assertEqual(payload["budget"]["event_log_sources"], 1)
        self.assertEqual(payload["budget"]["checkpoint_sources"], 1)
        self.assertEqual(payload["sensitivity"]["pii_findings"], 1)
        self.assertIn("event:provider.call_recorded:", payload["evidence_refs"][0])
        self.assertNotIn("raw prompt should not be accepted", payload_text)
        self.assertNotIn("checkpoint-runtime", payload_text)

    def test_operator_task_detail_projects_pr_ci_read_evidence(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        task = repo.create_operator_task(
            task_id="otask-pr-ci",
            title="Attach PR CI evidence",
            objective="Show read-only GitHub and CI posture on task detail",
            status="in_review",
            priority="high",
            owner_agent_id="sample-agent",
            linked_run_id=run_id,
            linked_iteration_id=iteration_id,
        )
        with self.assertRaisesRegex(ValueError, "forbids raw PR/CI content fields"):
            append_event(
                root,
                event_type="ci.evidence_observed",
                actor={"type": "system", "name": "ci-reader"},
                payload={
                    "provider": "github-actions",
                    "repository": "owner/repo",
                    "workflow": "tests",
                    "status": "completed",
                    "conclusion": "failure",
                    "task_id": task["task_id"],
                    "run_id": run_id,
                    "rawLog": "secret log should be rejected",
                    "authToken": "SECRET",
                },
            )
        append_event(
            root,
            event_type="pr.evidence_observed",
            actor={"type": "system", "name": "github-reader"},
            scope={"task_id": task["task_id"]},
            payload={
                "provider": "github",
                "repository": "owner/repo",
                "pr_number": 42,
                "title": "Add operator evidence",
                "status": "open",
                "conclusion": None,
                "url": "https://github.com/owner/repo/pull/42?token=SECRET#files",
                "branch": "feature/evidence",
                "commit_sha": "abcdef1234567890",
                "task_id": task["task_id"],
                "observed_at": "2026-06-07T08:00:00Z",
                "summary": "Review is waiting on CI.",
                "evidence_refs": ["github:pr:42"],
            },
        )
        append_event(
            root,
            event_type="ci.evidence_observed",
            actor={"type": "system", "name": "ci-reader"},
            scope={"run_id": run_id},
            payload={
                "provider": "github-actions",
                "repository": "owner/repo",
                "workflow": "tests",
                "job": "unit",
                "ci_run_id": "ci-100",
                "status": "completed",
                "conclusion": "failure",
                "url": "https://github.com/owner/repo/actions/runs/100?check_suite_focus=true",
                "branch": "feature/evidence",
                "commit_sha": "abcdef1234567890",
                "run_id": run_id,
                "observed_at": "2026-06-07T08:01:00Z",
                "summary": "Unit tests failed.",
                "evidence_refs": ["github:actions:100"],
            },
        )
        append_event(
            root,
            event_type="ci.evidence_observed",
            actor={"type": "system", "name": "ci-reader"},
            payload={
                "provider": "github-actions",
                "repository": "owner/repo",
                "workflow": "deploy",
                "status": "completed",
                "conclusion": "success",
                "task_id": "other-task",
                "observed_at": "2026-06-07T08:02:00Z",
            },
        )

        detail = build_operator_task_detail_payload(root, task["task_id"])
        evidence = detail["pr_ci_evidence"]
        detail_text = json.dumps(detail, ensure_ascii=False)

        self.assertEqual(evidence["counts"]["total"], 2)
        self.assertEqual(evidence["counts"]["pull_requests"], 1)
        self.assertEqual(evidence["counts"]["ci_runs"], 1)
        self.assertEqual(evidence["counts"]["failing"], 1)
        self.assertEqual(evidence["counts"]["rejected"], 0)
        self.assertEqual(evidence["status"], "danger")
        self.assertEqual(evidence["items"][0]["kind"], "ci")
        self.assertEqual(evidence["items"][0]["commit_sha"], "abcdef123456")
        self.assertEqual(evidence["items"][1]["url"], "https://github.com/owner/repo/pull/42")
        self.assertFalse(evidence["privacy"]["external_fetch_performed"])
        self.assertFalse(evidence["privacy"]["auth_tokens_exposed"])
        self.assertFalse(evidence["privacy"]["raw_logs_exposed"])
        self.assertTrue(any("failing PR/CI" in suggestion for suggestion in evidence["resume_suggestions"]))
        self.assertNotIn("SECRET", detail_text)
        self.assertNotIn("secret log should be rejected", detail_text)
        self.assertNotIn("other-task", detail_text)

    def test_operator_evidence_doctor_and_reconcile_preview_are_read_only(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        repo.append_orchestration_checkpoint(
            run_id=run_id,
            graph_kind="build",
            step_name="provider-call",
            state={"agent_id": "sample-agent"},
            retry_count=1,
            approval_pending=True,
            loop_cost_metrics={
                "provider": "codex",
                "model": "gpt-5.4",
                "total_tokens": 321,
                "estimated_cost": 0.1234,
                "latency_ms": 250,
                "pii_findings": 0,
            },
        )
        repo.append_retry_decision(
            run_id=run_id,
            graph_kind="build",
            retry_index=1,
            decision="retry",
            reason="validator history visible",
        )
        task = repo.create_operator_task(
            task_id="otask-reconcile",
            title="Reconcile operator task",
            objective="Preview evidence-based task repair decisions",
            status="todo",
            priority="high",
            owner_agent_id="sample-agent",
            linked_run_id=run_id,
            linked_iteration_id=iteration_id,
        )
        pending = ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8910)
        try:
            for path in (
                "/api/operator/evidence-summary",
                "/api/operator/doctor-evidence",
                f"/api/operator/tasks/{task['task_id']}/reconcile-preview",
            ):
                with self.assertRaises(HTTPError) as unauth_exc:
                    urlopen(f"http://127.0.0.1:8910{path}", timeout=10)
                self.assertEqual(unauth_exc.exception.code, 403)
                unauth_exc.exception.close()

            headers = {"Authorization": f"Bearer {launched['token']}"}
            with urlopen(
                Request("http://127.0.0.1:8910/api/operator/evidence-summary", headers=headers),
                timeout=10,
            ) as response:
                evidence_payload = json.loads(response.read().decode("utf-8"))
            with urlopen(
                Request("http://127.0.0.1:8910/api/operator/doctor-evidence", headers=headers),
                timeout=10,
            ) as response:
                doctor_payload = json.loads(response.read().decode("utf-8"))
            with urlopen(
                Request(
                    f"http://127.0.0.1:8910/api/operator/tasks/{task['task_id']}/reconcile-preview",
                    headers=headers,
                ),
                timeout=10,
            ) as response:
                reconcile_payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(evidence_payload["provider_calls"]["observed"], 1)
        self.assertEqual(evidence_payload["provider_calls"]["total_tokens"], 321)
        self.assertFalse(evidence_payload["sensitivity"]["raw_content_exposed"])
        self.assertIn("bridge-auth", {check["id"] for check in doctor_payload["checks"]})
        self.assertEqual(reconcile_payload["task_id"], "otask-reconcile")
        self.assertTrue(str(reconcile_payload["decision_id"]).startswith("reconcile-"))
        self.assertEqual(reconcile_payload["recommended_status"], "blocked")
        self.assertTrue(reconcile_payload["requires_approval"])
        self.assertTrue(any(pending["request_id"] in ref for ref in reconcile_payload["evidence_refs"]))
        self.assertEqual(repo.get_operator_task("otask-reconcile"), task)
        self.assertEqual(len(repo.list_approval_requests(status="pending")), 1)

    def test_operator_inbox_endpoint_returns_projection_shape(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        pending = ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        repo.upsert_handoff_packet(
            handoff_id="handoff-1",
            run_id=run_id,
            iteration_id=iteration_id,
            from_actor="sample-agent",
            to_actor="reviewer",
            status="blocked",
            summary="Need reviewer attention",
            packet={"blocked_reason": "Need reviewer attention"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8888)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8888/api/operator/inbox", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                "http://127.0.0.1:8888/api/operator/inbox",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertGreaterEqual(payload["count"], 3)
        kinds = {item["kind"] for item in payload["items"]}
        self.assertIn("approval", kinds)
        self.assertIn("validator_failure", kinds)
        self.assertIn("handoff_attention", kinds)
        approval_item = next(item for item in payload["items"] if item["id"] == f"approval:{pending['request_id']}")
        self.assertEqual(approval_item["action_label"], "Review approval")

    def test_operator_agents_endpoint_returns_projection_shape(self) -> None:
        root, repo, run_id, iteration_id = self.prepare_workspace()
        ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8889)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8889/api/operator/agents", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            request = Request(
                "http://127.0.0.1:8889/api/operator/agents",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertGreaterEqual(payload["count"], 1)
        sample_agent = next(item for item in payload["agents"] if item["agent_id"] == "sample-agent")
        self.assertEqual(sample_agent["role"], "implementer")
        self.assertEqual(sample_agent["latest_run_id"], run_id)
        self.assertGreaterEqual(sample_agent["pending_approvals"], 1)

    def test_operator_tasks_endpoints_create_list_detail_update_archive_restore_and_delete(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8890)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8890/api/operator/tasks", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            create_request = Request(
                "http://127.0.0.1:8890/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Introduce canonical operator task",
                        "objective": "Create the first owned operator API slice",
                        "status": "todo",
                        "priority": "high",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "linked_room_ids": ["R-20260404-001"],
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            task_id = created["task"]["task_id"]
            list_request = Request(
                "http://127.0.0.1:8890/api/operator/tasks",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(list_request, timeout=10) as response:
                listed = json.loads(response.read().decode("utf-8"))

            detail_request = Request(
                f"http://127.0.0.1:8890/api/operator/tasks/{task_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail = json.loads(response.read().decode("utf-8"))

            patch_request = Request(
                f"http://127.0.0.1:8890/api/operator/tasks/{task_id}",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "title": "Updated operator task",
                        "objective": "Updated objective",
                        "status": "blocked",
                        "priority": "critical",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "linked_room_ids": ["R-20260404-001"],
                        "blocked_reason": "Waiting for approval",
                        "acceptance_json": ["updated"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(patch_request, timeout=10) as response:
                updated = json.loads(response.read().decode("utf-8"))

            archive_request = Request(
                f"http://127.0.0.1:8890/api/operator/tasks/{task_id}/archive",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "archive_note": "Completed and removed from the active queue.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(archive_request, timeout=10) as response:
                archived = json.loads(response.read().decode("utf-8"))

            with urlopen(list_request, timeout=10) as response:
                listed_after_archive = json.loads(response.read().decode("utf-8"))

            archived_list_request = Request(
                "http://127.0.0.1:8890/api/operator/tasks?include_archived=1",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(archived_list_request, timeout=10) as response:
                listed_with_archived = json.loads(response.read().decode("utf-8"))

            restore_request = Request(
                f"http://127.0.0.1:8890/api/operator/tasks/{task_id}/restore",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=b"{}",
            )
            with urlopen(restore_request, timeout=10) as response:
                restored = json.loads(response.read().decode("utf-8"))

            with self.assertRaises(HTTPError) as active_delete_exc:
                urlopen(delete_request := Request(
                    f"http://127.0.0.1:8890/api/operator/tasks/{task_id}",
                    headers={"Authorization": f"Bearer {launched['token']}"},
                    method="DELETE",
                ), timeout=10)
            self.assertEqual(active_delete_exc.exception.code, 409)
            active_delete_body = json.loads(active_delete_exc.exception.read().decode("utf-8"))

            with urlopen(archive_request, timeout=10) as response:
                archived_again = json.loads(response.read().decode("utf-8"))

            delete_request = Request(
                f"http://127.0.0.1:8890/api/operator/tasks/{task_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
                method="DELETE",
            )
            with urlopen(delete_request, timeout=10) as response:
                deleted = json.loads(response.read().decode("utf-8"))

            with urlopen(list_request, timeout=10) as response:
                listed_after_delete = json.loads(response.read().decode("utf-8"))

            with self.assertRaises(HTTPError) as missing_exc:
                urlopen(detail_request, timeout=10)
            self.assertEqual(missing_exc.exception.code, 404)
            missing_exc.exception.close()
        finally:
            launched["server"].shutdown()

        self.assertEqual(created["task"]["owner_agent_id"], "sample-agent")
        self.assertEqual(created["task"]["linked_run_id"], run_id)
        self.assertEqual(listed["count"], 1)
        self.assertEqual(detail["task"]["task_id"], task_id)
        self.assertEqual(detail["task"]["acceptance_json"], ["task exists"])
        self.assertEqual(updated["task"]["title"], "Updated operator task")
        self.assertEqual(updated["task"]["status"], "blocked")
        self.assertIsNotNone(archived["task"]["archived_at"])
        self.assertTrue(archived["task"]["archived_by"])
        self.assertEqual(archived["task"]["archive_note"], "Completed and removed from the active queue.")
        self.assertEqual(listed_after_archive["count"], 0)
        self.assertEqual(listed_with_archived["count"], 1)
        self.assertIsNone(restored["task"]["archived_at"])
        self.assertIsNone(restored["task"]["archived_by"])
        self.assertIsNone(restored["task"]["archive_note"])
        self.assertIn("requires archiving", active_delete_body["error"])
        self.assertIsNotNone(archived_again["task"]["archived_at"])
        self.assertEqual(deleted["deleted_task_id"], task_id)
        self.assertEqual(listed_after_delete["count"], 0)

    def test_operator_workspaces_endpoints_create_list_detail_and_update(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8896)
        try:
            with self.assertRaises(HTTPError) as unauth_exc:
                urlopen("http://127.0.0.1:8896/api/operator/workspaces", timeout=10)
            self.assertEqual(unauth_exc.exception.code, 403)
            unauth_exc.exception.close()

            create_request = Request(
                "http://127.0.0.1:8896/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "active",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "task_ids_json": ["otask-1"],
                        "notes": "Primary frontend workspace.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            workspace_id = created["workspace"]["workspace_id"]
            list_request = Request(
                "http://127.0.0.1:8896/api/operator/workspaces",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(list_request, timeout=10) as response:
                listed = json.loads(response.read().decode("utf-8"))

            detail_request = Request(
                f"http://127.0.0.1:8896/api/operator/workspaces/{workspace_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail = json.loads(response.read().decode("utf-8"))

            patch_request = Request(
                f"http://127.0.0.1:8896/api/operator/workspaces/{workspace_id}",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "blocked",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "task_ids_json": ["otask-1", "otask-2"],
                        "notes": "Blocked on review.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(patch_request, timeout=10) as response:
                updated = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(created["workspace"]["path"], "packages/dashboard")
        self.assertEqual(listed["count"], 1)
        self.assertEqual(detail["workspace"]["workspace_id"], workspace_id)
        self.assertEqual(updated["workspace"]["status"], "blocked")
        self.assertEqual(updated["workspace"]["task_ids_json"], [])

    def test_operator_workspace_archive_metadata_is_returned(self) -> None:
        root, _repo, _run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8901)
        try:
            create_request = Request(
                "http://127.0.0.1:8901/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-archived",
                        "label": "Archived repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "archived",
                        "archive_note": "Freeze the workspace after delivery.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            reactivate_request = Request(
                "http://127.0.0.1:8901/api/operator/workspaces/owork-archived",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "label": "Archived repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "active",
                    }
                ).encode("utf-8"),
            )
            with urlopen(reactivate_request, timeout=10) as response:
                restored = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIsNotNone(created["workspace"]["archived_at"])
        self.assertTrue(created["workspace"]["archived_by"])
        self.assertEqual(created["workspace"]["archive_note"], "Freeze the workspace after delivery.")
        self.assertIsNone(restored["workspace"]["archived_at"])
        self.assertIsNone(restored["workspace"]["archived_by"])
        self.assertIsNone(restored["workspace"]["archive_note"])

    def test_operator_workspace_patch_is_blocked_while_archived(self) -> None:
        root, _repo, _run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8903)
        try:
            create_request = Request(
                "http://127.0.0.1:8903/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-archived",
                        "label": "Archived repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "archived",
                        "archive_note": "Freeze the workspace after delivery.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10):
                pass

            patch_request = Request(
                "http://127.0.0.1:8903/api/operator/workspaces/owork-archived",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "label": "Archived repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "archived",
                        "archive_note": "Rewritten archive note.",
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(patch_request, timeout=10)
            self.assertEqual(exc_info.exception.code, 409)
            body = json.loads(exc_info.exception.read().decode("utf-8"))

            detail_request = Request(
                "http://127.0.0.1:8903/api/operator/workspaces/owork-archived",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("read-only until reactivated", body["error"])
        self.assertEqual(detail["workspace"]["archive_note"], "Freeze the workspace after delivery.")

    def test_operator_task_workspace_ref_requires_existing_workspace(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8897)
        try:
            create_request = Request(
                "http://127.0.0.1:8897/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Workspace-linked task",
                        "objective": "Reject unknown canonical workspace refs",
                        "status": "todo",
                        "priority": "medium",
                        "workspace_ref": "owork-missing",
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(create_request, timeout=10)
            self.assertEqual(exc_info.exception.code, 400)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("Operator workspace not found", body["error"])

    def test_operator_workspace_detail_derives_linked_task_refs_from_tasks(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8898)
        try:
            create_workspace = Request(
                "http://127.0.0.1:8898/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-dashboard",
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "active",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_workspace, timeout=10) as response:
                workspace_payload = json.loads(response.read().decode("utf-8"))

            create_task = Request(
                "http://127.0.0.1:8898/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Workspace-derived task",
                        "objective": "Link task to canonical workspace",
                        "status": "todo",
                        "priority": "medium",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "workspace_ref": "owork-dashboard",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_task, timeout=10) as response:
                task_payload = json.loads(response.read().decode("utf-8"))

            detail_request = Request(
                "http://127.0.0.1:8898/api/operator/workspaces/owork-dashboard",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(workspace_payload["workspace"]["workspace_id"], "owork-dashboard")
        self.assertEqual(task_payload["task"]["workspace_ref"], "owork-dashboard")
        self.assertEqual(detail["workspace"]["task_ids_json"], [task_payload["task"]["task_id"]])

    def test_operator_task_detach_workspace_updates_workspace_membership(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8902)
        try:
            create_workspace = Request(
                "http://127.0.0.1:8902/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-dashboard",
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "active",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_workspace, timeout=10):
                pass

            create_task = Request(
                "http://127.0.0.1:8902/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Workspace-detached task",
                        "objective": "Detach from workspace through bridge",
                        "status": "todo",
                        "priority": "medium",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "workspace_ref": "owork-dashboard",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_task, timeout=10) as response:
                task_payload = json.loads(response.read().decode("utf-8"))

            detach_task = Request(
                f"http://127.0.0.1:8902/api/operator/tasks/{task_payload['task']['task_id']}/detach-workspace",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=b"{}",
            )
            with urlopen(detach_task, timeout=10) as response:
                detached = json.loads(response.read().decode("utf-8"))

            detail_request = Request(
                "http://127.0.0.1:8902/api/operator/workspaces/owork-dashboard",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(detail_request, timeout=10) as response:
                detail = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIsNone(detached["task"]["workspace_ref"])
        self.assertEqual(detail["workspace"]["task_ids_json"], [])

    def test_operator_task_cannot_attach_new_archived_workspace(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8899)
        try:
            create_workspace = Request(
                "http://127.0.0.1:8899/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-archived",
                        "label": "Archived repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "archived",
                        "archive_note": "Archived workspace fixture.",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_workspace, timeout=10):
                pass

            create_task = Request(
                "http://127.0.0.1:8899/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Archived workspace task",
                        "objective": "Do not attach to archived workspace",
                        "status": "todo",
                        "priority": "medium",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "workspace_ref": "owork-archived",
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(create_task, timeout=10)
            self.assertEqual(exc_info.exception.code, 400)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("Archived operator workspace cannot accept new task links", body["error"])

    def test_operator_workspace_archive_is_blocked_when_active_tasks_are_linked(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8900)
        try:
            create_workspace = Request(
                "http://127.0.0.1:8900/api/operator/workspaces",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "workspace_id": "owork-dashboard",
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "active",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_workspace, timeout=10):
                pass

            create_task = Request(
                "http://127.0.0.1:8900/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Workspace-blocking task",
                        "objective": "Keep workspace active while task is attached",
                        "status": "todo",
                        "priority": "medium",
                        "workspace_ref": "owork-dashboard",
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_task, timeout=10):
                pass

            patch_workspace = Request(
                "http://127.0.0.1:8900/api/operator/workspaces/owork-dashboard",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "label": "Dashboard repo",
                        "path": "packages/dashboard",
                        "kind": "repo",
                        "status": "archived",
                        "archive_note": "Freeze this workspace after task cleanup.",
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(patch_workspace, timeout=10)
            self.assertEqual(exc_info.exception.code, 409)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("Workspace archiving requires detaching or archiving linked active tasks", body["error"])

    def test_operator_task_patch_is_blocked_when_linked_run_has_pending_approval(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        pending = ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8891)
        try:
            create_request = Request(
                "http://127.0.0.1:8891/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Approval-sensitive task",
                        "objective": "Do not allow execution-sensitive mutation while approval is pending",
                        "status": "todo",
                        "priority": "high",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            patch_request = Request(
                f"http://127.0.0.1:8891/api/operator/tasks/{created['task']['task_id']}",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "title": created["task"]["title"],
                        "objective": created["task"]["objective"],
                        "status": "in_progress",
                        "priority": created["task"]["priority"],
                        "owner_agent_id": created["task"]["owner_agent_id"],
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "linked_room_ids": [],
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(patch_request, timeout=10)
            self.assertEqual(exc_info.exception.code, 409)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(pending["status"], "pending")
        self.assertIn("pending approval", body["error"])

    def test_operator_task_request_approval_creates_task_linked_approval(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8892)
        try:
            create_request = Request(
                "http://127.0.0.1:8892/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Approval-requested task",
                        "objective": "Request task-scoped approval",
                        "status": "todo",
                        "priority": "high",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            request_approval = Request(
                f"http://127.0.0.1:8892/api/operator/tasks/{created['task']['task_id']}/request-approval",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "rationale": "Need explicit review",
                        "requested_changes": ["status", "owner_agent_id"],
                        "draft_snapshot": {
                            "status": "blocked",
                            "owner_agent_id": "sample-agent",
                        },
                    }
                ).encode("utf-8"),
            )
            with urlopen(request_approval, timeout=10) as response:
                approval = json.loads(response.read().decode("utf-8"))

            approvals_request = Request(
                f"http://127.0.0.1:8892/api/approvals?task_id={created['task']['task_id']}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(approvals_request, timeout=10) as response:
                approvals = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(approval["approval"]["task_id"], created["task"]["task_id"])
        self.assertEqual(approval["approval"]["action_type"], "operator_task_update")
        self.assertEqual(approval["approval"]["action_payload"]["rationale"], "Need explicit review")
        self.assertEqual(approval["approval"]["action_payload"]["requested_changes"], ["status", "owner_agent_id"])
        self.assertEqual(approvals["approvals"][0]["task_id"], created["task"]["task_id"])

    def test_operator_task_archive_is_blocked_when_task_has_pending_approval(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8893)
        try:
            create_request = Request(
                "http://127.0.0.1:8893/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Delete-guarded task",
                        "objective": "Do not delete while a task approval is pending",
                        "status": "todo",
                        "priority": "high",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            request_approval = Request(
                f"http://127.0.0.1:8893/api/operator/tasks/{created['task']['task_id']}/request-approval",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps({"rationale": "Need review before deleting"}).encode("utf-8"),
            )
            with urlopen(request_approval, timeout=10) as response:
                approval = json.loads(response.read().decode("utf-8"))

            archive_request = Request(
                f"http://127.0.0.1:8893/api/operator/tasks/{created['task']['task_id']}/archive",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps({"archive_note": "Queue it for cleanup after review."}).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(archive_request, timeout=10)
            self.assertEqual(exc_info.exception.code, 409)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(approval["approval"]["status"], "pending")
        self.assertIn("task has pending approval requests", body["error"])

    def test_operator_task_archive_is_blocked_when_linked_run_has_pending_approval(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        ApprovalInterruptAdapter(root).enqueue_request(
            run_id=run_id,
            iteration_id=iteration_id,
            actor="sample-agent",
            action_type="network_access",
            action_payload={"url": "https://example.com"},
        )
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8894)
        try:
            create_request = Request(
                "http://127.0.0.1:8894/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Archive-guarded task",
                        "objective": "Do not archive while linked run approvals are pending",
                        "status": "todo",
                        "priority": "high",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            archive_request = Request(
                f"http://127.0.0.1:8894/api/operator/tasks/{created['task']['task_id']}/archive",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps({"archive_note": "Hide it from the active queue."}).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(archive_request, timeout=10)
            self.assertEqual(exc_info.exception.code, 409)
            body = json.loads(exc_info.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("linked run", body["error"])

    def test_archived_operator_task_patch_and_approval_request_are_blocked(self) -> None:
        root, _repo, run_id, iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8895)
        try:
            create_request = Request(
                "http://127.0.0.1:8895/api/operator/tasks",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps(
                    {
                        "title": "Archived read-only task",
                        "objective": "Archived tasks should not accept edits or approval requests",
                        "status": "todo",
                        "priority": "medium",
                        "owner_agent_id": "sample-agent",
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with urlopen(create_request, timeout=10) as response:
                created = json.loads(response.read().decode("utf-8"))

            archive_request = Request(
                f"http://127.0.0.1:8895/api/operator/tasks/{created['task']['task_id']}/archive",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps({"archive_note": "Freeze further mutation."}).encode("utf-8"),
            )
            with urlopen(archive_request, timeout=10) as response:
                archived = json.loads(response.read().decode("utf-8"))

            patch_request = Request(
                f"http://127.0.0.1:8895/api/operator/tasks/{created['task']['task_id']}",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="PATCH",
                data=json.dumps(
                    {
                        "title": "Archived task edited",
                        "objective": created["task"]["objective"],
                        "status": "todo",
                        "priority": created["task"]["priority"],
                        "owner_agent_id": created["task"]["owner_agent_id"],
                        "linked_run_id": run_id,
                        "linked_iteration_id": iteration_id,
                        "linked_room_ids": [],
                        "acceptance_json": ["task exists"],
                    }
                ).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as patch_exc:
                urlopen(patch_request, timeout=10)
            self.assertEqual(patch_exc.exception.code, 409)
            patch_body = json.loads(patch_exc.exception.read().decode("utf-8"))

            approval_request = Request(
                f"http://127.0.0.1:8895/api/operator/tasks/{created['task']['task_id']}/request-approval",
                headers={
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                },
                method="POST",
                data=json.dumps({"rationale": "Try approval from archived task"}).encode("utf-8"),
            )
            with self.assertRaises(HTTPError) as approval_exc:
                urlopen(approval_request, timeout=10)
            self.assertEqual(approval_exc.exception.code, 409)
            approval_body = json.loads(approval_exc.exception.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIsNotNone(archived["task"]["archived_at"])
        self.assertIn("read-only", patch_body["error"])
        self.assertIn("cannot request approval", approval_body["error"])

    def test_state_docs_and_context_latest_routes_keep_digest_boundary(self) -> None:
        root, _repo, run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8884)
        try:
            state_docs_request = Request(
                f"http://127.0.0.1:8884/api/runs/{run_id}/state-docs",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            context_request = Request(
                f"http://127.0.0.1:8884/api/runs/{run_id}/context-latest",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(state_docs_request, timeout=10) as response:
                state_docs = json.loads(response.read().decode("utf-8"))
            with urlopen(context_request, timeout=10) as response:
                context_payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertIn("task_plan", state_docs["documents"])
        self.assertIn("findings", state_docs["documents"])
        self.assertIn("progress", state_docs["documents"])
        self.assertIn("latest_context", state_docs["documents"])
        self.assertIn("Expose read-only bridge routes", state_docs["documents"]["task_plan"]["content"])
        self.assertIsNotNone(context_payload["repo_latest"])
        self.assertIn("repo digest", context_payload["repo_latest"]["content"])
        self.assertIn("Bridge step", context_payload["runtime_latest"]["content"])

    def test_room_timeline_route_returns_settled_room_mapping(self) -> None:
        root, repo, run_id, _iteration_id = self.prepare_workspace()
        room = repo.list_room_records(run_id=run_id)[0]
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8885)
        try:
            request = Request(
                f"http://127.0.0.1:8885/api/rooms/{room['room_id']}/timeline",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        self.assertEqual(payload["room"]["run_id"], run_id)
        self.assertTrue(payload["messages"])
        self.assertTrue(payload["insights"])

    def test_invalid_run_identifier_is_rejected(self) -> None:
        root, _repo, _run_id, _iteration_id = self.prepare_workspace()
        launched = launch_forward_bridge(root, host="127.0.0.1", port=8886)
        try:
            request = Request(
                "http://127.0.0.1:8886/api/runs/..%2F..%2Fevil",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            with self.assertRaises(HTTPError) as exc_info:
                urlopen(request, timeout=10)
            self.assertEqual(exc_info.exception.code, 400)
            exc_info.exception.close()
        finally:
            launched["server"].shutdown()


if __name__ == "__main__":
    unittest.main()
