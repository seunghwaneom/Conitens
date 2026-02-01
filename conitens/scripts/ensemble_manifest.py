#!/usr/bin/env python3
"""
Ensemble v3.9 Manifest Module
==============================
Run reproducibility through comprehensive manifest tracking.

Captures: command, environment, inputs (with hashes), outputs, execution stats.
"""

import os
import json
import hashlib
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List

# ═══════════════════════════════════════════════════════════════════════════════
# MANIFEST SCHEMA
# ═══════════════════════════════════════════════════════════════════════════════

MANIFEST_VERSION = "1.0"

DEFAULT_MANIFEST = {
    "manifest_version": MANIFEST_VERSION,
    "task_id": None,
    "run_id": None,
    "timestamp_utc": None,
    
    "command": {
        "entry_point": None,
        "args": [],
        "working_dir": None,
    },
    
    "environment": {
        "matlab_version": None,
        "python_version": None,
        "toolboxes": [],
        "path_additions": [],
        "env_vars": {},
        "git_commit": None,
        "git_branch": None,
        "git_dirty": False,
    },
    
    "inputs": {
        "files": [],
        "parameters": {},
    },
    
    "outputs": {
        "files": [],
        "figures": 0,
        "png_saved": [],
    },
    
    "execution": {
        "exit_code": None,
        "duration_sec": None,
        "memory_peak_mb": None,
        "error_summary": None,
    },
}


def compute_file_hash(filepath: str, algorithm: str = "sha256") -> Optional[str]:
    """Compute hash of a file.
    
    Args:
        filepath: Path to file
        algorithm: Hash algorithm (sha256, md5)
        
    Returns:
        Hex digest string or None if file not found
    """
    try:
        hasher = hashlib.new(algorithm)
        with open(filepath, 'rb') as f:
            while chunk := f.read(8192):
                hasher.update(chunk)
        return hasher.hexdigest()
    except:
        return None


def get_git_info(workspace: str) -> Dict:
    """Get git repository information.
    
    Returns:
        Dict with commit, branch, dirty status
    """
    info = {
        "git_commit": None,
        "git_branch": None,
        "git_dirty": False,
    }
    
    try:
        # Get current commit
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            info["git_commit"] = result.stdout.strip()[:12]
        
        # Get current branch
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            info["git_branch"] = result.stdout.strip()
        
        # Check if dirty
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            info["git_dirty"] = len(result.stdout.strip()) > 0
    except:
        pass
    
    return info


def get_matlab_info() -> Dict:
    """Get MATLAB version and toolbox information.
    
    Note: This requires MATLAB to be available in PATH.
    """
    info = {
        "matlab_version": None,
        "toolboxes": [],
    }
    
    try:
        # Try to get MATLAB version
        result = subprocess.run(
            ["matlab", "-batch", "disp(version)"],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            # Parse version from output
            for line in result.stdout.split('\n'):
                if line.strip() and '(' in line:
                    info["matlab_version"] = line.strip()
                    break
    except:
        pass
    
    return info


def get_python_info() -> Dict:
    """Get Python version and key packages."""
    import sys
    
    info = {
        "python_version": sys.version.split()[0],
        "packages": {},
    }
    
    # Try to get key package versions
    key_packages = ["numpy", "scipy", "pandas", "matplotlib"]
    for pkg in key_packages:
        try:
            mod = __import__(pkg)
            info["packages"][pkg] = getattr(mod, "__version__", "unknown")
        except:
            pass
    
    return info


def create_manifest(
    workspace: str,
    task_id: str,
    run_id: str,
    entry_point: str,
    args: List[str] = None,
    working_dir: str = None,
    input_files: List[str] = None,
    parameters: Dict = None,
) -> Dict:
    """Create a new run manifest.
    
    Args:
        workspace: Workspace root path
        task_id: Task ID
        run_id: Run ID
        entry_point: Main script/function to run
        args: Command line arguments
        working_dir: Working directory for execution
        input_files: List of input file paths
        parameters: Dictionary of parameters
        
    Returns:
        Manifest dictionary
    """
    manifest = DEFAULT_MANIFEST.copy()
    manifest = json.loads(json.dumps(DEFAULT_MANIFEST))  # Deep copy
    
    manifest["task_id"] = task_id
    manifest["run_id"] = run_id
    manifest["timestamp_utc"] = datetime.utcnow().isoformat() + "Z"
    
    # Command info
    manifest["command"]["entry_point"] = entry_point
    manifest["command"]["args"] = args or []
    manifest["command"]["working_dir"] = working_dir or os.getcwd()
    
    # Environment info
    git_info = get_git_info(workspace)
    manifest["environment"].update(git_info)
    
    python_info = get_python_info()
    manifest["environment"]["python_version"] = python_info["python_version"]
    
    # Input files with hashes
    if input_files:
        for filepath in input_files:
            file_info = {
                "path": filepath,
                "sha256": compute_file_hash(filepath),
                "size_bytes": None,
            }
            try:
                file_info["size_bytes"] = os.path.getsize(filepath)
            except:
                pass
            manifest["inputs"]["files"].append(file_info)
    
    # Parameters
    if parameters:
        manifest["inputs"]["parameters"] = parameters
    
    return manifest


def update_manifest_outputs(
    manifest: Dict,
    output_files: List[str] = None,
    figures: int = 0,
    png_saved: List[str] = None,
) -> Dict:
    """Update manifest with output information.
    
    Args:
        manifest: Existing manifest dictionary
        output_files: List of output file paths
        figures: Number of figures generated
        png_saved: List of saved PNG files
        
    Returns:
        Updated manifest
    """
    if output_files:
        for filepath in output_files:
            file_info = {
                "path": filepath,
                "sha256": compute_file_hash(filepath),
                "size_bytes": None,
            }
            try:
                file_info["size_bytes"] = os.path.getsize(filepath)
            except:
                pass
            manifest["outputs"]["files"].append(file_info)
    
    manifest["outputs"]["figures"] = figures
    manifest["outputs"]["png_saved"] = png_saved or []
    
    return manifest


def update_manifest_execution(
    manifest: Dict,
    exit_code: int,
    duration_sec: float = None,
    memory_peak_mb: float = None,
    error_summary: str = None,
) -> Dict:
    """Update manifest with execution results.
    
    Args:
        manifest: Existing manifest dictionary
        exit_code: Process exit code
        duration_sec: Execution duration in seconds
        memory_peak_mb: Peak memory usage in MB
        error_summary: Error message if failed
        
    Returns:
        Updated manifest
    """
    manifest["execution"]["exit_code"] = exit_code
    manifest["execution"]["duration_sec"] = duration_sec
    manifest["execution"]["memory_peak_mb"] = memory_peak_mb
    manifest["execution"]["error_summary"] = error_summary
    
    return manifest


def save_manifest(workspace: str, manifest: Dict) -> Path:
    """Save manifest to run directory.
    
    Returns:
        Path to saved manifest file
    """
    task_id = manifest.get("task_id")
    run_id = manifest.get("run_id")
    
    if not task_id or not run_id:
        return None
    
    notes_dir = Path(workspace) / ".notes"
    
    # Find task directory
    for status_dir in ["ACTIVE", "ERRORS", "COMPLETED", "HALTED"]:
        for item in (notes_dir / status_dir).glob(f"*{task_id}*"):
            if item.is_dir():
                run_dir = item / "runs" / run_id
                run_dir.mkdir(parents=True, exist_ok=True)
                
                manifest_file = run_dir / "run.manifest.json"
                manifest_file.write_text(
                    json.dumps(manifest, indent=2, ensure_ascii=False),
                    encoding='utf-8'
                )
                return manifest_file
    
    return None


def load_manifest(workspace: str, task_id: str, run_id: str) -> Optional[Dict]:
    """Load manifest from run directory.
    
    Returns:
        Manifest dictionary or None
    """
    notes_dir = Path(workspace) / ".notes"
    
    for status_dir in ["ACTIVE", "ERRORS", "COMPLETED", "HALTED"]:
        for item in (notes_dir / status_dir).glob(f"*{task_id}*"):
            if item.is_dir():
                manifest_file = item / "runs" / run_id / "run.manifest.json"
                if manifest_file.exists():
                    try:
                        return json.loads(manifest_file.read_text(encoding='utf-8'))
                    except:
                        pass
    
    return None


def compare_manifests(manifest1: Dict, manifest2: Dict) -> Dict:
    """Compare two manifests and identify differences.
    
    Returns:
        Dictionary of differences
    """
    diffs = {
        "environment_diffs": [],
        "input_diffs": [],
        "parameter_diffs": [],
        "output_diffs": [],
        "identical": True,
    }
    
    # Compare environment
    env1 = manifest1.get("environment", {})
    env2 = manifest2.get("environment", {})
    
    for key in ["git_commit", "matlab_version", "python_version"]:
        if env1.get(key) != env2.get(key):
            diffs["environment_diffs"].append({
                "field": key,
                "run1": env1.get(key),
                "run2": env2.get(key),
            })
            diffs["identical"] = False
    
    # Compare input file hashes
    inputs1 = {f["path"]: f.get("sha256") for f in manifest1.get("inputs", {}).get("files", [])}
    inputs2 = {f["path"]: f.get("sha256") for f in manifest2.get("inputs", {}).get("files", [])}
    
    all_paths = set(inputs1.keys()) | set(inputs2.keys())
    for path in all_paths:
        h1 = inputs1.get(path)
        h2 = inputs2.get(path)
        if h1 != h2:
            diffs["input_diffs"].append({
                "path": path,
                "run1_hash": h1[:16] if h1 else None,
                "run2_hash": h2[:16] if h2 else None,
            })
            diffs["identical"] = False
    
    # Compare parameters
    params1 = manifest1.get("inputs", {}).get("parameters", {})
    params2 = manifest2.get("inputs", {}).get("parameters", {})
    
    all_params = set(params1.keys()) | set(params2.keys())
    for param in all_params:
        if params1.get(param) != params2.get(param):
            diffs["parameter_diffs"].append({
                "param": param,
                "run1": params1.get(param),
                "run2": params2.get(param),
            })
            diffs["identical"] = False
    
    return diffs


def format_manifest(manifest: Dict, verbose: bool = False) -> str:
    """Format manifest for display.
    
    Args:
        manifest: Manifest dictionary
        verbose: Show full details
        
    Returns:
        Formatted string
    """
    lines = []
    lines.append("┌─────────────────────────────────────────────────────────────────────┐")
    lines.append(f"│  📋 RUN MANIFEST v{manifest.get('manifest_version', '?')}")
    lines.append("├─────────────────────────────────────────────────────────────────────┤")
    lines.append(f"│  Task: {manifest.get('task_id')}")
    lines.append(f"│  Run: {manifest.get('run_id')}")
    lines.append(f"│  Time: {manifest.get('timestamp_utc', 'N/A')}")
    
    # Command
    cmd = manifest.get("command", {})
    lines.append("├─────────────────────────────────────────────────────────────────────┤")
    lines.append(f"│  Entry: {cmd.get('entry_point')}")
    if cmd.get("args"):
        lines.append(f"│  Args: {' '.join(cmd['args'][:5])}")
    
    # Environment
    env = manifest.get("environment", {})
    lines.append("├─────────────────────────────────────────────────────────────────────┤")
    if env.get("matlab_version"):
        lines.append(f"│  MATLAB: {env['matlab_version']}")
    if env.get("python_version"):
        lines.append(f"│  Python: {env['python_version']}")
    if env.get("git_commit"):
        dirty = " (dirty)" if env.get("git_dirty") else ""
        lines.append(f"│  Git: {env['git_commit']}{dirty}")
    
    # Inputs
    inputs = manifest.get("inputs", {})
    input_files = inputs.get("files", [])
    if input_files:
        lines.append("├─────────────────────────────────────────────────────────────────────┤")
        lines.append(f"│  Inputs: {len(input_files)} file(s)")
        if verbose:
            for f in input_files[:3]:
                h = f.get("sha256", "")[:8] if f.get("sha256") else "N/A"
                lines.append(f"│    • {Path(f['path']).name} ({h}...)")
    
    # Execution
    exe = manifest.get("execution", {})
    if exe.get("exit_code") is not None:
        lines.append("├─────────────────────────────────────────────────────────────────────┤")
        status = "✅ Success" if exe["exit_code"] == 0 else f"❌ Failed ({exe['exit_code']})"
        lines.append(f"│  Status: {status}")
        if exe.get("duration_sec"):
            lines.append(f"│  Duration: {exe['duration_sec']:.1f}s")
        if exe.get("error_summary"):
            lines.append(f"│  Error: {exe['error_summary'][:50]}...")
    
    lines.append("└─────────────────────────────────────────────────────────────────────┘")
    
    return "\n".join(lines)


# Export for CLI integration
__all__ = [
    "MANIFEST_VERSION",
    "create_manifest",
    "update_manifest_outputs",
    "update_manifest_execution",
    "save_manifest",
    "load_manifest",
    "compare_manifests",
    "format_manifest",
    "compute_file_hash",
    "get_git_info",
]
