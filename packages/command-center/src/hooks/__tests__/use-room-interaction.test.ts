/**
 * use-room-interaction.test.ts
 *
 * Sub-AC 4b — room-layer click, hover, and context-menu event handlers.
 *
 * Tests verify that `createRoomInteractionHandlers` (the pure factory
 * exported from `use-room-interaction.ts`) produces handlers that:
 *
 *   1.  Call `stopPropagation()` before any other action (propagation contract)
 *   2.  Emit the correct `RoomInteractionIntent` discriminator
 *   3.  Include room-scoped mandatory payload fields (room_id, room_type, floor)
 *   4.  Call the correct store callback (drillIntoRoom, highlightRoom, etc.)
 *   5.  Conditionally fire store actions based on drill level
 *   6.  Return plain JSON-serialisable intent objects (no command pipeline)
 *   7.  Handle null/missing pointer positions gracefully
 *   8.  Manage context menu state via setContextMenu callback
 *   9.  Suppress native context menu via preventDefault
 *   10. closeContextMenu resets context-menu state to null
 *   11. No DOM or Three.js runtime dependencies (runs in Node.js)
 *
 * The `createRoomInteractionHandlers` function takes all dependencies as
 * explicit arguments, making it runnable without a React renderer.
 * This satisfies the "plain testable objects" requirement of Sub-AC 4b.
 *
 * Test ID scheme:
 *   rih-N : room-interaction-handlers
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createRoomInteractionHandlers,
  type RoomHandlerDeps,
  type RoomContextMenuState,
  type RoomPointerEvent,
} from "../use-room-interaction.js";
import {
  isRoomClickedIntent,
  isRoomHoveredIntent,
  isRoomUnhoveredIntent,
  isRoomContextMenuIntent,
  isRoomInteractionIntent,
} from "../../scene/room-interaction-intents.js";

// ── Shared test fixtures ───────────────────────────────────────────────────────

const ROOM_ID    = "control-room-1";
const ROOM_TYPE  = "control" as const;
const FLOOR      = 0;
const AGENT_COUNT = 3;
const SESSION_ID = "test-session-rih";

const MOCK_POINT  = { x: 4.5, y: 0.1, z: 2.2 };
const MOCK_SCREEN = { clientX: 720, clientY: 480 };

/** Minimal mock for a Three.js pointer event. */
function makeMockEvent(
  overrides: Partial<{
    point:       { x: number; y: number; z: number };
    nativeEvent: { clientX: number; clientY: number; preventDefault?: () => void };
  }> = {},
): RoomPointerEvent & { stopPropagation: ReturnType<typeof vi.fn> } {
  return {
    stopPropagation: vi.fn(),
    point:           MOCK_POINT,
    nativeEvent:     { ...MOCK_SCREEN, preventDefault: vi.fn() },
    ...overrides,
  };
}

/** Create a set of mock deps for `createRoomInteractionHandlers`. */
function makeDeps(
  drillLevel: RoomHandlerDeps["drillLevel"] = "floor",
  overrides: Partial<RoomHandlerDeps> = {},
): RoomHandlerDeps & {
  emitIntent:      ReturnType<typeof vi.fn>;
  drillIntoRoom:   ReturnType<typeof vi.fn>;
  highlightRoom:   ReturnType<typeof vi.fn>;
  unhighlightRoom: ReturnType<typeof vi.fn>;
  setContextMenu:  ReturnType<typeof vi.fn>;
  setCursor:       ReturnType<typeof vi.fn>;
} {
  const emitIntent      = vi.fn();
  const drillIntoRoom   = vi.fn();
  const highlightRoom   = vi.fn();
  const unhighlightRoom = vi.fn();
  const setContextMenu  = vi.fn();
  const setCursor       = vi.fn();

  return {
    roomId:         ROOM_ID,
    roomType:       ROOM_TYPE,
    floor:          FLOOR,
    agentCount:     AGENT_COUNT,
    drillLevel,
    drillIntoRoom,
    highlightRoom,
    unhighlightRoom,
    emitIntent,
    setContextMenu,
    setCursor,
    sessionId:      SESSION_ID,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 — createRoomInteractionHandlers returns expected shape
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-01 — createRoomInteractionHandlers return shape", () => {
  it("rih-01a: returns handlers object and closeContextMenu function", () => {
    const deps = makeDeps();
    const result = createRoomInteractionHandlers(deps);

    expect(result).toHaveProperty("handlers");
    expect(result).toHaveProperty("closeContextMenu");
    expect(typeof result.closeContextMenu).toBe("function");
  });

  it("rih-01b: handlers object has all four handler functions", () => {
    const deps = makeDeps();
    const { handlers } = createRoomInteractionHandlers(deps);

    expect(typeof handlers.onPointerOver).toBe("function");
    expect(typeof handlers.onPointerOut).toBe("function");
    expect(typeof handlers.onClick).toBe("function");
    expect(typeof handlers.onContextMenu).toBe("function");
  });

  it("rih-01c: no Three.js or React dependencies needed to create handlers", () => {
    // Simply constructing the handlers must not throw in a Node.js environment
    expect(() => createRoomInteractionHandlers(makeDeps())).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 — onPointerOver (hover) handler
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-02 — onPointerOver (ROOM_HOVERED)", () => {
  it("rih-02a: calls stopPropagation BEFORE any store action (propagation first)", () => {
    const order: string[] = [];
    // Pass order-tracking mocks at creation time (factory closes over them)
    const deps = makeDeps("floor", {
      highlightRoom: vi.fn(() => { order.push("highlight"); }),
      emitIntent:    vi.fn(() => { order.push("emit"); }),
    });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockEvent();
    event.stopPropagation = vi.fn(() => { order.push("stop"); });

    handlers.onPointerOver(event);

    expect(order[0]).toBe("stop");
    expect(order[1]).toBe("highlight");
    expect(order[2]).toBe("emit");
  });

  it("rih-02b: emits ROOM_HOVERED intent", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockEvent();

    handlers.onPointerOver(event);

    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(isRoomHoveredIntent(intent)).toBe(true);
    expect(intent.intent).toBe("ROOM_HOVERED");
  });

  it("rih-02c: ROOM_HOVERED intent carries room-scoped fields", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOver(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.room_id).toBe(ROOM_ID);
    expect(intent.room_type).toBe(ROOM_TYPE);
    expect(intent.floor).toBe(FLOOR);
    expect(typeof intent.ts).toBe("number");
    expect(intent.ts).toBeGreaterThan(0);
  });

  it("rih-02d: ROOM_HOVERED intent carries world_position from event.point", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOver(makeMockEvent({ point: MOCK_POINT }));

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.world_position).toEqual(MOCK_POINT);
  });

  it("rih-02e: ROOM_HOVERED world_position is null when event has no point", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOver(makeMockEvent({ point: undefined }));

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.world_position).toBeNull();
  });

  it("rih-02f: calls highlightRoom with the room ID", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOver(makeMockEvent());

    expect(deps.highlightRoom).toHaveBeenCalledWith(ROOM_ID);
  });

  it("rih-02g: calls setCursor('pointer')", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOver(makeMockEvent());

    expect(deps.setCursor).toHaveBeenCalledWith("pointer");
  });

  it("rih-02h: no-op at building drill level (hover guard)", () => {
    // At "building" drill level, room hover should not fire
    const deps = makeDeps("building");
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockEvent();

    handlers.onPointerOver(event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1); // still called
    expect(deps.highlightRoom).not.toHaveBeenCalled();
    expect(deps.emitIntent).not.toHaveBeenCalled();
  });

  it("rih-02i: fires at room drill level", () => {
    const deps = makeDeps("room");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOver(makeMockEvent());

    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.intent).toBe("ROOM_HOVERED");
  });

  it("rih-02j: fires at agent drill level", () => {
    const deps = makeDeps("agent");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOver(makeMockEvent());

    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 — onPointerOut (unhover) handler
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-03 — onPointerOut (ROOM_UNHOVERED)", () => {
  it("rih-03a: calls stopPropagation first", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockEvent();
    handlers.onPointerOut(event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("rih-03b: emits ROOM_UNHOVERED intent", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOut(makeMockEvent());

    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(isRoomUnhoveredIntent(intent)).toBe(true);
    expect(intent.intent).toBe("ROOM_UNHOVERED");
  });

  it("rih-03c: ROOM_UNHOVERED carries room_id, room_type, floor, ts", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOut(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.room_id).toBe(ROOM_ID);
    expect(intent.room_type).toBe(ROOM_TYPE);
    expect(intent.floor).toBe(FLOOR);
    expect(typeof intent.ts).toBe("number");
  });

  it("rih-03d: ROOM_UNHOVERED has no world_position field (pointer already gone)", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOut(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect("world_position" in intent).toBe(false);
  });

  it("rih-03e: calls unhighlightRoom with the room ID", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOut(makeMockEvent());

    expect(deps.unhighlightRoom).toHaveBeenCalledWith(ROOM_ID);
  });

  it("rih-03f: calls setCursor('auto')", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOut(makeMockEvent());

    expect(deps.setCursor).toHaveBeenCalledWith("auto");
  });

  it("rih-03g: fires even at building drill level (no drill guard on unhover)", () => {
    // unhover must always fire to clean up cursor/highlight state
    const deps = makeDeps("building");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOut(makeMockEvent());

    expect(deps.unhighlightRoom).toHaveBeenCalledWith(ROOM_ID);
    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 — onClick handler
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-04 — onClick (ROOM_CLICKED)", () => {
  it("rih-04a: calls stopPropagation first", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockEvent();

    const order: string[] = [];
    event.stopPropagation = vi.fn(() => { order.push("stop"); });
    deps.emitIntent        = vi.fn(() => { order.push("emit"); });
    deps.drillIntoRoom     = vi.fn(() => { order.push("drill"); });

    handlers.onClick(event);

    expect(order[0]).toBe("stop");
  });

  it("rih-04b: emits ROOM_CLICKED intent", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());

    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(isRoomClickedIntent(intent)).toBe(true);
    expect(intent.intent).toBe("ROOM_CLICKED");
  });

  it("rih-04c: ROOM_CLICKED intent carries all mandatory fields", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.room_id).toBe(ROOM_ID);
    expect(intent.room_type).toBe(ROOM_TYPE);
    expect(intent.floor).toBe(FLOOR);
    expect(intent.drill_level).toBe("floor");
    expect(intent.agent_count).toBe(AGENT_COUNT);
    expect(intent.world_position).toEqual(MOCK_POINT);
    expect(typeof intent.ts).toBe("number");
  });

  it("rih-04d: ROOM_CLICKED intent records current drill level", () => {
    for (const level of ["building", "floor", "room", "agent"] as const) {
      const deps = makeDeps(level);
      const { handlers } = createRoomInteractionHandlers(deps);
      handlers.onClick(makeMockEvent());

      const intent = deps.emitIntent.mock.calls[0]![0];
      expect(intent.drill_level).toBe(level);
      vi.clearAllMocks();
    }
  });

  it("rih-04e: drillIntoRoom called at 'floor' drill level", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());

    expect(deps.drillIntoRoom).toHaveBeenCalledWith(ROOM_ID);
  });

  it("rih-04f: drillIntoRoom NOT called at 'building' drill level", () => {
    const deps = makeDeps("building");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());

    expect(deps.drillIntoRoom).not.toHaveBeenCalled();
  });

  it("rih-04g: drillIntoRoom NOT called at 'room' drill level (idempotent)", () => {
    const deps = makeDeps("room");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());

    expect(deps.drillIntoRoom).not.toHaveBeenCalled();
    // But intent is still emitted for record transparency
    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
  });

  it("rih-04h: drillIntoRoom NOT called at 'agent' drill level", () => {
    const deps = makeDeps("agent");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());

    expect(deps.drillIntoRoom).not.toHaveBeenCalled();
  });

  it("rih-04i: ROOM_CLICKED world_position is null when no point in event", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent({ point: undefined }));

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.world_position).toBeNull();
    expect(isRoomClickedIntent(intent)).toBe(true);
  });

  it("rih-04j: ROOM_CLICKED records correct agent_count", () => {
    const deps = makeDeps("floor", { agentCount: 0 });
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.agent_count).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 — onContextMenu handler
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-05 — onContextMenu (ROOM_CONTEXT_MENU)", () => {
  it("rih-05a: calls stopPropagation first", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockEvent();

    const order: string[] = [];
    event.stopPropagation = vi.fn(() => { order.push("stop"); });
    deps.emitIntent        = vi.fn(() => { order.push("emit"); });
    deps.setContextMenu    = vi.fn(() => { order.push("menu"); });

    handlers.onContextMenu(event);

    expect(order[0]).toBe("stop");
  });

  it("rih-05b: emits ROOM_CONTEXT_MENU intent", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onContextMenu(makeMockEvent());

    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(isRoomContextMenuIntent(intent)).toBe(true);
    expect(intent.intent).toBe("ROOM_CONTEXT_MENU");
  });

  it("rih-05c: ROOM_CONTEXT_MENU intent carries screen_position from nativeEvent", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onContextMenu(makeMockEvent({
      nativeEvent: { clientX: 800, clientY: 600, preventDefault: vi.fn() },
    }));

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.screen_position).toEqual({ x: 800, y: 600 });
  });

  it("rih-05d: ROOM_CONTEXT_MENU screen_position defaults to {0,0} when no nativeEvent", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onContextMenu({ stopPropagation: vi.fn() }); // no nativeEvent

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.screen_position).toEqual({ x: 0, y: 0 });
  });

  it("rih-05e: ROOM_CONTEXT_MENU intent carries drill_level", () => {
    const deps = makeDeps("room");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onContextMenu(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.drill_level).toBe("room");
  });

  it("rih-05f: calls setContextMenu with a RoomContextMenuState", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onContextMenu(makeMockEvent({
      nativeEvent: { clientX: 500, clientY: 300, preventDefault: vi.fn() },
    }));

    expect(deps.setContextMenu).toHaveBeenCalledTimes(1);
    const menuState: RoomContextMenuState = deps.setContextMenu.mock.calls[0]![0];
    expect(menuState.room_id).toBe(ROOM_ID);
    expect(menuState.room_type).toBe(ROOM_TYPE);
    expect(menuState.floor).toBe(FLOOR);
    expect(menuState.drill_level).toBe("floor");
    expect(menuState.screen).toEqual({ x: 500, y: 300 });
  });

  it("rih-05g: calls nativeEvent.preventDefault() to suppress browser context menu", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    const preventDefault = vi.fn();
    handlers.onContextMenu(makeMockEvent({
      nativeEvent: { clientX: 0, clientY: 0, preventDefault },
    }));

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("rih-05h: handles missing nativeEvent without throwing", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    expect(() => handlers.onContextMenu({ stopPropagation: vi.fn() })).not.toThrow();
  });

  it("rih-05i: ROOM_CONTEXT_MENU world_position is null when no event point", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onContextMenu(makeMockEvent({ point: undefined }));

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.world_position).toBeNull();
    expect(isRoomContextMenuIntent(intent)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 — closeContextMenu
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-06 — closeContextMenu", () => {
  it("rih-06a: calls setContextMenu(null)", () => {
    const deps = makeDeps("floor");
    const { closeContextMenu } = createRoomInteractionHandlers(deps);

    closeContextMenu();

    expect(deps.setContextMenu).toHaveBeenCalledWith(null);
  });

  it("rih-06b: is idempotent — can be called multiple times without error", () => {
    const deps = makeDeps("floor");
    const { closeContextMenu } = createRoomInteractionHandlers(deps);

    expect(() => {
      closeContextMenu();
      closeContextMenu();
      closeContextMenu();
    }).not.toThrow();

    expect(deps.setContextMenu).toHaveBeenCalledTimes(3);
    expect(deps.setContextMenu).toHaveBeenCalledWith(null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 — Propagation contract: stopPropagation always called first
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-07 — Propagation contract", () => {
  it("rih-07a: onPointerOver calls stopPropagation even when guard fires (building level)", () => {
    const deps = makeDeps("building");
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockEvent();
    handlers.onPointerOver(event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("rih-07b: onPointerOut always calls stopPropagation regardless of drill level", () => {
    for (const level of ["building", "floor", "room", "agent"] as const) {
      const deps = makeDeps(level);
      const { handlers } = createRoomInteractionHandlers(deps);
      const event = makeMockEvent();
      handlers.onPointerOut(event);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    }
  });

  it("rih-07c: onClick always calls stopPropagation", () => {
    for (const level of ["building", "floor", "room", "agent"] as const) {
      const deps = makeDeps(level);
      const { handlers } = createRoomInteractionHandlers(deps);
      const event = makeMockEvent();
      handlers.onClick(event);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    }
  });

  it("rih-07d: onContextMenu always calls stopPropagation", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockEvent();
    handlers.onContextMenu(event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("rih-07e: stopPropagation is called BEFORE emitIntent on onClick", () => {
    const callOrder: string[] = [];
    // Pass order-tracking emitIntent at creation time
    const deps = makeDeps("floor", {
      emitIntent: vi.fn(() => callOrder.push("emit")),
    });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockEvent();
    event.stopPropagation = vi.fn(() => callOrder.push("stop"));

    handlers.onClick(event);

    expect(callOrder.indexOf("stop")).toBeLessThan(callOrder.indexOf("emit"));
  });

  it("rih-07f: stopPropagation is called BEFORE emitIntent on onContextMenu", () => {
    const callOrder: string[] = [];
    // Pass order-tracking emitIntent at creation time
    const deps = makeDeps("floor", {
      emitIntent: vi.fn(() => callOrder.push("emit")),
    });
    const { handlers } = createRoomInteractionHandlers(deps);
    const event = makeMockEvent();
    event.stopPropagation = vi.fn(() => callOrder.push("stop"));

    handlers.onContextMenu(event);

    expect(callOrder.indexOf("stop")).toBeLessThan(callOrder.indexOf("emit"));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 — Record transparency: intents are plain JSON-serialisable objects
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-08 — Record transparency: JSON serialisability", () => {
  it("rih-08a: ROOM_CLICKED intent from handler is JSON round-trippable", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());

    const intent  = deps.emitIntent.mock.calls[0]![0];
    const json    = JSON.stringify(intent);
    const parsed  = JSON.parse(json) as unknown;
    expect(isRoomClickedIntent(parsed)).toBe(true);
  });

  it("rih-08b: ROOM_HOVERED intent from handler is JSON round-trippable", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOver(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    const parsed = JSON.parse(JSON.stringify(intent)) as unknown;
    expect(isRoomHoveredIntent(parsed)).toBe(true);
  });

  it("rih-08c: ROOM_UNHOVERED intent from handler is JSON round-trippable", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOut(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    const parsed = JSON.parse(JSON.stringify(intent)) as unknown;
    expect(isRoomUnhoveredIntent(parsed)).toBe(true);
  });

  it("rih-08d: ROOM_CONTEXT_MENU intent from handler is JSON round-trippable", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onContextMenu(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    const parsed = JSON.parse(JSON.stringify(intent)) as unknown;
    expect(isRoomContextMenuIntent(parsed)).toBe(true);
  });

  it("rih-08e: emitted intents contain no function references (plain data)", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);

    handlers.onClick(makeMockEvent());
    handlers.onPointerOver(makeMockEvent());
    handlers.onPointerOut(makeMockEvent());
    handlers.onContextMenu(makeMockEvent());

    for (const call of deps.emitIntent.mock.calls) {
      const intent = call[0];
      for (const value of Object.values(intent)) {
        expect(typeof value).not.toBe("function");
      }
    }
  });

  it("rih-08f: isRoomInteractionIntent validates all handler-produced intents", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);

    handlers.onClick(makeMockEvent());
    handlers.onPointerOver(makeMockEvent());
    handlers.onPointerOut(makeMockEvent());
    handlers.onContextMenu(makeMockEvent());

    for (const call of deps.emitIntent.mock.calls) {
      expect(isRoomInteractionIntent(call[0])).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9 — No command pipeline dependency
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-09 — No command pipeline dependency", () => {
  it("rih-09a: handlers run without requiring any command-file writer", () => {
    // This test has no import from command pipeline modules.
    // If the handler required a command-file writer, the import would fail.
    const deps = makeDeps("floor");
    const { handlers, closeContextMenu } = createRoomInteractionHandlers(deps);

    expect(() => {
      handlers.onPointerOver(makeMockEvent());
      handlers.onPointerOut(makeMockEvent());
      handlers.onClick(makeMockEvent());
      handlers.onContextMenu(makeMockEvent());
      closeContextMenu();
    }).not.toThrow();
  });

  it("rih-09b: emitIntent is the only sink — no implicit side-effects in handlers", () => {
    // Handlers should only affect: emitIntent, store callbacks, setCursor, setContextMenu
    // They must not write to any command file, network, or global singleton
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);

    handlers.onClick(makeMockEvent());

    // The only callbacks that should have been called are:
    expect(deps.emitIntent).toHaveBeenCalledTimes(1);
    expect(deps.drillIntoRoom).toHaveBeenCalledTimes(1); // at floor level
    expect(deps.highlightRoom).not.toHaveBeenCalled();   // not a hover
    expect(deps.unhighlightRoom).not.toHaveBeenCalled(); // not a pointer-out
    expect(deps.setContextMenu).not.toHaveBeenCalled();  // not a right-click
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10 — Room type variants
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-10 — Room type variants", () => {
  const roomTypes = ["control", "office", "lab", "lobby", "archive", "corridor"] as const;

  it("rih-10a: all room types produce valid ROOM_CLICKED intents", () => {
    for (const roomType of roomTypes) {
      const deps = makeDeps("floor", { roomType });
      const { handlers } = createRoomInteractionHandlers(deps);
      handlers.onClick(makeMockEvent());

      const intent = deps.emitIntent.mock.calls[0]![0];
      expect(intent.room_type).toBe(roomType);
      expect(isRoomClickedIntent(intent)).toBe(true);
      deps.emitIntent.mockReset();
    }
  });

  it("rih-10b: all room types produce valid ROOM_HOVERED intents", () => {
    for (const roomType of roomTypes) {
      const deps = makeDeps("floor", { roomType });
      const { handlers } = createRoomInteractionHandlers(deps);
      handlers.onPointerOver(makeMockEvent());

      const intent = deps.emitIntent.mock.calls[0]![0];
      expect(intent.room_type).toBe(roomType);
      expect(isRoomHoveredIntent(intent)).toBe(true);
      deps.emitIntent.mockReset();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11 — Session ID
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-11 — Session ID in intents", () => {
  it("rih-11a: injected sessionId appears in ROOM_CLICKED intent", () => {
    const deps = makeDeps("floor", { sessionId: "custom-session-abc" });
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.session_id).toBe("custom-session-abc");
  });

  it("rih-11b: injected sessionId appears in ROOM_HOVERED intent", () => {
    const deps = makeDeps("floor", { sessionId: "custom-session-hover" });
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onPointerOver(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.session_id).toBe("custom-session-hover");
  });

  it("rih-11c: injected sessionId appears in ROOM_CONTEXT_MENU intent", () => {
    const deps = makeDeps("floor", { sessionId: "ctx-session" });
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onContextMenu(makeMockEvent());

    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.session_id).toBe("ctx-session");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12 — Multi-floor support
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-12 — Multi-floor support", () => {
  it("rih-12a: floor index 0 is recorded in intent", () => {
    const deps = makeDeps("floor", { floor: 0 });
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());
    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.floor).toBe(0);
  });

  it("rih-12b: floor index 1 is recorded in intent", () => {
    const deps = makeDeps("floor", { floor: 1 });
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());
    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.floor).toBe(1);
  });

  it("rih-12c: floor index 3 is recorded in intent", () => {
    const deps = makeDeps("floor", { floor: 3 });
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onClick(makeMockEvent());
    const intent = deps.emitIntent.mock.calls[0]![0];
    expect(intent.floor).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13 — Context menu state alignment with intent
// ═════════════════════════════════════════════════════════════════════════════

describe("rih-13 — Context menu state aligns with ROOM_CONTEXT_MENU intent", () => {
  it("rih-13a: screen position in context menu state matches intent screen_position", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);

    handlers.onContextMenu(makeMockEvent({
      nativeEvent: { clientX: 333, clientY: 444, preventDefault: vi.fn() },
    }));

    const menuState: RoomContextMenuState = deps.setContextMenu.mock.calls[0]![0];
    const intent = deps.emitIntent.mock.calls[0]![0];

    expect(menuState.screen).toEqual(intent.screen_position);
  });

  it("rih-13b: world position in context menu state matches intent world_position", () => {
    const deps = makeDeps("floor");
    const { handlers } = createRoomInteractionHandlers(deps);
    const worldPt = { x: 9.1, y: 0.0, z: -3.4 };

    handlers.onContextMenu(makeMockEvent({ point: worldPt }));

    const menuState: RoomContextMenuState = deps.setContextMenu.mock.calls[0]![0];
    const intent = deps.emitIntent.mock.calls[0]![0];

    expect(menuState.world).toEqual(worldPt);
    expect(intent.world_position).toEqual(worldPt);
  });

  it("rih-13c: drill level in context menu state matches intent drill_level", () => {
    const deps = makeDeps("room");
    const { handlers } = createRoomInteractionHandlers(deps);
    handlers.onContextMenu(makeMockEvent());

    const menuState: RoomContextMenuState = deps.setContextMenu.mock.calls[0]![0];
    const intent = deps.emitIntent.mock.calls[0]![0];

    expect(menuState.drill_level).toBe(intent.drill_level);
    expect(menuState.drill_level).toBe("room");
  });
});
