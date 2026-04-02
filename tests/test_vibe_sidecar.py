from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BRAIN = ROOT / ".vibe" / "brain"
sys.path.insert(0, str(BRAIN))

from context_db import ContextDB
from indexer import scan_all, scan_file
from summarizer import RepoSummarizer
from watcher import RepoWatcher


CONFIG_JSON = """{
  "db_path": ".vibe/brain/context.sqlite3",
  "digest_path": ".vibe/context/LATEST_CONTEXT.md",
  "include_globs": ["src/**/*.py", "src/**/*.ts", "src/**/*.tsx", "src/**/*.js", "src/**/*.mjs", "src/**/*.cjs"],
  "ignore_dirs": [".git", "node_modules", ".vibe"],
  "watch_extensions": [".py", ".ts", ".tsx", ".js", ".mjs", ".cjs"],
  "debounce_ms": 200,
  "recent_change_limit": 5,
  "hotspot_limit": 5
}"""


class VibeSidecarTests(unittest.TestCase):
    def prepare_repo(self) -> Path:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        repo = Path(temp_dir.name)
        (repo / ".vibe" / "brain").mkdir(parents=True, exist_ok=True)
        (repo / ".vibe" / "context").mkdir(parents=True, exist_ok=True)
        (repo / ".vibe" / "config.json").write_text(CONFIG_JSON, encoding="utf-8")
        (repo / "src").mkdir(parents=True, exist_ok=True)
        return repo

    def test_scan_all_creates_db(self) -> None:
        repo = self.prepare_repo()
        (repo / "src" / "sample.py").write_text(
            'def hello(name):\n    """say hello"""\n    return name\n',
            encoding="utf-8",
        )
        result = scan_all(repo)
        db = ContextDB(repo)

        self.assertTrue(db.db_path.exists())
        self.assertEqual(result["indexed_files"], 1)

    def test_indexing_single_file_updates_rows(self) -> None:
        repo = self.prepare_repo()
        target = repo / "src" / "module.ts"
        target.write_text(
            "/** important */\nexport function greet(name: string): string { return name; }\nimport { x } from './dep';\n",
            encoding="utf-8",
        )
        scan_file(repo, target)
        db = ContextDB(repo)

        functions = db.list_functions("src/module.ts")
        deps = db.list_deps()

        self.assertEqual(len(functions), 1)
        self.assertEqual(functions[0]["name"], "greet")
        self.assertTrue(functions[0]["exported_int"])
        self.assertEqual(len(deps), 1)
        self.assertEqual(deps[0]["to_file"], "./dep")

    def test_summarizer_generates_expected_sections(self) -> None:
        repo = self.prepare_repo()
        (repo / "src" / "alpha.py").write_text("def alpha(x):\n    return x\n", encoding="utf-8")
        scan_all(repo)
        path = RepoSummarizer(repo).write()
        content = path.read_text(encoding="utf-8")

        self.assertIn("## Recent Changes", content)
        self.assertIn("## Critical Map", content)
        self.assertIn("## Warnings", content)
        self.assertIn("## Hotspots", content)
        self.assertIn("## Next Actions", content)

    def test_watcher_debounce_behavior(self) -> None:
        repo = self.prepare_repo()
        target = repo / "src" / "watch_me.py"
        target.write_text("def watch_me():\n    return 1\n", encoding="utf-8")
        watcher = RepoWatcher(repo)

        handled_one = watcher.handle_event("src/watch_me.py", now_ms=1000)
        handled_two = watcher.handle_event("src/watch_me.py", now_ms=1050)
        early = watcher.flush(now_ms=1100)
        late = watcher.flush(now_ms=1300)

        self.assertTrue(handled_one)
        self.assertTrue(handled_two)
        self.assertEqual(early, [])
        self.assertEqual(late, ["src/watch_me.py"])

    def test_malformed_file_does_not_crash_scan(self) -> None:
        repo = self.prepare_repo()
        (repo / "src" / "good.py").write_text("def good():\n    return 1\n", encoding="utf-8")
        (repo / "src" / "broken.py").write_text("def broken(:\n    pass\n", encoding="utf-8")

        result = scan_all(repo)
        db = ContextDB(repo)
        files = db.list_recent_files(10)

        self.assertEqual(result["indexed_files"], 2)
        self.assertEqual(len(files), 2)
        self.assertTrue(any(item["path"] == "src/broken.py" for item in files))


if __name__ == "__main__":
    unittest.main()
