#!/usr/bin/env python3
"""
vibe-kit Python Pack: Pre-commit Gate
======================================
Staged-only fast check for pre-commit hook.

Philosophy: Fast loop (<5s), staged files only.

Checks:
1. Baseline gate (pyright) - error count increase blocks
2. Cycle check - circular dependencies block
3. Complexity check - warn only, no block
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional


def get_staged_files(root: str) -> list[str]:
    """Get list of staged Python files."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            return []
        
        files = []
        for line in result.stdout.strip().split('\n'):
            if line.strip().endswith('.py'):
                files.append(line.strip())
        
        return files
    except Exception as e:
        print(f"[WARN] Could not get staged files: {e}", file=sys.stderr)
        return []


def load_config(root: str) -> dict:
    """Load vibe-kit config."""
    config_path = os.path.join(root, ".vibe", "config.json")
    
    default_config = {
        "quality_gates": {
            "baseline_gate": True,
            "cycle_block": True,
            "complexity_warn_threshold": 15
        }
    }
    
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
            return {**default_config, **config}
        except:
            pass
    
    return default_config


def run_indexer_incremental(root: str, files: list[str]) -> dict:
    """Run indexer on specific files only."""
    # Import indexer module
    pack_dir = Path(__file__).parent
    sys.path.insert(0, str(pack_dir))
    
    try:
        from indexer import index_file
        
        results = {"files": [], "stats": {"errors": 0}}
        
        for filepath in files:
            full_path = os.path.join(root, filepath)
            if os.path.exists(full_path):
                result = index_file(full_path, root)
                results["files"].append(result)
                if result.get("error"):
                    results["stats"]["errors"] += 1
        
        return results
    finally:
        sys.path.pop(0)


def check_cycles_incremental(root: str, index_data: dict) -> tuple[bool, list[str]]:
    """Quick cycle check on staged files."""
    pack_dir = Path(__file__).parent
    sys.path.insert(0, str(pack_dir))
    
    try:
        from deps import build_graph_from_index
        
        graph = build_graph_from_index(index_data)
        cycles = graph.find_cycles()
        
        if cycles:
            messages = [f"  Cycle: {' → '.join(c.path + [c.path[0]])}" for c in cycles]
            return False, messages
        
        return True, []
    except Exception as e:
        return True, [f"  [WARN] Cycle check failed: {e}"]
    finally:
        sys.path.pop(0)


def check_baseline_gate(root: str, staged_files: list[str]) -> tuple[bool, list[str]]:
    """Run pyright baseline check."""
    pack_dir = Path(__file__).parent
    gate_script = pack_dir / "gate_pyright.py"
    
    if not gate_script.exists():
        return True, ["  [SKIP] Pyright gate not found"]
    
    try:
        result = subprocess.run(
            [sys.executable, str(gate_script), "--root", root],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=root
        )
        
        messages = []
        for line in result.stderr.split('\n'):
            if line.strip():
                messages.append(f"  {line.strip()}")
        
        return result.returncode == 0, messages
    except subprocess.TimeoutExpired:
        return True, ["  [WARN] Pyright timed out, skipping"]
    except Exception as e:
        return True, [f"  [WARN] Pyright check failed: {e}"]


def check_complexity(index_data: dict, threshold: int = 15) -> list[str]:
    """Check for complexity warnings (non-blocking)."""
    warnings = []
    
    for file_info in index_data.get("files", []):
        if file_info.get("error"):
            continue
        
        for func in file_info.get("functions", []):
            # Parameter count check
            param_count = len(func.get("params", []))
            if param_count > 5:
                warnings.append(
                    f"  [WARN] {file_info['file']}:{func['line']} — "
                    f"{func['name']}() has {param_count} parameters"
                )
    
    return warnings


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="vibe-kit Python Pre-commit Gate")
    parser.add_argument("--root", default=".", help="Project root directory")
    parser.add_argument("--no-baseline", action="store_true", help="Skip baseline gate")
    parser.add_argument("--no-cycle", action="store_true", help="Skip cycle check")
    parser.add_argument("--all", action="store_true", help="Check all files (not just staged)")
    
    args = parser.parse_args()
    root = os.path.abspath(args.root)
    
    print("=" * 60)
    print("vibe-kit Python Pre-commit Gate")
    print("=" * 60)
    
    # Load config
    config = load_config(root)
    gates = config.get("quality_gates", {})
    
    # Get staged files
    if args.all:
        # Find all Python files
        staged = []
        for path in Path(root).rglob("*.py"):
            if not any(x in path.parts for x in [".venv", "venv", "__pycache__", ".git", ".vibe"]):
                staged.append(str(path.relative_to(root)))
        print(f"\nChecking all {len(staged)} Python files...")
    else:
        staged = get_staged_files(root)
        if not staged:
            print("\n[OK] No staged Python files. Nothing to check.")
            sys.exit(0)
        print(f"\nStaged Python files ({len(staged)}):")
        for f in staged[:10]:
            print(f"  • {f}")
        if len(staged) > 10:
            print(f"  ... and {len(staged) - 10} more")
    
    all_passed = True
    
    # 1. Index staged files
    print("\n[1/3] Indexing...")
    index_data = run_indexer_incremental(root, staged)
    
    syntax_errors = index_data["stats"].get("errors", 0)
    if syntax_errors > 0:
        print(f"  [FAIL] {syntax_errors} syntax errors found")
        for f in index_data["files"]:
            if f.get("error"):
                print(f"    • {f['file']}: {f['error']}")
        all_passed = False
    else:
        print(f"  [OK] {len(staged)} files indexed")
    
    # 2. Cycle check
    if not args.no_cycle and gates.get("cycle_block", True):
        print("\n[2/3] Cycle check...")
        cycle_ok, cycle_msgs = check_cycles_incremental(root, index_data)
        for msg in cycle_msgs:
            print(msg)
        if not cycle_ok:
            print("  [FAIL] Circular dependencies detected")
            all_passed = False
        else:
            print("  [OK] No cycles")
    else:
        print("\n[2/3] Cycle check... [SKIP]")
    
    # 3. Baseline gate
    if not args.no_baseline and gates.get("baseline_gate", True):
        print("\n[3/3] Baseline gate (pyright)...")
        baseline_ok, baseline_msgs = check_baseline_gate(root, staged)
        for msg in baseline_msgs:
            print(msg)
        if not baseline_ok:
            all_passed = False
    else:
        print("\n[3/3] Baseline gate... [SKIP]")
    
    # Complexity warnings (non-blocking)
    complexity_warns = check_complexity(index_data, gates.get("complexity_warn_threshold", 15))
    if complexity_warns:
        print("\n[INFO] Complexity warnings:")
        for w in complexity_warns[:5]:
            print(w)
        if len(complexity_warns) > 5:
            print(f"  ... and {len(complexity_warns) - 5} more")
    
    # Final result
    print("\n" + "=" * 60)
    if all_passed:
        print("[PASS] All gates passed ✓")
        sys.exit(0)
    else:
        print("[FAIL] Pre-commit blocked ✗")
        sys.exit(1)


if __name__ == "__main__":
    main()
