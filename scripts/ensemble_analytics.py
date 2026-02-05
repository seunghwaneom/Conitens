#!/usr/bin/env python3
"""
ensemble_analytics.py - Collaboration Analytics for Multi-Agent Workspace
Ensemble v5.3.0 - Phase 4: Advanced Features

Provides collaboration metrics, agent contribution analysis,
and optimal team composition recommendations.
"""

import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple, Any


@dataclass
class AgentContribution:
    """Contribution metrics for a single agent."""
    agent_id: str
    agent_type: str
    tasks_completed: int = 0
    tasks_failed: int = 0
    lines_written: int = 0
    lines_reviewed: int = 0
    files_touched: int = 0
    commits: int = 0
    review_comments: int = 0
    bugs_found: int = 0
    bugs_fixed: int = 0
    collaboration_score: float = 0.0
    efficiency_score: float = 0.0
    quality_score: float = 0.0

    @property
    def overall_score(self) -> float:
        """Calculate overall contribution score."""
        return (
            self.collaboration_score * 0.3 +
            self.efficiency_score * 0.4 +
            self.quality_score * 0.3
        )

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['overall_score'] = self.overall_score
        return data


@dataclass
class CollaborationMetrics:
    """Overall collaboration metrics for the workspace."""
    period_start: str
    period_end: str
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    avg_completion_time: float = 0.0
    parallel_work_ratio: float = 0.0  # How much work was done in parallel
    handoff_count: int = 0  # Work passed between agents
    conflict_count: int = 0  # Merge conflicts
    resolution_time: float = 0.0  # Avg time to resolve conflicts
    team_velocity: float = 0.0  # Tasks per day
    throughput: float = 0.0  # Lines of code per day

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class TeamRecommendation:
    """Recommendation for optimal team composition."""
    task_type: str
    recommended_team: List[Dict]
    rationale: str
    expected_efficiency: float
    confidence: float

    def to_dict(self) -> Dict:
        return asdict(self)


class AnalyticsEngine:
    """Analyzes collaboration metrics and agent contributions."""

    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)
        self.notes_dir = os.path.join(workspace, '.notes')
        self.contributions: Dict[str, AgentContribution] = {}
        self.metrics_file = os.path.join(self.notes_dir, 'ACTIVE', '_analytics.json')
        self._load_cached()

    def _load_cached(self):
        """Load cached analytics data."""
        if os.path.exists(self.metrics_file):
            try:
                with open(self.metrics_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                for contrib_data in data.get('contributions', []):
                    self.contributions[contrib_data['agent_id']] = AgentContribution(**contrib_data)
            except Exception:
                pass

    def _save_cached(self):
        """Save analytics data to cache."""
        os.makedirs(os.path.dirname(self.metrics_file), exist_ok=True)
        data = {
            'updated_at': datetime.now().isoformat(),
            'contributions': [c.to_dict() for c in self.contributions.values()]
        }
        with open(self.metrics_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

    def analyze_task_history(self, days: int = 30) -> CollaborationMetrics:
        """Analyze task history for collaboration metrics."""
        period_end = datetime.now()
        period_start = period_end - timedelta(days=days)

        metrics = CollaborationMetrics(
            period_start=period_start.isoformat(),
            period_end=period_end.isoformat()
        )

        # Analyze completed tasks
        completed_dir = os.path.join(self.notes_dir, 'COMPLETED')
        if os.path.exists(completed_dir):
            task_files = list(Path(completed_dir).glob('TASK-*.md'))

            completion_times = []
            daily_tasks: Dict[str, int] = defaultdict(int)
            agent_tasks: Dict[str, List] = defaultdict(list)

            for task_file in task_files:
                task_data = self._parse_task_file(task_file)
                if not task_data:
                    continue

                created = task_data.get('created_at')
                completed = task_data.get('completed_at')
                status = task_data.get('status', '')

                # Check if within period
                if created:
                    created_dt = self._parse_datetime(created)
                    if created_dt and created_dt < period_start:
                        continue

                metrics.total_tasks += 1

                if status == 'DONE':
                    metrics.completed_tasks += 1
                    if created and completed:
                        created_dt = self._parse_datetime(created)
                        completed_dt = self._parse_datetime(completed)
                        if created_dt and completed_dt:
                            duration = (completed_dt - created_dt).total_seconds()
                            completion_times.append(duration)
                            day_key = completed_dt.strftime('%Y-%m-%d')
                            daily_tasks[day_key] += 1
                elif status in ['FAILED', 'DUMPED']:
                    metrics.failed_tasks += 1

                # Track agent involvement
                agents = task_data.get('agents', [])
                for agent in agents:
                    agent_tasks[agent].append(task_file.name)

            # Calculate averages
            if completion_times:
                metrics.avg_completion_time = sum(completion_times) / len(completion_times)

            if daily_tasks:
                metrics.team_velocity = sum(daily_tasks.values()) / len(daily_tasks)

            # Handoff analysis (tasks with multiple agents)
            for task_agents in agent_tasks.values():
                if len(set(task_agents)) > 1:
                    metrics.handoff_count += 1

        # Analyze git for code metrics
        git_metrics = self._analyze_git_history(days)
        metrics.throughput = git_metrics.get('lines_per_day', 0)
        metrics.conflict_count = git_metrics.get('merge_conflicts', 0)

        return metrics

    def _parse_task_file(self, file_path: Path) -> Dict:
        """Parse a task file for metadata."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Parse YAML frontmatter
            if content.startswith('---'):
                end = content.find('---', 3)
                if end > 0:
                    frontmatter = content[3:end].strip()
                    data = {}
                    for line in frontmatter.split('\n'):
                        if ':' in line:
                            key, value = line.split(':', 1)
                            key = key.strip()
                            value = value.strip()
                            # Handle arrays
                            if value.startswith('[') and value.endswith(']'):
                                value = [v.strip() for v in value[1:-1].split(',')]
                            data[key] = value
                    return data
        except Exception:
            pass
        return {}

    def _parse_datetime(self, dt_str: str) -> Optional[datetime]:
        """Parse datetime string."""
        formats = [
            '%Y-%m-%dT%H:%M:%S%z',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d'
        ]
        for fmt in formats:
            try:
                return datetime.strptime(dt_str.replace('+09:00', '+0900'), fmt)
            except ValueError:
                continue
        return None

    def _analyze_git_history(self, days: int) -> Dict:
        """Analyze git history for code metrics."""
        metrics = {
            'total_commits': 0,
            'lines_added': 0,
            'lines_removed': 0,
            'lines_per_day': 0,
            'merge_conflicts': 0,
            'files_changed': 0
        }

        try:
            # Get commit stats
            result = subprocess.run(
                ['git', 'log', f'--since={days} days ago', '--shortstat', '--oneline'],
                cwd=self.workspace,
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                for line in lines:
                    if 'files changed' in line or 'file changed' in line:
                        # Parse: 5 files changed, 100 insertions(+), 20 deletions(-)
                        parts = line.strip().split(',')
                        for part in parts:
                            if 'insertion' in part:
                                metrics['lines_added'] += int(re.search(r'\d+', part).group())
                            elif 'deletion' in part:
                                metrics['lines_removed'] += int(re.search(r'\d+', part).group())
                            elif 'changed' in part:
                                metrics['files_changed'] += int(re.search(r'\d+', part).group())
                    elif line.strip() and not line.startswith(' '):
                        metrics['total_commits'] += 1

                total_lines = metrics['lines_added'] + metrics['lines_removed']
                metrics['lines_per_day'] = total_lines / days if days > 0 else 0

            # Check for merge conflicts in history
            result = subprocess.run(
                ['git', 'log', f'--since={days} days ago', '--all', '--oneline', '--grep=Merge conflict'],
                cwd=self.workspace,
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                metrics['merge_conflicts'] = len([l for l in result.stdout.strip().split('\n') if l])

        except Exception:
            pass

        return metrics

    def analyze_agent_contributions(self, days: int = 30) -> Dict[str, AgentContribution]:
        """Analyze individual agent contributions."""
        contributions: Dict[str, AgentContribution] = {}

        # Analyze task files for agent involvement
        completed_dir = os.path.join(self.notes_dir, 'COMPLETED')
        journal_dir = os.path.join(self.notes_dir, 'JOURNAL')

        # Parse all task and journal files
        task_data: Dict[str, Dict] = {}

        for dir_path in [completed_dir, journal_dir]:
            if not os.path.exists(dir_path):
                continue

            for file_path in Path(dir_path).glob('*.md'):
                content = self._parse_task_file(file_path)
                if content:
                    # Look for STEP LOG entries
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            full_content = f.read()

                        # Extract STEP LOG entries
                        step_logs = re.findall(
                            r'### STEP LOG \(@(\w+) - ([^)]+)\)\n(.*?)(?=###|\Z)',
                            full_content,
                            re.DOTALL
                        )

                        for agent, timestamp, log_content in step_logs:
                            if agent not in contributions:
                                contributions[agent] = AgentContribution(
                                    agent_id=agent,
                                    agent_type=self._infer_agent_type(agent)
                                )

                            contrib = contributions[agent]
                            contrib.tasks_completed += 1

                            # Analyze log content
                            if '[DONE]' in log_content:
                                if 'review' in log_content.lower():
                                    contrib.review_comments += 1
                                if 'fix' in log_content.lower() or 'bug' in log_content.lower():
                                    contrib.bugs_fixed += 1

                            if '[CHANGE]' in log_content:
                                # Count files mentioned
                                files = re.findall(r'[\w/]+\.\w+', log_content)
                                contrib.files_touched += len(set(files))

                    except Exception:
                        pass

        # Analyze git commits for code contributions
        try:
            result = subprocess.run(
                ['git', 'log', f'--since={days} days ago', '--format=%an|%s', '--shortstat'],
                cwd=self.workspace,
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                current_author = None

                for line in lines:
                    if '|' in line and 'files changed' not in line:
                        parts = line.split('|')
                        current_author = parts[0].strip()

                        # Try to match to an agent
                        for agent_id in contributions:
                            if agent_id.lower() in current_author.lower():
                                current_author = agent_id
                                break

                        if current_author and current_author not in contributions:
                            contributions[current_author] = AgentContribution(
                                agent_id=current_author,
                                agent_type=self._infer_agent_type(current_author)
                            )

                        if current_author and current_author in contributions:
                            contributions[current_author].commits += 1

                    elif 'files changed' in line and current_author:
                        if current_author in contributions:
                            # Parse insertions/deletions
                            if 'insertion' in line:
                                match = re.search(r'(\d+) insertion', line)
                                if match:
                                    contributions[current_author].lines_written += int(match.group(1))

        except Exception:
            pass

        # Calculate scores
        self._calculate_scores(contributions)

        self.contributions = contributions
        self._save_cached()

        return contributions

    def _infer_agent_type(self, agent_id: str) -> str:
        """Infer agent type from ID."""
        agent_lower = agent_id.lower()
        if 'gemini' in agent_lower:
            return 'gemini'
        elif 'claude' in agent_lower:
            return 'claude'
        elif 'codex' in agent_lower:
            return 'codex'
        elif 'cli' in agent_lower or 'agent' in agent_lower:
            return 'agent'
        return 'unknown'

    def _calculate_scores(self, contributions: Dict[str, AgentContribution]):
        """Calculate contribution scores for all agents."""
        if not contributions:
            return

        # Find max values for normalization
        max_tasks = max(c.tasks_completed for c in contributions.values()) or 1
        max_lines = max(c.lines_written for c in contributions.values()) or 1
        max_commits = max(c.commits for c in contributions.values()) or 1

        for contrib in contributions.values():
            # Efficiency score: tasks and output
            contrib.efficiency_score = (
                (contrib.tasks_completed / max_tasks) * 0.5 +
                (contrib.lines_written / max_lines) * 0.3 +
                (contrib.commits / max_commits) * 0.2
            )

            # Quality score: bugs found/fixed ratio
            total_bugs = contrib.bugs_found + contrib.bugs_fixed
            if total_bugs > 0:
                contrib.quality_score = contrib.bugs_fixed / total_bugs
            else:
                # No bugs = neutral quality
                contrib.quality_score = 0.5

            # Success rate factor
            total = contrib.tasks_completed + contrib.tasks_failed
            if total > 0:
                success_rate = contrib.tasks_completed / total
                contrib.quality_score = (contrib.quality_score + success_rate) / 2

            # Collaboration score: variety of work
            variety = len(set([
                contrib.files_touched > 0,
                contrib.review_comments > 0,
                contrib.commits > 0,
                contrib.tasks_completed > 0
            ]))
            contrib.collaboration_score = variety / 4.0

    def recommend_team(self, task_type: str, task_size: str = "medium") -> TeamRecommendation:
        """Recommend optimal team composition for a task type."""
        # Define task requirements
        task_requirements = {
            'new_feature': {
                'required': ['planning', 'coding', 'review'],
                'min_agents': 2,
                'max_agents': 4
            },
            'bug_fix': {
                'required': ['coding', 'testing'],
                'min_agents': 1,
                'max_agents': 2
            },
            'refactor': {
                'required': ['coding', 'review', 'testing'],
                'min_agents': 2,
                'max_agents': 3
            },
            'security_audit': {
                'required': ['security', 'review'],
                'min_agents': 2,
                'max_agents': 3
            },
            'documentation': {
                'required': ['documentation'],
                'min_agents': 1,
                'max_agents': 2
            }
        }

        # Agent capability mapping
        agent_capabilities = {
            'gemini': ['planning', 'documentation', 'review'],
            'claude': ['coding', 'review', 'testing', 'documentation'],
            'codex': ['review', 'security', 'testing', 'performance']
        }

        reqs = task_requirements.get(task_type, task_requirements['new_feature'])

        # Select agents based on requirements
        recommended = []
        covered_capabilities = set()

        # Size multiplier
        size_mult = {'small': 0.5, 'medium': 1.0, 'large': 1.5}.get(task_size, 1.0)
        target_agents = int(reqs['min_agents'] + (reqs['max_agents'] - reqs['min_agents']) * size_mult)

        # Prioritize agents that cover required capabilities
        for capability in reqs['required']:
            if capability in covered_capabilities:
                continue

            for agent_type, caps in agent_capabilities.items():
                if capability in caps:
                    # Check if we have performance data
                    best_agent = None
                    best_score = 0

                    for contrib in self.contributions.values():
                        if contrib.agent_type == agent_type:
                            if contrib.overall_score > best_score:
                                best_score = contrib.overall_score
                                best_agent = contrib

                    if best_agent:
                        recommended.append({
                            'agent_type': agent_type,
                            'agent_id': best_agent.agent_id,
                            'role': capability,
                            'expected_performance': best_agent.overall_score
                        })
                    else:
                        recommended.append({
                            'agent_type': agent_type,
                            'agent_id': f'{agent_type}-1',
                            'role': capability,
                            'expected_performance': 0.7
                        })

                    covered_capabilities.update(caps)
                    break

        # Trim or pad to target size
        recommended = recommended[:target_agents]

        # Calculate expected efficiency
        avg_performance = sum(r['expected_performance'] for r in recommended) / len(recommended) if recommended else 0.5
        coverage = len(covered_capabilities & set(reqs['required'])) / len(reqs['required'])

        expected_efficiency = (avg_performance * 0.6 + coverage * 0.4)

        return TeamRecommendation(
            task_type=task_type,
            recommended_team=recommended,
            rationale=f"Team covers {len(covered_capabilities)} capabilities with {len(recommended)} agents",
            expected_efficiency=expected_efficiency,
            confidence=0.7 if self.contributions else 0.5
        )

    def generate_report(self, days: int = 30) -> Dict:
        """Generate a comprehensive analytics report."""
        metrics = self.analyze_task_history(days)
        contributions = self.analyze_agent_contributions(days)

        # Rank agents
        ranked_agents = sorted(
            contributions.values(),
            key=lambda c: c.overall_score,
            reverse=True
        )

        # Team recommendations for common tasks
        recommendations = {
            task: self.recommend_team(task).to_dict()
            for task in ['new_feature', 'bug_fix', 'refactor']
        }

        return {
            'period': {
                'start': metrics.period_start,
                'end': metrics.period_end,
                'days': days
            },
            'summary': {
                'total_tasks': metrics.total_tasks,
                'completed': metrics.completed_tasks,
                'failed': metrics.failed_tasks,
                'completion_rate': metrics.completed_tasks / metrics.total_tasks if metrics.total_tasks > 0 else 0,
                'avg_completion_time_hours': metrics.avg_completion_time / 3600,
                'team_velocity': metrics.team_velocity,
                'code_throughput': metrics.throughput
            },
            'top_contributors': [
                {
                    'agent': c.agent_id,
                    'type': c.agent_type,
                    'score': c.overall_score,
                    'tasks': c.tasks_completed,
                    'lines': c.lines_written
                }
                for c in ranked_agents[:5]
            ],
            'all_contributions': [c.to_dict() for c in contributions.values()],
            'team_recommendations': recommendations
        }


# CLI Interface
def cmd_summary(args):
    """Show analytics summary."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_analytics.py summary')
    parser.add_argument('--days', type=int, default=30, help='Analysis period in days')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    engine = AnalyticsEngine(workspace)
    metrics = engine.analyze_task_history(parsed.days)

    if parsed.json:
        print(json.dumps(metrics.to_dict(), indent=2))
        return 0

    print(f"\n📊 Collaboration Summary (Last {parsed.days} days)")
    print("=" * 50)

    print(f"\n📋 Tasks:")
    print(f"   Total: {metrics.total_tasks}")
    print(f"   Completed: {metrics.completed_tasks}")
    print(f"   Failed: {metrics.failed_tasks}")
    if metrics.total_tasks > 0:
        rate = metrics.completed_tasks / metrics.total_tasks * 100
        print(f"   Success Rate: {rate:.1f}%")

    print(f"\n⏱️ Performance:")
    print(f"   Avg Completion Time: {metrics.avg_completion_time / 3600:.1f} hours")
    print(f"   Team Velocity: {metrics.team_velocity:.1f} tasks/day")
    print(f"   Code Throughput: {metrics.throughput:.0f} lines/day")

    print(f"\n🤝 Collaboration:")
    print(f"   Handoffs: {metrics.handoff_count}")
    print(f"   Conflicts: {metrics.conflict_count}")

    return 0


def cmd_contributors(args):
    """Show agent contributions."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_analytics.py contributors')
    parser.add_argument('--days', type=int, default=30, help='Analysis period')
    parser.add_argument('--json', action='store_true')
    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    engine = AnalyticsEngine(workspace)
    contributions = engine.analyze_agent_contributions(parsed.days)

    if parsed.json:
        print(json.dumps({k: v.to_dict() for k, v in contributions.items()}, indent=2))
        return 0

    if not contributions:
        print("No contributor data found")
        return 0

    # Sort by overall score
    sorted_contribs = sorted(contributions.values(), key=lambda c: c.overall_score, reverse=True)

    print(f"\n👥 Agent Contributions (Last {parsed.days} days)")
    print("=" * 60)

    for i, contrib in enumerate(sorted_contribs, 1):
        medal = {1: "🥇", 2: "🥈", 3: "🥉"}.get(i, "  ")
        print(f"\n{medal} {contrib.agent_id} ({contrib.agent_type})")
        print(f"   Overall Score: {contrib.overall_score:.2f}")
        print(f"   ├─ Efficiency: {contrib.efficiency_score:.2f}")
        print(f"   ├─ Quality: {contrib.quality_score:.2f}")
        print(f"   └─ Collaboration: {contrib.collaboration_score:.2f}")
        print(f"   Stats: {contrib.tasks_completed} tasks, {contrib.lines_written} lines, {contrib.commits} commits")

    return 0


def cmd_recommend(args):
    """Get team recommendations."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_analytics.py recommend')
    parser.add_argument('task_type', choices=['new_feature', 'bug_fix', 'refactor', 'security_audit', 'documentation'])
    parser.add_argument('--size', choices=['small', 'medium', 'large'], default='medium')
    parser.add_argument('--json', action='store_true')
    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    engine = AnalyticsEngine(workspace)

    # Load existing contributions for better recommendations
    engine.analyze_agent_contributions(30)

    rec = engine.recommend_team(parsed.task_type, parsed.size)

    if parsed.json:
        print(json.dumps(rec.to_dict(), indent=2))
        return 0

    print(f"\n🎯 Team Recommendation: {parsed.task_type} ({parsed.size})")
    print("=" * 50)

    print(f"\n👥 Recommended Team ({len(rec.recommended_team)} agents):")
    for member in rec.recommended_team:
        print(f"   • {member['agent_id']} ({member['agent_type']})")
        print(f"     Role: {member['role']}")
        print(f"     Expected Performance: {member['expected_performance']:.2f}")

    print(f"\n📊 Analysis:")
    print(f"   {rec.rationale}")
    print(f"   Expected Efficiency: {rec.expected_efficiency:.2%}")
    print(f"   Confidence: {rec.confidence:.2%}")

    return 0


def cmd_report(args):
    """Generate full analytics report."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_analytics.py report')
    parser.add_argument('--days', type=int, default=30)
    parser.add_argument('--output', help='Output file (JSON)')
    parser.add_argument('--json', action='store_true')
    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    engine = AnalyticsEngine(workspace)
    report = engine.generate_report(parsed.days)

    if parsed.output:
        with open(parsed.output, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2)
        print(f"✅ Report saved to {parsed.output}")
        return 0

    if parsed.json:
        print(json.dumps(report, indent=2))
        return 0

    # Pretty print report
    print(f"\n📊 Analytics Report ({report['period']['days']} days)")
    print("=" * 60)

    s = report['summary']
    print(f"\n📋 Summary:")
    print(f"   Tasks: {s['total_tasks']} total, {s['completed']} completed, {s['failed']} failed")
    print(f"   Completion Rate: {s['completion_rate']:.1%}")
    print(f"   Avg Time: {s['avg_completion_time_hours']:.1f} hours")
    print(f"   Velocity: {s['team_velocity']:.1f} tasks/day")
    print(f"   Throughput: {s['code_throughput']:.0f} lines/day")

    print(f"\n🏆 Top Contributors:")
    for i, c in enumerate(report['top_contributors'], 1):
        print(f"   {i}. {c['agent']} ({c['type']}): {c['score']:.2f} score, {c['tasks']} tasks")

    print(f"\n💡 Team Recommendations:")
    for task, rec in report['team_recommendations'].items():
        team = ', '.join(m['agent_type'] for m in rec['recommended_team'])
        print(f"   {task}: {team} (efficiency: {rec['expected_efficiency']:.1%})")

    return 0


def main():
    if len(sys.argv) < 2:
        print("Usage: ensemble_analytics.py <command> [args]")
        print("\nCommands:")
        print("  summary      - Show collaboration summary")
        print("  contributors - Show agent contributions")
        print("  recommend    - Get team recommendations")
        print("  report       - Generate full report")
        return 1

    commands = {
        'summary': cmd_summary,
        'contributors': cmd_contributors,
        'recommend': cmd_recommend,
        'report': cmd_report
    }

    cmd = sys.argv[1]
    if cmd not in commands:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        return 1

    return commands[cmd](sys.argv[2:])


if __name__ == '__main__':
    sys.exit(main())
