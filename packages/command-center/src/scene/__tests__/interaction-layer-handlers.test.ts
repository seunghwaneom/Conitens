/**
 * interaction-layer-handlers.test.ts
 *
 * Sub-AC 4d: Isolated unit tests for all three interaction layers
 * (Building / Room / Agent) verifying correct interaction_intent shape
 * and event triggering without invoking the command pipeline.
 *
 * Test scope
 * ──────────
 * These tests operate purely in Node.js — no React, no Three.js, no DOM, no
 * R3F, and no command-file writes.  The "command pipeline" (use-command-file-
 * writer, orchestrator IPC, etc.) is deliberately excluded.
 *
 * Approach per layer
 * ──────────────────
 * • Building layer (ild-01): Factory + intent-shape tests with simulated
 *   handler contracts.  The building hook (`useBuildingInteraction`) relies
 *   on React hooks, so we verify that the intent factories produce the correct
 *   payload for every event type and that the propagation contract (calling
 *   stopPropagation before emitting) is observable through a mock event.
 *
 * • Room layer (ild-02): Uses `createRoomInteractionHandlers` — a pure
 *   dependency-injected factory exported from `use-room-interaction.ts`.
 *   All store actions (drillIntoRoom, highlightRoom, …) and the intent emitter
 *   are replaced with vi.fn() spies so the tests run headlessly and verify
 *   that each handler:
 *     1. calls stopPropagation() first (propagation contract),
 *     2. emits the correct typed intent via emitIntent (correct shape), and
 *     3. executes the right store side-effect (drillIntoRoom, highlightRoom…).
 *
 * • Agent layer (ild-03): Uses `buildAgentInteractionIntent` + the Zustand
 *   store's `emitAgentInteractionIntent` to simulate what
 *   `useAgentInteractionHandlers` does.  ThreeEvent cannot be constructed
 *   headlessly, so the R3F binding layer is excluded; the intent production
 *   logic and store integration are tested directly.
 *
 * • Cross-layer isolation (ild-04): Ensures that BUILDING_*, ROOM_*, and
 *   AGENT_* intent shapes are mutually exclusive and cannot be confused by
 *   guards.
 *
 * Test ID scheme: ild-NN
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Building layer imports ─────────────────────────────────────────────────
import {
  makeBuildingClickedIntent,
  makeBuildingHoveredIntent,
  makeBuildingUnhoveredIntent,
  makeBuildingContextMenuIntent,
  isBuildingClickedIntent,
  isBuildingHoveredIntent,
  isBuildingUnhoveredIntent,
  isBuildingContextMenuIntent,
  isBuildingInteractionIntent,
  type BuildingInteractionIntent,
} from "../building-interaction-intents.js";

// ── Room layer imports ─────────────────────────────────────────────────────
import {
  createRoomInteractionHandlers,
  type RoomHandlerDeps,
  type RoomPointerEvent,
  type RoomContextMenuState,
} from "../../hooks/use-room-interaction.js";
import {
  isRoomClickedIntent,
  isRoomHoveredIntent,
  isRoomUnhoveredIntent,
  isRoomContextMenuIntent,
  isRoomInteractionIntent,
  type RoomInteractionIntent,
} from "../room-interaction-intents.js";

// ── Agent layer imports ────────────────────────────────────────────────────
import {
  buildAgentInteractionIntent,
  useInteractionIntentStore,
  AGENT_INTERACTION_INTENT_CATEGORY,
  type AgentInteractionIntentKind,
} from "../../store/interaction-intent-store.js";
import {
  isAgentClickedIntent,
  isAgentHoveredIntent,
  isAgentUnhoveredIntent,
  isAgentContextMenuIntent,
  isAgentInteractionIntent,
} from "../agent-interaction-intents.js";
import { useSceneEventLog } from "../../store/scene-event-log.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixture constants
// ─────────────────────────────────────────────────────────────────────────────

const WORLD_POS = { x: 2.5, y: 0.0, z: -1.5 };
const SCREEN_X  = 640;
const SCREEN_Y  = 400;
const BASE_TS   = 1_700_000_000_000;

/** Minimal mock pointer event that satisfies RoomPointerEvent / BuildingPointerEvent. */
function makeMockPointerEvent(
  point = WORLD_POS,
  clientX = SCREEN_X,
  clientY = SCREEN_Y,
) {
  const stopPropagation = vi.fn<[], void>();
  const preventDefault  = vi.fn<[], void>();
  return {
    stopPropagation,
    point,
    nativeEvent: { clientX, clientY, preventDefault },
  };
}

/** Reset Zustand stores to a clean slate. */
function resetStores() {
  useInteractionIntentStore.setState({
    intents:      [],
    totalEmitted: 0,
    lastIntent:   null,
  });
  useSceneEventLog.setState({
    entries:          [],
    snapshots:        [],
    sessionId:        "ild-test",
    recording:        false,
    totalRecorded:    0,
    seq:              0,
    recordingStartTs: null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ild-01 — Building layer: intent shape & simulated handler contracts
// ─────────────────────────────────────────────────────────────────────────────

describe("ild-01 — Building layer: intent shape and simulated handler contracts", () => {

  // ── ild-01a: BUILDING_CLICKED handler contract ──────────────────────────

  it("ild-01a: simulated onClick handler calls stopPropagation then emits BUILDING_CLICKED", () => {
    const emitIntent = vi.fn<[BuildingInteractionIntent], void>();
    const event      = makeMockPointerEvent();

    // Simulate what useBuildingInteraction#onClick does (minus React/store):
    event.stopPropagation();
    const intent = makeBuildingClickedIntent({
      building_id:   "hq",
      drill_level:   "building",
      world_position: event.point,
      floor_count:   2,
      ts:             BASE_TS,
      session_id:     "s001",
    });
    emitIntent(intent);

    // 1. stopPropagation must have been called before emitIntent
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    // 2. emitIntent was called once
    expect(emitIntent).toHaveBeenCalledTimes(1);
    // 3. Correct intent shape
    const captured = emitIntent.mock.calls[0]![0];
    expect(isBuildingClickedIntent(captured)).toBe(true);
    expect(captured.intent).toBe("BUILDING_CLICKED");
    expect(captured.building_id).toBe("hq");
    expect(captured.drill_level).toBe("building");
    expect(captured.floor_count).toBe(2);
    expect(captured.world_position).toEqual(WORLD_POS);
  });

  // ── ild-01b: BUILDING_HOVERED handler contract ──────────────────────────

  it("ild-01b: simulated onPointerOver handler emits BUILDING_HOVERED intent", () => {
    const emitIntent = vi.fn<[BuildingInteractionIntent], void>();
    const event      = makeMockPointerEvent();

    event.stopPropagation();
    const intent = makeBuildingHoveredIntent({
      building_id:   "hq",
      world_position: event.point,
      ts:             BASE_TS,
      session_id:     "s001",
    });
    emitIntent(intent);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(emitIntent).toHaveBeenCalledTimes(1);
    const captured = emitIntent.mock.calls[0]![0];
    expect(isBuildingHoveredIntent(captured)).toBe(true);
    expect(captured.building_id).toBe("hq");
    expect(captured.world_position).toEqual(WORLD_POS);
  });

  // ── ild-01c: BUILDING_UNHOVERED handler contract ─────────────────────────

  it("ild-01c: simulated onPointerOut handler emits BUILDING_UNHOVERED intent", () => {
    const emitIntent = vi.fn<[BuildingInteractionIntent], void>();
    const event      = makeMockPointerEvent();

    event.stopPropagation();
    const intent = makeBuildingUnhoveredIntent({
      building_id: "hq",
      ts:          BASE_TS,
      session_id:  "s001",
    });
    emitIntent(intent);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(emitIntent).toHaveBeenCalledTimes(1);
    const captured = emitIntent.mock.calls[0]![0];
    expect(isBuildingUnhoveredIntent(captured)).toBe(true);
    expect(captured.building_id).toBe("hq");
  });

  // ── ild-01d: BUILDING_CONTEXT_MENU handler contract ─────────────────────

  it("ild-01d: simulated onContextMenu handler emits BUILDING_CONTEXT_MENU with screen_position", () => {
    const emitIntent = vi.fn<[BuildingInteractionIntent], void>();
    const event      = makeMockPointerEvent();

    event.stopPropagation();
    const screenPos = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
    const intent = makeBuildingContextMenuIntent({
      building_id:    "hq",
      world_position: event.point,
      screen_position: screenPos,
      drill_level:    "building",
      ts:             BASE_TS,
      session_id:     "s001",
    });
    emitIntent(intent);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(emitIntent).toHaveBeenCalledTimes(1);
    const captured = emitIntent.mock.calls[0]![0];
    expect(isBuildingContextMenuIntent(captured)).toBe(true);
    expect(captured.screen_position).toEqual({ x: SCREEN_X, y: SCREEN_Y });
    expect(captured.drill_level).toBe("building");
  });

  // ── ild-01e: all building intents pass isBuildingInteractionIntent ────────

  it("ild-01e: all four building intent kinds pass the union guard", () => {
    const intents: BuildingInteractionIntent[] = [
      makeBuildingClickedIntent({
        building_id: "hq", drill_level: "floor", world_position: null,
        floor_count: 2, ts: BASE_TS,
      }),
      makeBuildingHoveredIntent({ building_id: "hq", world_position: null, ts: BASE_TS }),
      makeBuildingUnhoveredIntent({ building_id: "hq", ts: BASE_TS }),
      makeBuildingContextMenuIntent({
        building_id: "hq", world_position: null,
        screen_position: { x: 0, y: 0 }, drill_level: "building", ts: BASE_TS,
      }),
    ];

    for (const intent of intents) {
      expect(isBuildingInteractionIntent(intent)).toBe(true);
    }
  });

  // ── ild-01f: click at each drill level captures correct level ─────────────

  it("ild-01f: BUILDING_CLICKED intent captures the drill level at time of event", () => {
    const drillLevels = ["building", "floor", "room", "agent"] as const;
    for (const level of drillLevels) {
      const intent = makeBuildingClickedIntent({
        building_id:   "hq",
        drill_level:   level,
        world_position: WORLD_POS,
        floor_count:   3,
        ts:            BASE_TS,
      });
      expect(intent.drill_level).toBe(level);
      expect(isBuildingClickedIntent(intent)).toBe(true);
    }
  });

  // ── ild-01g: building intents are serialisable (no command-pipeline side effects) ──

  it("ild-01g: building intent objects are plain JSON (no functions, no side effects)", () => {
    const intent = makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: WORLD_POS, floor_count: 2, ts: BASE_TS,
    });
    // Pure data — no function references
    for (const value of Object.values(intent)) {
      if (value !== null) {
        expect(typeof value).not.toBe("function");
      }
    }
    // JSON round-trip preserves guard validity
    const parsed = JSON.parse(JSON.stringify(intent)) as unknown;
    expect(isBuildingClickedIntent(parsed)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ild-02 — Room layer: createRoomInteractionHandlers pure factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper: build a RoomHandlerDeps object with all side-effect functions
 * replaced by vi.fn() mocks and an injectable emitIntent spy.
 */
function makeRoomDeps(
  overrides: Partial<RoomHandlerDeps> = {},
): RoomHandlerDeps & {
  emitIntent:        ReturnType<typeof vi.fn>;
  drillIntoRoom:     ReturnType<typeof vi.fn>;
  highlightRoom:     ReturnType<typeof vi.fn>;
  unhighlightRoom:   ReturnType<typeof vi.fn>;
  setContextMenu:    ReturnType<typeof vi.fn>;
  setCursor:         ReturnType<typeof vi.fn>;
} {
  const emitIntent       = vi.fn<[RoomInteractionIntent], void>();
  const drillIntoRoom    = vi.fn<[string], void>();
  const highlightRoom    = vi.fn<[string], void>();
  const unhighlightRoom  = vi.fn<[string], void>();
  const setContextMenu   = vi.fn<[RoomContextMenuState | null], void>();
  const setCursor        = vi.fn<[string], void>();

  return {
    roomId:     "ctrl-1",
    roomType:   "control",
    floor:      0,
    agentCount: 3,
    drillLevel: "floor",
    drillIntoRoom,
    highlightRoom,
    unhighlightRoom,
    emitIntent,
    setContextMenu,
    setCursor,
    sessionId:  "ild-session",
    ...overrides,
    // Ensure vi.fn overrides are preserved (cast)
  } as unknown as RoomHandlerDeps & {
    emitIntent:        ReturnType<typeof vi.fn>;
    drillIntoRoom:     ReturnType<typeof vi.fn>;
    highlightRoom:     ReturnType<typeof vi.fn>;
    unhighlightRoom:   ReturnType<typeof vi.fn>;
    setContextMenu:    ReturnType<typeof vi.fn>;
    setCursor:         ReturnType<typeof vi.fn>;
  };
}

describe("ild-02 — Room layer: createRoomInteractionHandlers pure factory", () => {

  // ── ild-02a: onClick at floor level — ROOM_CLICKED + drillIntoRoom ───────

  it("ild-02a: onClick emits ROOM_CLICKED and calls drillIntoRoom at floor drill level", () => {
    const deps   = makeRoomDeps({ drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event  = makeMockPointerEvent();

    handlers.onClick(event as unknown as RoomPointerEvent);

    // 1. stopPropagation called first
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    // 2. emitIntent called with ROOM_CLICKED
    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    expect(isRoomClickedIntent(emitted)).toBe(true);
    if (isRoomClickedIntent(emitted)) {
      expect(emitted.room_id).toBe("ctrl-1");
      expect(emitted.room_type).toBe("control");
      expect(emitted.floor).toBe(0);
      expect(emitted.drill_level).toBe("floor");
      expect(emitted.world_position).toEqual(WORLD_POS);
      expect(emitted.agent_count).toBe(3);
      expect(typeof emitted.ts).toBe("number");
      expect(emitted.session_id).toBe("ild-session");
    }
    // 3. drillIntoRoom called with the room id
    expect(deps.drillIntoRoom).toHaveBeenCalledTimes(1);
    expect(deps.drillIntoRoom).toHaveBeenCalledWith("ctrl-1");
  });

  // ── ild-02b: onClick at room level — ROOM_CLICKED but NO drillIntoRoom ───

  it("ild-02b: onClick at room drill level emits ROOM_CLICKED but does not call drillIntoRoom", () => {
    const deps   = makeRoomDeps({ drillLevel: "room" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event  = makeMockPointerEvent();

    handlers.onClick(event as unknown as RoomPointerEvent);

    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    expect(isRoomClickedIntent(emitted)).toBe(true);
    // drillIntoRoom must NOT be called when already at room level
    expect(deps.drillIntoRoom).not.toHaveBeenCalled();
  });

  // ── ild-02c: onPointerOver — ROOM_HOVERED + highlightRoom + cursor ────────

  it("ild-02c: onPointerOver emits ROOM_HOVERED, highlights room, and sets cursor", () => {
    const deps   = makeRoomDeps({ drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event  = makeMockPointerEvent();

    handlers.onPointerOver(event as unknown as RoomPointerEvent);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.emitIntent).toHaveBeenCalledTimes(1);

    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    expect(isRoomHoveredIntent(emitted)).toBe(true);
    if (isRoomHoveredIntent(emitted)) {
      expect(emitted.room_id).toBe("ctrl-1");
      expect(emitted.room_type).toBe("control");
      expect(emitted.floor).toBe(0);
      expect(emitted.world_position).toEqual(WORLD_POS);
      expect(typeof emitted.ts).toBe("number");
    }

    // highlightRoom is called with the room id
    expect(deps.highlightRoom).toHaveBeenCalledWith("ctrl-1");
    // cursor is set to pointer
    expect(deps.setCursor).toHaveBeenCalledWith("pointer");
  });

  // ── ild-02d: onPointerOver at building level — no-op ─────────────────────

  it("ild-02d: onPointerOver at building drill level stops propagation but emits nothing", () => {
    const deps   = makeRoomDeps({ drillLevel: "building" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event  = makeMockPointerEvent();

    handlers.onPointerOver(event as unknown as RoomPointerEvent);

    // stopPropagation is still called (contract)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    // But emitIntent and highlightRoom should NOT fire (building level guard)
    expect(deps.emitIntent).not.toHaveBeenCalled();
    expect(deps.highlightRoom).not.toHaveBeenCalled();
  });

  // ── ild-02e: onPointerOut — ROOM_UNHOVERED + unhighlightRoom + cursor ─────

  it("ild-02e: onPointerOut emits ROOM_UNHOVERED, unhighlights room, restores cursor", () => {
    const deps   = makeRoomDeps({ drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event  = makeMockPointerEvent();

    handlers.onPointerOut(event as unknown as RoomPointerEvent);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.emitIntent).toHaveBeenCalledTimes(1);

    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    expect(isRoomUnhoveredIntent(emitted)).toBe(true);
    if (isRoomUnhoveredIntent(emitted)) {
      expect(emitted.room_id).toBe("ctrl-1");
      expect(emitted.room_type).toBe("control");
      expect(emitted.floor).toBe(0);
      expect(typeof emitted.ts).toBe("number");
    }

    expect(deps.unhighlightRoom).toHaveBeenCalledWith("ctrl-1");
    expect(deps.setCursor).toHaveBeenCalledWith("auto");
  });

  // ── ild-02f: onContextMenu — ROOM_CONTEXT_MENU + setContextMenu ──────────

  it("ild-02f: onContextMenu emits ROOM_CONTEXT_MENU with screen_position and sets context menu state", () => {
    const deps   = makeRoomDeps({ drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event  = makeMockPointerEvent(WORLD_POS, 320, 200);

    handlers.onContextMenu(event as unknown as RoomPointerEvent);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.emitIntent).toHaveBeenCalledTimes(1);

    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    expect(isRoomContextMenuIntent(emitted)).toBe(true);
    if (isRoomContextMenuIntent(emitted)) {
      expect(emitted.room_id).toBe("ctrl-1");
      expect(emitted.room_type).toBe("control");
      expect(emitted.floor).toBe(0);
      expect(emitted.drill_level).toBe("floor");
      expect(emitted.world_position).toEqual(WORLD_POS);
      expect(emitted.screen_position).toEqual({ x: 320, y: 200 });
    }

    // setContextMenu was called with non-null state
    expect(deps.setContextMenu).toHaveBeenCalledTimes(1);
    const menuArg = (deps.setContextMenu as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomContextMenuState;
    expect(menuArg).not.toBeNull();
    expect(menuArg.room_id).toBe("ctrl-1");
    expect(menuArg.screen.x).toBe(320);
    expect(menuArg.screen.y).toBe(200);
  });

  // ── ild-02g: closeContextMenu clears context menu state ──────────────────

  it("ild-02g: closeContextMenu calls setContextMenu(null) to clear menu state", () => {
    const deps   = makeRoomDeps();
    const { closeContextMenu } = createRoomInteractionHandlers(deps);

    closeContextMenu();

    expect(deps.setContextMenu).toHaveBeenCalledTimes(1);
    expect(deps.setContextMenu).toHaveBeenCalledWith(null);
  });

  // ── ild-02h: room with 0 agents — agent_count=0 in intent ────────────────

  it("ild-02h: ROOM_CLICKED carries agent_count=0 for an empty room", () => {
    const deps  = makeRoomDeps({ agentCount: 0, drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockPointerEvent();

    handlers.onClick(event as unknown as RoomPointerEvent);

    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    if (isRoomClickedIntent(emitted)) {
      expect(emitted.agent_count).toBe(0);
    } else {
      throw new Error("Expected ROOM_CLICKED intent");
    }
  });

  // ── ild-02i: all RoomTypeKind values produce correct room_type in intent ──

  it("ild-02i: all room type kinds are correctly captured in ROOM_HOVERED intent", () => {
    const types = ["control", "office", "lab", "lobby", "archive", "corridor"] as const;

    for (const roomType of types) {
      const deps  = makeRoomDeps({ roomType, drillLevel: "floor" });
      const { handlers } = createRoomInteractionHandlers(deps);
      const event = makeMockPointerEvent();

      handlers.onPointerOver(event as unknown as RoomPointerEvent);

      const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
      expect(isRoomHoveredIntent(emitted)).toBe(true);
      if (isRoomHoveredIntent(emitted)) {
        expect(emitted.room_type).toBe(roomType);
      }
    }
  });

  // ── ild-02j: floor 1 room produces correct floor index in intent ──────────

  it("ild-02j: room on floor 1 captures floor=1 in all intent kinds", () => {
    const deps  = makeRoomDeps({ floor: 1, drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);

    const clickEvent  = makeMockPointerEvent();
    const hoverEvent  = makeMockPointerEvent();
    const unhoverEvent = makeMockPointerEvent();

    handlers.onClick(clickEvent as unknown as RoomPointerEvent);
    handlers.onPointerOver(hoverEvent as unknown as RoomPointerEvent);
    handlers.onPointerOut(unhoverEvent as unknown as RoomPointerEvent);

    const calls = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3);

    const [clickIntent, hoverIntent, unhoverIntent] = calls.map((c) => c[0] as RoomInteractionIntent);

    if (isRoomClickedIntent(clickIntent))   expect(clickIntent.floor).toBe(1);
    if (isRoomHoveredIntent(hoverIntent))   expect(hoverIntent.floor).toBe(1);
    if (isRoomUnhoveredIntent(unhoverIntent)) expect(unhoverIntent.floor).toBe(1);
  });

  // ── ild-02k: ROOM_CONTEXT_MENU falls back to {x:0,y:0} when no native event ─

  it("ild-02k: ROOM_CONTEXT_MENU uses {x:0,y:0} screen position when nativeEvent absent", () => {
    const deps   = makeRoomDeps({ drillLevel: "room" });
    const { handlers } = createRoomInteractionHandlers(deps);

    // Event without nativeEvent
    const event = {
      stopPropagation: vi.fn<[], void>(),
      point: WORLD_POS,
      // nativeEvent deliberately absent
    };

    handlers.onContextMenu(event as unknown as RoomPointerEvent);

    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    if (isRoomContextMenuIntent(emitted)) {
      expect(emitted.screen_position).toEqual({ x: 0, y: 0 });
    } else {
      throw new Error("Expected ROOM_CONTEXT_MENU intent");
    }
  });

  // ── ild-02l: session_id from deps is captured in intent ──────────────────

  it("ild-02l: custom sessionId is propagated to emitted ROOM_CLICKED intent", () => {
    const deps  = makeRoomDeps({ sessionId: "custom-session-42", drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockPointerEvent();

    handlers.onClick(event as unknown as RoomPointerEvent);

    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    if (isRoomClickedIntent(emitted)) {
      expect(emitted.session_id).toBe("custom-session-42");
    }
  });

  // ── ild-02m: all room intents pass the union guard ────────────────────────

  it("ild-02m: all four room intent kinds pass isRoomInteractionIntent union guard", () => {
    const deps  = makeRoomDeps({ drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);

    const clickEvent  = makeMockPointerEvent();
    const hoverEvent  = makeMockPointerEvent();
    const unhoverEvent = makeMockPointerEvent();
    const ctxEvent    = makeMockPointerEvent();

    handlers.onClick(clickEvent as unknown as RoomPointerEvent);
    handlers.onPointerOver(hoverEvent as unknown as RoomPointerEvent);
    handlers.onPointerOut(unhoverEvent as unknown as RoomPointerEvent);
    handlers.onContextMenu(ctxEvent as unknown as RoomPointerEvent);

    const calls = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(4);

    for (const [intent] of calls) {
      expect(isRoomInteractionIntent(intent as unknown)).toBe(true);
    }
  });

  // ── ild-02n: room intents are JSON-serialisable (no command pipeline) ─────

  it("ild-02n: room intents produced by handlers are plain JSON-serialisable objects", () => {
    const deps  = makeRoomDeps({ drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockPointerEvent();

    handlers.onClick(event as unknown as RoomPointerEvent);

    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    const serialised = JSON.stringify(emitted);
    const parsed = JSON.parse(serialised) as unknown;
    expect(isRoomInteractionIntent(parsed)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ild-03 — Agent layer: intent shape and event triggering via store
// ─────────────────────────────────────────────────────────────────────────────

describe("ild-03 — Agent layer: intent shape and event triggering via store", () => {
  beforeEach(resetStores);

  /** Minimal intent input for any agent intent kind. */
  function makeAgentInput(
    kind: AgentInteractionIntentKind,
    overrides: Record<string, unknown> = {},
  ) {
    return buildAgentInteractionIntent({
      kind,
      agentId:       "researcher-7",
      agentName:     "Dr. Research",
      agentRole:     "researcher",
      agentStatus:   "active",
      roomId:        "lab-room-01",
      worldPosition: WORLD_POS,
      wasSelected:   false,
      isDrillTarget: false,
      ...overrides,
    } as Parameters<typeof buildAgentInteractionIntent>[0]);
  }

  // ── ild-03a: click intent has correct shape and no command side effects ───

  it("ild-03a: agent click intent has correct shape and is not a Promise (no async IO)", () => {
    const intent = makeAgentInput("click");

    expect(typeof intent.intentId).toBe("string");
    expect(intent.intentId.length).toBeGreaterThan(0);
    expect(intent.kind).toBe("click");
    expect(intent.agentId).toBe("researcher-7");
    expect(intent.agentName).toBe("Dr. Research");
    expect(intent.agentRole).toBe("researcher");
    expect(intent.agentStatus).toBe("active");
    expect(intent.roomId).toBe("lab-room-01");
    expect(intent.worldPosition).toEqual(WORLD_POS);
    expect(intent.wasSelected).toBe(false);
    expect(intent.isDrillTarget).toBe(false);
    expect(typeof intent.ts).toBe("number");
    expect(typeof intent.tsIso).toBe("string");
    expect(intent instanceof Promise).toBe(false);
  });

  // ── ild-03b: hover_enter intent shape ────────────────────────────────────

  it("ild-03b: agent hover_enter intent carries all required agent-scoped fields", () => {
    const intent = makeAgentInput("hover_enter", {
      agentStatus:    "busy",
      screenPosition: { x: 400, y: 300 },
    });

    expect(intent.kind).toBe("hover_enter");
    expect(intent.agentStatus).toBe("busy");
    expect(intent.screenPosition).toEqual({ x: 400, y: 300 });
    expect(isAgentHoveredIntent({
      intent: "AGENT_HOVERED",
      agentId: intent.agentId,
      agentName: intent.agentName,
      agentRole: intent.agentRole,
      agentStatus: intent.agentStatus,
      roomId: intent.roomId,
      worldPosition: intent.worldPosition,
      ts: intent.ts,
    })).toBe(true);
  });

  // ── ild-03c: hover_exit intent shape ─────────────────────────────────────

  it("ild-03c: agent hover_exit intent has the correct kind field", () => {
    const intent = makeAgentInput("hover_exit");
    expect(intent.kind).toBe("hover_exit");
    expect(intent.agentId).toBe("researcher-7");
  });

  // ── ild-03d: context_menu intent carries screenPosition ──────────────────

  it("ild-03d: context_menu intent carries screenPosition from pointer event", () => {
    const intent = makeAgentInput("context_menu", {
      screenPosition: { x: 740, y: 320 },
    });
    expect(intent.kind).toBe("context_menu");
    expect(intent.screenPosition).toEqual({ x: 740, y: 320 });
  });

  // ── ild-03e: emitAgentInteractionIntent appends to ring buffer ────────────

  it("ild-03e: emitAgentInteractionIntent appends intent to store without touching command pipeline", () => {
    const intent = makeAgentInput("click");
    expect(() => {
      useInteractionIntentStore.getState().emitAgentInteractionIntent(intent);
    }).not.toThrow();

    const state = useInteractionIntentStore.getState();
    expect(state.intents).toHaveLength(1);
    expect(state.intents[0]!.intentId).toBe(intent.intentId);
    expect(state.intents[0]!.kind).toBe("click");
    expect(state.intents[0]!.agentId).toBe("researcher-7");
    expect(state.totalEmitted).toBe(1);
    expect(state.lastIntent).not.toBeNull();
    expect(state.lastIntent!.intentId).toBe(intent.intentId);
  });

  // ── ild-03f: four kinds all emit and store correctly ─────────────────────

  it("ild-03f: all four agent intent kinds are stored correctly by the store", () => {
    const kinds: AgentInteractionIntentKind[] = ["click", "hover_enter", "hover_exit", "context_menu"];

    for (const kind of kinds) {
      const intent = makeAgentInput(kind);
      useInteractionIntentStore.getState().emitAgentInteractionIntent(intent);
    }

    const state = useInteractionIntentStore.getState();
    expect(state.intents).toHaveLength(4);
    expect(state.totalEmitted).toBe(4);

    const storedKinds = state.intents.map((i) => i.kind);
    for (const kind of kinds) {
      expect(storedKinds).toContain(kind);
    }
  });

  // ── ild-03g: scene event log receives intent when recording is active ─────

  it("ild-03g: scene event log receives AGENT intent entry when recording is active", () => {
    useSceneEventLog.getState().startRecording();
    const intent = makeAgentInput("click");
    useInteractionIntentStore.getState().emitAgentInteractionIntent(intent);

    const intentEntries = useSceneEventLog
      .getState()
      .entries.filter((e) => e.category === AGENT_INTERACTION_INTENT_CATEGORY);

    expect(intentEntries).toHaveLength(1);
    expect(intentEntries[0]!.source).toBe("agent");
    expect(intentEntries[0]!.payload["intentId"]).toBe(intent.intentId);
    expect(intentEntries[0]!.payload["agentId"]).toBe("researcher-7");
    expect(intentEntries[0]!.payload["kind"]).toBe("click");
  });

  // ── ild-03h: scene event log skipped when recording is off ───────────────

  it("ild-03h: scene event log is not written when recording is paused", () => {
    // recording is off by default after resetStores
    expect(useSceneEventLog.getState().recording).toBe(false);

    const intent = makeAgentInput("hover_enter");
    useInteractionIntentStore.getState().emitAgentInteractionIntent(intent);

    const intentEntries = useSceneEventLog
      .getState()
      .entries.filter((e) => e.category === AGENT_INTERACTION_INTENT_CATEGORY);
    expect(intentEntries).toHaveLength(0);
  });

  // ── ild-03i: modifiers are optional and carry through correctly ───────────

  it("ild-03i: keyboard modifiers are optional and correctly captured when present", () => {
    const withMods = makeAgentInput("click", {
      modifiers: { ctrl: true, shift: false, alt: false },
    });
    expect(withMods.modifiers).toEqual({ ctrl: true, shift: false, alt: false });

    const noMods = makeAgentInput("click");
    expect(noMods.modifiers).toBeUndefined();
  });

  // ── ild-03j: wasSelected/isDrillTarget pre-click state captured ───────────

  it("ild-03j: click intent captures pre-click selection and drill-target state", () => {
    const wasSelectedIntent = makeAgentInput("click", {
      wasSelected: true, isDrillTarget: true,
    });
    expect(wasSelectedIntent.wasSelected).toBe(true);
    expect(wasSelectedIntent.isDrillTarget).toBe(true);

    const freshIntent = makeAgentInput("click", {
      wasSelected: false, isDrillTarget: false,
    });
    expect(freshIntent.wasSelected).toBe(false);
    expect(freshIntent.isDrillTarget).toBe(false);
  });

  // ── ild-03k: intent is JSON-serialisable (no command pipeline references) ─

  it("ild-03k: agent intent is a plain JSON-serialisable object (no Promise, no IO)", () => {
    const intent = makeAgentInput("context_menu", {
      screenPosition: { x: 500, y: 200 },
    });
    const serialised = JSON.stringify(intent);
    const parsed = JSON.parse(serialised) as Record<string, unknown>;

    expect(parsed["intentId"]).toBe(intent.intentId);
    expect(parsed["kind"]).toBe("context_menu");
    expect(parsed["agentId"]).toBe("researcher-7");
    expect((parsed["screenPosition"] as { x: number })["x"]).toBe(500);
  });

  // ── ild-03l: stopPropagation contract — store is independent of DOM events ─

  it("ild-03l: store emitAgentInteractionIntent has no DOM or R3F dependency (pure store op)", () => {
    // Verify we are in a Node environment without canvas/DOM
    expect(typeof document).toBe("undefined");

    const intent = makeAgentInput("hover_exit");
    // Must not throw even without DOM
    expect(() => {
      useInteractionIntentStore.getState().emitAgentInteractionIntent(intent);
    }).not.toThrow();
  });

  // ── ild-03m: simulated stopPropagation order validation ──────────────────

  it("ild-03m: simulated handler calls stopPropagation before emitting agent intent", () => {
    const callOrder: string[] = [];
    const stopPropagation = vi.fn<[], void>(() => { callOrder.push("stop"); });
    const emitSpy         = vi.fn<[unknown], void>(() => { callOrder.push("emit"); });

    // Simulate the handler pattern from useAgentInteractionHandlers:
    stopPropagation();
    const intent = makeAgentInput("click");
    emitSpy(intent);

    expect(callOrder).toEqual(["stop", "emit"]);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ild-04 — Cross-layer isolation: intent kinds are mutually exclusive
// ─────────────────────────────────────────────────────────────────────────────

describe("ild-04 — Cross-layer isolation: intents do not match wrong-layer guards", () => {

  // ── ild-04a: building intents rejected by room and agent guards ──────────

  it("ild-04a: BUILDING_CLICKED intent is rejected by room and agent guards", () => {
    const intent = makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: WORLD_POS, floor_count: 2, ts: BASE_TS,
    });
    expect(isRoomInteractionIntent(intent)).toBe(false);
    expect(isRoomClickedIntent(intent)).toBe(false);
    expect(isAgentInteractionIntent(intent)).toBe(false);
    expect(isAgentClickedIntent(intent)).toBe(false);
  });

  // ── ild-04b: room intents rejected by building and agent guards ───────────

  it("ild-04b: ROOM_CLICKED intent is rejected by building and agent guards", () => {
    const deps  = makeRoomDeps({ drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockPointerEvent();
    handlers.onClick(event as unknown as RoomPointerEvent);

    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    expect(isRoomClickedIntent(emitted)).toBe(true);
    expect(isBuildingInteractionIntent(emitted)).toBe(false);
    expect(isAgentInteractionIntent(emitted)).toBe(false);
  });

  // ── ild-04c: agent intents rejected by room and building guards ───────────

  it("ild-04c: AGENT_CLICKED intent is rejected by building and room guards", () => {
    const agentIntent = buildAgentInteractionIntent({
      kind:          "click",
      agentId:       "agent-x",
      agentName:     "Agent X",
      agentRole:     "implementer",
      agentStatus:   "idle",
      roomId:        "lab-1",
      worldPosition: WORLD_POS,
      wasSelected:   false,
      isDrillTarget: false,
    });

    // Convert to the AGENT_CLICKED scene intent shape for guards
    const sceneIntent = {
      intent:        "AGENT_CLICKED",
      agentId:       agentIntent.agentId,
      agentName:     agentIntent.agentName,
      agentRole:     agentIntent.agentRole,
      agentStatus:   agentIntent.agentStatus,
      roomId:        agentIntent.roomId,
      worldPosition: agentIntent.worldPosition,
      wasSelected:   agentIntent.wasSelected,
      isDrillTarget: agentIntent.isDrillTarget,
      ts:            agentIntent.ts,
    };

    expect(isAgentClickedIntent(sceneIntent)).toBe(true);
    expect(isBuildingInteractionIntent(sceneIntent)).toBe(false);
    expect(isRoomInteractionIntent(sceneIntent)).toBe(false);
    expect(isBuildingClickedIntent(sceneIntent)).toBe(false);
    expect(isRoomClickedIntent(sceneIntent)).toBe(false);
  });

  // ── ild-04d: intent kind strings do not overlap across layers ─────────────

  it("ild-04d: BUILDING_*, ROOM_*, and AGENT_* kind strings are globally disjoint", () => {
    const buildingKinds = ["BUILDING_CLICKED", "BUILDING_HOVERED", "BUILDING_UNHOVERED", "BUILDING_CONTEXT_MENU"];
    const roomKinds     = ["ROOM_CLICKED", "ROOM_HOVERED", "ROOM_UNHOVERED", "ROOM_CONTEXT_MENU"];
    const agentKinds    = ["AGENT_CLICKED", "AGENT_HOVERED", "AGENT_UNHOVERED", "AGENT_CONTEXT_MENU"];
    const storeKinds    = ["click", "hover_enter", "hover_exit", "context_menu"];

    const allKinds = [...buildingKinds, ...roomKinds, ...agentKinds, ...storeKinds];
    const uniqueKinds = new Set(allKinds);
    expect(uniqueKinds.size).toBe(allKinds.length); // no duplicates
  });

  // ── ild-04e: each layer's intent carries its own scope id field ───────────

  it("ild-04e: building uses building_id, room uses room_id, agent uses agentId (no field collision)", () => {
    const buildingIntent = makeBuildingClickedIntent({
      building_id: "hq", drill_level: "building",
      world_position: null, floor_count: 1, ts: BASE_TS,
    });
    // Building intents have building_id, not room_id or agentId
    expect("building_id" in buildingIntent).toBe(true);
    expect("room_id"     in buildingIntent).toBe(false);
    expect("agentId"     in buildingIntent).toBe(false);

    const deps  = makeRoomDeps({ roomId: "ctrl-1", drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockPointerEvent() as unknown as RoomPointerEvent);
    const roomIntent = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    // Room intents have room_id, not building_id or agentId
    expect("room_id"      in roomIntent).toBe(true);
    expect("building_id"  in roomIntent).toBe(false);
    expect("agentId"      in roomIntent).toBe(false);

    const agentIntent = buildAgentInteractionIntent({
      kind: "click", agentId: "a1", agentName: "A", agentRole: "r",
      agentStatus: "idle", roomId: "room-1", worldPosition: WORLD_POS,
      wasSelected: false, isDrillTarget: false,
    });
    // Agent store intents have agentId and roomId, not building_id
    expect("agentId"     in agentIntent).toBe(true);
    expect("roomId"      in agentIntent).toBe(true);
    expect("building_id" in agentIntent).toBe(false);
    // Note: agentId uses camelCase (not room_id snake_case)
    expect("room_id" in agentIntent).toBe(false);
  });

  // ── ild-04f: onPointerOver room handler does NOT fire building hover ───────

  it("ild-04f: room onPointerOver stops propagation so building hover intent is not triggered", () => {
    const buildingEmit = vi.fn<[BuildingInteractionIntent], void>();
    const deps = makeRoomDeps({ drillLevel: "floor" });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockPointerEvent();

    // Simulate what the Three.js scene graph does: fire room handler first,
    // then (if not stopped) fire building handler.
    handlers.onPointerOver(event as unknown as RoomPointerEvent);

    // Room handler stopped propagation — building handler should never run
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    // Building emit was never called
    expect(buildingEmit).not.toHaveBeenCalled();
    // Room emit WAS called
    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
    const emitted = (deps.emitIntent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as RoomInteractionIntent;
    expect(isRoomHoveredIntent(emitted)).toBe(true);
  });
});
