from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_approval import ApprovalInterruptAdapter
from ensemble_forward import build_context_latest_payload
from ensemble_forward_bridge import (
    _stream_snapshot_payload,
    build_approval_detail_payload,
    build_approvals_payload,
    build_operator_agents_payload,
    build_operator_inbox_payload,
    build_operator_summary_payload,
    build_operator_workspace_detail_payload,
    build_operator_workspaces_payload,
    build_run_detail_payload,
    build_run_context_latest_payload,
    build_runs_payload,
)
from ensemble_forward_bridge_query import build_handoffs_payload
from ensemble_forward_bridge_http import _agent_detail_payload, _build_run_replay_payload
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_room_service import RoomService
from ensemble_run_service import RunService


class ForwardBridgeBoundaryTests(unittest.TestCase):
    def _prepare_run(self, workspace: Path) -> tuple[LoopStateRepository, str, str]:
        repository = LoopStateRepository(workspace)
        run_id = RunService(repository).create_run("Public boundary regression")["run_id"]
        iteration_id = IterationService(repository).append_iteration(
            run_id,
            "Keep private values out of public read models",
        )["iteration_id"]
        repository.upsert_task_plan(
            run_id=run_id,
            current_plan="Protect the Forward public boundary",
            objective="Expose metadata without private values 한국어—🚀",
            steps=[{"title": "Redact public read models", "status": "in_progress"}],
            acceptance_criteria=["private values stay internal"],
            owner="sample-agent",
        )
        return repository, run_id, iteration_id

    def test_context_payloads_redact_local_paths_and_secret_values(self) -> None:
        with tempfile.TemporaryDirectory() as workspace_raw:
            workspace = Path(workspace_raw)
            _repository, run_id, _iteration_id = self._prepare_run(workspace)
            private_windows_path = r"D:\Shared\private-owner\repo\secret.txt"
            private_user_path = r"C:\Users\private-owner\Documents\notes.md"
            secret_value = "TOP-SECRET-CONTEXT-VALUE"
            content = "\n".join(
                [
                    "# Context",
                    f"workspace={workspace.resolve()}",
                    f"outside={private_windows_path}",
                    f"home={private_user_path}",
                    "username=private-owner",
                    "actor=local/private-owner",
                    f"secret={secret_value}",
                    "keep=한국어—🚀",
                    "",
                ]
            )
            runtime_path = workspace / ".conitens" / "context" / "LATEST_CONTEXT.md"
            repo_path = workspace / ".vibe" / "context" / "LATEST_CONTEXT.md"
            runtime_path.parent.mkdir(parents=True, exist_ok=True)
            repo_path.parent.mkdir(parents=True, exist_ok=True)
            runtime_path.write_text(content, encoding="utf-8")
            repo_path.write_text(content, encoding="utf-8")

            payloads = [
                build_context_latest_payload(workspace),
                build_run_context_latest_payload(workspace, run_id),
            ]
            serialized = json.dumps(payloads, ensure_ascii=False)

            self.assertNotIn(str(workspace.resolve()), serialized)
            self.assertNotIn(private_windows_path, serialized)
            self.assertNotIn(private_user_path, serialized)
            self.assertNotIn("private-owner", serialized)
            self.assertNotIn(secret_value, serialized)
            self.assertIn("한국어—🚀", serialized)

    def test_run_replay_and_agent_payloads_omit_raw_private_fields(self) -> None:
        with tempfile.TemporaryDirectory() as workspace_raw:
            workspace = Path(workspace_raw)
            repository = LoopStateRepository(workspace)
            run_secret = "RUN-USER-REQUEST-SECRET"
            iteration_secret = "ITERATION-OBJECTIVE-SECRET"
            message_secret = "ROOM-MESSAGE-SECRET"
            validator_secret = "VALIDATOR-FEEDBACK-SECRET"
            run_id = RunService(repository).create_run(run_secret)["run_id"]
            iteration_id = IterationService(repository).append_iteration(run_id, iteration_secret)["iteration_id"]
            repository.upsert_task_plan(
                run_id=run_id,
                current_plan="PRIVATE-CURRENT-PLAN",
                objective="Public run objective",
                steps=[{"title": "Public step", "status": "in_progress", "notes": "PRIVATE-STEP-NOTES"}],
                acceptance_criteria=["PRIVATE-ACCEPTANCE"],
                owner="private-owner",
            )
            room = RoomService(workspace).create_room(
                name="public-run-room",
                room_type="review",
                participants=["owner", "agent"],
                actor="agent",
                task_id=run_id,
                run_id=run_id,
                iteration_id=iteration_id,
            )
            RoomService(workspace).append_message(
                room_id=room["room_id"],
                sender="agent",
                sender_kind="agent",
                text=message_secret,
                run_id=run_id,
                iteration_id=iteration_id,
            )
            repository.record_validator_result(
                run_id=run_id,
                iteration_id=iteration_id,
                passed=False,
                issues=[{"message": validator_secret}],
                feedback_text=validator_secret,
            )

            payloads = {
                "runs": build_runs_payload(workspace),
                "detail": build_run_detail_payload(workspace, run_id),
                "replay": _build_run_replay_payload(workspace, run_id),
                "agent": _agent_detail_payload(
                    "sample-agent",
                    {
                        "id": "sample-agent",
                        "role": "reviewer",
                        "memory_namespace": r"C:\Users\private-owner\memory",
                        "hermes_profile": "/private/hermes/profile",
                        "pending_patches": [
                            {
                                "patch_id": "patch-safe",
                                "agent_id": "sample-agent",
                                "file": "sample-agent-patch.md",
                                "path": r"C:\Users\private-owner\patch.md",
                            }
                        ],
                    },
                ),
            }
            serialized = json.dumps(payloads, ensure_ascii=False)

            for forbidden in [
                run_secret,
                iteration_secret,
                message_secret,
                validator_secret,
                "PRIVATE-CURRENT-PLAN",
                "PRIVATE-STEP-NOTES",
                "PRIVATE-ACCEPTANCE",
                "private-owner",
                r"C:\Users\private-owner",
                "/private/hermes/profile",
            ]:
                self.assertNotIn(forbidden, serialized)
            self.assertIn("Public run objective", serialized)
            self.assertNotIn("path", payloads["agent"]["agent"]["pending_patches"][0])

    def test_workspace_queries_hide_absolute_paths_without_sync_writes(self) -> None:
        with tempfile.TemporaryDirectory() as workspace_raw:
            workspace = Path(workspace_raw)
            repository = LoopStateRepository(workspace)
            inside_path = workspace / "packages" / "dashboard"
            outside_path = workspace.parent / "private-owner" / "repo"
            outside_username_path = workspace.parent / "private-owner"
            repository.create_operator_workspace(
                workspace_id="owork-inside",
                label="Dashboard",
                path=str(inside_path),
                kind="repo",
                status="active",
                task_ids=["stale-task"],
            )
            repository.create_operator_workspace(
                workspace_id="owork-outside",
                label="External repo",
                path=str(outside_path),
                kind="repo",
                status="active",
            )
            repository.create_operator_workspace(
                workspace_id="owork-outside-username",
                label="External owner directory",
                path=str(outside_username_path),
                kind="repo",
                status="active",
            )
            repository.create_operator_workspace(
                workspace_id="owork-traversal-one",
                label="Traversal one",
                path="..",
                kind="repo",
                status="archived",
                archived_by="local/private-owner",
                archive_note="archived by local/private-owner",
            )
            repository.create_operator_workspace(
                workspace_id="owork-traversal-two",
                label="Traversal two",
                path="../..",
                kind="repo",
                status="active",
            )
            repository.create_operator_workspace(
                workspace_id="owork-traversal-owner",
                label="Traversal owner",
                path="../private-owner",
                kind="repo",
                status="active",
            )

            with patch.object(
                LoopStateRepository,
                "update_operator_workspace",
                side_effect=AssertionError("query attempted a sync write"),
            ):
                listed = build_operator_workspaces_payload(workspace)
                detail = build_operator_workspace_detail_payload(
                    workspace,
                    "owork-inside",
                )

            by_id = {
                row["workspace_id"]: row
                for row in listed["workspaces"]
            }
            self.assertEqual(by_id["owork-inside"]["path"], "packages/dashboard")
            self.assertEqual(by_id["owork-outside"]["path"], "[REDACTED]")
            self.assertEqual(by_id["owork-outside-username"]["path"], "[REDACTED]")
            self.assertEqual(by_id["owork-traversal-one"]["path"], "[REDACTED]")
            self.assertEqual(by_id["owork-traversal-two"]["path"], "[REDACTED]")
            self.assertEqual(by_id["owork-traversal-owner"]["path"], "[REDACTED]")
            self.assertIsNone(by_id["owork-traversal-one"]["archived_by"])
            self.assertEqual(by_id["owork-traversal-one"]["archive_note"], "archived by [REDACTED]")
            self.assertEqual(detail["workspace"]["path"], "packages/dashboard")
            self.assertEqual(by_id["owork-inside"]["task_ids_json"], [])
            self.assertNotIn("private-owner", json.dumps(listed, ensure_ascii=False))
            stored = repository.get_operator_workspace("owork-inside")
            self.assertEqual(stored["path"], str(inside_path))
            self.assertEqual(stored["task_ids_json"], ["stale-task"])

    def test_public_approval_validator_and_stream_views_omit_private_values(self) -> None:
        with tempfile.TemporaryDirectory() as workspace_raw:
            workspace = Path(workspace_raw)
            repository, run_id, iteration_id = self._prepare_run(workspace)
            approval_secret = "APPROVAL-SECRET-VALUE"
            validator_secret = "VALIDATOR-SECRET-VALUE"
            transcript_secret = "TRANSCRIPT-SECRET-VALUE"
            approval = ApprovalInterruptAdapter(workspace).enqueue_request(
                run_id=run_id,
                iteration_id=iteration_id,
                actor="local/private-owner",
                action_type="shell_execution",
                action_payload={
                    "command": f"echo {approval_secret}",
                    "token": approval_secret,
                },
            )
            repository.record_validator_result(
                run_id=run_id,
                iteration_id=iteration_id,
                passed=False,
                issues=[{"message": validator_secret}],
                feedback_text=f"{validator_secret} at C:\\Users\\private-owner\\repo",
            )
            room = RoomService(workspace).create_room(
                name="public-boundary-room",
                room_type="review",
                participants=["user", "sample-agent"],
                actor="sample-agent",
                task_id=run_id,
                run_id=run_id,
                iteration_id=iteration_id,
            )
            RoomService(workspace).append_message(
                room_id=room["room_id"],
                sender="sample-agent",
                sender_kind="agent",
                text=transcript_secret,
                run_id=run_id,
                iteration_id=iteration_id,
            )

            approvals = build_approvals_payload(workspace, run_id=run_id)
            detail = build_approval_detail_payload(workspace, approval["request_id"])
            summary = build_operator_summary_payload(workspace)
            inbox = build_operator_inbox_payload(workspace)
            agents = build_operator_agents_payload(workspace)
            stream = _stream_snapshot_payload(
                workspace,
                run_id=run_id,
                room_id=room["room_id"],
            )
            serialized = json.dumps(
                {
                    "approvals": approvals,
                    "detail": detail,
                    "summary": summary,
                    "inbox": inbox,
                    "agents": agents,
                    "stream": stream,
                },
                ensure_ascii=False,
            )

            self.assertEqual(approvals["approvals"][0]["action_payload"], {})
            self.assertEqual(approvals["approvals"][0]["actor"], "local-operator")
            self.assertNotIn("action_payload_json", approvals["approvals"][0])
            self.assertEqual(detail["approval"]["action_payload"], {})
            self.assertIsNone(detail["approval"]["reviewer_note"])
            self.assertEqual(summary["validation"]["latest_failure_reason"], "validation failed")
            validator_item = next(item for item in inbox["items"] if item["kind"] == "validator_failure")
            self.assertEqual(validator_item["summary"], "validation failed")
            sample_agent = next(row for row in agents["agents"] if row["agent_id"] == "sample-agent")
            self.assertEqual(sample_agent["latest_blocker"], "validation failed")
            self.assertEqual(stream["pending_approvals"][0]["action_payload"], {})
            self.assertNotIn("payload", stream["latest_run_event"])
            self.assertNotIn("summary", stream["latest_run_event"])
            self.assertNotIn("payload", stream["latest_room_event"])
            self.assertNotIn("summary", stream["latest_room_event"])
            self.assertNotIn(approval_secret, serialized)
            self.assertNotIn(validator_secret, serialized)
            self.assertNotIn(transcript_secret, serialized)
            self.assertNotIn("private-owner", serialized)

    def test_public_actor_and_handoff_views_redact_secret_shaped_values(self) -> None:
        with tempfile.TemporaryDirectory() as workspace_raw:
            workspace = Path(workspace_raw)
            repository, run_id, iteration_id = self._prepare_run(workspace)
            secret_actor = "sk-publicboundary123456789"
            private_reason = r"blocked at C:\Users\private-owner\secret.txt token=private-value"
            approval = ApprovalInterruptAdapter(workspace).enqueue_request(
                run_id=run_id,
                iteration_id=iteration_id,
                actor=secret_actor,
                action_type="shell_execution",
                action_payload={"command": "echo safe"},
            )
            repository.upsert_handoff_packet(
                handoff_id="handoff-private-boundary",
                run_id=run_id,
                iteration_id=iteration_id,
                from_actor="sample-agent",
                to_actor="reviewer",
                status="blocked",
                summary=private_reason,
                packet={"blocked_reason": private_reason},
            )
            repository.upsert_handoff_packet(
                handoff_id="handoff-private-actors",
                run_id=run_id,
                iteration_id=iteration_id,
                from_actor=secret_actor,
                to_actor=r"C:\Users\private-reviewer\identity.txt",
                status="blocked",
                summary=private_reason,
                packet={"blocked_reason": private_reason, "token": "private-value"},
            )

            approvals = build_approvals_payload(workspace, run_id=run_id)
            inbox = build_operator_inbox_payload(workspace)
            agents = build_operator_agents_payload(workspace)
            handoffs = build_handoffs_payload(workspace, run_id=run_id)
            stream = _stream_snapshot_payload(workspace, run_id=run_id)
            serialized = json.dumps(
                {
                    "approvals": approvals,
                    "inbox": inbox,
                    "agents": agents,
                    "handoffs": handoffs,
                    "stream": stream,
                },
                ensure_ascii=False,
            )

            public_approval = next(
                row for row in approvals["approvals"] if row["request_id"] == approval["request_id"]
            )
            handoff_item = next(row for row in inbox["items"] if row["id"] == "handoff:handoff-private-boundary")
            sample_agent = next(row for row in agents["agents"] if row["agent_id"] == "sample-agent")
            public_handoff = next(
                row for row in handoffs["handoffs"] if row["handoff_id"] == "handoff-private-actors"
            )
            self.assertEqual(public_approval["actor"], "agent")
            self.assertEqual(handoff_item["summary"], "handoff blocked")
            self.assertEqual(sample_agent["latest_blocker"], "handoff blocked")
            self.assertEqual(public_handoff["from_actor"], "agent")
            self.assertEqual(public_handoff["to_actor"], "agent")
            self.assertEqual(public_handoff["summary"], "handoff blocked")
            self.assertEqual(public_handoff["packet_json"], {})
            self.assertEqual(stream["pending_approvals"][0]["actor"], "agent")
            self.assertNotIn(secret_actor, serialized)
            self.assertNotIn("private-owner", serialized)
            self.assertNotIn("private-value", serialized)


if __name__ == "__main__":
    unittest.main()
