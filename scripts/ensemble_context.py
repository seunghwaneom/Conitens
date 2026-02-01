#!/usr/bin/env python3
"""
Ensemble v3.9 Context Module
=============================
Generate and maintain LATEST_CONTEXT.md for human and agent consumption.

Uses 2-rail format:
1. Human skim: 30-second readable summary
2. Agent inject: Machine-parseable context for prompts
"""

import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from collections import defaultdict

# ═══════════════════════════════════════════════════════════════════════════════
# CONTEXT CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

CONTEXT_FILE = "LATEST_CONTEXT.md"
MAX_RECENT_CHANGES = 10
MAX_CRITICAL_ISSUES = 5
MAX_HOTSPOTS = 5
MAX_ACTIONS = 3


def get_active_tasks(workspace: str) -> List[Dict]:
    """Get list of active tasks with details.
    
    Returns:
        List of task info dictionaries
    """
    notes_dir = Path(workspace) / ".notes"
    active_dir = notes_dir / "ACTIVE"
    
    tasks = []
    if not active_dir.exists():
        return tasks
    
    for item in active_dir.iterdir():
        if not item.is_dir() or item.name.startswith('_'):
            continue
        
        task_info = {
            "task_id": item.name,
            "title": None,
            "status": "ACTIVE",
            "priority": "normal",
        }
        
        # Try to read task.md
        task_md = item / "task.md"
        if task_md.exists():
            try:
                content = task_md.read_text(encoding='utf-8', errors='replace')
                # Extract title from frontmatter or first heading
                if 'title:' in content:
                    for line in content.split('\n'):
                        if line.strip().startswith('title:'):
                            task_info['title'] = line.split(':', 1)[1].strip()
                            break
            except:
                pass
        
        tasks.append(task_info)
    
    return tasks


def get_error_summary(workspace: str) -> Dict:
    """Get summary of errors from ERRORS folder.
    
    Returns:
        Error summary dictionary
    """
    notes_dir = Path(workspace) / ".notes"
    errors_dir = notes_dir / "ERRORS"
    
    summary = {
        "total": 0,
        "by_type": defaultdict(int),
        "recent": [],
    }
    
    if not errors_dir.exists():
        return summary
    
    # Count error tasks
    for item in errors_dir.iterdir():
        if item.is_dir() and not item.name.startswith('_'):
            summary["total"] += 1
            
            # Try to categorize
            name_lower = item.name.lower()
            if 'import' in name_lower or 'module' in name_lower:
                summary["by_type"]["import"] += 1
            elif 'path' in name_lower or 'file' in name_lower:
                summary["by_type"]["path"] += 1
            elif 'memory' in name_lower or 'oom' in name_lower:
                summary["by_type"]["memory"] += 1
            else:
                summary["by_type"]["other"] += 1
            
            if len(summary["recent"]) < 3:
                summary["recent"].append(item.name)
    
    return summary


def get_halted_summary(workspace: str) -> Dict:
    """Get summary of halted tasks.
    
    Returns:
        Halted summary dictionary
    """
    notes_dir = Path(workspace) / ".notes"
    halted_dir = notes_dir / "HALTED"
    
    summary = {
        "total": 0,
        "technical": 0,
        "external": 0,
        "recent": [],
    }
    
    TECHNICAL_KEYWORDS = ["ssh", "auth", "permission", "path", "module", "config", "error"]
    
    if not halted_dir.exists():
        return summary
    
    for item in halted_dir.iterdir():
        if item.is_dir() and not item.name.startswith('_'):
            summary["total"] += 1
            
            # Categorize
            name_lower = item.name.lower()
            is_technical = any(kw in name_lower for kw in TECHNICAL_KEYWORDS)
            
            if is_technical:
                summary["technical"] += 1
            else:
                summary["external"] += 1
            
            if len(summary["recent"]) < 3:
                summary["recent"].append({
                    "task": item.name,
                    "type": "technical" if is_technical else "external",
                })
    
    return summary


def get_recent_changes(workspace: str, days: int = 7) -> List[Dict]:
    """Get recently modified files in workspace.
    
    Returns:
        List of recent change info
    """
    changes = []
    workspace_dir = Path(workspace) / "workspace"
    
    if not workspace_dir.exists():
        return changes
    
    cutoff = datetime.now().timestamp() - (days * 86400)
    
    for item in workspace_dir.rglob("*"):
        if item.is_file():
            try:
                mtime = item.stat().st_mtime
                if mtime >= cutoff:
                    changes.append({
                        "file": str(item.relative_to(workspace_dir)),
                        "mtime": mtime,
                        "mtime_str": datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M"),
                    })
            except:
                pass
    
    # Sort by mtime (most recent first)
    changes.sort(key=lambda x: -x["mtime"])
    return changes[:MAX_RECENT_CHANGES]


def get_blocked_paths(workspace: str) -> List[str]:
    """Get list of blocked paths from workspace policy.
    
    Returns:
        List of blocked path patterns
    """
    policy_file = Path(workspace) / ".notes" / "WORKSPACE_POLICY.json"
    
    if not policy_file.exists():
        return ["/original/", "/data/raw/"]  # Defaults
    
    try:
        policy = json.loads(policy_file.read_text(encoding='utf-8'))
        deny = policy.get("deny", {})
        return deny.get("absolute_paths", [])
    except:
        return ["/original/", "/data/raw/"]


def get_allowed_paths(workspace: str) -> List[str]:
    """Get list of allowed paths from workspace policy.
    
    Returns:
        List of allowed path patterns
    """
    return ["workspace/TASK-*/", ".notes/**"]


def get_pending_questions_summary(workspace: str) -> Dict:
    """Get summary of pending questions.
    
    Returns:
        Questions summary dictionary
    """
    questions_file = Path(workspace) / ".notes" / "ACTIVE" / "_pending_questions.json"
    
    summary = {
        "total": 0,
        "by_kind": defaultdict(int),
    }
    
    if not questions_file.exists():
        return summary
    
    try:
        data = json.loads(questions_file.read_text(encoding='utf-8'))
        questions = data.get("questions", [])
        
        for q in questions:
            if q.get("status") == "pending":
                summary["total"] += 1
                summary["by_kind"][q.get("kind", "unknown")] += 1
    except:
        pass
    
    return summary


def generate_context(workspace: str) -> Dict:
    """Generate complete context data.
    
    Returns:
        Context dictionary
    """
    return {
        "generated_at": datetime.now().isoformat(),
        "active_tasks": get_active_tasks(workspace),
        "errors": get_error_summary(workspace),
        "halted": get_halted_summary(workspace),
        "recent_changes": get_recent_changes(workspace),
        "blocked_paths": get_blocked_paths(workspace),
        "allowed_paths": get_allowed_paths(workspace),
        "pending_questions": get_pending_questions_summary(workspace),
    }


def format_context_md(context: Dict) -> str:
    """Format context as Markdown with 2-rail structure.
    
    Args:
        context: Context dictionary
        
    Returns:
        Markdown string
    """
    lines = []
    
    lines.append("# LATEST CONTEXT")
    lines.append(f"> Auto-generated: {context['generated_at']}")
    lines.append("")
    lines.append("---")
    lines.append("")
    
    # ═══════════════════════════════════════════════════════════════════════════════
    # RAIL 1: Human Skim
    # ═══════════════════════════════════════════════════════════════════════════════
    
    lines.append("## 🔴 Human Skim (30초 읽기)")
    lines.append("")
    
    # Critical Issues
    lines.append("### Critical Issues")
    lines.append("")
    
    errors = context.get("errors", {})
    halted = context.get("halted", {})
    
    has_issues = False
    
    if errors.get("total", 0) > 0:
        has_issues = True
        for err in errors.get("recent", [])[:3]:
            lines.append(f"- ❌ {err} (ERRORS)")
    
    if halted.get("total", 0) > 0:
        for h in halted.get("recent", [])[:2]:
            icon = "⚠️" if h["type"] == "technical" else "⏸️"
            lines.append(f"- {icon} {h['task']} (HALTED - {h['type']})")
            has_issues = True
    
    if not has_issues:
        lines.append("- ✅ No critical issues")
    
    lines.append("")
    
    # Active Tasks
    lines.append("### Active Tasks")
    lines.append("")
    
    active_tasks = context.get("active_tasks", [])
    if active_tasks:
        for task in active_tasks[:5]:
            title = task.get("title", task["task_id"])
            lines.append(f"- 📋 {title}")
    else:
        lines.append("- (No active tasks)")
    
    lines.append("")
    
    # Recent Changes
    lines.append("### Recent Changes")
    lines.append("")
    
    recent = context.get("recent_changes", [])
    if recent:
        for change in recent[:5]:
            lines.append(f"- `{change['file']}` ({change['mtime_str']})")
    else:
        lines.append("- (No recent changes)")
    
    lines.append("")
    
    # Next Actions
    lines.append("### Next Actions")
    lines.append("")
    
    questions = context.get("pending_questions", {})
    if questions.get("total", 0) > 0:
        lines.append(f"1. ⚠️ {questions['total']}개의 대기 중인 질문 처리")
    
    if errors.get("total", 0) > 0:
        lines.append(f"2. 🔧 ERRORS 폴더 {errors['total']}개 태스크 검토")
    
    if halted.get("technical", 0) > 0:
        lines.append(f"3. 🔍 기술적 HALTED {halted['technical']}개 원인 분석")
    
    if not questions.get("total") and not errors.get("total") and not halted.get("technical"):
        lines.append("1. 현재 작업 계속 진행")
    
    lines.append("")
    lines.append("---")
    lines.append("")
    
    # ═══════════════════════════════════════════════════════════════════════════════
    # RAIL 2: Agent Inject
    # ═══════════════════════════════════════════════════════════════════════════════
    
    lines.append("## 🤖 Agent Inject (프롬프트용)")
    lines.append("")
    lines.append("```xml")
    lines.append("<context>")
    
    # Active tasks
    active_ids = [t["task_id"] for t in active_tasks[:5]]
    lines.append(f"ACTIVE_TASKS: {', '.join(active_ids) if active_ids else 'none'}")
    
    # Errors
    error_summary = f"{errors.get('total', 0)}"
    if errors.get("by_type"):
        type_str = ", ".join(f"{k}:{v}" for k, v in errors["by_type"].items())
        error_summary += f" ({type_str})"
    lines.append(f"ERRORS: {error_summary}")
    
    # Halted
    halted_summary = f"{halted.get('total', 0)}"
    if halted.get("technical") or halted.get("external"):
        halted_summary += f" (technical:{halted.get('technical', 0)}, external:{halted.get('external', 0)})"
    lines.append(f"HALTED: {halted_summary}")
    
    # Recent changes
    recent_files = [c["file"] for c in recent[:5]]
    lines.append(f"RECENT_CHANGES: {', '.join(recent_files) if recent_files else 'none'}")
    
    # Paths
    blocked = context.get("blocked_paths", [])
    lines.append(f"BLOCKED_PATHS: {', '.join(blocked) if blocked else 'none'}")
    
    allowed = context.get("allowed_paths", [])
    lines.append(f"ALLOWED_PATHS: {', '.join(allowed) if allowed else 'workspace/TASK-*/'}")
    
    # Pending questions
    lines.append(f"PENDING_QUESTIONS: {questions.get('total', 0)}")
    
    lines.append("</context>")
    lines.append("```")
    lines.append("")
    lines.append("---")
    lines.append("*Auto-generated by Ensemble v3.9 Context Module*")
    
    return "\n".join(lines)


def update_context(workspace: str) -> Path:
    """Update LATEST_CONTEXT.md file.
    
    Returns:
        Path to updated context file
    """
    context = generate_context(workspace)
    md_content = format_context_md(context)
    
    context_file = Path(workspace) / ".notes" / CONTEXT_FILE
    context_file.write_text(md_content, encoding='utf-8')
    
    return context_file


def show_context(workspace: str) -> str:
    """Generate context for display without saving.
    
    Returns:
        Formatted context string
    """
    context = generate_context(workspace)
    
    lines = []
    lines.append("┌─────────────────────────────────────────────────────────────────────┐")
    lines.append("│  📍 LATEST CONTEXT")
    lines.append("├─────────────────────────────────────────────────────────────────────┤")
    
    # Active tasks
    active = context.get("active_tasks", [])
    lines.append(f"│  Active Tasks: {len(active)}")
    for task in active[:3]:
        lines.append(f"│    • {task['task_id']}")
    
    # Errors
    errors = context.get("errors", {})
    if errors.get("total", 0) > 0:
        lines.append(f"│  ❌ Errors: {errors['total']}")
    
    # Halted
    halted = context.get("halted", {})
    if halted.get("total", 0) > 0:
        lines.append(f"│  ⏸️ Halted: {halted['total']} (technical: {halted.get('technical', 0)})")
    
    # Recent changes
    recent = context.get("recent_changes", [])
    if recent:
        lines.append(f"│  📝 Recent Changes: {len(recent)}")
        for change in recent[:3]:
            lines.append(f"│    • {change['file']}")
    
    # Pending questions
    questions = context.get("pending_questions", {})
    if questions.get("total", 0) > 0:
        lines.append(f"│  ❓ Pending Questions: {questions['total']}")
    
    lines.append("└─────────────────────────────────────────────────────────────────────┘")
    
    return "\n".join(lines)


# Export for CLI integration
__all__ = [
    "generate_context",
    "format_context_md",
    "update_context",
    "show_context",
    "CONTEXT_FILE",
]
