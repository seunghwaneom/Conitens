from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_skill_loader import (
    SkillValidationError,
    discover_skill_paths,
    list_available_skills,
    load_skill_content,
    load_skill_metadata,
    resolve_persona_default_skills,
)


VALID_SKILL = """---
schema_v: 1
skill_id: sample-skill
name: sample-skill
description: "Sample skill"
triggers:
  - sample
expected_capabilities:
  - inspect
---

# sample-skill

## Workflow

1. Inspect.

## Constraints

- Stay small.
"""


INVALID_SKILL = """---
schema_v: 1
name: invalid
---

# invalid
"""


class SkillLoaderTests(unittest.TestCase):
    def prepare_workspace(self) -> Path:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".agents" / "skills" / "sample-skill").mkdir(parents=True, exist_ok=True)
        (root / ".agents" / "skills" / "sample-skill" / "SKILL.md").write_text(VALID_SKILL, encoding="utf-8")
        (root / ".agents" / "skills" / "broken-skill").mkdir(parents=True, exist_ok=True)
        (root / ".agents" / "skills" / "broken-skill" / "SKILL.md").write_text(INVALID_SKILL, encoding="utf-8")
        (root / ".conitens" / "personas").mkdir(parents=True, exist_ok=True)
        (root / ".conitens" / "personas" / "persona.yaml").write_text(
            "\n".join(
                [
                    "id: sample-persona",
                    "display_name: Sample Persona",
                    "role: architect",
                    "public_persona: concise",
                    "private_policy:",
                    "  identity_core_locked: true",
                    "expertise_tags:",
                    "  - runtime",
                    "default_skill_refs:",
                    "  - sample-skill",
                    "memory_namespace: sample",
                    "handoff:",
                    "  preferred_format: checklist",
                    "self_improvement:",
                    "  allow_candidate_patches: true",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        return root

    def test_skill_discovery(self) -> None:
        root = self.prepare_workspace()
        paths = discover_skill_paths(root)
        self.assertEqual(len(paths), 2)

    def test_metadata_only_load(self) -> None:
        root = self.prepare_workspace()
        path = root / ".agents" / "skills" / "sample-skill" / "SKILL.md"
        summary = load_skill_metadata(path)
        self.assertEqual(summary.skill_id, "sample-skill")
        self.assertEqual(summary.description, "Sample skill")

    def test_on_demand_full_load(self) -> None:
        root = self.prepare_workspace()
        path = root / ".agents" / "skills" / "sample-skill" / "SKILL.md"
        loaded = load_skill_content(path)
        self.assertIn("## Workflow", loaded["body"])
        self.assertEqual(loaded["frontmatter"]["skill_id"], "sample-skill")

    def test_invalid_frontmatter_rejection(self) -> None:
        root = self.prepare_workspace()
        path = root / ".agents" / "skills" / "broken-skill" / "SKILL.md"
        with self.assertRaises(SkillValidationError):
            load_skill_metadata(path)

    def test_persona_default_skill_refs_resolve(self) -> None:
        root = self.prepare_workspace()
        resolved = resolve_persona_default_skills(root, "sample-persona")
        self.assertEqual(len(resolved), 1)
        self.assertEqual(resolved[0]["skill_id"], "sample-skill")


if __name__ == "__main__":
    unittest.main()
