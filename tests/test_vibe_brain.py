from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VIBE_BRAIN = ROOT / ".vibe" / "brain"
sys.path.insert(0, str(VIBE_BRAIN))

from context_db import ContextDB
from indexer import index_path, scan_all
from summarizer import write_latest_context
from watcher import DebounceQueue, RepoWatcher


class VibeBrainTests(unittest.TestCase):
    def prepare_repo(self) -> Path:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".vibe" / "brain").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context").mkdir(parents=True, exist_ok=True)
        (root / ".conitens" / "context").mkdir(parents=True, exist_ok=True)
        (root / ".conitens" / "context" / "LATEST_CONTEXT.md").write_text(
            "# runtime digest\n\nkeep separate\n",
            encoding="utf-8",
        )
        config = {
            "db_path": ".vibe/brain/context.sqlite3",
            "latest_context_path": ".vibe/context/LATEST_CONTEXT.md",
            "scan_globs": ["**/*.py", "**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs", "**/*.cjs"],
            "ignore_dirs": [".git", ".omx", ".notes", ".conitens", ".vibe", "node_modules", "dist", "build"],
            "temp_suffixes": [".tmp", ".temp", ".swp", ".swx", "~"],
            "watch_extensions": [".py", ".ts", ".tsx", ".js", ".mjs", ".cjs"],
            "debounce_ms": 750,
            "use_fts5": True,
        }
        (root / ".vibe" / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
        (root / "src").mkdir()
        (root / "src" / "alpha.py").write_text(
            '"""alpha module"""\n\n'
            "def helper(name: str) -> str:\n"
            '    """critical helper"""\n'
            '    return f"hi {name}"\n',
            encoding="utf-8",
        )
        (root / "src" / "beta.ts").write_text(
            "/** beta doc */\n"
            "import { helper } from './alpha'\n"
            "export function runTask(id: string) { return helper(id) }\n",
            encoding="utf-8",
        )
        return root

    def test_scan_all_creates_db(self) -> None:
        root = self.prepare_repo()

        result = scan_all(root)
        db = ContextDB(root)

        self.assertTrue((root / ".vibe" / "brain" / "context.sqlite3").exists())
        self.assertEqual(result["files_indexed"], 2)
        self.assertGreaterEqual(len(db.list_files()), 2)
        self.assertGreaterEqual(len(db.list_functions()), 2)

    def test_single_file_reindex_updates_rows(self) -> None:
        root = self.prepare_repo()
        scan_all(root)
        db = ContextDB(root)

        target = root / "src" / "alpha.py"
        target.write_text(
            '"""alpha module"""\n\n'
            "def helper(name: str) -> str:\n"
            '    """critical helper"""\n'
            '    return f"hi {name}"\n\n'
            "def helper_two(flag: bool) -> bool:\n"
            "    return flag\n",
            encoding="utf-8",
        )
        index_path(root, target, db=db)

        names = [row["name"] for row in db.list_functions("src/alpha.py")]
        self.assertIn("helper_two", names)
        self.assertEqual(names.count("helper"), 1)

    def test_summarizer_generates_expected_sections(self) -> None:
        root = self.prepare_repo()
        scan_all(root)
        target = write_latest_context(root)
        content = target.read_text(encoding="utf-8")

        self.assertIn("## [1] Recent Changes", content)
        self.assertIn("## [2] Critical Map", content)
        self.assertIn("## [3] Warnings", content)
        self.assertIn("## [4] Hotspots", content)
        self.assertIn("## [5] Next Actions", content)
        self.assertEqual(
            (root / ".conitens" / "context" / "LATEST_CONTEXT.md").read_text(encoding="utf-8"),
            "# runtime digest\n\nkeep separate\n",
        )

    def test_watcher_debounce_behavior(self) -> None:
        root = self.prepare_repo()
        watcher = RepoWatcher(root)
        watcher.prime()
        watcher.handle_event("src/beta.ts", now_ms=100000.0)
        ready_now = watcher.flush(now_ms=100050.0)
        ready_later = watcher.flush(now_ms=100900.0)

        self.assertEqual(ready_now, [])
        self.assertEqual(len(ready_later), 1)
        self.assertTrue((root / ".vibe" / "context" / "LATEST_CONTEXT.md").exists())

    def test_debounce_queue_coalesces_duplicates(self) -> None:
        queue = DebounceQueue(debounce_ms=100)
        queue.register("src/example.py", seen_at=1.0)
        queue.register("src/example.py", seen_at=1.05)
        self.assertEqual(queue.ready(now=1.10), [])
        self.assertEqual(queue.ready(now=1.20), ["src/example.py"])

    def test_malformed_file_does_not_crash_scan(self) -> None:
        root = self.prepare_repo()
        (root / "src" / "broken.py").write_bytes(b"print('ok')\x00broken")

        result = scan_all(root)
        db = ContextDB(root)

        self.assertIn("src/broken.py", result["errors"])
        files = {row["path"]: row for row in db.list_files()}
        self.assertIn("src/broken.py", files)
        self.assertEqual(files["src/broken.py"]["parse_error"], "malformed or binary-like content")
        self.assertIn("src/alpha.py", files)


if __name__ == "__main__":
    unittest.main()
