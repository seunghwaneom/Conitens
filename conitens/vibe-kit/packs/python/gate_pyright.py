#!/usr/bin/env python3
"""
vibe-kit Python Pack: Pyright Baseline Gate
============================================
Type checking gate using pyright with baseline comparison.

Philosophy: "Don't fix all errors — just don't add more"

Features:
- Run pyright and capture errors
- Compare against baseline
- Block only on error count increase
- Generate fingerprints for stable error tracking
"""

import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


@dataclass
class PyrightError:
    file: str
    line: int
    column: int
    severity: str  # "error" or "warning" or "information"
    message: str
    rule: Optional[str]
    fingerprint: str


@dataclass
class BaselineData:
    tool: str
    version: str
    timestamp: str
    error_count: int
    warning_count: int
    fingerprints: list[str]


def normalize_error_line(file: str, message: str, root: str = ".") -> str:
    """Normalize error for fingerprint generation."""
    # Make path relative
    try:
        rel_path = os.path.relpath(file, root)
    except ValueError:
        rel_path = file
    
    # Remove line/column numbers from message
    msg = re.sub(r'line \d+', 'line N', message)
    msg = re.sub(r'column \d+', 'column N', msg)
    
    # Normalize whitespace
    msg = ' '.join(msg.split())
    
    # Combine and lowercase
    normalized = f"{rel_path}:{msg}".lower()
    
    return normalized


def generate_fingerprint(file: str, message: str, root: str = ".") -> str:
    """Generate stable fingerprint for an error."""
    normalized = normalize_error_line(file, message, root)
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def run_pyright(root: str = ".", config_file: Optional[str] = None) -> tuple[list[PyrightError], str]:
    """Run pyright and parse output."""
    cmd = ["pyright", "--outputjson"]
    
    if config_file:
        cmd.extend(["--project", config_file])
    
    try:
        result = subprocess.run(
            cmd,
            cwd=root,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
    except FileNotFoundError:
        # Try with npx
        try:
            result = subprocess.run(
                ["npx", "pyright", "--outputjson"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=300
            )
        except FileNotFoundError:
            print("[ERROR] pyright not found. Install with:", file=sys.stderr)
            print("  pip install pyright", file=sys.stderr)
            print("  # or: uv pip install pyright", file=sys.stderr)
            print("  # or: npm install -g pyright", file=sys.stderr)
            sys.exit(2)
    except subprocess.TimeoutExpired:
        print("[ERROR] pyright timed out after 5 minutes", file=sys.stderr)
        sys.exit(2)
    
    # Parse JSON output
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        # Fallback: try to find JSON in output
        for line in result.stdout.split('\n'):
            if line.strip().startswith('{'):
                try:
                    data = json.loads(line)
                    break
                except:
                    pass
        else:
            print("[ERROR] Could not parse pyright output", file=sys.stderr)
            print(result.stdout[:1000], file=sys.stderr)
            sys.exit(2)
    
    version = data.get("version", "unknown")
    errors = []
    
    for diag in data.get("generalDiagnostics", []):
        file = diag.get("file", "unknown")
        line = diag.get("range", {}).get("start", {}).get("line", 0)
        column = diag.get("range", {}).get("start", {}).get("character", 0)
        severity = diag.get("severity", "error")
        message = diag.get("message", "")
        rule = diag.get("rule")
        
        fingerprint = generate_fingerprint(file, message, root)
        
        errors.append(PyrightError(
            file=file,
            line=line,
            column=column,
            severity=severity,
            message=message,
            rule=rule,
            fingerprint=fingerprint
        ))
    
    return errors, version


def load_baseline(baseline_path: str) -> Optional[BaselineData]:
    """Load baseline from file."""
    if not os.path.exists(baseline_path):
        return None
    
    try:
        with open(baseline_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return BaselineData(**data)
    except (json.JSONDecodeError, TypeError, KeyError) as e:
        print(f"[WARN] Could not load baseline: {e}", file=sys.stderr)
        return None


def save_baseline(baseline_path: str, data: BaselineData) -> None:
    """Save baseline to file."""
    os.makedirs(os.path.dirname(baseline_path), exist_ok=True)
    with open(baseline_path, "w", encoding="utf-8") as f:
        json.dump(asdict(data), f, indent=2)


def compare_baseline(
    current_errors: list[PyrightError],
    baseline: Optional[BaselineData]
) -> tuple[bool, dict]:
    """Compare current errors against baseline."""
    current_count = sum(1 for e in current_errors if e.severity == "error")
    current_warnings = sum(1 for e in current_errors if e.severity == "warning")
    current_fingerprints = [e.fingerprint for e in current_errors if e.severity == "error"]
    
    if baseline is None:
        # No baseline = first run, always pass
        return True, {
            "status": "no_baseline",
            "current_errors": current_count,
            "current_warnings": current_warnings,
            "message": "No baseline found. Run with --init to create."
        }
    
    baseline_count = baseline.error_count
    
    # Core rule: current > baseline = FAIL
    passed = current_count <= baseline_count
    
    # Find new/resolved errors
    new_fingerprints = set(current_fingerprints) - set(baseline.fingerprints)
    resolved_fingerprints = set(baseline.fingerprints) - set(current_fingerprints)
    
    return passed, {
        "status": "pass" if passed else "fail",
        "baseline_errors": baseline_count,
        "current_errors": current_count,
        "delta": current_count - baseline_count,
        "new_errors": len(new_fingerprints),
        "resolved_errors": len(resolved_fingerprints),
        "message": (
            f"✓ Error count: {current_count} (baseline: {baseline_count})"
            if passed else
            f"✗ Error count increased: {current_count} > {baseline_count} (+{current_count - baseline_count})"
        )
    }


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="vibe-kit Pyright Baseline Gate")
    parser.add_argument("--root", default=".", help="Project root directory")
    parser.add_argument("--baseline", default=".vibe/baselines/pyright_baseline.json", 
                       help="Baseline file path")
    parser.add_argument("--init", action="store_true", help="Initialize/update baseline")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    parser.add_argument("--output", "-o", help="Output JSON report")
    
    args = parser.parse_args()
    
    print(f"Running pyright in {args.root}...", file=sys.stderr)
    errors, version = run_pyright(args.root)
    
    error_count = sum(1 for e in errors if e.severity == "error")
    warning_count = sum(1 for e in errors if e.severity == "warning")
    
    print(f"Found {error_count} errors, {warning_count} warnings", file=sys.stderr)
    
    if args.init:
        # Create/update baseline
        baseline_data = BaselineData(
            tool="pyright",
            version=version,
            timestamp=datetime.now(timezone.utc).isoformat(),
            error_count=error_count,
            warning_count=warning_count,
            fingerprints=[e.fingerprint for e in errors if e.severity == "error"]
        )
        save_baseline(args.baseline, baseline_data)
        print(f"[OK] Baseline saved: {error_count} errors → {args.baseline}")
        sys.exit(0)
    
    # Compare against baseline
    baseline = load_baseline(args.baseline)
    passed, comparison = compare_baseline(errors, baseline)
    
    # Output
    report = {
        "tool": "pyright",
        "version": version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "errors": [asdict(e) for e in errors if e.severity == "error"],
        "warnings": [asdict(e) for e in errors if e.severity == "warning"],
        "comparison": comparison
    }
    
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    
    # Print result
    print(f"\n{comparison['message']}", file=sys.stderr)
    
    if not passed:
        print("\nNew errors:", file=sys.stderr)
        baseline_fps = set(baseline.fingerprints) if baseline else set()
        for e in errors:
            if e.severity == "error" and e.fingerprint not in baseline_fps:
                print(f"  {e.file}:{e.line}: {e.message}", file=sys.stderr)
    
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
