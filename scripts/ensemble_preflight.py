#!/usr/bin/env python3
"""
Ensemble v3.9 Preflight Module
===============================
Pre-execution data contract validation.

Checks: file existence, shape, type, range, NaN ratio before MATLAB/Python execution.

═══════════════════════════════════════════════════════════════════════════════
PREFLIGHT POLICY (v3.9 - FIXED)
═══════════════════════════════════════════════════════════════════════════════
| Status | Action                                    | Exit Code |
|--------|-------------------------------------------|-----------|
| FAIL   | Block execution, log to ERRORS registry   | 1         |
| WARN   | Allow execution, log warning count        | 0         |
| PASS   | Allow execution                           | 0         |
| SKIP   | Allow execution (no config found)         | 0         |
═══════════════════════════════════════════════════════════════════════════════
"""

import os
import json
import re
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any, Union, Tuple
import fnmatch

# ═══════════════════════════════════════════════════════════════════════════════
# PREFLIGHT POLICY CONSTANTS (v3.9 FIXED)
# ═══════════════════════════════════════════════════════════════════════════════
# FAIL → Block execution (exit 1)
# WARN → Allow execution, but accumulate in .notes/ERRORS/_preflight_warnings.json
# ═══════════════════════════════════════════════════════════════════════════════

POLICY_FAIL_BLOCKS = True   # FAIL status blocks execution (exit 1)
POLICY_WARN_LOGS = True     # WARN status logs to warning registry
WARN_ESCALATION_THRESHOLD = 3  # 3+ consecutive WARNs on same check → escalate to advisory

# ═══════════════════════════════════════════════════════════════════════════════
# PREFLIGHT CHECK TYPES
# ═══════════════════════════════════════════════════════════════════════════════

CHECK_TYPES = [
    "exists",       # File/variable exists
    "shape",        # Array dimensions
    "type",         # Data type (numeric, string, etc.)
    "range",        # Value range (min, max)
    "nan_ratio",    # NaN/Inf ratio threshold
    "not_empty",    # Non-empty check
    "pattern",      # Filename pattern match
]

# Result status
STATUS_PASS = "PASS"
STATUS_WARN = "WARN"
STATUS_FAIL = "FAIL"
STATUS_SKIP = "SKIP"


def load_preflight_config(workspace: str, task_id: str) -> Optional[Dict]:
    """Load preflight configuration for a task.
    
    Looks for preflight.yaml or preflight.json in task directory.
    
    Returns:
        Configuration dictionary or None
    """
    notes_dir = Path(workspace) / ".notes"
    
    # Find task directory
    for status_dir in ["ACTIVE", "ERRORS", "INBOX"]:
        for item in (notes_dir / status_dir).glob(f"*{task_id}*"):
            if item.is_dir():
                # Check for preflight config
                for config_name in ["preflight.yaml", "preflight.json"]:
                    config_file = item / config_name
                    if config_file.exists():
                        try:
                            content = config_file.read_text(encoding='utf-8')
                            if config_name.endswith('.json'):
                                return json.loads(content)
                            else:
                                # Simple YAML parsing (no external dependency)
                                return parse_simple_yaml(content)
                        except:
                            pass
    
    return None


def parse_simple_yaml(content: str) -> Dict:
    """Simple YAML parser for preflight config (no pyyaml dependency).
    
    Supports basic key: value and simple lists.
    """
    result = {"contracts": []}
    current_contract = None
    current_check = None
    indent_stack = []
    
    for line in content.split('\n'):
        if not line.strip() or line.strip().startswith('#'):
            continue
        
        # Count indentation
        indent = len(line) - len(line.lstrip())
        stripped = line.strip()
        
        # Handle list items
        if stripped.startswith('- '):
            item = stripped[2:].strip()
            
            if ':' in item:
                # Dict item in list
                key, value = item.split(':', 1)
                key = key.strip()
                value = value.strip()
                
                if key == 'name':
                    current_contract = {"name": value, "checks": []}
                    result["contracts"].append(current_contract)
                elif key == 'type' and current_contract:
                    current_check = {"type": value}
                    current_contract.setdefault("checks", []).append(current_check)
                elif current_check and key in ['variable', 'expected', 'min', 'max', 'nan_ratio_max', 'variables', 'file_pattern']:
                    # Try to parse value
                    if value.startswith('[') and value.endswith(']'):
                        # List
                        try:
                            current_check[key] = json.loads(value.replace("null", "null"))
                        except:
                            current_check[key] = value
                    else:
                        try:
                            current_check[key] = float(value) if '.' in value else int(value)
                        except:
                            current_check[key] = value
            else:
                # Simple list item
                pass
        elif ':' in stripped:
            key, value = stripped.split(':', 1)
            key = key.strip()
            value = value.strip()
            
            if value and current_contract:
                if key == 'file_pattern':
                    current_contract['file_pattern'] = value
    
    return result


def check_file_exists(filepath: str) -> Dict:
    """Check if file exists.
    
    Returns:
        Check result dictionary
    """
    exists = os.path.exists(filepath)
    return {
        "check_type": "exists",
        "target": filepath,
        "status": STATUS_PASS if exists else STATUS_FAIL,
        "message": f"File {'exists' if exists else 'not found'}: {Path(filepath).name}",
    }


def check_file_pattern(directory: str, pattern: str) -> Dict:
    """Check if files matching pattern exist.
    
    Returns:
        Check result dictionary
    """
    dir_path = Path(directory)
    if not dir_path.exists():
        return {
            "check_type": "pattern",
            "target": f"{directory}/{pattern}",
            "status": STATUS_FAIL,
            "message": f"Directory not found: {directory}",
        }
    
    matches = list(dir_path.glob(pattern))
    
    return {
        "check_type": "pattern",
        "target": f"{directory}/{pattern}",
        "status": STATUS_PASS if matches else STATUS_FAIL,
        "message": f"Found {len(matches)} file(s) matching {pattern}",
        "matches": [str(m.name) for m in matches[:10]],  # Limit to 10
    }


def check_mat_file(filepath: str, checks: List[Dict]) -> List[Dict]:
    """Check MATLAB .mat file contents.
    
    Note: Requires scipy for .mat file reading.
    
    Args:
        filepath: Path to .mat file
        checks: List of check configurations
        
    Returns:
        List of check results
    """
    results = []
    
    # Try to import scipy
    try:
        from scipy.io import loadmat
    except ImportError:
        return [{
            "check_type": "mat_file",
            "target": filepath,
            "status": STATUS_SKIP,
            "message": "scipy not installed - cannot check .mat files",
        }]
    
    # Load mat file
    try:
        data = loadmat(filepath, squeeze_me=True, struct_as_record=False)
    except Exception as e:
        return [{
            "check_type": "mat_file",
            "target": filepath,
            "status": STATUS_FAIL,
            "message": f"Failed to load .mat file: {str(e)[:50]}",
        }]
    
    # Run checks
    for check in checks:
        check_type = check.get("type")
        variable = check.get("variable")
        
        if check_type == "exists":
            variables = check.get("variables", [variable] if variable else [])
            for var in variables:
                exists = var in data
                results.append({
                    "check_type": "exists",
                    "target": f"{Path(filepath).name}:{var}",
                    "status": STATUS_PASS if exists else STATUS_FAIL,
                    "message": f"Variable '{var}' {'found' if exists else 'not found'}",
                })
        
        elif check_type == "shape" and variable:
            if variable not in data:
                results.append({
                    "check_type": "shape",
                    "target": f"{Path(filepath).name}:{variable}",
                    "status": STATUS_FAIL,
                    "message": f"Variable '{variable}' not found for shape check",
                })
                continue
            
            import numpy as np
            arr = data[variable]
            actual_shape = arr.shape if hasattr(arr, 'shape') else (len(arr),) if hasattr(arr, '__len__') else ()
            expected = check.get("expected", [])
            
            # Check shape (None means any)
            shape_ok = True
            if expected:
                for i, (exp, act) in enumerate(zip(expected, actual_shape)):
                    if exp is not None and exp != act:
                        shape_ok = False
                        break
            
            results.append({
                "check_type": "shape",
                "target": f"{Path(filepath).name}:{variable}",
                "status": STATUS_PASS if shape_ok else STATUS_FAIL,
                "message": f"Shape {list(actual_shape)} {'matches' if shape_ok else 'does not match'} expected {expected}",
                "actual": list(actual_shape),
                "expected": expected,
            })
        
        elif check_type == "range" and variable:
            if variable not in data:
                results.append({
                    "check_type": "range",
                    "target": f"{Path(filepath).name}:{variable}",
                    "status": STATUS_FAIL,
                    "message": f"Variable '{variable}' not found for range check",
                })
                continue
            
            import numpy as np
            arr = data[variable]
            if not hasattr(arr, '__iter__'):
                arr = [arr]
            arr = np.array(arr).flatten()
            
            min_val = check.get("min")
            max_val = check.get("max")
            
            actual_min = float(np.nanmin(arr)) if len(arr) > 0 else None
            actual_max = float(np.nanmax(arr)) if len(arr) > 0 else None
            
            range_ok = True
            if min_val is not None and actual_min is not None and actual_min < min_val:
                range_ok = False
            if max_val is not None and actual_max is not None and actual_max > max_val:
                range_ok = False
            
            results.append({
                "check_type": "range",
                "target": f"{Path(filepath).name}:{variable}",
                "status": STATUS_PASS if range_ok else STATUS_FAIL,
                "message": f"Range [{actual_min:.2f}, {actual_max:.2f}] {'within' if range_ok else 'outside'} [{min_val}, {max_val}]",
                "actual_range": [actual_min, actual_max],
                "expected_range": [min_val, max_val],
            })
        
        elif check_type == "nan_ratio" and variable:
            if variable not in data:
                results.append({
                    "check_type": "nan_ratio",
                    "target": f"{Path(filepath).name}:{variable}",
                    "status": STATUS_FAIL,
                    "message": f"Variable '{variable}' not found for NaN check",
                })
                continue
            
            import numpy as np
            arr = data[variable]
            if not hasattr(arr, '__iter__'):
                arr = [arr]
            arr = np.array(arr).flatten()
            
            max_ratio = check.get("nan_ratio_max", 0.01)
            nan_count = np.sum(np.isnan(arr)) + np.sum(np.isinf(arr))
            total = len(arr)
            actual_ratio = nan_count / total if total > 0 else 0
            
            ratio_ok = actual_ratio <= max_ratio
            
            results.append({
                "check_type": "nan_ratio",
                "target": f"{Path(filepath).name}:{variable}",
                "status": STATUS_PASS if ratio_ok else STATUS_WARN,
                "message": f"NaN ratio {actual_ratio*100:.2f}% {'<=' if ratio_ok else '>'} threshold {max_ratio*100:.1f}%",
                "actual_ratio": actual_ratio,
                "threshold": max_ratio,
            })
    
    return results


def run_preflight(workspace: str, task_id: str, config: Dict = None) -> Dict:
    """Run all preflight checks for a task.
    
    Args:
        workspace: Workspace root path
        task_id: Task ID
        config: Optional config (if not provided, loads from task dir)
        
    Returns:
        Preflight result dictionary
    """
    if config is None:
        config = load_preflight_config(workspace, task_id)
    
    if not config:
        return {
            "task_id": task_id,
            "status": STATUS_SKIP,
            "message": "No preflight configuration found",
            "checks": [],
        }
    
    results = []
    overall_status = STATUS_PASS
    
    for contract in config.get("contracts", []):
        contract_name = contract.get("name", "Unnamed")
        file_pattern = contract.get("file_pattern")
        checks = contract.get("checks", [])
        
        # If file_pattern specified, find matching files
        if file_pattern:
            workspace_dir = Path(workspace) / "workspace"
            
            # Find task workspace
            task_workspace = None
            for item in workspace_dir.glob(f"*{task_id}*"):
                if item.is_dir():
                    task_workspace = item
                    break
            
            if task_workspace:
                # Find files matching pattern
                matching_files = list(task_workspace.rglob(file_pattern.replace("**", "*")))
                
                for filepath in matching_files[:5]:  # Limit to 5 files
                    if filepath.suffix == '.mat':
                        mat_results = check_mat_file(str(filepath), checks)
                        results.extend(mat_results)
                    else:
                        # Basic file existence check
                        results.append(check_file_exists(str(filepath)))
        
        # Check individual checks without file pattern
        for check in checks:
            if check.get("type") == "exists" and check.get("variables"):
                # This needs a file context - skip if no file_pattern
                pass
    
    # Determine overall status
    for result in results:
        if result["status"] == STATUS_FAIL:
            overall_status = STATUS_FAIL
            break
        elif result["status"] == STATUS_WARN and overall_status == STATUS_PASS:
            overall_status = STATUS_WARN
    
    return {
        "task_id": task_id,
        "checked_at": datetime.now().isoformat(),
        "status": overall_status,
        "total_checks": len(results),
        "passed": sum(1 for r in results if r["status"] == STATUS_PASS),
        "warnings": sum(1 for r in results if r["status"] == STATUS_WARN),
        "failed": sum(1 for r in results if r["status"] == STATUS_FAIL),
        "checks": results,
    }


def format_preflight_result(result: Dict) -> str:
    """Format preflight result for display.
    
    Args:
        result: Preflight result dictionary
        
    Returns:
        Formatted string
    """
    lines = []
    lines.append("┌─────────────────────────────────────────────────────────────────────┐")
    
    status_icon = {
        STATUS_PASS: "✅",
        STATUS_WARN: "⚠️",
        STATUS_FAIL: "❌",
        STATUS_SKIP: "⏭️",
    }.get(result["status"], "❓")
    
    lines.append(f"│  {status_icon} PREFLIGHT CHECK: {result['status']}")
    lines.append("├─────────────────────────────────────────────────────────────────────┤")
    lines.append(f"│  Task: {result.get('task_id')}")
    lines.append(f"│  Checks: {result.get('total_checks', 0)} total")
    lines.append(f"│    ✅ Passed: {result.get('passed', 0)}")
    lines.append(f"│    ⚠️ Warnings: {result.get('warnings', 0)}")
    lines.append(f"│    ❌ Failed: {result.get('failed', 0)}")
    
    # Show individual check results
    if result.get("checks"):
        lines.append("├─────────────────────────────────────────────────────────────────────┤")
        for check in result["checks"][:10]:  # Limit display
            status_sym = {
                STATUS_PASS: "✅",
                STATUS_WARN: "⚠️",
                STATUS_FAIL: "❌",
                STATUS_SKIP: "⏭️",
            }.get(check["status"], "•")
            
            lines.append(f"│  {status_sym} {check['check_type']}: {check['target']}")
            lines.append(f"│     {check['message']}")
    
    lines.append("└─────────────────────────────────────────────────────────────────────┘")
    
    return "\n".join(lines)


def create_preflight_template(workspace: str, task_id: str) -> Path:
    """Create a preflight configuration template for a task.
    
    Returns:
        Path to created template
    """
    template = {
        "contracts": [
            {
                "name": "Input Data Validation",
                "file_pattern": "data/*.mat",
                "checks": [
                    {
                        "type": "exists",
                        "variables": ["signal", "time_axis"]
                    },
                    {
                        "type": "shape",
                        "variable": "signal",
                        "expected": [None, 1024]
                    },
                    {
                        "type": "range",
                        "variable": "time_axis",
                        "min": 0,
                        "max": 10
                    },
                    {
                        "type": "nan_ratio",
                        "variable": "signal",
                        "nan_ratio_max": 0.01
                    }
                ]
            }
        ]
    }
    
    notes_dir = Path(workspace) / ".notes"
    
    # Find task directory
    for status_dir in ["ACTIVE", "INBOX"]:
        for item in (notes_dir / status_dir).glob(f"*{task_id}*"):
            if item.is_dir():
                config_file = item / "preflight.json"
                config_file.write_text(
                    json.dumps(template, indent=2, ensure_ascii=False),
                    encoding='utf-8'
                )
                return config_file
    
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# POLICY ENFORCEMENT (v3.9)
# ═══════════════════════════════════════════════════════════════════════════════

def log_preflight_warning(workspace: str, task_id: str, warnings: List[Dict]) -> None:
    """Log preflight warnings to .notes/ERRORS/_preflight_warnings.json.
    
    Accumulates warnings for tracking escalation threshold.
    """
    if not POLICY_WARN_LOGS or not warnings:
        return
    
    errors_dir = Path(workspace) / ".notes" / "ERRORS"
    errors_dir.mkdir(parents=True, exist_ok=True)
    
    warn_file = errors_dir / "_preflight_warnings.json"
    
    # Load existing warnings
    existing = {}
    if warn_file.exists():
        try:
            existing = json.loads(warn_file.read_text(encoding='utf-8'))
        except:
            existing = {}
    
    # Add new warnings
    task_key = task_id or "unknown"
    if task_key not in existing:
        existing[task_key] = {"count": 0, "history": []}
    
    existing[task_key]["count"] += len(warnings)
    existing[task_key]["history"].append({
        "timestamp": datetime.now().isoformat(),
        "warnings": [w.get("message", str(w)) for w in warnings]
    })
    
    # Keep only last 10 history entries
    existing[task_key]["history"] = existing[task_key]["history"][-10:]
    
    # Save
    warn_file.write_text(
        json.dumps(existing, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )


def should_block_execution(result: Dict) -> Tuple[bool, int]:
    """Determine if execution should be blocked based on preflight result.
    
    Returns:
        (should_block, exit_code)
        - (True, 1) if FAIL and policy says block
        - (False, 0) otherwise
    """
    if not POLICY_FAIL_BLOCKS:
        return False, 0
    
    if result.get("status") == STATUS_FAIL:
        return True, 1
    
    return False, 0


def enforce_preflight_policy(workspace: str, result: Dict) -> int:
    """Enforce preflight policy based on result.
    
    - FAIL → return exit code 1 (block)
    - WARN → log warnings, return 0 (allow)
    - PASS/SKIP → return 0 (allow)
    
    Returns:
        Exit code (0 = allow, 1 = block)
    """
    task_id = result.get("task_id", "unknown")
    
    # Log warnings if any
    warnings = [c for c in result.get("checks", []) if c.get("status") == STATUS_WARN]
    if warnings:
        log_preflight_warning(workspace, task_id, warnings)
        print(f"⚠️  {len(warnings)} preflight warning(s) logged to .notes/ERRORS/")
    
    # Check if should block
    should_block, exit_code = should_block_execution(result)
    
    if should_block:
        print(f"❌ PREFLIGHT FAILED: Execution blocked (policy: FAIL→block)")
        print(f"   Fix the failing checks before proceeding.")
    
    return exit_code


# Export for CLI integration
__all__ = [
    "CHECK_TYPES",
    "STATUS_PASS",
    "STATUS_WARN",
    "STATUS_FAIL",
    "STATUS_SKIP",
    "POLICY_FAIL_BLOCKS",
    "POLICY_WARN_LOGS",
    "load_preflight_config",
    "run_preflight",
    "format_preflight_result",
    "create_preflight_template",
    "should_block_execution",
    "enforce_preflight_policy",
]
