from __future__ import annotations

import ast
import importlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import ensemble_forward_bridge
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_run_service import RunService


LEAF_MODULES = (
    "ensemble_forward_bridge_query",
    "ensemble_forward_bridge_commands",
    "ensemble_forward_bridge_stream",
    "ensemble_forward_bridge_http",
)

CURRENT_FACADE_EXPORTS = {
    "archive_operator_task_payload",
    "build_approval_detail_payload",
    "build_approvals_payload",
    "build_operator_agents_payload",
    "build_operator_doctor_evidence_payload",
    "build_operator_evidence_summary_payload",
    "build_operator_inbox_payload",
    "build_operator_pr_ci_evidence_payload",
    "build_operator_runtime_roster_payload",
    "build_operator_status_confidence_payload",
    "build_operator_summary_payload",
    "build_operator_task_detail_payload",
    "build_operator_task_reconcile_preview_payload",
    "build_operator_tasks_payload",
    "build_operator_turn_records_payload",
    "build_operator_wake_readiness_payload",
    "build_operator_workflow_contracts_payload",
    "build_operator_workspace_detail_payload",
    "build_operator_workspaces_payload",
    "build_run_context_latest_payload",
    "build_run_detail_payload",
    "build_run_state_docs_payload",
    "build_runs_payload",
    "delete_operator_task_payload",
    "detach_operator_task_workspace_payload",
    "launch_forward_bridge",
    "request_operator_task_approval",
    "restore_operator_task_payload",
    "run_forward_bridge",
    "serialize_sse_event",
}

QUERY_FORBIDDEN_IMPORTS = {
    "http.server",
    "ensemble_orchestration",
    "ensemble_forward_bridge_commands",
    "ensemble_forward_bridge_http",
}

QUERY_FORBIDDEN_NAMES = {
    "ApprovalInterruptAdapter",
    "BaseHTTPRequestHandler",
    "LocalOrchestrationRuntime",
    "ThreadingHTTPServer",
    "_read_json_body",
    "append_event",
    "archive_operator_task_payload",
    "delete_operator_task_payload",
    "detach_operator_task_workspace_payload",
    "request_operator_task_approval",
    "restore_operator_task_payload",
    "resume_after_approval",
}

HTTP_FORBIDDEN_NAMES = {
    "ApprovalInterruptAdapter",
    "LoopStateRepository",
    "LocalOrchestrationRuntime",
    "agent_apply_patch",
    "append_event",
    "archive_operator_task_payload",
    "create_operator_task",
    "create_operator_workspace",
    "delete_operator_task",
    "delete_operator_task_payload",
    "detach_operator_task_workspace_payload",
    "request_operator_task_approval",
    "restore_operator_task_payload",
    "resume_after_approval",
    "update_operator_task",
    "update_operator_workspace",
}

FACADE_FORBIDDEN_MARKERS = (
    "BaseHTTPRequestHandler",
    "ThreadingHTTPServer",
    "def do_GET",
    "def do_POST",
    "def do_PATCH",
    "def do_DELETE",
    "LoopStateRepository(",
    ".create_operator_task(",
    ".create_operator_workspace(",
    ".update_operator_task(",
    ".update_operator_workspace(",
    "append_event(",
)


def _source_path(module_name: str) -> Path:
    return SCRIPTS / f"{module_name}.py"


def _source_text(module_name: str) -> str:
    path = _source_path(module_name)
    if not path.exists():
        raise AssertionError(f"Missing prescribed Forward Bridge leaf module: scripts/{path.name}")
    return path.read_text(encoding="utf-8")


def _imported_modules(tree: ast.AST) -> set[str]:
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
    return imported


def _referenced_names(tree: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
    return names


class ForwardBridgeArchitectureTests(unittest.TestCase):
    def test_prescribed_leaf_modules_import_successfully(self) -> None:
        # Given: the Wave 3 architecture contract names four concrete leaves.
        # When: those modules are imported through the normal script path.
        # Then: every prescribed leaf exists and is importable.
        for module_name in LEAF_MODULES:
            with self.subTest(module=module_name):
                try:
                    importlib.import_module(module_name)
                except ModuleNotFoundError as exc:
                    if exc.name == module_name:
                        self.fail(f"Missing prescribed Forward Bridge leaf module: {module_name}")
                    raise

    def test_facade_reexports_current_api_and_stream_snapshot_binding(self) -> None:
        # Given: existing callers import public bridge names from the facade.
        # When: the facade export surface is inspected.
        # Then: all current exports and the observed private stream binding remain available.
        facade_exports = set(getattr(ensemble_forward_bridge, "__all__", ()))
        required_exports = CURRENT_FACADE_EXPORTS | {"_stream_snapshot_payload"}
        self.assertTrue(required_exports <= facade_exports, sorted(required_exports - facade_exports))
        self.assertTrue(callable(ensemble_forward_bridge._stream_snapshot_payload))

    def test_query_module_excludes_http_command_and_mutation_boundaries(self) -> None:
        # Given: query owns public read models only.
        # When: its imports and referenced identifiers are inspected.
        # Then: it contains no HTTP server, command runtime, event append, or direct mutation concepts.
        tree = ast.parse(_source_text("ensemble_forward_bridge_query"))
        forbidden_imports = QUERY_FORBIDDEN_IMPORTS & _imported_modules(tree)
        forbidden_names = QUERY_FORBIDDEN_NAMES & _referenced_names(tree)
        self.assertEqual(forbidden_imports, set())
        self.assertEqual(forbidden_names, set())

    def test_query_modules_use_explicit_import_and_export_boundaries(self) -> None:
        query_paths = sorted(SCRIPTS.glob("ensemble_forward_bridge_query*.py"))
        wildcard_imports: list[str] = []
        dynamic_exports: list[str] = []
        for path in query_paths:
            source = path.read_text(encoding="utf-8")
            tree = ast.parse(source)
            if any(
                isinstance(node, ast.ImportFrom)
                and any(alias.name == "*" for alias in node.names)
                for node in ast.walk(tree)
            ):
                wildcard_imports.append(path.name)
            if "__all__ = [name for name in globals()" in source:
                dynamic_exports.append(path.name)

        self.assertEqual(wildcard_imports, [])
        self.assertEqual(dynamic_exports, [])

    def test_query_builder_does_not_materialize_repository_in_empty_workspace(self) -> None:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))

        payload = ensemble_forward_bridge.build_runs_payload(root)

        self.assertEqual(payload, {"runs": [], "count": 0})
        self.assertEqual(list(root.rglob("*")), [])

    def test_query_builder_does_not_create_sqlite_sidecars_for_existing_state(self) -> None:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        repository = LoopStateRepository(root)
        RunService(repository).create_run("private request")
        before = {
            path.relative_to(root).as_posix(): path.read_bytes()
            for path in root.rglob("*")
            if path.is_file()
        }

        ensemble_forward_bridge.build_runs_payload(root)

        after = {
            path.relative_to(root).as_posix(): path.read_bytes()
            for path in root.rglob("*")
            if path.is_file()
        }
        self.assertEqual(after, before)

    def test_http_module_excludes_repository_and_domain_mutators(self) -> None:
        # Given: HTTP owns transport concerns and delegates domain writes.
        # When: its imports and referenced identifiers are inspected.
        # Then: it does not create repositories, append events, apply patches, or call domain mutators.
        tree = ast.parse(_source_text("ensemble_forward_bridge_http"))
        forbidden_names = HTTP_FORBIDDEN_NAMES & _referenced_names(tree)
        self.assertEqual(forbidden_names, set())

    def test_facade_is_reduced_to_launch_import_compatibility(self) -> None:
        # Given: the facade should only assemble dependencies and preserve compatibility imports.
        # When: the facade source is inspected after extraction.
        # Then: it no longer contains the HTTP route tree or repository mutation calls.
        source = (SCRIPTS / "ensemble_forward_bridge.py").read_text(encoding="utf-8")
        present_markers = [marker for marker in FACADE_FORBIDDEN_MARKERS if marker in source]
        self.assertEqual(present_markers, [])

    def test_command_inventory_keeps_forward_only_mutations_quarantined(self) -> None:
        boundary = (ROOT / "docs" / "frontend" / "BRIDGE_BOUNDARY.md").read_text(encoding="utf-8")
        required_markers = {
            "## Command Contract Inventory",
            "forward_only_projection_debt",
            "event_first_projection",
            "POST /api/operator/tasks",
            "PATCH /api/operator/tasks/:id",
            "DELETE /api/operator/tasks/:id",
            "POST /api/operator/workspaces",
            "PATCH /api/operator/workspaces/:id",
            "POST /api/approvals/:id/decision",
            "POST /api/approvals/:id/resume",
            "DELETE /api/approvals/:patch_id/approve",
            "DELETE /api/approvals/:patch_id/reject",
            "keeps the Forward sidecar below ADR-0004's promotion gate",
        }

        missing = sorted(marker for marker in required_markers if marker not in boundary)
        self.assertEqual(missing, [])

    def test_bridge_root_contract_lists_authenticated_operator_mutations(self) -> None:
        root_html = importlib.import_module("ensemble_forward_bridge_http_routes").bridge_root_html()
        required_markers = {
            "POST /api/operator/tasks",
            "PATCH /api/operator/tasks/&lt;task_id&gt;",
            "DELETE /api/operator/tasks/&lt;task_id&gt;",
            "POST /api/operator/tasks/&lt;task_id&gt;/archive",
            "POST /api/operator/tasks/&lt;task_id&gt;/restore",
            "POST /api/operator/tasks/&lt;task_id&gt;/detach-workspace",
            "POST /api/operator/tasks/&lt;task_id&gt;/request-approval",
            "POST /api/operator/workspaces",
            "PATCH /api/operator/workspaces/&lt;workspace_id&gt;",
            "POST /api/approvals/&lt;request_id&gt;/decision",
            "POST /api/approvals/&lt;request_id&gt;/resume",
            "DELETE /api/approvals/&lt;patch_id&gt;/approve",
            "DELETE /api/approvals/&lt;patch_id&gt;/reject",
        }

        missing = sorted(marker for marker in required_markers if marker not in root_html)
        self.assertEqual(missing, [])

    def test_launched_handler_uses_facade_run_detail_monkeypatch(self) -> None:
        # Given: existing tests and callers patch the facade run-detail binding.
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        repo = LoopStateRepository(root)
        run_id = RunService(repo).create_run("bridge monkeypatch contract")["run_id"]
        IterationService(repo).append_iteration(run_id, "patch interception")
        launched = ensemble_forward_bridge.launch_forward_bridge(root, host="127.0.0.1", port=0)

        def fake_detail(_workspace: str | Path, requested_run_id: str) -> dict[str, str]:
            return {"patched_run_id": requested_run_id, "patched": "yes"}

        try:
            request = Request(
                f"{launched['api_root']}/runs/{run_id}",
                headers={"Authorization": f"Bearer {launched['token']}"},
            )
            # When: the request is handled while the facade binding is patched.
            with patch("ensemble_forward_bridge.build_run_detail_payload", side_effect=fake_detail):
                with urlopen(request, timeout=10) as response:
                    payload = json.loads(response.read().decode("utf-8"))
        finally:
            launched["server"].shutdown()

        # Then: the launched handler resolves the facade binding at request time.
        self.assertEqual(payload, {"patched_run_id": run_id, "patched": "yes"})


if __name__ == "__main__":
    unittest.main()
