from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
import sys

sys.path.insert(0, str(SCRIPTS))

from ensemble_claude_review import (
    ClaudeAuthStatus,
    build_artifact_path,
    slugify,
    write_artifact,
)


class ClaudeReviewWrapperTests(unittest.TestCase):
    def test_slugify_normalizes_prompt_text(self) -> None:
        self.assertEqual(slugify("FE-5 final review please"), "fe-5-final-review-please")
        self.assertEqual(slugify("   "), "claude-review")

    def test_build_artifact_path_targets_omx_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = build_artifact_path(temp_dir, slug="demo")
            self.assertIn(".omx", path.parts)
            self.assertIn("artifacts", path.parts)
            self.assertTrue(path.name.startswith("claude-demo-"))

    def test_write_artifact_persists_expected_sections(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            auth = ClaudeAuthStatus(
                logged_in=True,
                auth_method="claude.ai",
                email="user@example.com",
                raw={"loggedIn": True},
            )
            review = type(
                "Review",
                (),
                {
                    "prompt": "Review this",
                    "output": "Looks good",
                    "timeout_seconds": 300,
                    "effort": "medium",
                    "command": ["claude", "-p", "--effort", "medium", "Review this"],
                    "timed_out": False,
                    "auth_status": auth,
                },
            )()
            artifact = write_artifact(temp_dir, task="Original task", slug="demo", review=review)
            content = artifact.read_text(encoding="utf-8")
            self.assertIn("## 1. Original user task", content)
            self.assertIn("Original task", content)
            self.assertIn("Review this", content)
            self.assertIn("Looks good", content)
            self.assertIn("user@example.com", content)
