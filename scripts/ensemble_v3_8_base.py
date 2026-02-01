#!/usr/bin/env python3
"""
Ensemble CLI Tool v3.8.0
========================
Research Lab + General Purpose Edition

Conditional Auto-Approval System (v3.8.0):
- 3-tier approval: AUTO-APPROVE / AUTO-APPROVE with GUARD / ASK
- AUTO-APPROVE: .notes/** writes, git status/diff/log, python -c
- GUARD: workspace/TASK-*/** new files (size/extension limits)
- ASK: existing file modifications, repo outside, dangerous commands

Question Queue Management (v3.8.0):
- TTL: 24h default, auto-stale processing
- Snapshot: git_head, policy_hash, target_paths for mismatch detection
- Prune: `ensemble questions prune --stale-hours 24`

Research Lab Features (v3.8.0):
- MATLAB execution: run_modified_file(modified_file) standard entry point
- cd(matlab_folder) fixed before execution
- Path summary logging (top 10)
- PNG save on demand (question gate)
- run.meta.json auto-recording

Metrics Collection (v3.8.0):
- ask_count, auto_count, stale_count, cache_hit_rate
- 1-week/5-TASK data collection for cache decision

Question Gate & Approval System (v3.7.0):
- Question gate: Pending questions with choices (DATA_ROOT_CONFIRM, EXTERNAL_EXEC_CONFIRM, WRITE_DETECTED_CONFIRM)
- Auto-default: ENSEMBLE_AUTO_DEFAULT=1 auto-selects recommended choice (but stops for confirmation)
- Approval system: `ensemble approve --question <id>` or `--latest` for owner-only execution
- Owner management: .notes/OWNER.json for project owner authentication
- Workspace policy: WORKSPACE_POLICY.json for glob limits, write roots, data roots
- Tag schema v1: Fixed tags (domain, task_type, risk, status, component, cause, resolution_type, lesson_type)
- New events: AUTO_SELECTED, EXEC_CONFIRM_REQUIRED, APPROVAL_REQUESTED, APPROVED, APPROVE_DENIED, EXECUTED

Observability improvements (v3.6.4):
- Log schema v1: Added hostname, log_v, timestamp_utc_iso fields
- Stale threshold default: Increased 60s → 120s for better I/O tolerance
- Stale WARN: Prints warning at exit if stale locks were quarantined
- Debug mode: ENSEMBLE_DEBUG=1 shows internal operations on stderr

Operations improvements (v3.6.3):
- Log rolling: 5MB limit, 3 rotations (.1, .2, .3)
- Path masking: Home directory replaced with ~ in logs
- Stale file cleanup: Auto-removes *.lock.stale.* older than 7 days
- Temp file cleanup: Auto-removes ensemble_*.tmp older than 24h
- Environment config: ENSEMBLE_STALE_THRESHOLD, ENSEMBLE_STALE_CLEANUP_DAYS

Stability improvements (v3.6.2):
- [CRITICAL] Stale lock safety: rename to *.lock.stale.* instead of delete
- [CRITICAL] Rich lock metadata: pid, hostname, acquired_at_utc, ttl
- [CRITICAL] Process alive check before stale removal (same host)
- Storage event logging: _storage_events.log, _lock_events.log
- Improved temp file naming: ensemble_*.tmp prefix

Hotfix from v3.6.1:
- [CRITICAL] Fixed timezone bug in lock expiration (UTC-based comparison)
- [CRITICAL] Atomic writes for _registry.json and _locks.json (prevents corruption)
- [CRITICAL] File-based locking for concurrent access protection
- Improved error signature normalization (path normalization, selective number replacement)
- Error md frontmatter sync on resolve (status field now updates)
- findings.md preserves MANUAL NOTES section on regeneration

New features in v3.6 (Phase 2):
- Error Registry System (ERRORS/ + _registry.json)
- Error commands: register, search, resolve, list, findings
- Signature-based duplicate error detection
- Auto-generated findings.md on close
- PAR mode sync point (sync command)
- Conflict detection with resolution guidance

Features from v3.5:
- Word-based Case names (NEW_BUILD, MODIFY, OTHER, DEBUG)
- Multi-focus support for PAR mode (_focus.md parallel_tasks)
- Duplicate task detection with similarity check
- File lock system (_locks.json) for collision prevention
- Partition conflict checking for PAR mode
- Lock management commands (lock list/acquire/release/cleanup)
- Conflicts command for PAR mode conflict detection

Backward compatible with v3.4:
- Legacy case numbers (1, 2, 3) still supported
- Existing task files work without modification

Environment Variables:
    ENSEMBLE_STALE_THRESHOLD     Stale lock threshold in seconds (default: 120)
    ENSEMBLE_STALE_CLEANUP_DAYS  Days to keep stale files (default: 7, 0=disable)
    ENSEMBLE_DEBUG               Debug mode (1=enabled, shows internal ops)
    ENSEMBLE_AUTO_DEFAULT        Auto-select recommended choice (1=enabled, stops for approve)

Usage:
    python ensemble.py new --mode GCC --case NEW_BUILD --title "Task Title"
    python ensemble.py new --mode GCC --case 1 --title "Legacy style"
    python ensemble.py start [--task TASK-ID]
    python ensemble.py log --done "..." --change "..." --next "..."
    python ensemble.py close [--task TASK-ID]
    python ensemble.py halt --reason BLOCKER --desc "..." --resume "..."
    python ensemble.py dump --reason FAILURE --desc "..." --lesson "..."
    python ensemble.py status [--halted] [--dumped] [--locks] [--errors] [--questions]
    python ensemble.py lock list
    python ensemble.py lock acquire --file src/api.py --agent CLAUDE
    python ensemble.py lock release --file src/api.py --agent CLAUDE
    python ensemble.py lock cleanup
    python ensemble.py conflicts
    
    # v3.6 Error Management
    python ensemble.py error register --type IMPORT --file src/api.py --msg "No module"
    python ensemble.py error search --file src/api.py
    python ensemble.py error search --status OPEN
    python ensemble.py error resolve --id ERR-20260201-001 --resolution "Fixed import"
    python ensemble.py error list
    python ensemble.py error findings
    
    # v3.6 PAR Mode Sync
    python ensemble.py sync
    python ensemble.py sync --force
    
    # v3.7 Question Gate & Approval
    python ensemble.py approve --question Q-20260201-001
    python ensemble.py approve --latest
    python ensemble.py approve --latest --dry-run
    python ensemble.py approve --latest --kind MATLAB_RUN
    python ensemble.py init-owner
    
    # v3.8 Question Queue Management
    python ensemble.py questions list
    python ensemble.py questions prune --stale-hours 24
    python ensemble.py questions prune --force
    
    # v3.8 Metrics & Research Lab
    python ensemble.py metrics show
    python ensemble.py metrics reset
"""

import argparse
import hashlib
import os
import sys
import re
from datetime import datetime
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

TIMEZONE = "+09:00"  # KST
WORKSPACE = os.environ.get("ENSEMBLE_WORKSPACE", os.getcwd())

# Valid values
PATTERNS = ["SRL", "PAR", "FRE"]
MODES = ["G", "GCC", "XXX", "PAR", "SOLO"]
STATUSES = ["INBOX", "ACTIVE", "DONE", "DONE-AWAITING-USER", "HALTED", "DUMPED", "COMPLETED"]
HALT_REASONS = ["BLOCKER", "RESOURCE", "PRIORITY"]
DUMP_REASONS = ["PIVOT", "FAILURE", "CANCELLED"]
STATE_GUARDS = ["STRICT", "SOFT", "NONE"]

# Case definitions (v3.5)
CASES = {
    "NEW_BUILD": {
        "legacy_num": "1",
        "description": "새로운 기능/파일 생성",
        "triggers": ["만들어줘", "생성", "새로", "create", "new", "build"],
        "default_mode": "GCC"
    },
    "MODIFY": {
        "legacy_num": "2",
        "description": "기존 코드 수정/개선",
        "triggers": ["수정해줘", "변경", "개선", "fix", "modify", "update", "refactor"],
        "default_mode": "GCC"
    },
    "OTHER": {
        "legacy_num": "3",
        "description": "문서/분석/리뷰 작업",
        "triggers": ["문서", "분석", "리뷰", "document", "analyze", "review"],
        "default_mode": "G"
    },
    "DEBUG": {
        "legacy_num": "4",
        "description": "버그 수정/디버깅",
        "triggers": ["에러", "버그", "디버그", "error", "bug", "debug", "fix error"],
        "default_mode": "SOLO"
    }
}
CASE_NAMES = list(CASES.keys())
LEGACY_CASE_MAP = {v["legacy_num"]: k for k, v in CASES.items()}

# ═══════════════════════════════════════════════════════════════════════════════
# v3.7 QUESTION GATE & APPROVAL SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

# Auto-default: select recommended choice automatically (but stop for approve)
AUTO_DEFAULT = os.environ.get('ENSEMBLE_AUTO_DEFAULT', '').lower() in ('1', 'true', 'yes')

# Question kinds (priority order - higher index = higher priority)
QUESTION_KINDS = [
    "DATA_ROOT_CONFIRM",      # 1: Data root confirmation
    "EXTERNAL_EXEC_CONFIRM",  # 2: External binary execution
    "MATLAB_RUN_CONFIRM",     # 3: MATLAB execution (v3.8)
    "COLAB_MODIFY_CONFIRM",   # 4: Colab notebook modification (v3.8)
    "FIGURE_SAVE_CONFIRM",    # 5: Figure/plot save confirmation (v3.8)
    "WRITE_DETECTED_CONFIRM", # 6: Write outside workspace detected (highest priority)
]

# Question statuses (v3.8 extended)
QUESTION_STATUSES = ["pending", "auto_selected_waiting_confirm", "answered", "executed", "expired", "stale"]

# v3.7 Tag Schema v1 - Fixed Tags
TAG_SCHEMA = {
    "domain": ["research", "code", "ops", "writing"],
    "task_type": ["bug_fix", "new_feature", "refactor", "docs", "infra"],
    "risk": ["low", "medium", "high"],
    "status": ["open", "resolved", "deferred"],
    "component": ["errors", "sync", "workspace", "journaling", "cli"],
    "cause": ["dependency", "path", "concurrency", "parsing", "logic", "env"],
    "resolution_type": ["config", "code_change", "doc", "retry", "workaround"],
    "lesson_type": ["pitfall", "pattern", "heuristic", "checklist"],
}

# Workspace policy defaults (v3.8)
DEFAULT_WORKSPACE_POLICY = {
    "policy_version": 2,
    "max_files": 1000,
    "max_total_bytes": 104857600,  # 100MB
    "allowed_extensions": [".py", ".js", ".ts", ".md", ".toml", ".yaml", ".yml", ".json", ".sh", ".m", ".ipynb", ".mat", ".csv"],
    
    # v3.8 Conditional Auto-Approval
    "auto_approve": {
        "write_roots": [".notes/**"],
        "exec": {
            "allow": ["git status", "git diff", "git log", "python -c"],
            "deny_patterns": ["git reset --hard", "git clean -f", "git push --force", "rm -rf", "pip install"]
        },
        "workspace": {
            "new_files": True,
            "new_files_max_size_kb": 500,
            "new_files_extensions": [".m", ".py", ".ipynb", ".md", ".json", ".csv", ".mat", ".png", ".pdf"]
        }
    },
    "ask": {
        "workspace": {"modify_existing": True},
        "matlab": {"run": True, "save_figures": True},
        "colab": {"modify_notebook": True, "strip_output": True}
    },
    "deny": {
        "repo_outside": True,
        "absolute_paths": ["/", "/home", "/Users", "C:\\", "D:\\"],
        "dangerous_bins": ["rm", "rmdir", "del", "format"]
    },
    
    # v3.8 Question Queue
    "question_queue": {
        "ttl_hours": 24,
        "auto_stale": True,
        "snapshot_fields": ["git_head", "policy_hash", "target_paths"]
    },
    
    # v3.8 Approval Cache (disabled by default, data collection first)
    "approval_cache": {
        "enabled": False,
        "ttl_minutes": 10,
        "scope": ["matlab_run", "modify_existing"],
        "invalidate_on": ["file_change", "git_head_change", "policy_change"]
    },
    
    # v3.8 Metrics
    "metrics": {
        "collect": True,
        "fields": ["ask_count", "auto_count", "stale_count", "cache_hit_rate"]
    },
    
    # v3.8 MATLAB Support
    "matlab": {
        "workspace_pattern": "workspace/TASK-*/matlab/",
        "entry_function": "run_modified_file",
        "log_path_summary_count": 10,
        "artifacts_dir": "artifacts/"
    },
    
    # Legacy compatibility
    "write_roots": [".notes/", "output/"],
    "data_roots_mode": "infer_then_ask",
    "data_roots_max": 10,
    "external_exec_mode": "ask_on_ambiguity",
    "reject_roots": ["/", "/home", "/Users", "C:\\", "D:\\"],
}

# ═══════════════════════════════════════════════════════════════════════════════
# PATH HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def get_notes_dir(): return os.path.join(WORKSPACE, ".notes")
def get_inbox_dir(): return os.path.join(get_notes_dir(), "INBOX")
def get_active_dir(): return os.path.join(get_notes_dir(), "ACTIVE")
def get_completed_dir(): return os.path.join(get_notes_dir(), "COMPLETED")
def get_halted_dir(): return os.path.join(get_notes_dir(), "HALTED")
def get_dumped_dir(): return os.path.join(get_notes_dir(), "DUMPED")
def get_journal_dir(): return os.path.join(get_notes_dir(), "JOURNAL")
def get_focus_file(): return os.path.join(get_active_dir(), "_focus.md")
def get_locks_file(): return os.path.join(get_active_dir(), "_locks.json")
def get_errors_dir(): return os.path.join(get_notes_dir(), "ERRORS")
# v3.7 paths
def get_questions_file(): return os.path.join(get_active_dir(), "_pending_questions.json")
def get_owner_file(): return os.path.join(get_notes_dir(), "OWNER.json")
def get_policy_file(): return os.path.join(get_notes_dir(), "WORKSPACE_POLICY.json")
def get_question_events_log(): return os.path.join(get_active_dir(), "_question_events.log")

# ═══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

import tempfile
import shutil
try:
    import fcntl
    HAS_FCNTL = True
except ImportError:
    HAS_FCNTL = False  # Windows

def get_kst_now() -> str:
    """Get current time in KST (ISO8601 with timezone)."""
    return datetime.now().strftime(f"%Y-%m-%dT%H:%M:%S{TIMEZONE}")

def get_utc_timestamp() -> float:
    """Get current UTC timestamp for reliable time comparisons."""
    return datetime.utcnow().timestamp()

def parse_timestamp_to_utc(ts_str: str) -> float:
    """Parse ISO8601 timestamp string to UTC timestamp.
    
    Handles both KST (+09:00) and other timezones correctly.
    """
    try:
        # Try parsing with timezone
        if '+' in ts_str or ts_str.endswith('Z'):
            # Handle +09:00 format
            if '+09:00' in ts_str:
                dt = datetime.fromisoformat(ts_str.replace('+09:00', ''))
                # Subtract 9 hours to get UTC
                return (dt - timedelta(hours=9)).timestamp()
            elif ts_str.endswith('Z'):
                dt = datetime.fromisoformat(ts_str.replace('Z', ''))
                return dt.timestamp()
            else:
                # Other timezone - try to parse
                dt = datetime.fromisoformat(ts_str)
                return dt.timestamp()
        else:
            # Naive datetime - assume local
            dt = datetime.fromisoformat(ts_str)
            return dt.timestamp()
    except Exception:
        return 0.0  # Invalid timestamp

from datetime import timedelta

def get_kst_date() -> str:
    return datetime.now().strftime("%Y-%m-%d")

def get_kst_date_compact() -> str:
    return datetime.now().strftime("%Y%m%d")

def get_next_task_number(date_compact: str, location: str = "INBOX") -> str:
    """Get next task number for today."""
    dirs = [get_inbox_dir(), get_active_dir(), get_completed_dir(), 
            get_halted_dir(), get_dumped_dir()]
    max_num = 0
    pattern = f"TASK-.*-{date_compact}-(\\d+)-"
    
    for d in dirs:
        if not os.path.exists(d):
            continue
        for f in os.listdir(d):
            match = re.search(pattern, f)
            if match:
                num = int(match.group(1))
                max_num = max(max_num, num)
    
    return f"{max_num + 1:03d}"

def slugify(text: str) -> str:
    """Convert text to kebab-case slug."""
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text[:50].strip('-')

def ensure_dirs():
    """Create required directories."""
    for d in [get_inbox_dir(), get_active_dir(), get_completed_dir(),
              get_halted_dir(), get_dumped_dir(), get_journal_dir()]:
        Path(d).mkdir(parents=True, exist_ok=True)

def read_yaml_header(filepath: str) -> dict:
    """Extract YAML header from markdown file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
        if not match:
            return {}
        header = {}
        for line in match.group(1).strip().split('\n'):
            if ':' in line:
                key, value = line.split(':', 1)
                header[key.strip()] = value.strip()
        return header
    except Exception:
        return {}

def update_yaml_header(filepath: str, updates: dict):
    """Update YAML header in markdown file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    match = re.match(r'^(---\n)(.*?)(\n---)', content, re.DOTALL)
    if not match:
        return
    
    header_lines = match.group(2).strip().split('\n')
    new_lines = []
    updated_keys = set()
    
    for line in header_lines:
        if ':' in line:
            key = line.split(':')[0].strip()
            if key in updates:
                new_lines.append(f"{key}: {updates[key]}")
                updated_keys.add(key)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)
    
    for key, value in updates.items():
        if key not in updated_keys:
            new_lines.append(f"{key}: {value}")
    
    new_header = "---\n" + '\n'.join(new_lines) + "\n---"
    new_content = re.sub(r'^---\n.*?\n---', new_header, content, flags=re.DOTALL)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

def get_focus() -> str | None:
    """Get current focus task ID."""
    focus_file = get_focus_file()
    if not os.path.exists(focus_file):
        return None
    header = read_yaml_header(focus_file)
    task = header.get('current_task', 'null')
    return None if task == 'null' else task

def get_full_focus() -> dict:
    """Get full focus state including parallel tasks."""
    focus_file = get_focus_file()
    if not os.path.exists(focus_file):
        return {'current_task': None, 'parallel_tasks': {}}
    
    try:
        with open(focus_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        header = read_yaml_header(focus_file)
        result = {
            'current_task': header.get('current_task'),
            'switched_at': header.get('switched_at'),
            'switched_by': header.get('switched_by'),
            'parallel_tasks': {},
            'conflicts': []
        }
        
        # Parse parallel_tasks if present (simple YAML parsing)
        if 'parallel_tasks:' in content:
            # For now, return basic structure - full parsing in production
            pass
        
        return result
    except Exception:
        return {'current_task': None, 'parallel_tasks': {}}

def set_focus(task_id: str | None, agent: str = "CLI", partition: list[str] = None, mode: str = "SRL"):
    """Set focus to a task with optional parallel task support.
    
    Args:
        task_id: Task ID to focus on (or None to clear)
        agent: Agent setting the focus
        partition: List of file/dir patterns this agent owns (for PAR mode)
        mode: Execution mode (SRL, PAR, FRE)
    """
    focus_file = get_focus_file()
    now = get_kst_now()
    
    # Read existing focus for parallel mode
    existing = get_full_focus()
    parallel_tasks = existing.get('parallel_tasks', {})
    
    # Update parallel tasks for PAR mode
    if mode == "PAR" and partition:
        parallel_tasks[agent] = {
            'task_id': task_id,
            'partition': partition,
            'started_at': now
        }
        parallel_section = format_parallel_tasks(parallel_tasks)
    else:
        # Clear parallel tasks in non-PAR mode
        parallel_section = ""
    
    content = f"""---
current_task: {task_id or 'null'}
switched_at: {now}
switched_by: {agent}
mode: {mode}
---
{parallel_section}"""
    
    with open(focus_file, 'w', encoding='utf-8') as f:
        f.write(content)

def format_parallel_tasks(parallel_tasks: dict) -> str:
    """Format parallel tasks for _focus.md."""
    if not parallel_tasks:
        return ""
    
    lines = ["\n## Parallel Tasks\n"]
    for agent, info in parallel_tasks.items():
        lines.append(f"### {agent}")
        lines.append(f"- task_id: {info.get('task_id', 'null')}")
        lines.append(f"- partition: {info.get('partition', [])}")
        lines.append(f"- started_at: {info.get('started_at', 'unknown')}")
        lines.append("")
    return '\n'.join(lines)

def normalize_case(case_input: str) -> str:
    """Normalize case input (supports both legacy numbers and new names)."""
    if case_input in CASE_NAMES:
        return case_input
    if case_input in LEGACY_CASE_MAP:
        return LEGACY_CASE_MAP[case_input]
    return "OTHER"  # fallback

def text_similarity(a: str, b: str) -> float:
    """Simple text similarity using word overlap (Jaccard)."""
    if not a or not b:
        return 0.0
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)

def check_duplicate_tasks(title: str, threshold: float = 0.5) -> list[tuple[str, float, str]]:
    """Check for duplicate/similar tasks in INBOX and ACTIVE.
    
    Returns: List of (filename, similarity_score, directory) tuples
    """
    duplicates = []
    title_lower = title.lower() if title else ""
    
    for d, dirname in [(get_inbox_dir(), "INBOX"), (get_active_dir(), "ACTIVE")]:
        if not os.path.exists(d):
            continue
        for f in os.listdir(d):
            if not f.startswith("TASK-") or not f.endswith(".md"):
                continue
            
            # Extract title from filename (last part before .md)
            parts = f.replace('.md', '').split('-')
            if len(parts) >= 5:
                file_title = '-'.join(parts[4:])  # Everything after date-num
                similarity = text_similarity(title_lower, file_title.replace('-', ' '))
                if similarity >= threshold:
                    duplicates.append((f, similarity, dirname))
    
    return sorted(duplicates, key=lambda x: -x[1])  # Sort by similarity desc

# ═══════════════════════════════════════════════════════════════════════════════
# LOCK MANAGEMENT (v3.6.4 - Default Stale Threshold 120s)
# ═══════════════════════════════════════════════════════════════════════════════

import json
import socket

# Environment variable overrides
# v3.6.4: Default changed from 60s to 120s to reduce false positives
STALE_THRESHOLD_ENV = os.environ.get('ENSEMBLE_STALE_THRESHOLD', '120')
STALE_CLEANUP_DAYS_ENV = os.environ.get('ENSEMBLE_STALE_CLEANUP_DAYS', '7')

def get_stale_threshold() -> int:
    """Get stale threshold from environment or default (120s).
    
    v3.6.4: Default increased from 60s to 120s for better I/O tolerance.
    Set ENSEMBLE_STALE_THRESHOLD=60 for faster detection on fast systems.
    """
    try:
        return int(STALE_THRESHOLD_ENV)
    except ValueError:
        return 120  # v3.6.4: increased from 60

def get_stale_cleanup_days() -> int:
    """Get stale cleanup days from environment or default."""
    try:
        return int(STALE_CLEANUP_DAYS_ENV)
    except ValueError:
        return 7


def is_process_alive(pid: int) -> bool:
    """Check if a process with given PID is still running (same host only)."""
    try:
        os.kill(pid, 0)  # Signal 0 = check if process exists
        return True
    except OSError:
        return False
    except Exception:
        return True  # Assume alive if we can't check


def cleanup_old_stale_files(directory: str, days: int = None) -> int:
    """Clean up stale lock files older than specified days.
    
    v3.6.3: Auto-cleanup of *.lock.stale.* files.
    Returns number of files cleaned.
    """
    import time
    
    if days is None:
        days = get_stale_cleanup_days()
    
    if days <= 0:
        return 0  # Cleanup disabled
    
    threshold_seconds = days * 24 * 60 * 60
    now = time.time()
    cleaned = 0
    
    try:
        if not os.path.isdir(directory):
            return 0
        
        for f in os.listdir(directory):
            if '.lock.stale.' not in f:
                continue
            
            filepath = os.path.join(directory, f)
            try:
                mtime = os.path.getmtime(filepath)
                if now - mtime > threshold_seconds:
                    os.remove(filepath)
                    cleaned += 1
                    
                    # Log cleanup
                    log_file = os.path.join(directory, '_lock_events.log')
                    log_event(log_file, 'STALE_FILE_CLEANED', {
                        'file': mask_sensitive_path(filepath),
                        'age_days': int((now - mtime) / 86400)
                    }, mask_paths=False)
            except Exception:
                pass
    except Exception:
        pass
    
    return cleaned


def cleanup_old_temp_files(directory: str, hours: int = 24) -> int:
    """Clean up old ensemble temp files.
    
    v3.6.3: Auto-cleanup of ensemble_*.tmp files.
    """
    import time
    
    threshold_seconds = hours * 60 * 60
    now = time.time()
    cleaned = 0
    
    try:
        if not os.path.isdir(directory):
            return 0
        
        for f in os.listdir(directory):
            if not (f.startswith('ensemble_') and f.endswith('.tmp')):
                continue
            
            filepath = os.path.join(directory, f)
            try:
                mtime = os.path.getmtime(filepath)
                if now - mtime > threshold_seconds:
                    os.remove(filepath)
                    cleaned += 1
            except Exception:
                pass
    except Exception:
        pass
    
    return cleaned


class FileLock:
    """File-based lock for cross-process synchronization.
    
    v3.6.3 improvements:
    - Environment variable config: ENSEMBLE_STALE_THRESHOLD, ENSEMBLE_STALE_CLEANUP_DAYS
    - Auto-cleanup of old stale files on lock operations
    
    v3.6.2 features:
    - Rich metadata in lock file (pid, hostname, acquired_at_utc, ttl)
    - Stale lock renamed instead of deleted (for audit/recovery)
    - Process alive check before stale removal (same host)
    """
    
    def __init__(self, filepath: str, timeout: float = 5.0, stale_threshold: float = None):
        self.filepath = filepath
        self.lockfile = filepath + ".lock"
        self.timeout = timeout
        self.stale_threshold = stale_threshold or get_stale_threshold()
        self.fd = None
        self.hostname = socket.gethostname()
    
    def _write_lock_metadata(self):
        """Write rich metadata to lock file."""
        import time
        metadata = {
            'pid': os.getpid(),
            'hostname': self.hostname,
            'acquired_at_utc': time.time(),
            'ttl_seconds': self.stale_threshold
        }
        os.write(self.fd, json.dumps(metadata).encode())
    
    def _read_lock_metadata(self) -> dict:
        """Read metadata from existing lock file."""
        try:
            with open(self.lockfile, 'r') as f:
                content = f.read().strip()
                # Try JSON format first (v3.6.2+)
                if content.startswith('{'):
                    return json.loads(content)
                # Fallback: old format (just PID)
                return {'pid': int(content), 'hostname': None, 'acquired_at_utc': None}
        except Exception:
            return {}
    
    def _is_lock_stale(self) -> tuple[bool, dict]:
        """Check if lock is stale. Returns (is_stale, metadata)."""
        import time
        
        if not os.path.exists(self.lockfile):
            return False, {}
        
        metadata = self._read_lock_metadata()
        mtime = os.path.getmtime(self.lockfile)
        age_seconds = time.time() - mtime
        
        # Check 1: Age-based (fallback)
        if age_seconds <= self.stale_threshold:
            return False, metadata
        
        # Check 2: If same hostname, verify process is dead
        if metadata.get('hostname') == self.hostname:
            pid = metadata.get('pid')
            if pid and is_process_alive(pid):
                # Process still alive - not stale despite age
                return False, metadata
        
        # Stale: old + (different host OR process dead)
        return True, metadata
    
    def _quarantine_stale_lock(self, metadata: dict):
        """Rename stale lock instead of deleting (for audit).
        
        v3.6.4: Increments stale counter for WARN summary at exit.
        """
        import time
        try:
            utc_str = f"{int(time.time())}"
            stale_path = f"{self.lockfile}.stale.{utc_str}"
            os.rename(self.lockfile, stale_path)
            
            # Increment stale counter for WARN summary
            increment_stale_count()
            debug_print(f"Quarantined stale lock: {mask_sensitive_path(self.lockfile)}", 'LOCK')
            
            # Log stale lock event (best effort)
            try:
                self._log_stale_event(metadata, stale_path)
            except Exception:
                pass
        except Exception as e:
            debug_print(f"Stale lock quarantine failed: {e}", 'ERROR')
            # Fallback: just delete
            try:
                os.remove(self.lockfile)
                increment_stale_count()  # Still count it
            except Exception:
                pass
    
    def _log_stale_event(self, metadata: dict, stale_path: str):
        """Log stale lock removal using unified log_event."""
        log_dir = os.path.dirname(self.lockfile) or '.'
        log_file = os.path.join(log_dir, '_lock_events.log')
        
        log_event(log_file, 'STALE_LOCK_QUARANTINED', {
            'original_lock': mask_sensitive_path(self.lockfile),
            'quarantine_path': mask_sensitive_path(stale_path),
            'original_metadata': metadata,
            'quarantined_by_pid': os.getpid(),
            'quarantined_by_host': self.hostname
        }, mask_paths=False)  # Already masked above
    
    def acquire(self) -> bool:
        """Acquire the lock. Returns True if successful.
        
        v3.6.3: Triggers cleanup of old stale files on first acquire attempt.
        """
        import time
        start = time.time()
        
        # Trigger cleanup of old stale files (best effort, once per acquire)
        try:
            lock_dir = os.path.dirname(self.lockfile) or '.'
            cleanup_old_stale_files(lock_dir)
            cleanup_old_temp_files(lock_dir)
        except Exception:
            pass
        
        while time.time() - start < self.timeout:
            try:
                # Try to create lock file exclusively
                self.fd = os.open(self.lockfile, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                self._write_lock_metadata()
                return True
            except FileExistsError:
                # Check if lock is stale
                is_stale, metadata = self._is_lock_stale()
                if is_stale:
                    self._quarantine_stale_lock(metadata)
                    continue
                time.sleep(0.1)
            except Exception:
                time.sleep(0.1)
        return False
    
    def release(self):
        """Release the lock."""
        try:
            if self.fd is not None:
                os.close(self.fd)
                self.fd = None
            if os.path.exists(self.lockfile):
                os.remove(self.lockfile)
        except Exception:
            pass
    
    def get_holder_info(self) -> str:
        """Get info about current lock holder (for error messages)."""
        metadata = self._read_lock_metadata()
        if not metadata:
            return "unknown"
        
        pid = metadata.get('pid', '?')
        host = metadata.get('hostname', '?')
        acquired = metadata.get('acquired_at_utc')
        
        if acquired:
            import time
            age = int(time.time() - acquired)
            return f"pid={pid}, host={host}, age={age}s"
        return f"pid={pid}, host={host}"
    
    def __enter__(self):
        if not self.acquire():
            holder_info = self.get_holder_info()
            raise TimeoutError(f"Could not acquire lock on {self.filepath} (held by: {holder_info})")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
        return False


def atomic_write_json(filepath: str, data: dict):
    """Write JSON file atomically using temp file + rename.
    
    v3.6.2: Uses 'ensemble_' prefix for temp files for clearer .gitignore rules.
    This prevents partial writes and corruption on crash/concurrent access.
    """
    dir_path = os.path.dirname(filepath) or '.'
    basename = os.path.basename(filepath)
    
    # Write to temp file with clear prefix
    fd, temp_path = tempfile.mkstemp(prefix=f'ensemble_{basename}_', suffix='.tmp', dir=dir_path)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        # Atomic rename (os.replace is atomic on POSIX)
        os.replace(temp_path, filepath)
    except Exception:
        # Cleanup temp file on error
        try:
            os.remove(temp_path)
        except Exception:
            pass
        raise


# ═══════════════════════════════════════════════════════════════════════════════
# EVENT LOGGING (v3.6.4 - Schema Extension + Debug Mode)
# ═══════════════════════════════════════════════════════════════════════════════

LOG_MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
LOG_MAX_ROTATIONS = 3  # Keep .1, .2, .3
LOG_SCHEMA_VERSION = 1  # Increment when schema changes

# Debug mode: set ENSEMBLE_DEBUG=1 to see error details on stderr
DEBUG_MODE = os.environ.get('ENSEMBLE_DEBUG', '').lower() in ('1', 'true', 'yes')

# Global counter for stale events (per process, for WARN summary)
_stale_event_count = 0


def debug_print(msg: str, category: str = 'DEBUG'):
    """Print debug message to stderr if debug mode is enabled."""
    if DEBUG_MODE:
        import sys
        print(f"[ENSEMBLE/{category}] {msg}", file=sys.stderr)


def get_utc_iso() -> str:
    """Get current UTC time in ISO8601 format."""
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def mask_sensitive_path(path: str) -> str:
    """Mask home directory in paths for privacy."""
    if not path:
        return path
    
    home = os.path.expanduser('~')
    if path.startswith(home):
        return path.replace(home, '~', 1)
    return path


def rotate_log_if_needed(log_file: str):
    """Rotate log file if it exceeds size limit."""
    try:
        if not os.path.exists(log_file):
            return
        
        if os.path.getsize(log_file) < LOG_MAX_SIZE_BYTES:
            return
        
        # Rotate existing rotations
        for i in range(LOG_MAX_ROTATIONS, 0, -1):
            old_path = f"{log_file}.{i}"
            new_path = f"{log_file}.{i + 1}"
            if os.path.exists(old_path):
                if i == LOG_MAX_ROTATIONS:
                    os.remove(old_path)  # Delete oldest
                else:
                    os.rename(old_path, new_path)
        
        # Rotate current
        os.rename(log_file, f"{log_file}.1")
        debug_print(f"Rotated log: {mask_sensitive_path(log_file)}", 'LOG')
    except Exception as e:
        debug_print(f"Log rotation failed: {e}", 'ERROR')


def log_event(log_file: str, event_type: str, details: dict = None, mask_paths: bool = True):
    """Generic event logging with rotation support.
    
    v3.6.4 schema:
    - log_v: schema version (1)
    - event: event type string
    - timestamp_utc: epoch float (machine-friendly)
    - timestamp_utc_iso: ISO8601 string (human-friendly)
    - timestamp_kst: KST string (local context)
    - hostname: machine hostname
    - pid: process ID
    - details: event-specific data
    """
    import time
    import socket
    
    try:
        rotate_log_if_needed(log_file)
        
        event = {
            'log_v': LOG_SCHEMA_VERSION,
            'event': event_type,
            'timestamp_utc': time.time(),
            'timestamp_utc_iso': get_utc_iso(),
            'timestamp_kst': get_kst_now(),
            'hostname': socket.gethostname(),
            'pid': os.getpid(),
            'details': details or {}
        }
        
        # Mask sensitive paths if requested
        if mask_paths and 'filepath' in event['details']:
            event['details']['filepath'] = mask_sensitive_path(event['details']['filepath'])
        
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(event, ensure_ascii=False) + '\n')
        
        debug_print(f"Logged {event_type} to {mask_sensitive_path(log_file)}", 'LOG')
    except Exception as e:
        debug_print(f"Logging failed ({event_type}): {e}", 'ERROR')


def increment_stale_count():
    """Increment global stale event counter."""
    global _stale_event_count
    _stale_event_count += 1


def get_stale_count() -> int:
    """Get current stale event count."""
    return _stale_event_count


def print_stale_warning_if_any():
    """Print warning if stale events occurred during this run."""
    import sys
    count = get_stale_count()
    if count > 0:
        print(f"⚠️  WARN: {count} stale lock(s) were quarantined. Check _lock_events.log for details.", 
              file=sys.stderr)


def log_storage_event(event_type: str, filepath: str, details: dict = None):
    """Log storage-related events (corruption, recovery, etc.) for debugging.
    
    v3.6.3: Now uses log_event with rotation support.
    """
    log_dir = os.path.dirname(filepath) or '.'
    log_file = os.path.join(log_dir, '_storage_events.log')
    
    event_details = details.copy() if details else {}
    event_details['filepath'] = mask_sensitive_path(filepath)
    
    log_event(log_file, event_type, event_details)


def read_json_safe(filepath: str, default: dict = None) -> dict:
    """Read JSON file with backup recovery on corruption.
    
    v3.6.2: Logs recovery events for debugging.
    """
    if default is None:
        default = {}
    
    if not os.path.exists(filepath):
        return default.copy()
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        # Log corruption event
        log_storage_event('JSON_CORRUPTION_DETECTED', filepath, {
            'error': str(e),
            'error_line': getattr(e, 'lineno', None),
            'error_col': getattr(e, 'colno', None)
        })
        
        # Try backup file
        backup = filepath + ".bak"
        if os.path.exists(backup):
            try:
                with open(backup, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                # Restore from backup
                shutil.copy(backup, filepath)
                
                # Log successful recovery
                log_storage_event('JSON_RECOVERED_FROM_BACKUP', filepath, {
                    'backup_file': backup
                })
                return data
            except Exception as be:
                log_storage_event('BACKUP_RECOVERY_FAILED', filepath, {
                    'backup_file': backup,
                    'error': str(be)
                })
        
        # Log fallback to default
        log_storage_event('JSON_RESET_TO_DEFAULT', filepath, {
            'reason': 'corruption_no_valid_backup'
        })
        return default.copy()
    except Exception as e:
        log_storage_event('JSON_READ_ERROR', filepath, {'error': str(e)})
        return default.copy()


# ═══════════════════════════════════════════════════════════════════════════════
# v3.7 QUESTION GATE SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

def get_next_question_id() -> str:
    """Generate next question ID: Q-YYYYMMDD-NNN"""
    date_compact = get_kst_date_compact()
    questions = read_questions()
    existing_ids = [q.get('question_id', '') for q in questions.get('questions', [])]
    
    max_num = 0
    pattern = f"Q-{date_compact}-(\\d+)"
    for qid in existing_ids:
        match = re.match(pattern, qid)
        if match:
            max_num = max(max_num, int(match.group(1)))
    
    return f"Q-{date_compact}-{max_num + 1:03d}"


def read_questions() -> dict:
    """Read pending questions from _pending_questions.json."""
    return read_json_safe(get_questions_file(), {"questions": [], "last_updated": None})


def write_questions(data: dict):
    """Write questions to _pending_questions.json atomically."""
    data['last_updated'] = get_kst_now()
    atomic_write_json(get_questions_file(), data)


def create_question(kind: str, prompt: str, choices: list, default_choice: int = 1, 
                   context: dict = None) -> dict:
    """Create a new question and add to pending questions.
    
    Args:
        kind: Question kind (DATA_ROOT_CONFIRM, EXTERNAL_EXEC_CONFIRM, WRITE_DETECTED_CONFIRM)
        prompt: Question text to show user
        choices: List of choice dicts with {title, action, risk, evidence}
        default_choice: Recommended choice (1-indexed)
        context: Additional context (filepath, command, etc.)
    
    Returns:
        Created question dict
    """
    question_id = get_next_question_id()
    
    question = {
        'question_id': question_id,
        'kind': kind,
        'prompt': prompt,
        'default_choice': default_choice,
        'choices': choices,
        'context': context or {},
        'created_at': get_kst_now(),
        'created_at_utc': get_utc_timestamp(),
        'status': 'pending',
        'selected_choice': None,
        'answered_at': None,
        'answered_by': None,
    }
    
    # Auto-select if AUTO_DEFAULT is enabled
    if AUTO_DEFAULT:
        question['status'] = 'auto_selected_waiting_confirm'
        question['selected_choice'] = default_choice
        question['auto_selected'] = True
        
        # Log auto-selection
        log_question_event('AUTO_SELECTED', {
            'question_id': question_id,
            'kind': kind,
            'selected_choice': default_choice,
            'choice_title': choices[default_choice - 1]['title'] if choices else None,
        })
    
    # Add to pending questions
    data = read_questions()
    data['questions'].append(question)
    write_questions(data)
    
    # Log question creation
    log_question_event('QUESTION_CREATED', {
        'question_id': question_id,
        'kind': kind,
        'auto_default': AUTO_DEFAULT,
    })
    
    return question


def get_pending_questions(kind: str = None) -> list:
    """Get pending questions, optionally filtered by kind."""
    data = read_questions()
    questions = data.get('questions', [])
    
    pending = [q for q in questions if q.get('status') in ('pending', 'auto_selected_waiting_confirm')]
    
    if kind:
        pending = [q for q in pending if q.get('kind') == kind]
    
    return pending


def get_question_by_id(question_id: str) -> dict | None:
    """Get a specific question by ID."""
    data = read_questions()
    for q in data.get('questions', []):
        if q.get('question_id') == question_id:
            return q
    return None


def answer_question(question_id: str, choice: int, agent: str = "CLI") -> tuple[bool, str]:
    """Answer a pending question.
    
    Args:
        question_id: Question ID
        choice: Selected choice (1-indexed)
        agent: Agent answering
    
    Returns:
        (success, message)
    """
    data = read_questions()
    
    for q in data.get('questions', []):
        if q.get('question_id') == question_id:
            if q.get('status') not in ('pending', 'auto_selected_waiting_confirm'):
                return False, f"Question {question_id} is not pending (status: {q.get('status')})"
            
            if choice < 1 or choice > len(q.get('choices', [])):
                return False, f"Invalid choice: {choice}. Must be 1-{len(q.get('choices', []))}"
            
            q['status'] = 'answered'
            q['selected_choice'] = choice
            q['answered_at'] = get_kst_now()
            q['answered_by'] = agent
            
            write_questions(data)
            
            log_question_event('QUESTION_ANSWERED', {
                'question_id': question_id,
                'selected_choice': choice,
                'agent': agent,
            })
            
            return True, f"Question {question_id} answered with choice {choice}"
    
    return False, f"Question {question_id} not found"


def get_highest_priority_question() -> dict | None:
    """Get the highest priority pending question based on kind priority."""
    pending = get_pending_questions()
    if not pending:
        return None
    
    # Sort by kind priority (higher index = higher priority)
    def priority_key(q):
        kind = q.get('kind', '')
        try:
            return QUESTION_KINDS.index(kind)
        except ValueError:
            return -1
    
    pending.sort(key=priority_key, reverse=True)
    return pending[0]


def log_question_event(event_type: str, details: dict = None):
    """Log question-related events."""
    log_file = get_question_events_log()
    log_event(log_file, event_type, details)


# ═══════════════════════════════════════════════════════════════════════════════
# v3.7 OWNER MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

def read_owner() -> dict | None:
    """Read owner information from OWNER.json."""
    owner_file = get_owner_file()
    if not os.path.exists(owner_file):
        return None
    return read_json_safe(owner_file, None)


def write_owner(owner_data: dict):
    """Write owner information to OWNER.json."""
    atomic_write_json(get_owner_file(), owner_data)


def get_current_user_info() -> dict:
    """Get current user information for owner matching."""
    import socket
    import getpass
    
    info = {
        'username': getpass.getuser(),
        'uid': os.getuid() if hasattr(os, 'getuid') else None,
        'hostname': socket.gethostname(),
    }
    
    # Try to get git user info
    try:
        import subprocess
        git_email = subprocess.run(['git', 'config', 'user.email'], 
                                   capture_output=True, text=True, timeout=5)
        if git_email.returncode == 0:
            info['git_email'] = git_email.stdout.strip()
        
        git_name = subprocess.run(['git', 'config', 'user.name'],
                                  capture_output=True, text=True, timeout=5)
        if git_name.returncode == 0:
            info['git_name'] = git_name.stdout.strip()
    except Exception:
        pass
    
    return info


def is_project_owner() -> tuple[bool, str]:
    """Check if current user is the project owner.
    
    Returns:
        (is_owner: bool, reason: str)
    """
    owner_data = read_owner()
    
    if owner_data is None:
        return False, "NOT_INITIALIZED: No OWNER.json found. Run `ensemble init-owner` first."
    
    current_user = get_current_user_info()
    owner = owner_data.get('owner', {})
    
    # Check UID first (most reliable)
    if owner.get('uid') is not None and current_user.get('uid') is not None:
        if owner['uid'] == current_user['uid']:
            return True, "UID_MATCH"
    
    # Check username + hostname
    if (owner.get('username') == current_user.get('username') and 
        owner.get('hostname') == current_user.get('hostname')):
        return True, "USERNAME_HOSTNAME_MATCH"
    
    # Check git email
    if owner.get('git_email') and current_user.get('git_email'):
        if owner['git_email'].lower() == current_user['git_email'].lower():
            return True, "GIT_EMAIL_MATCH"
    
    return False, f"NOT_OWNER: Current user ({current_user.get('username')}@{current_user.get('hostname')}) does not match owner ({owner.get('username')}@{owner.get('hostname')})"


def initialize_owner() -> dict:
    """Initialize OWNER.json with current user info."""
    current_user = get_current_user_info()
    
    owner_data = {
        'owner': current_user,
        'initialized_at': get_kst_now(),
        'initialized_at_utc': get_utc_timestamp(),
    }
    
    write_owner(owner_data)
    
    log_question_event('OWNER_INITIALIZED', {
        'username': current_user.get('username'),
        'hostname': current_user.get('hostname'),
    })
    
    return owner_data


# ═══════════════════════════════════════════════════════════════════════════════
# v3.7 APPROVAL SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

def approve_question(question_id: str, dry_run: bool = False) -> tuple[bool, str, int]:
    """Approve a question for execution (owner only).
    
    Args:
        question_id: Question ID to approve
        dry_run: If True, validate without executing
    
    Returns:
        (success: bool, message: str, exit_code: int)
    """
    # Check owner
    is_owner, reason = is_project_owner()
    if not is_owner:
        log_question_event('APPROVE_DENIED', {
            'question_id': question_id,
            'reason': reason,
        })
        return False, f"❌ Approval denied: {reason}", 3
    
    # Get question
    question = get_question_by_id(question_id)
    if question is None:
        return False, f"❌ Question {question_id} not found", 1
    
    status = question.get('status')
    if status not in ('auto_selected_waiting_confirm', 'answered'):
        return False, f"❌ Question {question_id} is not ready for approval (status: {status})", 1
    
    if dry_run:
        choice = question.get('selected_choice', 1)
        choice_info = question.get('choices', [])[choice - 1] if question.get('choices') else {}
        return True, f"✅ [DRY-RUN] Would approve {question_id} with choice {choice}: {choice_info.get('title', 'N/A')}", 0
    
    # Mark as executed
    data = read_questions()
    for q in data.get('questions', []):
        if q.get('question_id') == question_id:
            q['status'] = 'executed'
            q['executed_at'] = get_kst_now()
            q['executed_by'] = get_current_user_info().get('username', 'unknown')
            break
    write_questions(data)
    
    log_question_event('APPROVED', {
        'question_id': question_id,
        'choice': question.get('selected_choice'),
        'actor': get_current_user_info().get('username'),
    })
    
    log_question_event('EXECUTED', {
        'question_id': question_id,
        'kind': question.get('kind'),
        'action': question.get('choices', [])[question.get('selected_choice', 1) - 1].get('action') if question.get('choices') else None,
    })
    
    return True, f"✅ Approved and executed {question_id}", 0


def approve_latest(dry_run: bool = False) -> tuple[bool, str, int]:
    """Approve the highest priority pending question.
    
    Returns:
        (success: bool, message: str, exit_code: int)
    """
    question = get_highest_priority_question()
    if question is None:
        return False, "ℹ️ No pending questions to approve", 0
    
    return approve_question(question['question_id'], dry_run)


def read_locks() -> dict:
    """Read current locks from _locks.json with safe fallback."""
    return read_json_safe(get_locks_file(), {"locks": {}, "last_cleanup": None})


def write_locks(data: dict):
    """Write locks to _locks.json atomically."""
    locks_file = get_locks_file()
    
    # Create backup before write
    if os.path.exists(locks_file):
        try:
            shutil.copy(locks_file, locks_file + ".bak")
        except Exception:
            pass
    
    atomic_write_json(locks_file, data)


def is_lock_expired(lock_info: dict, ttl_minutes: int = None) -> bool:
    """Check if a lock has expired using UTC-based comparison.
    
    v3.6.1: Fixed timezone bug - now uses UTC timestamps for reliable comparison
    regardless of system timezone.
    """
    if 'acquired_at' not in lock_info:
        return True
    
    # Use stored TTL if available, otherwise default
    if ttl_minutes is None:
        ttl_minutes = lock_info.get('ttl_minutes', 30)
    
    try:
        acquired_utc = parse_timestamp_to_utc(lock_info['acquired_at'])
        if acquired_utc == 0.0:
            return True  # Invalid timestamp
        
        now_utc = get_utc_timestamp()
        diff_minutes = (now_utc - acquired_utc) / 60
        
        return diff_minutes > ttl_minutes
    except Exception:
        return True

def acquire_lock(agent: str, file_path: str, task_id: str, ttl_minutes: int = 30) -> tuple[bool, str]:
    """Acquire a lock on a file.
    
    Returns: (success: bool, message: str)
    """
    data = read_locks()
    locks = data.get('locks', {})
    
    # Normalize path
    file_path = file_path.replace('\\', '/')
    
    # Check existing lock
    if file_path in locks:
        existing = locks[file_path]
        if existing.get('agent') != agent and not is_lock_expired(existing, ttl_minutes):
            return False, f"CONFLICT: {file_path} is locked by {existing.get('agent')} (task: {existing.get('task_id')})"
    
    # Acquire lock
    locks[file_path] = {
        'agent': agent,
        'task_id': task_id,
        'acquired_at': get_kst_now(),
        'ttl_minutes': ttl_minutes
    }
    data['locks'] = locks
    data['last_cleanup'] = get_kst_now()
    write_locks(data)
    
    return True, f"Lock acquired on {file_path}"

def release_lock(agent: str, file_path: str) -> bool:
    """Release a lock on a file."""
    data = read_locks()
    locks = data.get('locks', {})
    file_path = file_path.replace('\\', '/')
    
    if file_path in locks:
        if locks[file_path].get('agent') == agent:
            del locks[file_path]
            data['locks'] = locks
            write_locks(data)
            return True
    return False

def release_all_locks(agent: str) -> int:
    """Release all locks held by an agent."""
    data = read_locks()
    locks = data.get('locks', {})
    released = 0
    
    to_remove = [f for f, info in locks.items() if info.get('agent') == agent]
    for f in to_remove:
        del locks[f]
        released += 1
    
    data['locks'] = locks
    write_locks(data)
    return released

def check_partition_conflict(agent: str, target_files: list[str]) -> list[dict]:
    """Check for partition conflicts in PAR mode.
    
    Returns: List of conflict dictionaries
    """
    conflicts = []
    focus = get_full_focus()
    parallel_tasks = focus.get('parallel_tasks', {})
    
    for other_agent, info in parallel_tasks.items():
        if other_agent == agent:
            continue
        partitions = info.get('partition', [])
        for partition in partitions:
            for target in target_files:
                # Check if target is within another agent's partition
                if target.startswith(partition) or partition.startswith(target):
                    conflicts.append({
                        'agent': other_agent,
                        'partition': partition,
                        'conflicting_file': target,
                        'task_id': info.get('task_id')
                    })
    
    return conflicts

def cleanup_expired_locks(ttl_minutes: int = 30) -> int:
    """Remove expired locks."""
    data = read_locks()
    locks = data.get('locks', {})
    
    expired = [f for f, info in locks.items() if is_lock_expired(info, ttl_minutes)]
    for f in expired:
        del locks[f]
    
    data['locks'] = locks
    data['last_cleanup'] = get_kst_now()
    write_locks(data)
    return len(expired)

# ═══════════════════════════════════════════════════════════════════════════════
# ERROR REGISTRY SYSTEM (v3.6 - Phase 2)
# ═══════════════════════════════════════════════════════════════════════════════

ERROR_TYPES = [
    "SYNTAX", "IMPORT", "RUNTIME", "TYPE", "LOGIC", "CONFIG", "BUILD", "TEST", "OTHER"
]

def ensure_errors_dir():
    """Create ERRORS directory if not exists."""
    errors_dir = get_errors_dir()
    Path(errors_dir).mkdir(parents=True, exist_ok=True)
    return errors_dir

def get_errors_registry_file():
    """Get path to _registry.json."""
    return os.path.join(get_errors_dir(), "_registry.json")

def get_findings_file():
    """Get path to findings.md."""
    return os.path.join(get_notes_dir(), "findings.md")

def read_errors_registry() -> dict:
    """Read error registry from _registry.json with safe fallback."""
    ensure_errors_dir()
    return read_json_safe(get_errors_registry_file(), {"errors": [], "last_updated": None, "sig_version": 1})

def write_errors_registry(data: dict):
    """Write error registry to _registry.json atomically with file lock."""
    ensure_errors_dir()
    registry_file = get_errors_registry_file()
    data['last_updated'] = get_kst_now()
    data['sig_version'] = 1  # For future signature algorithm changes
    
    # Create backup before write
    if os.path.exists(registry_file):
        try:
            shutil.copy(registry_file, registry_file + ".bak")
        except Exception:
            pass
    
    # Use file lock for concurrent access protection
    lock = FileLock(registry_file, timeout=5.0)
    try:
        if lock.acquire():
            atomic_write_json(registry_file, data)
            lock.release()
        else:
            # Fallback: try without lock (better than failing)
            atomic_write_json(registry_file, data)
    except Exception:
        lock.release()
        raise

def normalize_file_path(file_path: str) -> str:
    """Normalize file path for consistent signature generation.
    
    v3.6.1: Added to prevent same error being split due to path differences.
    """
    if not file_path:
        return ""
    
    # Convert to forward slashes
    normalized = file_path.replace('\\', '/')
    
    # Remove leading ./
    if normalized.startswith('./'):
        normalized = normalized[2:]
    
    # Remove leading /
    while normalized.startswith('/'):
        normalized = normalized[1:]
    
    # Lowercase for case-insensitive comparison
    normalized = normalized.lower()
    
    return normalized

def error_signature(error_type: str, file_path: str, message: str) -> str:
    """Generate unique signature for error deduplication.
    
    v3.6.1: Improved normalization to reduce over/under-merging.
    - File path is normalized (case, slashes, relative/absolute)
    - Only line numbers and memory addresses are replaced (not all numbers)
    - Preserves meaningful numbers in error messages
    """
    # Normalize file path
    normalized_path = normalize_file_path(file_path)
    
    # Normalize message more carefully
    normalized_msg = message
    
    # Replace line numbers (common patterns)
    normalized_msg = re.sub(r'line \d+', 'line N', normalized_msg, flags=re.IGNORECASE)
    normalized_msg = re.sub(r':\d+:', ':N:', normalized_msg)  # file:line:col format
    normalized_msg = re.sub(r'\[\d+\]', '[N]', normalized_msg)  # array indices
    
    # Replace memory addresses
    normalized_msg = re.sub(r'0x[0-9a-fA-F]+', 'ADDR', normalized_msg)
    
    # Replace timestamps
    normalized_msg = re.sub(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}', 'TIMESTAMP', normalized_msg)
    
    # Replace quoted strings (but keep the quote style)
    normalized_msg = re.sub(r"'[^']*'", "'X'", normalized_msg)
    normalized_msg = re.sub(r'"[^"]*"', '"X"', normalized_msg)
    
    # Lowercase and strip
    normalized_msg = normalized_msg.lower().strip()
    
    content = f"v1:{error_type}:{normalized_path}:{normalized_msg}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]

def register_error(
    error_type: str,
    file_path: str,
    message: str,
    line: int = None,
    task_id: str = None,
    agent: str = "CLI"
) -> tuple[str, bool, list[str]]:
    """Register an error in the registry.
    
    Returns: (error_id, is_duplicate, related_tasks)
    """
    registry = read_errors_registry()
    errors = registry.get('errors', [])
    
    # Generate signature
    sig = error_signature(error_type, file_path, message)
    
    # Check for duplicates
    duplicates = [e for e in errors if e.get('signature') == sig]
    
    if duplicates:
        # Update existing error
        existing = duplicates[0]
        existing['occurrences'] = existing.get('occurrences', 1) + 1
        existing['last_seen'] = get_kst_now()
        if task_id and task_id not in existing.get('related_tasks', []):
            existing.setdefault('related_tasks', []).append(task_id)
        write_errors_registry(registry)
        return existing['id'], True, existing.get('related_tasks', [])
    
    # Create new error
    date_compact = get_kst_date_compact()
    error_num = len([e for e in errors if date_compact in e.get('id', '')]) + 1
    error_id = f"ERR-{date_compact}-{error_num:03d}"
    
    new_error = {
        'id': error_id,
        'type': error_type,
        'file': file_path,
        'line': line,
        'message': message,
        'signature': sig,
        'related_tasks': [task_id] if task_id else [],
        'status': 'OPEN',
        'first_seen': get_kst_now(),
        'last_seen': get_kst_now(),
        'occurrences': 1,
        'registered_by': agent
    }
    
    errors.append(new_error)
    registry['errors'] = errors
    write_errors_registry(registry)
    
    # Create individual error file
    error_file = os.path.join(get_errors_dir(), f"{error_id}.md")
    error_content = f"""---
id: {error_id}
type: {error_type}
file: {file_path}
line: {line or 'unknown'}
status: OPEN
first_seen: {get_kst_now()}
---

# Error: {error_id}

## Type
{error_type}

## Location
- **File**: `{file_path}`
- **Line**: {line or 'unknown'}

## Message
```
{message}
```

## Related Tasks
{chr(10).join(f"- {t}" for t in ([task_id] if task_id else [])) or "- (none yet)"}

## Resolution
<!-- 해결 방법이 여기에 기록됩니다 -->
"""
    with open(error_file, 'w', encoding='utf-8') as f:
        f.write(error_content)
    
    return error_id, False, []

def search_errors(
    file_path: str = None,
    error_type: str = None,
    status: str = None,
    task_id: str = None
) -> list[dict]:
    """Search errors with filters."""
    registry = read_errors_registry()
    errors = registry.get('errors', [])
    
    results = errors
    
    if file_path:
        results = [e for e in results if file_path in e.get('file', '')]
    if error_type:
        results = [e for e in results if e.get('type') == error_type]
    if status:
        results = [e for e in results if e.get('status') == status]
    if task_id:
        results = [e for e in results if task_id in e.get('related_tasks', [])]
    
    return sorted(results, key=lambda x: x.get('last_seen', ''), reverse=True)

def resolve_error(error_id: str, resolution: str, agent: str = "CLI") -> bool:
    """Mark an error as resolved.
    
    v3.6.1: Now also updates the frontmatter in the individual error md file
    to maintain consistency between registry and md files.
    """
    registry = read_errors_registry()
    errors = registry.get('errors', [])
    
    for e in errors:
        if e.get('id') == error_id:
            e['status'] = 'RESOLVED'
            e['resolved_at'] = get_kst_now()
            e['resolved_by'] = agent
            e['resolution'] = resolution
            write_errors_registry(registry)
            
            # Update individual error file (both frontmatter and append resolution)
            error_file = os.path.join(get_errors_dir(), f"{error_id}.md")
            if os.path.exists(error_file):
                try:
                    with open(error_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Update frontmatter status
                    content = re.sub(
                        r'^(---\n.*?)status:\s*OPEN',
                        r'\1status: RESOLVED',
                        content,
                        flags=re.DOTALL | re.MULTILINE
                    )
                    
                    # Add resolved_at and resolved_by to frontmatter
                    if 'resolved_at:' not in content:
                        content = re.sub(
                            r'^(---\n.*?)(---)',
                            f'\\1resolved_at: {get_kst_now()}\nresolved_by: {agent}\n\\2',
                            content,
                            flags=re.DOTALL | re.MULTILINE
                        )
                    
                    # Append resolution section
                    content += f"""
## ✅ RESOLVED ({get_kst_now()[:16]} by @{agent})

{resolution}
"""
                    with open(error_file, 'w', encoding='utf-8') as f:
                        f.write(content)
                except Exception:
                    # Fallback: just append
                    with open(error_file, 'a', encoding='utf-8') as f:
                        f.write(f"""
## ✅ RESOLVED ({get_kst_now()[:16]} by @{agent})

{resolution}
""")
            return True
    return False

def generate_findings(task_id: str = None) -> str:
    """Generate or update findings.md from error registry and task learnings.
    
    v3.6.1: Preserves MANUAL NOTES section if it exists in the file.
    The auto-generated content is marked with delimiters so manual notes aren't lost.
    """
    findings_file = get_findings_file()
    registry = read_errors_registry()
    errors = registry.get('errors', [])
    
    # Preserve existing manual notes
    manual_notes = ""
    MANUAL_MARKER = "<!-- MANUAL NOTES - DO NOT DELETE THIS MARKER -->"
    
    if os.path.exists(findings_file):
        try:
            with open(findings_file, 'r', encoding='utf-8') as f:
                existing_content = f.read()
            
            # Extract manual notes section
            if MANUAL_MARKER in existing_content:
                marker_pos = existing_content.find(MANUAL_MARKER)
                manual_notes = existing_content[marker_pos:]
        except Exception:
            pass
    
    # Group errors by file
    errors_by_file = {}
    for e in errors:
        f = e.get('file', 'unknown')
        errors_by_file.setdefault(f, []).append(e)
    
    # Get recent resolved errors with resolutions
    resolved = [e for e in errors if e.get('status') == 'RESOLVED' and e.get('resolution')]
    
    content = f"""# Findings (자동 생성)

> **Last Updated**: {get_kst_now()}
> **Total Errors**: {len(errors)} (Open: {len([e for e in errors if e.get('status') == 'OPEN'])}, Resolved: {len(resolved)})

---

## 🔥 Active Issues (OPEN)

"""
    open_errors = [e for e in errors if e.get('status') == 'OPEN']
    if open_errors:
        for e in open_errors[:10]:
            content += f"### {e.get('id')} - {e.get('type')}\n"
            content += f"- **File**: `{e.get('file')}`\n"
            content += f"- **Occurrences**: {e.get('occurrences', 1)}\n"
            content += f"- **First Seen**: {e.get('first_seen', 'unknown')[:16]}\n"
            content += f"- **Message**: {e.get('message', '')[:100]}...\n\n"
    else:
        content += "_(No open errors)_\n\n"
    
    content += """---

## ✅ Resolved Issues & Learnings

"""
    if resolved:
        for e in resolved[:10]:
            content += f"### {e.get('id')} - {e.get('type')} [RESOLVED]\n"
            content += f"- **File**: `{e.get('file')}`\n"
            content += f"- **Resolution**: {e.get('resolution', 'N/A')}\n"
            content += f"- **Resolved By**: @{e.get('resolved_by', 'unknown')}\n\n"
    else:
        content += "_(No resolved errors yet)_\n\n"
    
    content += """---

## 📊 Error Hotspots (by file)

| File | Open | Resolved | Total |
|------|------|----------|-------|
"""
    for f, errs in sorted(errors_by_file.items(), key=lambda x: -len(x[1]))[:10]:
        open_count = len([e for e in errs if e.get('status') == 'OPEN'])
        resolved_count = len([e for e in errs if e.get('status') == 'RESOLVED'])
        content += f"| `{f[:40]}` | {open_count} | {resolved_count} | {len(errs)} |\n"
    
    content += "\n---\n\n"
    
    # Add manual notes section (preserved or new template)
    if manual_notes:
        content += manual_notes
    else:
        content += f"""{MANUAL_MARKER}

## 📝 Manual Notes

> 이 섹션 아래의 내용은 자동 갱신 시에도 보존됩니다.
> 재현 커맨드, 관련 링크, 추가 맥락 등을 자유롭게 기록하세요.

"""
    
    with open(findings_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    return findings_file

# ═══════════════════════════════════════════════════════════════════════════════
# PAR MODE SYNC POINT (v3.6)
# ═══════════════════════════════════════════════════════════════════════════════

def check_sync_needed() -> tuple[bool, list[dict]]:
    """Check if PAR mode sync is needed.
    
    Returns: (sync_needed, conflicts)
    """
    focus = get_full_focus()
    parallel_tasks = focus.get('parallel_tasks', {})
    
    if len(parallel_tasks) < 2:
        return False, []
    
    # Check for partition overlaps
    agents = list(parallel_tasks.keys())
    conflicts = []
    
    for i, agent1 in enumerate(agents):
        for agent2 in agents[i+1:]:
            p1 = set(parallel_tasks[agent1].get('partition', []))
            p2 = set(parallel_tasks[agent2].get('partition', []))
            
            # Check exact overlap
            overlap = p1 & p2
            if overlap:
                conflicts.append({
                    'type': 'PARTITION_OVERLAP',
                    'agents': [agent1, agent2],
                    'overlap': list(overlap)
                })
            
            # Check prefix overlap (one partition contains another)
            for p in p1:
                for q in p2:
                    if p.startswith(q) or q.startswith(p):
                        if p != q:  # Not exact match
                            conflicts.append({
                                'type': 'PARTITION_NESTED',
                                'agents': [agent1, agent2],
                                'paths': [p, q]
                            })
    
    # Check lock conflicts
    locks_data = read_locks()
    locks = locks_data.get('locks', {})
    
    for file_path, lock_info in locks.items():
        lock_agent = lock_info.get('agent')
        for agent, info in parallel_tasks.items():
            if agent == lock_agent:
                continue
            partitions = info.get('partition', [])
            for partition in partitions:
                if file_path.startswith(partition):
                    conflicts.append({
                        'type': 'LOCK_IN_PARTITION',
                        'locked_by': lock_agent,
                        'partition_owner': agent,
                        'file': file_path
                    })
    
    return len(conflicts) > 0, conflicts

def execute_sync_point(agent: str = "CLI") -> dict:
    """Execute sync point: merge findings, resolve conflicts.
    
    Returns: sync report
    """
    now = get_kst_now()
    report = {
        'timestamp': now,
        'initiated_by': agent,
        'actions': []
    }
    
    # 1. Cleanup expired locks
    expired = cleanup_expired_locks()
    if expired:
        report['actions'].append(f"Cleaned up {expired} expired locks")
    
    # 2. Generate findings
    findings_file = generate_findings()
    report['actions'].append(f"Updated {findings_file}")
    
    # 3. Check conflicts
    sync_needed, conflicts = check_sync_needed()
    report['conflicts'] = conflicts
    
    if conflicts:
        report['actions'].append(f"Found {len(conflicts)} conflicts requiring attention")
    else:
        report['actions'].append("No conflicts detected")
    
    # 4. Write sync log to focus
    focus_file = get_focus_file()
    if os.path.exists(focus_file):
        with open(focus_file, 'a', encoding='utf-8') as f:
            f.write(f"\n## Sync Point ({now[:16]})\n")
            f.write(f"- Initiated by: {agent}\n")
            f.write(f"- Conflicts: {len(conflicts)}\n")
            for action in report['actions']:
                f.write(f"- {action}\n")
    
    return report


def calculate_hash(directory: str = ".") -> str:
    """Calculate SHA-256 hash of project files."""
    hasher = hashlib.sha256()
    extensions = {'.py', '.js', '.ts', '.md', '.json', '.yaml', '.yml'}
    exclude_dirs = {'.notes', '.git', 'node_modules', '__pycache__', '.venv'}
    
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for f in sorted(files):
            if any(f.endswith(ext) for ext in extensions):
                filepath = os.path.join(root, f)
                try:
                    with open(filepath, 'rb') as file:
                        hasher.update(file.read())
                except:
                    pass
    return hasher.hexdigest()

def find_task_in_dir(directory: str, task_pattern: str = None) -> str | None:
    """Find task file in directory."""
    if not os.path.exists(directory):
        return None
    for f in os.listdir(directory):
        if f.startswith("TASK-") and f.endswith(".md"):
            if task_pattern is None or task_pattern in f:
                return os.path.join(directory, f)
    return None

def find_task_file(task_id: str) -> str | None:
    """Find task file across all directories."""
    for d in [get_inbox_dir(), get_active_dir(), get_completed_dir(),
              get_halted_dir(), get_dumped_dir()]:
        if not os.path.exists(d):
            continue
        for f in os.listdir(d):
            if task_id in f and f.endswith(".md"):
                return os.path.join(d, f)
    return None

def list_tasks(directory: str) -> list[tuple[str, dict]]:
    """List tasks with their headers."""
    if not os.path.exists(directory):
        return []
    result = []
    for f in sorted(os.listdir(directory)):
        if f.startswith("TASK-") and f.endswith(".md"):
            filepath = os.path.join(directory, f)
            header = read_yaml_header(filepath)
            result.append((f, header))
    return result

def rename_task_location(old_path: str, new_location: str) -> str:
    """Rename task file with new location tag."""
    filename = os.path.basename(old_path)
    # Pattern: TASK-{old_location}-{date}-{num}-{desc}.md
    match = re.match(r'TASK-(\w+)-(\d+)-(\d+)-(.+)\.md', filename)
    if match:
        _, date, num, desc = match.groups()
        new_filename = f"TASK-{new_location}-{date}-{num}-{desc}.md"
    else:
        # Fallback for old naming
        new_filename = filename.replace("TASK-", f"TASK-{new_location}-", 1)
    return new_filename

# ═══════════════════════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_new(args):
    """Create new task with v3.5 naming convention and duplicate checking."""
    ensure_dirs()
    
    # Normalize case (supports both legacy numbers and new names)
    case_name = normalize_case(args.case)
    case_info = CASES.get(case_name, CASES["OTHER"])
    
    now = get_kst_now()
    date = get_kst_date()
    date_compact = get_kst_date_compact()
    num = get_next_task_number(date_compact)
    slug = slugify(args.title) if args.title else "untitled"
    
    # Check for duplicate tasks (unless --force)
    if args.title and not getattr(args, 'force', False):
        duplicates = check_duplicate_tasks(args.title, threshold=0.5)
        if duplicates:
            print(f"⚠️  유사한 태스크가 이미 존재합니다:")
            for fname, similarity, dirname in duplicates[:3]:
                print(f"   - [{dirname}] {fname} (유사도: {similarity:.0%})")
            print()
            confirm = input("계속 생성하시겠습니까? (y/N): ").strip().lower()
            if confirm != 'y':
                print("❌ 태스크 생성이 취소되었습니다.")
                return
            print()
    
    task_id = f"TASK-INBOX-{date_compact}-{num}-{slug}"
    
    # Determine pattern and state_guard
    pattern = args.pattern or ("SRL" if args.mode in ["G", "GCC", "XXX"] else 
                               "PAR" if args.mode == "PAR" else "SOLO")
    state_guard = args.guard or ("STRICT" if pattern == "SRL" else 
                                  "SOFT" if pattern == "FRE" else "NONE")
    
    # Agents list
    if args.mode == "G":
        agents = "[GEMINI]"
    elif args.mode == "GCC":
        agents = "[GEMINI, CLAUDE, CODEX]"
    elif args.mode == "PAR":
        agents = "[GEMINI, CLAUDE, CODEX]"
    elif args.mode == "SOLO":
        agents = f"[{args.agent or 'CLAUDE'}]"
    else:  # XXX
        agents = f"[GEMINI, {args.executor or 'CLAUDE'}]"
    
    # Task content with word-based case
    content = f"""---
task_id: {task_id}
status: INBOX
pattern: {pattern}
mode: {args.mode}
case: {case_name}
case_description: {case_info['description']}
agents: {agents}
state_guard: {state_guard}
owner: GEMINI
next_expected: GEMINI
created_at: {now}
updated_at: {now}
---

# {args.title or task_id}

## [GOAL]
{args.title or "TODO: Define goal"}

## [CONTEXT]
- Pattern: {pattern}
- Mode: {args.mode}
- Case: {case_name} ({case_info['description']})

## [ASSIGNMENT]
- [ ] TODO: Add tasks

## [REFERENCES]
- ENSEMBLE.md

## [AUTO_LOGS]
| Time (KST) | Actor | Action | Files | Hash |
|------------|-------|--------|-------|------|
| {now[:16]} | CLI | new | {task_id}.md | - |

## [STEP LOGS]
<!-- STEP LOG가 여기에 추가됩니다 -->
"""
    
    filepath = os.path.join(get_inbox_dir(), f"{task_id}.md")
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    # Create Journal with new naming
    journal_name = f"{date}-{num}-{slug}.md"
    journal_content = f"""# Journal: {task_id}

> **Task**: {args.title or task_id}
> **Pattern**: {pattern} | **Mode**: {args.mode} | **Case**: {case_name}
> **Created**: {now}

---

<!-- 각 Phase 완료 시 섹션이 추가됩니다 -->
"""
    journal_path = os.path.join(get_journal_dir(), journal_name)
    with open(journal_path, 'w', encoding='utf-8') as f:
        f.write(journal_content)
    
    print(f"✅ Task 생성 완료!")
    print(f"\n📋 Task Info")
    print(f"- ID: {task_id}")
    print(f"- Pattern: {pattern}")
    print(f"- Mode: {args.mode}")
    print(f"- Case: {case_name} ({case_info['description']})")
    print(f"\n📁 Files Created")
    print(f"- Task: .notes/INBOX/{task_id}.md")
    print(f"- Journal: .notes/JOURNAL/{journal_name}")
    print(f"\n🔜 Next Step")
    print(f"→ /ensemble-start 또는 'ensemble start' 로 Task를 시작하세요.")


def cmd_start(args):
    """Start task (INBOX → ACTIVE)."""
    ensure_dirs()
    
    # Find task
    if args.task:
        filepath = find_task_file(args.task)
    else:
        # Find first INBOX task
        filepath = find_task_in_dir(get_inbox_dir())
    
    if not filepath:
        print("❌ Task를 찾을 수 없습니다.")
        print("→ .notes/INBOX/ 에 Task 파일이 있는지 확인하세요.")
        return
    
    # Check if already active
    if get_active_dir() in filepath:
        print("❌ 이 Task는 이미 ACTIVE 상태입니다.")
        return
    
    # Read and update
    header = read_yaml_header(filepath)
    task_id = header.get('task_id', os.path.basename(filepath).replace('.md', ''))
    
    # Rename with new location
    new_filename = rename_task_location(filepath, "ACTIVE")
    new_task_id = new_filename.replace('.md', '')
    new_filepath = os.path.join(get_active_dir(), new_filename)
    
    # Move file
    os.rename(filepath, new_filepath)
    
    # Update header
    now = get_kst_now()
    update_yaml_header(new_filepath, {
        'task_id': new_task_id,
        'status': 'ACTIVE',
        'updated_at': now
    })
    
    # Set focus
    set_focus(new_task_id, args.agent or "CLI")
    
    # Append to journal
    journal_files = [f for f in os.listdir(get_journal_dir()) 
                     if task_id.split('-')[-2] in f and task_id.split('-')[-1].split('-')[0] in f]
    
    pattern = header.get('pattern', 'SRL')
    mode = header.get('mode', 'GCC')
    
    print(f"✅ Task 시작!")
    print(f"\n📋 Task Info")
    print(f"- ID: {new_task_id}")
    print(f"- Pattern: {pattern}")
    print(f"- Mode: {mode}")
    print(f"\n🎯 Focus 설정됨")
    print(f"\n📁 Location")
    print(f"→ .notes/ACTIVE/{new_filename}")
    print(f"\n🔜 Next Step")
    print(f"→ Phase 1 시작, 완료 후 /ensemble-log 실행")


def cmd_log(args):
    """Record STEP LOG + Journal entry."""
    task_id = get_focus()
    if not task_id:
        print("❌ Focus가 설정되지 않았습니다.")
        return
    
    filepath = find_task_in_dir(get_active_dir(), task_id)
    if not filepath:
        print(f"❌ Task 파일을 찾을 수 없습니다: {task_id}")
        return
    
    now = get_kst_now()
    agent = args.agent or "AGENT"
    
    # Append STEP LOG
    step_log = f"""
### STEP LOG (@{agent} - {now[:16]} KST)
- [DONE] {args.done}
- [CHANGE] {args.change}
- [RISK] {args.risk or "없음"}
- [NEXT] {args.next}
"""
    
    with open(filepath, 'a', encoding='utf-8') as f:
        f.write(step_log)
    
    # Update header
    header = read_yaml_header(filepath)
    next_agent = args.next.split()[0].replace('@', '').upper() if '@' in args.next else "NONE"
    update_yaml_header(filepath, {
        'owner': agent,
        'next_expected': next_agent,
        'updated_at': now
    })
    
    # Append to Journal
    date = get_kst_date()
    journal_files = [f for f in os.listdir(get_journal_dir()) if date in f]
    if journal_files:
        journal_path = os.path.join(get_journal_dir(), journal_files[0])
        phase = args.phase or "Phase"
        journal_entry = f"""
## {phase} (@{agent} - {now[:16]} KST)

**Done**: {args.done}

**Changed**: {args.change}

**Notes**:
{args.summary or "- (no additional notes)"}

---
"""
        with open(journal_path, 'a', encoding='utf-8') as f:
            f.write(journal_entry)
        print(f"✅ STEP LOG + Journal 기록 완료!")
        print(f"   Task: {task_id}")
        print(f"   Actor: @{agent}")
        print(f"   Next: {args.next}")
        print(f"   Journal: {journal_path}")
    else:
        print(f"✅ STEP LOG 기록 완료! (Journal 파일 미발견)")


def cmd_close(args):
    """Close task (DONE + Journal Final + Findings + Lock cleanup)."""
    task_id = args.task or get_focus()
    if not task_id:
        print("❌ Task를 지정하거나 Focus를 설정하세요.")
        return
    
    filepath = find_task_in_dir(get_active_dir(), task_id)
    if not filepath:
        print(f"❌ ACTIVE Task를 찾을 수 없습니다: {task_id}")
        return
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "### STEP LOG" not in content:
        print("❌ STEP LOG가 없습니다. 먼저 'ensemble log'로 기록하세요.")
        return
    
    now = get_kst_now()
    agent = args.agent or "CLI"
    hash_value = calculate_hash(WORKSPACE)
    header = read_yaml_header(filepath)
    mode = header.get('mode', '?')
    
    # Update task header
    update_yaml_header(filepath, {
        'status': 'DONE',
        'owner': agent,
        'next_expected': 'NONE',
        'completed_at': now,
        'hash': hash_value,
        'updated_at': now
    })
    
    # Add Final STEP LOG
    final_log = f"""
### STEP LOG (@{agent} - {now[:16]} KST)
- [DONE] ✅ Task 완료
- [CHANGE] (final)
- [RISK] 없음
- [NEXT] NONE - Task Complete
"""
    with open(filepath, 'a', encoding='utf-8') as f:
        f.write(final_log)
    
    # Add Final Journal section
    date = get_kst_date()
    journal_files = [f for f in os.listdir(get_journal_dir()) if date in f]
    if journal_files:
        journal_path = os.path.join(get_journal_dir(), journal_files[0])
        final_journal = f"""
## Final (DONE) - {now[:16]} KST

**Closed By**: @{agent}

**Status**: DONE

**Hash (SHA-256)**: `{hash_value}`

**Summary**:
{args.summary or "Task completed."}
"""
        with open(journal_path, 'a', encoding='utf-8') as f:
            f.write(final_journal)
    
    # Move to COMPLETED
    new_filename = rename_task_location(filepath, "COMPLETED")
    new_filepath = os.path.join(get_completed_dir(), new_filename)
    os.rename(filepath, new_filepath)
    
    # Clear focus
    set_focus(None, agent)
    
    # v3.6: Release all locks held by this agent
    released_locks = release_all_locks(agent)
    
    # v3.6: Auto-generate findings.md
    findings_file = None
    try:
        ensure_errors_dir()
        findings_file = generate_findings(task_id)
    except Exception:
        pass  # Non-critical, continue
    
    print(f"✅ Task 완료!")
    print(f"\n📋 Task Info")
    print(f"- ID: {task_id}")
    print(f"- Status: DONE")
    print(f"- Closed By: @{agent}")
    print(f"\n🔐 Hash: {hash_value[:16]}...")
    print(f"\n📁 Archived: .notes/COMPLETED/{new_filename}")
    
    # v3.6 additions
    if released_locks > 0:
        print(f"\n🔓 Released {released_locks} lock(s)")
    if findings_file:
        print(f"\n📊 Findings updated: {os.path.basename(findings_file)}")


def cmd_halt(args):
    """Halt task (ACTIVE → HALTED)."""
    task_id = args.task or get_focus()
    if not task_id:
        print("❌ Task를 지정하거나 Focus를 설정하세요.")
        return
    
    filepath = find_task_in_dir(get_active_dir(), task_id)
    if not filepath:
        print(f"❌ ACTIVE Task를 찾을 수 없습니다: {task_id}")
        return
    
    now = get_kst_now()
    agent = args.agent or "CLI"
    
    # Update header
    update_yaml_header(filepath, {
        'status': 'HALTED',
        'reason': args.reason,
        'blocker_description': args.desc,
        'halted_at': now,
        'halted_by': agent,
        'resume_condition': args.resume,
        'next_expected': 'NONE',
        'updated_at': now
    })
    
    # Add STEP LOG
    halt_log = f"""
### STEP LOG (@{agent} - {now[:16]} KST)
- [DONE] ⏸️ Task 중단
- [CHANGE] (halted)
- [RISK] HALTED - {args.reason}: {args.desc}
- [NEXT] HALTED - Resume: {args.resume}
"""
    with open(filepath, 'a', encoding='utf-8') as f:
        f.write(halt_log)
    
    # Journal
    date = get_kst_date()
    journal_files = [f for f in os.listdir(get_journal_dir()) if date in f]
    if journal_files:
        journal_path = os.path.join(get_journal_dir(), journal_files[0])
        halt_journal = f"""
## ⏸️ HALTED (@{agent} - {now[:16]} KST)

**Reason**: {args.reason}

**Description**: {args.desc}

**Resume Condition**: {args.resume}

---
"""
        with open(journal_path, 'a', encoding='utf-8') as f:
            f.write(halt_journal)
    
    # Move to HALTED
    new_filename = rename_task_location(filepath, "HALTED")
    new_filepath = os.path.join(get_halted_dir(), new_filename)
    os.rename(filepath, new_filepath)
    
    # Clear focus
    set_focus(None, agent)
    
    print(f"⏸️ Task 중단됨 (HALTED)")
    print(f"\n📋 Task Info")
    print(f"- ID: {task_id}")
    print(f"- Reason: {args.reason}")
    print(f"- Description: {args.desc}")
    print(f"\n🔄 Resume Condition")
    print(f"→ {args.resume}")
    print(f"\n📁 Location: .notes/HALTED/{new_filename}")


def cmd_dump(args):
    """Dump task (ACTIVE → DUMPED)."""
    task_id = args.task or get_focus()
    if not task_id:
        print("❌ Task를 지정하거나 Focus를 설정하세요.")
        return
    
    filepath = find_task_in_dir(get_active_dir(), task_id)
    if not filepath:
        print(f"❌ ACTIVE Task를 찾을 수 없습니다: {task_id}")
        return
    
    if not args.lesson:
        print("❌ --lesson은 필수입니다. 실패에서 배운 교훈을 기록하세요.")
        return
    
    now = get_kst_now()
    agent = args.agent or "CLI"
    
    # Update header
    update_yaml_header(filepath, {
        'status': 'DUMPED',
        'reason': args.reason,
        'dump_description': args.desc,
        'dumped_at': now,
        'dumped_by': agent,
        'lessons_learned': args.lesson,
        'next_expected': 'NONE',
        'updated_at': now
    })
    
    # Add STEP LOG
    dump_log = f"""
### STEP LOG (@{agent} - {now[:16]} KST)
- [DONE] 🗑️ Task 폐기
- [CHANGE] (dumped)
- [RISK] DUMPED - {args.reason}: {args.desc}
- [NEXT] DUMPED - Lesson: {args.lesson}
"""
    with open(filepath, 'a', encoding='utf-8') as f:
        f.write(dump_log)
    
    # Journal
    date = get_kst_date()
    journal_files = [f for f in os.listdir(get_journal_dir()) if date in f]
    if journal_files:
        journal_path = os.path.join(get_journal_dir(), journal_files[0])
        dump_journal = f"""
## 🗑️ DUMPED (@{agent} - {now[:16]} KST)

**Reason**: {args.reason}

**Description**: {args.desc}

**Lessons Learned**:
{args.lesson}

---
"""
        with open(journal_path, 'a', encoding='utf-8') as f:
            f.write(dump_journal)
    
    # Move to DUMPED
    new_filename = rename_task_location(filepath, "DUMPED")
    new_filepath = os.path.join(get_dumped_dir(), new_filename)
    os.rename(filepath, new_filepath)
    
    # Clear focus
    set_focus(None, agent)
    
    print(f"🗑️ Task 폐기됨 (DUMPED)")
    print(f"\n📋 Task Info")
    print(f"- ID: {task_id}")
    print(f"- Reason: {args.reason}")
    print(f"- Description: {args.desc}")
    print(f"\n📚 Lessons Learned")
    print(f"→ {args.lesson}")
    print(f"\n📁 Location: .notes/DUMPED/{new_filename}")


def cmd_status(args):
    """Show current status."""
    ensure_dirs()
    
    focus = get_focus()
    full_focus = get_full_focus()
    inbox = list_tasks(get_inbox_dir())
    active = list_tasks(get_active_dir())
    completed = list_tasks(get_completed_dir())[-5:]
    halted = list_tasks(get_halted_dir())
    dumped = list_tasks(get_dumped_dir())
    locks_data = read_locks()
    locks = locks_data.get('locks', {})
    
    print("┌─────────────────────────────────────────────────────────────────────┐")
    print("│  ENSEMBLE STATUS v3.7                                               │")
    print("├─────────────────────────────────────────────────────────────────────┤")
    
    if focus:
        filepath = find_task_in_dir(get_active_dir(), focus)
        if filepath:
            header = read_yaml_header(filepath)
            pattern = header.get('pattern', '?')
            mode = header.get('mode', '?')
            owner = header.get('owner', '?')
            next_exp = header.get('next_expected', '?')
            guard = header.get('state_guard', '?')
            case = header.get('case', '?')
            print(f"│  🎯 FOCUS: {focus[:50]}")
            print(f"│     Pattern: {pattern} | Mode: {mode} | Guard: {guard}")
            print(f"│     Owner: {owner} | Next: {next_exp} | Case: {case}")
        else:
            print(f"│  🎯 FOCUS: {focus} (file not found)")
    else:
        print("│  🎯 FOCUS: (none)")
    
    # Show parallel tasks if any
    parallel_tasks = full_focus.get('parallel_tasks', {})
    if parallel_tasks:
        print("├─────────────────────────────────────────────────────────────────────┤")
        print("│  🔀 PARALLEL TASKS:")
        for agent, info in parallel_tasks.items():
            task = info.get('task_id', 'none')[:25]
            partition = info.get('partition', [])
            print(f"│     {agent}: {task} → {partition}")
    
    print("├─────────────────────────────────────────────────────────────────────┤")
    print(f"│  📥 INBOX ({len(inbox)}):")
    for t, h in inbox[:3]:
        mode = h.get('mode', '?')
        case = h.get('case', '?')
        print(f"│     • {t[:45]} ({mode}, {case})")
    
    print("├─────────────────────────────────────────────────────────────────────┤")
    print(f"│  ⚡ ACTIVE ({len([a for a in active if a[0] != '_focus.md'])}):")
    for t, h in active:
        if t == "_focus.md":
            continue
        marker = " ← FOCUS" if focus and focus in t else ""
        status = h.get('status', '?')
        print(f"│     • {t[:45]} ({status}){marker}")
    
    print("├─────────────────────────────────────────────────────────────────────┤")
    print(f"│  ✅ COMPLETED (recent {len(completed)}):")
    for t, _ in completed:
        print(f"│     • {t[:50]}")
    
    if halted or args.halted:
        print("├─────────────────────────────────────────────────────────────────────┤")
        print(f"│  ⏸️ HALTED ({len(halted)}):")
        for t, h in halted:
            reason = h.get('reason', '?')
            print(f"│     • {t[:40]} ({reason})")
    
    if dumped or args.dumped:
        print("├─────────────────────────────────────────────────────────────────────┤")
        print(f"│  🗑️ DUMPED ({len(dumped)}):")
        for t, h in dumped:
            reason = h.get('reason', '?')
            print(f"│     • {t[:40]} ({reason})")
    
    # Show locks if --locks flag or if there are active locks
    if getattr(args, 'locks', False) or locks:
        print("├─────────────────────────────────────────────────────────────────────┤")
        print(f"│  🔒 LOCKS ({len(locks)}):")
        if locks:
            for f, info in list(locks.items())[:5]:
                agent = info.get('agent', '?')
                expired = " ⚠️" if is_lock_expired(info) else ""
                print(f"│     • {f[:35]} → {agent}{expired}")
            if len(locks) > 5:
                print(f"│     ... and {len(locks) - 5} more")
        else:
            print("│     (no active locks)")
    
    # v3.6: Show errors if --errors flag
    if getattr(args, 'errors', False):
        try:
            registry = read_errors_registry()
            errors = registry.get('errors', [])
            open_errors = [e for e in errors if e.get('status') == 'OPEN']
            resolved = [e for e in errors if e.get('status') == 'RESOLVED']
            
            print("├─────────────────────────────────────────────────────────────────────┤")
            print(f"│  🐛 ERRORS ({len(errors)} total, {len(open_errors)} open):")
            if open_errors:
                for e in open_errors[:3]:
                    print(f"│     🔴 {e.get('id')} - {e.get('type')} in {e.get('file', '?')[:25]}")
                if len(open_errors) > 3:
                    print(f"│     ... and {len(open_errors) - 3} more open")
            else:
                print("│     ✅ No open errors")
        except Exception:
            pass  # Error registry not initialized
    
    # v3.7: Show pending questions if --questions flag or if there are pending questions
    pending_questions = get_pending_questions()
    if getattr(args, 'questions', False) or pending_questions:
        show_questions_status()
    
    print("└─────────────────────────────────────────────────────────────────────┘")


def cmd_lock(args):
    """Manage file locks."""
    ensure_dirs()
    
    if args.action == "list":
        data = read_locks()
        locks = data.get('locks', {})
        if not locks:
            print("🔓 No active locks")
            return
        
        print("┌─────────────────────────────────────────────────────────────────────┐")
        print("│  🔒 ACTIVE LOCKS                                                    │")
        print("├─────────────────────────────────────────────────────────────────────┤")
        for file_path, info in locks.items():
            agent = info.get('agent', '?')
            task = info.get('task_id', '?')
            acquired = info.get('acquired_at', '?')[:16]
            expired = "⚠️ EXPIRED" if is_lock_expired(info) else ""
            print(f"│  {file_path[:40]}")
            print(f"│    → Agent: {agent} | Task: {task[:20]} {expired}")
        print("└─────────────────────────────────────────────────────────────────────┘")
    
    elif args.action == "acquire":
        if not args.file:
            print("❌ --file required for acquire")
            return
        task_id = get_focus() or "MANUAL"
        success, msg = acquire_lock(args.agent, args.file, task_id)
        if success:
            print(f"✅ {msg}")
        else:
            print(f"❌ {msg}")
    
    elif args.action == "release":
        if not args.file:
            print("❌ --file required for release")
            return
        if release_lock(args.agent, args.file):
            print(f"✅ Lock released: {args.file}")
        else:
            print(f"⚠️ No lock found for {args.file} by {args.agent}")
    
    elif args.action == "cleanup":
        count = cleanup_expired_locks()
        print(f"✅ Cleaned up {count} expired lock(s)")
    
    elif args.action == "release-all":
        count = release_all_locks(args.agent)
        print(f"✅ Released {count} lock(s) for {args.agent}")


def cmd_conflicts(args):
    """Check for conflicts in PAR mode."""
    ensure_dirs()
    
    focus = get_full_focus()
    parallel_tasks = focus.get('parallel_tasks', {})
    
    if not parallel_tasks:
        print("ℹ️ No parallel tasks active. Conflict check not applicable.")
        return
    
    print("┌─────────────────────────────────────────────────────────────────────┐")
    print("│  🔍 CONFLICT CHECK                                                  │")
    print("├─────────────────────────────────────────────────────────────────────┤")
    
    # Show parallel tasks
    print("│  📋 Active Parallel Tasks:")
    for agent, info in parallel_tasks.items():
        partition = info.get('partition', [])
        task = info.get('task_id', 'unknown')
        print(f"│    {agent}: {task[:30]}")
        print(f"│      Partition: {partition}")
    
    # Check for partition overlaps
    print("├─────────────────────────────────────────────────────────────────────┤")
    agents = list(parallel_tasks.keys())
    conflicts_found = []
    
    for i, agent1 in enumerate(agents):
        for agent2 in agents[i+1:]:
            p1 = set(parallel_tasks[agent1].get('partition', []))
            p2 = set(parallel_tasks[agent2].get('partition', []))
            overlap = p1 & p2
            if overlap:
                conflicts_found.append((agent1, agent2, overlap))
    
    if conflicts_found:
        print("│  ⚠️ PARTITION CONFLICTS DETECTED:")
        for a1, a2, overlap in conflicts_found:
            print(f"│    {a1} ↔ {a2}: {overlap}")
    else:
        print("│  ✅ No partition conflicts detected")
    
    # Show file locks
    data = read_locks()
    locks = data.get('locks', {})
    if locks:
        print("├─────────────────────────────────────────────────────────────────────┤")
        print(f"│  🔒 Active File Locks: {len(locks)}")
        for f, info in list(locks.items())[:5]:
            print(f"│    {f[:40]} → {info.get('agent', '?')}")
    
    print("└─────────────────────────────────────────────────────────────────────┘")


def cmd_error(args):
    """Manage error registry (v3.6)."""
    ensure_dirs()
    ensure_errors_dir()
    
    if args.action == "register":
        if not args.type or not args.file or not args.msg:
            print("❌ --type, --file, --msg are required for register")
            return
        
        task_id = get_focus()
        error_id, is_dup, related = register_error(
            error_type=args.type,
            file_path=args.file,
            message=args.msg,
            line=args.line,
            task_id=task_id,
            agent=args.agent
        )
        
        if is_dup:
            print(f"⚠️ 중복 에러 감지! 기존 에러와 병합됨:")
            print(f"   ID: {error_id}")
            print(f"   Related Tasks: {related}")
            if related:
                print(f"\n💡 힌트: 이 에러는 이전에 다음 태스크에서 발생했습니다:")
                for t in related[:3]:
                    print(f"   - {t}")
        else:
            print(f"✅ 에러 등록 완료!")
            print(f"   ID: {error_id}")
            print(f"   Type: {args.type}")
            print(f"   File: {args.file}")
            print(f"   Location: .notes/ERRORS/{error_id}.md")
    
    elif args.action == "search":
        results = search_errors(
            file_path=args.file,
            error_type=args.type,
            status=args.status,
            task_id=args.task
        )
        
        print("┌─────────────────────────────────────────────────────────────────────┐")
        print("│  🔍 ERROR SEARCH RESULTS                                            │")
        print("├─────────────────────────────────────────────────────────────────────┤")
        
        if not results:
            print("│  (no errors found matching criteria)")
        else:
            for e in results[:10]:
                status_icon = "🔴" if e.get('status') == 'OPEN' else "✅"
                print(f"│  {status_icon} {e.get('id')} - {e.get('type')}")
                print(f"│     File: {e.get('file', 'unknown')[:40]}")
                print(f"│     Occurrences: {e.get('occurrences', 1)} | Last: {e.get('last_seen', '?')[:16]}")
                if e.get('resolution'):
                    print(f"│     Resolution: {e.get('resolution')[:50]}...")
        
        print(f"├─────────────────────────────────────────────────────────────────────┤")
        print(f"│  Total: {len(results)} error(s)")
        print("└─────────────────────────────────────────────────────────────────────┘")
    
    elif args.action == "resolve":
        if not args.id or not args.resolution:
            print("❌ --id and --resolution are required for resolve")
            return
        
        if resolve_error(args.id, args.resolution, args.agent):
            print(f"✅ 에러 해결됨!")
            print(f"   ID: {args.id}")
            print(f"   Resolution: {args.resolution}")
            
            # Auto-update findings
            generate_findings()
            print(f"   findings.md 업데이트됨")
        else:
            print(f"❌ 에러를 찾을 수 없습니다: {args.id}")
    
    elif args.action == "list":
        registry = read_errors_registry()
        errors = registry.get('errors', [])
        
        open_errors = [e for e in errors if e.get('status') == 'OPEN']
        resolved = [e for e in errors if e.get('status') == 'RESOLVED']
        
        print("┌─────────────────────────────────────────────────────────────────────┐")
        print("│  📋 ERROR REGISTRY                                                  │")
        print("├─────────────────────────────────────────────────────────────────────┤")
        print(f"│  Total: {len(errors)} | Open: {len(open_errors)} | Resolved: {len(resolved)}")
        print("├─────────────────────────────────────────────────────────────────────┤")
        
        if open_errors:
            print("│  🔴 OPEN ERRORS:")
            for e in open_errors[:5]:
                print(f"│     • {e.get('id')} - {e.get('type')} in {e.get('file', '?')[:30]}")
        
        if resolved:
            print("│  ✅ RECENTLY RESOLVED:")
            for e in resolved[:3]:
                print(f"│     • {e.get('id')} - {e.get('resolution', 'N/A')[:40]}")
        
        print("└─────────────────────────────────────────────────────────────────────┘")
    
    elif args.action == "findings":
        findings_file = generate_findings()
        print(f"✅ findings.md 생성/업데이트 완료!")
        print(f"   Location: {findings_file}")


def cmd_sync(args):
    """Execute PAR mode sync point (v3.6)."""
    ensure_dirs()
    
    focus = get_full_focus()
    parallel_tasks = focus.get('parallel_tasks', {})
    
    if not parallel_tasks and not args.force:
        print("ℹ️ PAR 모드가 아닙니다. --force로 강제 실행 가능")
        return
    
    print("┌─────────────────────────────────────────────────────────────────────┐")
    print("│  🔄 SYNC POINT EXECUTION                                            │")
    print("├─────────────────────────────────────────────────────────────────────┤")
    
    # Pre-check
    sync_needed, conflicts = check_sync_needed()
    
    if conflicts:
        print("│  ⚠️ CONFLICTS DETECTED:")
        for c in conflicts[:5]:
            if c['type'] == 'PARTITION_OVERLAP':
                print(f"│     • Partition overlap: {c['agents']} on {c['overlap']}")
            elif c['type'] == 'PARTITION_NESTED':
                print(f"│     • Nested partitions: {c['agents']} - {c['paths']}")
            elif c['type'] == 'LOCK_IN_PARTITION':
                print(f"│     • Lock conflict: {c['file']} locked by {c['locked_by']}, in {c['partition_owner']}'s partition")
        print("├─────────────────────────────────────────────────────────────────────┤")
    
    # Execute sync
    report = execute_sync_point(args.agent)
    
    print("│  📋 ACTIONS TAKEN:")
    for action in report['actions']:
        print(f"│     • {action}")
    
    if conflicts:
        print("├─────────────────────────────────────────────────────────────────────┤")
        print("│  ⚠️ 충돌 해결 필요! 다음 에이전트들의 조율이 필요합니다:")
        involved_agents = set()
        for c in conflicts:
            if 'agents' in c:
                involved_agents.update(c['agents'])
            if 'locked_by' in c:
                involved_agents.add(c['locked_by'])
            if 'partition_owner' in c:
                involved_agents.add(c['partition_owner'])
        for agent in involved_agents:
            print(f"│     → @{agent}")
        print("│")
        print("│  권장 조치:")
        print("│     1. 각 에이전트 작업 일시 중지")
        print("│     2. 충돌 파티션 재협상")
        print("│     3. 락 정리: ensemble lock cleanup")
        print("│     4. 재시작: ensemble sync --force")
    else:
        print("├─────────────────────────────────────────────────────────────────────┤")
        print("│  ✅ Sync 완료! 충돌 없음.")
    
    print("└─────────────────────────────────────────────────────────────────────┘")


# ═══════════════════════════════════════════════════════════════════════════════
# v3.7 COMMAND HANDLERS
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_approve(args):
    """Approve a pending question for execution (v3.7)."""
    ensure_dirs()
    
    if args.question:
        success, message, exit_code = approve_question(args.question, args.dry_run)
    elif args.latest:
        success, message, exit_code = approve_latest(args.dry_run)
    else:
        print("❌ Specify --question <id> or --latest")
        return
    
    print(message)
    
    if not success and exit_code == 3:
        # Not owner - provide guidance
        print("\n💡 To approve, run `ensemble init-owner` to set up project ownership.")
    
    if exit_code == 2:
        # Need confirmation
        import sys
        sys.exit(2)


def cmd_init_owner(args):
    """Initialize project ownership (v3.7)."""
    ensure_dirs()
    
    existing = read_owner()
    if existing and not args.force:
        print("⚠️  OWNER.json already exists.")
        print(f"   Owner: {existing.get('owner', {}).get('username')}@{existing.get('owner', {}).get('hostname')}")
        print(f"   Initialized: {existing.get('initialized_at')}")
        print("\n   Use --force to reinitialize.")
        return
    
    owner_data = initialize_owner()
    
    print("┌─────────────────────────────────────────────────────────────────────┐")
    print("│  👤 PROJECT OWNER INITIALIZED                                       │")
    print("├─────────────────────────────────────────────────────────────────────┤")
    print(f"│  Username: {owner_data['owner'].get('username')}")
    print(f"│  Hostname: {owner_data['owner'].get('hostname')}")
    if owner_data['owner'].get('git_email'):
        print(f"│  Git Email: {owner_data['owner'].get('git_email')}")
    print(f"│  UID: {owner_data['owner'].get('uid')}")
    print("├─────────────────────────────────────────────────────────────────────┤")
    print("│  ✅ Only this user can run `ensemble approve` in this project.")
    print("└─────────────────────────────────────────────────────────────────────┘")


def show_questions_status():
    """Show pending questions summary for status command."""
    pending = get_pending_questions()
    if not pending:
        return
    
    print("├─────────────────────────────────────────────────────────────────────┤")
    print(f"│  ❓ PENDING QUESTIONS: {len(pending)}")
    
    # Group by status
    waiting_confirm = [q for q in pending if q.get('status') == 'auto_selected_waiting_confirm']
    truly_pending = [q for q in pending if q.get('status') == 'pending']
    stale = [q for q in pending if q.get('status') == 'stale']
    
    if waiting_confirm:
        print(f"│     ⏳ Awaiting approval: {len(waiting_confirm)}")
        for q in waiting_confirm[:3]:
            print(f"│        • {q['question_id']} [{q['kind']}] - auto-selected choice {q.get('selected_choice')}")
    
    if truly_pending:
        print(f"│     ⏸️  Awaiting answer: {len(truly_pending)}")
        for q in truly_pending[:3]:
            print(f"│        • {q['question_id']} [{q['kind']}]")
    
    if stale:
        print(f"│     ⚠️  Stale (>24h): {len(stale)}")
        for q in stale[:2]:
            print(f"│        • {q['question_id']} [{q['kind']}]")
        print(f"│        → Run: ensemble questions prune")
    
    # Highest priority
    highest = get_highest_priority_question()
    if highest:
        print(f"│     🔺 Highest priority: {highest['question_id']} ({highest['kind']})")
        print(f"│        Approve: ensemble approve --question {highest['question_id']}")


# ═══════════════════════════════════════════════════════════════════════════════
# v3.8 COMMAND HANDLERS
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_questions(args):
    """Manage question queue (v3.8)."""
    ensure_dirs()
    import json
    
    if args.action == "list":
        pending = get_pending_questions()
        
        print("┌─────────────────────────────────────────────────────────────────────┐")
        print("│  ❓ QUESTION QUEUE                                                  │")
        print("├─────────────────────────────────────────────────────────────────────┤")
        
        if not pending:
            print("│  (no pending questions)")
        else:
            # Check and mark stale
            now = datetime.utcnow()
            policy = read_workspace_policy()
            ttl_hours = policy.get('question_queue', {}).get('ttl_hours', 24)
            
            for q in pending:
                created = q.get('created_at', '')
                try:
                    created_dt = datetime.fromisoformat(created.replace('Z', '+00:00').replace('+09:00', ''))
                    age_hours = (now - created_dt).total_seconds() / 3600
                    stale_marker = " ⚠️STALE" if age_hours > ttl_hours else ""
                except:
                    stale_marker = ""
                
                status_icon = {
                    'pending': '⏸️',
                    'auto_selected_waiting_confirm': '⏳',
                    'stale': '⚠️',
                }.get(q.get('status'), '❓')
                
                print(f"│  {status_icon} {q['question_id']}{stale_marker}")
                print(f"│     Kind: {q['kind']}")
                print(f"│     Status: {q.get('status')}")
                print(f"│     Prompt: {q.get('prompt', '')[:50]}...")
                if q.get('snapshot'):
                    print(f"│     Snapshot: git={q['snapshot'].get('git_head', 'N/A')[:8]}")
                print("│")
        
        print(f"├─────────────────────────────────────────────────────────────────────┤")
        print(f"│  Total: {len(pending)} | TTL: {policy.get('question_queue', {}).get('ttl_hours', 24)}h")
        print("└─────────────────────────────────────────────────────────────────────┘")
    
    elif args.action == "prune":
        pending = get_pending_questions()
        if not pending:
            print("ℹ️ No pending questions to prune.")
            return
        
        now = datetime.utcnow()
        ttl_hours = args.stale_hours
        
        stale_questions = []
        for q in pending:
            created = q.get('created_at', '')
            try:
                created_dt = datetime.fromisoformat(created.replace('Z', '+00:00').replace('+09:00', ''))
                age_hours = (now - created_dt).total_seconds() / 3600
                if age_hours > ttl_hours:
                    stale_questions.append(q)
            except:
                pass
        
        if not stale_questions:
            print(f"ℹ️ No questions older than {ttl_hours}h found.")
            return
        
        print(f"⚠️  Found {len(stale_questions)} stale question(s) (>{ttl_hours}h):")
        for q in stale_questions[:5]:
            print(f"   • {q['question_id']} [{q['kind']}]")
        
        if not args.force:
            print("\nUse --force to actually remove them.")
            return
        
        # Actually prune
        questions_file = Path(WORKSPACE) / ".notes" / "ACTIVE" / "_pending_questions.json"
        if questions_file.exists():
            data = json.loads(questions_file.read_text(encoding='utf-8'))
            stale_ids = {q['question_id'] for q in stale_questions}
            data['questions'] = [q for q in data.get('questions', []) if q['question_id'] not in stale_ids]
            atomic_write(questions_file, json.dumps(data, indent=2, ensure_ascii=False))
            
            # Log event
            log_event(
                Path(WORKSPACE) / ".notes" / "ACTIVE" / "_question_events.log",
                'QUESTIONS_PRUNED',
                {'pruned_count': len(stale_questions), 'pruned_ids': list(stale_ids)[:10]}
            )
        
        print(f"✅ Pruned {len(stale_questions)} stale question(s).")
    
    elif args.action == "snapshot":
        pending = get_pending_questions()
        if not pending:
            print("ℹ️ No pending questions.")
            return
        
        print("┌─────────────────────────────────────────────────────────────────────┐")
        print("│  📸 QUESTION SNAPSHOTS                                              │")
        print("├─────────────────────────────────────────────────────────────────────┤")
        
        for q in pending[:5]:
            snapshot = q.get('snapshot', {})
            print(f"│  {q['question_id']}")
            print(f"│     git_head: {snapshot.get('git_head', 'N/A')}")
            print(f"│     policy_hash: {snapshot.get('policy_hash', 'N/A')[:16] if snapshot.get('policy_hash') else 'N/A'}...")
            print(f"│     target_paths: {snapshot.get('target_paths', [])[:3]}")
            print("│")
        
        print("└─────────────────────────────────────────────────────────────────────┘")


def cmd_metrics(args):
    """View/manage metrics (v3.8)."""
    ensure_dirs()
    import json
    
    metrics_file = Path(WORKSPACE) / ".notes" / "ACTIVE" / "_metrics.json"
    
    if args.action == "show":
        if not metrics_file.exists():
            print("ℹ️ No metrics collected yet.")
            print("   Metrics will be collected automatically during operation.")
            return
        
        try:
            metrics = json.loads(metrics_file.read_text(encoding='utf-8'))
        except:
            metrics = {}
        
        if args.format == "json":
            print(json.dumps(metrics, indent=2, ensure_ascii=False))
            return
        
        print("┌─────────────────────────────────────────────────────────────────────┐")
        print("│  📊 METRICS (v3.8)                                                  │")
        print("├─────────────────────────────────────────────────────────────────────┤")
        
        total_ask = metrics.get('ask_count', 0)
        total_auto = metrics.get('auto_count', 0)
        stale_count = metrics.get('stale_count', 0)
        cache_hits = metrics.get('cache_hits', 0)
        cache_misses = metrics.get('cache_misses', 0)
        
        print(f"│  📝 Total Questions Asked: {total_ask}")
        print(f"│  ⚡ Auto-Approved: {total_auto}")
        print(f"│  ⚠️  Stale Questions: {stale_count}")
        
        if cache_hits + cache_misses > 0:
            hit_rate = cache_hits / (cache_hits + cache_misses) * 100
            print(f"│  💾 Cache Hit Rate: {hit_rate:.1f}%")
        
        print("├─────────────────────────────────────────────────────────────────────┤")
        
        by_kind = metrics.get('by_kind', {})
        if by_kind:
            print("│  📋 By Kind:")
            for kind, count in sorted(by_kind.items(), key=lambda x: -x[1])[:5]:
                print(f"│     • {kind}: {count}")
        
        matlab_runs = metrics.get('matlab_runs', 0)
        matlab_errors = metrics.get('matlab_errors', 0)
        if matlab_runs > 0:
            print("├─────────────────────────────────────────────────────────────────────┤")
            print(f"│  🔬 MATLAB Runs: {matlab_runs}")
            print(f"│     Errors: {matlab_errors}")
            if matlab_runs > 0:
                print(f"│     Success Rate: {(matlab_runs - matlab_errors) / matlab_runs * 100:.1f}%")
        
        first_event = metrics.get('first_event')
        last_event = metrics.get('last_event')
        if first_event and last_event:
            print("├─────────────────────────────────────────────────────────────────────┤")
            print(f"│  📅 First Event: {first_event[:16]}")
            print(f"│  📅 Last Event: {last_event[:16]}")
        
        print("└─────────────────────────────────────────────────────────────────────┘")
        
        if total_ask >= 10:
            ask_ratio = total_ask / max(1, total_ask + total_auto)
            if ask_ratio > 0.7:
                print("\n💡 Hint: High ASK ratio. Consider enabling approval cache after 1 week.")
    
    elif args.action == "reset":
        if metrics_file.exists():
            metrics_file.unlink()
            print("✅ Metrics reset.")
        else:
            print("ℹ️ No metrics to reset.")
    
    elif args.action == "export":
        if not metrics_file.exists():
            print("ℹ️ No metrics to export.")
            return
        
        metrics = json.loads(metrics_file.read_text(encoding='utf-8'))
        export_file = Path(WORKSPACE) / ".notes" / f"metrics_export_{get_timestamp().replace(':', '-')}.json"
        export_file.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f"✅ Metrics exported to: {export_file}")


def read_workspace_policy():
    """Read workspace policy or return defaults (v3.8)."""
    import json
    policy_file = Path(WORKSPACE) / ".notes" / "WORKSPACE_POLICY.json"
    if policy_file.exists():
        try:
            return json.loads(policy_file.read_text(encoding='utf-8'))
        except:
            pass
    return DEFAULT_WORKSPACE_POLICY


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    global WORKSPACE
    
    parser = argparse.ArgumentParser(
        description="Ensemble CLI Tool v3.8",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument("--workspace", "-w",
        help="Workspace directory",
        default=os.environ.get("ENSEMBLE_WORKSPACE", os.getcwd()))
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # new
    p_new = subparsers.add_parser("new", help="Create new task")
    p_new.add_argument("--mode", choices=MODES, default="GCC")
    p_new.add_argument("--case", choices=CASE_NAMES + ["1", "2", "3", "4"], default="NEW_BUILD",
                       help="Task type: NEW_BUILD, MODIFY, OTHER, DEBUG (or legacy 1-4)")
    p_new.add_argument("--title", help="Task title")
    p_new.add_argument("--pattern", choices=PATTERNS)
    p_new.add_argument("--guard", choices=STATE_GUARDS)
    p_new.add_argument("--executor", help="executor for XXX mode")
    p_new.add_argument("--agent", help="agent for SOLO mode")
    p_new.add_argument("--force", "-f", action="store_true", help="Skip duplicate check")
    
    # start
    p_start = subparsers.add_parser("start", help="Start task")
    p_start.add_argument("--task", help="Task ID")
    p_start.add_argument("--agent", default="CLI")
    
    # log
    p_log = subparsers.add_parser("log", help="Record STEP LOG + Journal")
    p_log.add_argument("--done", required=True)
    p_log.add_argument("--change", required=True)
    p_log.add_argument("--risk")
    p_log.add_argument("--next", required=True)
    p_log.add_argument("--agent", default="AGENT")
    p_log.add_argument("--phase")
    p_log.add_argument("--summary")
    
    # close
    p_close = subparsers.add_parser("close", help="Close task (DONE)")
    p_close.add_argument("--task")
    p_close.add_argument("--agent", default="CLI")
    p_close.add_argument("--summary")
    
    # halt
    p_halt = subparsers.add_parser("halt", help="Halt task")
    p_halt.add_argument("--task")
    p_halt.add_argument("--reason", choices=HALT_REASONS, required=True)
    p_halt.add_argument("--desc", required=True, help="Description")
    p_halt.add_argument("--resume", required=True, help="Resume condition")
    p_halt.add_argument("--agent", default="CLI")
    
    # dump
    p_dump = subparsers.add_parser("dump", help="Dump task")
    p_dump.add_argument("--task")
    p_dump.add_argument("--reason", choices=DUMP_REASONS, required=True)
    p_dump.add_argument("--desc", required=True, help="Description")
    p_dump.add_argument("--lesson", required=True, help="Lessons learned")
    p_dump.add_argument("--agent", default="CLI")
    
    # status
    p_status = subparsers.add_parser("status", help="Show status")
    p_status.add_argument("--halted", action="store_true")
    p_status.add_argument("--dumped", action="store_true")
    p_status.add_argument("--locks", action="store_true", help="Show file locks")
    p_status.add_argument("--errors", action="store_true", help="Show error summary")
    p_status.add_argument("--questions", action="store_true", help="Show pending questions (v3.7)")
    
    # lock (v3.5)
    p_lock = subparsers.add_parser("lock", help="Manage file locks")
    p_lock.add_argument("action", choices=["list", "acquire", "release", "cleanup", "release-all"],
                        help="Lock action")
    p_lock.add_argument("--file", "-f", help="File path to lock/release")
    p_lock.add_argument("--agent", default="CLI", help="Agent name")
    
    # conflicts (v3.5)
    p_conflicts = subparsers.add_parser("conflicts", help="Check for PAR mode conflicts")
    
    # error (v3.6)
    p_error = subparsers.add_parser("error", help="Manage error registry (v3.6)")
    p_error.add_argument("action", choices=["register", "search", "resolve", "list", "findings"],
                         help="Error action")
    p_error.add_argument("--type", "-t", choices=ERROR_TYPES, help="Error type")
    p_error.add_argument("--file", "-f", help="File path where error occurred")
    p_error.add_argument("--msg", "-m", help="Error message")
    p_error.add_argument("--line", "-l", type=int, help="Line number")
    p_error.add_argument("--id", help="Error ID (for resolve)")
    p_error.add_argument("--resolution", "-r", help="Resolution description (for resolve)")
    p_error.add_argument("--status", choices=["OPEN", "RESOLVED"], help="Filter by status")
    p_error.add_argument("--task", help="Filter by related task")
    p_error.add_argument("--agent", default="CLI", help="Agent name")
    
    # sync (v3.6)
    p_sync = subparsers.add_parser("sync", help="Execute PAR mode sync point (v3.6)")
    p_sync.add_argument("--force", action="store_true", help="Force sync even without PAR mode")
    p_sync.add_argument("--agent", default="CLI", help="Agent name")
    
    # approve (v3.7, extended in v3.8)
    p_approve = subparsers.add_parser("approve", help="Approve pending question for execution (v3.7)")
    p_approve.add_argument("--question", "-q", help="Question ID to approve")
    p_approve.add_argument("--latest", action="store_true", help="Approve highest priority pending question")
    p_approve.add_argument("--dry-run", action="store_true", help="Validate without executing")
    p_approve.add_argument("--kind", "-k", choices=QUESTION_KINDS, help="Filter by question kind (v3.8)")
    
    # init-owner (v3.7)
    p_init_owner = subparsers.add_parser("init-owner", help="Initialize project ownership (v3.7)")
    p_init_owner.add_argument("--force", action="store_true", help="Force reinitialize even if exists")
    
    # questions (v3.8)
    p_questions = subparsers.add_parser("questions", help="Manage question queue (v3.8)")
    p_questions.add_argument("action", choices=["list", "prune", "snapshot"],
                              help="Question queue action")
    p_questions.add_argument("--stale-hours", type=int, default=24, help="Hours before marking stale (default: 24)")
    p_questions.add_argument("--force", action="store_true", help="Force prune without confirmation")
    
    # metrics (v3.8)
    p_metrics = subparsers.add_parser("metrics", help="View/manage metrics (v3.8)")
    p_metrics.add_argument("action", choices=["show", "reset", "export"],
                           help="Metrics action")
    p_metrics.add_argument("--format", choices=["text", "json"], default="text", help="Output format")
    
    args = parser.parse_args()
    WORKSPACE = os.path.abspath(args.workspace)
    
    commands = {
        "new": cmd_new,
        "start": cmd_start,
        "log": cmd_log,
        "close": cmd_close,
        "halt": cmd_halt,
        "dump": cmd_dump,
        "status": cmd_status,
        "lock": cmd_lock,
        "conflicts": cmd_conflicts,
        "error": cmd_error,
        "sync": cmd_sync,
        "approve": cmd_approve,
        "init-owner": cmd_init_owner,
        "questions": cmd_questions,  # v3.8
        "metrics": cmd_metrics,      # v3.8
    }
    
    if args.command in commands:
        commands[args.command](args)
    else:
        parser.print_help()
    
    # v3.6.4: Print stale lock warning if any occurred
    print_stale_warning_if_any()


if __name__ == "__main__":
    main()
