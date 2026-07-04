#!/usr/bin/env python3
from __future__ import annotations

import json
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

from ensemble_episode_model import (
    ARTIFACT_KIND,
    ARTIFACT_ROOT_LABEL,
    ClosureResult,
    ClosureStatus,
    EpisodeClosureError,
    JsonObject,
    RiskLevel,
)


@dataclass(frozen=True, slots=True)
class ClosureArtifactPaths:
    evidence_rel: str
    digest_rel: str
    projection_rel: str
    evidence_path: Path
    digest_path: Path
    projection_path: Path
    index_path: Path


def artifact_root(workspace: str | Path) -> Path:
    return Path(workspace) / ".notes" / "artifacts" / "agent-improvement"


def opaque_episode_slug(episode_id: str) -> str:
    return sha256(episode_id.encode("utf-8")).hexdigest()[:16]


def json_hash(data: JsonObject) -> str:
    encoded = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(encoded.encode("utf-8")).hexdigest()


def closure_artifact_paths(workspace: str | Path, artifact_id: str, episode_slug: str) -> ClosureArtifactPaths:
    root_label = ARTIFACT_ROOT_LABEL
    workspace_root = Path(workspace)
    evidence_rel = f"{root_label}/evidence/{artifact_id}.closure.json"
    digest_rel = f"{root_label}/public/digests/{artifact_id}.md"
    projection_rel = f"{root_label}/public/episodes/{episode_slug}.state.json"
    paths = ClosureArtifactPaths(
        evidence_rel=evidence_rel,
        digest_rel=digest_rel,
        projection_rel=projection_rel,
        evidence_path=workspace_root / evidence_rel,
        digest_path=workspace_root / digest_rel,
        projection_path=workspace_root / projection_rel,
        index_path=workspace_root / root_label / "public" / "index.jsonl",
    )
    _assert_projection_paths(workspace_root, paths)
    return paths


def render_closure_digest(bundle: JsonObject) -> str:
    episode_id = str(bundle["episode_id"])
    status = str(bundle["status"])
    summary = _dict_field(bundle, "episode_summary")
    scorecard = _dict_field(bundle, "scorecard")
    raw_access = _dict_field(bundle, "raw_access_audit")
    next_workflow = _dict_field(bundle, "next_workflow_recommendation")
    status_title = status.replace("_", " ").title()
    raw_access_text = _raw_access_text(raw_access)
    reasons = _reason_lines(scorecard)
    return "\n".join(
        [
            f"# Episode {episode_id} Closure Attempt",
            "",
            "## Status",
            status_title,
            "",
            "## Summary",
            str(summary.get("summary") or ""),
            "",
            "## Why It Could Not Close" if status != "closed" else "## Closure Notes",
            reasons,
            "",
            "## Scorecard",
            f"- Goal satisfied: {scorecard.get('goal_satisfied')}",
            f"- Validation passed: {scorecard.get('validation_passed')}",
            f"- Closure allowed: {scorecard.get('closure_allowed')}",
            f"- Confidence: {scorecard.get('confidence')}",
            f"- Risk: {scorecard.get('risk')}",
            "",
            "## Raw Access",
            raw_access_text,
            "",
            "## Next",
            str(next_workflow.get("recommendation") or "none"),
            "",
            str(next_workflow.get("reason") or ""),
            "",
        ]
    )


def write_projection_from_event(workspace: str | Path, event: JsonObject) -> ClosureResult:
    workspace_root = Path(workspace)
    payload = _dict_field(event, "payload")
    bundle = _dict_field(payload, "closure_bundle")
    index_record = _dict_field(payload, "index_record")
    paths = _paths_from_payload(workspace_root, payload)
    digest_text = render_closure_digest(bundle)
    _write_json(paths.evidence_path, bundle)
    paths.digest_path.parent.mkdir(parents=True, exist_ok=True)
    paths.digest_path.write_text(digest_text, encoding="utf-8")
    event_id = str(event["event_id"])
    _write_json(paths.projection_path, _projection_for(bundle, str(payload["artifact_id"]), event_id))
    _append_jsonl(paths.index_path, index_record)
    return ClosureResult(
        artifact_id=str(payload["artifact_id"]),
        episode_id=str(payload["episode_id"]),
        status=_closure_status(payload.get("status")),
        risk=_risk_level(payload.get("risk")),
        summary=str(index_record.get("summary") or ""),
        evidence_path=_safe_label(paths.evidence_path, workspace_root),
        digest_path=_safe_label(paths.digest_path, workspace_root),
        projection_path=_safe_label(paths.projection_path, workspace_root),
        event_id=event_id,
        bundle=bundle,
    )


def list_improvements(workspace: str | Path, *, limit: int = 20) -> list[JsonObject]:
    rows = [row for row in _read_index(workspace) if row.get("artifact_kind") == ARTIFACT_KIND]
    return rows[-limit:] if limit > 0 else rows


def find_improvement(workspace: str | Path, artifact_id: str) -> JsonObject | None:
    for row in reversed(_read_index(workspace)):
        if row.get("artifact_id") == artifact_id:
            return row
    return None


def show_improvement_digest(workspace: str | Path, artifact_id: str) -> str:
    record = find_improvement(workspace, artifact_id)
    if record is None:
        raise EpisodeClosureError(f"Improvement artifact not found: {artifact_id}")
    digest_value = record.get("digest_path")
    if not isinstance(digest_value, str) or not digest_value:
        raise EpisodeClosureError(f"Improvement artifact has no digest path: {artifact_id}")
    workspace_root = Path(workspace)
    digest_path = workspace_root / digest_value
    _assert_workspace_child(digest_path, workspace_root)
    _assert_directory_child(digest_path, artifact_root(workspace_root) / "public" / "digests", "public digests")
    if not digest_path.exists():
        raise EpisodeClosureError(f"Digest file missing: {digest_value}")
    return digest_path.read_text(encoding="utf-8")


def _paths_from_payload(workspace_root: Path, payload: JsonObject) -> ClosureArtifactPaths:
    paths = ClosureArtifactPaths(
        evidence_rel=str(payload["evidence_path"]),
        digest_rel=str(payload["digest_path"]),
        projection_rel=str(payload["projection_path"]),
        evidence_path=workspace_root / str(payload["evidence_path"]),
        digest_path=workspace_root / str(payload["digest_path"]),
        projection_path=workspace_root / str(payload["projection_path"]),
        index_path=workspace_root / ARTIFACT_ROOT_LABEL / "public" / "index.jsonl",
    )
    _assert_projection_paths(workspace_root, paths)
    return paths


def _closure_status(value: object) -> ClosureStatus:
    if value == "closed":
        return "closed"
    if value == "blocked":
        return "blocked"
    if value == "needs_review":
        return "needs_review"
    raise EpisodeClosureError("Malformed closure status")


def _risk_level(value: object) -> RiskLevel:
    if value == "low":
        return "low"
    if value == "medium":
        return "medium"
    if value == "high":
        return "high"
    raise EpisodeClosureError("Malformed closure risk")


def _projection_for(bundle: JsonObject, artifact_id: str, event_id: str) -> JsonObject:
    status = str(bundle["status"])
    episode_status = "closed" if status == "closed" else "open"
    if status == "needs_review":
        episode_status = "review_required"
    return {
        "episode_id": bundle["episode_id"],
        "status": episode_status,
        "status_source_event_id": event_id if status == "closed" else None,
        "closure_bundle_id": artifact_id if status == "closed" else None,
        "last_closure_attempt_id": artifact_id,
        "last_closure_status": status,
        "updated_at": bundle["created_at"],
        "projection": "derived_from_event_log",
    }


def _read_index(workspace: str | Path) -> list[JsonObject]:
    index_path = artifact_root(workspace) / "public" / "index.jsonl"
    if not index_path.exists():
        return []
    rows: list[JsonObject] = []
    for line in index_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            rows.append(value)
    return rows


def _write_json(path: Path, data: JsonObject) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _append_jsonl(path: Path, data: JsonObject) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(data, ensure_ascii=False, sort_keys=True) + "\n")


def _dict_field(source: JsonObject, field: str) -> JsonObject:
    value = source.get(field)
    if not isinstance(value, dict):
        raise EpisodeClosureError(f"Malformed closure artifact field: {field}")
    return value


def _raw_access_text(raw_access: JsonObject) -> str:
    if raw_access.get("raw_access_used"):
        grants = raw_access.get("grants")
        return f"L3 raw access grants: {len(grants) if isinstance(grants, list) else 0}"
    return "No L3 raw access used."


def _reason_lines(scorecard: JsonObject) -> str:
    reason_lines: list[str] = []
    for field in ("blocking_reasons", "review_reasons"):
        value = scorecard.get(field)
        if isinstance(value, list):
            reason_lines.extend(f"- `{reason}`" for reason in value)
    return "\n".join(reason_lines) if reason_lines else "- None"


def _safe_label(path: Path, workspace_root: Path) -> str:
    resolved_workspace = workspace_root.resolve()
    resolved_path = path.resolve()
    try:
        return str(resolved_path.relative_to(resolved_workspace)).replace("\\", "/")
    except ValueError:
        return resolved_path.name


def _assert_projection_paths(workspace_root: Path, paths: ClosureArtifactPaths) -> None:
    root = artifact_root(workspace_root)
    for path, directory, label in (
        (paths.evidence_path, root / "evidence", "evidence"),
        (paths.digest_path, root / "public" / "digests", "public digests"),
        (paths.projection_path, root / "public" / "episodes", "public episode projections"),
        (paths.index_path, root / "public", "public index"),
    ):
        _assert_workspace_child(path, workspace_root)
        _assert_directory_child(path, directory, label)


def _assert_workspace_child(path: Path, workspace_root: Path) -> None:
    resolved_workspace = workspace_root.resolve()
    resolved_path = path.resolve()
    try:
        resolved_path.relative_to(resolved_workspace)
    except ValueError as exc:
        raise EpisodeClosureError(f"Refusing to access episode closure artifact outside workspace: {path}") from exc


def _assert_directory_child(path: Path, directory: Path, label: str) -> None:
    resolved_directory = directory.resolve()
    resolved_path = path.resolve()
    try:
        resolved_path.relative_to(resolved_directory)
    except ValueError as exc:
        raise EpisodeClosureError(f"Refusing to access episode closure artifact outside {label}: {path}") from exc
