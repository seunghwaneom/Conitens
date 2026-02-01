#!/usr/bin/env python3
"""
vibe-kit Python Pack: Indexer
=============================
AST-based symbol extraction for Python files.

Extracts:
- Functions (name, params, returns, docstring, decorators)
- Classes (name, methods, docstring, bases)
- Module-level variables
- Imports (for deps.py)

Output: SQLite FTS-compatible records
"""

import ast
import hashlib
import json
import os
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional


@dataclass
class FunctionInfo:
    name: str
    file: str
    line: int
    params: list[str]
    returns: Optional[str]
    docstring: Optional[str]
    decorators: list[str]
    is_async: bool
    is_method: bool
    class_name: Optional[str]


@dataclass
class ClassInfo:
    name: str
    file: str
    line: int
    bases: list[str]
    methods: list[str]
    docstring: Optional[str]
    decorators: list[str]


@dataclass
class ImportInfo:
    file: str
    line: int
    module: str
    names: list[str]
    is_from: bool
    level: int  # 0 = absolute, 1+ = relative


class PythonIndexer(ast.NodeVisitor):
    """AST visitor for extracting symbols from Python files."""
    
    def __init__(self, filepath: str, relative_to: str = "."):
        self.filepath = filepath
        self.relative_path = os.path.relpath(filepath, relative_to)
        self.functions: list[FunctionInfo] = []
        self.classes: list[ClassInfo] = []
        self.imports: list[ImportInfo] = []
        self._current_class: Optional[str] = None
    
    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._extract_function(node, is_async=False)
        self.generic_visit(node)
    
    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._extract_function(node, is_async=True)
        self.generic_visit(node)
    
    def _extract_function(self, node, is_async: bool) -> None:
        # Extract parameters
        params = []
        for arg in node.args.args:
            param_str = arg.arg
            if arg.annotation:
                param_str += f": {ast.unparse(arg.annotation)}"
            params.append(param_str)
        
        # Extract return type
        returns = None
        if node.returns:
            returns = ast.unparse(node.returns)
        
        # Extract docstring
        docstring = ast.get_docstring(node)
        
        # Extract decorators
        decorators = [ast.unparse(d) for d in node.decorator_list]
        
        func = FunctionInfo(
            name=node.name,
            file=self.relative_path,
            line=node.lineno,
            params=params,
            returns=returns,
            docstring=docstring,
            decorators=decorators,
            is_async=is_async,
            is_method=self._current_class is not None,
            class_name=self._current_class
        )
        self.functions.append(func)
    
    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        # Extract bases
        bases = [ast.unparse(b) for b in node.bases]
        
        # Extract docstring
        docstring = ast.get_docstring(node)
        
        # Extract decorators
        decorators = [ast.unparse(d) for d in node.decorator_list]
        
        # Extract method names (will be detailed in functions list)
        methods = []
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                methods.append(item.name)
        
        cls = ClassInfo(
            name=node.name,
            file=self.relative_path,
            line=node.lineno,
            bases=bases,
            methods=methods,
            docstring=docstring,
            decorators=decorators
        )
        self.classes.append(cls)
        
        # Visit methods with class context
        old_class = self._current_class
        self._current_class = node.name
        self.generic_visit(node)
        self._current_class = old_class
    
    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            imp = ImportInfo(
                file=self.relative_path,
                line=node.lineno,
                module=alias.name,
                names=[alias.asname or alias.name],
                is_from=False,
                level=0
            )
            self.imports.append(imp)
    
    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        names = [alias.name for alias in node.names]
        
        imp = ImportInfo(
            file=self.relative_path,
            line=node.lineno,
            module=module,
            names=names,
            is_from=True,
            level=node.level
        )
        self.imports.append(imp)


def index_file(filepath: str, relative_to: str = ".") -> dict:
    """Index a single Python file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            source = f.read()
        
        tree = ast.parse(source, filename=filepath)
        indexer = PythonIndexer(filepath, relative_to)
        indexer.visit(tree)
        
        # Calculate file hash
        file_hash = hashlib.sha256(source.encode()).hexdigest()[:16]
        
        return {
            "file": indexer.relative_path,
            "hash": file_hash,
            "loc": len(source.splitlines()),
            "functions": [asdict(f) for f in indexer.functions],
            "classes": [asdict(c) for c in indexer.classes],
            "imports": [asdict(i) for i in indexer.imports],
            "error": None
        }
    except SyntaxError as e:
        return {
            "file": os.path.relpath(filepath, relative_to),
            "error": f"SyntaxError: {e.msg} at line {e.lineno}"
        }
    except Exception as e:
        return {
            "file": os.path.relpath(filepath, relative_to),
            "error": str(e)
        }


def index_directory(
    root: str,
    include_globs: list[str] = None,
    exclude_dirs: list[str] = None
) -> dict:
    """Index all Python files in a directory."""
    if include_globs is None:
        include_globs = ["**/*.py"]
    if exclude_dirs is None:
        exclude_dirs = ["__pycache__", ".venv", "venv", ".git", ".vibe", "node_modules"]
    
    root_path = Path(root)
    results = {
        "root": str(root_path.absolute()),
        "files": [],
        "stats": {
            "total_files": 0,
            "total_functions": 0,
            "total_classes": 0,
            "total_loc": 0,
            "errors": 0
        }
    }
    
    # Collect all Python files
    py_files = []
    for pattern in include_globs:
        if "*.py" in pattern:
            for filepath in root_path.glob(pattern):
                # Check exclusions
                skip = False
                for exclude in exclude_dirs:
                    if exclude in filepath.parts:
                        skip = True
                        break
                if not skip and filepath.is_file():
                    py_files.append(filepath)
    
    # Index each file
    for filepath in sorted(set(py_files)):
        result = index_file(str(filepath), root)
        results["files"].append(result)
        
        results["stats"]["total_files"] += 1
        if result.get("error"):
            results["stats"]["errors"] += 1
        else:
            results["stats"]["total_functions"] += len(result.get("functions", []))
            results["stats"]["total_classes"] += len(result.get("classes", []))
            results["stats"]["total_loc"] += result.get("loc", 0)
    
    return results


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="vibe-kit Python Indexer")
    parser.add_argument("path", nargs="?", default=".", help="Directory or file to index")
    parser.add_argument("--file", "-f", help="Index single file")
    parser.add_argument("--output", "-o", help="Output JSON file")
    parser.add_argument("--exclude", nargs="*", default=[], help="Additional directories to exclude")
    
    args = parser.parse_args()
    
    if args.file:
        result = index_file(args.file)
    else:
        exclude = ["__pycache__", ".venv", "venv", ".git", ".vibe", "node_modules"] + args.exclude
        result = index_directory(args.path, exclude_dirs=exclude)
    
    output = json.dumps(result, indent=2, ensure_ascii=False)
    
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"Index written to {args.output}")
    else:
        print(output)
    
    # Print summary
    if "stats" in result:
        stats = result["stats"]
        print(f"\n--- Summary ---", file=sys.stderr)
        print(f"Files: {stats['total_files']}", file=sys.stderr)
        print(f"Functions: {stats['total_functions']}", file=sys.stderr)
        print(f"Classes: {stats['total_classes']}", file=sys.stderr)
        print(f"LOC: {stats['total_loc']}", file=sys.stderr)
        if stats['errors'] > 0:
            print(f"Errors: {stats['errors']}", file=sys.stderr)


if __name__ == "__main__":
    main()
