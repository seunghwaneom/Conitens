from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
DASHBOARD_PUBLIC = ROOT / "packages" / "dashboard" / "public"
WORK_ROOT = ROOT / ".tmp" / "sprite-gen-office-fixtures"
SKILL_ROOT = Path.home() / ".codex" / "skills" / "sprite-gen"
CELL = 24
FIXTURE_KINDS = [
    "desk",
    "bench",
    "console",
    "reception",
    "chair",
    "monitor",
    "screen",
    "terminal",
    "plant",
    "board",
    "reception-return",
    "server",
    "rack",
    "locker",
    "shelf",
    "lamp",
    "note",
    "coffee",
    "stamp",
    "cart",
    "cabinet",
    "couch",
    "clock",
    "bulletin",
    "extinguisher",
]
PALETTE = {
    "ink": "#0b1119",
    "edge": "#263646",
    "metal": "#758392",
    "metal2": "#4a5968",
    "metal3": "#aeb9bd",
    "wood": "#8d6a44",
    "wood2": "#604831",
    "paper": "#e4d9bd",
    "paper2": "#bcae8d",
    "screen": "#66d6e8",
    "screen2": "#2e8eb8",
    "green": "#74aa74",
    "green2": "#365f47",
    "red": "#cf5f5d",
    "amber": "#d2a348",
    "violet": "#8b81d8",
    "shadow": "#05080c88",
}

SPRITES = {
    "desk": [("s", 3, 20, 21, 22), ("r", 3, 9, 21, 14, "wood", "ink"), ("r", 5, 7, 19, 9, "paper2", "ink"), ("r", 5, 15, 7, 20, "wood2"), ("r", 17, 15, 19, 20, "wood2"), ("r", 9, 5, 15, 8, "screen2", "ink"), ("p", 14, 6, "screen")],
    "bench": [("s", 3, 17, 21, 20), ("r", 3, 10, 21, 14, "metal", "ink"), ("r", 4, 8, 20, 10, "metal3", "ink"), ("r", 6, 15, 8, 18, "metal2"), ("r", 16, 15, 18, 18, "metal2"), ("l", 6, 12, 18, 12, "edge")],
    "console": [("s", 2, 18, 22, 21), ("r", 3, 10, 21, 17, "edge", "ink"), ("r", 5, 7, 19, 11, "screen2", "ink"), ("r", 6, 13, 8, 15, "green"), ("r", 10, 13, 12, 15, "amber"), ("r", 14, 13, 17, 15, "screen"), ("p", 17, 8, "paper")],
    "reception": [("s", 2, 17, 23, 21), ("r", 2, 9, 22, 17, "wood", "ink"), ("r", 4, 7, 20, 10, "paper2", "ink"), ("r", 5, 12, 10, 15, "edge"), ("r", 13, 12, 19, 15, "screen2"), ("p", 18, 13, "screen")],
    "chair": [("s", 6, 18, 18, 21), ("r", 8, 6, 16, 13, "metal2", "ink"), ("r", 7, 13, 17, 17, "metal", "ink"), ("r", 9, 18, 10, 21, "edge"), ("r", 14, 18, 15, 21, "edge"), ("p", 10, 8, "metal3")],
    "monitor": [("s", 5, 19, 19, 21), ("r", 5, 5, 19, 15, "ink"), ("r", 7, 7, 17, 13, "screen2"), ("r", 11, 15, 13, 18, "metal2"), ("r", 8, 18, 16, 20, "edge"), ("p", 16, 8, "screen")],
    "screen": [("s", 4, 18, 20, 21), ("r", 4, 4, 20, 16, "ink"), ("r", 6, 6, 18, 14, "screen2"), ("l", 7, 12, 17, 7, "screen"), ("p", 9, 8, "paper")],
    "terminal": [("s", 5, 18, 20, 21), ("r", 5, 5, 18, 12, "screen2", "ink"), ("r", 6, 13, 20, 18, "edge", "ink"), ("r", 8, 15, 9, 16, "green"), ("r", 11, 15, 12, 16, "amber"), ("r", 14, 15, 17, 16, "metal3")],
    "plant": [("s", 7, 19, 17, 22), ("r", 9, 15, 15, 20, "wood2", "ink"), ("r", 8, 9, 11, 15, "green2"), ("r", 12, 7, 16, 15, "green"), ("r", 6, 11, 9, 16, "green"), ("p", 14, 9, "paper")],
    "board": [("s", 4, 18, 20, 20), ("r", 3, 5, 21, 16, "paper", "ink"), ("l", 6, 8, 15, 8, "screen2"), ("l", 6, 11, 18, 11, "edge"), ("r", 16, 6, 19, 9, "amber"), ("r", 5, 16, 7, 20, "metal2"), ("r", 17, 16, 19, 20, "metal2")],
    "reception-return": [("s", 8, 4, 18, 22), ("r", 8, 3, 17, 21, "wood", "ink"), ("r", 10, 5, 15, 9, "paper2"), ("r", 10, 12, 15, 16, "edge"), ("l", 9, 20, 17, 20, "wood2")],
    "server": [("s", 7, 20, 18, 22), ("r", 7, 3, 17, 21, "metal2", "ink"), ("l", 9, 6, 15, 6, "metal3"), ("l", 9, 10, 15, 10, "metal3"), ("l", 9, 14, 15, 14, "metal3"), ("p", 8, 6, "green"), ("p", 8, 10, "amber"), ("r", 10, 17, 15, 19, "edge")],
    "rack": [("s", 6, 20, 19, 22), ("r", 6, 4, 18, 21, "edge", "ink"), ("r", 8, 7, 16, 8, "screen2"), ("r", 8, 11, 16, 12, "violet"), ("r", 8, 15, 16, 16, "green"), ("r", 8, 18, 16, 19, "amber"), ("r", 9, 5, 15, 6, "metal2")],
    "locker": [("s", 6, 20, 18, 22), ("r", 6, 4, 18, 21, "metal", "ink"), ("l", 12, 5, 12, 20, "edge"), ("r", 8, 8, 10, 9, "metal3"), ("r", 14, 8, 16, 9, "metal3"), ("p", 10, 14, "amber"), ("p", 16, 14, "amber")],
    "shelf": [("s", 5, 19, 19, 21), ("r", 5, 6, 19, 20, "wood2", "ink"), ("l", 6, 10, 18, 10, "wood"), ("l", 6, 15, 18, 15, "wood"), ("r", 7, 7, 10, 9, "paper"), ("r", 12, 11, 17, 14, "screen2"), ("r", 8, 16, 13, 18, "green")],
    "lamp": [("s", 9, 16, 16, 18), ("r", 10, 6, 15, 9, "amber", "ink"), ("l", 12, 10, 12, 15, "metal3"), ("r", 9, 15, 16, 17, "edge"), ("p", 12, 7, "paper")],
    "note": [("r", 7, 6, 17, 17, "paper", "ink"), ("l", 9, 9, 15, 9, "amber"), ("l", 9, 12, 14, 12, "edge"), ("p", 16, 7, "paper2")],
    "coffee": [("s", 9, 16, 15, 18), ("r", 9, 9, 14, 16, "paper", "ink"), ("r", 14, 11, 16, 14, "paper", "ink"), ("l", 10, 8, 13, 8, "amber"), ("p", 11, 6, "metal3"), ("p", 13, 5, "metal3")],
    "stamp": [("s", 7, 17, 17, 19), ("r", 9, 7, 15, 12, "amber", "ink"), ("r", 7, 12, 17, 16, "red", "ink"), ("r", 8, 16, 16, 18, "edge")],
    "cart": [("s", 4, 19, 20, 22), ("r", 5, 8, 18, 17, "metal", "ink"), ("l", 6, 12, 17, 12, "edge"), ("l", 18, 8, 21, 5, "metal3"), ("r", 7, 18, 9, 20, "ink"), ("r", 15, 18, 17, 20, "ink"), ("r", 8, 9, 13, 11, "paper")],
    "cabinet": [("s", 6, 20, 18, 22), ("r", 6, 5, 18, 21, "wood", "ink"), ("l", 7, 11, 17, 11, "wood2"), ("l", 7, 16, 17, 16, "wood2"), ("p", 15, 8, "amber"), ("p", 15, 14, "amber"), ("p", 15, 19, "amber")],
    "couch": [("s", 3, 17, 21, 21), ("r", 4, 10, 20, 16, "violet", "ink"), ("r", 3, 13, 21, 18, "metal2", "ink"), ("r", 5, 18, 7, 20, "edge"), ("r", 17, 18, 19, 20, "edge"), ("l", 12, 11, 12, 17, "edge")],
    "clock": [("r", 8, 5, 16, 13, "paper", "ink"), ("p", 12, 9, "ink"), ("l", 12, 9, 12, 6, "edge"), ("l", 12, 9, 15, 9, "edge"), ("r", 11, 14, 13, 18, "metal2"), ("r", 9, 18, 15, 19, "edge")],
    "bulletin": [("r", 5, 6, 19, 16, "wood2", "ink"), ("r", 7, 8, 11, 12, "paper"), ("r", 13, 8, 17, 10, "amber"), ("r", 13, 12, 17, 14, "screen2"), ("p", 8, 9, "red")],
    "extinguisher": [("s", 10, 20, 15, 22), ("r", 10, 8, 14, 20, "red", "ink"), ("r", 10, 6, 14, 8, "metal3", "ink"), ("l", 14, 7, 18, 6, "ink"), ("p", 12, 11, "paper")],
}
FLOORS = {
    "corridor": ("#121c28", "#1f2d3a", "#2f4352", "#0b1119"),
    "control": ("#18283a", "#25405a", "#5caed1", "#0c1622"),
    "lab": ("#1f302b", "#304b3f", "#8bb88e", "#0d1713"),
    "lane": ("#18242f", "#2f4552", "#c79947", "#0c131b"),
    "lobby": ("#2b2d32", "#4a4539", "#c3a264", "#121319"),
    "stage": ("#1b242d", "#2e3941", "#6d7d87", "#0d1217"),
    "workspace": ("#202b36", "#344251", "#7d8fa0", "#0d141b"),
}


def color(name: str) -> str:
    return PALETTE.get(name, name)


def apply_ops(draw: ImageDraw.ImageDraw, ops: list[tuple]) -> None:
    for op in ops:
        kind = op[0]
        if kind == "r":
            outline = color(op[6]) if len(op) > 6 else None
            draw.rectangle(op[1:5], fill=color(op[5]), outline=outline)
        elif kind == "l":
            draw.line(op[1:5], fill=color(op[5]))
        elif kind == "p":
            draw.point(op[1:3], fill=color(op[3]))
        elif kind == "s":
            draw.rectangle(op[1:5], fill=color("shadow"))


def write_fixture_candidates() -> None:
    pngs = WORK_ROOT / "pngs"
    shutil.rmtree(pngs, ignore_errors=True)
    pngs.mkdir(parents=True, exist_ok=True)
    for index, kind in enumerate(FIXTURE_KINDS):
        image = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        apply_ops(ImageDraw.Draw(image), SPRITES[kind])
        image.save(pngs / f"{index:02d}-{kind}.png")
    (pngs / "meta.json").write_text(
        json.dumps({"cellSize": CELL, "sprites": FIXTURE_KINDS}, indent=2),
        encoding="utf-8",
    )


def run_sprite_gen() -> Path:
    unpack = SKILL_ROOT / "scripts" / "unpack_atlas_run.py"
    export = SKILL_ROOT / "scripts" / "export_curated_pngs.py"
    if not unpack.exists() or not export.exists():
        raise FileNotFoundError(f"sprite-gen scripts not found under {SKILL_ROOT}")
    env = dict(os.environ, PYTHONUTF8="1")
    run_dir = WORK_ROOT / "run"
    curated_dir = WORK_ROOT / "curated"
    subprocess.run(
        [
            sys.executable,
            str(unpack),
            "--pngs-dir",
            str(WORK_ROOT / "pngs"),
            "--state-name",
            "office-fixtures",
            "--out-dir",
            str(run_dir),
            "--force",
        ],
        check=True,
        env=env,
    )
    subprocess.run(
        [
            sys.executable,
            str(export),
            "--run-dir",
            str(run_dir),
            "--state",
            "office-fixtures",
            "--out-dir",
            str(curated_dir),
        ],
        check=True,
        env=env,
    )
    return curated_dir


def compose_fixture_atlas(curated_dir: Path) -> None:
    atlas = Image.new("RGBA", (CELL * len(FIXTURE_KINDS), CELL), (0, 0, 0, 0))
    sprites = []
    for index, kind in enumerate(FIXTURE_KINDS):
        frame = Image.open(curated_dir / f"{index:02d}-{kind}.png").convert("RGBA")
        atlas.alpha_composite(frame, (index * CELL, 0))
        sprites.append(
            {
                "kind": kind,
                "index": index,
                "sourceRect": {"x": index * CELL, "y": 0, "w": CELL, "h": CELL},
            }
        )
    DASHBOARD_PUBLIC.mkdir(parents=True, exist_ok=True)
    atlas.save(DASHBOARD_PUBLIC / "office-fixtures.png")
    (DASHBOARD_PUBLIC / "office-fixtures.meta.json").write_text(
        json.dumps(
            {
                "generator": "sprite-gen",
                "generatorRepo": "https://github.com/aldegad/sprite-gen",
                "generatorVersion": "1.9.2",
                "pipeline": "loose-png-import -> curation-export -> atlas-compose",
                "sheet": "office-fixtures.png",
                "theme": "signal-first-pixel-office",
                "cellSize": CELL,
                "columns": len(FIXTURE_KINDS),
                "sourceRun": ".tmp/sprite-gen-office-fixtures/run",
                "sprites": sprites,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def write_floor_tiles() -> None:
    for name, (base, seam, accent, deep) in FLOORS.items():
        image = Image.new("RGBA", (CELL, CELL), base)
        draw = ImageDraw.Draw(image)
        for x in (0, 12):
            draw.line((x, 0, x, 23), fill=seam)
        for y in (0, 12):
            draw.line((0, y, 23, y), fill=seam)
        for x, y in ((4, 4), (17, 5), (6, 18), (19, 17)):
            draw.point((x, y), fill=accent)
        draw.line((0, 23, 23, 23), fill=deep)
        draw.line((23, 0, 23, 23), fill=deep)
        if name == "lane":
            draw.line((2, 12, 10, 12), fill=accent)
            draw.line((14, 12, 22, 12), fill=accent)
            draw.rectangle((11, 10, 13, 14), fill=accent)
        if name == "control":
            draw.line((3, 6, 9, 6), fill=accent)
            draw.line((15, 18, 21, 18), fill=accent)
        if name == "lab":
            draw.rectangle((4, 4, 6, 6), fill=accent)
            draw.rectangle((17, 16, 19, 18), fill=accent)
        image.save(DASHBOARD_PUBLIC / f"office-floor-{name}.png")


def main() -> None:
    write_fixture_candidates()
    compose_fixture_atlas(run_sprite_gen())
    write_floor_tiles()


if __name__ == "__main__":
    main()
