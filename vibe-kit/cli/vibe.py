#!/usr/bin/env python3
"""
vibe-kit CLI
============
Unified command-line interface for vibe-kit.

Usage:
    vibe status          # Check vibe-kit setup
    vibe precommit       # Run staged-only pre-commit gate
    vibe doctor [--full] # Full project scan
    vibe baseline --init # Initialize type check baseline
"""

import argparse
import json
import os
import sys
from pathlib import Path


VERSION = "1.0.0"


def get_pack_dir(root: str) -> Path:
    """Detect which language pack to use."""
    # Check for Python files
    py_files = list(Path(root).rglob("*.py"))
    py_files = [f for f in py_files if not any(x in f.parts for x in [".venv", "venv", "__pycache__", ".git", ".vibe", "node_modules"])]
    
    # Check for JS files
    js_files = list(Path(root).rglob("*.js"))
    js_files = [f for f in js_files if not any(x in f.parts for x in ["node_modules", ".git", ".vibe", "dist", "build"])]
    
    # Return appropriate pack
    vibe_kit_root = Path(__file__).parent.parent
    
    if len(py_files) > len(js_files):
        return vibe_kit_root / "packs" / "python"
    elif js_files:
        return vibe_kit_root / "packs" / "js"
    else:
        return vibe_kit_root / "packs" / "python"  # Default


def cmd_status(args):
    """Check vibe-kit setup status."""
    root = os.path.abspath(args.root)
    vibe_dir = os.path.join(root, ".vibe")
    
    print(f"vibe-kit v{VERSION}")
    print("=" * 40)
    
    # Check .vibe directory
    if os.path.isdir(vibe_dir):
        print(f"✓ .vibe directory found")
    else:
        print(f"✗ .vibe directory NOT found")
        print(f"  Run: mkdir -p .vibe/{{context,db,baselines}}")
        return 2
    
    # Check config
    config_path = os.path.join(vibe_dir, "config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                config = json.load(f)
            print(f"✓ config.json found (project: {config.get('project_name', 'unknown')})")
        except:
            print(f"✗ config.json invalid")
            return 2
    else:
        print(f"✗ config.json NOT found")
        return 2
    
    # Check baseline
    baseline_path = os.path.join(vibe_dir, "baselines", "pyright_baseline.json")
    if os.path.exists(baseline_path):
        try:
            with open(baseline_path, "r") as f:
                baseline = json.load(f)
            print(f"✓ Baseline found ({baseline.get('error_count', '?')} errors)")
        except:
            print(f"⚠ Baseline invalid")
    else:
        print(f"⚠ No baseline (run: vibe baseline --init)")
    
    # Check LATEST_CONTEXT
    context_path = os.path.join(vibe_dir, "context", "LATEST_CONTEXT.md")
    if os.path.exists(context_path):
        print(f"✓ LATEST_CONTEXT.md found")
    else:
        print(f"⚠ No LATEST_CONTEXT (run: vibe doctor --context)")
    
    # Check upstream
    upstream_path = os.path.join(vibe_dir, "UPSTREAM.json")
    if os.path.exists(upstream_path):
        try:
            with open(upstream_path, "r") as f:
                upstream = json.load(f)
            print(f"✓ Upstream tracked: {upstream.get('repo', 'unknown')}")
        except:
            print(f"⚠ UPSTREAM.json invalid")
    else:
        print(f"⚠ No upstream tracking")
    
    # Detect language
    pack_dir = get_pack_dir(root)
    print(f"\n📦 Active pack: {pack_dir.name}")
    
    print("\n" + "=" * 40)
    print("✅ vibe-kit is configured")
    return 0


def cmd_precommit(args):
    """Run pre-commit gate."""
    root = os.path.abspath(args.root)
    pack_dir = get_pack_dir(root)
    
    precommit_script = pack_dir / "precommit.py"
    
    if not precommit_script.exists():
        print(f"[ERROR] Pre-commit script not found: {precommit_script}")
        return 2
    
    # Build command
    cmd = [sys.executable, str(precommit_script), "--root", root]
    
    if args.no_baseline:
        cmd.append("--no-baseline")
    if args.no_cycle:
        cmd.append("--no-cycle")
    if args.all:
        cmd.append("--all")
    
    # Execute
    import subprocess
    result = subprocess.run(cmd)
    return result.returncode


def cmd_doctor(args):
    """Run full project scan."""
    root = os.path.abspath(args.root)
    pack_dir = get_pack_dir(root)
    
    doctor_script = pack_dir / "doctor.py"
    
    if not doctor_script.exists():
        print(f"[ERROR] Doctor script not found: {doctor_script}")
        return 2
    
    # Build command
    cmd = [sys.executable, str(doctor_script), "--root", root]
    
    if args.output:
        cmd.extend(["--output", args.output])
    if args.upstream:
        cmd.append("--upstream")
    if args.context:
        cmd.append("--context")
    if args.strict:
        cmd.append("--strict")
    
    # Execute
    import subprocess
    result = subprocess.run(cmd)
    return result.returncode


def cmd_baseline(args):
    """Initialize or check baseline."""
    root = os.path.abspath(args.root)
    pack_dir = get_pack_dir(root)
    
    gate_script = pack_dir / "gate_pyright.py"
    
    if not gate_script.exists():
        print(f"[ERROR] Gate script not found: {gate_script}")
        return 2
    
    # Build command
    cmd = [sys.executable, str(gate_script), "--root", root]
    
    if args.init:
        cmd.append("--init")
    
    # Execute
    import subprocess
    result = subprocess.run(cmd)
    return result.returncode


def cmd_index(args):
    """Run indexer."""
    root = os.path.abspath(args.root)
    pack_dir = get_pack_dir(root)
    
    indexer_script = pack_dir / "indexer.py"
    
    if not indexer_script.exists():
        print(f"[ERROR] Indexer script not found: {indexer_script}")
        return 2
    
    # Build command
    cmd = [sys.executable, str(indexer_script), root]
    
    if args.output:
        cmd.extend(["--output", args.output])
    
    # Execute
    import subprocess
    result = subprocess.run(cmd)
    return result.returncode


def main():
    parser = argparse.ArgumentParser(
        description="vibe-kit: Agent-friendly development environment toolkit",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  status      Check vibe-kit setup
  precommit   Run staged-only pre-commit gate
  doctor      Full project scan
  baseline    Initialize/check type check baseline
  index       Run project indexer

Examples:
  vibe status
  vibe precommit
  vibe doctor --context
  vibe baseline --init
"""
    )
    
    parser.add_argument("--version", action="version", version=f"vibe-kit {VERSION}")
    parser.add_argument("--root", default=".", help="Project root directory")
    
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # status
    sp_status = subparsers.add_parser("status", help="Check vibe-kit setup")
    
    # precommit
    sp_precommit = subparsers.add_parser("precommit", help="Run pre-commit gate")
    sp_precommit.add_argument("--no-baseline", action="store_true", help="Skip baseline gate")
    sp_precommit.add_argument("--no-cycle", action="store_true", help="Skip cycle check")
    sp_precommit.add_argument("--all", action="store_true", help="Check all files")
    
    # doctor
    sp_doctor = subparsers.add_parser("doctor", help="Full project scan")
    sp_doctor.add_argument("--output", "-o", help="Output JSON report file")
    sp_doctor.add_argument("--upstream", action="store_true", help="Check upstream version")
    sp_doctor.add_argument("--context", action="store_true", help="Generate LATEST_CONTEXT.md")
    sp_doctor.add_argument("--strict", action="store_true", help="Exit 1 on any issue")
    
    # baseline
    sp_baseline = subparsers.add_parser("baseline", help="Initialize/check baseline")
    sp_baseline.add_argument("--init", action="store_true", help="Initialize/update baseline")
    
    # index
    sp_index = subparsers.add_parser("index", help="Run project indexer")
    sp_index.add_argument("--output", "-o", help="Output JSON file")
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        return 0
    
    # Dispatch
    commands = {
        "status": cmd_status,
        "precommit": cmd_precommit,
        "doctor": cmd_doctor,
        "baseline": cmd_baseline,
        "index": cmd_index,
    }
    
    return commands[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
