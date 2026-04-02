export type PixelAvatarRole =
  | "orchestrator"
  | "implementer"
  | "researcher"
  | "reviewer"
  | "validator";

type BlockFn = (x: number, y: number, w: number, h: number, color: string) => void;

function makeBlockFn(
  ctx: CanvasRenderingContext2D,
  scale: number,
  ox: number,
  oy: number
): BlockFn {
  return (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect((x + ox) * scale, (y + oy) * scale, w * scale, h * scale);
  };
}

function drawOrchestrator(b: BlockFn): void {
  // Hair
  b(2, 0, 8, 3, "#5b4133");
  b(1, 1, 1, 4, "#5b4133");
  b(10, 1, 1, 4, "#5b4133");
  b(3, 2, 2, 1, "#4a3528");
  // Skin
  b(2, 3, 8, 7, "#f2c8a3");
  // Eyes
  b(3, 5, 2, 2, "#ffffff");
  b(4, 5, 1, 2, "#2e392e");
  b(3, 5, 1, 1, "#ffffff");
  b(7, 5, 2, 2, "#ffffff");
  b(7, 5, 1, 2, "#2e392e");
  b(8, 5, 1, 1, "#ffffff");
  b(3, 4, 2, 1, "#3d2b1f");
  b(7, 4, 2, 1, "#3d2b1f");
  // Mouth
  b(5, 8, 2, 1, "#c9887a");
  // Body & Suit
  b(2, 10, 8, 8, "#365c82");
  b(0, 11, 2, 5, "#365c82"); // arm L
  b(10, 11, 2, 2, "#365c82"); // arm R
  b(4, 10, 1, 2, "#ffffff");
  b(7, 10, 1, 2, "#ffffff");
  b(5, 10, 2, 5, "#c98b12");
  b(5, 10, 2, 1, "#a07010");
  // Legs
  b(3, 18, 3, 6, "#2a3a50");
  b(6, 18, 3, 6, "#2a3a50");
  b(3, 23, 3, 1, "#1a1a1a");
  b(6, 23, 3, 1, "#1a1a1a");
  // Crown
  b(4, -2, 1, 2, "#ffd700");
  b(5, -3, 2, 3, "#ffd700");
  b(7, -2, 1, 2, "#ffd700");
  // Tablet
  b(10, 13, 3, 4, "#e0e0e0");
  b(10, 14, 3, 2, "#508dd4");
}

function drawImplementer(b: BlockFn): void {
  // Hair
  b(1, 0, 10, 4, "#2f3137");
  b(2, 4, 8, 2, "#2f3137"); // bangs
  b(0, 2, 1, 5, "#2f3137");
  b(11, 2, 1, 4, "#2f3137");
  // Skin
  b(2, 3, 8, 7, "#f0c3a1");
  // Eyes (Narrow)
  b(3, 6, 2, 1, "#ffffff");
  b(4, 6, 1, 1, "#2e392e");
  b(7, 6, 2, 1, "#ffffff");
  b(7, 6, 1, 1, "#2e392e");
  // Mouth (Open)
  b(5, 8, 2, 2, "#c08870");
  b(5, 9, 2, 1, "#a05550");
  // Body & Hoodie
  b(2, 10, 8, 8, "#5a7f4d");
  b(0, 11, 2, 5, "#5a7f4d");
  b(10, 11, 2, 5, "#5a7f4d");
  b(3, 10, 6, 2, "#3d5a34"); // hood line
  b(5, 14, 2, 2, "#3d5a34"); // pocket
  // Legs
  b(3, 18, 3, 6, "#3d4a5c");
  b(6, 18, 3, 6, "#3d4a5c");
  b(3, 23, 3, 1, "#1a1a1a");
  b(6, 23, 3, 1, "#1a1a1a");
  // Toolbelt
  b(2, 17, 8, 1, "#8b6914");
  b(3, 17, 1, 2, "#c0c0c0");
  b(8, 17, 1, 2, "#ffd700");
  // Wrench
  b(10, 13, 2, 5, "#c0c0c0");
  b(10, 12, 1, 2, "#c0c0c0");
  b(11, 12, 1, 1, "#c0c0c0");
}

function drawResearcher(b: BlockFn): void {
  // Hair (Long wavy)
  b(2, 0, 8, 3, "#6a4b7c");
  b(1, 1, 2, 10, "#6a4b7c");
  b(9, 1, 2, 10, "#6a4b7c");
  b(0, 8, 1, 4, "#6a4b7c");
  b(11, 8, 1, 4, "#6a4b7c");
  // Skin
  b(2, 3, 8, 7, "#eec7b0");
  // Eyes (Round) & Glasses
  b(3, 5, 2, 2, "#ffffff");
  b(4, 5, 1, 2, "#2e392e");
  b(7, 5, 2, 2, "#ffffff");
  b(7, 5, 1, 2, "#2e392e");
  b(3, 4, 3, 4, "rgba(141,108,184,0.4)"); // left frame
  b(7, 4, 3, 4, "rgba(141,108,184,0.4)"); // right frame
  b(3, 4, 7, 1, "#8d6cb8"); // connecting frame
  // Mouth (Smile)
  b(5, 8, 2, 1, "#c9887a");
  b(4, 7, 1, 1, "#c9887a");
  // Body & Lab coat
  b(2, 10, 8, 9, "#ffffff");
  b(4, 10, 4, 3, "#8d6cb8"); // inner shirt
  b(3, 10, 1, 8, "#e0e0e0"); // coat lapel shadow
  b(7, 13, 2, 1, "#8d6cb8"); // pocket line
  b(0, 11, 2, 5, "#ffffff"); // arm L
  b(10, 11, 2, 2, "#ffffff"); // arm R
  // Legs
  b(3, 19, 2, 5, "#5c4a6e");
  b(7, 19, 2, 5, "#5c4a6e");
  b(3, 23, 2, 1, "#1a1a1a");
  b(7, 23, 2, 1, "#1a1a1a");
  // Goggles (Head)
  b(3, -1, 3, 2, "#c8e0ff");
  b(6, -1, 3, 2, "#c8e0ff");
  b(2, 0, 8, 1, "#222222"); // band
  // Notebook
  b(10, 12, 3, 4, "#f5e6c8");
  b(10, 12, 1, 4, "#c98b12"); // spine
}

function drawReviewer(b: BlockFn): void {
  // Hair (Swept)
  b(2, 0, 8, 3, "#8a5b3e");
  b(1, 1, 1, 4, "#8a5b3e");
  b(10, 1, 1, 4, "#8a5b3e");
  b(2, 1, 5, 2, "#6a452e");
  // Visor
  b(1, -1, 10, 2, "#ffffff");
  b(2, 1, 8, 1, "#42a5f5");
  // Skin
  b(2, 3, 8, 7, "#f4cfb5");
  // Eyes (Sharp, raised brow)
  b(3, 5, 2, 2, "#ffffff");
  b(4, 5, 1, 2, "#2e392e");
  b(7, 5, 2, 2, "#ffffff");
  b(7, 5, 1, 2, "#2e392e");
  b(2, 4, 3, 1, "#5a3a2a");
  b(7, 3, 3, 1, "#5a3a2a"); // raised
  // Mouth
  b(5, 8, 2, 1, "#c9887a");
  // Body & Shirt
  b(2, 10, 8, 8, "#4c78b6");
  b(4, 10, 1, 2, "#ffffff");
  b(7, 10, 1, 2, "#ffffff");
  // Rolled sleeves arms
  b(0, 11, 2, 4, "#4c78b6");
  b(10, 11, 2, 4, "#4c78b6");
  b(0, 15, 2, 2, "#f4cfb5");
  b(10, 15, 2, 2, "#f4cfb5");
  // Legs
  b(3, 18, 3, 6, "#3a5a85");
  b(6, 18, 3, 6, "#3a5a85");
  b(3, 23, 3, 1, "#333333");
  b(6, 23, 3, 1, "#333333");
  // Stylus
  b(11, 14, 1, 5, "#a0a0a0");
  b(10, 18, 1, 1, "#222222");
}

function drawValidator(b: BlockFn): void {
  // Hair (Military Cut)
  b(3, 0, 6, 2, "#3d3d46");
  b(2, 1, 1, 3, "#3d3d46");
  b(9, 1, 1, 3, "#3d3d46");
  // Skin
  b(2, 3, 8, 7, "#f0c4a6");
  // Eyes
  b(3, 5, 2, 2, "#ffffff");
  b(4, 5, 1, 2, "#2e392e");
  b(7, 5, 2, 2, "#ffffff");
  b(7, 5, 1, 2, "#2e392e");
  b(3, 4, 3, 2, "#222222"); // thick brow
  b(6, 4, 3, 2, "#222222");
  // Mouth
  b(4, 8, 4, 1, "#b8776a");
  // Body & Vest
  b(2, 10, 8, 8, "#d05b58");
  b(3, 10, 2, 8, "#b04442"); // vest texture
  b(7, 10, 2, 8, "#b04442");
  b(0, 11, 2, 5, "#8b3e3c"); // arm
  b(10, 11, 2, 5, "#8b3e3c"); // arm
  // Shield Emblem
  b(4, 12, 4, 1, "#ffffff");
  b(4, 13, 4, 2, "#ffffff");
  b(5, 15, 2, 1, "#ffffff");
  // Legs
  b(3, 18, 3, 6, "#8b3e3c");
  b(6, 18, 3, 6, "#8b3e3c");
  b(2, 22, 8, 2, "#4a2423"); // boots
  b(3, 23, 3, 1, "#222222");
  b(6, 23, 3, 1, "#222222");
  // Hand Shield
  b(-3, 11, 4, 6, "#ef5350");
  b(-3, 12, 1, 4, "#ff8a80"); // highlight
  b(-2, 17, 2, 1, "#ef5350"); // bottom point
  // Stamp
  b(11, 14, 2, 2, "#ffd700");
  b(11, 16, 2, 1, "#c98b12"); // ink
}

const DRAW_FNS: Record<PixelAvatarRole, (b: BlockFn) => void> = {
  orchestrator: drawOrchestrator,
  implementer: drawImplementer,
  researcher: drawResearcher,
  reviewer: drawReviewer,
  validator: drawValidator,
};

export function drawPixelAvatar(
  ctx: CanvasRenderingContext2D,
  role: PixelAvatarRole,
  scale: number
): void {
  const ox = 6;
  const oy = 6;
  const b = makeBlockFn(ctx, scale, ox, oy);
  DRAW_FNS[role](b);
}
