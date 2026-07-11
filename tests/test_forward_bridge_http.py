from __future__ import annotations

import importlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_forward_bridge import launch_forward_bridge
from ensemble_forward_bridge_commands import CommandResult


class ForwardBridgeHTTPTransportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(self.workspace, ignore_errors=True))

    def _launch(self, **kwargs):
        launched = launch_forward_bridge(self.workspace, host="127.0.0.1", port=0, **kwargs)
        self.addCleanup(launched["server"].shutdown)
        return launched

    def _patch_dispatch(self, side_effect):
        patchers = [mock.patch("ensemble_forward_bridge_commands.dispatch_command", side_effect=side_effect)]
        try:
            http_module = importlib.import_module("ensemble_forward_bridge_http")
        except ModuleNotFoundError as exc:
            if exc.name == "ensemble_forward_bridge_http":
                http_module = None
            else:
                raise
        if http_module is not None and hasattr(http_module, "dispatch_command"):
            patchers.append(mock.patch("ensemble_forward_bridge_http.dispatch_command", side_effect=side_effect))
        return patchers

    def test_http_leaf_module_exists_for_transport_boundary(self) -> None:
        module = importlib.import_module("ensemble_forward_bridge_http")

        self.assertIsNotNone(module)

    def test_unauthorized_write_request_does_not_dispatch_command(self) -> None:
        calls: list[tuple[object, ...]] = []

        def fake_dispatch(*args, **kwargs):
            calls.append(args)
            return CommandResult(status=201, payload={"unexpected": True})

        patchers = self._patch_dispatch(fake_dispatch)
        with patchers[0]:
            extra_patch = patchers[1:] or [mock.patch("builtins.id", wraps=id)]
            with extra_patch[0]:
                launched = self._launch()
                request = Request(
                    f"{launched['api_root']}/operator/tasks",
                    data=json.dumps({"title": "Unauthorized"}).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with self.assertRaises(HTTPError) as exc_info:
                    urlopen(request, timeout=10)
                body = exc_info.exception.read().decode("utf-8")
                exc_info.exception.close()

        self.assertEqual(exc_info.exception.code, 403)
        self.assertEqual(calls, [])
        self.assertNotIn("Unauthorized", body)

    def test_authorized_create_update_and_delete_routes_delegate_to_command_dispatcher(self) -> None:
        calls: list[tuple[str, str, dict[str, object]]] = []

        def fake_dispatch(method, path, payload, **kwargs):
            calls.append((method, path, payload))
            return CommandResult(status=202, payload={"routed": method, "path": path})

        patchers = self._patch_dispatch(fake_dispatch)
        contexts = [patcher for patcher in patchers]
        with contexts[0]:
            extra_patch = contexts[1:] or [mock.patch("builtins.id", wraps=id)]
            with extra_patch[0]:
                launched = self._launch()
                headers = {
                    "Authorization": f"Bearer {launched['token']}",
                    "Content-Type": "application/json",
                }
                requests = [
                    Request(
                        f"{launched['api_root']}/operator/tasks",
                        data=json.dumps({"title": "Create"}).encode("utf-8"),
                        headers=headers,
                        method="POST",
                    ),
                    Request(
                        f"{launched['api_root']}/operator/tasks/otask-001",
                        data=json.dumps({"title": "Update"}).encode("utf-8"),
                        headers=headers,
                        method="PATCH",
                    ),
                    Request(
                        f"{launched['api_root']}/operator/tasks/otask-001",
                        data=b"{}",
                        headers=headers,
                        method="DELETE",
                    ),
                ]
                responses = []
                for request in requests:
                    with urlopen(request, timeout=10) as response:
                        responses.append((response.status, json.loads(response.read().decode("utf-8"))))

        self.assertEqual([item[0] for item in responses], [202, 202, 202])
        self.assertEqual(
            calls,
            [
                ("POST", "/api/operator/tasks", {"title": "Create"}),
                ("PATCH", "/api/operator/tasks/otask-001", {"title": "Update"}),
                ("DELETE", "/api/operator/tasks/otask-001", {}),
            ],
        )

    def test_delete_patch_reject_parses_body_and_forwards_reason(self) -> None:
        calls: list[tuple[str, str, dict[str, object]]] = []

        def fake_dispatch(method, path, payload, **kwargs):
            calls.append((method, path, payload))
            return CommandResult(
                status=200,
                payload={"patch_id": "patch-003", "status": "rejected", "durable": False},
            )

        patchers = self._patch_dispatch(fake_dispatch)
        with patchers[0]:
            extra_patch = patchers[1:] or [mock.patch("builtins.id", wraps=id)]
            with extra_patch[0]:
                launched = self._launch()
                request = Request(
                    f"{launched['api_root']}/approvals/patch-003/reject",
                    data=json.dumps({"reason": "fails validation"}).encode("utf-8"),
                    headers={
                        "Authorization": f"Bearer {launched['token']}",
                        "Content-Type": "application/json",
                    },
                    method="DELETE",
                )
                with urlopen(request, timeout=10) as response:
                    payload = json.loads(response.read().decode("utf-8"))

        self.assertEqual(payload["status"], "rejected")
        self.assertEqual(calls, [("DELETE", "/api/approvals/patch-003/reject", {"reason": "fails validation"})])

    def test_oversized_write_body_returns_413_before_command_dispatch(self) -> None:
        calls: list[tuple[object, ...]] = []

        def fake_dispatch(*args, **kwargs):
            calls.append(args)
            return CommandResult(status=200, payload={"unexpected": True})

        patchers = self._patch_dispatch(fake_dispatch)
        with patchers[0]:
            extra_patch = patchers[1:] or [mock.patch("builtins.id", wraps=id)]
            with extra_patch[0]:
                launched = self._launch()
                request = Request(
                    f"{launched['api_root']}/operator/tasks",
                    data=("x" * 1_100_000).encode("utf-8"),
                    headers={
                        "Authorization": f"Bearer {launched['token']}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                with self.assertRaises(HTTPError) as exc_info:
                    urlopen(request, timeout=10)
                exc_info.exception.close()

        self.assertEqual(exc_info.exception.code, 413)
        self.assertEqual(calls, [])

    def test_negative_content_length_is_rejected_before_body_read(self) -> None:
        module = importlib.import_module("ensemble_forward_bridge_http")
        handler = mock.Mock()
        handler.headers = {"Content-Length": "-1"}
        handler.rfile = io.BytesIO(b'{"title":"must not be read"}')

        with self.assertRaisesRegex(ValueError, "Invalid Content-Length"):
            module._read_json_body(handler)

    def test_extreme_content_length_is_rejected_without_draining_unbounded_body(self) -> None:
        module = importlib.import_module("ensemble_forward_bridge_http")
        handler = mock.Mock()
        handler.headers = {"Content-Length": "999999999"}

        with self.assertRaisesRegex(OverflowError, "Request body too large"):
            module._read_json_body(handler)

        handler.rfile.read.assert_not_called()

    def test_invalid_identifier_error_omits_original_value(self) -> None:
        launched = self._launch()
        unsafe_identifier = "/opt/private/credential-token"
        request = Request(
            f"{launched['api_root']}/runs/{quote(unsafe_identifier, safe='')}",
            headers={"Authorization": f"Bearer {launched['token']}"},
        )

        with self.assertRaises(HTTPError) as exc_info:
            urlopen(request, timeout=10)
        body = exc_info.exception.read().decode("utf-8")
        exc_info.exception.close()

        self.assertEqual(exc_info.exception.code, 400)
        self.assertNotIn(unsafe_identifier, body)
        self.assertNotIn("private", body.lower())

    def test_invalid_agent_identifier_is_rejected_before_registry_lookup(self) -> None:
        launched = self._launch()
        unsafe_identifier = "../private-agent"
        request = Request(
            f"{launched['api_root']}/agents/{quote(unsafe_identifier, safe='')}",
            headers={"Authorization": f"Bearer {launched['token']}"},
        )

        with self.assertRaises(HTTPError) as exc_info:
            urlopen(request, timeout=10)
        body = exc_info.exception.read().decode("utf-8")
        exc_info.exception.close()

        self.assertEqual(exc_info.exception.code, 400)
        self.assertNotIn(unsafe_identifier, body)
        self.assertNotIn("private-agent", body)

    def test_unexpected_command_error_returns_sanitized_500(self) -> None:
        def fake_dispatch(*args, **kwargs):
            raise RuntimeError("secret transport traceback C:/Users/example/token.txt")

        patchers = self._patch_dispatch(fake_dispatch)
        with patchers[0]:
            extra_patch = patchers[1:] or [mock.patch("builtins.id", wraps=id)]
            with extra_patch[0]:
                launched = self._launch()
                request = Request(
                    f"{launched['api_root']}/operator/tasks",
                    data=json.dumps({"title": "Explode"}).encode("utf-8"),
                    headers={
                        "Authorization": f"Bearer {launched['token']}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                with self.assertRaises(HTTPError) as exc_info:
                    urlopen(request, timeout=10)
                body = exc_info.exception.read().decode("utf-8")
                payload = json.loads(body)
                exc_info.exception.close()

        self.assertEqual(exc_info.exception.code, 500)
        self.assertEqual(payload["error"], "Internal forward bridge error.")
        self.assertNotIn("secret transport traceback", body)
        self.assertNotIn("C:/Users/example", body)


if __name__ == "__main__":
    unittest.main()
