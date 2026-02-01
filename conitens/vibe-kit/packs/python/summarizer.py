#!/usr/bin/env python3
"""
vibe-kit Python Pack: Summarizer
================================
Generate LATEST_CONTEXT.md following min spec.

Sections (per latest_context.min.md):
- [1] Recent Changes (REQUIRED)
- [2] Critical Items (REQUIRED)
- [3] Warnings (REQUIRED)
- [4] Hotspots (OPTIONAL)
- [5] Next Actions (OPTIONAL)
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def get_recent_changes(root: str, n: int = 12) -> list[dict]:
    """Get recently modified Python files using git."""
    try:
        # Get recently modified files from git
        result = subprocess.run(
            ["git", "log", "--name-only", "--pretty=format:", "-n", "50"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return []
        
        # Parse unique files
        seen = set()
        files = []
        for line in result.stdout.split('\n'):
            line = line.strip()
            if line.endswith('.py') and line not in seen:
                seen.add(line)
                # Get last commit message for this file
                msg_result = subprocess.run(
                    ["git", "log", "-1", "--pretty=format:%s", "--", line],
                    cwd=root,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                files.append({
                    "file": line,
                    "message": msg_result.stdout.strip() if msg_result.returncode == 0 else ""
                })
                if len(files) >= n:
                    break
        
        return files
    except Exception:
        # Fallback: use mtime
        py_files = []
        for path in Path(root).rglob("*.py"):
            if any(x in path.parts for x in [".venv", "venv", "__pycache__", ".git"]):
                continue
            try:
                mtime = path.stat().st_mtime
                py_files.append((str(path.relative_to(root)), mtime))
            except:
                pass
        
        py_files.sort(key=lambda x: x[1], reverse=True)
        return [{"file": f[0], "message": ""} for f in py_files[:n]]


def get_critical_items(index_data: dict) -> list[dict]:
    """Find items marked @critical or similar."""
    critical = []
    
    for file_info in index_data.get("files", []):
        if file_info.get("error"):
            continue
        
        filepath = file_info["file"]
        
        for func in file_info.get("functions", []):
            # Check decorators and docstring for @critical
            is_critical = False
            reason = ""
            
            for dec in func.get("decorators", []):
                if "critical" in dec.lower():
                    is_critical = True
                    reason = f"decorator: {dec}"
                    break
            
            docstring = func.get("docstring") or ""
            if "@critical" in docstring.lower() or "critical:" in docstring.lower():
                is_critical = True
                reason = "docstring tag"
            
            if is_critical:
                critical.append({
                    "file": filepath,
                    "line": func["line"],
                    "name": func["name"],
                    "type": "function",
                    "reason": reason
                })
    
    return critical


def get_warnings(root: str, index_data: dict, deps_data: Optional[dict] = None) -> list[dict]:
    """Collect warnings from various sources."""
    warnings = []
    
    # Check for syntax errors in index
    for file_info in index_data.get("files", []):
        if file_info.get("error"):
            warnings.append({
                "severity": "FAIL",
                "category": "syntax",
                "message": file_info["error"],
                "file": file_info["file"]
            })
    
    # Check for cycles if deps_data available
    if deps_data and deps_data.get("cycle_count", 0) > 0:
        for cycle in deps_data.get("cycles", []):
            warnings.append({
                "severity": "FAIL",
                "category": "cycle",
                "message": f"Circular dependency: {cycle['display']}",
                "file": cycle["path"][0] if cycle.get("path") else None
            })
    
    # Check for large functions
    for file_info in index_data.get("files", []):
        if file_info.get("error"):
            continue
        for func in file_info.get("functions", []):
            # Estimate function size by line count (rough heuristic)
            if len(func.get("params", [])) > 5:
                warnings.append({
                    "severity": "WARN",
                    "category": "complexity",
                    "message": f"Function has {len(func['params'])} parameters (>5)",
                    "file": file_info["file"],
                    "line": func["line"],
                    "name": func["name"]
                })
    
    return warnings


def get_hotspots(deps_data: Optional[dict]) -> list[dict]:
    """Get dependency hotspots."""
    if not deps_data:
        return []
    
    return deps_data.get("hotspots", [])[:10]


def generate_next_actions(warnings: list[dict], hotspots: list[dict]) -> list[str]:
    """Generate recommended next actions."""
    actions = []
    
    # Priority 1: Fix cycles
    cycles = [w for w in warnings if w["category"] == "cycle"]
    if cycles:
        actions.append(f"🔴 Fix {len(cycles)} circular dependencies")
    
    # Priority 2: Fix syntax errors
    syntax_errors = [w for w in warnings if w["category"] == "syntax"]
    if syntax_errors:
        actions.append(f"🔴 Fix {len(syntax_errors)} syntax errors")
    
    # Priority 3: Review hotspots
    if hotspots and hotspots[0].get("fan_in", 0) > 5:
        top = hotspots[0]
        actions.append(f"🟡 Review hotspot: {top['file']} (fan_in={top['fan_in']})")
    
    # Priority 4: Reduce complexity
    complex_funcs = [w for w in warnings if w["category"] == "complexity"]
    if complex_funcs:
        actions.append(f"🟡 Reduce complexity in {len(complex_funcs)} functions")
    
    if not actions:
        actions.append("✅ No critical issues. Consider adding tests or documentation.")
    
    return actions[:5]


def generate_latest_context(
    root: str,
    index_path: Optional[str] = None,
    deps_path: Optional[str] = None,
    output_path: Optional[str] = None
) -> str:
    """Generate LATEST_CONTEXT.md content."""
    
    # Load data
    index_data = {}
    if index_path and os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            index_data = json.load(f)
    
    deps_data = None
    if deps_path and os.path.exists(deps_path):
        with open(deps_path, "r", encoding="utf-8") as f:
            deps_data = json.load(f)
    
    # Gather data
    recent_changes = get_recent_changes(root)
    critical_items = get_critical_items(index_data)
    warnings = get_warnings(root, index_data, deps_data)
    hotspots = get_hotspots(deps_data)
    next_actions = generate_next_actions(warnings, hotspots)
    
    # Generate markdown
    timestamp = datetime.now(timezone.utc).isoformat()
    
    lines = [
        "# LATEST_CONTEXT",
        "",
        f"> Generated: {timestamp}",
        "> Pack: python",
        "",
        "## [1] Recent Changes",
        ""
    ]
    
    if recent_changes:
        for item in recent_changes:
            msg = f" — {item['message']}" if item.get('message') else ""
            lines.append(f"- `{item['file']}`{msg}")
    else:
        lines.append("No recent changes.")
    
    lines.extend([
        "",
        "## [2] Critical Items",
        ""
    ])
    
    if critical_items:
        for item in critical_items:
            lines.append(f"- **{item['name']}** ({item['type']}) — `{item['file']}:{item['line']}` ({item['reason']})")
    else:
        lines.append("No critical items.")
    
    lines.extend([
        "",
        "## [3] Warnings",
        ""
    ])
    
    if warnings:
        for w in warnings:
            loc = f"`{w['file']}"
            if w.get('line'):
                loc += f":{w['line']}"
            loc += "`"
            lines.append(f"- [{w['severity']}] {w['category']}: {w['message']} — {loc}")
    else:
        lines.append("No warnings.")
    
    if hotspots:
        lines.extend([
            "",
            "## [4] Hotspots",
            ""
        ])
        for h in hotspots[:5]:
            lines.append(f"- `{h['file']}` — fan_in={h['fan_in']}, fan_out={h['fan_out']}")
    
    if next_actions:
        lines.extend([
            "",
            "## [5] Next Actions",
            ""
        ])
        for i, action in enumerate(next_actions, 1):
            lines.append(f"{i}. {action}")
    
    lines.append("")
    content = "\n".join(lines)
    
    # Write output
    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)
    
    return content


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="vibe-kit Python Summarizer")
    parser.add_argument("--root", default=".", help="Project root directory")
    parser.add_argument("--index", help="Path to index JSON")
    parser.add_argument("--deps", help="Path to deps JSON")
    parser.add_argument("--output", "-o", default=".vibe/context/LATEST_CONTEXT.md",
                       help="Output file path")
    parser.add_argument("--stdout", action="store_true", help="Print to stdout instead of file")
    
    args = parser.parse_args()
    
    output_path = None if args.stdout else args.output
    
    content = generate_latest_context(
        root=args.root,
        index_path=args.index,
        deps_path=args.deps,
        output_path=output_path
    )
    
    if args.stdout:
        print(content)
    else:
        print(f"[OK] LATEST_CONTEXT.md written to {args.output}")


if __name__ == "__main__":
    main()
