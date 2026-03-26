/**
 * NavigationBreadcrumb.tsx — Sub-AC 3.3
 *
 * Breadcrumb / navigation HUD overlay that reflects the current drill-down
 * depth (Building → Floor → Room → Agent) and supports click-to-navigate-up
 * to any ancestor level.
 *
 * Design principles:
 * ─────────────────
 *  - Shows a linear path of ancestors from Building (root) to the current
 *    drill level — e.g. "⬡ HQ  ›  ▤ F1 Ops  ›  ◈ impl-office"
 *  - Each ancestor segment is a clickable button; clicking it navigates
 *    directly to that level using the event-sourced spatial store actions.
 *  - The leaf (current level) is rendered in the accent colour but disabled.
 *  - A ◁ BACK button ascends one level (drillAscend).
 *  - A ⬡ HOME button resets all the way to the building overview (drillReset).
 *  - ESC key ascends one level — keyboard hint shown inline.
 *  - Hidden when drillLevel is "building" (BuildingEntryHint fills that slot).
 *  - Record-transparent: every navigation action produces an append-only
 *    spatial event in the store.
 *
 * Exported API:
 * ─────────────
 *  NavigationBreadcrumb  — the React component (default & named export)
 *  deriveNavigationSegments  — pure function; derive breadcrumb path from
 *                             raw navigation state (testable without DOM)
 *
 * @module components/NavigationBreadcrumb
 */

import { useEffect, useRef } from "react";
import { useSpatialStore, type DrillLevel } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { ROLE_VISUALS } from "../scene/RoomTypeVisuals.js";

// ── Segment shape ─────────────────────────────────────────────────────────────

/**
 * One item in the breadcrumb path.
 * `isLeaf` means "current location — not clickable".
 * `navigateTo` is the action identifier (used by the component to call the
 * appropriate store action; absent on leaf).
 */
export interface BreadcrumbSegment {
  /** Unique key for React reconciliation */
  key: string;
  /** Display text */
  label: string;
  /** Unicode icon glyph */
  icon: string;
  /** Accent / text colour */
  color: string;
  /** True only for the current (deepest) segment */
  isLeaf: boolean;
  /** Navigation action to fire when clicked (absent on leaf) */
  action:
    | { type: "reset" }
    | { type: "floor"; floorIndex: number }
    | { type: "room"; roomId: string }
    | null;
}

// ── Level metadata (icon + colour per depth) ─────────────────────────────────

const LEVEL_META: Record<DrillLevel, { icon: string; color: string }> = {
  building: { icon: "⬡", color: "#4a6aff" },
  floor:    { icon: "▤", color: "#6a9aff" },
  room:     { icon: "□", color: "#8ab8ff" },
  agent:    { icon: "◆", color: "#00ffaa" },
};

// ── deriveNavigationSegments ──────────────────────────────────────────────────

/**
 * Pure function — derives the ordered breadcrumb segment list from the
 * raw spatial-store navigation state.
 *
 * Inputs correspond 1:1 to sub-slices of `SpatialStoreState`.
 *
 * @param drillLevel  current hierarchy depth
 * @param drillFloor  active floor index (null above floor level)
 * @param drillRoom   active room ID (null above room level)
 * @param drillAgent  active agent ID (null above agent level)
 * @param buildingName  display name from the building definition
 * @param floorName   floor display name (resolved by caller)
 * @param roomName    room display name (resolved by caller)
 * @param roomColor   room accent colour (resolved by caller)
 * @param roomIcon    room type icon glyph (resolved by caller)
 * @param agentName   agent display name (resolved by caller)
 * @param agentColor  agent accent colour (resolved by caller)
 * @param agentIcon   agent icon glyph (resolved by caller)
 */
export function deriveNavigationSegments(params: {
  drillLevel: DrillLevel;
  drillFloor: number | null;
  drillRoom: string | null;
  drillAgent: string | null;
  buildingName: string;
  floorName: string | null;
  roomName: string | null;
  roomColor: string;
  roomIcon: string;
  agentName: string | null;
  agentColor: string;
  agentIcon: string;
}): BreadcrumbSegment[] {
  const {
    drillLevel,
    drillFloor,
    drillRoom,
    drillAgent,
    buildingName,
    floorName,
    roomName,
    roomColor,
    roomIcon,
    agentName,
    agentColor,
    agentIcon,
  } = params;

  const segments: BreadcrumbSegment[] = [];

  // ── Building (root) — always present ──────────────────────────────────────
  segments.push({
    key: "building",
    label: buildingName || "HQ",
    icon: LEVEL_META.building.icon,
    color: LEVEL_META.building.color,
    isLeaf: drillLevel === "building",
    action: drillLevel === "building" ? null : { type: "reset" },
  });

  // ── Floor segment ─────────────────────────────────────────────────────────
  if (drillFloor !== null && drillLevel !== "building") {
    const label = floorName ?? `FLOOR ${drillFloor}`;
    segments.push({
      key: `floor-${drillFloor}`,
      label,
      icon: LEVEL_META.floor.icon,
      color: LEVEL_META.floor.color,
      isLeaf: drillLevel === "floor",
      action:
        drillLevel === "floor"
          ? null
          : { type: "floor", floorIndex: drillFloor },
    });
  }

  // ── Room segment ──────────────────────────────────────────────────────────
  if (
    drillRoom !== null &&
    (drillLevel === "room" || drillLevel === "agent")
  ) {
    const label = roomName ?? drillRoom;
    const icon = roomIcon || LEVEL_META.room.icon;
    const color = roomColor || LEVEL_META.room.color;
    segments.push({
      key: `room-${drillRoom}`,
      label,
      icon,
      color,
      isLeaf: drillLevel === "room",
      action:
        drillLevel === "room"
          ? null
          : { type: "room", roomId: drillRoom },
    });
  }

  // ── Agent segment (leaf when drilled into agent) ──────────────────────────
  if (drillAgent !== null && drillLevel === "agent") {
    const label = agentName ?? drillAgent;
    segments.push({
      key: `agent-${drillAgent}`,
      label,
      icon: agentIcon || LEVEL_META.agent.icon,
      color: agentColor || LEVEL_META.agent.color,
      isLeaf: true,
      action: null, // leaf — no further navigation
    });
  }

  return segments;
}

// ── NavigationBreadcrumb component ───────────────────────────────────────────

/**
 * Breadcrumb HUD overlay — Sub-AC 3.3.
 *
 * Renders a top-centre pill showing the current navigation path through the
 * spatial hierarchy.  Each non-leaf segment is a button that fires the
 * appropriate store action to navigate directly to that level (no chained
 * ascends).  A ◁ BACK button steps up one level; a HOME button resets.
 *
 * Hidden at the building level (BuildingEntryHint occupies that slot).
 */
export function NavigationBreadcrumb() {
  // ── Store subscriptions ────────────────────────────────────────────────
  const drillLevel    = useSpatialStore((s) => s.drillLevel);
  const drillFloor    = useSpatialStore((s) => s.drillFloor);
  const drillRoom     = useSpatialStore((s) => s.drillRoom);
  const drillAgent    = useSpatialStore((s) => s.drillAgent);
  const building      = useSpatialStore((s) => s.building);
  const drillAscend   = useSpatialStore((s) => s.drillAscend);
  const drillReset    = useSpatialStore((s) => s.drillReset);
  const drillIntoFloor = useSpatialStore((s) => s.drillIntoFloor);
  const drillIntoRoom  = useSpatialStore((s) => s.drillIntoRoom);

  const agents = useAgentStore((s) => s.agents);

  // ── ESC key → ascend ──────────────────────────────────────────────────
  const ascendRef = useRef(drillAscend);
  ascendRef.current = drillAscend;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") ascendRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []); // intentionally empty — ref keeps current value

  // ── Resolve display names from store ──────────────────────────────────
  const floorDef  = drillFloor !== null
    ? building.floors.find((f) => f.floor === drillFloor)
    : null;
  const roomDef   = drillRoom !== null
    ? building.rooms.find((r) => r.roomId === drillRoom)
    : null;
  const agentState = drillAgent !== null ? agents[drillAgent] : null;

  const roomIcon = roomDef
    ? (ROLE_VISUALS[roomDef.roomType as keyof typeof ROLE_VISUALS]?.icon ?? "□")
    : "□";

  // ── Derive breadcrumb segments (pure function — testable) ──────────────
  const segments = deriveNavigationSegments({
    drillLevel,
    drillFloor,
    drillRoom,
    drillAgent,
    buildingName: building.name ?? "HQ",
    floorName: floorDef ? `F${floorDef.floor} ${floorDef.name}` : null,
    roomName: roomDef?.name ?? null,
    roomColor: roomDef?.colorAccent ?? LEVEL_META.room.color,
    roomIcon,
    agentName: agentState?.def.visual.label ?? null,
    agentColor: agentState?.def.visual.color ?? LEVEL_META.agent.color,
    agentIcon: agentState?.def.visual.icon ?? LEVEL_META.agent.icon,
  });

  // ── Visibility guard — only render below building level ────────────────
  if (drillLevel === "building") return null;

  // ── Click handler for breadcrumb segments ─────────────────────────────
  function handleSegmentClick(seg: BreadcrumbSegment) {
    if (!seg.action) return; // leaf — no-op
    if (seg.action.type === "reset") {
      drillReset();
    } else if (seg.action.type === "floor") {
      // Direct jump to floor level — works from any deeper level because
      // drillIntoFloor always sets drillLevel="floor" and clears room/agent.
      drillIntoFloor(seg.action.floorIndex);
    } else if (seg.action.type === "room") {
      // Direct jump to room level — works from agent level; drillIntoRoom
      // sets drillLevel="room", selects & focuses the room.
      drillIntoRoom(seg.action.roomId);
    }
  }

  // ── Depth badge label ─────────────────────────────────────────────────
  const depthLabel = drillLevel.toUpperCase();
  const depthColor = LEVEL_META[drillLevel]?.color ?? "#4a6aff";

  return (
    <div
      data-testid="navigation-breadcrumb"
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 0,
        background: "rgba(5, 8, 20, 0.90)",
        border: "1px solid #2a2a4a",
        borderRadius: 5,
        padding: "5px 10px",
        backdropFilter: "blur(10px)",
        pointerEvents: "auto",
        userSelect: "none",
        zIndex: 20,
        boxShadow: "0 2px 14px rgba(0,0,0,0.55)",
        maxWidth: "80vw",
        overflow: "hidden",
      }}
    >
      {/* ── HOME button — drillReset (always goes to building) ── */}
      <button
        onClick={drillReset}
        title="Return to building overview (Home)"
        aria-label="Navigate to building overview"
        style={homeButtonStyle}
      >
        ⬡
      </button>

      {/* ── Divider after home ── */}
      <span style={dividerStyle}>|</span>

      {/* ── BACK button — drillAscend (one level up) ── */}
      <button
        onClick={drillAscend}
        title="Go back one level (ESC)"
        aria-label="Go back one level"
        style={backButtonStyle}
      >
        ◁ BACK
      </button>

      {/* ── Divider ── */}
      <span style={dividerStyle}>|</span>

      {/* ── Breadcrumb segments ── */}
      {segments.map((seg, idx) => (
        <span
          key={seg.key}
          style={{ display: "flex", alignItems: "center" }}
        >
          {/* Separator between segments — not before the first */}
          {idx > 0 && (
            <span style={separatorStyle}>›</span>
          )}

          {/* Segment button */}
          <button
            onClick={() => handleSegmentClick(seg)}
            disabled={seg.isLeaf}
            title={
              seg.isLeaf
                ? `Current location: ${seg.label}`
                : `Navigate to ${seg.label}`
            }
            aria-label={
              seg.isLeaf
                ? `Current: ${seg.label}`
                : `Go to ${seg.label}`
            }
            aria-current={seg.isLeaf ? "location" : undefined}
            style={{
              ...segmentBaseStyle,
              color: seg.isLeaf ? seg.color : `${seg.color}99`,
              fontSize: seg.isLeaf ? "10px" : "9px",
              fontWeight: seg.isLeaf ? 700 : 400,
              cursor: seg.isLeaf ? "default" : "pointer",
              textShadow: seg.isLeaf ? `0 0 8px ${seg.color}55` : "none",
            }}
          >
            <span style={{ fontSize: "10px", marginRight: 2 }}>{seg.icon}</span>
            <span
              style={{
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {seg.label}
            </span>
          </button>
        </span>
      ))}

      {/* ── Depth badge ── */}
      <span
        style={{
          marginLeft: 10,
          fontSize: "7px",
          padding: "1px 5px",
          background: `${depthColor}14`,
          border: `1px solid ${depthColor}33`,
          borderRadius: 3,
          color: `${depthColor}cc`,
          letterSpacing: "0.07em",
          fontWeight: 700,
          flexShrink: 0,
        }}
        aria-label={`Depth: ${depthLabel}`}
      >
        {depthLabel}
      </span>

      {/* ── ESC hint ── */}
      <span style={escHintStyle}>ESC</span>
    </div>
  );
}

// ── Inline style constants ─────────────────────────────────────────────────

const homeButtonStyle: React.CSSProperties = {
  background: "rgba(74, 106, 255, 0.10)",
  border: "1px solid #2a3a6a",
  borderRadius: 3,
  color: "#4a6aff",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "12px",
  padding: "2px 6px",
  lineHeight: 1,
  transition: "background 0.12s ease, color 0.12s ease",
  flexShrink: 0,
};

const backButtonStyle: React.CSSProperties = {
  background: "rgba(74, 106, 255, 0.10)",
  border: "1px solid #2a3a6a",
  borderRadius: 3,
  color: "#4a6aff",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "10px",
  padding: "2px 7px",
  lineHeight: 1,
  transition: "background 0.12s ease, color 0.12s ease",
  flexShrink: 0,
};

const dividerStyle: React.CSSProperties = {
  color: "#1a1a3a",
  margin: "0 6px",
  fontSize: "10px",
  flexShrink: 0,
};

const separatorStyle: React.CSSProperties = {
  color: "#333355",
  margin: "0 5px",
  fontSize: "9px",
  flexShrink: 0,
};

const segmentBaseStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  borderRadius: 2,
  fontFamily: "inherit",
  letterSpacing: "0.06em",
  padding: "1px 3px",
  display: "flex",
  alignItems: "center",
  textTransform: "uppercase",
  transition: "color 0.12s ease",
  flexShrink: 0,
};

const escHintStyle: React.CSSProperties = {
  marginLeft: 8,
  fontSize: "7px",
  color: "#2a2a44",
  letterSpacing: "0.05em",
  flexShrink: 0,
};

export default NavigationBreadcrumb;
