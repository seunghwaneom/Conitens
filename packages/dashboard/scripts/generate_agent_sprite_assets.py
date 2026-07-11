from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Final, TypedDict

from PIL import Image

from agent_sprite_design import (
    CHROMA,
    CELL_SIZE,
    FRAME_COUNT,
    HUMAN_STYLE,
    REFERENCE_SOURCES,
    SAFE_MARGIN,
    SPECS,
    RoleSpriteSpec,
    draw_agent_frame,
)


ROOT: Final = Path(__file__).resolve().parents[3]
DASHBOARD_PUBLIC: Final = ROOT / "packages" / "dashboard" / "public"
DASHBOARD_SRC: Final = ROOT / "packages" / "dashboard" / "src"
WORK_ROOT: Final = ROOT / ".tmp" / "sprite-gen-agent-characters"
OUTPUT_ROOT: Final = DASHBOARD_PUBLIC / "agent-sprites" / "generated"
SKILL_ROOT: Final = Path.home() / ".codex" / "skills" / "sprite-gen"
PIPELINE: Final = "prepare_sprite_run+direct_component_rows+extract_sprite_row_frames+preview_animation+compose_sprite_atlas"


class RoleManifest(TypedDict):
    role: str
    atlasPath: str
    manifestPath: str
    qaNotesPath: str
    motionProfile: str
    primaryRow: str
    frameCount: int
    frameLayout: dict[str, object]
    animation: dict[str, object]


def run_script(script_name: str, *args: str) -> None:
    env = dict(os.environ, PYTHONUTF8="1")
    subprocess.run(
        [sys.executable, str(SKILL_ROOT / "scripts" / script_name), *args],
        check=True,
        env=env,
    )


def write_base_image(spec: RoleSpriteSpec, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    draw_agent_frame(spec, 0).save(path)


def request_json(spec: RoleSpriteSpec) -> str:
    request = {
        "version": 1,
        "kind": "sprite-gen-request",
        "engine": "component-row",
        "character": {"id": spec.role, "description": spec.description},
        "cell": {"shape": "square", "size": CELL_SIZE, "safe_margin": SAFE_MARGIN},
        "chroma_key": {"name": "magenta", "hex": "#FF00FF", "rgb": list(CHROMA)},
        "style": HUMAN_STYLE,
        "reference_sources": list(REFERENCE_SOURCES),
        "reference_notes": "user-supplied front-facing pixel character references; art-direction only; no source pixels copied",
        "motion_phase_guides": False,
        "states": {
            spec.primary_row: {
                "frames": FRAME_COUNT,
                "fps": spec.fps,
                "loop": True,
                "action": spec.description,
            }
        },
    }
    return json.dumps(request, separators=(",", ":"))


def rewrite_prepared_prompt(spec: RoleSpriteSpec, run_dir: Path) -> None:
    request_path = run_dir / "sprite-request.json"
    request = json.loads(request_path.read_text(encoding="utf-8"))
    request["character"]["description"] = spec.description
    request["style"] = HUMAN_STYLE
    request["reference_sources"] = list(REFERENCE_SOURCES)
    request["reference_notes"] = "user-supplied front-facing pixel character references; art-direction only; no source pixels copied"
    request_path.write_text(json.dumps(request, indent=2) + "\n", encoding="utf-8")

    prompt_path = run_dir / "prompts" / f"{spec.primary_row}.txt"
    prompt_text = prompt_path.read_text(encoding="utf-8")
    head, marker, tail = prompt_text.partition("Style contract:")
    if marker:
        _, _, after_style = tail.partition("\n\n")
        prompt_text = f"{head}{marker} {HUMAN_STYLE}.\n\n{after_style}"
    prompt_path.write_text(prompt_text.replace("vector mascot", "vector icon"), encoding="utf-8")


def write_raw_row(spec: RoleSpriteSpec, run_dir: Path) -> None:
    row = Image.new("RGB", (CELL_SIZE * FRAME_COUNT, CELL_SIZE), CHROMA)
    for index in range(FRAME_COUNT):
        row.paste(draw_agent_frame(spec, index), (index * CELL_SIZE, 0))
    raw_dir = run_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    row.save(raw_dir / f"{spec.primary_row}.png")


def copy_run_artifacts(run_dir: Path, role_dir: Path) -> None:
    shutil.rmtree(role_dir, ignore_errors=True)
    role_dir.mkdir(parents=True, exist_ok=True)
    for filename in ["sprite-request.json", "sprite-sheet-alpha.png", "manifest.json", "sprite-sheet-alpha.report.json"]:
        shutil.copy2(run_dir / filename, role_dir / filename)
    for directory in ["qa", "raw", "frames", "prompts", "references"]:
        shutil.copytree(run_dir / directory, role_dir / directory, dirs_exist_ok=True)


def run_sprite_gen(spec: RoleSpriteSpec) -> RoleManifest:
    base_path = WORK_ROOT / f"{spec.role}-base.png"
    run_dir = WORK_ROOT / spec.role
    shutil.rmtree(run_dir, ignore_errors=True)
    write_base_image(spec, base_path)
    run_script(
        "prepare_sprite_run.py",
        "--out-dir",
        str(run_dir),
        "--character-id",
        spec.role,
        "--base-image",
        str(base_path),
        "--request-json",
        request_json(spec),
        "--chroma-key",
        "#FF00FF",
        "--force",
    )
    rewrite_prepared_prompt(spec, run_dir)
    write_raw_row(spec, run_dir)
    run_script("extract_sprite_row_frames.py", "--run-dir", str(run_dir), "--min-used-pixels", "1")
    run_script("preview_animation.py", "--run-dir", str(run_dir))
    run_script("compose_sprite_atlas.py", "--run-dir", str(run_dir), "--min-used-pixels", "1")

    report = json.loads((run_dir / "sprite-sheet-alpha.report.json").read_text(encoding="utf-8"))
    runtime_manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    if not report["ok"]:
        raise RuntimeError(f"sprite-gen compose failed for {spec.role}: {report['errors']}")

    role_dir = OUTPUT_ROOT / spec.role
    copy_run_artifacts(run_dir, role_dir)
    notes = [
        f"sprite_gen_done={spec.role}",
        f"folder={role_dir}",
        "engine=component-row",
        "style=front-facing full-body pixel human character sprite; portrait lineup proportions; not a top-down token",
        f"reference_sources={','.join(REFERENCE_SOURCES)}",
        "source=direct sprite-gen request; no command-center, Claude, or imported character sheet",
        f"pipeline={PIPELINE}",
        f"motion_profile={spec.motion_profile}",
        f"primary_motion_row={spec.primary_row}",
        f"qa_note={spec.motion_note}",
    ]
    (role_dir / "qa-notes.md").write_text("\n".join(notes) + "\n", encoding="utf-8")
    return {
        "role": spec.role,
        "atlasPath": f"agent-sprites/generated/{spec.role}/sprite-sheet-alpha.png",
        "manifestPath": f"agent-sprites/generated/{spec.role}/manifest.json",
        "qaNotesPath": f"agent-sprites/generated/{spec.role}/qa-notes.md",
        "motionProfile": spec.motion_profile,
        "primaryRow": spec.primary_row,
        "frameCount": sum(len(frames) for frames in report["frame_layout"]["rows"].values()),
        "frameLayout": report["frame_layout"],
        "animation": runtime_manifest["animation"],
    }


def role_runtime_manifest(data: RoleManifest) -> dict[str, object]:
    return {
        "role": data["role"],
        "atlasPath": data["atlasPath"],
        "manifestPath": data["manifestPath"],
        "qaNotesPath": data["qaNotesPath"],
        "motionProfile": data["motionProfile"],
        "primaryRow": data["primaryRow"],
        "frameCount": data["frameCount"],
        "sheetWidth": data["frameLayout"]["sheetWidth"],
        "sheetHeight": data["frameLayout"]["sheetHeight"],
        "cellWidth": data["frameLayout"]["cellWidth"],
        "cellHeight": data["frameLayout"]["cellHeight"],
        "frames": data["frameLayout"]["rows"][data["primaryRow"]],
        "fps": data["animation"]["rows"][data["primaryRow"]]["fps"],
    }


def write_runtime_manifest(roles: dict[str, RoleManifest]) -> None:
    manifest = {
        "generator": "sprite-gen",
        "generatorRepo": "https://github.com/aldegad/sprite-gen",
        "generatorVersion": "1.9.2",
        "pipeline": PIPELINE,
        "cellSize": CELL_SIZE,
        "referenceSources": list(REFERENCE_SOURCES),
        "roles": roles,
    }
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUTPUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    runtime_roles = {role: role_runtime_manifest(data) for role, data in roles.items()}
    generated_manifest = {
        key: manifest[key]
        for key in ["generator", "generatorRepo", "generatorVersion", "pipeline", "cellSize", "referenceSources"]
    } | {"roles": runtime_roles}
    lines = [
        'import type { AgentOfficeRole } from "./agent-profiles.ts";',
        "",
        "export type AgentMotionProfile =",
        '  | "command-pulse"',
        '  | "build-shift"',
        '  | "research-orbit"',
        '  | "review-scan"',
        '  | "verify-brace";',
        "",
        'export const AGENT_SPRITE_GENERATOR = "sprite-gen";',
        "",
        "export const GENERATED_AGENT_SPRITE_MANIFEST = (",
        json.dumps(generated_manifest, separators=(",", ":")),
        ") as const satisfies {",
        '  readonly generator: "sprite-gen";',
        "  readonly generatorRepo: string;",
        "  readonly generatorVersion: string;",
        "  readonly pipeline: string;",
        "  readonly cellSize: number;",
        "  readonly referenceSources: readonly string[];",
        "  readonly roles: Record<AgentOfficeRole, {",
        "    readonly role: AgentOfficeRole;",
        "    readonly atlasPath: string;",
        "    readonly manifestPath: string;",
        "    readonly qaNotesPath: string;",
        "    readonly motionProfile: AgentMotionProfile;",
        "    readonly primaryRow: string;",
        "    readonly frameCount: number;",
        "    readonly sheetWidth: number;",
        "    readonly sheetHeight: number;",
        "    readonly cellWidth: number;",
        "    readonly cellHeight: number;",
        "    readonly frames: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[];",
        "    readonly fps: number;",
        "  }>;",
        "};",
        "",
    ]
    (DASHBOARD_SRC / "agent-sprite-manifest.generated.ts").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    roles = {spec.role: run_sprite_gen(spec) for spec in SPECS}
    write_runtime_manifest(roles)


if __name__ == "__main__":
    main()
