from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_persona_memory import (
    CandidatePatchWriter,
    MemoryRepository,
    MemoryRetriever,
    PersonaLoader,
    PersonaSchemaValidator,
    candidate_patch_root,
)


class PersonaMemoryTests(unittest.TestCase):
    def prepare_workspace(self) -> Path:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        workspace = Path(temp_dir.name)
        (workspace / ".conitens" / "personas").mkdir(parents=True, exist_ok=True)
        return workspace

    def write_persona(self, workspace: Path, content: str) -> Path:
        path = workspace / ".conitens" / "personas" / "persona.yaml"
        path.write_text(content, encoding="utf-8")
        return path

    def valid_persona_text(self) -> str:
        return "\n".join(
            [
                "id: sample-agent",
                "display_name: Sample Agent",
                "role: architect",
                "public_persona: calm and direct",
                "private_policy:",
                "  identity_core_locked: true",
                "expertise_tags:",
                "  - runtime",
                "default_skill_refs:",
                "  - conitens-core",
                "memory_namespace: sample-namespace",
                "handoff:",
                "  preferred_format: checklist",
                "self_improvement:",
                "  allow_candidate_patches: true",
            ]
        ) + "\n"

    def test_valid_persona_load(self) -> None:
        workspace = self.prepare_workspace()
        self.write_persona(workspace, self.valid_persona_text())

        persona = PersonaLoader(workspace).load("sample-agent")

        self.assertEqual(persona["display_name"], "Sample Agent")
        self.assertEqual(persona["memory_namespace"], "sample-namespace")

    def test_invalid_persona_rejection(self) -> None:
        workspace = self.prepare_workspace()
        self.write_persona(workspace, "id: broken\nrole: architect\n")

        with self.assertRaises(ValueError):
            PersonaLoader(workspace).load("broken")

    def test_namespace_isolation(self) -> None:
        workspace = self.prepare_workspace()
        repo = MemoryRepository(workspace)
        repo.write_record(
            agent_id="a",
            namespace="ns-a",
            kind="procedural",
            summary="only for a",
            source_type="test",
            source_ref="case",
            auto=True,
        )
        repo.write_record(
            agent_id="b",
            namespace="ns-b",
            kind="procedural",
            summary="only for b",
            source_type="test",
            source_ref="case",
            auto=True,
        )

        records = MemoryRetriever(repo).retrieve(namespace="ns-a")

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["agent_id"], "a")

    def test_memory_retrieval_ordering(self) -> None:
        workspace = self.prepare_workspace()
        repo = MemoryRepository(workspace)
        repo.write_record(
            agent_id="a",
            namespace="ns-a",
            kind="procedural",
            summary="low salience",
            salience=0.2,
            confidence=0.4,
            source_type="test",
            source_ref="one",
            auto=True,
        )
        repo.write_record(
            agent_id="a",
            namespace="ns-a",
            kind="reflection",
            summary="high salience",
            salience=0.9,
            confidence=0.9,
            source_type="test",
            source_ref="two",
            auto=True,
        )

        records = MemoryRetriever(repo).retrieve(namespace="ns-a")

        self.assertEqual(records[0]["summary"], "high salience")

    def test_unapproved_patch_exclusion(self) -> None:
        workspace = self.prepare_workspace()
        writer = CandidatePatchWriter(workspace)
        writer.write_patch(
            agent_id="a",
            namespace="ns-a",
            patch_text="private_policy:\n  mode: stricter",
            source_ref="test",
        )

        visible = writer.list_patches(namespace="ns-a")
        hidden = writer.list_patches(namespace="ns-a", include_unapproved=True)

        self.assertEqual(visible, [])
        self.assertEqual(len(hidden), 1)
        self.assertTrue(Path(hidden[0]["file_path"]).exists())

    def test_identity_auto_edit_rejection(self) -> None:
        workspace = self.prepare_workspace()
        repo = MemoryRepository(workspace)

        with self.assertRaises(PermissionError):
            repo.write_record(
                agent_id="a",
                namespace="ns-a",
                kind="identity",
                summary="auto identity write",
                source_type="test",
                source_ref="identity",
                auto=True,
            )


if __name__ == "__main__":
    unittest.main()
