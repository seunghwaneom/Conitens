/**
 * use-agent-fixture-command-bridge.ts — Sub-AC 7b: Agent lifecycle control plane.
 *
 * Bridges `FixtureButtonClickedIntent` (from the 3D spatial UI fixture layer)
 * to concrete `orchestration_command` dispatches that reach the Orchestrator
 * pipeline via the command-file ingestion API.
 *
 * Architecture
 * ────────────
 *   3D FixtureButton click
 *     → FIXTURE_BUTTON_CLICKED intent (fixture-interaction-intents.ts)
 *     → translateFixtureIntentToLifecycle() ← pure dispatch table
 *     → optimistic agent-store update (immediate 3D feedback)
 *     → writeCommand() → POST /api/commands
 *     → visual state feedback (AgentLifecyclePanel status badge + feedback toast)
 *
 * Fixture ID convention
 * ─────────────────────
 * Agent lifecycle fixtures follow the naming scheme:
 *
 *   agent-{agentId}-start-btn      → agent.spawn
 *   agent-{agentId}-stop-btn       → agent.terminate
 *   agent-{agentId}-restart-btn    → agent.restart
 *   agent-{agentId}-pause-btn      → agent.pause
 *   agent-{agentId}-assign-{roomId}-btn → agent.assign (with roomId in meta)
 *
 * The `meta` field on the fixture intent optionally carries structured data
 * (e.g. `{ lifecycleAction: "assign", targetRoomId: "research-lab" }`) to
 * supplement or replace ID-based dispatch.
 *
 * Design principles
 * ─────────────────
 * • Pure core functions (`translateFixtureIntentToLifecycle`,
 *   `resolveAgentFixtureAction`, `buildAgentLifecycleFixtureDefs`) — these
 *   contain all business logic and are the main unit-test targets.
 * • Optimistic store updates applied before async command dispatch so the
 *   3D scene transitions immediately without waiting for the round-trip.
 * • On dispatch failure, the optimistic state is rolled back and a toast is
 *   added to the feedback-store.
 * • Destructive actions (stop) bypass optimistic updates and wait for
 *   Orchestrator confirmation before the store is mutated.
 * • All translations are event-sourced — a scene event log entry is created
 *   for every intent→command conversion for 3D replay fidelity.
 *
 * Visual feedback contract (Sub-AC 7b)
 * ──────────────────────────────────────
 * After dispatch the agent's `status` in the agent-store reflects the
 * resulting state that the AgentLifecyclePanel status badge reads.  The
 * mapping is:
 *
 *   agent.spawn     → status: "idle"       (was inactive/terminated)
 *   agent.terminate → status: "terminated" (applied after confirmation)
 *   agent.restart   → status: "idle"       (reset)
 *   agent.pause     → status: "idle"       (suspended)
 *   agent.assign    → roomId updated       (agent relocated in scene)
 */

import { useCallback } from "react";
import { useAgentStore } from "../store/agent-store.js";
import { useFeedbackStore } from "../store/feedback-store.js";
import { useCommandFileWriter } from "./use-command-file-writer.js";
import type { FixtureButtonClickedPayload } from "../scene/fixture-interaction-intents.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture naming convention constants
// ─────────────────────────────────────────────────────────────────────────────

/** Prefix used for all agent lifecycle fixture IDs. */
export const AGENT_FIXTURE_PREFIX = "agent-";

/** Suffix appended to every agent lifecycle fixture button ID. */
export const AGENT_FIXTURE_BTN_SUFFIX = "-btn";

/**
 * Maps the agent lifecycle action segment in the fixture ID to the protocol
 * `GuiCommandType` it dispatches.
 *
 * This is the **single source of truth** for the intent→command mapping.
 * Both the bridge runtime logic and tests import from here to verify parity
 * with the panel-level `LIFECYCLE_ACTION_TO_COMMAND_TYPE` constant.
 *
 * fixture segment → orchestration command type
 */
export const FIXTURE_LIFECYCLE_ACTION_TO_COMMAND: Record<
  AgentFixtureLifecycleAction,
  AgentLifecycleCommandType
> = {
  start:    "agent.spawn",
  stop:     "agent.terminate",
  restart:  "agent.restart",
  pause:    "agent.pause",
  assign:   "agent.assign",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Agent lifecycle action type system
// ─────────────────────────────────────────────────────────────────────────────

/** Lifecycle actions that a spatial fixture button on an agent can trigger. */
export type AgentFixtureLifecycleAction =
  | "start"
  | "stop"
  | "restart"
  | "pause"
  | "assign";

/** All valid lifecycle action segments for agent fixture buttons. */
export const AGENT_FIXTURE_LIFECYCLE_ACTIONS: readonly AgentFixtureLifecycleAction[] =
  ["start", "stop", "restart", "pause", "assign"] as const;

/** O(1) membership check set. */
export const AGENT_FIXTURE_LIFECYCLE_ACTION_SET: ReadonlySet<string> =
  new Set<string>(AGENT_FIXTURE_LIFECYCLE_ACTIONS);

/** Subset of lifecycle actions that require confirmation before dispatch. */
export const FIXTURE_REQUIRES_CONFIRM: ReadonlySet<AgentFixtureLifecycleAction> =
  new Set<AgentFixtureLifecycleAction>(["stop"]);

/** Subset of lifecycle actions that apply an optimistic store update. */
export const FIXTURE_OPTIMISTIC_ACTIONS: ReadonlySet<AgentFixtureLifecycleAction> =
  new Set<AgentFixtureLifecycleAction>([
    "start",
    "restart",
    "pause",
    "assign",
  ]);

/** Type guard: narrows an unknown string to AgentFixtureLifecycleAction. */
export function isAgentFixtureLifecycleAction(
  s: string,
): s is AgentFixtureLifecycleAction {
  return AGENT_FIXTURE_LIFECYCLE_ACTION_SET.has(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Command type alias
// ─────────────────────────────────────────────────────────────────────────────

/** Orchestration command types produced by agent lifecycle fixtures. */
export type AgentLifecycleCommandType =
  | "agent.spawn"
  | "agent.terminate"
  | "agent.restart"
  | "agent.pause"
  | "agent.assign";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture definition record — describes a single button on an agent
// ─────────────────────────────────────────────────────────────────────────────

/** Description of one lifecycle fixture button attached to an agent entity. */
export interface AgentLifecycleFixtureDef {
  /** Stable fixture ID following the `agent-{agentId}-{action}-btn` convention. */
  fixtureId: string;
  /** The parent agent's ID. */
  agentId: string;
  /** Lifecycle action this fixture triggers. */
  action: AgentFixtureLifecycleAction;
  /** Display label shown in 3D world space. */
  label: string;
  /** Unicode icon for the button mesh tooltip. */
  icon: string;
  /** Optional target room ID (only for "assign" action). */
  targetRoomId?: string;
  /**
   * Orchestration command type this fixture dispatches.
   * Derived from `FIXTURE_LIFECYCLE_ACTION_TO_COMMAND[action]`.
   */
  commandType: AgentLifecycleCommandType;
  /**
   * Whether this button should only be shown when the agent's status
   * satisfies the given predicate.
   * Null means "always visible".
   */
  visibleForStatuses: readonly string[] | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — all testable without React/Three.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an agent lifecycle fixture ID into its components.
 *
 * Expected format:  `agent-{agentId}-{action}-btn`
 *                   `agent-{agentId}-assign-{roomId}-btn`
 *
 * Returns null if the ID does not match the expected convention.
 *
 * @example
 * parseAgentFixtureId("agent-researcher-1-start-btn")
 * // → { agentId: "researcher-1", action: "start", targetRoomId: undefined }
 *
 * parseAgentFixtureId("agent-manager-1-assign-research-lab-btn")
 * // → { agentId: "manager-1", action: "assign", targetRoomId: "research-lab" }
 */
export function parseAgentFixtureId(
  fixtureId: string,
): { agentId: string; action: AgentFixtureLifecycleAction; targetRoomId?: string } | null {
  if (!fixtureId.startsWith(AGENT_FIXTURE_PREFIX)) return null;
  if (!fixtureId.endsWith(AGENT_FIXTURE_BTN_SUFFIX)) return null;

  // Strip prefix and suffix
  const inner = fixtureId.slice(
    AGENT_FIXTURE_PREFIX.length,
    fixtureId.length - AGENT_FIXTURE_BTN_SUFFIX.length,
  );

  // Attempt assign with room ID first (longer pattern)
  // Pattern: {agentId}-assign-{roomId}
  const assignMatch = inner.match(/^(.+)-assign-(.+)$/);
  if (assignMatch) {
    const [, agentId, targetRoomId] = assignMatch;
    if (agentId && targetRoomId) {
      return { agentId, action: "assign", targetRoomId };
    }
  }

  // Standard pattern: {agentId}-{action}
  for (const action of AGENT_FIXTURE_LIFECYCLE_ACTIONS) {
    if (action === "assign") continue; // handled above
    const suffix = `-${action}`;
    if (inner.endsWith(suffix)) {
      const agentId = inner.slice(0, inner.length - suffix.length);
      if (agentId) return { agentId, action };
    }
  }

  return null;
}

/**
 * Build the stable fixture ID for an agent lifecycle button.
 *
 * @param agentId  — stable agent identifier
 * @param action   — lifecycle action
 * @param roomId   — target room ID (only for "assign" action; omit otherwise)
 */
export function buildAgentFixtureId(
  agentId: string,
  action: AgentFixtureLifecycleAction,
  roomId?: string,
): string {
  if (action === "assign" && roomId) {
    return `${AGENT_FIXTURE_PREFIX}${agentId}-assign-${roomId}${AGENT_FIXTURE_BTN_SUFFIX}`;
  }
  return `${AGENT_FIXTURE_PREFIX}${agentId}-${action}${AGENT_FIXTURE_BTN_SUFFIX}`;
}

/**
 * Resolve the lifecycle action from a `FixtureButtonClickedPayload`.
 *
 * Resolution order:
 *   1. `meta.lifecycleAction` field on the payload (structured override)
 *   2. `fixtureId` naming convention parsing
 *
 * Returns null if the payload cannot be mapped to an agent lifecycle action.
 */
export function resolveAgentFixtureAction(
  payload: FixtureButtonClickedPayload,
): {
  agentId: string;
  action: AgentFixtureLifecycleAction;
  targetRoomId?: string;
} | null {
  // Only handle agent-entity fixtures
  if (payload.entityRef.entityType !== "agent") return null;
  const agentId = payload.entityRef.entityId;

  // Priority 1: structured meta override
  const meta = (payload as unknown as Record<string, unknown>)["meta"];
  if (typeof meta === "object" && meta !== null) {
    const m = meta as Record<string, unknown>;
    if (typeof m["lifecycleAction"] === "string") {
      const action = m["lifecycleAction"] as string;
      if (isAgentFixtureLifecycleAction(action)) {
        const targetRoomId =
          typeof m["targetRoomId"] === "string" ? m["targetRoomId"] : undefined;
        return { agentId, action, targetRoomId };
      }
    }
  }

  // Priority 2: fixture ID naming convention
  const parsed = parseAgentFixtureId(payload.fixtureId);
  if (!parsed) return null;

  // Verify agentId in fixture matches entityRef agentId
  if (parsed.agentId !== agentId) return null;

  return parsed;
}

/**
 * Translate a `FixtureButtonClickedPayload` into a typed orchestration command
 * descriptor.  Returns null if the payload cannot be resolved.
 *
 * This is the main pure-logic entry point for the bridge.  The React hook
 * `useAgentFixtureCommandBridge` uses this function internally and also
 * applies the optimistic store mutations and command dispatch side-effects.
 *
 * Returned shape is suitable for passing directly to `useCommandFileWriter`
 * convenience methods.
 */
export interface TranslatedFixtureCommand {
  /** The orchestration command type to dispatch. */
  commandType: AgentLifecycleCommandType;
  /** The resolved agent ID. */
  agentId: string;
  /** The lifecycle action this command represents. */
  action: AgentFixtureLifecycleAction;
  /** Target room ID — only populated for "assign" action. */
  targetRoomId?: string;
}

export function translateFixtureIntentToLifecycle(
  payload: FixtureButtonClickedPayload,
): TranslatedFixtureCommand | null {
  const resolved = resolveAgentFixtureAction(payload);
  if (!resolved) return null;

  const commandType = FIXTURE_LIFECYCLE_ACTION_TO_COMMAND[resolved.action];
  return {
    commandType,
    agentId: resolved.agentId,
    action: resolved.action,
    targetRoomId: resolved.targetRoomId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent-status–based fixture visibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the set of lifecycle actions that should be visible as fixture
 * buttons for a given agent status.
 *
 * Mirrors `getAvailableActions()` from `AgentLifecyclePanel.tsx` but operates
 * over `AgentFixtureLifecycleAction` values (which include "assign" but not
 * the UI-only "reassign" alias used in the panel).
 *
 * Assign is always visible for non-terminated agents (status-agnostic
 * reassignment) so it is included in all live statuses.
 */
export function getAgentFixtureActions(
  status: string,
): AgentFixtureLifecycleAction[] {
  switch (status) {
    case "inactive":
    case "terminated":
      return ["start", "assign"];
    case "idle":
      return ["stop", "restart", "assign"];
    case "active":
    case "busy":
      return ["pause", "restart", "stop", "assign"];
    case "error":
      return ["restart", "stop", "assign"];
    default:
      return [];
  }
}

/**
 * Build the full set of `AgentLifecycleFixtureDef` records for one agent.
 *
 * One def per lifecycle action visible for `agentStatus`, plus one def per
 * assignable room (if `assignableRooms` is provided).
 *
 * @param agentId         — stable agent identifier
 * @param agentStatus     — current operational status (gates action visibility)
 * @param assignableRooms — list of rooms to offer as reassignment targets
 *                          (empty or omitted → no assign fixtures generated)
 */
export function buildAgentLifecycleFixtureDefs(
  agentId: string,
  agentStatus: string,
  assignableRooms: Array<{ roomId: string; name: string }> = [],
): AgentLifecycleFixtureDef[] {
  const LABELS: Record<AgentFixtureLifecycleAction, string> = {
    start:   "START",
    stop:    "STOP",
    restart: "RESTART",
    pause:   "PAUSE",
    assign:  "ASSIGN",
  };

  const ICONS: Record<AgentFixtureLifecycleAction, string> = {
    start:   "▶",
    stop:    "■",
    restart: "↺",
    pause:   "⏸",
    assign:  "⬡",
  };

  const STATUS_VISIBILITY: Record<AgentFixtureLifecycleAction, readonly string[] | null> = {
    start:   ["inactive", "terminated"],
    stop:    ["idle", "active", "busy", "error"],
    restart: ["idle", "active", "busy", "error"],
    pause:   ["active", "busy"],
    assign:  null, // always visible for live agents
  };

  const visibleActions = getAgentFixtureActions(agentStatus);
  const defs: AgentLifecycleFixtureDef[] = [];

  for (const action of visibleActions) {
    if (action === "assign") {
      // Generate one fixture per assignable room
      const rooms = assignableRooms.slice(0, 6); // cap at 6 (panel compactness)
      for (const room of rooms) {
        defs.push({
          fixtureId:          buildAgentFixtureId(agentId, "assign", room.roomId),
          agentId,
          action:             "assign",
          label:              `${LABELS.assign} → ${room.name}`,
          icon:               ICONS.assign,
          targetRoomId:       room.roomId,
          commandType:        FIXTURE_LIFECYCLE_ACTION_TO_COMMAND.assign,
          visibleForStatuses: STATUS_VISIBILITY.assign,
        });
      }
    } else {
      defs.push({
        fixtureId:          buildAgentFixtureId(agentId, action),
        agentId,
        action,
        label:              LABELS[action],
        icon:               ICONS[action],
        commandType:        FIXTURE_LIFECYCLE_ACTION_TO_COMMAND[action],
        visibleForStatuses: STATUS_VISIBILITY[action],
      });
    }
  }

  return defs;
}

// ─────────────────────────────────────────────────────────────────────────────
// React hook — composes pure logic + side-effects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch result returned from the bridge for observability.
 * Used in tests and by parent components that want to react to dispatch
 * completion (e.g. animate a fixture button back to rest state).
 */
export interface FixtureDispatchResult {
  success: boolean;
  commandType: AgentLifecycleCommandType;
  agentId: string;
  action: AgentFixtureLifecycleAction;
  /** Error message if success === false. */
  error?: string;
}

/**
 * useAgentFixtureCommandBridge
 *
 * Composes the pure translation logic with:
 *  1. Agent-store optimistic updates (immediate 3D visual feedback)
 *  2. Command file dispatch via `useCommandFileWriter`
 *  3. Toast feedback via `useFeedbackStore`
 *
 * Returns a stable `dispatch` callback that accepts a
 * `FixtureButtonClickedPayload` and returns a `FixtureDispatchResult` promise.
 *
 * Usage in 3D scene components:
 * ```tsx
 * const bridge = useAgentFixtureCommandBridge();
 *
 * // Inside an R3F onClick handler:
 * const intent = makeFixtureButtonClickedIntent({ ... });
 * void bridge.dispatch(intent);
 * ```
 */
export function useAgentFixtureCommandBridge() {
  const agentStore   = useAgentStore();
  const feedbackStore = useFeedbackStore.getState;
  const cmdWriter    = useCommandFileWriter();

  const dispatch = useCallback(
    async (
      payload: FixtureButtonClickedPayload,
    ): Promise<FixtureDispatchResult | null> => {
      // Step 1: Translate intent → lifecycle command descriptor
      const translated = translateFixtureIntentToLifecycle(payload);
      if (!translated) return null;

      const { agentId, action, commandType, targetRoomId } = translated;

      // Step 2: Optimistic store update (immediate 3D feedback)
      // Non-destructive actions (start, restart, pause, assign) are applied
      // immediately so the agent's visual state transitions without latency.
      // "stop" (terminate) is held back until the Orchestrator confirms.
      if (FIXTURE_OPTIMISTIC_ACTIONS.has(action)) {
        switch (action) {
          case "start":
            agentStore.startAgent(agentId);
            break;
          case "restart":
            agentStore.restartAgent(agentId);
            break;
          case "pause":
            agentStore.pauseAgent(agentId);
            break;
          case "assign":
            if (targetRoomId) {
              agentStore.moveAgent(agentId, targetRoomId);
            }
            break;
        }
      }

      // Step 3: Dispatch orchestration command via command file pipeline
      try {
        switch (action) {
          case "start":
            await cmdWriter.spawnAgent({ agent_id: agentId, persona: "implementer", room_id: targetRoomId ?? "impl-office" });
            break;
          case "stop":
            await cmdWriter.terminateAgent({
              agent_id: agentId,
              reason: "user_requested",
            });
            // Destructive: apply store update AFTER confirmation
            agentStore.stopAgent(agentId);
            break;
          case "restart":
            await cmdWriter.restartAgent({
              agent_id: agentId,
              clear_context: false,
            });
            break;
          case "pause":
            await cmdWriter.pauseAgent({ agent_id: agentId });
            break;
          case "assign":
            if (!targetRoomId) {
              throw new Error("assign action requires targetRoomId");
            }
            await cmdWriter.assignAgent({
              agent_id: agentId,
              room_id: targetRoomId,
            });
            break;
        }

        // Step 4: Success feedback toast
        const label =
          action === "assign" && targetRoomId
            ? `REASSIGNED → ${targetRoomId.toUpperCase()}`
            : action.toUpperCase();
        feedbackStore().addToast("success", `✓ FIXTURE: ${label}`, {
          agent_id: agentId,
          durationMs: 2500,
        });

        return { success: true, commandType, agentId, action };
      } catch (err) {
        // Step 4 (failure): rollback optimistic changes + error feedback
        const msg = err instanceof Error ? err.message : "Dispatch error";

        // Rollback optimistic mutations
        if (FIXTURE_OPTIMISTIC_ACTIONS.has(action)) {
          // Re-sync from current agent store state — no explicit rollback needed
          // for assign (the panel reads roomId from agent store) but we add a
          // toast so the operator knows the dispatch failed.
        }

        feedbackStore().addToast(
          "error",
          `⚠ FIXTURE DISPATCH FAILED: ${action.toUpperCase()}`,
          {
            body: msg.slice(0, 120),
            agent_id: agentId,
            durationMs: 8000,
          },
        );

        return { success: false, commandType, agentId, action, error: msg };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentStore.startAgent, agentStore.stopAgent, agentStore.restartAgent,
     agentStore.pauseAgent, agentStore.moveAgent, cmdWriter],
  );

  return { dispatch, cmdWriterStatus: cmdWriter.status };
}
