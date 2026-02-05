#!/usr/bin/env python3
"""
ensemble_region_lock.py - Region-Level Locking for Multi-Agent Workspace
Ensemble v5.3.0 - Phase 4: Advanced Features

Provides fine-grained locking at function, class, and line range levels.
"""

import ast
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set, Any


class RegionType(Enum):
    """Types of code regions that can be locked."""
    FILE = "file"
    CLASS = "class"
    FUNCTION = "function"
    METHOD = "method"
    LINE_RANGE = "line_range"
    BLOCK = "block"  # Generic block (e.g., if/for/with)


@dataclass
class CodeRegion:
    """Represents a region of code that can be locked."""
    file_path: str
    region_type: RegionType
    name: str  # e.g., "MyClass", "my_function", "lines:10-50"
    start_line: int
    end_line: int
    parent: Optional[str] = None  # Parent region name (e.g., class for method)
    children: List[str] = field(default_factory=list)

    @property
    def region_id(self) -> str:
        """Generate unique region ID."""
        return f"{self.file_path}:{self.region_type.value}:{self.name}"

    def contains_line(self, line: int) -> bool:
        """Check if a line is within this region."""
        return self.start_line <= line <= self.end_line

    def overlaps(self, other: 'CodeRegion') -> bool:
        """Check if this region overlaps with another."""
        if self.file_path != other.file_path:
            return False
        return not (self.end_line < other.start_line or self.start_line > other.end_line)

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            'file_path': self.file_path,
            'region_type': self.region_type.value,
            'name': self.name,
            'start_line': self.start_line,
            'end_line': self.end_line,
            'parent': self.parent,
            'children': self.children,
            'region_id': self.region_id
        }


@dataclass
class RegionLock:
    """Represents a lock on a code region."""
    region_id: str
    agent_id: str
    lock_type: str  # "EXCLUSIVE" or "SHARED"
    acquired_at: str
    ttl: int  # seconds
    file_path: str
    region_type: str
    start_line: int
    end_line: int

    def is_expired(self) -> bool:
        """Check if the lock has expired."""
        acquired = datetime.fromisoformat(self.acquired_at.replace('Z', '+00:00'))
        now = datetime.now(acquired.tzinfo) if acquired.tzinfo else datetime.now()
        elapsed = (now - acquired.replace(tzinfo=None)).total_seconds()
        return elapsed > self.ttl

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return asdict(self)


class PythonRegionParser:
    """Parse Python files to identify code regions."""

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.regions: List[CodeRegion] = []

    def parse(self) -> List[CodeRegion]:
        """Parse the file and extract all code regions."""
        try:
            with open(self.file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')

            tree = ast.parse(content, filename=self.file_path)
            self._extract_regions(tree, lines)
            return self.regions
        except SyntaxError as e:
            # If AST parsing fails, try line-based fallback
            return self._parse_fallback()
        except Exception as e:
            print(f"Error parsing {self.file_path}: {e}", file=sys.stderr)
            return []

    def _extract_regions(self, tree: ast.AST, lines: List[str], parent: str = None):
        """Recursively extract code regions from AST."""
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                end_line = self._get_end_line(node, lines)
                region = CodeRegion(
                    file_path=self.file_path,
                    region_type=RegionType.CLASS,
                    name=node.name,
                    start_line=node.lineno,
                    end_line=end_line,
                    parent=parent
                )
                self.regions.append(region)

                # Extract methods within class
                for item in node.body:
                    if isinstance(item, ast.FunctionDef) or isinstance(item, ast.AsyncFunctionDef):
                        method_end = self._get_end_line(item, lines)
                        method_region = CodeRegion(
                            file_path=self.file_path,
                            region_type=RegionType.METHOD,
                            name=f"{node.name}.{item.name}",
                            start_line=item.lineno,
                            end_line=method_end,
                            parent=node.name
                        )
                        self.regions.append(method_region)
                        region.children.append(method_region.name)

            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # Only top-level functions (not methods)
                if not any(isinstance(parent_node, ast.ClassDef)
                          for parent_node in ast.walk(tree)
                          if hasattr(parent_node, 'body') and node in getattr(parent_node, 'body', [])):
                    end_line = self._get_end_line(node, lines)
                    region = CodeRegion(
                        file_path=self.file_path,
                        region_type=RegionType.FUNCTION,
                        name=node.name,
                        start_line=node.lineno,
                        end_line=end_line,
                        parent=parent
                    )
                    # Check if not already added via class processing
                    if not any(r.name == node.name and r.region_type == RegionType.FUNCTION
                              for r in self.regions):
                        self.regions.append(region)

    def _get_end_line(self, node: ast.AST, lines: List[str]) -> int:
        """Get the end line of an AST node."""
        if hasattr(node, 'end_lineno') and node.end_lineno:
            return node.end_lineno

        # Fallback: estimate based on indentation
        start_line = node.lineno
        if start_line >= len(lines):
            return start_line

        start_indent = len(lines[start_line - 1]) - len(lines[start_line - 1].lstrip())

        for i in range(start_line, len(lines)):
            line = lines[i]
            if line.strip() and not line.strip().startswith('#'):
                current_indent = len(line) - len(line.lstrip())
                if current_indent <= start_indent and i > start_line:
                    return i

        return len(lines)

    def _parse_fallback(self) -> List[CodeRegion]:
        """Fallback parser using regex for when AST fails."""
        regions = []
        try:
            with open(self.file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()

            class_pattern = re.compile(r'^class\s+(\w+)')
            func_pattern = re.compile(r'^(\s*)def\s+(\w+)')
            async_func_pattern = re.compile(r'^(\s*)async\s+def\s+(\w+)')

            current_class = None
            class_indent = 0

            for i, line in enumerate(lines, 1):
                # Check for class
                class_match = class_pattern.match(line)
                if class_match:
                    current_class = class_match.group(1)
                    class_indent = 0
                    # Estimate end line (simplified)
                    end_line = self._find_block_end(lines, i - 1, class_indent)
                    regions.append(CodeRegion(
                        file_path=self.file_path,
                        region_type=RegionType.CLASS,
                        name=current_class,
                        start_line=i,
                        end_line=end_line
                    ))
                    continue

                # Check for function/method
                for pattern in [func_pattern, async_func_pattern]:
                    func_match = pattern.match(line)
                    if func_match:
                        indent = len(func_match.group(1))
                        func_name = func_match.group(2)
                        end_line = self._find_block_end(lines, i - 1, indent)

                        if current_class and indent > class_indent:
                            # Method
                            regions.append(CodeRegion(
                                file_path=self.file_path,
                                region_type=RegionType.METHOD,
                                name=f"{current_class}.{func_name}",
                                start_line=i,
                                end_line=end_line,
                                parent=current_class
                            ))
                        else:
                            # Top-level function
                            regions.append(CodeRegion(
                                file_path=self.file_path,
                                region_type=RegionType.FUNCTION,
                                name=func_name,
                                start_line=i,
                                end_line=end_line
                            ))
                            current_class = None
                        break

            return regions
        except Exception:
            return []

    def _find_block_end(self, lines: List[str], start_idx: int, base_indent: int) -> int:
        """Find the end of a code block based on indentation."""
        for i in range(start_idx + 1, len(lines)):
            line = lines[i]
            if line.strip() and not line.strip().startswith('#'):
                current_indent = len(line) - len(line.lstrip())
                if current_indent <= base_indent:
                    return i
        return len(lines)


class JavaScriptRegionParser:
    """Parse JavaScript/TypeScript files to identify code regions."""

    def __init__(self, file_path: str):
        self.file_path = file_path
        self.regions: List[CodeRegion] = []

    def parse(self) -> List[CodeRegion]:
        """Parse the file and extract all code regions."""
        try:
            with open(self.file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')

            # Class pattern
            class_pattern = re.compile(r'^(?:export\s+)?class\s+(\w+)', re.MULTILINE)
            # Function patterns
            func_patterns = [
                re.compile(r'^(?:export\s+)?(?:async\s+)?function\s+(\w+)', re.MULTILINE),
                re.compile(r'^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(', re.MULTILINE),
                re.compile(r'^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?function', re.MULTILINE),
            ]
            # Method pattern (inside class)
            method_pattern = re.compile(r'^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*{', re.MULTILINE)

            # Find classes
            for match in class_pattern.finditer(content):
                class_name = match.group(1)
                start_line = content[:match.start()].count('\n') + 1
                end_line = self._find_brace_end(content, match.end())

                region = CodeRegion(
                    file_path=self.file_path,
                    region_type=RegionType.CLASS,
                    name=class_name,
                    start_line=start_line,
                    end_line=end_line
                )
                self.regions.append(region)

            # Find functions
            for pattern in func_patterns:
                for match in pattern.finditer(content):
                    func_name = match.group(1)
                    start_line = content[:match.start()].count('\n') + 1
                    end_line = self._find_brace_end(content, match.end())

                    # Skip if inside a class
                    if not self._is_inside_class(start_line):
                        region = CodeRegion(
                            file_path=self.file_path,
                            region_type=RegionType.FUNCTION,
                            name=func_name,
                            start_line=start_line,
                            end_line=end_line
                        )
                        if not any(r.name == func_name for r in self.regions):
                            self.regions.append(region)

            return self.regions
        except Exception as e:
            print(f"Error parsing {self.file_path}: {e}", file=sys.stderr)
            return []

    def _find_brace_end(self, content: str, start_pos: int) -> int:
        """Find the line number where a brace block ends."""
        brace_count = 0
        started = False

        for i, char in enumerate(content[start_pos:], start_pos):
            if char == '{':
                brace_count += 1
                started = True
            elif char == '}':
                brace_count -= 1
                if started and brace_count == 0:
                    return content[:i].count('\n') + 1

        return content.count('\n') + 1

    def _is_inside_class(self, line: int) -> bool:
        """Check if a line is inside any parsed class."""
        for region in self.regions:
            if region.region_type == RegionType.CLASS:
                if region.start_line < line < region.end_line:
                    return True
        return False


class RegionLockManager:
    """Manages region-level locks across multiple agents."""

    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)
        self.locks: Dict[str, RegionLock] = {}
        self.region_cache: Dict[str, List[CodeRegion]] = {}
        self.lock_file = os.path.join(workspace, '.notes', 'ACTIVE', '_region_locks.json')
        self._load_locks()

    def _load_locks(self):
        """Load existing locks from file."""
        if os.path.exists(self.lock_file):
            try:
                with open(self.lock_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for region_id, lock_data in data.get('locks', {}).items():
                        self.locks[region_id] = RegionLock(**lock_data)
            except Exception:
                pass

    def _save_locks(self):
        """Save locks to file."""
        os.makedirs(os.path.dirname(self.lock_file), exist_ok=True)
        data = {
            'locks': {region_id: lock.to_dict() for region_id, lock in self.locks.items()},
            'updated_at': datetime.now().isoformat()
        }
        with open(self.lock_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

    def get_parser(self, file_path: str):
        """Get appropriate parser for file type."""
        ext = os.path.splitext(file_path)[1].lower()
        if ext in ['.py']:
            return PythonRegionParser(file_path)
        elif ext in ['.js', '.jsx', '.ts', '.tsx']:
            return JavaScriptRegionParser(file_path)
        return None

    def parse_file(self, file_path: str, force: bool = False) -> List[CodeRegion]:
        """Parse a file and cache the regions."""
        abs_path = os.path.abspath(file_path)

        if not force and abs_path in self.region_cache:
            return self.region_cache[abs_path]

        parser = self.get_parser(abs_path)
        if parser:
            regions = parser.parse()
            self.region_cache[abs_path] = regions
            return regions

        return []

    def find_region(self, file_path: str, identifier: str) -> Optional[CodeRegion]:
        """
        Find a region by identifier.

        Identifier can be:
        - Function/class name: "MyClass", "my_function"
        - Method: "MyClass.my_method"
        - Line range: "lines:10-50"
        """
        abs_path = os.path.abspath(file_path)
        regions = self.parse_file(abs_path)

        # Check for line range
        line_match = re.match(r'lines?:(\d+)-(\d+)', identifier)
        if line_match:
            start = int(line_match.group(1))
            end = int(line_match.group(2))
            return CodeRegion(
                file_path=abs_path,
                region_type=RegionType.LINE_RANGE,
                name=identifier,
                start_line=start,
                end_line=end
            )

        # Search in parsed regions
        for region in regions:
            if region.name == identifier:
                return region

        return None

    def find_regions_at_line(self, file_path: str, line: int) -> List[CodeRegion]:
        """Find all regions that contain a specific line."""
        abs_path = os.path.abspath(file_path)
        regions = self.parse_file(abs_path)
        return [r for r in regions if r.contains_line(line)]

    def acquire_lock(
        self,
        file_path: str,
        region_identifier: str,
        agent_id: str,
        lock_type: str = "EXCLUSIVE",
        ttl: int = 300
    ) -> Tuple[bool, Optional[str]]:
        """
        Acquire a lock on a code region.

        Returns:
            (success, error_message)
        """
        # Clean expired locks first
        self._clean_expired_locks()

        abs_path = os.path.abspath(file_path)
        region = self.find_region(abs_path, region_identifier)

        if not region:
            return False, f"Region not found: {region_identifier}"

        region_id = region.region_id

        # Check for existing lock
        if region_id in self.locks:
            existing = self.locks[region_id]
            if existing.agent_id == agent_id:
                # Same agent, extend lock
                existing.acquired_at = datetime.now().isoformat()
                existing.ttl = ttl
                self._save_locks()
                return True, None
            elif lock_type == "SHARED" and existing.lock_type == "SHARED":
                # Both shared, allow
                pass
            else:
                return False, f"Region locked by {existing.agent_id}"

        # Check for overlapping locks (for EXCLUSIVE)
        if lock_type == "EXCLUSIVE":
            for rid, lock in self.locks.items():
                if lock.file_path == abs_path and not lock.is_expired():
                    other_region = CodeRegion(
                        file_path=lock.file_path,
                        region_type=RegionType(lock.region_type),
                        name=lock.region_id.split(':')[-1],
                        start_line=lock.start_line,
                        end_line=lock.end_line
                    )
                    if region.overlaps(other_region) and lock.agent_id != agent_id:
                        return False, f"Overlapping region locked by {lock.agent_id}"

        # Create lock
        self.locks[region_id] = RegionLock(
            region_id=region_id,
            agent_id=agent_id,
            lock_type=lock_type,
            acquired_at=datetime.now().isoformat(),
            ttl=ttl,
            file_path=abs_path,
            region_type=region.region_type.value,
            start_line=region.start_line,
            end_line=region.end_line
        )

        self._save_locks()
        return True, None

    def release_lock(self, file_path: str, region_identifier: str, agent_id: str) -> Tuple[bool, Optional[str]]:
        """Release a lock on a code region."""
        abs_path = os.path.abspath(file_path)
        region = self.find_region(abs_path, region_identifier)

        if not region:
            return False, f"Region not found: {region_identifier}"

        region_id = region.region_id

        if region_id not in self.locks:
            return False, "No lock exists"

        lock = self.locks[region_id]
        if lock.agent_id != agent_id:
            return False, f"Lock owned by {lock.agent_id}"

        del self.locks[region_id]
        self._save_locks()
        return True, None

    def check_access(self, file_path: str, line: int, agent_id: str) -> Dict:
        """Check if an agent can access a specific line."""
        abs_path = os.path.abspath(file_path)
        self._clean_expired_locks()

        blocking_locks = []
        for lock in self.locks.values():
            if lock.file_path == abs_path and not lock.is_expired():
                if lock.start_line <= line <= lock.end_line:
                    if lock.agent_id != agent_id:
                        blocking_locks.append(lock)

        return {
            'can_access': len(blocking_locks) == 0,
            'blocking_locks': [l.to_dict() for l in blocking_locks]
        }

    def get_available_regions(self, file_path: str, agent_id: str) -> List[Dict]:
        """Get all regions that an agent can lock."""
        abs_path = os.path.abspath(file_path)
        regions = self.parse_file(abs_path)
        self._clean_expired_locks()

        available = []
        for region in regions:
            region_id = region.region_id

            # Check if already locked by another agent
            if region_id in self.locks:
                lock = self.locks[region_id]
                if lock.agent_id != agent_id and not lock.is_expired():
                    continue

            # Check for overlapping locks
            has_overlap = False
            for lock in self.locks.values():
                if lock.file_path == abs_path and lock.agent_id != agent_id:
                    other_region = CodeRegion(
                        file_path=lock.file_path,
                        region_type=RegionType(lock.region_type),
                        name=lock.region_id.split(':')[-1],
                        start_line=lock.start_line,
                        end_line=lock.end_line
                    )
                    if region.overlaps(other_region):
                        has_overlap = True
                        break

            if not has_overlap:
                available.append(region.to_dict())

        return available

    def get_all_locks(self, file_path: str = None) -> List[Dict]:
        """Get all active locks, optionally filtered by file."""
        self._clean_expired_locks()

        result = []
        for lock in self.locks.values():
            if file_path is None or lock.file_path == os.path.abspath(file_path):
                result.append(lock.to_dict())

        return result

    def _clean_expired_locks(self):
        """Remove expired locks."""
        expired = [rid for rid, lock in self.locks.items() if lock.is_expired()]
        for rid in expired:
            del self.locks[rid]

        if expired:
            self._save_locks()


# CLI Interface
def cmd_parse(args):
    """Parse a file and show regions."""
    if len(args) < 1:
        print("Usage: ensemble_region_lock.py parse <file>", file=sys.stderr)
        return 1

    file_path = args[0]
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}", file=sys.stderr)
        return 1

    workspace = os.getcwd()
    manager = RegionLockManager(workspace)
    regions = manager.parse_file(file_path)

    if not regions:
        print("No regions found (or unsupported file type)")
        return 0

    print(f"\n📄 Regions in {file_path}")
    print("=" * 60)

    for region in regions:
        icon = {
            RegionType.CLASS: "📦",
            RegionType.FUNCTION: "🔧",
            RegionType.METHOD: "  └─",
            RegionType.LINE_RANGE: "📍",
            RegionType.BLOCK: "📝"
        }.get(region.region_type, "•")

        print(f"{icon} {region.name}")
        print(f"   Type: {region.region_type.value}")
        print(f"   Lines: {region.start_line}-{region.end_line}")
        if region.parent:
            print(f"   Parent: {region.parent}")
        print()

    return 0


def cmd_lock(args):
    """Acquire a lock on a region."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_region_lock.py lock')
    parser.add_argument('--file', required=True, help='File path')
    parser.add_argument('--region', required=True, help='Region identifier (name or lines:N-M)')
    parser.add_argument('--agent', required=True, help='Agent ID')
    parser.add_argument('--type', default='EXCLUSIVE', choices=['EXCLUSIVE', 'SHARED'])
    parser.add_argument('--ttl', type=int, default=300, help='Lock TTL in seconds')

    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    manager = RegionLockManager(workspace)

    success, error = manager.acquire_lock(
        parsed.file,
        parsed.region,
        parsed.agent,
        parsed.type,
        parsed.ttl
    )

    if success:
        print(f"✅ Lock acquired: {parsed.region} in {parsed.file}")
        return 0
    else:
        print(f"❌ Lock failed: {error}", file=sys.stderr)
        return 1


def cmd_unlock(args):
    """Release a lock on a region."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_region_lock.py unlock')
    parser.add_argument('--file', required=True, help='File path')
    parser.add_argument('--region', required=True, help='Region identifier')
    parser.add_argument('--agent', required=True, help='Agent ID')

    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    manager = RegionLockManager(workspace)

    success, error = manager.release_lock(parsed.file, parsed.region, parsed.agent)

    if success:
        print(f"✅ Lock released: {parsed.region}")
        return 0
    else:
        print(f"❌ Release failed: {error}", file=sys.stderr)
        return 1


def cmd_check(args):
    """Check access to a line or region."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_region_lock.py check')
    parser.add_argument('--file', required=True, help='File path')
    parser.add_argument('--line', type=int, help='Line number to check')
    parser.add_argument('--agent', required=True, help='Agent ID')

    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    manager = RegionLockManager(workspace)

    if parsed.line:
        result = manager.check_access(parsed.file, parsed.line, parsed.agent)
        if result['can_access']:
            print(f"✅ Line {parsed.line} is accessible")
        else:
            print(f"🔒 Line {parsed.line} is locked:")
            for lock in result['blocking_locks']:
                print(f"   - By {lock['agent_id']} ({lock['region_type']}: {lock['start_line']}-{lock['end_line']})")
        return 0 if result['can_access'] else 1

    return 0


def cmd_status(args):
    """Show all active locks."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_region_lock.py status')
    parser.add_argument('--file', help='Filter by file')
    parser.add_argument('--json', action='store_true', help='Output as JSON')

    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    manager = RegionLockManager(workspace)

    locks = manager.get_all_locks(parsed.file)

    if parsed.json:
        print(json.dumps(locks, indent=2))
        return 0

    if not locks:
        print("No active region locks")
        return 0

    print("\n🔒 Active Region Locks")
    print("=" * 60)

    for lock in locks:
        rel_path = os.path.relpath(lock['file_path'], workspace)
        print(f"\n📍 {rel_path}:{lock['region_type']}:{lock['region_id'].split(':')[-1]}")
        print(f"   Agent: {lock['agent_id']}")
        print(f"   Type: {lock['lock_type']}")
        print(f"   Lines: {lock['start_line']}-{lock['end_line']}")
        print(f"   TTL: {lock['ttl']}s")

    return 0


def cmd_available(args):
    """Show available regions for locking."""
    import argparse
    parser = argparse.ArgumentParser(prog='ensemble_region_lock.py available')
    parser.add_argument('--file', required=True, help='File path')
    parser.add_argument('--agent', required=True, help='Agent ID')

    parsed = parser.parse_args(args)

    workspace = os.getcwd()
    manager = RegionLockManager(workspace)

    available = manager.get_available_regions(parsed.file, parsed.agent)

    if not available:
        print("No available regions (file may be fully locked or unsupported)")
        return 0

    print(f"\n✅ Available regions in {parsed.file} for {parsed.agent}")
    print("=" * 60)

    for region in available:
        print(f"  • {region['name']} ({region['region_type']}) - lines {region['start_line']}-{region['end_line']}")

    return 0


def main():
    if len(sys.argv) < 2:
        print("Usage: ensemble_region_lock.py <command> [args]")
        print("\nCommands:")
        print("  parse     - Parse file and show regions")
        print("  lock      - Acquire a region lock")
        print("  unlock    - Release a region lock")
        print("  check     - Check access to a line")
        print("  status    - Show all active locks")
        print("  available - Show available regions for locking")
        return 1

    commands = {
        'parse': cmd_parse,
        'lock': cmd_lock,
        'unlock': cmd_unlock,
        'check': cmd_check,
        'status': cmd_status,
        'available': cmd_available
    }

    cmd = sys.argv[1]
    if cmd not in commands:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        return 1

    return commands[cmd](sys.argv[2:])


if __name__ == '__main__':
    sys.exit(main())
