from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal, assert_never

from PIL import Image, ImageDraw


Color = tuple[int, int, int]
Box = tuple[int, int, int, int]
HairKind = Literal["swept", "cap", "bob", "silver", "braid"]
PropKind = Literal["tablet", "wrench", "lens_book", "clipboard", "shield"]

CHROMA: Final[Color] = (255, 0, 255)
INK: Final[Color] = (9, 11, 15)
WHITE: Final[Color] = (245, 249, 252)
CELL_SIZE: Final = 64
SAFE_MARGIN: Final = 5
FRAME_COUNT: Final = 8
REFERENCE_SOURCES: Final = ("user-reference:codex-clipboard-11b0d6b3-front-facing-full-body-pixel-boy.png", "user-reference:codex-clipboard-c73a6cca-front-facing-pixel-character-lineup.png", "user-reference:codex-clipboard-3a0ec65f-front-facing-rpg-character-lineup.png")
HUMAN_STYLE: Final = "front-facing full-body pixel human character sprite with character lineup portrait proportions, large readable head, expressive eyes, highlighted hair, clear neck, shoulders, torso, arms, hands, separated legs, shoes, clothing layers, and role prop; upright human proportions with a distinct silhouette, chunky dark outline, limited production palette, and details large enough to read at dashboard scale"


@dataclass(frozen=True, slots=True)
class RoleSpriteSpec:
    role: str
    motion_profile: str
    primary_row: str
    skin: Color
    hair: Color
    jacket: Color
    shirt: Color
    trousers: Color
    accent: Color
    hair_kind: HairKind
    prop: PropKind
    description: str
    motion_note: str
    fps: int = 6


@dataclass(frozen=True, slots=True)
class Pose:
    body_y: int
    arm: int
    step: int
    blink: bool


SPECS: Final = (
    RoleSpriteSpec(
        role="orchestrator",
        motion_profile="command-pulse",
        primary_row="command-pulse",
        skin=(218, 151, 102),
        hair=(63, 36, 32),
        jacket=(226, 99, 63),
        shirt=(255, 224, 177),
        trousers=(55, 54, 80),
        accent=(255, 239, 176),
        hair_kind="swept",
        prop="tablet",
        description="front-facing full-body pixel operations lead with swept hair, command jacket, sash, trousers, shoes, and dispatch tablet",
        motion_note="pass: portrait-lineup operations lead breathes, blinks, and checks a pulsing tablet.",
    ),
    RoleSpriteSpec(
        role="implementer",
        motion_profile="build-shift",
        primary_row="build-shift",
        skin=(165, 104, 72),
        hair=(29, 38, 34),
        jacket=(68, 155, 93),
        shirt=(210, 226, 210),
        trousers=(38, 63, 55),
        accent=(218, 206, 153),
        hair_kind="cap",
        prop="wrench",
        description="front-facing full-body pixel engineer with cap, utility vest, rolled sleeves, tool belt, trousers, shoes, and wrench",
        motion_note="pass: portrait-lineup engineer shifts build stance and raises a wrench clearly.",
    ),
    RoleSpriteSpec(
        role="researcher",
        motion_profile="research-orbit",
        primary_row="research-orbit",
        skin=(198, 132, 92),
        hair=(35, 46, 92),
        jacket=(83, 119, 214),
        shirt=(191, 226, 255),
        trousers=(38, 49, 91),
        accent=(149, 231, 255),
        hair_kind="bob",
        prop="lens_book",
        description="front-facing full-body pixel researcher with bobbed hair, long field coat, notebook, satchel, and evidence lens",
        motion_note="pass: portrait-lineup researcher reads, lifts a lens, and keeps identity stable.",
    ),
    RoleSpriteSpec(
        role="reviewer",
        motion_profile="review-scan",
        primary_row="review-scan",
        skin=(232, 174, 132),
        hair=(205, 214, 226),
        jacket=(61, 174, 214),
        shirt=(238, 250, 255),
        trousers=(39, 64, 89),
        accent=(255, 208, 121),
        hair_kind="silver",
        prop="clipboard",
        description="front-facing full-body pixel reviewer with silver hair, tailored blazer, gold lanyard, dark trousers, shoes, and clipboard",
        motion_note="pass: portrait-lineup reviewer scans a clipboard and marks approval poses.",
    ),
    RoleSpriteSpec(
        role="validator",
        motion_profile="verify-brace",
        primary_row="verify-brace",
        skin=(116, 72, 52),
        hair=(24, 22, 24),
        jacket=(209, 44, 56),
        shirt=(255, 224, 224),
        trousers=(55, 34, 42),
        accent=(255, 191, 198),
        hair_kind="braid",
        prop="shield",
        description="front-facing full-body pixel validator with braid, red gate jacket, reinforced gloves, trousers, shoes, and brace shield",
        motion_note="pass: portrait-lineup validator braces the shield, rebounds, and keeps anatomy readable.",
    ),
)


def fill(draw: ImageDraw.ImageDraw, box: Box, color: Color) -> None:
    draw.rectangle(box, fill=color)


def outline(draw: ImageDraw.ImageDraw, box: Box, color: Color) -> None:
    x1, y1, x2, y2 = box
    fill(draw, box, INK)
    fill(draw, (x1 + 1, y1 + 1, x2 - 1, y2 - 1), color)


def pose_at(index: int) -> Pose:
    return Pose(
        body_y=[0, -1, -1, 0, 1, 0, -1, 0][index],
        arm=[0, 1, 3, 2, 0, -2, -3, -1][index],
        step=[0, 1, 2, 1, 0, -1, -2, -1][index],
        blink=index in {2, 6},
    )


def draw_agent_frame(spec: RoleSpriteSpec, index: int) -> Image.Image:
    pose = pose_at(index)
    image = Image.new("RGB", (CELL_SIZE, CELL_SIZE), CHROMA)
    draw = ImageDraw.Draw(image)
    draw_human(draw, spec, pose)
    draw_prop(draw, spec, pose)
    return image


def draw_human(draw: ImageDraw.ImageDraw, spec: RoleSpriteSpec, pose: Pose) -> None:
    head_y = 5 + pose.body_y
    torso_y = 32 + pose.body_y
    draw_legs(draw, spec, torso_y, pose.step)
    draw_arms(draw, spec, torso_y, pose.arm)
    fill(draw, (28, torso_y - 3, 35, torso_y + 1), spec.skin)
    body_bottom = torso_y + (25 if spec.prop == "lens_book" else 18)
    draw.polygon([(19, torso_y), (45, torso_y), (42, body_bottom), (22, body_bottom)], fill=INK)
    draw.polygon([(21, torso_y + 1), (43, torso_y + 1), (40, body_bottom - 1), (24, body_bottom - 1)], fill=spec.jacket)
    fill(draw, (28, torso_y + 2, 36, body_bottom - 1), spec.shirt)
    fill(draw, (23, torso_y + 5, 29, torso_y + 6), spec.accent)
    fill(draw, (37, torso_y + 5, 42, torso_y + 6), spec.accent)
    fill(draw, (31, torso_y + 4, 32, torso_y + 16), spec.accent)
    fill(draw, (23, torso_y + 16, 41, torso_y + 18), spec.trousers)
    fill(draw, (16, head_y + 12, 20, head_y + 20), spec.skin)
    fill(draw, (43, head_y + 12, 47, head_y + 20), spec.skin)
    outline(draw, (19, head_y + 3, 44, head_y + 28), spec.skin)
    draw_face(draw, head_y, pose.blink)
    draw_hair(draw, spec, head_y)


def draw_legs(draw: ImageDraw.ImageDraw, spec: RoleSpriteSpec, torso_y: int, step: int) -> None:
    fill(draw, (23, torso_y + 18, 30, 58), spec.trousers)
    fill(draw, (34, torso_y + 18, 41, 58), spec.trousers)
    fill(draw, (29, torso_y + 20, 30, 56), INK)
    fill(draw, (34, torso_y + 20, 35, 56), INK)
    fill(draw, (24, torso_y + 21, 25, 55), spec.accent)
    fill(draw, (39, torso_y + 21, 40, 55), spec.accent)
    fill(draw, (20 + step, 58, 31 + step, 62), INK)
    fill(draw, (33 - step, 58, 44 - step, 62), INK)
    fill(draw, (24 + step, 58, 30 + step, 59), spec.accent)
    fill(draw, (37 - step, 58, 43 - step, 59), spec.accent)


def draw_arms(draw: ImageDraw.ImageDraw, spec: RoleSpriteSpec, torso_y: int, arm: int) -> None:
    left = max(-3, min(3, arm))
    right = -left
    fill(draw, (14 + left, torso_y + 3, 21 + left, torso_y + 22), INK)
    fill(draw, (43 + right, torso_y + 3, 50 + right, torso_y + 22), INK)
    fill(draw, (16 + left, torso_y + 4, 20 + left, torso_y + 21), spec.jacket)
    fill(draw, (44 + right, torso_y + 4, 48 + right, torso_y + 21), spec.jacket)
    fill(draw, (15 + left, torso_y + 21, 21 + left, torso_y + 26), spec.skin)
    fill(draw, (43 + right, torso_y + 21, 49 + right, torso_y + 26), spec.skin)
    fill(draw, (17 + left, torso_y + 11, 20 + left, torso_y + 12), spec.accent)
    fill(draw, (44 + right, torso_y + 11, 47 + right, torso_y + 12), spec.accent)


def draw_face(draw: ImageDraw.ImageDraw, head_y: int, blink: bool) -> None:
    fill(draw, (24, head_y + 12, 29, head_y + 13), INK)
    fill(draw, (36, head_y + 12, 41, head_y + 13), INK)
    if blink:
        fill(draw, (25, head_y + 17, 29, head_y + 18), INK)
        fill(draw, (36, head_y + 17, 40, head_y + 18), INK)
    else:
        fill(draw, (25, head_y + 15, 29, head_y + 21), WHITE)
        fill(draw, (36, head_y + 15, 40, head_y + 21), WHITE)
        fill(draw, (27, head_y + 16, 29, head_y + 21), INK)
        fill(draw, (38, head_y + 16, 40, head_y + 21), INK)
    fill(draw, (32, head_y + 19, 34, head_y + 22), (205, 83, 70))
    fill(draw, (29, head_y + 25, 36, head_y + 25), INK)
    fill(draw, (20, head_y + 20, 22, head_y + 22), (236, 146, 116))
    fill(draw, (41, head_y + 20, 43, head_y + 22), (236, 146, 116))


def draw_hair(draw: ImageDraw.ImageDraw, spec: RoleSpriteSpec, head_y: int) -> None:
    match spec.hair_kind:
        case "swept":
            fill(draw, (18, head_y, 45, head_y + 8), spec.hair)
            fill(draw, (17, head_y + 8, 22, head_y + 19), spec.hair)
            fill(draw, (38, head_y + 4, 47, head_y + 11), spec.hair)
            fill(draw, (25, head_y + 2, 38, head_y + 4), spec.accent)
        case "cap":
            fill(draw, (18, head_y, 45, head_y + 8), spec.hair)
            fill(draw, (41, head_y + 4, 56, head_y + 8), spec.accent)
            fill(draw, (19, head_y + 8, 23, head_y + 17), spec.hair)
            fill(draw, (27, head_y + 1, 37, head_y + 3), spec.accent)
        case "bob":
            fill(draw, (18, head_y, 46, head_y + 9), spec.hair)
            fill(draw, (16, head_y + 8, 21, head_y + 29), spec.hair)
            fill(draw, (42, head_y + 8, 47, head_y + 29), spec.hair)
            fill(draw, (25, head_y + 2, 35, head_y + 4), spec.accent)
        case "silver":
            fill(draw, (18, head_y, 45, head_y + 8), spec.hair)
            fill(draw, (17, head_y + 8, 21, head_y + 17), spec.hair)
            fill(draw, (25, head_y + 1, 33, head_y + 4), WHITE)
            fill(draw, (37, head_y + 3, 43, head_y + 5), WHITE)
        case "braid":
            fill(draw, (18, head_y, 45, head_y + 8), spec.hair)
            fill(draw, (17, head_y + 8, 21, head_y + 18), spec.hair)
            fill(draw, (42, head_y + 11, 47, head_y + 35), spec.hair)
            fill(draw, (42, head_y + 20, 48, head_y + 22), spec.accent)
            fill(draw, (42, head_y + 29, 47, head_y + 31), spec.accent)
        case unreachable:
            assert_never(unreachable)


def draw_prop(draw: ImageDraw.ImageDraw, spec: RoleSpriteSpec, pose: Pose) -> None:
    x = 43 + max(-2, min(2, pose.arm))
    y = 32 + pose.body_y
    match spec.prop:
        case "tablet":
            outline(draw, (x + 1, y + 6, x + 15, y + 25), (44, 48, 66))
            fill(draw, (x + 4, y + 11, x + 13, y + 15), spec.accent)
            fill(draw, (x + 4, y + 20, x + 12, y + 21), WHITE)
        case "wrench":
            fill(draw, (x, y + 8, x + 12, y + 10), spec.accent)
            fill(draw, (x + 8, y + 3, x + 11, y + 24), INK)
            fill(draw, (x + 5, y + 3, x + 15, y + 6), WHITE)
        case "lens_book":
            outline(draw, (x, y + 6, x + 13, y + 19), spec.accent)
            fill(draw, (x + 12, y + 18, x + 17, y + 23), INK)
            outline(draw, (9, y + 13, 23, y + 27), spec.shirt)
            fill(draw, (13, y + 20, 21, y + 21), spec.accent)
        case "clipboard":
            outline(draw, (x, y + 5, x + 16, y + 27), WHITE)
            fill(draw, (x + 5, y + 10, x + 14, y + 11), spec.jacket)
            fill(draw, (x + 4, y + 18, x + 14, y + 20), spec.accent)
        case "shield":
            draw.polygon([(x, y + 3), (x + 17, y + 6), (x + 15, y + 24), (x + 8, y + 31), (x, y + 24)], fill=INK)
            draw.polygon([(x + 3, y + 7), (x + 14, y + 8), (x + 13, y + 21), (x + 8, y + 26), (x + 3, y + 21)], fill=spec.accent)
            fill(draw, (x + 7, y + 13, x + 10, y + 18), spec.jacket)
        case unreachable:
            assert_never(unreachable)
