from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_episode_closure import (
    ClosureRequest,
    EpisodeClosureError,
    EpisodeNotFoundError,
    close_episode,
    list_improvements,
    show_improvement_digest,
)
from ensemble_events import append_event, load_events


class EpisodeClosureTests(unittest.TestCase):
    def seed_episode(self, workspace: Path, episode_id: str) -> None:
        append_event(
            workspace,
            event_type="task.created",
            actor={"type": "agent", "name": "test"},
            scope={"episode_id": episode_id},
            payload={"episode_id": episode_id, "summary": "seed episode"},
        )

    def seed_validation_passed(self, workspace: Path, episode_id: str) -> None:
        append_event(
            workspace,
            event_type="validation.passed",
            actor={"type": "agent", "name": "verifier"},
            scope={"episode_id": episode_id},
            payload={"episode_id": episode_id, "validator": "fixture"},
        )

    def test_close_allowed_creates_closed_bundle_and_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "ep-closed"
            self.seed_episode(workspace, episode_id)
            self.seed_validation_passed(workspace, episode_id)

            result = close_episode(
                workspace,
                ClosureRequest(
                    episode_id=episode_id,
                    actor="supervisor",
                    summary="Validation passed; no raw access used.",
                    goal="Close validated episode",
                    confidence="high",
                    comparison_key="workflow.context-curator:v1",
                ),
            )

            self.assertEqual(result.status, "closed")
            evidence = json.loads((workspace / result.evidence_path).read_text(encoding="utf-8"))
            self.assertEqual(evidence["comparison_key"], "workflow.context-curator:v1")
            self.assertIn("episode_summary", evidence)
            self.assertIn("scorecard", evidence)
            self.assertIn("raw_access_audit", evidence)
            self.assertIn("next_workflow_recommendation", evidence)
            self.assertEqual(evidence["raw_access_audit"], {"raw_access_used": False, "grants": []})
            self.assertTrue(evidence["scorecard"]["closure_allowed"])

            projection = json.loads((workspace / result.projection_path).read_text(encoding="utf-8"))
            self.assertEqual(projection["status"], "closed")
            self.assertEqual(projection["closure_bundle_id"], result.artifact_id)

            index_rows = list_improvements(workspace)
            self.assertEqual(index_rows[-1]["artifact_id"], result.artifact_id)
            self.assertEqual(index_rows[-1]["status"], "closed")
            self.assertEqual(index_rows[-1]["comparison_key"], "workflow.context-curator:v1")

            artifact_events = [event for event in load_events(workspace) if event["type"] == "task.artifact_added"]
            self.assertEqual(len(artifact_events), 1)
            self.assertEqual(artifact_events[0]["payload"]["artifact_kind"], "episode_closure_bundle")
            self.assertEqual(artifact_events[0]["payload"]["status"], "closed")
            self.assertEqual(artifact_events[0]["payload"]["comparison_key"], "workflow.context-curator:v1")
            self.assertEqual(
                artifact_events[0]["payload"]["index_record"]["comparison_key"],
                "workflow.context-curator:v1",
            )
            self.assertEqual(artifact_events[0]["payload"]["closure_bundle"], evidence)
            self.assertEqual(artifact_events[0]["payload"]["index_record"]["artifact_id"], result.artifact_id)

    def test_unsafe_comparison_key_is_rejected_before_event_or_projection(self) -> None:
        cases = (
            "",
            " ",
            "../episode-family",
            "..",
            "workflow..v1",
            ":..:",
            r"C:\\Users\\alice\\secret",
            "token=supersecret123",
            "ghp_abcdefghijklmnopqrstuvwxyz",
            "github_pat_11AAABBBCCCDDDEEEFFF000111222333444",
            "AKIAIOSFODNN7EXAMPLE",
            "raw-transcript",
            "contains whitespace",
            "key\u0001control",
            "k" * 121,
        )
        for comparison_key in cases:
            with self.subTest(comparison_key=repr(comparison_key)):
                with tempfile.TemporaryDirectory() as temp_dir:
                    workspace = Path(temp_dir)
                    episode_id = "ep-unsafe-key"
                    self.seed_episode(workspace, episode_id)
                    self.seed_validation_passed(workspace, episode_id)
                    baseline = load_events(workspace)

                    with self.assertRaises(Exception):
                        close_episode(
                            workspace,
                            ClosureRequest(
                                episode_id=episode_id,
                                actor="supervisor",
                                summary="Validation passed.",
                                goal="Reject unsafe comparison key",
                                comparison_key=comparison_key,
                            ),
                        )

                    self.assertEqual(load_events(workspace), baseline)
                    self.assertFalse((workspace / ".notes" / "artifacts" / "agent-improvement").exists())

    def test_unsafe_actor_is_rejected_before_event_or_projection(self) -> None:
        cases = (
            "github_pat_11AAABBBCCCDDDEEEFFF000111222333444",
            "AKIAIOSFODNN7EXAMPLE",
            "token:supersecret123",
            "operator\nforged",
            "operator\x00forged",
        )
        for actor in cases:
            with self.subTest(actor=repr(actor)):
                with tempfile.TemporaryDirectory() as temp_dir:
                    workspace = Path(temp_dir)
                    episode_id = "ep-unsafe-actor"
                    self.seed_episode(workspace, episode_id)
                    self.seed_validation_passed(workspace, episode_id)
                    baseline = load_events(workspace)

                    with self.assertRaises(Exception):
                        close_episode(
                            workspace,
                            ClosureRequest(
                                episode_id=episode_id,
                                actor=actor,
                                summary="Validation passed.",
                                goal="Reject unsafe actor metadata",
                                comparison_key="workflow.context-curator:v1",
                            ),
                        )

                    self.assertEqual(load_events(workspace), baseline)
                    self.assertFalse((workspace / ".notes" / "artifacts" / "agent-improvement").exists())

    def test_public_closure_text_rejects_absolute_posix_paths_before_write(self) -> None:
        unsafe_text = "Review /private/customer/export.json before closure."
        cases = (
            {"summary": unsafe_text},
            {"goal": unsafe_text},
            {"outcome": unsafe_text},
            {"risks_remaining": (unsafe_text,)},
            {"blocking_reasons": (unsafe_text,)},
            {"review_reasons": (unsafe_text,)},
            {"next_recommendation": unsafe_text},
            {"next_reason": unsafe_text},
        )
        for fields in cases:
            with self.subTest(field=next(iter(fields))):
                with tempfile.TemporaryDirectory() as temp_dir:
                    workspace = Path(temp_dir)
                    episode_id = "ep-private-path"
                    self.seed_episode(workspace, episode_id)
                    self.seed_validation_passed(workspace, episode_id)
                    baseline = load_events(workspace)
                    request_fields = {
                        "episode_id": episode_id,
                        "actor": "supervisor",
                        "summary": "Validation passed.",
                        "goal": "Reject private paths",
                        "comparison_key": "workflow.context-curator:v1",
                    }
                    request_fields.update(fields)

                    with self.assertRaises(EpisodeClosureError):
                        close_episode(
                            workspace,
                            ClosureRequest(**request_fields),
                        )

                    self.assertEqual(load_events(workspace), baseline)
                    self.assertFalse((workspace / ".notes" / "artifacts" / "agent-improvement").exists())

    def test_public_episode_id_uses_opaque_ref_for_absolute_posix_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "/private/customer/episode.json"
            self.seed_episode(workspace, episode_id)
            self.seed_validation_passed(workspace, episode_id)

            result = close_episode(
                workspace,
                ClosureRequest(
                    episode_id=episode_id,
                    actor="supervisor",
                    summary="Validation passed.",
                    goal="Keep private episode ids opaque",
                ),
            )

            event = [item for item in load_events(workspace) if item["type"] == "task.artifact_added"][-1]
            public_outputs = (
                json.dumps(result.bundle, ensure_ascii=False),
                json.dumps(event, ensure_ascii=False),
                show_improvement_digest(workspace, result.artifact_id),
            )
            self.assertTrue(str(event["payload"]["episode_id"]).startswith("episode-sha256:"))
            for public_output in public_outputs:
                self.assertNotIn(episode_id, public_output)

    def test_missing_validation_creates_blocked_bundle_without_closing_episode(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "ep-blocked"
            self.seed_episode(workspace, episode_id)

            result = close_episode(
                workspace,
                ClosureRequest(
                    episode_id=episode_id,
                    actor="supervisor",
                    summary="Closure attempted before verification.",
                    goal="Close unverified episode",
                ),
            )

            self.assertEqual(result.status, "blocked")
            evidence = json.loads((workspace / result.evidence_path).read_text(encoding="utf-8"))
            self.assertFalse(evidence["scorecard"]["closure_allowed"])
            self.assertIn("validation.passed event missing", evidence["scorecard"]["blocking_reasons"])
            projection = json.loads((workspace / result.projection_path).read_text(encoding="utf-8"))
            self.assertEqual(projection["status"], "open")
            self.assertIsNone(projection["closure_bundle_id"])
            self.assertIn("run_verification_then_retry_closure", show_improvement_digest(workspace, result.artifact_id))

    def test_missing_required_summary_fields_are_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "ep-fields"
            self.seed_episode(workspace, episode_id)
            self.seed_validation_passed(workspace, episode_id)

            result = close_episode(
                workspace,
                ClosureRequest(
                    episode_id=episode_id,
                    actor="supervisor",
                ),
            )

            self.assertEqual(result.status, "blocked")
            evidence = json.loads((workspace / result.evidence_path).read_text(encoding="utf-8"))
            self.assertIn("episode summary missing", evidence["scorecard"]["blocking_reasons"])
            self.assertIn("episode goal missing", evidence["scorecard"]["blocking_reasons"])

    def test_low_confidence_creates_needs_review_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            episode_id = "ep-review"
            self.seed_episode(workspace, episode_id)
            self.seed_validation_passed(workspace, episode_id)

            result = close_episode(
                workspace,
                ClosureRequest(
                    episode_id=episode_id,
                    actor="supervisor",
                    summary="Validation passed but confidence is low.",
                    goal="Close ambiguous episode",
                    confidence="low",
                ),
            )

            self.assertEqual(result.status, "needs_review")
            projection = json.loads((workspace / result.projection_path).read_text(encoding="utf-8"))
            self.assertEqual(projection["status"], "review_required")
            digest = show_improvement_digest(workspace, result.artifact_id)
            self.assertIn("Supervisor confidence is low", digest)

    def test_unknown_episode_is_rejected_without_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)

            with self.assertRaisesRegex(EpisodeNotFoundError, "Episode not found"):
                close_episode(
                    workspace,
                    ClosureRequest(
                        episode_id="ep-missing",
                        summary="Should not write",
                        goal="Missing episode",
                    ),
                )

            self.assertFalse((workspace / ".notes" / "artifacts" / "agent-improvement").exists())


if __name__ == "__main__":
    unittest.main()
