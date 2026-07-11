#!/usr/bin/env python3
from __future__ import annotations

import getpass
import json
import os
import socket
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class OwnerAuthorizationError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class OwnerCheck:
    allowed: bool
    reason: str


def current_user_info() -> dict[str, Any]:
    info: dict[str, Any] = {
        "username": getpass.getuser(),
        "uid": os.getuid() if hasattr(os, "getuid") else None,
        "hostname": socket.gethostname(),
    }
    try:
        email = subprocess.run(
            ["git", "config", "user.email"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if email.returncode == 0:
            info["git_email"] = email.stdout.strip()
        name = subprocess.run(
            ["git", "config", "user.name"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if name.returncode == 0:
            info["git_name"] = name.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return info


def read_owner_file(workspace: str | Path) -> dict[str, Any] | None:
    path = Path(workspace) / ".notes" / "OWNER.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def match_project_owner(owner_data: dict[str, Any] | None, current_user: dict[str, Any]) -> OwnerCheck:
    if owner_data is None:
        return OwnerCheck(False, "NOT_INITIALIZED: No OWNER.json found. Run `ensemble init-owner` first.")
    owner_raw = owner_data.get("owner", {})
    owner = owner_raw if isinstance(owner_raw, dict) else {}
    owner_uid = owner.get("uid")
    current_uid = current_user.get("uid")
    if owner_uid is not None and current_uid is not None and owner_uid == current_uid:
        return OwnerCheck(True, "UID_MATCH")
    if owner.get("username") == current_user.get("username") and owner.get("hostname") == current_user.get("hostname"):
        return OwnerCheck(True, "USERNAME_HOSTNAME_MATCH")
    owner_email = owner.get("git_email")
    current_email = current_user.get("git_email")
    if isinstance(owner_email, str) and isinstance(current_email, str) and owner_email.lower() == current_email.lower():
        return OwnerCheck(True, "GIT_EMAIL_MATCH")
    return OwnerCheck(
        False,
        "NOT_OWNER: Current user "
        f"({current_user.get('username')}@{current_user.get('hostname')}) does not match owner "
        f"({owner.get('username')}@{owner.get('hostname')})",
    )


def require_project_owner(workspace: str | Path) -> None:
    check = match_project_owner(read_owner_file(workspace), current_user_info())
    if not check.allowed:
        raise OwnerAuthorizationError("project owner authorization failed")
