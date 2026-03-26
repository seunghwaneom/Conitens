#!/usr/bin/env python3
"""
Ensemble v3.9 Triage Module
============================
Automatic failure analysis and categorization.

Detects 10 common failure patterns and provides actionable recommendations.
"""

import re
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Tuple

# ═══════════════════════════════════════════════════════════════════════════════
# TRIAGE PATTERNS (10 Types)
# ═══════════════════════════════════════════════════════════════════════════════

TRIAGE_PATTERNS = {
    "T001": {
        "name": "Out of Memory",
        "patterns": [
            r"out of memory",
            r"OOM",
            r"java\.lang\.OutOfMemoryError",
            r"MemoryError",
            r"insufficient memory",
            r"memory allocation failed",
            r"Cannot allocate memory",
        ],
        "cause": "메모리 부족",
        "actions": [
            "데이터를 청킹하여 처리",
            "불필요한 변수 clear",
            "더 큰 메모리 노드 사용",
            "parpool 워커 수 줄이기",
        ],
        "severity": "high",
    },
    "T002": {
        "name": "Undefined Function",
        "patterns": [
            r"Undefined function",
            r"Unrecognized function",
            r"not found",
            r"undefined.*function",
            r"ModuleNotFoundError",
            r"ImportError",
            r"No module named",
        ],
        "cause": "함수 또는 모듈 없음",
        "actions": [
            "addpath() 확인",
            "which <function> 실행",
            "파일 존재 여부 확인",
            "의존성 설치 확인",
        ],
        "severity": "medium",
    },
    "T003": {
        "name": "File Not Found",
        "patterns": [
            r"File not found",
            r"No such file or directory",
            r"FileNotFoundError",
            r"Unable to open file",
            r"Cannot find",
            r"does not exist",
        ],
        "cause": "파일 경로 오류",
        "actions": [
            "경로 철자 확인",
            "절대경로 vs 상대경로 확인",
            "파일 권한 확인",
            "pwd 확인",
        ],
        "severity": "medium",
    },
    "T004": {
        "name": "Permission Denied",
        "patterns": [
            r"Permission denied",
            r"Access denied",
            r"PermissionError",
            r"Operation not permitted",
            r"EACCES",
        ],
        "cause": "권한 없음",
        "actions": [
            "chmod/chown 확인",
            "파일 소유자 확인",
            "디렉토리 쓰기 권한 확인",
            "umask 설정 확인",
        ],
        "severity": "medium",
    },
    "T005": {
        "name": "Toolbox Required",
        "patterns": [
            r"requires.*Toolbox",
            r"Toolbox.*not found",
            r"license.*not available",
            r"License checkout failed",
            r"Unable to check out license",
        ],
        "cause": "MATLAB 툴박스 미설치 또는 라이선스 없음",
        "actions": [
            "ver 명령으로 설치된 툴박스 확인",
            "라이선스 서버 상태 확인",
            "대체 함수 사용 검토",
            "IT팀에 라이선스 요청",
        ],
        "severity": "high",
    },
    "T006": {
        "name": "Parallel Pool Error",
        "patterns": [
            r"parpool",
            r"parallel.*pool",
            r"spmd.*error",
            r"parfor.*error",
            r"Parallel Computing Toolbox",
            r"Failed to start pool",
        ],
        "cause": "병렬 처리 설정 오류",
        "actions": [
            "delete(gcp('nocreate')) 후 재시도",
            "parallel profile 확인",
            "워커 수 줄이기",
            "단일 스레드로 테스트",
        ],
        "severity": "medium",
    },
    "T007": {
        "name": "Index Exceeds",
        "patterns": [
            r"Index exceeds",
            r"index out of bounds",
            r"IndexError",
            r"array index.*out of range",
            r"dimension mismatch",
            r"Matrix dimensions must agree",
        ],
        "cause": "배열 범위 초과",
        "actions": [
            "데이터 shape 확인: size(data)",
            "인덱싱 로직 검토",
            "빈 배열 처리 확인",
            "루프 경계 조건 확인",
        ],
        "severity": "medium",
    },
    "T008": {
        "name": "NaN Detected",
        "patterns": [
            r"NaN",
            r"nan",
            r"not a number",
            r"Inf",
            r"inf",
            r"divide by zero",
            r"division by zero",
        ],
        "cause": "수치 오류 (NaN/Inf)",
        "actions": [
            "입력 데이터 NaN 확인: sum(isnan(data))",
            "0으로 나누기 방지",
            "log(0) 등 특이점 처리",
            "데이터 전처리 추가",
        ],
        "severity": "low",
    },
    "T009": {
        "name": "Time Limit Exceeded",
        "patterns": [
            r"time limit",
            r"timeout",
            r"walltime",
            r"exceeded.*time",
            r"SIGXCPU",
            r"TimeoutError",
            r"Job.*killed",
        ],
        "cause": "실행 시간 초과",
        "actions": [
            "알고리즘 복잡도 검토",
            "데이터 샘플링으로 테스트",
            "벡터화 적용",
            "walltime 증가 요청",
        ],
        "severity": "high",
    },
    "T010": {
        "name": "Module Load Failed",
        "patterns": [
            r"module.*load",
            r"module.*not found",
            r"ModuleCmd",
            r"Unable to locate.*module",
            r"Lmod",
            r"environment module",
        ],
        "cause": "HPC 모듈 로딩 실패",
        "actions": [
            "module avail 확인",
            "module load <module> 추가",
            "~/.bashrc 확인",
            "submit 스크립트에 module 추가",
        ],
        "severity": "medium",
    },
}

# Severity weights for scoring
SEVERITY_WEIGHTS = {
    "high": 3,
    "medium": 2,
    "low": 1,
}


def analyze_log(log_content: str) -> List[Dict]:
    """Analyze log content and identify failure patterns.
    
    Args:
        log_content: Raw log text to analyze
        
    Returns:
        List of matched triage results, sorted by severity
    """
    results = []
    log_lower = log_content.lower()
    
    for triage_id, pattern_info in TRIAGE_PATTERNS.items():
        for pattern in pattern_info["patterns"]:
            match = re.search(pattern, log_content, re.IGNORECASE)
            if match:
                # Find the line containing the match
                lines = log_content.split('\n')
                matched_line = ""
                line_num = 0
                
                for i, line in enumerate(lines, 1):
                    if re.search(pattern, line, re.IGNORECASE):
                        matched_line = line.strip()[:200]  # Truncate
                        line_num = i
                        break
                
                results.append({
                    "triage_id": triage_id,
                    "name": pattern_info["name"],
                    "cause": pattern_info["cause"],
                    "actions": pattern_info["actions"],
                    "severity": pattern_info["severity"],
                    "matched_pattern": pattern,
                    "matched_line": matched_line,
                    "line_number": line_num,
                    "score": SEVERITY_WEIGHTS.get(pattern_info["severity"], 1),
                })
                break  # Only one match per pattern type
    
    # Sort by severity score (descending)
    results.sort(key=lambda x: -x["score"])
    return results


def analyze_run(workspace: str, task_id: str, run_id: str) -> Dict:
    """Analyze a specific run's logs.
    
    Args:
        workspace: Workspace root path
        task_id: Task ID (e.g., TASK-20260201-001)
        run_id: Run ID (e.g., run-001)
        
    Returns:
        Triage result dictionary
    """
    notes_dir = Path(workspace) / ".notes"
    
    # Find task in ACTIVE or ERRORS
    task_dir = None
    for status_dir in ["ACTIVE", "ERRORS", "COMPLETED", "HALTED"]:
        for item in (notes_dir / status_dir).glob(f"*{task_id}*"):
            if item.is_dir():
                task_dir = item
                break
        if task_dir:
            break
    
    if not task_dir:
        return {"error": f"Task {task_id} not found"}
    
    run_dir = task_dir / "runs" / run_id
    if not run_dir.exists():
        return {"error": f"Run {run_id} not found in {task_id}"}
    
    # Collect all log content
    log_content = ""
    log_files = []
    
    for log_file in run_dir.glob("*.log"):
        try:
            content = log_file.read_text(encoding='utf-8', errors='replace')
            log_content += f"\n=== {log_file.name} ===\n{content}\n"
            log_files.append(log_file.name)
        except:
            pass
    
    # Also check stderr in meta
    meta_file = run_dir / "run.meta.json"
    if meta_file.exists():
        try:
            meta = json.loads(meta_file.read_text(encoding='utf-8'))
            if meta.get("error_summary"):
                log_content += f"\n=== error_summary ===\n{meta['error_summary']}\n"
        except:
            pass
    
    if not log_content.strip():
        return {
            "task_id": task_id,
            "run_id": run_id,
            "status": "no_logs",
            "message": "No log files found for analysis",
        }
    
    # Analyze
    triage_results = analyze_log(log_content)
    
    return {
        "task_id": task_id,
        "run_id": run_id,
        "analyzed_at": datetime.now().isoformat(),
        "log_files": log_files,
        "total_log_bytes": len(log_content),
        "findings": triage_results,
        "primary_issue": triage_results[0] if triage_results else None,
        "issue_count": len(triage_results),
    }


def format_triage_result(result: Dict, verbose: bool = False) -> str:
    """Format triage result for display.
    
    Args:
        result: Triage result dictionary
        verbose: Include full details
        
    Returns:
        Formatted string
    """
    if "error" in result:
        return f"❌ Error: {result['error']}"
    
    if result.get("status") == "no_logs":
        return f"ℹ️ {result['message']}"
    
    lines = []
    lines.append("┌─────────────────────────────────────────────────────────────────────┐")
    
    if result.get("primary_issue"):
        issue = result["primary_issue"]
        severity_icon = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(issue["severity"], "⚪")
        
        lines.append(f"│  {severity_icon} TRIAGE RESULT: {issue['triage_id']} - {issue['name']}")
        lines.append("├─────────────────────────────────────────────────────────────────────┤")
        lines.append(f"│  Task: {result['task_id']}")
        lines.append(f"│  Run: {result['run_id']}")
        lines.append(f"│  Cause: {issue['cause']}")
        
        if issue.get("matched_line"):
            lines.append("│")
            lines.append(f"│  Matched: {issue['matched_line'][:60]}...")
        
        lines.append("│")
        lines.append("│  RECOMMENDED ACTIONS:")
        for i, action in enumerate(issue["actions"], 1):
            lines.append(f"│    {i}. {action}")
    else:
        lines.append(f"│  ✅ NO KNOWN ISSUES DETECTED")
        lines.append("├─────────────────────────────────────────────────────────────────────┤")
        lines.append(f"│  Task: {result['task_id']}")
        lines.append(f"│  Run: {result['run_id']}")
        lines.append(f"│  Analyzed: {len(result.get('log_files', []))} log file(s)")
    
    if verbose and result.get("issue_count", 0) > 1:
        lines.append("│")
        lines.append(f"│  Additional Issues: {result['issue_count'] - 1}")
        for finding in result.get("findings", [])[1:4]:  # Show up to 3 more
            lines.append(f"│    • {finding['triage_id']}: {finding['name']}")
    
    lines.append("└─────────────────────────────────────────────────────────────────────┘")
    
    return "\n".join(lines)


def save_triage_result(workspace: str, result: Dict) -> Path:
    """Save triage result to run directory.
    
    Returns:
        Path to saved file
    """
    if "error" in result or not result.get("task_id"):
        return None
    
    notes_dir = Path(workspace) / ".notes"
    
    # Find task directory
    for status_dir in ["ACTIVE", "ERRORS", "COMPLETED", "HALTED"]:
        for item in (notes_dir / status_dir).glob(f"*{result['task_id']}*"):
            if item.is_dir():
                run_dir = item / "runs" / result["run_id"]
                if run_dir.exists():
                    triage_file = run_dir / "triage.json"
                    triage_file.write_text(
                        json.dumps(result, indent=2, ensure_ascii=False),
                        encoding='utf-8'
                    )
                    return triage_file
    
    return None


# Export for CLI integration
__all__ = [
    "TRIAGE_PATTERNS",
    "analyze_log",
    "analyze_run",
    "format_triage_result",
    "save_triage_result",
]
