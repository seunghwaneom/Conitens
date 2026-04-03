import type { CSSProperties } from "react";

export interface OfficeFixtureRenderSpec {
  width: number;
  height: number;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundColor?: string;
  border?: string;
  borderRadius?: string;
  boxShadow?: string;
  glow?: boolean;
  transform?: string;
}

const FIXTURE_SPRITE_SHEET = "/office-fixtures.png";
const FIXTURE_CELL = 24;
const FIXTURE_SPRITE_SIZE = "600px 24px";

function createSpriteSpec(
  index: number,
  width: number = 20,
  height: number = 20,
): OfficeFixtureRenderSpec {
  return {
    width,
    height,
    backgroundImage: `url("${FIXTURE_SPRITE_SHEET}")`,
    backgroundPosition: `${-(index * FIXTURE_CELL)}px 0`,
    backgroundSize: FIXTURE_SPRITE_SIZE,
  };
}

function createGlowingSpriteSpec(
  index: number,
  width: number = 20,
  height: number = 20,
): OfficeFixtureRenderSpec {
  return { ...createSpriteSpec(index, width, height), glow: true };
}

export const OFFICE_FIXTURE_REGISTRY = {
  desk: createSpriteSpec(0, 24, 24),
  bench: createSpriteSpec(1, 24, 14),
  console: createGlowingSpriteSpec(2, 24, 16),
  reception: createSpriteSpec(3, 28, 16),
  chair: createSpriteSpec(4, 24, 24),
  monitor: createGlowingSpriteSpec(5, 24, 24),
  screen: createGlowingSpriteSpec(6, 24, 24),
  terminal: createGlowingSpriteSpec(7, 24, 24),
  plant: createSpriteSpec(8, 24, 24),
  board: createSpriteSpec(9, 24, 24),
  "reception-return": createSpriteSpec(10, 18, 24),
  server: createSpriteSpec(11, 20, 24),
  rack: createSpriteSpec(12, 20, 24),
  locker: createSpriteSpec(13, 20, 24),
  shelf: createSpriteSpec(14, 20, 24),
  lamp: createSpriteSpec(15, 12, 12),
  note: createSpriteSpec(16, 12, 12),
  coffee: createSpriteSpec(17, 8, 8),
  stamp: createSpriteSpec(18, 12, 12),
  cart: createSpriteSpec(19, 16, 20),
  cabinet: createSpriteSpec(20, 20, 24),
  couch: createSpriteSpec(21, 24, 14),
  clock: createSpriteSpec(22, 10, 10),
  bulletin: createSpriteSpec(23, 16, 12),
  extinguisher: createSpriteSpec(24, 6, 16),
} as const satisfies Record<string, OfficeFixtureRenderSpec>;

export type OfficeFixtureKind = keyof typeof OFFICE_FIXTURE_REGISTRY;

export function getOfficeFixtureStyle(kind: string): CSSProperties {
  const spec =
    (OFFICE_FIXTURE_REGISTRY[kind as OfficeFixtureKind] ??
      OFFICE_FIXTURE_REGISTRY.cabinet) as OfficeFixtureRenderSpec;

  return {
    width: `${spec.width}px`,
    height: `${spec.height}px`,
    backgroundImage: spec.backgroundImage,
    backgroundPosition: spec.backgroundPosition,
    backgroundSize: spec.backgroundSize,
    backgroundRepeat: spec.backgroundRepeat ?? "no-repeat",
    backgroundColor: spec.backgroundColor,
    border: spec.border,
    borderRadius: spec.borderRadius,
    boxShadow: spec.glow
      ? `${spec.boxShadow ?? ""} 0 0 6px 2px var(--glow-current, rgba(80, 141, 212, 0.15))`.trim()
      : spec.boxShadow,
    transform: spec.transform,
  };
}
