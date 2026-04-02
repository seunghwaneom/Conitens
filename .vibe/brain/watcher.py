#!/usr/bin/env python3
"""
Polling watcher with debounce for .vibe repo intelligence updates.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from context_db import ContextDB, load_config
from indexer import iter_source_files, scan_file
from summarizer import generate_digest, write_latest_context


def is_temp_path(path: Path, *, config: dict[str, Any]) -> bool:
    name = path.name.lower()
    suffixes = config.get("temp_suffixes") or [".tmp", ".temp", ".swp", ".swx", "~"]
    return any(name.endswith(suffix.lower()) for suffix in suffixes)


class DebounceQueue:
    def __init__(self, *, debounce_ms: int):
        self.debounce_ms = debounce_ms
        self.pending: dict[str, float] = {}

    def register(self, path: str, *, seen_at: float) -> None:
        self.pending[path] = seen_at

    def ready(self, *, now: float) -> list[str]:
        threshold = self.debounce_ms / 1000.0
        ready = [path for path, seen_at in self.pending.items() if now - seen_at >= threshold]
        for path in ready:
            self.pending.pop(path, None)
        return sorted(ready)


DebounceTracker = DebounceQueue


DebounceTracker = DebounceQueue


class RepoWatcher:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.config = load_config(self.root)
        self.db = ContextDB(self.root)
        self.queue = DebounceQueue(debounce_ms=int(self.config["debounce_ms"]))
        self.known_mtimes: dict[str, float] = {}

    def prime(self) -> None:
        for file_path in iter_source_files(self.root, config=self.config):
            self.known_mtimes[str(file_path)] = file_path.stat().st_mtime

    def handle_event(self, path: str | Path, *, now_ms: float | None = None) -> bool:
        candidate = Path(path)
        if not candidate.is_absolute():
            candidate = self.root / candidate
        if not self.should_watch(candidate):
            return False
        seen_at = (now_ms / 1000.0) if now_ms is not None else time.time()
        self.queue.register(str(candidate.relative_to(self.root)).replace("\\", "/"), seen_at=seen_at)
        return True

    def should_watch(self, path: Path) -> bool:
        suffixes = {suffix.lower() for suffix in (self.config.get("watch_extensions") or [".py", ".ts", ".tsx", ".js", ".mjs", ".cjs"])}
        return path.suffix.lower() in suffixes and not is_temp_path(path, config=self.config)

    def poll_once(self, *, now: float | None = None) -> list[str]:
        current_time = now if now is not None else time.time()
        for file_path in iter_source_files(self.root, config=self.config):
            if is_temp_path(file_path, config=self.config):
                continue
            key = str(file_path)
            mtime = file_path.stat().st_mtime
            previous = self.known_mtimes.get(key)
            if previous is None or mtime > previous:
                self.known_mtimes[key] = mtime
                self.handle_event(file_path, now_ms=current_time * 1000.0)
        return self.queue.ready(now=current_time)

    def flush(self, *, now_ms: float | None = None) -> list[str]:
        current_time = (now_ms / 1000.0) if now_ms is not None else time.time()
        ready = self.queue.ready(now=current_time)
        if not ready:
            return []
        self.process_ready(ready)
        return ready

    def process_ready(self, ready_paths: list[str]) -> list[dict[str, Any]]:
        reindexed: list[dict[str, Any]] = []
        for path_str in ready_paths:
            reindexed.append(scan_file(self.root, path_str))
        if reindexed:
            generate_digest(self.root, db=self.db)
        return reindexed

    def watch(self, *, interval_seconds: float = 1.0) -> None:
        self.prime()
        while True:
            self.poll_once()
            self.flush()
            time.sleep(interval_seconds)
