#!/usr/bin/env python3
"""
Ensemble Partition Manager v5.0.0
==================================
Partition system for parallel multi-agent work distribution

Features:
- Automatic partition recommendation based on directory structure
- Partition boundary validation
- Conflict detection across partitions
- Load balancing for task distribution
- Sub-task management and tracking

Usage:
    python ensemble_partition.py recommend --depth 2
    python ensemble_partition.py validate --partition src/frontend/
    python ensemble_partition.py assign --agent CLAUDE-1 --partition src/frontend/
    python ensemble_partition.py status
"""

import os
import sys
import json
import fnmatch
import hashlib
from pathlib import Path
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Dict, List, Set, Optional, Tuple
from collections import defaultdict

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

WORKSPACE = os.environ.get("ENSEMBLE_WORKSPACE", os.getcwd())
PARTITION_FILE = ".ensemble_partitions.json"

# Directories to ignore when analyzing
IGNORE_DIRS = {
    '.git', '.notes', '.vibe', '.agent', '__pycache__', 'node_modules',
    '.venv', 'venv', 'env', '.env', 'dist', 'build', '.cache',
    'coverage', '.pytest_cache', '.mypy_cache'
}

# File extensions by category
FILE_CATEGORIES = {
    'frontend': {'.tsx', '.jsx', '.vue', '.svelte', '.css', '.scss', '.less', '.html'},
    'backend': {'.py', '.go', '.rs', '.java', '.rb', '.php'},
    'test': {'.test.ts', '.test.js', '.spec.ts', '.spec.js', '_test.py', '_test.go'},
    'config': {'.json', '.yaml', '.yml', '.toml', '.ini', '.env'},
    'docs': {'.md', '.rst', '.txt', '.adoc'},
}

# ═══════════════════════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Partition:
    """Partition definition"""
    id: str
    path: str
    agent_id: Optional[str] = None
    description: str = ""
    file_patterns: List[str] = field(default_factory=list)
    exclude_patterns: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> 'Partition':
        return cls(**data)

    def matches(self, file_path: str) -> bool:
        """Check if file path belongs to this partition"""
        # Normalize path
        rel_path = file_path
        if os.path.isabs(file_path):
            rel_path = os.path.relpath(file_path, WORKSPACE)

        # Check exclude patterns first
        for pattern in self.exclude_patterns:
            if fnmatch.fnmatch(rel_path, pattern):
                return False

        # Check if in partition path
        if rel_path.startswith(self.path.rstrip('/') + '/') or rel_path == self.path:
            return True

        # Check file patterns
        for pattern in self.file_patterns:
            if fnmatch.fnmatch(rel_path, pattern):
                return True

        return False


@dataclass
class SubTask:
    """Sub-task for parallel work"""
    id: str
    parent_task_id: str
    title: str
    partition_id: str
    agent_id: Optional[str] = None
    status: str = "PENDING"  # PENDING, IN_PROGRESS, COMPLETED, BLOCKED
    files: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)  # Other sub-task IDs
    progress: int = 0  # 0-100
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> 'SubTask':
        return cls(**data)


@dataclass
class PartitionAnalysis:
    """Analysis of directory for partitioning"""
    path: str
    file_count: int = 0
    total_lines: int = 0
    categories: Dict[str, int] = field(default_factory=dict)
    dependencies: Set[str] = field(default_factory=set)
    complexity_score: float = 0.0
    recommended_agents: int = 1

    def to_dict(self) -> dict:
        return {
            **asdict(self),
            'dependencies': list(self.dependencies)
        }


# ═══════════════════════════════════════════════════════════════════════════════
# PARTITION MANAGER
# ═══════════════════════════════════════════════════════════════════════════════

class PartitionManager:
    """
    Manages workspace partitions for parallel multi-agent work

    Responsibilities:
    - Recommend optimal partitions based on codebase structure
    - Assign agents to partitions
    - Validate partition boundaries
    - Track sub-tasks and progress
    - Detect and resolve conflicts
    """

    def __init__(self, workspace: str = None):
        self.workspace = os.path.abspath(workspace or WORKSPACE)
        self.partitions: Dict[str, Partition] = {}
        self.subtasks: Dict[str, SubTask] = {}
        self._load_state()

    def _get_state_file(self) -> Path:
        return Path(self.workspace) / ".notes" / PARTITION_FILE

    def _load_state(self):
        """Load partition state from file"""
        state_file = self._get_state_file()
        if not state_file.exists():
            return

        try:
            with open(state_file, 'r') as f:
                data = json.load(f)

            for pid, pdata in data.get('partitions', {}).items():
                self.partitions[pid] = Partition.from_dict(pdata)

            for stid, stdata in data.get('subtasks', {}).items():
                self.subtasks[stid] = SubTask.from_dict(stdata)

        except Exception as e:
            print(f"Warning: Failed to load partition state: {e}")

    def _save_state(self):
        """Save partition state to file"""
        state_file = self._get_state_file()
        state_file.parent.mkdir(parents=True, exist_ok=True)

        data = {
            'partitions': {pid: p.to_dict() for pid, p in self.partitions.items()},
            'subtasks': {stid: st.to_dict() for stid, st in self.subtasks.items()},
            'updated_at': datetime.now(timezone.utc).isoformat()
        }

        with open(state_file, 'w') as f:
            json.dump(data, f, indent=2)

    # ─────────────────────────────────────────────────────────────────────────
    # Partition Recommendation
    # ─────────────────────────────────────────────────────────────────────────

    def analyze_directory(self, path: str) -> PartitionAnalysis:
        """Analyze a directory for partitioning suitability"""
        full_path = os.path.join(self.workspace, path)
        if not os.path.isdir(full_path):
            return PartitionAnalysis(path=path)

        analysis = PartitionAnalysis(path=path)
        categories = defaultdict(int)

        for root, dirs, files in os.walk(full_path):
            # Filter ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

            for file in files:
                analysis.file_count += 1
                ext = os.path.splitext(file)[1].lower()

                # Count lines
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', errors='ignore') as f:
                        lines = sum(1 for _ in f)
                        analysis.total_lines += lines
                except:
                    pass

                # Categorize
                for cat, exts in FILE_CATEGORIES.items():
                    if ext in exts or any(file.endswith(e) for e in exts if e.startswith('.')):
                        categories[cat] += 1
                        break

                # Look for imports/dependencies
                if ext in {'.py', '.ts', '.js', '.tsx', '.jsx'}:
                    self._analyze_imports(file_path, analysis.dependencies)

        analysis.categories = dict(categories)

        # Calculate complexity score
        analysis.complexity_score = (
            analysis.file_count * 0.1 +
            analysis.total_lines * 0.001 +
            len(analysis.dependencies) * 0.5
        )

        # Recommend number of agents based on complexity
        if analysis.complexity_score < 10:
            analysis.recommended_agents = 1
        elif analysis.complexity_score < 50:
            analysis.recommended_agents = 2
        else:
            analysis.recommended_agents = min(3, int(analysis.complexity_score / 30))

        return analysis

    def _analyze_imports(self, file_path: str, dependencies: Set[str]):
        """Extract import dependencies from file"""
        try:
            with open(file_path, 'r', errors='ignore') as f:
                content = f.read()

            # Python imports
            import re
            for match in re.finditer(r'^(?:from|import)\s+([\w.]+)', content, re.MULTILINE):
                dep = match.group(1).split('.')[0]
                if not dep.startswith('_'):
                    dependencies.add(dep)

            # JS/TS imports
            for match in re.finditer(r"(?:import|require)\s*\(?['\"]([^'\"]+)['\"]", content):
                dep = match.group(1)
                if dep.startswith('.'):
                    # Relative import - extract directory
                    rel_path = os.path.dirname(file_path)
                    dep_path = os.path.normpath(os.path.join(rel_path, dep))
                    dependencies.add(os.path.relpath(dep_path, self.workspace))

        except:
            pass

    def recommend_partitions(self, max_depth: int = 2, min_files: int = 5) -> List[PartitionAnalysis]:
        """Recommend partitions based on directory structure"""
        recommendations = []

        def scan_dir(path: str, depth: int):
            if depth > max_depth:
                return

            full_path = os.path.join(self.workspace, path) if path else self.workspace
            if not os.path.isdir(full_path):
                return

            try:
                entries = os.listdir(full_path)
            except PermissionError:
                return

            for entry in entries:
                if entry in IGNORE_DIRS or entry.startswith('.'):
                    continue

                entry_path = os.path.join(path, entry) if path else entry
                full_entry_path = os.path.join(self.workspace, entry_path)

                if os.path.isdir(full_entry_path):
                    analysis = self.analyze_directory(entry_path)
                    if analysis.file_count >= min_files:
                        recommendations.append(analysis)

                    # Recurse
                    scan_dir(entry_path, depth + 1)

        scan_dir("", 0)

        # Sort by complexity score descending
        recommendations.sort(key=lambda x: x.complexity_score, reverse=True)

        return recommendations

    # ─────────────────────────────────────────────────────────────────────────
    # Partition Management
    # ─────────────────────────────────────────────────────────────────────────

    def create_partition(
        self,
        path: str,
        description: str = "",
        file_patterns: List[str] = None,
        exclude_patterns: List[str] = None
    ) -> Partition:
        """Create a new partition"""
        # Generate ID
        pid = f"PART-{path.replace('/', '-').strip('-')}"

        partition = Partition(
            id=pid,
            path=path.rstrip('/') + '/',
            description=description or f"Partition for {path}",
            file_patterns=file_patterns or [],
            exclude_patterns=exclude_patterns or []
        )

        self.partitions[pid] = partition
        self._save_state()

        return partition

    def assign_agent(self, partition_id: str, agent_id: str) -> bool:
        """Assign an agent to a partition"""
        if partition_id not in self.partitions:
            return False

        # Check if agent is already assigned elsewhere
        for pid, partition in self.partitions.items():
            if partition.agent_id == agent_id and pid != partition_id:
                # Unassign from previous partition
                partition.agent_id = None
                partition.updated_at = datetime.now(timezone.utc).isoformat()

        self.partitions[partition_id].agent_id = agent_id
        self.partitions[partition_id].updated_at = datetime.now(timezone.utc).isoformat()
        self._save_state()

        return True

    def unassign_agent(self, agent_id: str):
        """Unassign agent from all partitions"""
        for partition in self.partitions.values():
            if partition.agent_id == agent_id:
                partition.agent_id = None
                partition.updated_at = datetime.now(timezone.utc).isoformat()
        self._save_state()

    def get_partition_for_file(self, file_path: str) -> Optional[Partition]:
        """Get the partition that contains a file"""
        for partition in self.partitions.values():
            if partition.matches(file_path):
                return partition
        return None

    def get_agent_partition(self, agent_id: str) -> Optional[Partition]:
        """Get partition assigned to an agent"""
        for partition in self.partitions.values():
            if partition.agent_id == agent_id:
                return partition
        return None

    # ─────────────────────────────────────────────────────────────────────────
    # Validation
    # ─────────────────────────────────────────────────────────────────────────

    def validate_partition(self, partition_id: str) -> Dict:
        """Validate a partition's integrity"""
        if partition_id not in self.partitions:
            return {"valid": False, "error": "Partition not found"}

        partition = self.partitions[partition_id]
        full_path = os.path.join(self.workspace, partition.path)

        result = {
            "valid": True,
            "partition_id": partition_id,
            "path": partition.path,
            "exists": os.path.exists(full_path),
            "file_count": 0,
            "conflicts": [],
            "warnings": []
        }

        if not result["exists"]:
            result["valid"] = False
            result["error"] = f"Path does not exist: {partition.path}"
            return result

        # Count files
        for root, _, files in os.walk(full_path):
            result["file_count"] += len(files)

        # Check for overlaps with other partitions
        for other_id, other in self.partitions.items():
            if other_id == partition_id:
                continue

            # Check path overlap
            if partition.path.startswith(other.path) or other.path.startswith(partition.path):
                result["conflicts"].append({
                    "type": "path_overlap",
                    "other_partition": other_id,
                    "other_path": other.path
                })

        if result["conflicts"]:
            result["warnings"].append("Partition has overlapping paths with other partitions")

        return result

    def check_file_access(self, agent_id: str, file_path: str) -> Dict:
        """Check if an agent can access a file"""
        partition = self.get_agent_partition(agent_id)

        result = {
            "allowed": True,
            "agent_id": agent_id,
            "file_path": file_path,
            "partition": partition.id if partition else None,
            "reason": ""
        }

        if not partition:
            # Agent has no partition - can access anything (legacy mode)
            result["reason"] = "Agent has no partition assigned (unrestricted)"
            return result

        if partition.matches(file_path):
            result["reason"] = f"File is within agent's partition ({partition.path})"
        else:
            result["allowed"] = False
            result["reason"] = f"File is outside agent's partition ({partition.path})"

            # Find which partition owns the file
            owning_partition = self.get_partition_for_file(file_path)
            if owning_partition:
                result["owning_partition"] = owning_partition.id
                result["owning_agent"] = owning_partition.agent_id

        return result

    # ─────────────────────────────────────────────────────────────────────────
    # Sub-task Management
    # ─────────────────────────────────────────────────────────────────────────

    def create_subtask(
        self,
        parent_task_id: str,
        title: str,
        partition_id: str,
        files: List[str] = None,
        dependencies: List[str] = None
    ) -> SubTask:
        """Create a sub-task within a partition"""
        # Generate ID
        count = sum(1 for st in self.subtasks.values() if st.parent_task_id == parent_task_id)
        stid = f"{parent_task_id}-SUB-{count + 1:03d}"

        subtask = SubTask(
            id=stid,
            parent_task_id=parent_task_id,
            title=title,
            partition_id=partition_id,
            files=files or [],
            dependencies=dependencies or []
        )

        # Assign agent from partition
        if partition_id in self.partitions:
            subtask.agent_id = self.partitions[partition_id].agent_id

        self.subtasks[stid] = subtask
        self._save_state()

        return subtask

    def update_subtask_progress(self, subtask_id: str, progress: int, status: str = None):
        """Update sub-task progress"""
        if subtask_id not in self.subtasks:
            return

        st = self.subtasks[subtask_id]
        st.progress = min(100, max(0, progress))

        if status:
            st.status = status

        if progress >= 100:
            st.status = "COMPLETED"
            st.completed_at = datetime.now(timezone.utc).isoformat()

        self._save_state()

    def get_task_progress(self, parent_task_id: str) -> Dict:
        """Get overall progress for a parent task"""
        subtasks = [st for st in self.subtasks.values() if st.parent_task_id == parent_task_id]

        if not subtasks:
            return {
                "parent_task_id": parent_task_id,
                "subtask_count": 0,
                "overall_progress": 0,
                "status": "NO_SUBTASKS"
            }

        total_progress = sum(st.progress for st in subtasks)
        completed = sum(1 for st in subtasks if st.status == "COMPLETED")
        blocked = sum(1 for st in subtasks if st.status == "BLOCKED")

        return {
            "parent_task_id": parent_task_id,
            "subtask_count": len(subtasks),
            "overall_progress": total_progress // len(subtasks),
            "completed": completed,
            "in_progress": sum(1 for st in subtasks if st.status == "IN_PROGRESS"),
            "pending": sum(1 for st in subtasks if st.status == "PENDING"),
            "blocked": blocked,
            "status": "COMPLETED" if completed == len(subtasks) else (
                "BLOCKED" if blocked > 0 else "IN_PROGRESS"
            ),
            "subtasks": [st.to_dict() for st in subtasks]
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Load Balancing
    # ─────────────────────────────────────────────────────────────────────────

    def suggest_load_balance(self) -> List[Dict]:
        """Suggest load balancing changes"""
        suggestions = []

        # Analyze current distribution
        agent_loads = defaultdict(int)
        for st in self.subtasks.values():
            if st.status in ("PENDING", "IN_PROGRESS") and st.agent_id:
                agent_loads[st.agent_id] += 1

        if not agent_loads:
            return suggestions

        avg_load = sum(agent_loads.values()) / len(agent_loads)

        # Find overloaded and underloaded agents
        overloaded = [(aid, load) for aid, load in agent_loads.items() if load > avg_load * 1.5]
        underloaded = [(aid, load) for aid, load in agent_loads.items() if load < avg_load * 0.5]

        for over_agent, over_load in overloaded:
            for under_agent, under_load in underloaded:
                # Find transferable subtasks
                transferable = [
                    st for st in self.subtasks.values()
                    if st.agent_id == over_agent
                    and st.status == "PENDING"
                    and not st.dependencies
                ]

                if transferable:
                    suggestions.append({
                        "type": "transfer",
                        "from_agent": over_agent,
                        "to_agent": under_agent,
                        "subtask": transferable[0].id,
                        "reason": f"Balance load ({over_load} -> {under_load})"
                    })

        return suggestions


# ═══════════════════════════════════════════════════════════════════════════════
# CLI INTERFACE
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_recommend(args):
    """Recommend partitions"""
    pm = PartitionManager(args.workspace)
    recommendations = pm.recommend_partitions(
        max_depth=args.depth,
        min_files=args.min_files
    )

    print("=" * 70)
    print("PARTITION RECOMMENDATIONS")
    print("=" * 70)
    print(f"Workspace: {pm.workspace}")
    print(f"Max Depth: {args.depth}")
    print("")

    if not recommendations:
        print("No suitable partitions found.")
        return

    print(f"Found {len(recommendations)} potential partitions:\n")

    for i, rec in enumerate(recommendations[:10], 1):
        print(f"{i}. {rec.path}/")
        print(f"   Files: {rec.file_count}, Lines: {rec.total_lines}")
        print(f"   Categories: {dict(rec.categories)}")
        print(f"   Complexity: {rec.complexity_score:.1f}")
        print(f"   Recommended Agents: {rec.recommended_agents}")
        print("")


def cmd_create(args):
    """Create a partition"""
    pm = PartitionManager(args.workspace)

    partition = pm.create_partition(
        path=args.path,
        description=args.description or ""
    )

    print(f"✅ Partition created: {partition.id}")
    print(f"   Path: {partition.path}")


def cmd_assign(args):
    """Assign agent to partition"""
    pm = PartitionManager(args.workspace)

    if args.partition not in pm.partitions:
        # Try to find by path
        for pid, p in pm.partitions.items():
            if p.path.rstrip('/') == args.partition.rstrip('/'):
                args.partition = pid
                break
        else:
            print(f"❌ Partition not found: {args.partition}")
            print("   Create it first: ensemble partition create --path <path>")
            return

    if pm.assign_agent(args.partition, args.agent):
        print(f"✅ Assigned {args.agent} to partition {args.partition}")
    else:
        print(f"❌ Failed to assign agent")


def cmd_validate(args):
    """Validate partition"""
    pm = PartitionManager(args.workspace)

    # Find partition
    partition_id = args.partition
    if partition_id not in pm.partitions:
        for pid, p in pm.partitions.items():
            if p.path.rstrip('/') == args.partition.rstrip('/'):
                partition_id = pid
                break
        else:
            print(f"❌ Partition not found: {args.partition}")
            return

    result = pm.validate_partition(partition_id)

    print("=" * 60)
    print("PARTITION VALIDATION")
    print("=" * 60)
    print(f"Partition: {result['partition_id']}")
    print(f"Path: {result['path']}")
    print(f"Exists: {'✅' if result['exists'] else '❌'}")
    print(f"Files: {result['file_count']}")
    print(f"Valid: {'✅' if result['valid'] else '❌'}")

    if result.get('conflicts'):
        print("\nConflicts:")
        for c in result['conflicts']:
            print(f"  ⚠️ {c['type']}: {c['other_partition']}")

    if result.get('warnings'):
        print("\nWarnings:")
        for w in result['warnings']:
            print(f"  ⚠️ {w}")


def cmd_status(args):
    """Show partition status"""
    pm = PartitionManager(args.workspace)

    print("=" * 70)
    print("PARTITION STATUS")
    print("=" * 70)
    print(f"Workspace: {pm.workspace}")
    print(f"Partitions: {len(pm.partitions)}")
    print(f"Sub-tasks: {len(pm.subtasks)}")
    print("")

    if pm.partitions:
        print("Partitions:")
        for pid, p in pm.partitions.items():
            agent = p.agent_id or "(unassigned)"
            print(f"  [{pid}]")
            print(f"    Path: {p.path}")
            print(f"    Agent: {agent}")
            print("")

    if pm.subtasks:
        print("\nSub-tasks:")
        for stid, st in pm.subtasks.items():
            status_icon = {
                "PENDING": "⏳",
                "IN_PROGRESS": "🔄",
                "COMPLETED": "✅",
                "BLOCKED": "🚫"
            }.get(st.status, "❓")
            print(f"  {status_icon} [{stid}] {st.title} ({st.progress}%)")


def cmd_check(args):
    """Check file access for agent"""
    pm = PartitionManager(args.workspace)

    result = pm.check_file_access(args.agent, args.file)

    icon = "✅" if result['allowed'] else "❌"
    print(f"{icon} {args.agent} -> {args.file}")
    print(f"   {result['reason']}")

    if not result['allowed'] and result.get('owning_agent'):
        print(f"   Owner: {result['owning_agent']} (partition: {result['owning_partition']})")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Ensemble Partition Manager v5.0",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--workspace", "-w", default=WORKSPACE, help="Workspace directory")

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # recommend
    p_rec = subparsers.add_parser("recommend", help="Recommend partitions")
    p_rec.add_argument("--depth", "-d", type=int, default=2, help="Max directory depth")
    p_rec.add_argument("--min-files", "-m", type=int, default=5, help="Min files for partition")

    # create
    p_create = subparsers.add_parser("create", help="Create partition")
    p_create.add_argument("--path", "-p", required=True, help="Partition path")
    p_create.add_argument("--description", "-D", help="Description")

    # assign
    p_assign = subparsers.add_parser("assign", help="Assign agent to partition")
    p_assign.add_argument("--partition", "-p", required=True, help="Partition ID or path")
    p_assign.add_argument("--agent", "-a", required=True, help="Agent ID")

    # validate
    p_val = subparsers.add_parser("validate", help="Validate partition")
    p_val.add_argument("--partition", "-p", required=True, help="Partition ID or path")

    # status
    p_status = subparsers.add_parser("status", help="Show partition status")

    # check
    p_check = subparsers.add_parser("check", help="Check file access")
    p_check.add_argument("--agent", "-a", required=True, help="Agent ID")
    p_check.add_argument("--file", "-f", required=True, help="File path")

    args = parser.parse_args()

    if args.command == "recommend":
        cmd_recommend(args)
    elif args.command == "create":
        cmd_create(args)
    elif args.command == "assign":
        cmd_assign(args)
    elif args.command == "validate":
        cmd_validate(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "check":
        cmd_check(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
