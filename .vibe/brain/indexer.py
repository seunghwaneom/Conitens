#!/usr/bin/env python3
"""
Heuristic repo indexer for the .vibe sidecar.
"""

from __future__ import annotations

import argparse
import ast
import fnmatch
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from context_db import ContextDB, file_hash, load_config


FUNCTION_PATTERNS = [
    re.compile(r"^(?P<indent>\s*)(?P<async>async\s+)?def\s+(?P<name>[A-Za-z_]\w*)\s*\((?P<params>[^)]*)\)\s*(?:->\s*(?P<returns>[^:]+))?:"),
    re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+(?P<name>[A-Za-z_$][\w$]*)\s*\((?P<params>[^)]*)\)"),
    re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\((?P<params>[^)]*)\)\s*=>"),
]
IMPORT_PATTERNS = [
    re.compile(r"^\s*from\s+(?P<module>[A-Za-z0-9_\.]+)\s+import\s+(?P<names>.+)$"),
    re.compile(r"^\s*import\s+(?P<module>[A-Za-z0-9_\.]+)"),
    re.compile(r'^\s*import\s+.*?\s+from\s+[\'"](?P<module>[^\'"]+)[\'"]'),
    re.compile(r'^\s*import\s+[\'"](?P<module>[^\'"]+)[\'"]'),
    re.compile(r'^\s*export\s+.*?\s+from\s+[\'"](?P<module>[^\'"]+)[\'"]'),
    re.compile(r'^\s*const\s+.*?=\s+require\([\'"](?P<module>[^\'"]+)[\'"]\)'),
]
DOC_START = re.compile(r"^\s*/\*\*")
DOC_LINE = re.compile(r"^\s*\* ?(.*)$")
DOC_END = re.compile(r".*\*/\s*$")
EXPORT_MARKER = re.compile(r"^\s*export\b|^\s*module\.exports\b|^\s*exports\.")
TEMP_FILE_PATTERN = re.compile(r"(~$|\.tmp$|\.temp$|\.sw[px]$|^\.)")


def utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def iter_source_files(repo_root: Path, config: dict[str, Any]) -> list[Path]:
    results: set[Path] = set()
    ignore_dirs = set(config.get("ignore_dirs", []))
    base_patterns = [pattern.replace("\\", "/") for pattern in (config.get("include_globs") or config.get("scan_globs") or [])]
    patterns: list[str] = []
    for pattern in base_patterns:
        patterns.append(pattern)
        if "/**/" in pattern:
            patterns.append(pattern.replace("/**/", "/", 1))
    for current_root, dirnames, filenames in os.walk(repo_root):
        rel_root = Path(current_root).relative_to(repo_root)
        dirnames[:] = [
            name
            for name in dirnames
            if name not in ignore_dirs and str((rel_root / name).as_posix()) not in ignore_dirs
        ]
        current = Path(current_root)
        for filename in filenames:
            candidate = current / filename
            if candidate.name.startswith(".") or TEMP_FILE_PATTERN.search(candidate.name):
                continue
            relative = str(candidate.relative_to(repo_root)).replace("\\", "/")
            if not any(fnmatch.fnmatch(relative, pattern) for pattern in patterns):
                continue
            results.add(candidate)
    return sorted(results)


def normalize_path(path: Path, *, repo_root: Path) -> str:
    return str(path.relative_to(repo_root)).replace("\\", "/")


def extract_doc_comment(lines: list[str], line_index: int) -> str | None:
    collected: list[str] = []
    cursor = line_index - 1
    while cursor >= 0 and lines[cursor].strip() == "":
        cursor -= 1
    if cursor < 0:
        return None
    if '"""' in lines[cursor]:
        chunk: list[str] = []
        while cursor >= 0:
            chunk.insert(0, lines[cursor].rstrip())
            if cursor != line_index - 1 and '"""' in lines[cursor]:
                break
            cursor -= 1
        return "\n".join(chunk).strip() or None
    if not DOC_END.match(lines[cursor]) and not lines[cursor].strip().startswith("*"):
        return None
    while cursor >= 0:
        line = lines[cursor].rstrip()
        collected.insert(0, line)
        if DOC_START.match(line):
            break
        cursor -= 1
    if not collected or not DOC_START.match(collected[0]):
        return None
    cleaned: list[str] = []
    for line in collected:
        if DOC_START.match(line):
            continue
        if DOC_END.match(line):
            body = line.replace("*/", "").strip().lstrip("*").strip()
            if body:
                cleaned.append(body)
            continue
        match = DOC_LINE.match(line)
        cleaned.append(match.group(1).strip() if match else line.strip())
    return "\n".join(part for part in cleaned if part).strip() or None


def derive_tags(*, relative: str, jsdoc: str | None, exported: bool, async_flag: bool) -> list[str]:
    tags: list[str] = []
    lower = relative.lower()
    if lower.endswith(".py"):
        tags.append("python")
    elif lower.endswith(".tsx"):
        tags.extend(["typescript", "react"])
    elif lower.endswith(".ts"):
        tags.append("typescript")
    else:
        tags.append("javascript")
    if "/tests/" in lower or lower.startswith("tests/") or ".test." in lower or ".spec." in lower:
        tags.append("test")
    if exported:
        tags.append("exported")
    if async_flag:
        tags.append("async")
    if jsdoc:
        text = jsdoc.lower()
        for token in ("deprecated", "todo", "critical"):
            if token in text:
                tags.append(token)
    return sorted(set(tags))


def resolve_dependency(specifier: str, *, from_path: Path, repo_root: Path) -> str:
    if specifier.startswith("./") or specifier.startswith("../"):
        base = (from_path.parent / specifier).resolve()
        candidates = [
            base,
            base.with_suffix(".py"),
            base.with_suffix(".ts"),
            base.with_suffix(".tsx"),
            base.with_suffix(".js"),
            base.with_suffix(".mjs"),
            base.with_suffix(".cjs"),
            base / "__init__.py",
            base / "index.ts",
            base / "index.tsx",
            base / "index.js",
        ]
        for candidate in candidates:
            if candidate.exists() and candidate.is_file():
                return normalize_path(candidate, repo_root=repo_root)
    elif specifier.startswith("."):
        dot_count = len(specifier) - len(specifier.lstrip("."))
        module_part = specifier.lstrip(".").replace(".", "/")
        base_dir = from_path.parent
        for _ in range(max(dot_count - 1, 0)):
            base_dir = base_dir.parent
        base = (base_dir / module_part).resolve()
        candidates = [
            base.with_suffix(".py"),
            base / "__init__.py",
        ]
        for candidate in candidates:
            if candidate.exists() and candidate.is_file():
                return normalize_path(candidate, repo_root=repo_root)
    return specifier


def extract_file_record(repo_root: Path, path: Path) -> dict[str, Any]:
    relative = normalize_path(path, repo_root=repo_root)
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        return {
            "path": relative,
            "mtime": path.stat().st_mtime if path.exists() else 0.0,
            "hash": "read-error",
            "loc": 0,
            "parse_error": str(exc),
            "functions": [],
            "deps": [],
            "fts": [],
        }

    if "\x00" in text:
        return {
            "path": relative,
            "mtime": path.stat().st_mtime,
            "hash": "malformed",
            "loc": len(text.splitlines()),
            "parse_error": "malformed or binary-like content",
            "functions": [],
            "deps": [],
            "fts": [],
        }

    lines = text.splitlines()
    parse_error = None
    if path.suffix.lower() == ".py":
        try:
            ast.parse(text, filename=str(path))
        except SyntaxError as exc:
            parse_error = f"SyntaxError: {exc.msg} at line {exc.lineno}"
    functions: list[dict[str, Any]] = []
    deps: list[dict[str, str]] = []
    fts_rows: list[dict[str, str]] = []

    for line_no, line in enumerate(lines, start=1):
        for pattern in FUNCTION_PATTERNS:
            match = pattern.match(line)
            if not match:
                continue
            name = match.group("name")
            params = [item.strip() for item in (match.groupdict().get("params") or "").split(",") if item.strip()]
            returns = (match.groupdict().get("returns") or "").strip() or None
            jsdoc = extract_doc_comment(lines, line_no - 1)
            exported = bool(EXPORT_MARKER.search(line))
            async_flag = bool(match.groupdict().get("async"))
            tags = derive_tags(relative=relative, jsdoc=jsdoc, exported=exported, async_flag=async_flag)
            functions.append(
                {
                    "name": name,
                    "file": relative,
                    "line": line_no,
                    "params": params,
                    "returns": returns,
                    "jsdoc": jsdoc,
                    "tags": tags,
                    "exported_int": int(exported),
                }
            )
            fts_rows.append(
                {
                    "name": name,
                    "file": relative,
                    "jsdoc": jsdoc or "",
                    "tags": " ".join(tags),
                    "free_text": " ".join(filter(None, [name, jsdoc or "", " ".join(params), returns or ""])),
                }
            )
            break

        for import_pattern in IMPORT_PATTERNS:
            match = import_pattern.match(line)
            if not match:
                continue
            specifier = match.group("module").strip()
            deps.append(
                {
                    "from_file": relative,
                    "to_file": resolve_dependency(specifier, from_path=path, repo_root=repo_root),
                    "kind": "import",
                }
            )
            break

    return {
        "path": relative,
        "mtime": path.stat().st_mtime,
        "hash": file_hash(text),
        "loc": len(lines),
        "parse_error": parse_error,
        "functions": functions,
        "deps": deps,
        "fts": fts_rows,
    }


def scan_file(repo_root: str | Path, file_path: str | Path, *, db: ContextDB | None = None) -> dict[str, Any]:
    repo_path = Path(repo_root).resolve()
    path = Path(file_path)
    if not path.is_absolute():
        path = repo_path / path
    db = db or ContextDB(repo_path)
    record = extract_file_record(repo_path, path)
    db.apply_record(record, indexed_at=utc_iso())
    return {
        "path": record["path"],
        "functions": len(record["functions"]),
        "deps": len(record["deps"]),
        "parse_error": record["parse_error"],
    }


def scan_all(repo_root: str | Path) -> dict[str, Any]:
    repo_path = Path(repo_root).resolve()
    config = load_config(repo_path)
    db = ContextDB(repo_path)
    files = iter_source_files(repo_path, config)
    indexed = 0
    errors: list[str] = []
    for path in files:
        result = scan_file(repo_path, path, db=db)
        indexed += 1
        if result["parse_error"]:
            errors.append(result["path"])
    return {
        "root": str(repo_path),
        "coverage_globs": config.get("include_globs") or config.get("scan_globs") or [],
        "files_indexed": indexed,
        "indexed_files": indexed,
        "errors": errors,
    }


def index_path(repo_root: str | Path, file_path: str | Path, *, db: ContextDB | None = None) -> dict[str, Any]:
    return scan_file(repo_root, file_path, db=db)


def main() -> int:
    parser = argparse.ArgumentParser(description="Index repo intelligence into .vibe SQLite")
    parser.add_argument("--root", default=".")
    parser.add_argument("--repo-root")
    parser.add_argument("--scan-all", action="store_true")
    parser.add_argument("--file")
    args = parser.parse_args()
    root = args.repo_root or args.root
    if args.scan_all:
        print(json.dumps(scan_all(root), ensure_ascii=False, indent=2))
        return 0
    if args.file:
        print(json.dumps(scan_file(root, args.file), ensure_ascii=False, indent=2))
        return 0
    parser.error("Use --scan-all or --file")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
