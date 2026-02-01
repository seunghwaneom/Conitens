#!/usr/bin/env python3
"""
Ensemble v3.9 Impact Analysis Module
=====================================
Analyze change impact and dependencies for MATLAB/Python files.

Provides: dependency graph, impact score, modification recommendations.
"""

import os
import re
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Set, Tuple
from collections import defaultdict

# ═══════════════════════════════════════════════════════════════════════════════
# IMPACT SCORING
# ═══════════════════════════════════════════════════════════════════════════════

# Base points per dependent file
DEPENDENT_POINTS = 10

# Multipliers
CRITICAL_FILE_MULTIPLIER = 2.0
TEST_FILE_MULTIPLIER = 0.5
RECENT_CHANGE_BONUS = 5  # If changed in last 7 days

# Risk thresholds
RISK_LOW = 20
RISK_MEDIUM = 50
RISK_HIGH = 100


def extract_matlab_dependencies(filepath: str) -> List[str]:
    """Extract function calls and file references from MATLAB file.
    
    Args:
        filepath: Path to .m file
        
    Returns:
        List of referenced function/file names
    """
    dependencies = set()
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except:
        return []
    
    # Remove comments
    content = re.sub(r'%.*$', '', content, flags=re.MULTILINE)
    
    # Pattern for function calls: functionName(...)
    func_calls = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', content)
    
    # Filter out MATLAB built-ins (common ones)
    builtins = {
        'if', 'for', 'while', 'switch', 'function', 'end', 'return',
        'size', 'length', 'zeros', 'ones', 'eye', 'rand', 'randn',
        'disp', 'fprintf', 'sprintf', 'error', 'warning',
        'plot', 'figure', 'subplot', 'title', 'xlabel', 'ylabel',
        'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs',
        'max', 'min', 'sum', 'mean', 'std', 'var',
        'struct', 'cell', 'class', 'isa', 'isempty', 'isnan', 'isinf',
        'load', 'save', 'exist', 'cd', 'pwd', 'addpath',
    }
    
    for func in func_calls:
        if func.lower() not in builtins and len(func) > 1:
            dependencies.add(func)
    
    # Pattern for explicit file references: 'filename.m' or "filename.m"
    file_refs = re.findall(r'[\'"]([a-zA-Z0-9_]+\.m)[\'"]', content)
    dependencies.update(f.replace('.m', '') for f in file_refs)
    
    return list(dependencies)


def extract_python_dependencies(filepath: str) -> List[str]:
    """Extract imports and function calls from Python file.
    
    Args:
        filepath: Path to .py file
        
    Returns:
        List of imported modules/files
    """
    dependencies = set()
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except:
        return []
    
    # Import statements
    # import x, import x as y
    imports = re.findall(r'^import\s+([a-zA-Z_][a-zA-Z0-9_]*)', content, re.MULTILINE)
    dependencies.update(imports)
    
    # from x import y
    from_imports = re.findall(r'^from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import', content, re.MULTILINE)
    dependencies.update(i.split('.')[0] for i in from_imports)
    
    # Filter out standard library
    stdlib = {
        'os', 'sys', 're', 'json', 'datetime', 'pathlib', 'collections',
        'typing', 'functools', 'itertools', 'math', 'random', 'time',
        'subprocess', 'shutil', 'tempfile', 'glob', 'hashlib', 'argparse',
    }
    
    return [d for d in dependencies if d not in stdlib]


def build_dependency_graph(directory: str, file_type: str = "matlab") -> Dict[str, List[str]]:
    """Build dependency graph for all files in directory.
    
    Args:
        directory: Root directory to scan
        file_type: "matlab" or "python"
        
    Returns:
        Dictionary mapping file -> list of dependencies
    """
    graph = {}
    dir_path = Path(directory)
    
    if file_type == "matlab":
        pattern = "**/*.m"
        extractor = extract_matlab_dependencies
    else:
        pattern = "**/*.py"
        extractor = extract_python_dependencies
    
    for filepath in dir_path.glob(pattern):
        rel_path = str(filepath.relative_to(dir_path))
        deps = extractor(str(filepath))
        graph[rel_path] = deps
    
    return graph


def find_dependents(
    target_file: str,
    dependency_graph: Dict[str, List[str]],
    file_map: Dict[str, str] = None
) -> List[Tuple[str, List[int]]]:
    """Find all files that depend on target file.
    
    Args:
        target_file: File to analyze (name without extension)
        dependency_graph: Pre-built dependency graph
        file_map: Optional mapping of function names to files
        
    Returns:
        List of (dependent_file, [line_numbers]) tuples
    """
    dependents = []
    target_name = Path(target_file).stem
    
    for filepath, deps in dependency_graph.items():
        if target_name in deps:
            dependents.append((filepath, []))  # Line numbers would require deeper parsing
    
    return dependents


def calculate_impact_score(
    target_file: str,
    workspace: str,
    dependency_graph: Dict[str, List[str]] = None,
) -> Dict:
    """Calculate impact score for modifying a file.
    
    Args:
        target_file: File path to analyze
        workspace: Workspace root
        dependency_graph: Optional pre-built graph
        
    Returns:
        Impact analysis result
    """
    target_path = Path(target_file)
    target_name = target_path.stem
    
    # Determine file type
    if target_path.suffix == '.m':
        file_type = "matlab"
    elif target_path.suffix == '.py':
        file_type = "python"
    else:
        file_type = "unknown"
    
    # Build dependency graph if not provided
    if dependency_graph is None:
        dependency_graph = build_dependency_graph(workspace, file_type)
    
    # Find dependents
    dependents = find_dependents(target_name, dependency_graph)
    
    # Calculate base score
    score = len(dependents) * DEPENDENT_POINTS
    
    # Check for critical files
    critical_count = 0
    test_count = 0
    
    for dep_file, _ in dependents:
        dep_lower = dep_file.lower()
        if 'test' in dep_lower or 'spec' in dep_lower:
            test_count += 1
            score += DEPENDENT_POINTS * (TEST_FILE_MULTIPLIER - 1)  # Reduce score for tests
        elif 'main' in dep_lower or 'run' in dep_lower or 'batch' in dep_lower:
            critical_count += 1
            score += DEPENDENT_POINTS * (CRITICAL_FILE_MULTIPLIER - 1)
    
    # Determine risk level
    if score < RISK_LOW:
        risk_level = "low"
    elif score < RISK_MEDIUM:
        risk_level = "medium"
    elif score < RISK_HIGH:
        risk_level = "high"
    else:
        risk_level = "critical"
    
    # Generate recommendations
    recommendations = []
    if risk_level in ["high", "critical"]:
        recommendations.append("workspace에서 작업 권장")
        recommendations.append("변경 전 테스트 실행")
    if critical_count > 0:
        recommendations.append(f"{critical_count}개의 중요 파일이 영향받음 - 신중히 검토")
    if test_count > 0:
        recommendations.append(f"{test_count}개의 테스트 파일 확인 필요")
    if len(dependents) == 0:
        recommendations.append("영향받는 파일 없음 - 안전하게 수정 가능")
    
    return {
        "target_file": str(target_file),
        "analyzed_at": datetime.now().isoformat(),
        "file_type": file_type,
        "dependents": [
            {"file": f, "lines": lines}
            for f, lines in dependents
        ],
        "dependent_count": len(dependents),
        "critical_files": critical_count,
        "test_files": test_count,
        "score": int(score),
        "risk_level": risk_level,
        "recommendations": recommendations,
    }


def format_impact_result(result: Dict) -> str:
    """Format impact analysis result for display.
    
    Args:
        result: Impact analysis result dictionary
        
    Returns:
        Formatted string
    """
    lines = []
    
    risk_icon = {
        "low": "🟢",
        "medium": "🟡",
        "high": "🟠",
        "critical": "🔴",
    }.get(result["risk_level"], "⚪")
    
    lines.append("┌─────────────────────────────────────────────────────────────────────┐")
    lines.append(f"│  {risk_icon} IMPACT ANALYSIS: {result['risk_level'].upper()} RISK")
    lines.append("├─────────────────────────────────────────────────────────────────────┤")
    lines.append(f"│  File: {Path(result['target_file']).name}")
    lines.append(f"│  Type: {result['file_type']}")
    lines.append(f"│  Score: {result['score']}")
    
    # Dependents
    lines.append("├─────────────────────────────────────────────────────────────────────┤")
    lines.append(f"│  DEPENDENTS ({result['dependent_count']} files):")
    
    if result['dependents']:
        for dep in result['dependents'][:10]:  # Limit display
            prefix = "  "
            if 'test' in dep['file'].lower():
                prefix = "🧪"
            elif 'main' in dep['file'].lower() or 'run' in dep['file'].lower():
                prefix = "⚠️"
            lines.append(f"│    {prefix} {dep['file']}")
        
        if len(result['dependents']) > 10:
            lines.append(f"│    ... and {len(result['dependents']) - 10} more")
    else:
        lines.append("│    (none)")
    
    # Recommendations
    lines.append("├─────────────────────────────────────────────────────────────────────┤")
    lines.append("│  RECOMMENDATIONS:")
    for rec in result['recommendations']:
        lines.append(f"│    → {rec}")
    
    lines.append("└─────────────────────────────────────────────────────────────────────┘")
    
    return "\n".join(lines)


def get_file_hotspots(workspace: str, days: int = 7) -> List[Dict]:
    """Get frequently modified files (hotspots).
    
    Uses git log to identify files with high change frequency.
    
    Args:
        workspace: Workspace root
        days: Number of days to look back
        
    Returns:
        List of hotspot files with change counts
    """
    import subprocess
    
    try:
        result = subprocess.run(
            ["git", "log", "--name-only", "--pretty=format:", f"--since={days} days ago"],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return []
        
        # Count file occurrences
        file_counts = defaultdict(int)
        for line in result.stdout.split('\n'):
            line = line.strip()
            if line and (line.endswith('.m') or line.endswith('.py')):
                file_counts[line] += 1
        
        # Sort by count
        hotspots = [
            {"file": f, "changes": c}
            for f, c in sorted(file_counts.items(), key=lambda x: -x[1])
        ]
        
        return hotspots[:20]  # Top 20
        
    except:
        return []


# Export for CLI integration
__all__ = [
    "extract_matlab_dependencies",
    "extract_python_dependencies",
    "build_dependency_graph",
    "find_dependents",
    "calculate_impact_score",
    "format_impact_result",
    "get_file_hotspots",
    "RISK_LOW",
    "RISK_MEDIUM",
    "RISK_HIGH",
]
