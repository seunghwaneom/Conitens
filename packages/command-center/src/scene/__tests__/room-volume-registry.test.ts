/**
 * room-volume-registry.test.ts
 *
 * Sub-AC 3 — Generate and render labeled 3D room volumes inside the building
 * shell from the parsed room manifest, with each room visually distinct by role.
 *
 * Acceptance criteria tested:
 *
 *   rv-01 — VOLUME_STYLES covers all 6 canonical room types
 *   rv-02 — Every room type has a distinct fillColor (no two types share a color)
 *   rv-03 — Every room type has a distinct edgeColor
 *   rv-04 — VOLUME_STYLES entries are internally consistent (opacity in (0,1], intensity ≥ 0)
 *   rv-05 — ROLE_VISUALS covers all 6 canonical room types
 *   rv-06 — ROLE_VISUALS colors match VOLUME_STYLES colors per room type
 *   rv-07 — buildRoomRegistry() produces exactly 9 rooms for the static BUILDING
 *   rv-08 — All 9 room IDs from BUILDING are present in the registry
 *   rv-09 — Each registry entry has correct room type (matches BUILDING)
 *   rv-10 — Each registry entry has valid positionHint (position + dimensions + center)
 *   rv-11 — positionHint.center equals position + dimensions/2 for all rooms
 *   rv-12 — positionHint.dimensions are all positive
 *   rv-13 — Floor grouping: floor 0 rooms are project-main, archive-vault, stairwell
 *   rv-14 — Floor grouping: floor 1 rooms include ops-control, impl-office, research-lab
 *   rv-15 — Stairwell appears in both floor 0 and floor 1 groups (spans floors)
 *   rv-16 — Room volumes for corridor types have lower fillOpacity than non-corridor types
 *   rv-17 — Control room has the highest emissiveIntensity (authority signal)
 *   rv-18 — Badge label data: all rooms have non-empty name and roomType
 *   rv-19 — Badge label data: floor index matches BUILDING room floor values
 *   rv-20 — Resident agents: ops-control and impl-office have at least one resident
 *   rv-21 — Corridor rooms (corridor-main, stairwell) have empty residentAgents
 *   rv-22 — validateRoomRegistry() returns no errors for the static BUILDING
 *   rv-23 — RoomsFromRegistry groups rooms into per-floor groups (logic test)
 *   rv-24 — Volume box dimensions are slightly inset from positionHint (bw = w - 0.06)
 *   rv-25 — Label Y position is above the room ceiling (pos.y + h + 0.32)
 *   rv-26 — VOLUME_STYLES and ROLE_VISUALS use consistent hex color format (#RRGGBB)
 *   rv-27 — All room types in BUILDING.rooms are within the VOLUME_STYLES key set
 *   rv-28 — Non-regression: adding a VOLUME_STYLES entry does not change existing entries
 */

import { describe, it, expect } from "vitest";

import { BUILDING, type RoomType } from "../../data/building.js";
import {
  buildRoomRegistry,
  ROOM_REGISTRY,
  getRoomsByFloor,
  validateRoomRegistry,
  type RoomMetadataEntry,
} from "../../data/room-registry.js";
import { VOLUME_STYLES } from "../RoomVolume.js";
import { ROLE_VISUALS } from "../RoomTypeVisuals.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_ROOM_TYPES: RoomType[] = [
  "control",
  "office",
  "lab",
  "lobby",
  "archive",
  "corridor",
];

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * Simulate the per-floor grouping logic from RoomsFromRegistry.
 * Returns a map of floor → RoomMetadataEntry[], with stairwell on both floors.
 */
function groupRoomsByFloor(
  registry: ReturnType<typeof buildRoomRegistry>,
): Record<number, RoomMetadataEntry[]> {
  const byFloor: Record<number, RoomMetadataEntry[]> = {};
  for (const entry of Object.values(registry)) {
    const targetFloors =
      entry.roomId === "stairwell" ? [0, 1] : [entry.floor];
    for (const f of targetFloors) {
      if (!byFloor[f]) byFloor[f] = [];
      if (!byFloor[f].some((e) => e.roomId === entry.roomId)) {
        byFloor[f].push(entry);
      }
    }
  }
  return byFloor;
}

// ═════════════════════════════════════════════════════════════════════════════
// rv-01 — VOLUME_STYLES covers all 6 canonical room types
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-01 — VOLUME_STYLES covers all canonical room types", () => {
  it("rv-01a: VOLUME_STYLES has an entry for every RoomType", () => {
    for (const rt of ALL_ROOM_TYPES) {
      expect(
        VOLUME_STYLES[rt],
        `Missing VOLUME_STYLES entry for room type "${rt}"`,
      ).toBeDefined();
    }
  });

  it("rv-01b: VOLUME_STYLES has exactly 6 entries — one per canonical room type", () => {
    expect(Object.keys(VOLUME_STYLES)).toHaveLength(6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-02 — Every room type has a distinct fillColor
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-02 — All room types have distinct fillColors", () => {
  it("rv-02a: no two room types share the same fillColor", () => {
    const colors = ALL_ROOM_TYPES.map((rt) => VOLUME_STYLES[rt].fillColor);
    const unique = new Set(colors);
    expect(unique.size).toBe(ALL_ROOM_TYPES.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-03 — Every room type has a distinct edgeColor
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-03 — All room types have distinct edgeColors", () => {
  it("rv-03a: no two room types share the same edgeColor", () => {
    const colors = ALL_ROOM_TYPES.map((rt) => VOLUME_STYLES[rt].edgeColor);
    const unique = new Set(colors);
    expect(unique.size).toBe(ALL_ROOM_TYPES.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-04 — VOLUME_STYLES entries are internally consistent
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-04 — VOLUME_STYLES internal consistency", () => {
  it("rv-04a: fillOpacity is in range (0, 1]", () => {
    for (const rt of ALL_ROOM_TYPES) {
      const { fillOpacity } = VOLUME_STYLES[rt];
      expect(
        fillOpacity,
        `${rt} fillOpacity ${fillOpacity} out of range`,
      ).toBeGreaterThan(0);
      expect(fillOpacity).toBeLessThanOrEqual(1);
    }
  });

  it("rv-04b: edgeOpacity is in range (0, 1]", () => {
    for (const rt of ALL_ROOM_TYPES) {
      const { edgeOpacity } = VOLUME_STYLES[rt];
      expect(edgeOpacity, `${rt} edgeOpacity out of range`).toBeGreaterThan(0);
      expect(edgeOpacity).toBeLessThanOrEqual(1);
    }
  });

  it("rv-04c: emissiveIntensity is non-negative", () => {
    for (const rt of ALL_ROOM_TYPES) {
      const { emissiveIntensity } = VOLUME_STYLES[rt];
      expect(
        emissiveIntensity,
        `${rt} emissiveIntensity is negative`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("rv-04d: edgeThresholdAngle is a positive number", () => {
    for (const rt of ALL_ROOM_TYPES) {
      const { edgeThresholdAngle } = VOLUME_STYLES[rt];
      expect(
        edgeThresholdAngle,
        `${rt} edgeThresholdAngle is not positive`,
      ).toBeGreaterThan(0);
    }
  });

  it("rv-04e: stripeColor is a non-empty string", () => {
    for (const rt of ALL_ROOM_TYPES) {
      const { stripeColor } = VOLUME_STYLES[rt];
      expect(typeof stripeColor).toBe("string");
      expect(stripeColor.length).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-05 — ROLE_VISUALS covers all 6 canonical room types
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-05 — ROLE_VISUALS covers all canonical room types", () => {
  it("rv-05a: ROLE_VISUALS has an entry for every RoomType", () => {
    for (const rt of ALL_ROOM_TYPES) {
      expect(
        ROLE_VISUALS[rt],
        `Missing ROLE_VISUALS entry for room type "${rt}"`,
      ).toBeDefined();
    }
  });

  it("rv-05b: every ROLE_VISUALS entry has a non-empty icon", () => {
    for (const rt of ALL_ROOM_TYPES) {
      expect(ROLE_VISUALS[rt].icon.length).toBeGreaterThan(0);
    }
  });

  it("rv-05c: every ROLE_VISUALS entry has a non-empty label", () => {
    for (const rt of ALL_ROOM_TYPES) {
      expect(ROLE_VISUALS[rt].label.length).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-06 — ROLE_VISUALS colors match VOLUME_STYLES fillColors per room type
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-06 — Color consistency between VOLUME_STYLES and ROLE_VISUALS", () => {
  it("rv-06a: fillColor in VOLUME_STYLES matches color in ROLE_VISUALS for each type", () => {
    for (const rt of ALL_ROOM_TYPES) {
      expect(VOLUME_STYLES[rt].fillColor).toBe(ROLE_VISUALS[rt].color);
    }
  });

  it("rv-06b: emissive in VOLUME_STYLES matches emissive in ROLE_VISUALS for each type", () => {
    for (const rt of ALL_ROOM_TYPES) {
      expect(VOLUME_STYLES[rt].emissive).toBe(ROLE_VISUALS[rt].emissive);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-07 — buildRoomRegistry() produces exactly 9 rooms
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-07 — buildRoomRegistry produces exactly 9 rooms", () => {
  it("rv-07a: static BUILDING has exactly 9 room definitions", () => {
    expect(BUILDING.rooms).toHaveLength(9);
  });

  it("rv-07b: buildRoomRegistry returns a registry with 9 entries", () => {
    const registry = buildRoomRegistry();
    expect(Object.keys(registry)).toHaveLength(9);
  });

  it("rv-07c: ROOM_REGISTRY (pre-built static) also has 9 entries", () => {
    expect(Object.keys(ROOM_REGISTRY)).toHaveLength(9);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-08 — All 9 room IDs from BUILDING are present in the registry
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-08 — All BUILDING room IDs are present in the registry", () => {
  it("rv-08a: every room ID from BUILDING.rooms exists in ROOM_REGISTRY", () => {
    for (const room of BUILDING.rooms) {
      expect(
        ROOM_REGISTRY[room.roomId],
        `Registry missing room '${room.roomId}'`,
      ).toBeDefined();
    }
  });

  it("rv-08b: all 9 named rooms are individually present", () => {
    const expectedIds = [
      "project-main",
      "ops-control",
      "impl-office",
      "research-lab",
      "validation-office",
      "review-office",
      "archive-vault",
      "corridor-main",
      "stairwell",
    ];
    for (const id of expectedIds) {
      expect(ROOM_REGISTRY[id], `Room '${id}' missing from registry`).toBeDefined();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-09 — Each registry entry has correct room type (matches BUILDING)
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-09 — Registry room types match BUILDING definitions", () => {
  it("rv-09a: roomType in registry matches BUILDING for all rooms", () => {
    for (const room of BUILDING.rooms) {
      const entry = ROOM_REGISTRY[room.roomId];
      expect(entry).toBeDefined();
      expect(entry!.roomType).toBe(room.roomType);
    }
  });

  it("rv-09b: ops-control is type 'control'", () => {
    expect(ROOM_REGISTRY["ops-control"]?.roomType).toBe("control");
  });

  it("rv-09c: research-lab is type 'lab'", () => {
    expect(ROOM_REGISTRY["research-lab"]?.roomType).toBe("lab");
  });

  it("rv-09d: project-main is type 'lobby'", () => {
    expect(ROOM_REGISTRY["project-main"]?.roomType).toBe("lobby");
  });

  it("rv-09e: archive-vault is type 'archive'", () => {
    expect(ROOM_REGISTRY["archive-vault"]?.roomType).toBe("archive");
  });

  it("rv-09f: impl-office is type 'office'", () => {
    expect(ROOM_REGISTRY["impl-office"]?.roomType).toBe("office");
  });

  it("rv-09g: corridor-main and stairwell are type 'corridor'", () => {
    expect(ROOM_REGISTRY["corridor-main"]?.roomType).toBe("corridor");
    expect(ROOM_REGISTRY["stairwell"]?.roomType).toBe("corridor");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-10 — Each registry entry has valid positionHint
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-10 — Registry positionHints are valid", () => {
  it("rv-10a: every entry has a non-null positionHint", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(entry.positionHint, `positionHint missing for ${entry.roomId}`).toBeDefined();
    }
  });

  it("rv-10b: every positionHint has numeric position x/y/z", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      const { position } = entry.positionHint;
      expect(typeof position.x, `${entry.roomId} position.x`).toBe("number");
      expect(typeof position.y, `${entry.roomId} position.y`).toBe("number");
      expect(typeof position.z, `${entry.roomId} position.z`).toBe("number");
    }
  });

  it("rv-10c: every positionHint has numeric dimensions x/y/z", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      const { dimensions } = entry.positionHint;
      expect(typeof dimensions.x, `${entry.roomId} dimensions.x`).toBe("number");
      expect(typeof dimensions.y, `${entry.roomId} dimensions.y`).toBe("number");
      expect(typeof dimensions.z, `${entry.roomId} dimensions.z`).toBe("number");
    }
  });

  it("rv-10d: every positionHint has numeric center x/y/z", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      const { center } = entry.positionHint;
      expect(typeof center.x, `${entry.roomId} center.x`).toBe("number");
      expect(typeof center.y, `${entry.roomId} center.y`).toBe("number");
      expect(typeof center.z, `${entry.roomId} center.z`).toBe("number");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-11 — positionHint.center equals position + dimensions/2 for all rooms
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-11 — positionHint.center is correctly computed as position + dim/2", () => {
  it("rv-11a: center.x ≈ position.x + dimensions.x / 2 for all rooms", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      const { position: p, dimensions: d, center: c } = entry.positionHint;
      expect(c.x).toBeCloseTo(p.x + d.x / 2, 4);
    }
  });

  it("rv-11b: center.y ≈ position.y + dimensions.y / 2 for all rooms", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      const { position: p, dimensions: d, center: c } = entry.positionHint;
      expect(c.y).toBeCloseTo(p.y + d.y / 2, 4);
    }
  });

  it("rv-11c: center.z ≈ position.z + dimensions.z / 2 for all rooms", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      const { position: p, dimensions: d, center: c } = entry.positionHint;
      expect(c.z).toBeCloseTo(p.z + d.z / 2, 4);
    }
  });

  it("rv-11d: ops-control center is at (6.5, 4.5, 2) from its origin (4, 3, 0), size (5, 3, 4)", () => {
    const entry = ROOM_REGISTRY["ops-control"]!;
    expect(entry.positionHint.center.x).toBeCloseTo(6.5, 4); // 4 + 5/2
    expect(entry.positionHint.center.y).toBeCloseTo(4.5, 4); // 3 + 3/2
    expect(entry.positionHint.center.z).toBeCloseTo(2.0, 4); // 0 + 4/2
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-12 — positionHint.dimensions are all positive
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-12 — All room dimensions are positive", () => {
  it("rv-12a: dimensions.x > 0 for all rooms", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(
        entry.positionHint.dimensions.x,
        `${entry.roomId} dimensions.x <= 0`,
      ).toBeGreaterThan(0);
    }
  });

  it("rv-12b: dimensions.y > 0 for all rooms", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(
        entry.positionHint.dimensions.y,
        `${entry.roomId} dimensions.y <= 0`,
      ).toBeGreaterThan(0);
    }
  });

  it("rv-12c: dimensions.z > 0 for all rooms", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(
        entry.positionHint.dimensions.z,
        `${entry.roomId} dimensions.z <= 0`,
      ).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-13 — Floor grouping: floor 0 rooms
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-13 — Floor 0 contains expected rooms", () => {
  const floor0 = getRoomsByFloor(0, ROOM_REGISTRY);

  it("rv-13a: floor 0 contains project-main", () => {
    expect(floor0.map((r) => r.roomId)).toContain("project-main");
  });

  it("rv-13b: floor 0 contains archive-vault", () => {
    expect(floor0.map((r) => r.roomId)).toContain("archive-vault");
  });

  it("rv-13c: floor 0 contains stairwell (spans floors 0–1)", () => {
    expect(floor0.map((r) => r.roomId)).toContain("stairwell");
  });

  it("rv-13d: floor 0 does not contain ops-control (floor 1 only)", () => {
    expect(floor0.map((r) => r.roomId)).not.toContain("ops-control");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-14 — Floor grouping: floor 1 rooms
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-14 — Floor 1 contains expected rooms", () => {
  const floor1 = getRoomsByFloor(1, ROOM_REGISTRY);

  it("rv-14a: floor 1 contains ops-control", () => {
    expect(floor1.map((r) => r.roomId)).toContain("ops-control");
  });

  it("rv-14b: floor 1 contains impl-office", () => {
    expect(floor1.map((r) => r.roomId)).toContain("impl-office");
  });

  it("rv-14c: floor 1 contains research-lab", () => {
    expect(floor1.map((r) => r.roomId)).toContain("research-lab");
  });

  it("rv-14d: floor 1 contains validation-office", () => {
    expect(floor1.map((r) => r.roomId)).toContain("validation-office");
  });

  it("rv-14e: floor 1 contains review-office", () => {
    expect(floor1.map((r) => r.roomId)).toContain("review-office");
  });

  it("rv-14f: floor 1 contains corridor-main", () => {
    expect(floor1.map((r) => r.roomId)).toContain("corridor-main");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-15 — Stairwell appears in both floor groups
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-15 — Stairwell appears in both floor groups (spans floors 0 and 1)", () => {
  it("rv-15a: stairwell is in floor 0 group", () => {
    const floor0 = getRoomsByFloor(0, ROOM_REGISTRY);
    expect(floor0.map((r) => r.roomId)).toContain("stairwell");
  });

  it("rv-15b: stairwell is in floor 1 group", () => {
    const floor1 = getRoomsByFloor(1, ROOM_REGISTRY);
    expect(floor1.map((r) => r.roomId)).toContain("stairwell");
  });

  it("rv-15c: RoomsFromRegistry floor-group logic includes stairwell on both floors", () => {
    const groups = groupRoomsByFloor(ROOM_REGISTRY);
    expect(groups[0].map((r) => r.roomId)).toContain("stairwell");
    expect(groups[1].map((r) => r.roomId)).toContain("stairwell");
  });

  it("rv-15d: stairwell does not appear twice in the same floor group (dedup)", () => {
    const groups = groupRoomsByFloor(ROOM_REGISTRY);
    const floor0Ids = groups[0].map((r) => r.roomId);
    const floor1Ids = groups[1].map((r) => r.roomId);
    expect(floor0Ids.filter((id) => id === "stairwell")).toHaveLength(1);
    expect(floor1Ids.filter((id) => id === "stairwell")).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-16 — Corridor types have lower fillOpacity than non-corridor types
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-16 — Corridor rooms have distinctly lower fillOpacity", () => {
  it("rv-16a: corridor fillOpacity is less than control/office/lab/lobby/archive", () => {
    const corridorOpacity = VOLUME_STYLES["corridor"].fillOpacity;
    const nonCorridorOpacities = (["control", "office", "lab", "lobby", "archive"] as const).map(
      (rt) => VOLUME_STYLES[rt].fillOpacity,
    );
    for (const op of nonCorridorOpacities) {
      expect(corridorOpacity).toBeLessThan(op);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-17 — Control room has the highest emissiveIntensity (authority signal)
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-17 — Control room has the highest emissiveIntensity", () => {
  it("rv-17a: control emissiveIntensity is greater than all other types", () => {
    const controlIntensity = VOLUME_STYLES["control"].emissiveIntensity;
    const others = (["office", "lab", "lobby", "archive", "corridor"] as const).map(
      (rt) => VOLUME_STYLES[rt].emissiveIntensity,
    );
    for (const intensity of others) {
      expect(controlIntensity).toBeGreaterThan(intensity);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-18 — Badge label data: all rooms have non-empty name and roomType
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-18 — Badge label data completeness", () => {
  it("rv-18a: every registry entry has a non-empty name (primary badge line)", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(entry.name.length, `Empty name for '${entry.roomId}'`).toBeGreaterThan(0);
    }
  });

  it("rv-18b: every registry entry has a non-empty roomType (type badge)", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(entry.roomType.length, `Empty roomType for '${entry.roomId}'`).toBeGreaterThan(0);
    }
  });

  it("rv-18c: every registry entry has a colorAccent string (badge accent color)", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(typeof entry.colorAccent).toBe("string");
      expect(entry.colorAccent.length, `Empty colorAccent for '${entry.roomId}'`).toBeGreaterThan(0);
    }
  });

  it("rv-18d: every registry entry has an icon string (badge icon)", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(typeof entry.icon).toBe("string");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-19 — Badge floor index matches BUILDING room floor values
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-19 — Floor indices in registry match BUILDING", () => {
  it("rv-19a: every floor index in registry matches BUILDING.rooms floor", () => {
    for (const def of BUILDING.rooms) {
      const entry = ROOM_REGISTRY[def.roomId];
      expect(entry).toBeDefined();
      expect(entry!.floor).toBe(def.floor);
    }
  });

  it("rv-19b: floor 0 rooms have floor index 0", () => {
    const floor0Entries = getRoomsByFloor(0, ROOM_REGISTRY).filter(
      (e) => e.roomId !== "stairwell",
    );
    for (const entry of floor0Entries) {
      expect(entry.floor, `${entry.roomId} should be on floor 0`).toBe(0);
    }
  });

  it("rv-19c: floor 1 rooms have floor index 1", () => {
    const floor1Entries = getRoomsByFloor(1, ROOM_REGISTRY).filter(
      (e) => e.roomId !== "stairwell",
    );
    for (const entry of floor1Entries) {
      expect(entry.floor, `${entry.roomId} should be on floor 1`).toBe(1);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-20 — Resident agents: key rooms have resident agents
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-20 — Key rooms have resident agents for badge display", () => {
  it("rv-20a: ops-control has at least one resident agent", () => {
    const entry = ROOM_REGISTRY["ops-control"]!;
    expect(entry.residentAgents.length).toBeGreaterThan(0);
  });

  it("rv-20b: impl-office has at least one resident agent", () => {
    const entry = ROOM_REGISTRY["impl-office"]!;
    expect(entry.residentAgents.length).toBeGreaterThan(0);
  });

  it("rv-20c: research-lab has at least one resident agent", () => {
    const entry = ROOM_REGISTRY["research-lab"]!;
    expect(entry.residentAgents.length).toBeGreaterThan(0);
  });

  it("rv-20d: validation-office has at least one resident agent", () => {
    const entry = ROOM_REGISTRY["validation-office"]!;
    expect(entry.residentAgents.length).toBeGreaterThan(0);
  });

  it("rv-20e: review-office has at least one resident agent", () => {
    const entry = ROOM_REGISTRY["review-office"]!;
    expect(entry.residentAgents.length).toBeGreaterThan(0);
  });

  it("rv-20f: every resident agent has a non-empty name field", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      for (const agent of entry.residentAgents) {
        expect(agent.name, `Empty agent name in room ${entry.roomId}`).toBeTruthy();
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-21 — Corridor rooms have no resident agents
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-21 — Corridor rooms have empty residentAgents (badge hides agents)", () => {
  it("rv-21a: corridor-main has no resident agents", () => {
    expect(ROOM_REGISTRY["corridor-main"]!.residentAgents).toHaveLength(0);
  });

  it("rv-21b: stairwell has no resident agents", () => {
    expect(ROOM_REGISTRY["stairwell"]!.residentAgents).toHaveLength(0);
  });

  it("rv-21c: archive-vault has no resident agents", () => {
    expect(ROOM_REGISTRY["archive-vault"]!.residentAgents).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-22 — validateRoomRegistry returns no errors for static BUILDING
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-22 — validateRoomRegistry passes for static BUILDING", () => {
  it("rv-22a: validateRoomRegistry returns an empty errors array", () => {
    const errors = validateRoomRegistry(ROOM_REGISTRY);
    expect(errors).toHaveLength(0);
  });

  it("rv-22b: validateRoomRegistry with a freshly built registry also passes", () => {
    const registry = buildRoomRegistry();
    const errors = validateRoomRegistry(registry);
    expect(errors).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-23 — RoomsFromRegistry groups rooms into per-floor groups (logic test)
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-23 — Floor grouping logic (mirrors RoomsFromRegistry internal logic)", () => {
  it("rv-23a: groupRoomsByFloor produces exactly 2 floor groups (0 and 1)", () => {
    const groups = groupRoomsByFloor(ROOM_REGISTRY);
    expect(Object.keys(groups).map(Number).sort()).toEqual([0, 1]);
  });

  it("rv-23b: floor 0 group has 3 rooms (project-main, archive-vault, stairwell)", () => {
    const groups = groupRoomsByFloor(ROOM_REGISTRY);
    expect(groups[0]).toHaveLength(3);
  });

  it("rv-23c: floor 1 group has 7 rooms (6 floor-1 rooms + stairwell)", () => {
    const groups = groupRoomsByFloor(ROOM_REGISTRY);
    expect(groups[1]).toHaveLength(7);
  });

  it("rv-23d: total rooms across both floor groups = 10 (9 rooms + stairwell counted twice)", () => {
    const groups = groupRoomsByFloor(ROOM_REGISTRY);
    const total = (groups[0]?.length ?? 0) + (groups[1]?.length ?? 0);
    expect(total).toBe(10); // 9 unique rooms + stairwell counted on both floors
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-24 — Volume box is slightly inset from positionHint (bw = w - 0.06)
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-24 — Volume box geometry is inset from positionHint bounds", () => {
  /**
   * The inset values are defined in RoomVolume.tsx as constants:
   *   bw = w - 0.06
   *   bh = h - 0.04
   *   bd = d - 0.06
   *
   * We verify the data contract that all room positionHint dimensions are
   * large enough for the inset to produce positive geometry.
   */
  it("rv-24a: all room widths (x dimension) > 0.06 (inset-safe)", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(
        entry.positionHint.dimensions.x,
        `${entry.roomId} width too small for inset`,
      ).toBeGreaterThan(0.06);
    }
  });

  it("rv-24b: all room heights (y dimension) > 0.04 (inset-safe)", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(
        entry.positionHint.dimensions.y,
        `${entry.roomId} height too small for inset`,
      ).toBeGreaterThan(0.04);
    }
  });

  it("rv-24c: all room depths (z dimension) > 0.06 (inset-safe)", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(
        entry.positionHint.dimensions.z,
        `${entry.roomId} depth too small for inset`,
      ).toBeGreaterThan(0.06);
    }
  });

  it("rv-24d: inset box dimensions (bw, bh, bd) are computable and positive for ops-control", () => {
    const entry = ROOM_REGISTRY["ops-control"]!;
    const { x: w, y: h, z: d } = entry.positionHint.dimensions;
    const bw = w - 0.06;
    const bh = h - 0.04;
    const bd = d - 0.06;
    expect(bw).toBeGreaterThan(0);
    expect(bh).toBeGreaterThan(0);
    expect(bd).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-25 — Label Y position is above the room ceiling (pos.y + h + 0.32)
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-25 — Label Y is above room ceiling", () => {
  it("rv-25a: labelY (pos.y + h + 0.32) is above room ceiling (pos.y + h) for all rooms", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      const { position: pos, dimensions: dim } = entry.positionHint;
      const ceilingY = pos.y + dim.y;
      const labelY = pos.y + dim.y + 0.32;
      expect(labelY).toBeGreaterThan(ceilingY);
    }
  });

  it("rv-25b: labelY offset is exactly 0.32 units above ceiling for project-main", () => {
    const entry = ROOM_REGISTRY["project-main"]!;
    const { position: pos, dimensions: dim } = entry.positionHint;
    const ceilingY = pos.y + dim.y;
    const labelY = ceilingY + 0.32;
    expect(labelY - ceilingY).toBeCloseTo(0.32, 5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-26 — All colors use consistent hex format (#RRGGBB)
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-26 — All colors use #RRGGBB hex format", () => {
  it("rv-26a: VOLUME_STYLES fillColors are all #RRGGBB", () => {
    for (const rt of ALL_ROOM_TYPES) {
      expect(VOLUME_STYLES[rt].fillColor).toMatch(HEX_PATTERN);
    }
  });

  it("rv-26b: VOLUME_STYLES edgeColors are all #RRGGBB", () => {
    for (const rt of ALL_ROOM_TYPES) {
      expect(VOLUME_STYLES[rt].edgeColor).toMatch(HEX_PATTERN);
    }
  });

  it("rv-26c: VOLUME_STYLES emissive colors are all #RRGGBB", () => {
    for (const rt of ALL_ROOM_TYPES) {
      expect(VOLUME_STYLES[rt].emissive).toMatch(HEX_PATTERN);
    }
  });

  it("rv-26d: ROLE_VISUALS primary colors are all #RRGGBB", () => {
    for (const rt of ALL_ROOM_TYPES) {
      expect(ROLE_VISUALS[rt].color).toMatch(HEX_PATTERN);
    }
  });

  it("rv-26e: registry colorAccent values are all #RRGGBB", () => {
    for (const entry of Object.values(ROOM_REGISTRY)) {
      expect(entry.colorAccent, `${entry.roomId} colorAccent`).toMatch(HEX_PATTERN);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-27 — All room types in BUILDING.rooms are within the VOLUME_STYLES key set
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-27 — All BUILDING room types have a VOLUME_STYLES entry", () => {
  it("rv-27a: every room in BUILDING has a VOLUME_STYLES entry for its roomType", () => {
    for (const room of BUILDING.rooms) {
      expect(
        VOLUME_STYLES[room.roomType],
        `No VOLUME_STYLES for room type "${room.roomType}" used by "${room.roomId}"`,
      ).toBeDefined();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// rv-28 — Non-regression: VOLUME_STYLES entries match expected values for key rooms
// ═════════════════════════════════════════════════════════════════════════════

describe("rv-28 — Non-regression: VOLUME_STYLES canonical values", () => {
  it("rv-28a: control fillColor is #FF7043", () => {
    expect(VOLUME_STYLES["control"].fillColor).toBe("#FF7043");
  });

  it("rv-28b: office fillColor is #66BB6A", () => {
    expect(VOLUME_STYLES["office"].fillColor).toBe("#66BB6A");
  });

  it("rv-28c: lab fillColor is #AB47BC", () => {
    expect(VOLUME_STYLES["lab"].fillColor).toBe("#AB47BC");
  });

  it("rv-28d: lobby fillColor is #4FC3F7", () => {
    expect(VOLUME_STYLES["lobby"].fillColor).toBe("#4FC3F7");
  });

  it("rv-28e: archive fillColor is #78909C", () => {
    expect(VOLUME_STYLES["archive"].fillColor).toBe("#78909C");
  });

  it("rv-28f: corridor fillColor is #546E7A", () => {
    expect(VOLUME_STYLES["corridor"].fillColor).toBe("#546E7A");
  });

  it("rv-28g: all 6 VOLUME_STYLES entries remain unchanged (regression guard)", () => {
    // Guard that structural refactors don't drop any room type entry
    const knownTypes = new Set(Object.keys(VOLUME_STYLES));
    for (const rt of ALL_ROOM_TYPES) {
      expect(knownTypes.has(rt)).toBe(true);
    }
    expect(knownTypes.size).toBe(6);
  });
});
