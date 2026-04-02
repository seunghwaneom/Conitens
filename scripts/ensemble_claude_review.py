#!/usr/bin/env python3
"""
Local Claude Code review helper with auth probing, bounded timeout, and artifact capture.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_TIMEOUT_SECONDS = 300
DEFAULT_EFFORT = "medium"


def utc_timestamp_for_filename() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    cleaned = cleaned.strip("-")
    return cleaned or "claude-review"


def artifacts_root(workspace: str | Path) -> Path:
    path = Path(workspace) / ".omx" / "artifacts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def build_artifact_path(workspace: str | Path, *, slug: str) -> Path:
    return artifacts_root(workspace) / f"claude-{slug}-{utc_timestamp_for_filename()}.md"


@dataclass
class ClaudeAuthStatus:
    logged_in: bool
    auth_method: str | None
    email: str | None
    raw: dict[str, Any]


def probe_claude_auth() -> ClaudeAuthStatus:
    result = subprocess.run(
        ["claude", "auth", "status"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "Failed to query Claude auth status")
    payload = json.loads(result.stdout or "{}")
    return ClaudeAuthStatus(
        logged_in=bool(payload.get("loggedIn")),
        auth_method=payload.get("authMethod"),
        email=payload.get("email"),
        raw=payload,
    )


@dataclass
class ClaudeReviewResult:
    prompt: str
    output: str
    timeout_seconds: int
    effort: str
    command: list[str]
    timed_out: bool
    auth_status: ClaudeAuthStatus


def run_claude_review(
    prompt: str,
    *,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    effort: str = DEFAULT_EFFORT,
) -> ClaudeReviewResult:
    auth_status = probe_claude_auth()
    if not auth_status.logged_in:
        raise RuntimeError("Claude Code is not logged in. Run `claude auth login` first.")
    command = ["claude", "-p", "--effort", effort, prompt]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=timeout_seconds,
        )
        output = result.stdout.strip() if result.stdout.strip() else result.stderr.strip()
        return ClaudeReviewResult(
            prompt=prompt,
            output=output,
            timeout_seconds=timeout_seconds,
            effort=effort,
            command=command,
            timed_out=False,
            auth_status=auth_status,
        )
    except subprocess.TimeoutExpired as exc:
        partial = ""
        if isinstance(exc.stdout, str) and exc.stdout:
            partial = exc.stdout
        elif isinstance(exc.stderr, str) and exc.stderr:
            partial = exc.stderr
        return ClaudeReviewResult(
            prompt=prompt,
            output=(partial or f"command timed out after {timeout_seconds} seconds").strip(),
            timeout_seconds=timeout_seconds,
            effort=effort,
            command=command,
            timed_out=True,
            auth_status=auth_status,
        )


def write_artifact(workspace: str | Path, *, task: str, slug: str, review: ClaudeReviewResult) -> Path:
    path = build_artifact_path(workspace, slug=slug)
    summary = (
        "Claude review completed successfully."
        if not review.timed_out
        else "Claude review timed out before returning a complete response."
    )
    path.write_text(
        "\n".join(
            [
                "# Claude Artifact",
                "",
                "## 1. Original user task",
                "",
                task,
                "",
                "## 2. Final prompt sent to Claude CLI",
                "",
                "```text",
                review.prompt,
                "```",
                "",
                "## 3. Claude output (raw)",
                "",
                "```text",
                review.output,
                "```",
                "",
                "## 4. Concise summary",
                "",
                summary,
                "",
                "## 5. Action items / next steps",
                "",
                f"- Auth path used: `{review.auth_status.auth_method or 'unknown'}`",
                f"- Logged-in account: `{review.auth_status.email or 'unknown'}`",
                f"- Invocation: `{' '.join(review.command)}`",
                f"- Timeout seconds: `{review.timeout_seconds}`",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a bounded Claude Code review and capture an artifact.")
    parser.add_argument("prompt", help="Prompt to send to Claude Code")
    parser.add_argument("--task", help="Original user task for the artifact header")
    parser.add_argument("--slug", help="Artifact slug override")
    parser.add_argument("--workspace", default=os.getcwd())
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--effort", choices=["low", "medium", "high", "max"], default=DEFAULT_EFFORT)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    review = run_claude_review(
        args.prompt,
        timeout_seconds=args.timeout_seconds,
        effort=args.effort,
    )
    artifact = write_artifact(
        args.workspace,
        task=args.task or args.prompt,
        slug=args.slug or slugify(args.prompt[:60]),
        review=review,
    )
    payload = {
        "ok": not review.timed_out,
        "timed_out": review.timed_out,
        "artifact": str(artifact),
        "auth_method": review.auth_status.auth_method,
        "email": review.auth_status.email,
        "effort": review.effort,
        "timeout_seconds": review.timeout_seconds,
        "output": review.output,
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    try:
        if hasattr(sys.stdout, "buffer"):
            sys.stdout.buffer.write(text.encode("utf-8", errors="replace"))
        else:
            print(text, end="")
    except Exception:
        print(json.dumps(payload, ensure_ascii=True, indent=2))
    return 0 if not review.timed_out else 124


if __name__ == "__main__":
    raise SystemExit(main())
