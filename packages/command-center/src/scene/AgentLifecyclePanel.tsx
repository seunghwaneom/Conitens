/**
 * AgentLifecyclePanel — Diegetic 3D floating lifecycle control panel.
 *
 * AC 7a: 3D agent lifecycle controls
 *
 * Renders as a world-anchored HTML panel (via @react-three/drei Html) above a
 * selected/drilled agent in the 3D scene. Provides:
 *
 *   START   — activate an inactive or terminated agent (→ idle)
 *   STOP    — terminate an agent (destructive; requires inline confirmation)
 *   RESTART — reset an agent to idle, clearing current task
 *   PAUSE   — suspend an active/busy agent back to idle
 *
 * Design principles:
 *  - Diegetic: lives in 3D world space, not a screen overlay
 *  - Confirmation dialogs are rendered as part of the same floating panel
 *  - All actions are event-sourced through the agent store
 *  - Context-aware: buttons are only shown for valid state transitions
 *  - Dark command-center aesthetic matching the rest of the GUI
 *
 * The panel is only visible when the agent is the active drill target
 * (spatial-store drillAgent === agentId && drillLevel === "agent").
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Html } from "@react-three/drei";
import type { AgentRuntimeState } from "../store/agent-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useCommandFileWriter } from "../hooks/use-command-file-writer.js";

// ── Constants ──────────────────────────────────────────────────────────────────

/** World-space Y offset above the agent's feet */
const PANEL_Y = 1.55;

/** Shared monospace font stack */
const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace";

/** How long to show the post-action feedback message (ms) */
const FEEDBACK_DURATION_MS = 2200;

/**
 * Maps each lifecycle panel action to the orchestration command type it emits.
 * Exported for unit testing — ensures panel → command-dispatch contract is
 * verifiable without mounting the React component.
 *
 * start   → agent.spawn      (activates inactive / terminated agent)
 * stop    → agent.terminate  (destructive; clears task state)
 * restart → agent.restart    (reset to idle; keeps agent in registry)
 * pause   → agent.pause      (suspends active/busy agent; task preserved)
 * reassign→ agent.assign     (reassign to a different room)
 */
export const LIFECYCLE_ACTION_TO_COMMAND_TYPE = {
  start:    "agent.spawn",
  stop:     "agent.terminate",
  restart:  "agent.restart",
  pause:    "agent.pause",
  reassign: "agent.assign",
} as const;

export type LifecycleCommandType =
  (typeof LIFECYCLE_ACTION_TO_COMMAND_TYPE)[keyof typeof LIFECYCLE_ACTION_TO_COMMAND_TYPE];

// ── Lifecycle action types ─────────────────────────────────────────────────────

type LifecycleAction = "start" | "stop" | "restart" | "pause";

/** Actions that require an inline confirmation step before executing */
export const REQUIRES_CONFIRM = new Set<LifecycleAction>(["stop"]);

/** Display labels for each action */
const ACTION_LABELS: Record<LifecycleAction, string> = {
  start:   "START",
  stop:    "STOP",
  restart: "RESTART",
  pause:   "PAUSE",
};

/** Unicode icons for action buttons */
const ACTION_ICONS: Record<LifecycleAction, string> = {
  start:   "▶",
  stop:    "■",
  restart: "↺",
  pause:   "⏸",
};

/** Human-readable description shown in confirmation dialogs */
const ACTION_DESCRIPTIONS: Record<LifecycleAction, (name: string) => string> = {
  start:   (n) => `Activate ${n} — transition from inactive/terminated to idle.`,
  stop:    (n) => `Terminate ${n} immediately. Task state will be lost.`,
  restart: (n) => `Reset ${n} to idle. Current task will be cleared.`,
  pause:   (n) => `Suspend ${n} — pause active work without terminating.`,
};

// ── Reassign room helpers ──────────────────────────────────────────────────────

/** Room display record for the reassign picker. */
interface RoomPickerEntry {
  roomId: string;
  name:   string;
  type:   string;
}

/**
 * Returns rooms eligible for reassignment: all rooms except the agent's
 * current room.  Capped at MAX_REASSIGN_ROOMS entries to keep the panel compact.
 */
const MAX_REASSIGN_ROOMS = 6;

// ── Derive valid actions for a given status ────────────────────────────────────

/**
 * Returns the valid lifecycle actions for a given agent status.
 * Exported for unit testing — drives button visibility in AgentLifecyclePanel.
 *
 * Context-aware guard rules:
 *   inactive/terminated → can only START (activate)
 *   idle                → can STOP or RESTART (no PAUSE — not active)
 *   active/busy         → can PAUSE, RESTART, or STOP
 *   error               → can RESTART or STOP (not PAUSE — not running)
 */
export function getAvailableActions(status: string): LifecycleAction[] {
  switch (status) {
    case "inactive":
    case "terminated":
      return ["start"];
    case "idle":
      return ["stop", "restart"];
    case "active":
      return ["pause", "restart", "stop"];
    case "busy":
      return ["pause", "restart", "stop"];
    case "error":
      return ["restart", "stop"];
    default:
      return [];
  }
}

// ── Status colour helper ───────────────────────────────────────────────────────

function getStatusColor(status: string): string {
  switch (status) {
    case "inactive":   return "#555566";
    case "idle":       return "#8888aa";
    case "active":     return "#00ff88";
    case "busy":       return "#ffaa00";
    case "error":      return "#ff4444";
    case "terminated": return "#444455";
    default:           return "#8888aa";
  }
}

function getRiskColor(riskClass: string): string {
  switch (riskClass) {
    case "low":    return "#33aa66";
    case "medium": return "#cc8800";
    case "high":   return "#cc3333";
    default:       return "#888899";
  }
}

// ── Action button style helpers ────────────────────────────────────────────────

function getActionBtnStyle(action: LifecycleAction): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: "8px",
    letterSpacing: "0.07em",
    fontWeight: 700,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: "3px",
    border: "1px solid",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    gap: "3px",
    transition: "background 0.15s ease, border-color 0.15s ease",
  };

  switch (action) {
    case "start":
      return {
        ...base,
        color: "#00ee88",
        background: "rgba(0, 238, 136, 0.10)",
        borderColor: "rgba(0, 238, 136, 0.35)",
      };
    case "stop":
      return {
        ...base,
        color: "#ff5555",
        background: "rgba(255, 85, 85, 0.10)",
        borderColor: "rgba(255, 85, 85, 0.35)",
      };
    case "restart":
      return {
        ...base,
        color: "#66aaff",
        background: "rgba(102, 170, 255, 0.10)",
        borderColor: "rgba(102, 170, 255, 0.35)",
      };
    case "pause":
      return {
        ...base,
        color: "#ffcc44",
        background: "rgba(255, 204, 68, 0.10)",
        borderColor: "rgba(255, 204, 68, 0.35)",
      };
    default:
      return base;
  }
}

// ── Confirmation dialog state ──────────────────────────────────────────────────

interface ConfirmState {
  action: LifecycleAction;
}

// ── Main Panel Component ───────────────────────────────────────────────────────

export interface AgentLifecyclePanelProps {
  agent: AgentRuntimeState;
}

/**
 * AgentLifecyclePanel — floating 3D lifecycle control panel.
 *
 * Positioned in 3D world space above the agent avatar.
 * Shown when the agent is the active drill target (drillLevel === "agent").
 *
 * Manages:
 *  - Available actions based on current agent status
 *  - Inline confirmation dialog for the STOP action
 *  - Brief post-action feedback label
 *
 * All lifecycle mutations are dispatched through the agent store and
 * produce append-only audit events (agent.started / agent.stopped /
 * agent.restarted / agent.paused).
 */
export function AgentLifecyclePanel({ agent }: AgentLifecyclePanelProps) {
  // ── Store selectors ──────────────────────────────────────────────────────────
  const startAgent   = useAgentStore((s) => s.startAgent);
  const stopAgent    = useAgentStore((s) => s.stopAgent);
  const restartAgent = useAgentStore((s) => s.restartAgent);
  const pauseAgent   = useAgentStore((s) => s.pauseAgent);
  const moveAgent    = useAgentStore((s) => s.moveAgent);

  const drillLevel   = useSpatialStore((s) => s.drillLevel);
  const drillAgent   = useSpatialStore((s) => s.drillAgent);
  const drillAscend  = useSpatialStore((s) => s.drillAscend);
  const building     = useSpatialStore((s) => s.building);

  // ── Command dispatch pipeline ─────────────────────────────────────────────────
  // useCommandFileWriter is context-free (only uses useState/useRef/Zustand),
  // so it can be called inside the R3F Canvas tree without issue.
  const cmdWriter = useCommandFileWriter();

  // ── Local UI state ────────────────────────────────────────────────────────────
  const [confirm, setConfirm]           = useState<ConfirmState | null>(null);
  const [feedback, setFeedback]         = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showRoomPicker, setShowRoomPicker] = useState(false);

  // Timer ref to clear feedback message
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Panel is only visible when this agent is the drill target
  const isVisible = drillLevel === "agent" && drillAgent === agent.def.agentId;

  // Clear confirm and room picker on drill-level change
  useEffect(() => {
    if (!isVisible) {
      setConfirm(null);
      setShowRoomPicker(false);
    }
  }, [isVisible]);

  // Clear feedback timer on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  // ── Feedback helper ────────────────────────────────────────────────────────

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(
      () => setFeedback(null),
      FEEDBACK_DURATION_MS,
    );
  }, []);

  // ── Action dispatcher ─────────────────────────────────────────────────────
  // Lifecycle actions perform two operations:
  //   1. Optimistic store mutation (immediate, local — drives 3D animation)
  //   2. Command file dispatch (async, emits orchestration_command to pipeline)
  //
  // If dispatch fails, the feedback message reflects the error.  The store
  // update is NOT rolled back for lifecycle commands (the agent avatar already
  // shows the new state; the orchestrator will reconcile on next heartbeat).

  const executeAction = useCallback(
    async (action: LifecycleAction) => {
      const agentId = agent.def.agentId;

      // ① Optimistic store update — immediate 3D feedback
      switch (action) {
        case "start":   startAgent(agentId);   break;
        case "stop":    stopAgent(agentId);    break;
        case "restart": restartAgent(agentId); break;
        case "pause":   pauseAgent(agentId);   break;
      }

      setConfirm(null);
      setPendingAction(action);

      // ② Emit orchestration command through the command dispatch pipeline
      try {
        switch (action) {
          case "start":
            await cmdWriter.spawnAgent({
              agent_id:     agentId,
              persona:      agent.def.role,
              room_id:      agent.roomId,
              display_name: agent.def.name,
            });
            break;
          case "stop":
            await cmdWriter.terminateAgent({
              agent_id: agentId,
              reason:   "user_requested",
            });
            break;
          case "restart":
            await cmdWriter.restartAgent({
              agent_id:      agentId,
              clear_context: false,
            });
            break;
          case "pause":
            await cmdWriter.pauseAgent({ agent_id: agentId });
            break;
        }
        showFeedback(`✓ ${ACTION_LABELS[action]} DISPATCHED`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Dispatch error";
        showFeedback(`⚠ ${ACTION_LABELS[action]} ERROR: ${msg.slice(0, 28)}`);
      } finally {
        setPendingAction(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent.def.agentId, agent.def.role, agent.def.name, agent.roomId,
     startAgent, stopAgent, restartAgent, pauseAgent, cmdWriter, showFeedback],
  );

  // ── Room reassign dispatcher ───────────────────────────────────────────────
  // Reassign is separate from lifecycle actions — it always appears in the panel
  // footer and is not status-gated (any live agent can be reassigned).
  // Performs an optimistic moveAgent() then writes an agent.assign command.

  const handleRoomAssign = useCallback(
    async (targetRoomId: string) => {
      const agentId   = agent.def.agentId;
      const prevRoomId = agent.roomId;

      if (targetRoomId === prevRoomId) {
        setShowRoomPicker(false);
        return;
      }

      // ① Optimistic store update
      moveAgent(agentId, targetRoomId);
      setShowRoomPicker(false);
      setPendingAction("reassign");

      // ② Emit agent.assign orchestration command
      try {
        await cmdWriter.assignAgent({
          agent_id: agentId,
          room_id:  targetRoomId,
        });
        showFeedback(`✓ REASSIGNED → ${targetRoomId.toUpperCase()}`);
      } catch (err) {
        // Rollback on dispatch failure
        moveAgent(agentId, prevRoomId);
        const msg = err instanceof Error ? err.message : "Dispatch error";
        showFeedback(`⚠ REASSIGN FAILED: ${msg.slice(0, 25)}`);
      } finally {
        setPendingAction(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent.def.agentId, agent.roomId, moveAgent, cmdWriter, showFeedback],
  );

  const handleActionClick = useCallback(
    (action: LifecycleAction) => {
      if (REQUIRES_CONFIRM.has(action)) {
        // Enter confirmation flow — show inline confirm panel
        setConfirm({ action });
      } else {
        void executeAction(action);
      }
    },
    [executeAction],
  );

  // ── Room picker data ───────────────────────────────────────────────────────

  const availableRoomsForReassign: RoomPickerEntry[] = building.rooms
    .filter((r) => r.roomId !== agent.roomId)
    .slice(0, MAX_REASSIGN_ROOMS)
    .map((r) => ({ roomId: r.roomId, name: r.name, type: r.roomType }));

  if (!isVisible) return null;

  const availableActions = getAvailableActions(agent.status);
  const statusColor      = getStatusColor(agent.status);
  const riskColor        = getRiskColor(agent.def.riskClass);
  const accentColor      = agent.def.visual.color;

  return (
    <Html
      position={[0, PANEL_Y, 0]}
      center
      distanceFactor={9}
      zIndexRange={[200, 0]}
      style={{ pointerEvents: "none" }}
    >
      {/*
       * Outer wrapper: pointer-events none (set on Html above).
       * Inner container re-enables pointer events for button clicks.
       * stopPropagation prevents clicks from leaking into the 3D scene.
       */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          pointerEvents: "auto",
          minWidth: "210px",
          maxWidth: "240px",
          background: "rgba(6, 6, 16, 0.96)",
          border: `1px solid ${accentColor}44`,
          borderRadius: "6px",
          padding: "10px 12px",
          backdropFilter: "blur(10px)",
          boxShadow: `
            0 0 0 1px ${accentColor}18,
            0 0 28px ${accentColor}1a,
            0 8px 24px rgba(0,0,0,0.72)
          `,
          fontFamily: FONT,
          userSelect: "none",
        }}
      >
        {/* ── Breadcrumb / location tag ── */}
        <div
          style={{
            fontSize: "7px",
            color: "#333355",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            marginBottom: "8px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span>⬡ AGENT CONTROL PANEL</span>
          {/* Close / ascend button */}
          <button
            onClick={(e) => { e.stopPropagation(); drillAscend(); }}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid #333355",
              borderRadius: "3px",
              color: "#555566",
              fontSize: "8px",
              cursor: "pointer",
              padding: "1px 5px",
              fontFamily: FONT,
              lineHeight: 1,
            }}
            title="Close panel (ascend drill level)"
          >
            ✕
          </button>
        </div>

        {/* ── Agent identity header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            paddingBottom: "8px",
            marginBottom: "8px",
            borderBottom: `1px solid ${accentColor}22`,
          }}
        >
          <span style={{ fontSize: "18px", lineHeight: 1 }}>
            {agent.def.visual.icon}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: accentColor,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {agent.def.name}
            </div>
            <div
              style={{
                fontSize: "8px",
                color: "#5566aa",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                marginTop: "1px",
              }}
            >
              {agent.def.role}
              <span style={{ marginLeft: "6px", color: riskColor }}>
                [{agent.def.riskClass.toUpperCase()} RISK]
              </span>
            </div>
          </div>
        </div>

        {/* ── Status badge ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 7px",
            background: `${statusColor}0d`,
            borderRadius: "3px",
            border: `1px solid ${statusColor}22`,
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: statusColor,
              flexShrink: 0,
              boxShadow: `0 0 5px ${statusColor}`,
            }}
          />
          <span
            style={{
              fontSize: "9px",
              color: statusColor,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              flex: 1,
            }}
          >
            {agent.status}
          </span>
          {/* Show current task title if any */}
          {agent.currentTaskTitle && (
            <span
              style={{
                fontSize: "7px",
                color: "#666688",
                letterSpacing: "0.04em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100px",
              }}
              title={agent.currentTaskTitle}
            >
              {agent.currentTaskTitle}
            </span>
          )}
        </div>

        {/* ── Confirmation dialog (shown inline when STOP clicked) ── */}
        {confirm ? (
          <div
            style={{
              padding: "8px",
              background: "rgba(255, 60, 60, 0.08)",
              border: "1px solid rgba(255, 60, 60, 0.30)",
              borderRadius: "4px",
              marginBottom: "8px",
            }}
          >
            {/* Warning header */}
            <div
              style={{
                fontSize: "8px",
                color: "#ff5555",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "5px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span>⚠</span>
              <span>CONFIRM {ACTION_LABELS[confirm.action]}</span>
            </div>

            {/* Description */}
            <div
              style={{
                fontSize: "7px",
                color: "#aa8888",
                lineHeight: 1.6,
                marginBottom: "7px",
              }}
            >
              {ACTION_DESCRIPTIONS[confirm.action](agent.def.name)}
            </div>

            {/* Confirm / Cancel buttons */}
            <div style={{ display: "flex", gap: "5px" }}>
              <button
                onClick={(e) => { e.stopPropagation(); void executeAction(confirm.action); }}
                disabled={pendingAction !== null}
                style={{
                  fontFamily: FONT,
                  fontSize: "8px",
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  cursor: pendingAction !== null ? "default" : "pointer",
                  padding: "4px 10px",
                  borderRadius: "3px",
                  border: "1px solid rgba(255,85,85,0.60)",
                  background: "rgba(255,85,85,0.18)",
                  color: pendingAction !== null ? "#aa3333" : "#ff5555",
                  flex: 1,
                  opacity: pendingAction !== null ? 0.6 : 1,
                }}
              >
                {pendingAction === confirm.action
                  ? "⟳ DISPATCHING..."
                  : `■ CONFIRM ${ACTION_LABELS[confirm.action]}`}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirm(null); }}
                style={{
                  fontFamily: FONT,
                  fontSize: "8px",
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  cursor: "pointer",
                  padding: "4px 10px",
                  borderRadius: "3px",
                  border: "1px solid #333355",
                  background: "transparent",
                  color: "#666688",
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          /* ── Normal action buttons ── */
          availableActions.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                marginBottom: "6px",
              }}
            >
              {availableActions.map((action) => {
                const isThisPending = pendingAction === action;
                return (
                  <button
                    key={action}
                    onClick={(e) => { e.stopPropagation(); handleActionClick(action); }}
                    disabled={pendingAction !== null}
                    style={{
                      ...getActionBtnStyle(action),
                      opacity:        pendingAction !== null ? 0.55 : 1,
                      cursor:         pendingAction !== null ? "default" : "pointer",
                    }}
                    title={ACTION_DESCRIPTIONS[action](agent.def.name)}
                  >
                    <span>{isThisPending ? "⟳" : ACTION_ICONS[action]}</span>
                    <span>{isThisPending ? "WAIT…" : ACTION_LABELS[action]}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                fontSize: "7px",
                color: "#333355",
                letterSpacing: "0.07em",
                marginBottom: "6px",
              }}
            >
              No actions available for current status.
            </div>
          )
        )}

        {/* ── Room reassign section ── */}
        {!confirm && (
          <div
            style={{
              marginTop: "4px",
              marginBottom: "4px",
              borderTop: "1px solid #1a1a2e",
              paddingTop: "6px",
            }}
          >
            {!showRoomPicker ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRoomPicker(true);
                }}
                disabled={pendingAction !== null}
                style={{
                  fontFamily:    FONT,
                  fontSize:      "8px",
                  fontWeight:    700,
                  letterSpacing: "0.07em",
                  cursor:        pendingAction !== null ? "default" : "pointer",
                  padding:       "4px 8px",
                  borderRadius:  "3px",
                  border:        "1px solid rgba(150, 120, 255, 0.35)",
                  background:    "rgba(150, 120, 255, 0.08)",
                  color:         pendingAction === "reassign" ? "#aa88ff" : "#9966ff",
                  display:       "flex",
                  alignItems:    "center",
                  gap:           "4px",
                  width:         "100%",
                  opacity:       pendingAction !== null ? 0.55 : 1,
                }}
                title={`Reassign ${agent.def.name} to a different room`}
              >
                <span>{pendingAction === "reassign" ? "⟳" : "⬡"}</span>
                <span>{pendingAction === "reassign" ? "REASSIGNING..." : "REASSIGN ROOM"}</span>
              </button>
            ) : (
              /* ── Room picker dropdown ── */
              <div>
                <div
                  style={{
                    fontSize:      "7px",
                    color:         "#8877bb",
                    letterSpacing: "0.08em",
                    marginBottom:  "4px",
                    display:       "flex",
                    alignItems:    "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>SELECT TARGET ROOM</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowRoomPicker(false); }}
                    style={{
                      background:    "transparent",
                      border:        "none",
                      color:         "#555566",
                      fontSize:      "8px",
                      cursor:        "pointer",
                      padding:       "0 3px",
                      fontFamily:    FONT,
                    }}
                  >
                    ✕
                  </button>
                </div>
                {availableRoomsForReassign.length === 0 ? (
                  <div
                    style={{ fontSize: "7px", color: "#444455", textAlign: "center", padding: "4px 0" }}
                  >
                    No other rooms available.
                  </div>
                ) : (
                  availableRoomsForReassign.map((room) => (
                    <button
                      key={room.roomId}
                      onClick={(e) => { e.stopPropagation(); void handleRoomAssign(room.roomId); }}
                      style={{
                        fontFamily:    FONT,
                        fontSize:      "7px",
                        cursor:        "pointer",
                        padding:       "3px 7px",
                        borderRadius:  "3px",
                        border:        "1px solid #2a2a3e",
                        background:    "transparent",
                        color:         "#8899bb",
                        display:       "flex",
                        alignItems:    "center",
                        gap:           "5px",
                        width:         "100%",
                        marginBottom:  "3px",
                        textAlign:     "left",
                      }}
                      title={`Assign to ${room.name}`}
                    >
                      <span style={{ color: "#556688" }}>⬡</span>
                      <span
                        style={{
                          flex:         1,
                          overflow:     "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace:   "nowrap",
                        }}
                      >
                        {room.name}
                      </span>
                      <span style={{ color: "#334455", fontSize: "6px" }}>
                        {room.type.toUpperCase()}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Post-action feedback ── */}
        {feedback && (() => {
          const isError   = feedback.startsWith("⚠");
          const feedColor = isError ? "#cc4444" : "#00cc77";
          const feedBg    = isError
            ? "rgba(204, 68, 68, 0.08)"
            : "rgba(0, 204, 119, 0.08)";
          const feedBorder = isError
            ? "1px solid rgba(204, 68, 68, 0.28)"
            : "1px solid rgba(0, 204, 119, 0.22)";
          return (
            <div
              style={{
                fontSize:      "7px",
                color:         feedColor,
                letterSpacing: "0.08em",
                padding:       "3px 6px",
                background:    feedBg,
                border:        feedBorder,
                borderRadius:  "3px",
                textAlign:     "center",
              }}
            >
              {feedback}
            </div>
          );
        })()}

        {/* ── Footer: agent ID + dispatch note ── */}
        <div
          style={{
            marginTop:  "6px",
            paddingTop: "5px",
            borderTop:  "1px solid #1a1a2a",
            display:    "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize:      "6px",
              color:         "#2a2a3a",
              letterSpacing: "0.06em",
              fontFamily:    FONT,
            }}
          >
            ID: {agent.def.agentId}
          </span>
          <span
            style={{
              fontSize:      "6px",
              color:         "#2a2a3a",
              letterSpacing: "0.06em",
            }}
          >
            {cmdWriter.status === "writing" ? "⟳ DISPATCHING" : "EVENT-SOURCED ⬡"}
          </span>
        </div>
      </div>
    </Html>
  );
}
