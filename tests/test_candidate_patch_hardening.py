from __future__ import annotations

import shutil
import sys
import unittest
import uuid
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import ensemble_agent_registry as registry
import ensemble_improver as improver
from ensemble_events import append_event


class CandidatePatchHardeningTests(unittest.TestCase):
    def setUp(self) -> None:
        sandbox_tmp = ROOT / ".tmp" / "candidate-patch-hardening"
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
        improver_patcher = mock.patch.multiple(
            improver,
            REPO_ROOT=self.workspace,
            NOTES_DIR=self.notes_dir,
            EVENTS_DIR=self.notes_dir / "EVENTS",
            REVIEWS_DIR=self.notes_dir / "70_Reviews",
            PATCHES_DIR=self.patches_dir,
        )
        registry_patcher.start()
        improver_patcher.start()
        self.addCleanup(registry_patcher.stop)
        self.addCleanup(improver_patcher.stop)

    def _patch_path(self, patch_id: str) -> Path:
        return self.patches_dir / f"{patch_id}.md"

    def _events_file(self) -> Path:
        return self.notes_dir / ".notes" / "events" / "events.jsonl"

    def _write_patch(self, patch_id: str, proposal_text: str, *, rationale: str = "Reduce verbosity in handoff summaries") -> Path:
        patch_path = self._patch_path(patch_id)
        patch_path.write_text(
            "\n".join(
                [
                    "---",
                    f"patch_id: {patch_id}",
                    "agent_id: supervisor-core",
                    "type: persona",
                    "status: proposed",
                    f'rationale: "{rationale}"',
                    "created_at: 2026-04-06T10:06:00Z",
                    "---",
                    "",
                    "## Proposed Persona Changes",
                    "",
                    f"Rationale: {rationale}",
                    "",
                    proposal_text,
                    "",
                ]
            ),
            encoding="utf-8",
        )
        return patch_path

    def _append_patch_generated_event(self, patch_id: str, *, rationale: str = "Reduce verbosity in handoff summaries") -> None:
        append_event(
            str(self.notes_dir),
            event_type="improver.patch_generated",
            actor={"type": "agent", "name": "improver-core"},
            payload={
                "agent_id": "supervisor-core",
                "patch_id": patch_id,
                "type": "persona",
                "rationale": rationale,
            },
        )

    def test_agent_show_ignores_unlogged_candidate_patch_file(self) -> None:
        patch_id = "supervisor-core-2026-04-06-001"
        self._write_patch(
            patch_id,
            "- Before: handoff summary used six bullets.\n- After: handoff summary uses at most three bullets.",
        )

        detail = registry.agent_show("supervisor-core")

        self.assertEqual(detail["pending_patches"], [])

    def test_agent_show_ignores_placeholder_candidate_patch_even_with_event(self) -> None:
        patch_id = "supervisor-core-2026-04-06-001"
        self._write_patch(patch_id, "<!-- Fill in specific persona changes below -->")
        self._append_patch_generated_event(patch_id)

        detail = registry.agent_show("supervisor-core")

        self.assertEqual(detail["pending_patches"], [])

    def test_agent_apply_patch_requires_event_backed_concrete_patch(self) -> None:
        patch_id = "supervisor-core-2026-04-06-001"
        self._write_patch(
            patch_id,
            "- Before: handoff summary used six bullets.\n- After: handoff summary uses at most three bullets.",
        )

        with self.assertRaisesRegex(ValueError, "no recorded proposal event"):
            registry.agent_apply_patch(patch_id)

        self._append_patch_generated_event(patch_id)
        self._write_patch(patch_id, "<!-- Fill in specific persona changes below -->")
        with self.assertRaisesRegex(ValueError, "concrete behavior delta"):
            registry.agent_apply_patch(patch_id)

    def test_agent_apply_patch_preserves_valid_event_backed_path(self) -> None:
        patch_id = "supervisor-core-2026-04-06-001"
        self._write_patch(
            patch_id,
            "- Before: handoff summary used six bullets.\n- After: handoff summary uses at most three bullets.",
        )
        self._append_patch_generated_event(patch_id)

        result = registry.agent_apply_patch(patch_id)
        detail = registry.agent_show("supervisor-core")
        events_text = self._events_file().read_text(encoding="utf-8")

        self.assertEqual(result["patch_id"], patch_id)
        self.assertEqual(result["status"], "applied")
        self.assertEqual(detail["pending_patches"], [])
        self.assertIn("agent.patch_approved", events_text)
        self.assertIn("agent.patch_applied", events_text)

    def test_agent_patch_and_improver_reject_placeholder_proposals(self) -> None:
        with self.assertRaisesRegex(ValueError, "concrete behavior delta"):
            registry.agent_patch(
                "supervisor-core",
                patch_file="<!-- Fill in specific persona changes below -->",
                rationale="Reduce verbosity in handoff summaries",
            )
        with self.assertRaisesRegex(ValueError, "concrete behavior delta"):
            improver.generate_persona_patch(
                "supervisor-core",
                "Reduce verbosity in handoff summaries",
                "<!-- Fill in specific persona changes below -->",
            )

        self.assertFalse(self._events_file().exists())
        self.assertEqual(list(self.patches_dir.glob("*.md")), [])


if __name__ == "__main__":
    unittest.main()
