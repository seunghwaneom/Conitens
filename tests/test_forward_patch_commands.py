from __future__ import annotations

import ast
import io
import importlib
import shutil
import sys
import unittest
import uuid
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import ensemble_agent_registry as registry
from ensemble_events import append_event


HTTP_SOURCE = SCRIPTS / "ensemble_forward_bridge_http.py"
ALLOWED_EVENTS_SOURCE = SCRIPTS / "ensemble_allowed_events.py"


def _import_patch_service():
    return importlib.import_module("ensemble_agent_patch_service")


def _bridge_tree() -> ast.Module:
    return ast.parse(HTTP_SOURCE.read_text(encoding="utf-8"))


def _forward_delete_method() -> ast.FunctionDef:
    for node in ast.walk(_bridge_tree()):
        if isinstance(node, ast.FunctionDef) and node.name == "do_DELETE":
            return node
    raise AssertionError("Forward bridge HTTP leaf is missing do_DELETE")


def _module_function(name: str) -> ast.FunctionDef:
    for node in ast.walk(_bridge_tree()):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node
    raise AssertionError(f"Forward bridge HTTP leaf is missing {name}")


def _forward_delete_source() -> str:
    source = HTTP_SOURCE.read_text(encoding="utf-8")
    method = _forward_delete_method()
    segment = ast.get_source_segment(source, method)
    if segment is None:
        raise AssertionError("Could not extract Forward bridge do_DELETE source")
    return segment


def _called_names(node: ast.AST) -> set[str]:
    names: set[str] = set()
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        func = child.func
        if isinstance(func, ast.Name):
            names.add(func.id)
        elif isinstance(func, ast.Attribute):
            names.add(func.attr)
    return names


def _assigned_names(node: ast.AST) -> set[str]:
    names: set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Store):
            names.add(child.id)
    return names


def _loaded_names(node: ast.AST) -> set[str]:
    names: set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load):
            names.add(child.id)
    return names


class ForwardPatchCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        sandbox_tmp = ROOT / ".tmp" / "forward-patch-commands"
        sandbox_tmp.mkdir(parents=True, exist_ok=True)
        self.workspace = sandbox_tmp / f"ws-{uuid.uuid4().hex}"
        self.workspace.mkdir(parents=True, exist_ok=True)
        self.addCleanup(lambda: shutil.rmtree(self.workspace, ignore_errors=True))

        self.notes_dir = self.workspace / ".notes"
        self.notes_agents_dir = self.notes_dir / "10_Agents"
        self.agents_dir = self.workspace / ".agent" / "agents"
        self.patches_dir = self.workspace / ".conitens" / "personas" / "candidate_patches"

        self.notes_agents_dir.mkdir(parents=True, exist_ok=True)
        self.agents_dir.mkdir(parents=True, exist_ok=True)
        self.patches_dir.mkdir(parents=True, exist_ok=True)

        (self.agents_dir / "supervisor-core.yaml").write_text(
            "\n".join(
                [
                    "id: supervisor-core",
                    "role: supervisor",
                    "status: active",
                    'public_persona: "Direct and concise"',
                    "skills:",
                    "  - conitens-core",
                    "",
                ]
            ),
            encoding="utf-8",
        )

        registry_patcher = mock.patch.multiple(
            registry,
            REPO_ROOT=self.workspace,
            AGENTS_DIR=self.agents_dir,
            NOTES_AGENTS_DIR=self.notes_agents_dir,
            PATCHES_DIR=self.patches_dir,
            NOTES_DIR=self.notes_dir,
        )
        registry_patcher.start()
        self.addCleanup(registry_patcher.stop)

    def _write_patch(self, patch_id: str, proposal_text: str) -> Path:
        patch_path = self.patches_dir / f"{patch_id}.md"
        patch_path.write_text(
            "\n".join(
                [
                    "---",
                    f"patch_id: {patch_id}",
                    "agent_id: supervisor-core",
                    "type: persona",
                    "status: proposed",
                    'rationale: "Reduce verbosity in handoff summaries"',
                    "created_at: 2026-04-06T10:06:00Z",
                    "---",
                    "",
                    "## Proposed Persona Changes",
                    "",
                    proposal_text,
                    "",
                ]
            ),
            encoding="utf-8",
        )
        return patch_path

    def _append_patch_generated_event(self, patch_id: str) -> None:
        append_event(
            str(self.notes_dir),
            event_type="improver.patch_generated",
            actor={"type": "agent", "name": "improver-core"},
            payload={
                "agent_id": "supervisor-core",
                "patch_id": patch_id,
                "type": "persona",
                "rationale": "Reduce verbosity in handoff summaries",
            },
        )

    def test_patch_decision_service_exposes_one_common_entrypoint(self) -> None:
        service = _import_patch_service()

        self.assertTrue(callable(getattr(service, "decide_agent_patch", None)))

    def test_patch_decision_service_validates_patch_id_and_decision(self) -> None:
        service = _import_patch_service()

        with self.assertRaisesRegex(ValueError, "patch_id"):
            service.decide_agent_patch(self.workspace, "../outside", decision="approve")

        with self.assertRaisesRegex(ValueError, "decision"):
            service.decide_agent_patch(self.workspace, "supervisor-core-2026-04-06-001", decision="maybe")

    def test_approve_uses_workspace_scoped_event_first_apply_and_preserves_response(self) -> None:
        service = _import_patch_service()
        patch_id = "supervisor-core-2026-04-06-001"
        expected = {"patch_id": patch_id, "status": "applied"}

        with mock.patch.object(service, "agent_apply_patch", return_value=expected) as legacy_apply:
            result = service.decide_agent_patch(self.workspace, patch_id, decision="approve", actor="operator")

        legacy_apply.assert_called_once_with(
            patch_id,
            workspace=self.workspace,
            actor="operator",
            reason=None,
        )
        self.assertEqual(result, expected)

    def test_apply_retry_after_terminal_append_failure_reuses_approval_authority(self) -> None:
        patch_id = "supervisor-core-2026-04-06-001"
        self._write_patch(
            patch_id,
            "- Before: handoffs were verbose.\n- After: handoffs use three bullets.",
        )
        self._append_patch_generated_event(patch_id)
        real_append = registry.append_event
        failed_once = False

        def fail_first_applied(*args, **kwargs):
            nonlocal failed_once
            if kwargs.get("event_type") == "agent.patch_applied" and not failed_once:
                failed_once = True
                raise RuntimeError("applied append failed")
            return real_append(*args, **kwargs)

        with mock.patch.object(registry, "append_event", side_effect=fail_first_applied):
            with self.assertRaisesRegex(RuntimeError, "applied append failed"):
                registry.agent_apply_patch(
                    patch_id,
                    workspace=self.workspace,
                    actor="reviewer-a",
                    reason="approved by review",
                )

        result = registry.agent_apply_patch(
            patch_id,
            workspace=self.workspace,
            actor="reviewer-a",
            reason="approved by review",
        )
        events = registry.load_events(self.notes_dir)
        event_types = [event["type"] for event in events]
        self.assertEqual(result, {"patch_id": patch_id, "status": "applied"})
        self.assertEqual(event_types.count("agent.patch_approved"), 1)
        self.assertEqual(event_types.count("agent.patch_applied"), 1)
        approved = next(event for event in events if event["type"] == "agent.patch_approved")
        self.assertEqual(approved["actor"]["name"], "reviewer-a")

    def test_registry_cli_apply_routes_through_common_patch_decision_service(self) -> None:
        service = _import_patch_service()
        patch_id = "supervisor-core-2026-04-06-001"
        expected = {"patch_id": patch_id, "status": "applied"}

        with (
            mock.patch.object(service, "decide_agent_patch", return_value=expected) as decide,
            mock.patch.object(sys, "argv", ["ensemble_agent_registry.py", "apply", patch_id]),
            redirect_stdout(io.StringIO()),
        ):
            exit_code = registry.main()

        self.assertEqual(exit_code, 0)
        decide.assert_called_once_with(
            self.workspace,
            patch_id,
            decision="approve",
            actor="cli",
        )

    def test_reject_is_explicitly_non_durable_until_registered_event_contract_exists(self) -> None:
        service = _import_patch_service()
        patch_id = "supervisor-core-2026-04-06-001"
        self._write_patch(
            patch_id,
            "- Before: handoff summary used six bullets.\n- After: handoff summary uses at most three bullets.",
        )
        self._append_patch_generated_event(patch_id)

        result = service.decide_agent_patch(
            self.workspace,
            patch_id,
            decision="reject",
            reason="Do not ship token sk-test-123 from C:/Users/example/.ssh/id_rsa",
            actor="operator",
        )

        self.assertNotIn("agent.patch_rejected", ALLOWED_EVENTS_SOURCE.read_text(encoding="utf-8"))
        self.assertEqual(result["patch_id"], patch_id)
        self.assertEqual(result["status"], "rejected")
        self.assertIs(result.get("durable"), False)
        self.assertEqual(result.get("compatibility"), "non_durable")
        self.assertNotIn("sk-test-123", repr(result))
        self.assertNotIn("C:/Users/example", repr(result))

    def test_forward_delete_handler_does_not_import_or_call_legacy_apply_directly(self) -> None:
        delete_source = _forward_delete_source()

        self.assertNotIn("agent_apply_patch", delete_source)

    def test_forward_delete_reject_route_parses_body_before_using_reason(self) -> None:
        delete_method = _forward_delete_method()
        write_handler = _module_function("_handle_write_request")

        self.assertIn("_handle_write_request", _called_names(delete_method))
        self.assertIn("_read_json_body", _called_names(write_handler))
        self.assertFalse(
            "payload" in _loaded_names(write_handler) and "payload" not in _assigned_names(write_handler),
            "DELETE reject currently reads payload without parsing a DELETE body.",
        )


if __name__ == "__main__":
    unittest.main()
