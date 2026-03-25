/**
 * interaction-intent-store.ts — Agent interaction intent recording.
 *
 * Sub-AC 4c: Typed interaction_intent emitter for the Agent layer.
 *
 * Records every click, hover_enter, hover_exit, and context_menu intent with
 * agent-scoped payloads. All intents are appended to the scene event log for
 * full record transparency and replay fidelity.
 *
 * Design notes
 * ────────────
 * Intent recording is separate from action execution: this store captures
 * *what the user intended*, not *what the system did*. The distinction matters
 * for replay — you can replay the intent sequence independently of whether
 * the resulting commands succeeded.
 *
 * Intent buffer
 * ─────────────
 * Intents are kept in a fixed-size ring buffer (INTENT_BUFFER_MAX). This
 * prevents unbounded memory growth during long sessions. The scene event log
 * (scene-event-log.ts) retains the full ordered sequence with its own
 * rolling-window eviction policy.
 *
 * stopPropagation contract
 * ────────────────────────
 * Handlers that call emitAgentInteractionIntent() MUST call
 * event.stopPropagation() *before* calling this action. The store does NOT
 * call stopPropagation itself — that is a rendering-layer concern. This keeps
 * the store pure (no DOM/R3F dependencies) and testable in isolation.
 *
 * Scene event log integration
 * ───────────────────────────
 * Each intent is forwarded to the scene event log via recordEntry() with
 * category "agent.interaction_intent". The scene event log must already be
 * in the recording state; if recording is paused, the intent is still stored
 * in the local buffer but omitted from the persistent log.
 *
 * Usage
 * ─────
 *   const { emitAgentInteractionIntent } = useInteractionIntentStore();
 *   emitAgentInteractionIntent({ kind: "click", agentId: "researcher-1", ... });
 */
import { create } from "zustand";
import { useSceneEventLog } from "./scene-event-log.js";

// ── Intent Kind ────────────────────────────────────────────────────────────

/**
 * The semantic kind of user interaction that was captured.
 *
 * - `click`        — primary pointer button (left-click / tap) on the avatar mesh
 * - `hover_enter`  — pointer entered the avatar bounding region (pointerover)
 * - `hover_exit`   — pointer left the avatar bounding region (pointerout)
 * - `context_menu` — secondary pointer button (right-click) or long-press
 *
 * These map directly to the R3F event props:
 *   onClick → "click"
 *   onPointerOver → "hover_enter"
 *   onPointerOut  → "hover_exit"
 *   onContextMenu → "context_menu"
 */
export type AgentInteractionIntentKind =
  | "click"
  | "hover_enter"
  | "hover_exit"
  | "context_menu";

// ── Typed Payload ──────────────────────────────────────────────────────────

/**
 * Fully-typed, agent-scoped payload for every interaction intent.
 *
 * Fields are purposefully read-only after creation — the record-transparency
 * constraint requires intents to be immutable once emitted.
 *
 * All positional data (worldPosition, screenPosition) is captured at the
 * moment of the interaction so that replay agents can reconstruct the exact
 * view state without querying live stores.
 */
export interface AgentInteractionIntentPayload {
  // ── Interaction identity ───────────────────────────────────────────
  /** Unique ID for this intent (for cross-referencing in logs) */
  readonly intentId: string;
  /** When this intent was captured (Unix ms, wall-clock) */
  readonly ts: number;
  /** ISO-8601 string representation of ts */
  readonly tsIso: string;
  /** The kind of interaction gesture */
  readonly kind: AgentInteractionIntentKind;

  // ── Agent scope ────────────────────────────────────────────────────
  /** The agent that was interacted with */
  readonly agentId: string;
  /** Agent's display name at the time of interaction */
  readonly agentName: string;
  /** Agent's role string at the time of interaction */
  readonly agentRole: string;
  /** Agent's operational status at the time of interaction */
  readonly agentStatus: string;
  /** Room the agent was occupying at the time of interaction */
  readonly roomId: string;

  // ── Spatial context ────────────────────────────────────────────────
  /** Agent's world-space position at interaction time (Y-up, right-handed) */
  readonly worldPosition: { readonly x: number; readonly y: number; readonly z: number };
  /**
   * Screen-space coordinates (pixels from top-left) of the pointer at the
   * time of the interaction.  Undefined for non-pointer events (keyboard).
   */
  readonly screenPosition?: { readonly x: number; readonly y: number };

  // ── Interaction context ────────────────────────────────────────────
  /** Keyboard modifier keys held at the time of interaction */
  readonly modifiers?: {
    readonly ctrl: boolean;
    readonly shift: boolean;
    readonly alt: boolean;
  };
  /**
   * Whether this agent was already the selected entity before this intent.
   * Allows replay to distinguish "select" vs "deselect" click semantics.
   */
  readonly wasSelected: boolean;
  /**
   * Whether this agent was the active drill target before this intent.
   * Relevant for distinguishing "re-click on drilled agent" from "first click".
   */
  readonly isDrillTarget: boolean;

  // ── Session linkage ────────────────────────────────────────────────
  /**
   * Current recording session ID (from scene-event-log.sessionId).
   * Ties this intent to the correct replay session.
   */
  readonly sessionId?: string;
}

// ── Scene event category extension ─────────────────────────────────────────

/**
 * Category tag used when forwarding agent interaction intents to the scene
 * event log.  This matches the SceneEventCategory union in scene-event-log.ts.
 * The value is declared here as a const string so the scene event log union
 * does not need to be imported; the scene log will record it as-is.
 */
export const AGENT_INTERACTION_INTENT_CATEGORY = "agent.interaction_intent" as const;

// ── Ring Buffer ────────────────────────────────────────────────────────────

/** Maximum number of intents kept in the in-memory ring buffer. */
export const INTENT_BUFFER_MAX = 200;

// ── Store Shape ────────────────────────────────────────────────────────────

export interface InteractionIntentStoreState {
  // ── Data ────────────────────────────────────────────────────────────
  /**
   * Append-only ring buffer of recent agent interaction intents.
   * Oldest entries are evicted once INTENT_BUFFER_MAX is reached.
   * Read-only from outside the store.
   */
  readonly intents: ReadonlyArray<AgentInteractionIntentPayload>;

  /**
   * Total number of intents emitted this session (monotonic, survives
   * ring-buffer eviction — reflects true cumulative count).
   */
  readonly totalEmitted: number;

  /**
   * The most recently emitted intent, or null if none yet.
   * Convenience selector — avoids intents[intents.length - 1] arithmetic.
   */
  readonly lastIntent: AgentInteractionIntentPayload | null;

  // ── Actions ──────────────────────────────────────────────────────────
  /**
   * Emit a new agent interaction intent.
   *
   * Appends to the local ring buffer AND forwards to the scene event log.
   * Callers MUST have already called event.stopPropagation() before invoking
   * this action (the store does not touch the DOM event).
   *
   * @param payload — Full agent-scoped intent payload
   */
  emitAgentInteractionIntent: (payload: AgentInteractionIntentPayload) => void;

  /**
   * Return all intents for a given agentId (most-recent first).
   * O(n) scan — suitable for inspector panels, not per-frame use.
   */
  getIntentsForAgent: (agentId: string) => AgentInteractionIntentPayload[];

  /**
   * Return all intents of a given kind (most-recent first).
   */
  getIntentsByKind: (kind: AgentInteractionIntentKind) => AgentInteractionIntentPayload[];

  /**
   * Return the most recent intent of each kind for a given agent.
   * Useful for the inspector panel — shows "last click: 2s ago" etc.
   */
  getLastIntentByKind: (
    agentId: string,
    kind: AgentInteractionIntentKind,
  ) => AgentInteractionIntentPayload | null;

  /** Clear all stored intents (e.g., on session reset). */
  clearIntents: () => void;
}

// ── ID Generation ──────────────────────────────────────────────────────────

let _intentCounter = 0;

function nextIntentId(): string {
  return `ii-${Date.now()}-${++_intentCounter}`;
}

// ── Ring Buffer Helper ─────────────────────────────────────────────────────

function appendWithRingEviction<T>(arr: ReadonlyArray<T>, item: T, maxSize: number): T[] {
  const next = [...arr, item];
  if (next.length > maxSize) {
    return next.slice(next.length - maxSize);
  }
  return next;
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useInteractionIntentStore = create<InteractionIntentStoreState>((set, get) => ({
  intents:      [],
  totalEmitted: 0,
  lastIntent:   null,

  // ── emitAgentInteractionIntent ──────────────────────────────────────
  emitAgentInteractionIntent: (payload: AgentInteractionIntentPayload) => {
    const { intents, totalEmitted } = get();

    // 1. Append to local ring buffer
    const nextIntents = appendWithRingEviction(intents, payload, INTENT_BUFFER_MAX);

    set({
      intents:      nextIntents,
      totalEmitted: totalEmitted + 1,
      lastIntent:   payload,
    });

    // 2. Forward to scene event log (write-only, fire-and-forget)
    //    Access via getState() to avoid React context coupling — this store
    //    must remain usable outside component trees (e.g., in tests).
    try {
      const sceneLog = useSceneEventLog.getState();
      if (sceneLog.recording) {
        sceneLog.recordEntry({
          ts:      payload.ts,
          category: AGENT_INTERACTION_INTENT_CATEGORY as Parameters<
            typeof sceneLog.recordEntry
          >[0]["category"],
          source:  "agent",
          payload: {
            intentId:      payload.intentId,
            kind:          payload.kind,
            agentId:       payload.agentId,
            agentName:     payload.agentName,
            agentRole:     payload.agentRole,
            agentStatus:   payload.agentStatus,
            roomId:        payload.roomId,
            worldPosition: payload.worldPosition,
            screenPosition: payload.screenPosition,
            modifiers:     payload.modifiers,
            wasSelected:   payload.wasSelected,
            isDrillTarget: payload.isDrillTarget,
          },
        });
      }
    } catch {
      // Scene event log is not available (e.g., test environment without store provider).
      // Emit silently — intent is still captured in local buffer.
    }
  },

  // ── getIntentsForAgent ──────────────────────────────────────────────
  getIntentsForAgent: (agentId: string) => {
    return [...get().intents]
      .filter((i) => i.agentId === agentId)
      .reverse(); // most-recent first
  },

  // ── getIntentsByKind ────────────────────────────────────────────────
  getIntentsByKind: (kind: AgentInteractionIntentKind) => {
    return [...get().intents]
      .filter((i) => i.kind === kind)
      .reverse(); // most-recent first
  },

  // ── getLastIntentByKind ─────────────────────────────────────────────
  getLastIntentByKind: (agentId: string, kind: AgentInteractionIntentKind) => {
    const all = get().intents;
    // Scan backwards: most-recent first
    for (let i = all.length - 1; i >= 0; i--) {
      const intent = all[i];
      if (intent && intent.agentId === agentId && intent.kind === kind) {
        return intent;
      }
    }
    return null;
  },

  // ── clearIntents ────────────────────────────────────────────────────
  clearIntents: () => {
    set({ intents: [], totalEmitted: 0, lastIntent: null });
  },
}));

// ── Builder helper ─────────────────────────────────────────────────────────

/**
 * Build an AgentInteractionIntentPayload from partial input.
 *
 * Fills in computed fields (intentId, ts, tsIso) automatically.
 * Exported for use by the use-agent-interaction-handlers hook and tests.
 */
export function buildAgentInteractionIntent(
  input: Omit<AgentInteractionIntentPayload, "intentId" | "ts" | "tsIso">,
): AgentInteractionIntentPayload {
  const ts = Date.now();
  return {
    intentId: nextIntentId(),
    ts,
    tsIso: new Date(ts).toISOString(),
    ...input,
  };
}
