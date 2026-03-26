/**
 * @module room-config-schema.test
 *
 * Tests for Sub-AC 12a (Sub-AC 1):
 *   Default room type mappings in the ontology schema.
 *
 * Verifies that:
 *   1. Every RoomConfigType has a complete entry in DEFAULT_ROOM_TYPE_MAPPINGS
 *   2. All visual properties are valid (non-empty strings, valid enums)
 *   3. All behavioral properties are valid (capacity types, policy enums)
 *   4. getRoomTypeDefaults() returns the correct entry for each type
 *   5. buildPlacementFromTypeDefaults() computes center correctly
 *   6. The mapping is frozen (immutable) at runtime
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_ROOM_TYPE_MAPPINGS,
  ROOM_CONFIG_TYPES,
  ROOM_CAMERA_PRESETS,
  getRoomTypeDefaults,
  buildPlacementFromTypeDefaults,
  type RoomConfigType,
  type RoomTypeVisualProps,
} from "../room-config-schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const VALID_ACCESS_POLICIES = ["open", "members-only", "approval-required"] as const;
const VALID_SUMMARY_MODES = ["concise", "verbose", "silent"] as const;

// ---------------------------------------------------------------------------
// 1. Coverage: every RoomConfigType has an entry
// ---------------------------------------------------------------------------

describe("DEFAULT_ROOM_TYPE_MAPPINGS coverage", () => {
  it("contains an entry for every RoomConfigType", () => {
    for (const roomType of ROOM_CONFIG_TYPES) {
      expect(
        DEFAULT_ROOM_TYPE_MAPPINGS[roomType],
        `Missing entry for room type "${roomType}"`,
      ).toBeDefined();
    }
  });

  it("has exactly 8 entries (one per RoomConfigType)", () => {
    const keys = Object.keys(DEFAULT_ROOM_TYPE_MAPPINGS);
    expect(keys).toHaveLength(ROOM_CONFIG_TYPES.length);
    expect(keys).toHaveLength(8);
  });

  it("has no extra keys beyond the defined RoomConfigType values", () => {
    const knownTypes = new Set<string>(ROOM_CONFIG_TYPES);
    for (const key of Object.keys(DEFAULT_ROOM_TYPE_MAPPINGS)) {
      expect(knownTypes.has(key), `Unexpected room type key: "${key}"`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Visual properties validation
// ---------------------------------------------------------------------------

describe("RoomTypeVisualProps — visual properties", () => {
  for (const roomType of ROOM_CONFIG_TYPES) {
    describe(`room type: "${roomType}"`, () => {
      let props: RoomTypeVisualProps;

      beforeEach(() => {
        props = DEFAULT_ROOM_TYPE_MAPPINGS[roomType];
      });

      it("colorAccent is a valid 6-digit hex color", () => {
        expect(props.colorAccent).toMatch(HEX_COLOR_REGEX);
      });

      it("icon is a non-empty string", () => {
        expect(typeof props.icon).toBe("string");
        expect(props.icon.length).toBeGreaterThan(0);
      });

      it("defaultCameraPreset is a valid RoomCameraPreset", () => {
        expect(ROOM_CAMERA_PRESETS).toContain(props.defaultCameraPreset);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Behavioral properties validation
// ---------------------------------------------------------------------------

describe("RoomTypeVisualProps — behavioral properties", () => {
  for (const roomType of ROOM_CONFIG_TYPES) {
    describe(`room type: "${roomType}"`, () => {
      let props: RoomTypeVisualProps;

      beforeEach(() => {
        props = DEFAULT_ROOM_TYPE_MAPPINGS[roomType];
      });

      it("defaultCapacity is -1 (unlimited), 0 (spatial-only), or a positive integer", () => {
        expect(props.defaultCapacity).toBeTypeOf("number");
        expect(props.defaultCapacity >= -1).toBe(true);
        // Should be whole number
        expect(Number.isInteger(props.defaultCapacity)).toBe(true);
      });

      it("defaultAccessPolicy is a valid access policy string", () => {
        expect(VALID_ACCESS_POLICIES).toContain(props.defaultAccessPolicy);
      });

      it("defaultSummaryMode is a valid summary mode string", () => {
        expect(VALID_SUMMARY_MODES).toContain(props.defaultSummaryMode);
      });

      it("behaviorDescription is a non-empty string", () => {
        expect(typeof props.behaviorDescription).toBe("string");
        expect(props.behaviorDescription.length).toBeGreaterThan(10);
      });

      it("isAgentHosting is a boolean", () => {
        expect(typeof props.isAgentHosting).toBe("boolean");
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Specific type assertions (ontology contracts)
// ---------------------------------------------------------------------------

describe("Specific room type ontology contracts", () => {
  it("control room: warm orange accent (#FF7043), overhead camera, agent-hosting", () => {
    const props = DEFAULT_ROOM_TYPE_MAPPINGS["control"];
    expect(props.colorAccent).toBe("#FF7043");
    expect(props.defaultCameraPreset).toBe("overhead");
    expect(props.isAgentHosting).toBe(true);
    expect(props.defaultAccessPolicy).toBe("members-only");
    expect(props.defaultSummaryMode).toBe("verbose");
  });

  it("lobby room: light blue accent (#4FC3F7), not agent-hosting (user-facing), open access", () => {
    const props = DEFAULT_ROOM_TYPE_MAPPINGS["lobby"];
    expect(props.colorAccent).toBe("#4FC3F7");
    expect(props.isAgentHosting).toBe(false);
    expect(props.defaultAccessPolicy).toBe("open");
  });

  it("archive room: muted grey-blue accent (#78909C), not agent-hosting, read-only semantics", () => {
    const props = DEFAULT_ROOM_TYPE_MAPPINGS["archive"];
    expect(props.colorAccent).toBe("#78909C");
    expect(props.isAgentHosting).toBe(false);
    expect(props.defaultSummaryMode).toBe("concise");
  });

  it("corridor room: dark slate accent, capacity=0 (spatial-only), silent summary", () => {
    const props = DEFAULT_ROOM_TYPE_MAPPINGS["corridor"];
    expect(props.defaultCapacity).toBe(0);
    expect(props.isAgentHosting).toBe(false);
    expect(props.defaultSummaryMode).toBe("silent");
  });

  it("lab room: purple accent (#AB47BC), agent-hosting, isometric camera", () => {
    const props = DEFAULT_ROOM_TYPE_MAPPINGS["lab"];
    expect(props.colorAccent).toBe("#AB47BC");
    expect(props.isAgentHosting).toBe(true);
    expect(props.defaultCameraPreset).toBe("isometric");
  });

  it("office room: green accent (#66BB6A), agent-hosting, close-up camera", () => {
    const props = DEFAULT_ROOM_TYPE_MAPPINGS["office"];
    expect(props.colorAccent).toBe("#66BB6A");
    expect(props.isAgentHosting).toBe(true);
    expect(props.defaultCameraPreset).toBe("close-up");
  });

  it("pipeline room: amber accent (#FFA726), not agent-hosting, overhead camera", () => {
    const props = DEFAULT_ROOM_TYPE_MAPPINGS["pipeline"];
    expect(props.colorAccent).toBe("#FFA726");
    expect(props.isAgentHosting).toBe(false);
    expect(props.defaultCameraPreset).toBe("overhead");
  });

  it("agent room: cyan accent (#26C6DA), agent-hosting, capacity=1", () => {
    const props = DEFAULT_ROOM_TYPE_MAPPINGS["agent"];
    expect(props.colorAccent).toBe("#26C6DA");
    expect(props.isAgentHosting).toBe(true);
    expect(props.defaultCapacity).toBe(1);
    expect(props.defaultAccessPolicy).toBe("members-only");
  });
});

// ---------------------------------------------------------------------------
// 5. getRoomTypeDefaults()
// ---------------------------------------------------------------------------

describe("getRoomTypeDefaults()", () => {
  it("returns the correct entry for each type", () => {
    for (const roomType of ROOM_CONFIG_TYPES) {
      const result = getRoomTypeDefaults(roomType);
      expect(result).toBe(DEFAULT_ROOM_TYPE_MAPPINGS[roomType]);
    }
  });

  it("returns the same reference as DEFAULT_ROOM_TYPE_MAPPINGS (no copy)", () => {
    const direct = DEFAULT_ROOM_TYPE_MAPPINGS["control"];
    const viaHelper = getRoomTypeDefaults("control");
    expect(viaHelper).toBe(direct);
  });
});

// ---------------------------------------------------------------------------
// 6. buildPlacementFromTypeDefaults()
// ---------------------------------------------------------------------------

describe("buildPlacementFromTypeDefaults()", () => {
  it("computes center as position + dimensions/2", () => {
    const placement = buildPlacementFromTypeDefaults(
      "control",
      { x: 4, y: 3, z: 0 },
      { x: 5, y: 3, z: 4 },
    );
    expect(placement.center.x).toBeCloseTo(6.5);
    expect(placement.center.y).toBeCloseTo(4.5);
    expect(placement.center.z).toBeCloseTo(2);
  });

  it("copies position and dimensions verbatim", () => {
    const pos = { x: 0, y: 0, z: 0 };
    const dim = { x: 3, y: 3, z: 3 };
    const placement = buildPlacementFromTypeDefaults("office", pos, dim);
    expect(placement.position).toEqual(pos);
    expect(placement.dimensions).toEqual(dim);
  });

  it("uses the type's defaultCameraPreset", () => {
    const placement = buildPlacementFromTypeDefaults(
      "control",
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    );
    expect(placement.cameraPreset).toBe("overhead");
  });

  it("uses the type's colorAccent", () => {
    const placement = buildPlacementFromTypeDefaults(
      "lab",
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    );
    expect(placement.colorAccent).toBe("#AB47BC");
  });

  it("uses the type's icon", () => {
    const placement = buildPlacementFromTypeDefaults(
      "archive",
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    );
    expect(placement.icon).toBe("archive");
  });

  it("works for all 8 room types without throwing", () => {
    for (const roomType of ROOM_CONFIG_TYPES) {
      expect(() =>
        buildPlacementFromTypeDefaults(
          roomType,
          { x: 0, y: 0, z: 0 },
          { x: 4, y: 3, z: 4 },
        ),
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Immutability
// ---------------------------------------------------------------------------

describe("DEFAULT_ROOM_TYPE_MAPPINGS immutability", () => {
  it("is frozen at the top level", () => {
    expect(Object.isFrozen(DEFAULT_ROOM_TYPE_MAPPINGS)).toBe(true);
  });

  it("throws in strict mode when mutating (or silently ignores in non-strict)", () => {
    const attempt = () => {
      // @ts-expect-error — intentional mutation attempt
      DEFAULT_ROOM_TYPE_MAPPINGS["control"] = {} as RoomTypeVisualProps;
    };
    // In strict mode this throws; in sloppy mode it silently no-ops.
    // Either is acceptable — the key is the object stays unchanged.
    try {
      attempt();
    } catch {
      // expected in strict mode
    }
    // The entry must remain unchanged regardless
    expect(DEFAULT_ROOM_TYPE_MAPPINGS["control"].colorAccent).toBe("#FF7043");
  });
});
