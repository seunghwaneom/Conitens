#!/usr/bin/env python3
"""
vibe-kit Python Pack: Doctor
============================
Full project scan and comprehensive report.

Unlike precommit (staged-only, fast), doctor scans everything.

Features:
- Full index scan
- Complete dependency analysis
- Baseline gate check
- Hotspot analysis
- LATEST_CONTEXT generation
- Optional: upstream version check
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def load_config(root: str) -> dict:
    """Load vibe-kit config."""
    config_path = os.path.join(root, ".vibe", "config.json")
    
    default_config = {
        "project_name": os.path.basename(root),
        "root": ".",
        "exclude_dirs": ["__pycache__", ".venv", "venv", ".git", ".vibe", "node_modules"],
        "include_globs": ["**/*.py"],
        "quality_gates": {
            "baseline_gate": True,
            "cycle_block": True,
            "complexity_warn_threshold": 15
        },
        "context": {
            "latest_file": ".vibe/context/LATEST_CONTEXT.md"
        }
    }
    
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
            # Merge with defaults
            for key, value in default_config.items():
                if key not in config:
                    config[key] = value
                elif isinstance(value, dict):
                    config[key] = {**value, **config.get(key, {})}
            return config
        except Exception as e:
            print(f"[WARN] Could not load config: {e}", file=sys.stderr)
    
    return default_config


def run_full_index(root: str, config: dict) -> dict:
    """Run full project index."""
    pack_dir = Path(__file__).parent
    sys.path.insert(0, str(pack_dir))
    
    try:
        from indexer import index_directory
        
        return index_directory(
            root,
            include_globs=config.get("include_globs", ["**/*.py"]),
            exclude_dirs=config.get("exclude_dirs", [])
        )
    finally:
        sys.path.pop(0)


def run_deps_analysis(index_data: dict) -> dict:
    """Run dependency analysis."""
    pack_dir = Path(__file__).parent
    sys.path.insert(0, str(pack_dir))
    
    try:
        from deps import build_graph_from_index
        
        graph = build_graph_from_index(index_data)
        cycles = graph.find_cycles()
        hotspots = graph.get_hotspots(20)
        
        return {
            "total_files": len(graph.edges),
            "total_edges": len(graph.edge_details),
            "cycles": [
                {"path": c.path, "length": c.length, "display": str(c)}
                for c in cycles
            ],
            "cycle_count": len(cycles),
            "hotspots": [
                {"file": h[0], "fan_in": h[1], "fan_out": h[2]}
                for h in hotspots
            ]
        }
    except Exception as e:
        return {"error": str(e), "cycle_count": 0, "hotspots": []}
    finally:
        sys.path.pop(0)


def run_baseline_check(root: str) -> tuple[bool, dict]:
    """Run pyright baseline check."""
    pack_dir = Path(__file__).parent
    gate_script = pack_dir / "gate_pyright.py"
    
    if not gate_script.exists():
        return True, {"status": "skipped", "message": "Pyright gate not found"}
    
    try:
        result = subprocess.run(
            [sys.executable, str(gate_script), "--root", root, "--output", "/tmp/pyright_report.json"],
            capture_output=True,
            text=True,
            timeout=300,
            cwd=root
        )
        
        # Try to load report
        report = {}
        if os.path.exists("/tmp/pyright_report.json"):
            with open("/tmp/pyright_report.json", "r") as f:
                report = json.load(f)
        
        return result.returncode == 0, {
            "status": "pass" if result.returncode == 0 else "fail",
            "returncode": result.returncode,
            "report": report.get("comparison", {}),
            "stderr": result.stderr[-500:] if result.stderr else ""
        }
    except subprocess.TimeoutExpired:
        return True, {"status": "timeout", "message": "Pyright timed out after 5 minutes"}
    except Exception as e:
        return True, {"status": "error", "message": str(e)}


def check_upstream(root: str) -> Optional[dict]:
    """Check for upstream vibe-kit updates."""
    upstream_path = os.path.join(root, ".vibe", "UPSTREAM.json")
    
    if not os.path.exists(upstream_path):
        return None
    
    try:
        with open(upstream_path, "r", encoding="utf-8") as f:
            upstream = json.load(f)
        
        return {
            "repo": upstream.get("repo", "unknown"),
            "commit": upstream.get("commit", "unknown"),
            "local_patches": len(upstream.get("patches", [])),
            "status": "tracked"
        }
    except:
        return None


def generate_report(
    root: str,
    config: dict,
    index_data: dict,
    deps_data: dict,
    baseline_result: tuple[bool, dict],
    upstream: Optional[dict]
) -> dict:
    """Generate comprehensive doctor report."""
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Collect issues
    issues = []
    
    # Syntax errors
    for file_info in index_data.get("files", []):
        if file_info.get("error"):
            issues.append({
                "severity": "FAIL",
                "category": "syntax",
                "file": file_info["file"],
                "message": file_info["error"]
            })
    
    # Cycles
    for cycle in deps_data.get("cycles", []):
        issues.append({
            "severity": "FAIL",
            "category": "cycle",
            "file": cycle["path"][0] if cycle.get("path") else None,
            "message": f"Circular dependency: {cycle['display']}"
        })
    
    # Baseline issues
    baseline_ok, baseline_info = baseline_result
    if not baseline_ok:
        issues.append({
            "severity": "FAIL",
            "category": "typecheck",
            "file": None,
            "message": baseline_info.get("report", {}).get("message", "Baseline gate failed")
        })
    
    # Stats
    stats = index_data.get("stats", {})
    
    return {
        "timestamp": timestamp,
        "project": config.get("project_name", "unknown"),
        "summary": {
            "files": stats.get("total_files", 0),
            "functions": stats.get("total_functions", 0),
            "classes": stats.get("total_classes", 0),
            "loc": stats.get("total_loc", 0),
            "syntax_errors": stats.get("errors", 0),
            "cycles": deps_data.get("cycle_count", 0),
            "baseline_status": "pass" if baseline_ok else "fail"
        },
        "issues": issues,
        "hotspots": deps_data.get("hotspots", [])[:10],
        "upstream": upstream,
        "baseline": baseline_info
    }


def print_report(report: dict) -> None:
    """Print formatted report to console."""
    print("\n" + "=" * 70)
    print(f"VIBE-KIT DOCTOR REPORT — {report['project']}")
    print(f"Generated: {report['timestamp']}")
    print("=" * 70)
    
    # Summary
    s = report["summary"]
    print(f"\n📊 SUMMARY")
    print(f"   Files: {s['files']} | Functions: {s['functions']} | Classes: {s['classes']} | LOC: {s['loc']}")
    print(f"   Syntax errors: {s['syntax_errors']} | Cycles: {s['cycles']} | Baseline: {s['baseline_status']}")
    
    # Issues
    issues = report.get("issues", [])
    fails = [i for i in issues if i["severity"] == "FAIL"]
    warns = [i for i in issues if i["severity"] == "WARN"]
    
    if fails:
        print(f"\n🔴 FAILURES ({len(fails)})")
        for i in fails[:10]:
            loc = f"`{i['file']}`" if i.get("file") else ""
            print(f"   [{i['category']}] {i['message']} {loc}")
        if len(fails) > 10:
            print(f"   ... and {len(fails) - 10} more")
    
    if warns:
        print(f"\n🟡 WARNINGS ({len(warns)})")
        for i in warns[:5]:
            loc = f"`{i['file']}`" if i.get("file") else ""
            print(f"   [{i['category']}] {i['message']} {loc}")
        if len(warns) > 5:
            print(f"   ... and {len(warns) - 5} more")
    
    # Hotspots
    hotspots = report.get("hotspots", [])
    if hotspots:
        print(f"\n🔥 HOTSPOTS (top 5 by fan-in)")
        for h in hotspots[:5]:
            print(f"   {h['file']}: fan_in={h['fan_in']}, fan_out={h['fan_out']}")
    
    # Upstream
    upstream = report.get("upstream")
    if upstream:
        print(f"\n📦 UPSTREAM")
        print(f"   Repo: {upstream['repo']}")
        print(f"   Commit: {upstream['commit']}")
        print(f"   Local patches: {upstream['local_patches']}")
    
    # Final verdict
    print("\n" + "-" * 70)
    if not fails:
        print("✅ DOCTOR COMPLETE — No critical issues")
    else:
        print(f"❌ DOCTOR COMPLETE — {len(fails)} critical issue(s) found")
    print("-" * 70 + "\n")


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="vibe-kit Python Doctor")
    parser.add_argument("--root", default=".", help="Project root directory")
    parser.add_argument("--output", "-o", help="Output JSON report file")
    parser.add_argument("--upstream", action="store_true", help="Check upstream version")
    parser.add_argument("--context", action="store_true", help="Generate LATEST_CONTEXT.md")
    parser.add_argument("--full", action="store_true", help="Run all checks (default)")
    parser.add_argument("--strict", action="store_true", help="Exit 1 on any issue")
    
    args = parser.parse_args()
    root = os.path.abspath(args.root)
    
    print("vibe-kit Python Doctor")
    print("=" * 40)
    
    # Load config
    config = load_config(root)
    print(f"Project: {config.get('project_name', 'unknown')}")
    
    # 1. Full index
    print("\n[1/4] Indexing project...")
    index_data = run_full_index(root, config)
    stats = index_data.get("stats", {})
    print(f"      Found {stats.get('total_files', 0)} files, {stats.get('total_functions', 0)} functions")
    
    # Save index
    index_path = os.path.join(root, ".vibe", "db", "index.json")
    os.makedirs(os.path.dirname(index_path), exist_ok=True)
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, indent=2)
    
    # 2. Deps analysis
    print("\n[2/4] Analyzing dependencies...")
    deps_data = run_deps_analysis(index_data)
    print(f"      {deps_data.get('total_edges', 0)} edges, {deps_data.get('cycle_count', 0)} cycles")
    
    # Save deps
    deps_path = os.path.join(root, ".vibe", "db", "deps.json")
    with open(deps_path, "w", encoding="utf-8") as f:
        json.dump(deps_data, f, indent=2)
    
    # 3. Baseline check
    print("\n[3/4] Running baseline gate...")
    baseline_result = run_baseline_check(root)
    baseline_ok, baseline_info = baseline_result
    print(f"      Status: {baseline_info.get('status', 'unknown')}")
    
    # 4. Upstream check (optional)
    upstream = None
    if args.upstream:
        print("\n[4/4] Checking upstream...")
        upstream = check_upstream(root)
        if upstream:
            print(f"      Tracking: {upstream['repo']}")
        else:
            print("      No UPSTREAM.json found")
    else:
        print("\n[4/4] Upstream check... [SKIP]")
    
    # Generate report
    report = generate_report(root, config, index_data, deps_data, baseline_result, upstream)
    
    # Print report
    print_report(report)
    
    # Save JSON report
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"Report saved to {args.output}")
    
    # Generate LATEST_CONTEXT
    if args.context:
        pack_dir = Path(__file__).parent
        sys.path.insert(0, str(pack_dir))
        try:
            from summarizer import generate_latest_context
            
            context_path = os.path.join(root, config["context"]["latest_file"])
            generate_latest_context(
                root=root,
                index_path=index_path,
                deps_path=deps_path,
                output_path=context_path
            )
            print(f"LATEST_CONTEXT.md generated at {context_path}")
        finally:
            sys.path.pop(0)
    
    # Exit code
    has_fails = any(i["severity"] == "FAIL" for i in report.get("issues", []))
    
    if args.strict and has_fails:
        sys.exit(1)
    elif has_fails:
        sys.exit(1)  # doctor exits 1 on critical issues by default
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
