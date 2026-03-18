#!/usr/bin/env python3
"""
Minimal contract/frontmatter helpers for Conitens extension layers.

This parser intentionally supports a conservative YAML subset so the project
can stay stdlib-only while still loading markdown frontmatter contracts.
Unknown fields are preserved in the raw data, and callers can warn/filter
them according to their own schema rules.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


FRONTMATTER_DELIM = "---"


@dataclass
class ContractDocument:
    path: Path
    frontmatter: dict[str, Any]
    body: str
    warnings: list[str]


def split_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith(f"{FRONTMATTER_DELIM}\n"):
        return "", text

    parts = text.split(f"\n{FRONTMATTER_DELIM}\n", 1)
    if len(parts) != 2:
        return "", text
    return parts[0][len(FRONTMATTER_DELIM) + 1 :], parts[1]


def parse_contract_file(path: str | Path) -> ContractDocument:
    source = Path(path)
    text = source.read_text(encoding="utf-8")
    frontmatter_text, body = split_frontmatter(text)
    warnings: list[str] = []
    data = parse_simple_yaml(frontmatter_text, warnings) if frontmatter_text else {}
    return ContractDocument(path=source, frontmatter=data, body=body, warnings=warnings)


def parse_simple_yaml(text: str, warnings: list[str] | None = None) -> dict[str, Any]:
    warnings = warnings if warnings is not None else []
    cleaned = _strip_comments(text)
    if not cleaned.strip():
        return {}
    lines = [line.rstrip("\n") for line in cleaned.splitlines() if line.strip()]
    value, index = _parse_block(lines, 0, 0, warnings)
    if index < len(lines):
        warnings.append(f"Trailing content ignored starting at line {index + 1}.")
    return value if isinstance(value, dict) else {}


def collect_unknown_fields(
    data: dict[str, Any],
    allowed: Iterable[str],
    *,
    label: str,
) -> list[str]:
    allowed_set = set(allowed)
    return [f"{label}: unknown field '{key}' ignored." for key in data.keys() if key not in allowed_set]


def _strip_comments(text: str) -> str:
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if not line:
            lines.append("")
            continue
        if line.lstrip().startswith("#"):
            continue
        lines.append(line)
    return "\n".join(lines)


def _parse_block(
    lines: list[str],
    index: int,
    indent: int,
    warnings: list[str],
) -> tuple[Any, int]:
    result: dict[str, Any] = {}

    while index < len(lines):
        line = lines[index]
        current_indent = _indent_of(line)
        if current_indent < indent:
            break
        if current_indent > indent:
            warnings.append(f"Unexpected indentation at line {index + 1}; line ignored.")
            index += 1
            continue

        stripped = line.strip()
        if stripped.startswith("- "):
            return _parse_list(lines, index, indent, warnings)

        if ":" not in stripped:
            warnings.append(f"Malformed line {index + 1}: '{stripped}'")
            index += 1
            continue

        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip()

        if value:
            result[key] = _coerce_scalar(value)
            index += 1
            continue

        if index + 1 >= len(lines):
            result[key] = {}
            index += 1
            continue

        next_indent = _indent_of(lines[index + 1])
        if next_indent <= indent:
            result[key] = {}
            index += 1
            continue

        nested, index = _parse_block(lines, index + 1, next_indent, warnings)
        result[key] = nested

    return result, index


def _parse_list(
    lines: list[str],
    index: int,
    indent: int,
    warnings: list[str],
) -> tuple[list[Any], int]:
    items: list[Any] = []

    while index < len(lines):
        line = lines[index]
        current_indent = _indent_of(line)
        if current_indent < indent:
            break
        if current_indent != indent or not line.strip().startswith("- "):
            break

        item_text = line.strip()[2:].strip()
        if not item_text:
            nested, index = _parse_block(lines, index + 1, indent + 2, warnings)
            items.append(nested)
            continue

        if ":" in item_text:
            key, value = item_text.split(":", 1)
            item: dict[str, Any] = {key.strip(): _coerce_scalar(value.strip()) if value.strip() else {}}
            index += 1

            while index < len(lines):
                next_line = lines[index]
                next_indent = _indent_of(next_line)
                if next_indent <= indent:
                    break
                if next_indent != indent + 2:
                    warnings.append(f"Unexpected list indentation at line {index + 1}; line ignored.")
                    index += 1
                    continue
                nested_stripped = next_line.strip()
                if nested_stripped.startswith("- "):
                    nested, index = _parse_list(lines, index, indent + 2, warnings)
                    item.setdefault("_items", []).extend(nested)
                    continue
                if ":" not in nested_stripped:
                    warnings.append(f"Malformed line {index + 1}: '{nested_stripped}'")
                    index += 1
                    continue
                nested_key, nested_value = nested_stripped.split(":", 1)
                nested_key = nested_key.strip()
                nested_value = nested_value.strip()
                if nested_value:
                    item[nested_key] = _coerce_scalar(nested_value)
                    index += 1
                    continue
                if index + 1 < len(lines) and _indent_of(lines[index + 1]) > next_indent:
                    nested, index = _parse_block(lines, index + 1, _indent_of(lines[index + 1]), warnings)
                    item[nested_key] = nested
                else:
                    item[nested_key] = {}
                    index += 1
            items.append(item)
            continue

        items.append(_coerce_scalar(item_text))
        index += 1

    return items, index


def _coerce_scalar(value: str) -> Any:
    value = value.strip()
    if not value:
        return ""

    if value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]

    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered in {"null", "none"}:
        return None

    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_coerce_scalar(part.strip()) for part in inner.split(",")]

    if value.startswith("{") and value.endswith("}"):
        # Keep object-like values as raw strings in the minimal parser.
        return value

    try:
        return int(value)
    except ValueError:
        pass

    try:
        return float(value)
    except ValueError:
        pass

    return value


def _indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


__all__ = [
    "ContractDocument",
    "collect_unknown_fields",
    "parse_contract_file",
    "parse_simple_yaml",
    "split_frontmatter",
]
