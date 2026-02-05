#!/usr/bin/env python3
"""
ensemble_smart_partition.py - Smart Partitioning for Multi-Agent Workspace
Ensemble v5.3.0 - Phase 4: Advanced Features

Provides intelligent partitioning based on dependency analysis,
change frequency, and dynamic re-partitioning.
"""

import ast
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
class DependencyInfo:
    """Information about a file's dependencies."""
    file_path: str
    imports: List[str] = field(default_factory=list)  # Files this imports
    imported_by: List[str] = field(default_factory=list)  # Files that import this
    calls: List[str] = field(default_factory=list)  # Functions called
    called_by: List[str] = field(default_factory=list)  # Called from
    coupling_score: float = 0.0  # Higher = more connected

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class ChangeMetrics:
    """Metrics about file change frequency."""
    file_path: str
    total_commits: int = 0
    commits_last_30_days: int = 0
    commits_last_7_days: int = 0
    co_changed_files: Dict[str, int] = field(default_factory=dict)  # Files changed together
    avg_changes_per_commit: float = 0.0
    last_changed: Optional[str] = None
    hotspot_score: float = 0.0  # Higher = more frequent changes

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class SmartPartition:
    """A partition created by smart analysis."""
    partition_id: str
    name: str
    description: str
    files: List[str]
    primary_file: str  # Main entry point
    boundary_files: List[str]  # Files that interface with other partitions
    internal_coupling: float  # How tightly coupled internally
    external_coupling: float  # How coupled to other partitions
    change_frequency: float  # How often this partition changes
    recommended_agents: int  # Recommended number of agents
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return asdict(self)


class DependencyAnalyzer:
    """Analyzes code dependencies for Python and JavaScript."""

    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)
        self.dependencies: Dict[str, DependencyInfo] = {}
        self.module_map: Dict[str, str] = {}  # module name -> file path

    def analyze(self, file_patterns: List[str] = None) -> Dict[str, DependencyInfo]:
        """Analyze dependencies for all matching files."""
        if file_patterns is None:
            file_patterns = ['**/*.py', '**/*.js', '**/*.ts']

        files = []
        for pattern in file_patterns:
            for path in Path(self.workspace).glob(pattern):
                if not self._should_skip(path):
                    files.append(str(path))

        # Build module map
        self._build_module_map(files)

        # Analyze each file
        for file_path in files:
            self._analyze_file(file_path)

        # Calculate coupling scores
        self._calculate_coupling_scores()

        return self.dependencies

    def _should_skip(self, path: Path) -> bool:
        """Check if path should be skipped."""
        skip_dirs = {'.git', '.notes', '__pycache__', 'node_modules', 'venv', '.venv'}
        return any(part in skip_dirs for part in path.parts)

    def _build_module_map(self, files: List[str]):
        """Build mapping from module names to file paths."""
        for file_path in files:
            rel_path = os.path.relpath(file_path, self.workspace)

            # Python module name
            if file_path.endswith('.py'):
                module_name = rel_path.replace('/', '.').replace('\\', '.')[:-3]
                self.module_map[module_name] = file_path

                # Also map short name
                short_name = os.path.basename(file_path)[:-3]
                if short_name not in self.module_map:
                    self.module_map[short_name] = file_path

    def _analyze_file(self, file_path: str):
        """Analyze a single file's dependencies."""
        ext = os.path.splitext(file_path)[1].lower()

        if ext == '.py':
            self._analyze_python(file_path)
        elif ext in ['.js', '.jsx', '.ts', '.tsx']:
            self._analyze_javascript(file_path)

    def _analyze_python(self, file_path: str):
        """Analyze Python file dependencies."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            tree = ast.parse(content, filename=file_path)

            dep_info = DependencyInfo(file_path=file_path)

            for node in ast.walk(tree):
                # Import statements
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        module = alias.name.split('.')[0]
                        if module in self.module_map:
                            dep_info.imports.append(self.module_map[module])

                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        module = node.module.split('.')[0]
                        if module in self.module_map:
                            dep_info.imports.append(self.module_map[module])

                # Function calls (basic tracking)
                elif isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Attribute):
                        dep_info.calls.append(node.func.attr)
                    elif isinstance(node.func, ast.Name):
                        dep_info.calls.append(node.func.id)

            self.dependencies[file_path] = dep_info

            # Update reverse dependencies
            for imported in dep_info.imports:
                if imported in self.dependencies:
                    self.dependencies[imported].imported_by.append(file_path)

        except Exception as e:
            self.dependencies[file_path] = DependencyInfo(file_path=file_path)

    def _analyze_javascript(self, file_path: str):
        """Analyze JavaScript/TypeScript file dependencies."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            dep_info = DependencyInfo(file_path=file_path)

            # import/require patterns
            import_patterns = [
                re.compile(r'import\s+.*\s+from\s+[\'"]([^\'"]+)[\'"]'),
                re.compile(r'import\s+[\'"]([^\'"]+)[\'"]'),
                re.compile(r'require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)'),
            ]

            for pattern in import_patterns:
                for match in pattern.finditer(content):
                    import_path = match.group(1)
                    if import_path.startswith('.'):
                        # Relative import
                        dir_path = os.path.dirname(file_path)
                        resolved = os.path.normpath(os.path.join(dir_path, import_path))

                        # Try different extensions
                        for ext in ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.ts']:
                            full_path = resolved + ext
                            if os.path.exists(full_path):
                                dep_info.imports.append(full_path)
                                break

            self.dependencies[file_path] = dep_info

            # Update reverse dependencies
            for imported in dep_info.imports:
                if imported in self.dependencies:
                    self.dependencies[imported].imported_by.append(file_path)

        except Exception as e:
            self.dependencies[file_path] = DependencyInfo(file_path=file_path)

    def _calculate_coupling_scores(self):
        """Calculate coupling scores for all files."""
        max_deps = max(
            len(d.imports) + len(d.imported_by)
            for d in self.dependencies.values()
        ) if self.dependencies else 1

        for dep_info in self.dependencies.values():
            total_deps = len(dep_info.imports) + len(dep_info.imported_by)
            dep_info.coupling_score = total_deps / max_deps if max_deps > 0 else 0


class ChangeFrequencyAnalyzer:
    """Analyzes file change frequency using git history."""

    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)
        self.metrics: Dict[str, ChangeMetrics] = {}

    def analyze(self, days: int = 90) -> Dict[str, ChangeMetrics]:
        """Analyze change frequency for files."""
        try:
            # Get all commits with files changed
            result = subprocess.run(
                ['git', 'log', f'--since={days} days ago', '--name-only', '--pretty=format:%H|%ad', '--date=short'],
                cwd=self.workspace,
                capture_output=True,
                text=True
            )

            if result.returncode != 0:
                return {}

            commits = self._parse_git_log(result.stdout)
            self._calculate_metrics(commits, days)
            return self.metrics

        except Exception as e:
            print(f"Error analyzing git history: {e}", file=sys.stderr)
            return {}

    def _parse_git_log(self, output: str) -> List[Dict]:
        """Parse git log output."""
        commits = []
        current_commit = None
        current_files = []

        for line in output.strip().split('\n'):
            if '|' in line and len(line.split('|')) == 2:
                # New commit
                if current_commit and current_files:
                    commits.append({
                        'hash': current_commit['hash'],
                        'date': current_commit['date'],
                        'files': current_files
                    })

                parts = line.split('|')
                current_commit = {
                    'hash': parts[0],
                    'date': parts[1]
                }
                current_files = []
            elif line.strip():
                current_files.append(line.strip())

        # Add last commit
        if current_commit and current_files:
            commits.append({
                'hash': current_commit['hash'],
                'date': current_commit['date'],
                'files': current_files
            })

        return commits

    def _calculate_metrics(self, commits: List[Dict], days: int):
        """Calculate change metrics from commits."""
        now = datetime.now()
        thirty_days_ago = now - timedelta(days=30)
        seven_days_ago = now - timedelta(days=7)

        file_commits: Dict[str, List[Dict]] = defaultdict(list)
        co_changes: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

        for commit in commits:
            commit_date = datetime.strptime(commit['date'], '%Y-%m-%d')

            for file_path in commit['files']:
                full_path = os.path.join(self.workspace, file_path)
                if os.path.exists(full_path):
                    file_commits[full_path].append({
                        'date': commit_date,
                        'files': commit['files']
                    })

                    # Track co-changed files
                    for other_file in commit['files']:
                        if other_file != file_path:
                            other_full = os.path.join(self.workspace, other_file)
                            co_changes[full_path][other_full] += 1

        # Calculate metrics for each file
        max_commits = max(len(c) for c in file_commits.values()) if file_commits else 1

        for file_path, commits_list in file_commits.items():
            metrics = ChangeMetrics(file_path=file_path)
            metrics.total_commits = len(commits_list)

            for commit in commits_list:
                if commit['date'] >= thirty_days_ago:
                    metrics.commits_last_30_days += 1
                if commit['date'] >= seven_days_ago:
                    metrics.commits_last_7_days += 1

            if commits_list:
                latest = max(c['date'] for c in commits_list)
                metrics.last_changed = latest.isoformat()

                total_files = sum(len(c['files']) for c in commits_list)
                metrics.avg_changes_per_commit = total_files / len(commits_list)

            metrics.co_changed_files = dict(co_changes[file_path])

            # Calculate hotspot score (recency-weighted)
            metrics.hotspot_score = (
                (metrics.commits_last_7_days * 3 +
                 metrics.commits_last_30_days * 2 +
                 metrics.total_commits) / (max_commits * 6)
            )

            self.metrics[file_path] = metrics

        return self.metrics


class SmartPartitioner:
    """Creates intelligent partitions based on analysis."""

    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)
        self.dependency_analyzer = DependencyAnalyzer(workspace)
        self.change_analyzer = ChangeFrequencyAnalyzer(workspace)
        self.partitions: List[SmartPartition] = []

    def analyze_and_partition(
        self,
        max_partitions: int = 5,
        min_files_per_partition: int = 3,
        strategy: str = "balanced"
    ) -> List[SmartPartition]:
        """
        Analyze codebase and create smart partitions.

        Strategies:
        - "balanced": Balance between coupling and change frequency
        - "coupling": Prioritize low coupling between partitions
        - "hotspot": Isolate frequently changed files
        """
        # Analyze dependencies and change frequency
        dependencies = self.dependency_analyzer.analyze()
        change_metrics = self.change_analyzer.analyze()

        # Get all files
        all_files = set(dependencies.keys())

        if not all_files:
            return []

        # Create graph for clustering
        graph = self._build_affinity_graph(dependencies, change_metrics, strategy)

        # Cluster files into partitions
        clusters = self._cluster_files(graph, all_files, max_partitions, min_files_per_partition)

        # Create partition objects
        self.partitions = []
        for i, cluster_files in enumerate(clusters):
            partition = self._create_partition(i, cluster_files, dependencies, change_metrics)
            self.partitions.append(partition)

        return self.partitions

    def _build_affinity_graph(
        self,
        dependencies: Dict[str, DependencyInfo],
        change_metrics: Dict[str, ChangeMetrics],
        strategy: str
    ) -> Dict[str, Dict[str, float]]:
        """Build affinity graph between files."""
        graph: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))

        for file_path, dep_info in dependencies.items():
            # Dependency affinity
            for imported in dep_info.imports:
                if imported in dependencies:
                    if strategy == "coupling":
                        graph[file_path][imported] += 2.0
                        graph[imported][file_path] += 2.0
                    else:
                        graph[file_path][imported] += 1.0
                        graph[imported][file_path] += 1.0

            # Co-change affinity
            if file_path in change_metrics:
                for co_file, count in change_metrics[file_path].co_changed_files.items():
                    if co_file in dependencies:
                        if strategy == "hotspot":
                            graph[file_path][co_file] += count * 2.0
                        else:
                            graph[file_path][co_file] += count * 0.5

        return graph

    def _cluster_files(
        self,
        graph: Dict[str, Dict[str, float]],
        all_files: Set[str],
        max_partitions: int,
        min_files: int
    ) -> List[List[str]]:
        """Cluster files using greedy community detection."""
        remaining = set(all_files)
        clusters: List[List[str]] = []

        while remaining and len(clusters) < max_partitions:
            # Find seed (most connected or highest hotspot)
            seed = max(remaining, key=lambda f: sum(graph.get(f, {}).values()))

            cluster = {seed}
            remaining.remove(seed)

            # Grow cluster
            while len(cluster) < len(all_files) // max_partitions + min_files:
                # Find most connected file to cluster
                best_file = None
                best_score = -1

                for file in remaining:
                    score = sum(
                        graph.get(file, {}).get(c, 0)
                        for c in cluster
                    )
                    if score > best_score:
                        best_score = score
                        best_file = file

                if best_file and best_score > 0:
                    cluster.add(best_file)
                    remaining.remove(best_file)
                else:
                    break

            clusters.append(list(cluster))

        # Add remaining files to nearest cluster
        for file in remaining:
            best_cluster = 0
            best_score = -1

            for i, cluster in enumerate(clusters):
                score = sum(graph.get(file, {}).get(c, 0) for c in cluster)
                if score > best_score:
                    best_score = score
                    best_cluster = i

            clusters[best_cluster].append(file)

        return clusters

    def _create_partition(
        self,
        index: int,
        files: List[str],
        dependencies: Dict[str, DependencyInfo],
        change_metrics: Dict[str, ChangeMetrics]
    ) -> SmartPartition:
        """Create a partition object from clustered files."""
        file_set = set(files)

        # Find primary file (most imported within partition)
        import_counts = defaultdict(int)
        for f in files:
            if f in dependencies:
                for imported in dependencies[f].imports:
                    if imported in file_set:
                        import_counts[imported] += 1

        primary = max(files, key=lambda f: import_counts.get(f, 0)) if import_counts else files[0]

        # Find boundary files (have external dependencies)
        boundary = []
        for f in files:
            if f in dependencies:
                external_deps = [
                    d for d in dependencies[f].imports + dependencies[f].imported_by
                    if d not in file_set
                ]
                if external_deps:
                    boundary.append(f)

        # Calculate coupling
        internal_edges = 0
        external_edges = 0

        for f in files:
            if f in dependencies:
                for dep in dependencies[f].imports + dependencies[f].imported_by:
                    if dep in file_set:
                        internal_edges += 1
                    else:
                        external_edges += 1

        total_edges = internal_edges + external_edges
        internal_coupling = internal_edges / total_edges if total_edges > 0 else 0
        external_coupling = external_edges / total_edges if total_edges > 0 else 0

        # Calculate change frequency
        change_scores = [
            change_metrics[f].hotspot_score
            for f in files if f in change_metrics
        ]
        avg_change = sum(change_scores) / len(change_scores) if change_scores else 0

        # Generate name from common path
        rel_paths = [os.path.relpath(f, self.workspace) for f in files]
        common_prefix = os.path.commonpath(rel_paths) if len(rel_paths) > 1 else os.path.dirname(rel_paths[0])
        name = common_prefix.replace('/', '-').replace('\\', '-') or f"partition-{index}"

        # Recommend agents based on size and complexity
        recommended = min(3, max(1, len(files) // 5))
        if avg_change > 0.5:
            recommended += 1  # More agents for hotspots

        # Generate tags
        tags = []
        if avg_change > 0.7:
            tags.append("hotspot")
        if external_coupling > 0.5:
            tags.append("high-coupling")
        if len(boundary) > len(files) * 0.5:
            tags.append("boundary-heavy")

        return SmartPartition(
            partition_id=f"PART-{index:03d}-{name[:20]}",
            name=name,
            description=f"Partition covering {common_prefix or 'root'}",
            files=files,
            primary_file=primary,
            boundary_files=boundary,
            internal_coupling=round(internal_coupling, 3),
            external_coupling=round(external_coupling, 3),
            change_frequency=round(avg_change, 3),
            recommended_agents=recommended,
            tags=tags
        )

    def suggest_repartition(self) -> Optional[Dict]:
        """Analyze if repartitioning would be beneficial."""
        if not self.partitions:
            return None

        issues = []

        # Check for unbalanced partitions
        sizes = [len(p.files) for p in self.partitions]
        avg_size = sum(sizes) / len(sizes)

        for p in self.partitions:
            if len(p.files) > avg_size * 2:
                issues.append({
                    'type': 'unbalanced',
                    'partition': p.partition_id,
                    'message': f'Partition is much larger than average ({len(p.files)} vs {avg_size:.1f})'
                })

            if p.external_coupling > 0.7:
                issues.append({
                    'type': 'high_coupling',
                    'partition': p.partition_id,
                    'message': f'High external coupling ({p.external_coupling:.2%})'
                })

        if issues:
            return {
                'should_repartition': True,
                'issues': issues,
                'recommendation': 'Consider re-running partition analysis with different parameters'
            }

        return {
            'should_repartition': False,
            'message': 'Current partitioning looks optimal'
        }

    def export_partitions(self, output_file: str = None):
        """Export partitions to JSON."""
        data = {
            'workspace': self.workspace,
            'created_at': datetime.now().isoformat(),
            'partitions': [p.to_dict() for p in self.partitions],
            'summary': {
                'total_partitions': len(self.partitions),
                'total_files': sum(len(p.files) for p in self.partitions),
                'avg_internal_coupling': sum(p.internal_coupling for p in self.partitions) / len(self.partitions) if self.partitions else 0,
                'avg_external_coupling': sum(p.external_coupling for p in self.partitions) / len(self.partitions) if self.partitions else 0
            }
        }

        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)

        return data


# CLI Interface
def cmd_analyze(args):
    """Analyze codebase and show dependencies."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_smart_partition.py analyze')
    parser.add_argument('--file', help='Analyze specific file')
    parser.add_argument('--json', action='store_true', help='Output as JSON')

    parsed = parser.parse_args(args)
    workspace = os.getcwd()

    analyzer = DependencyAnalyzer(workspace)
    deps = analyzer.analyze()

    if parsed.file:
        file_path = os.path.abspath(parsed.file)
        if file_path in deps:
            dep = deps[file_path]
            if parsed.json:
                print(json.dumps(dep.to_dict(), indent=2))
            else:
                print(f"\n📄 {os.path.relpath(file_path, workspace)}")
                print("=" * 50)
                print(f"Imports ({len(dep.imports)}):")
                for f in dep.imports:
                    print(f"  → {os.path.relpath(f, workspace)}")
                print(f"\nImported by ({len(dep.imported_by)}):")
                for f in dep.imported_by:
                    print(f"  ← {os.path.relpath(f, workspace)}")
                print(f"\nCoupling score: {dep.coupling_score:.2%}")
        else:
            print(f"File not found in analysis: {parsed.file}")
            return 1
    else:
        if parsed.json:
            print(json.dumps({f: d.to_dict() for f, d in deps.items()}, indent=2))
        else:
            print(f"\n📊 Dependency Analysis: {len(deps)} files")
            print("=" * 50)

            # Show top connected files
            sorted_deps = sorted(deps.values(), key=lambda d: d.coupling_score, reverse=True)[:10]
            print("\nTop 10 most connected files:")
            for dep in sorted_deps:
                rel_path = os.path.relpath(dep.file_path, workspace)
                print(f"  {dep.coupling_score:.2%} - {rel_path}")

    return 0


def cmd_changes(args):
    """Analyze change frequency."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_smart_partition.py changes')
    parser.add_argument('--days', type=int, default=90, help='Days to analyze')
    parser.add_argument('--json', action='store_true', help='Output as JSON')

    parsed = parser.parse_args(args)
    workspace = os.getcwd()

    analyzer = ChangeFrequencyAnalyzer(workspace)
    metrics = analyzer.analyze(parsed.days)

    if parsed.json:
        print(json.dumps({f: m.to_dict() for f, m in metrics.items()}, indent=2))
        return 0

    if not metrics:
        print("No git history found or error analyzing")
        return 1

    print(f"\n🔥 Change Frequency Analysis (last {parsed.days} days)")
    print("=" * 50)

    # Sort by hotspot score
    sorted_metrics = sorted(metrics.values(), key=lambda m: m.hotspot_score, reverse=True)[:15]

    print("\nTop 15 hotspots:")
    for m in sorted_metrics:
        rel_path = os.path.relpath(m.file_path, workspace)
        print(f"  {m.hotspot_score:.2%} - {rel_path}")
        print(f"        7d: {m.commits_last_7_days}, 30d: {m.commits_last_30_days}, total: {m.total_commits}")

    return 0


def cmd_partition(args):
    """Create smart partitions."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_smart_partition.py partition')
    parser.add_argument('--max', type=int, default=5, help='Maximum partitions')
    parser.add_argument('--min-files', type=int, default=3, help='Minimum files per partition')
    parser.add_argument('--strategy', choices=['balanced', 'coupling', 'hotspot'], default='balanced')
    parser.add_argument('--output', help='Output file (JSON)')
    parser.add_argument('--json', action='store_true', help='Output as JSON')

    parsed = parser.parse_args(args)
    workspace = os.getcwd()

    partitioner = SmartPartitioner(workspace)
    partitions = partitioner.analyze_and_partition(
        max_partitions=parsed.max,
        min_files_per_partition=parsed.min_files,
        strategy=parsed.strategy
    )

    if parsed.output:
        partitioner.export_partitions(parsed.output)
        print(f"✅ Partitions exported to {parsed.output}")

    if parsed.json:
        data = partitioner.export_partitions()
        print(json.dumps(data, indent=2))
        return 0

    if not partitions:
        print("No partitions created")
        return 1

    print(f"\n📦 Smart Partitions ({len(partitions)} total)")
    print("=" * 60)

    for p in partitions:
        print(f"\n{p.partition_id}")
        print(f"  Name: {p.name}")
        print(f"  Files: {len(p.files)}")
        print(f"  Primary: {os.path.relpath(p.primary_file, workspace)}")
        print(f"  Boundary files: {len(p.boundary_files)}")
        print(f"  Internal coupling: {p.internal_coupling:.2%}")
        print(f"  External coupling: {p.external_coupling:.2%}")
        print(f"  Change frequency: {p.change_frequency:.2%}")
        print(f"  Recommended agents: {p.recommended_agents}")
        if p.tags:
            print(f"  Tags: {', '.join(p.tags)}")

    # Show repartition suggestion
    suggestion = partitioner.suggest_repartition()
    if suggestion and suggestion.get('should_repartition'):
        print("\n⚠️ Repartitioning Suggested:")
        for issue in suggestion['issues']:
            print(f"  - {issue['partition']}: {issue['message']}")

    return 0


def cmd_suggest(args):
    """Suggest optimal partitioning strategy."""
    workspace = os.getcwd()

    print("\n🔍 Analyzing codebase for optimal partitioning...")

    partitioner = SmartPartitioner(workspace)

    # Try different strategies
    strategies = ['balanced', 'coupling', 'hotspot']
    results = []

    for strategy in strategies:
        partitions = partitioner.analyze_and_partition(strategy=strategy)

        avg_internal = sum(p.internal_coupling for p in partitions) / len(partitions) if partitions else 0
        avg_external = sum(p.external_coupling for p in partitions) / len(partitions) if partitions else 0

        results.append({
            'strategy': strategy,
            'partitions': len(partitions),
            'avg_internal': avg_internal,
            'avg_external': avg_external,
            'score': avg_internal - avg_external  # Higher is better
        })

    print("\n📊 Strategy Comparison")
    print("=" * 50)

    for r in sorted(results, key=lambda x: x['score'], reverse=True):
        print(f"\n  {r['strategy'].upper()}")
        print(f"    Internal coupling: {r['avg_internal']:.2%}")
        print(f"    External coupling: {r['avg_external']:.2%}")
        print(f"    Score: {r['score']:.3f}")

    best = max(results, key=lambda x: x['score'])
    print(f"\n✅ Recommended strategy: {best['strategy'].upper()}")

    return 0


def main():
    if len(sys.argv) < 2:
        print("Usage: ensemble_smart_partition.py <command> [args]")
        print("\nCommands:")
        print("  analyze   - Analyze file dependencies")
        print("  changes   - Analyze change frequency")
        print("  partition - Create smart partitions")
        print("  suggest   - Suggest optimal strategy")
        return 1

    commands = {
        'analyze': cmd_analyze,
        'changes': cmd_changes,
        'partition': cmd_partition,
        'suggest': cmd_suggest
    }

    cmd = sys.argv[1]
    if cmd not in commands:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        return 1

    return commands[cmd](sys.argv[2:])


if __name__ == '__main__':
    sys.exit(main())
