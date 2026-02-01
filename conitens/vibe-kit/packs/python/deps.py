#!/usr/bin/env python3
"""
vibe-kit Python Pack: Dependency Analyzer
==========================================
Import graph analysis for Python projects.

Features:
- Build import graph from indexed data
- Detect circular dependencies
- Calculate fan-in/fan-out metrics
- Generate dependency hotspots report

Uses output from indexer.py
"""

import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class DependencyEdge:
    from_file: str
    to_module: str
    kind: str  # "import" or "from_import"
    is_relative: bool
    level: int


@dataclass 
class CycleInfo:
    path: list[str]
    length: int
    
    def __str__(self):
        return " → ".join(self.path + [self.path[0]])


class DependencyGraph:
    """Directed graph of module dependencies."""
    
    def __init__(self):
        self.edges: dict[str, set[str]] = defaultdict(set)  # from -> {to}
        self.reverse_edges: dict[str, set[str]] = defaultdict(set)  # to -> {from}
        self.edge_details: list[DependencyEdge] = []
        self.file_to_module: dict[str, str] = {}
    
    def add_edge(self, from_file: str, to_module: str, kind: str, is_relative: bool, level: int):
        """Add a dependency edge."""
        self.edges[from_file].add(to_module)
        self.reverse_edges[to_module].add(from_file)
        self.edge_details.append(DependencyEdge(
            from_file=from_file,
            to_module=to_module,
            kind=kind,
            is_relative=is_relative,
            level=level
        ))
    
    def resolve_relative_import(self, from_file: str, module: str, level: int) -> str:
        """Resolve relative import to absolute module path."""
        if level == 0:
            return module
        
        # Get package path from file
        from_path = Path(from_file)
        parts = list(from_path.parts[:-1])  # Remove filename
        
        # Go up 'level' directories
        if level > len(parts):
            return module  # Can't resolve
        
        base_parts = parts[:len(parts) - level + 1]
        
        if module:
            return ".".join(base_parts + [module])
        else:
            return ".".join(base_parts)
    
    def fan_in(self, module: str) -> int:
        """Number of files that import this module."""
        return len(self.reverse_edges.get(module, set()))
    
    def fan_out(self, file: str) -> int:
        """Number of modules this file imports."""
        return len(self.edges.get(file, set()))
    
    def find_cycles(self) -> list[CycleInfo]:
        """Detect circular dependencies using DFS."""
        cycles = []
        visited = set()
        rec_stack = set()
        path = []
        
        def dfs(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)
            path.append(node)
            
            for neighbor in self.edges.get(node, set()):
                # Try to resolve module to file
                neighbor_file = self._module_to_file(neighbor)
                if neighbor_file is None:
                    continue
                
                if neighbor_file not in visited:
                    if dfs(neighbor_file):
                        return True
                elif neighbor_file in rec_stack:
                    # Found cycle
                    cycle_start = path.index(neighbor_file)
                    cycle_path = path[cycle_start:]
                    cycles.append(CycleInfo(
                        path=cycle_path,
                        length=len(cycle_path)
                    ))
            
            path.pop()
            rec_stack.remove(node)
            return False
        
        for file in self.edges.keys():
            if file not in visited:
                dfs(file)
        
        return cycles
    
    def _module_to_file(self, module: str) -> Optional[str]:
        """Try to resolve module name to file path."""
        # Direct match
        for file, mod in self.file_to_module.items():
            if mod == module:
                return file
        
        # Try as file path
        possible_paths = [
            module.replace(".", "/") + ".py",
            module.replace(".", "/") + "/__init__.py"
        ]
        
        for path in possible_paths:
            if path in self.edges:
                return path
        
        return None
    
    def get_hotspots(self, top_n: int = 10) -> list[tuple[str, int, int]]:
        """Get files with highest fan-in (most imported)."""
        fan_ins = []
        
        # Count fan-in for each file
        for module, importers in self.reverse_edges.items():
            file = self._module_to_file(module)
            if file:
                fan_ins.append((file, len(importers), self.fan_out(file)))
        
        # Also add files by their module-equivalent
        for file in self.edges.keys():
            if file not in [f[0] for f in fan_ins]:
                # Count how many files import this file's module
                module_name = file.replace("/", ".").replace(".py", "")
                importers = self.reverse_edges.get(module_name, set())
                fan_ins.append((file, len(importers), self.fan_out(file)))
        
        return sorted(fan_ins, key=lambda x: x[1], reverse=True)[:top_n]


def build_graph_from_index(index_data: dict) -> DependencyGraph:
    """Build dependency graph from indexer output."""
    graph = DependencyGraph()
    
    for file_info in index_data.get("files", []):
        if file_info.get("error"):
            continue
        
        filepath = file_info["file"]
        
        # Register file to module mapping
        module_name = filepath.replace("/", ".").replace("\\", ".").replace(".py", "")
        graph.file_to_module[filepath] = module_name
        
        # Process imports
        for imp in file_info.get("imports", []):
            module = imp["module"]
            is_relative = imp["level"] > 0
            
            if is_relative:
                resolved = graph.resolve_relative_import(filepath, module, imp["level"])
            else:
                resolved = module
            
            graph.add_edge(
                from_file=filepath,
                to_module=resolved,
                kind="from_import" if imp["is_from"] else "import",
                is_relative=is_relative,
                level=imp["level"]
            )
    
    return graph


def analyze_dependencies(index_path: str) -> dict:
    """Main analysis function."""
    with open(index_path, "r", encoding="utf-8") as f:
        index_data = json.load(f)
    
    graph = build_graph_from_index(index_data)
    cycles = graph.find_cycles()
    hotspots = graph.get_hotspots(20)
    
    return {
        "total_files": len(graph.edges),
        "total_edges": len(graph.edge_details),
        "cycles": [
            {"path": c.path, "length": c.length, "display": str(c)}
            for c in cycles
        ],
        "cycle_count": len(cycles),
        "hotspots": [
            {"file": h[0], "fan_in": h[1], "fan_out": h[2]}
            for h in hotspots
        ],
        "internal_imports": sum(
            1 for e in graph.edge_details 
            if not e.to_module.startswith(("os", "sys", "re", "json", "typing", "pathlib", "collections", "dataclasses", "hashlib", "argparse", "datetime", "time", "subprocess", "shutil", "glob", "functools", "itertools", "copy", "io", "tempfile", "unittest", "pytest"))
        )
    }


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="vibe-kit Python Dependency Analyzer")
    parser.add_argument("index_file", help="Path to indexer output JSON")
    parser.add_argument("--output", "-o", help="Output JSON file")
    parser.add_argument("--cycles-only", action="store_true", help="Only check for cycles")
    
    args = parser.parse_args()
    
    result = analyze_dependencies(args.index_file)
    
    if args.cycles_only:
        if result["cycle_count"] > 0:
            print(f"[FAIL] {result['cycle_count']} circular dependency detected!")
            for c in result["cycles"]:
                print(f"  Cycle: {c['display']}")
            sys.exit(1)
        else:
            print("[PASS] No circular dependencies")
            sys.exit(0)
    
    output = json.dumps(result, indent=2, ensure_ascii=False)
    
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"Analysis written to {args.output}")
    else:
        print(output)
    
    # Print summary
    print(f"\n--- Dependency Summary ---", file=sys.stderr)
    print(f"Files: {result['total_files']}", file=sys.stderr)
    print(f"Edges: {result['total_edges']}", file=sys.stderr)
    print(f"Internal imports: {result['internal_imports']}", file=sys.stderr)
    
    if result["cycle_count"] > 0:
        print(f"[WARN] Cycles: {result['cycle_count']}", file=sys.stderr)
        for c in result["cycles"]:
            print(f"  → {c['display']}", file=sys.stderr)
    else:
        print(f"Cycles: 0 ✓", file=sys.stderr)
    
    print(f"\nTop hotspots (by fan-in):", file=sys.stderr)
    for h in result["hotspots"][:5]:
        print(f"  {h['file']}: fan_in={h['fan_in']}, fan_out={h['fan_out']}", file=sys.stderr)


if __name__ == "__main__":
    main()
