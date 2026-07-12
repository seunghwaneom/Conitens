#!/usr/bin/env python3
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

JsonPayload = dict[str, Any]
SAFE_API_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


@dataclass(frozen=True, slots=True)
class CommandResult:
    status: int
    payload: JsonPayload | str
    content_type: str = "application/json; charset=utf-8"


class CommandBadRequest(ValueError):
    pass


class CommandConflict(RuntimeError):
    pass


def validate_optional_identifier(value: Any, field_name: str) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return validate_api_identifier(value, field_name=field_name)


def validate_api_identifier(value: str, *, field_name: str) -> str:
    candidate = str(value).strip()
    if not candidate:
        raise CommandBadRequest(f"{field_name} is required")
    if ".." in candidate or "/" in candidate or "\\" in candidate:
        raise CommandBadRequest(f"Invalid {field_name}")
    if not SAFE_API_IDENTIFIER_PATTERN.fullmatch(candidate):
        raise CommandBadRequest(f"Invalid {field_name}")
    return candidate


def require(value: Any, message: str) -> None:
    if not value:
        raise CommandBadRequest(message)
