#!/usr/bin/env python3
"""
Ensemble v3.9 Weekly Self-Improvement Module
=============================================
Automatic weekly analysis and improvement suggestions.

Uses state folders (ERRORS/ACTIVE/HALTED/COMPLETED) as priority engine.
"""

import os
import re
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from collections import defaultdict

# ═══════════════════════════════════════════════════════════════════════════════
# STATE WEIGHTS (Priority Engine)
# ═══════════════════════════════════════════════════════════════════════════════

STATE_WEIGHTS = {
    "ERRORS": 5,
    "ACTIVE": 3,
    "HALTED": 2,  # Upgraded to 3 if technical keywords found
    "COMPLETED": 1,
    "DUMPED": 0,  # Excluded by default
    "INBOX": 1,
}

# Keywords that upgrade HALTED to "technical" (weight 3)
TECHNICAL_HALTED_KEYWORDS = [
    "ssh", "auth", "permission", "path", "module", "env",
    "scheduler", "dependency", "config", "error", "fail",
    "timeout", "memory", "disk", "network", "license",
]

# Maximum items per category in weekly report
MAX_ERRORS_TOP = 2
MAX_ACTIVE_TOP = 1
MAX_COMPLETED_TEMPLATE = 1
MAX_TOTAL_ACTIONS = 3

# Sensitive path patterns (must be filtered)
SENSITIVE_PATTERNS = [
    r'/home/\w+/',
    r'/Users/\w+/',
    r'C:\\Users\\\w+\\',
    r'D:\\Users\\\w+\\',
    r'sk-[a-zA-Z0-9]+',      # API keys
    r'ghp_[a-zA-Z0-9]+',     # GitHub tokens
    r'token[=:]\s*[a-zA-Z0-9]+',
]


def mask_sensitive_data(text: str) -> Tuple[str, bool]:
    """Mask sensitive data in text.
    
    Returns:
        Tuple of (masked_text, had_sensitive)
    """
    masked = text
    had_sensitive = False
    
    for pattern in SENSITIVE_PATTERNS:
        if re.search(pattern, masked, re.IGNORECASE):
            had_sensitive = True
            masked = re.sub(pattern, '[REDACTED]', masked, flags=re.IGNORECASE)
    
    return masked, had_sensitive


def scan_sensitive(text: str) -> bool:
    """Check if text contains sensitive data.
    
    Returns:
        True if sensitive data found
    """
    for pattern in SENSITIVE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def get_task_info(task_dir: Path) -> Optional[Dict]:
    """Extract task information from task directory.
    
    Returns:
        Task info dictionary or None
    """
    task_md = task_dir / "task.md"
    if not task_md.exists():
        # Try to find any .md file
        md_files = list(task_dir.glob("*.md"))
        if md_files:
            task_md = md_files[0]
        else:
            return None
    
    try:
        content = task_md.read_text(encoding='utf-8', errors='replace')
    except:
        return None
    
    # Extract YAML frontmatter
    info = {
        "task_id": task_dir.name,
        "title": None,
        "status": None,
        "created": None,
        "tags": [],
        "summary": None,
    }
    
    # Parse frontmatter
    match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if match:
        for line in match.group(1).split('\n'):
            if ':' in line:
                key, value = line.split(':', 1)
                key = key.strip().lower()
                value = value.strip()
                
                if key == 'title':
                    info['title'] = value
                elif key == 'status':
                    info['status'] = value
                elif key == 'created':
                    info['created'] = value
                elif key == 'tags':
                    info['tags'] = [t.strip() for t in value.split(',')]
    
    # Extract first paragraph as summary
    body = re.sub(r'^---\n.*?\n---\n?', '', content, flags=re.DOTALL)
    paragraphs = [p.strip() for p in body.split('\n\n') if p.strip()]
    if paragraphs:
        info['summary'] = paragraphs[0][:200]
    
    # Get modification time
    try:
        info['mtime'] = task_md.stat().st_mtime
    except:
        info['mtime'] = 0
    
    return info


def collect_tasks_by_state(workspace: str, days: int = 7) -> Dict[str, List[Dict]]:
    """Collect tasks grouped by state folder.
    
    Args:
        workspace: Workspace root
        days: Only include tasks modified in last N days
        
    Returns:
        Dictionary mapping state -> list of task info
    """
    notes_dir = Path(workspace) / ".notes"
    cutoff_time = (datetime.now() - timedelta(days=days)).timestamp()
    
    tasks_by_state = defaultdict(list)
    
    for state in STATE_WEIGHTS.keys():
        state_dir = notes_dir / state
        if not state_dir.exists():
            continue
        
        for item in state_dir.iterdir():
            if not item.is_dir():
                continue
            if item.name.startswith('_'):
                continue
            
            task_info = get_task_info(item)
            if task_info and task_info.get('mtime', 0) >= cutoff_time:
                task_info['state'] = state
                tasks_by_state[state].append(task_info)
    
    # Sort by mtime (most recent first)
    for state in tasks_by_state:
        tasks_by_state[state].sort(key=lambda x: -x.get('mtime', 0))
    
    return dict(tasks_by_state)


def calculate_task_score(task: Dict, state: str) -> float:
    """Calculate priority score for a task.
    
    Args:
        task: Task info dictionary
        state: State folder name
        
    Returns:
        Priority score
    """
    base_weight = STATE_WEIGHTS.get(state, 1)
    
    # Check for technical keywords in HALTED
    if state == "HALTED":
        content = (task.get('summary', '') + ' ' + task.get('title', '')).lower()
        for keyword in TECHNICAL_HALTED_KEYWORDS:
            if keyword in content:
                base_weight = 3  # Upgrade
                break
    
    return base_weight


def generate_improvement_suggestions(
    tasks_by_state: Dict[str, List[Dict]],
    workspace: str,
) -> List[Dict]:
    """Generate improvement suggestions based on tasks.
    
    Args:
        tasks_by_state: Tasks grouped by state
        workspace: Workspace root
        
    Returns:
        List of improvement suggestions
    """
    suggestions = []
    
    # From ERRORS: Failure prevention
    for task in tasks_by_state.get('ERRORS', [])[:MAX_ERRORS_TOP]:
        summary = task.get('summary', '')
        summary, had_sensitive = mask_sensitive_data(summary)
        
        if had_sensitive:
            continue  # Skip if sensitive data
        
        suggestions.append({
            "source": f"ERRORS/{task['task_id']}",
            "type": "failure_prevention",
            "priority": calculate_task_score(task, 'ERRORS'),
            "description": f"재발 방지: {task.get('title', 'Unknown')}",
            "action": "preflight 규칙 또는 triage 패턴 추가 검토",
            "evidence": summary[:100] if summary else None,
        })
    
    # From ACTIVE: Speed/efficiency
    for task in tasks_by_state.get('ACTIVE', [])[:MAX_ACTIVE_TOP]:
        summary = task.get('summary', '')
        summary, had_sensitive = mask_sensitive_data(summary)
        
        if had_sensitive:
            continue
        
        suggestions.append({
            "source": f"ACTIVE/{task['task_id']}",
            "type": "efficiency",
            "priority": calculate_task_score(task, 'ACTIVE'),
            "description": f"작업 효율화: {task.get('title', 'Unknown')}",
            "action": "자동화 또는 템플릿화 검토",
            "evidence": summary[:100] if summary else None,
        })
    
    # From COMPLETED: Template/checklist
    for task in tasks_by_state.get('COMPLETED', [])[:MAX_COMPLETED_TEMPLATE]:
        summary = task.get('summary', '')
        summary, had_sensitive = mask_sensitive_data(summary)
        
        if had_sensitive:
            continue
        
        suggestions.append({
            "source": f"COMPLETED/{task['task_id']}",
            "type": "template",
            "priority": calculate_task_score(task, 'COMPLETED'),
            "description": f"템플릿화: {task.get('title', 'Unknown')}",
            "action": "워크플로우 또는 체크리스트로 일반화",
            "evidence": None,  # Don't include completed task details
        })
    
    # Sort by priority and limit
    suggestions.sort(key=lambda x: -x['priority'])
    return suggestions[:MAX_TOTAL_ACTIONS]


def generate_weekly_report(workspace: str, dry_run: bool = False) -> Dict:
    """Generate weekly self-improvement report.
    
    Args:
        workspace: Workspace root
        dry_run: If True, don't save report
        
    Returns:
        Report dictionary
    """
    today = datetime.now()
    week_start = today - timedelta(days=today.weekday())
    week_num = today.isocalendar()[1]
    
    # Collect tasks
    tasks_by_state = collect_tasks_by_state(workspace, days=7)
    
    # Count totals
    state_counts = {state: len(tasks) for state, tasks in tasks_by_state.items()}
    
    # Generate suggestions
    suggestions = generate_improvement_suggestions(tasks_by_state, workspace)
    
    # Build report
    report = {
        "report_version": "1.0",
        "generated_at": today.isoformat(),
        "week": f"{today.year}-W{week_num:02d}",
        "period": {
            "start": (today - timedelta(days=7)).strftime("%Y-%m-%d"),
            "end": today.strftime("%Y-%m-%d"),
        },
        "summary": {
            "total_tasks": sum(state_counts.values()),
            "by_state": state_counts,
        },
        "suggestions": suggestions,
        "metrics": {
            "errors_analyzed": len(tasks_by_state.get('ERRORS', [])),
            "active_reviewed": len(tasks_by_state.get('ACTIVE', [])),
            "completed_reviewed": len(tasks_by_state.get('COMPLETED', [])),
        },
    }
    
    if not dry_run:
        # Save report
        weekly_dir = Path(workspace) / ".notes" / "WEEKLY"
        weekly_dir.mkdir(parents=True, exist_ok=True)
        
        report_file = weekly_dir / f"WEEK-{today.year}-{week_num:02d}.json"
        report_file.write_text(
            json.dumps(report, indent=2, ensure_ascii=False),
            encoding='utf-8'
        )
        
        # Also generate markdown version
        md_content = format_weekly_report_md(report)
        md_file = weekly_dir / f"WEEK-{today.year}-{week_num:02d}.md"
        md_file.write_text(md_content, encoding='utf-8')
        
        report['files'] = {
            'json': str(report_file),
            'md': str(md_file),
        }
    
    return report


def format_weekly_report_md(report: Dict) -> str:
    """Format weekly report as Markdown.
    
    Args:
        report: Report dictionary
        
    Returns:
        Markdown string
    """
    lines = []
    
    lines.append(f"# Weekly Self-Improvement Report")
    lines.append(f"> {report['week']} ({report['period']['start']} ~ {report['period']['end']})")
    lines.append("")
    lines.append(f"Generated: {report['generated_at']}")
    lines.append("")
    
    # Summary
    lines.append("## Summary")
    lines.append("")
    summary = report.get('summary', {})
    lines.append(f"Total tasks analyzed: {summary.get('total_tasks', 0)}")
    lines.append("")
    
    by_state = summary.get('by_state', {})
    if by_state:
        lines.append("| State | Count |")
        lines.append("|-------|-------|")
        for state, count in sorted(by_state.items(), key=lambda x: -STATE_WEIGHTS.get(x[0], 0)):
            if count > 0:
                lines.append(f"| {state} | {count} |")
        lines.append("")
    
    # Suggestions
    lines.append("## Improvement Suggestions")
    lines.append("")
    
    suggestions = report.get('suggestions', [])
    if suggestions:
        for i, sug in enumerate(suggestions, 1):
            type_icon = {
                "failure_prevention": "🛡️",
                "efficiency": "⚡",
                "template": "📋",
            }.get(sug['type'], "💡")
            
            lines.append(f"### {i}. {type_icon} {sug['description']}")
            lines.append("")
            lines.append(f"- **Source**: `{sug['source']}`")
            lines.append(f"- **Action**: {sug['action']}")
            if sug.get('evidence'):
                lines.append(f"- **Evidence**: {sug['evidence'][:80]}...")
            lines.append("")
    else:
        lines.append("*No improvement suggestions this week.*")
        lines.append("")
    
    # Footer
    lines.append("---")
    lines.append("*This report was auto-generated by Ensemble v3.9*")
    
    return "\n".join(lines)


def format_weekly_report(report: Dict) -> str:
    """Format weekly report for CLI display.
    
    Args:
        report: Report dictionary
        
    Returns:
        Formatted string
    """
    lines = []
    
    lines.append("┌─────────────────────────────────────────────────────────────────────┐")
    lines.append(f"│  📊 WEEKLY SELF-IMPROVEMENT REPORT: {report['week']}")
    lines.append("├─────────────────────────────────────────────────────────────────────┤")
    lines.append(f"│  Period: {report['period']['start']} ~ {report['period']['end']}")
    
    # Summary
    summary = report.get('summary', {})
    lines.append(f"│  Total Tasks: {summary.get('total_tasks', 0)}")
    
    by_state = summary.get('by_state', {})
    if by_state:
        state_str = ", ".join(f"{s}:{c}" for s, c in by_state.items() if c > 0)
        lines.append(f"│  By State: {state_str}")
    
    # Suggestions
    lines.append("├─────────────────────────────────────────────────────────────────────┤")
    lines.append("│  SUGGESTIONS:")
    
    suggestions = report.get('suggestions', [])
    if suggestions:
        for sug in suggestions:
            type_icon = {
                "failure_prevention": "🛡️",
                "efficiency": "⚡",
                "template": "📋",
            }.get(sug['type'], "💡")
            lines.append(f"│    {type_icon} {sug['description'][:50]}")
            lines.append(f"│       Action: {sug['action'][:45]}")
    else:
        lines.append("│    (No suggestions this week)")
    
    lines.append("└─────────────────────────────────────────────────────────────────────┘")
    
    if report.get('files'):
        lines.append(f"\nSaved to: {report['files'].get('md')}")
    
    return "\n".join(lines)


# Export for CLI integration
__all__ = [
    "STATE_WEIGHTS",
    "collect_tasks_by_state",
    "generate_improvement_suggestions",
    "generate_weekly_report",
    "format_weekly_report",
    "format_weekly_report_md",
    "mask_sensitive_data",
    "scan_sensitive",
]
