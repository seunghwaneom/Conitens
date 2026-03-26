/**
 * RoomMappingEditor3D.tsx — Diegetic 3D UI for user-modifiable room mapping.
 *
 * Sub-AC 3 (AC 12): Provides a fully in-world 3D editing interface that lets
 * operators reassign agents/entities to different rooms entirely within the
 * 3D command-center scene — no HUD panel required.
 *
 * The editor surface is stratified into three independent layers:
 *
 *   1. RoomMappingEditToggle3D
 *      A glowing diegetic badge floating at the building's north-west corner.
 *      Clicking it toggles edit mode on/off.  Visible at all times (persistent
 *      affordance signal to the operator).
 *
 *   2. AgentDragHandle  (edit mode only)
 *      A hexagonal ring + "✥" label floating above each agent avatar.
 *      Supports two assignment gestures:
 *        • Click  → opens AgentAssignPopup3D (form-based assign)
 *        • Drag   → activates room drop zones; release over a room to assign
 *
 *   3. RoomDropZone  (during drag only)
 *      A pulsing animated floor ring rendered inside each room during an
 *      active drag.  Hovered zone glows with the room's type colour.
 *      Pointer-up triggers endDrag → commit.
 *
 *   4. AgentAssignPopup3D  (after clicking a drag handle)
 *      A world-anchored Html panel that appears at the agent's world position.
 *      Contains:
 *        - Agent name + current room badge
 *        - "Move this agent" row: room dropdown + confirm (individual assign)
 *        - "Move all [role]" row: room dropdown + confirm (role-level assign)
 *        - Cancel button
 *      Persists changes through room-mapping-store (localStorage).
 *
 *   5. DragCaptureGround  (during drag only)
 *      Invisible full-scene ground plane that absorbs pointer-move events
 *      during a drag so the capture plane doesn't block room volumes.
 *
 * Architecture:
 *   - `RoomMappingEditor3DLayer` is the top-level export added to CommandCenterScene.
 *   - All state flows through `useRoomMapping3D` (the custom hook).
 *   - Edit-mode toggle is stored locally (component state) not in the store —
 *     it is UI-only transient state, not a persisted concern.
 *   - All room assignments ultimately call room-mapping-store actions which:
 *       a) update the Zustand config snapshot
 *       b) persist to localStorage via room-mapping-persistence.ts
 *       c) append to the append-only events log
 *
 * Visual language:
 *   - All interactive affordances use the command-center cyan accent (#00d4ff)
 *   - Drag handles use ring geometry (hexagonal, 6-sided) for low-poly fidelity
 *   - Drop zones use animated pulsing circle geometry
 *   - Edit mode indicator uses a warm amber glow (#FFA726) for "alert" signal
 *
 * Performance:
 *   - AgentDragHandle and RoomDropZone use `useMemo` for geometry
 *   - Drop zone animations are driven by `useFrame` with direct mutation
 *   - Popup panel uses `<Html>` with `distanceFactor` to stay world-scaled
 *   - All handles hidden when edit mode is OFF (no geometry in scene)
 *
 * Record transparency:
 *   Every assignment goes through room-mapping-store actions which append
 *   to the append-only event log. Drag-based assignments record mode +
 *   agent + from_room + to_room. Form-based assignments record the same.
 */

import {
  useState,
  useCallback,
  useMemo,
  useRef,
  createContext,
  useContext,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE   from "three";
import { Html }     from "@react-three/drei";
import { useAgentStore }       from "../store/agent-store.js";
import { useSpatialStore }     from "../store/spatial-store.js";
import { useRoomMappingStore }  from "../store/room-mapping-store.js";
import { buildRoomRegistry }   from "../data/room-registry.js";
import { useRoomMapping3D, type AssignMode } from "../hooks/use-room-mapping-3d.js";
import { VOLUME_STYLES }       from "./RoomVolume.js";
import type { RoomType }       from "../data/building.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Y offset above the agent foot to render the drag handle ring. */
const HANDLE_Y_OFFSET = 1.55;

/** Outer / inner radii of the hexagonal drag handle ring. */
const HANDLE_OUTER_R = 0.18;
const HANDLE_INNER_R = 0.09;

/** Accent cyan for interactive affordances */
const ACCENT_CYAN    = "#00d4ff";
/** Accent amber for "edit mode active" indicator */
const ACCENT_AMBER   = "#FFA726";

// ─────────────────────────────────────────────────────────────────────────────
// Editor Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Editor3DContext — passes drag state + callbacks from the top-level layer
 * down to AgentDragHandle, RoomDropZone, etc. without prop-drilling.
 */
interface Editor3DContextValue {
  editMode:         boolean;
  toggleEditMode:   () => void;
  draggingAgentId:  string | null;
  hoverRoomId:      string | null;
  isPending:        boolean;
  popupAgentId:     string | null;
  setPopupAgentId:  (id: string | null) => void;
  startDrag:        (agentId: string) => void;
  setHoverRoom:     (roomId: string | null) => void;
  endDrag:          (roomId: string, mode?: AssignMode) => void;
  cancelDrag:       () => void;
  formAssign:       (agentId: string, roomId: string, mode?: AssignMode) => void;
}

const Editor3DContext = createContext<Editor3DContextValue | null>(null);

function useEditor3D(): Editor3DContextValue {
  const ctx = useContext(Editor3DContext);
  if (!ctx) throw new Error("useEditor3D must be used inside RoomMappingEditor3DLayer");
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. RoomMappingEditToggle3D — diegetic scene toggle badge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Small floating badge at the building NW corner ([-0.8, 5.2, 0.8]).
 * Glows cyan when edit mode is off; amber when edit mode is on.
 * Click toggles edit mode.
 */
function RoomMappingEditToggle3D() {
  const { editMode, toggleEditMode } = useEditor3D();
  const [hovered, setHovered] = useState(false);

  const ringMat = useMemo(() => {
    const color   = editMode ? ACCENT_AMBER : ACCENT_CYAN;
    const opacity = hovered ? 0.95 : 0.72;
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, hovered]);

  const ringGeo = useMemo(() => {
    const outer = new THREE.RingGeometry(0.10, 0.20, 6);
    return outer;
  }, []);

  return (
    <group
      position={[-0.8, 5.2, 0.8]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
      onClick={(e) => { e.stopPropagation(); toggleEditMode(); }}
    >
      {/* Hexagonal ring disc */}
      <mesh
        geometry={ringGeo}
        material={ringMat}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={10}
      />

      {/* Backdrop panel */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={9}>
        <circleGeometry args={[0.28, 6]} />
        <meshBasicMaterial
          color={editMode ? "#1a0f00" : "#001a22"}
          transparent
          opacity={hovered ? 0.92 : 0.78}
        />
      </mesh>

      {/* Label */}
      <Html
        center
        distanceFactor={10}
        position={[0, 0.02, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            "1px",
            userSelect:     "none",
          }}
        >
          <span
            style={{
              fontSize:    "8px",
              fontFamily:  "'JetBrains Mono', monospace",
              color:        editMode ? ACCENT_AMBER : ACCENT_CYAN,
              fontWeight:  700,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              textShadow:  editMode
                ? `0 0 6px ${ACCENT_AMBER}99`
                : `0 0 6px ${ACCENT_CYAN}66`,
              whiteSpace:  "nowrap",
            }}
          >
            {editMode ? "EDIT ON" : "ROOMS"}
          </span>
          <span
            style={{
              fontSize:  "6px",
              fontFamily: "'JetBrains Mono', monospace",
              color:      editMode ? "#ffcc8866" : "#00aacc66",
              whiteSpace: "nowrap",
            }}
          >
            {editMode ? "click agent" : "click to edit"}
          </span>
        </div>
      </Html>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AgentDragHandle — per-agent interactive drag/click affordance
// ─────────────────────────────────────────────────────────────────────────────

interface AgentDragHandleProps {
  agentId:       string;
  worldPosition: { x: number; y: number; z: number };
}

/**
 * Hexagonal ring + label that floats above each agent in edit mode.
 *
 * Click  → opens AgentAssignPopup3D (form-based assignment).
 * Drag   → calls startDrag then waits for RoomDropZone to call endDrag.
 *
 * Pulsing ring animation confirms "this is interactive".
 * Amber ring during drag, cyan during idle hover.
 */
function AgentDragHandle({ agentId, worldPosition }: AgentDragHandleProps) {
  const { draggingAgentId, popupAgentId, setPopupAgentId, startDrag, cancelDrag } = useEditor3D();

  const [hovered,   setHovered]   = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const pulseRef = useRef<THREE.Mesh>(null);
  const timeRef  = useRef(0);

  const isThisDragging = draggingAgentId === agentId;
  const isPopupOpen    = popupAgentId   === agentId;

  // Pulse animation — ring scales in/out slowly
  useFrame((_, delta) => {
    timeRef.current += delta;
    if (pulseRef.current) {
      const s = 1 + 0.12 * Math.sin(timeRef.current * 2.4);
      pulseRef.current.scale.set(s, s, 1);
    }
  });

  const ringGeo = useMemo(() => {
    return new THREE.RingGeometry(HANDLE_INNER_R, HANDLE_OUTER_R, 6);
  }, []);

  const accentColor = isThisDragging ? ACCENT_AMBER : ACCENT_CYAN;
  const ringMat     = useMemo(() => {
    const opacity = hovered ? 0.95 : 0.70;
    return new THREE.MeshBasicMaterial({
      color:       accentColor,
      transparent: true,
      opacity,
      side:        THREE.DoubleSide,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accentColor, hovered]);

  const handlePointerDown = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setIsDragging(true);
      startDrag(agentId);
    },
    [startDrag, agentId],
  );

  const handlePointerUp = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (isDragging) {
        setIsDragging(false);
        cancelDrag(); // No room was hit — cancel
      }
    },
    [isDragging, cancelDrag],
  );

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (!isDragging) {
        setPopupAgentId(isPopupOpen ? null : agentId);
      }
      setIsDragging(false);
    },
    [isDragging, isPopupOpen, agentId, setPopupAgentId],
  );

  const py = worldPosition.y + HANDLE_Y_OFFSET;

  return (
    <group
      position={[worldPosition.x, py, worldPosition.z]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "grab"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    >
      {/* Pulsing ring disc — scale animation via ref */}
      <mesh
        ref={pulseRef}
        geometry={ringGeo}
        material={ringMat}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={20}
      />

      {/* Label */}
      <Html
        center
        distanceFactor={10}
        position={[0, 0.06, 0]}
        style={{ pointerEvents: "none" }}
      >
        <span
          style={{
            fontSize:    "7px",
            fontFamily:  "'JetBrains Mono', monospace",
            color:        accentColor,
            fontWeight:  700,
            letterSpacing: "0.06em",
            textShadow:  `0 0 5px ${accentColor}88`,
            userSelect:  "none",
            whiteSpace:  "nowrap",
          }}
        >
          {isThisDragging ? "DRAG…" : isPopupOpen ? "▲FORM" : "✥MOVE"}
        </span>
      </Html>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RoomDropZone — animated floor ring during active drag
// ─────────────────────────────────────────────────────────────────────────────

interface RoomDropZoneProps {
  roomId:   string;
  position: { x: number; z: number; y: number };
  dims:     { x: number; z: number };
  roomType: RoomType;
}

/**
 * Pulsing floor ring rendered inside a room when a drag is active.
 * The ring glows with the room's type colour.
 * Hovered state shows a bright solid fill overlay to signal "drop here".
 *
 * Uses pointer events so the drag can end on the room:
 *   onPointerEnter  → setHoverRoom(roomId)
 *   onPointerLeave  → setHoverRoom(null)
 *   onPointerUp     → endDrag(roomId, "individual")
 */
function RoomDropZone({ roomId, position, dims, roomType }: RoomDropZoneProps) {
  const { draggingAgentId, hoverRoomId, setHoverRoom, endDrag } = useEditor3D();

  if (!draggingAgentId) return null; // Only render during active drag

  const isHovered  = hoverRoomId === roomId;
  const vs         = VOLUME_STYLES[roomType] ?? VOLUME_STYLES.office;
  const accentColor = vs.edgeColor;

  const ringRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (ringRef.current) {
      const pulse = 0.80 + 0.20 * Math.abs(Math.sin(timeRef.current * 2.2));
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = isHovered ? 0.75 : pulse * 0.38;
    }
  });

  // Ring radius: 40% of shorter room dimension
  const radius = Math.min(dims.x, dims.z) * 0.40;

  const cx = position.x + dims.x / 2;
  const cz = position.z + dims.z / 2;
  const cy = position.y + 0.06;

  const ringGeo = useMemo(
    () => new THREE.RingGeometry(radius * 0.6, radius, 16),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [radius],
  );

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       accentColor,
        transparent: true,
        opacity:     0.38,
        side:        THREE.DoubleSide,
        depthWrite:  false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor],
  );

  const fillMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color:       accentColor,
        transparent: true,
        opacity:     isHovered ? 0.18 : 0.06,
        side:        THREE.DoubleSide,
        depthWrite:  false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accentColor, isHovered],
  );

  return (
    <group
      position={[cx, cy, cz]}
      onPointerEnter={(e) => { e.stopPropagation(); setHoverRoom(roomId); }}
      onPointerLeave={() => { setHoverRoom(null); }}
      onPointerUp={(e) => {
        e.stopPropagation();
        endDrag(roomId, "individual");
      }}
    >
      {/* Pulsing ring */}
      <mesh
        ref={ringRef}
        geometry={ringGeo}
        material={ringMat}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={5}
      />
      {/* Fill disc — brightens on hover */}
      <mesh
        material={fillMat}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={4}
      >
        <circleGeometry args={[radius, 16]} />
      </mesh>
      {/* "DROP HERE" label on hover */}
      {isHovered && (
        <Html
          center
          distanceFactor={10}
          position={[0, 0.1, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span
            style={{
              fontSize:    "8px",
              fontFamily:  "'JetBrains Mono', monospace",
              color:        accentColor,
              fontWeight:  700,
              letterSpacing: "0.1em",
              textShadow:  `0 0 6px ${accentColor}88`,
              userSelect:  "none",
              whiteSpace:  "nowrap",
            }}
          >
            ↓ DROP HERE
          </span>
        </Html>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AgentAssignPopup3D — world-anchored form for click-based assignment
// ─────────────────────────────────────────────────────────────────────────────

interface AgentAssignPopup3DProps {
  agentId:       string;
  worldPosition: { x: number; y: number; z: number };
}

/**
 * A world-anchored Html form panel that appears above an agent
 * when the operator clicks its drag handle (non-drag path).
 *
 * Two assignment modes:
 *   "individual" — Move only this agent instance.
 *   "role"       — Move all agents with this role (updates role default).
 *
 * Both modes persist through room-mapping-store → localStorage.
 * The panel closes after a successful assignment or on Cancel.
 */
function AgentAssignPopup3D({ agentId, worldPosition }: AgentAssignPopup3DProps) {
  const { formAssign, setPopupAgentId, isPending } = useEditor3D();

  // Store data
  const agent         = useAgentStore((s) => s.agents[agentId]);
  const rooms         = useSpatialStore((s) => s.building.rooms);
  const building      = useSpatialStore((s) => s.building);
  const registry      = useMemo(() => buildRoomRegistry(building), [building]);

  const [selectedRoomId, setSelectedRoomId] = useState<string>(agent?.roomId ?? "");
  const [assignMode,     setAssignMode]     = useState<AssignMode>("individual");

  if (!agent) return null;

  const agentName = agent.def?.name ?? agentId;
  const agentRole = (agent.def?.role as string) ?? "unknown";
  const currentRoom = rooms.find((r) => r.roomId === agent.roomId);
  const currentRoomName = currentRoom?.name ?? agent.roomId;

  const handleConfirm = () => {
    if (!selectedRoomId || selectedRoomId === agent.roomId) {
      setPopupAgentId(null);
      return;
    }
    formAssign(agentId, selectedRoomId, assignMode);
    setPopupAgentId(null);
  };

  const panelY = worldPosition.y + HANDLE_Y_OFFSET + 0.5;

  return (
    <group position={[worldPosition.x, panelY, worldPosition.z]}>
      <Html
        center
        distanceFactor={8}
        style={{ pointerEvents: "auto", zIndex: 1000 }}
      >
        <div
          style={{
            background:   "rgba(6, 8, 20, 0.96)",
            border:       `1px solid ${ACCENT_CYAN}55`,
            borderRadius: "6px",
            padding:      "10px 14px",
            backdropFilter: "blur(10px)",
            boxShadow:    `0 0 18px ${ACCENT_CYAN}22`,
            color:        "#c8d0e8",
            fontFamily:   "'JetBrains Mono', 'Cascadia Code', monospace",
            fontSize:     "10px",
            minWidth:     "200px",
            userSelect:   "none",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display:        "flex",
              justifyContent: "space-between",
              alignItems:     "center",
              marginBottom:   "8px",
              borderBottom:   `1px solid ${ACCENT_CYAN}22`,
              paddingBottom:  "6px",
            }}
          >
            <span style={{ color: ACCENT_CYAN, fontWeight: 700, fontSize: "9px", letterSpacing: "0.1em" }}>
              ✥ ASSIGN ROOM
            </span>
            <button
              style={{
                background:  "none",
                border:      "none",
                color:       "#556",
                cursor:      "pointer",
                fontSize:    "11px",
                padding:     "0 2px",
                lineHeight:  1,
              }}
              onClick={() => setPopupAgentId(null)}
            >
              ✕
            </button>
          </div>

          {/* Agent info */}
          <div style={{ marginBottom: "8px" }}>
            <div style={{ color: "#aaccee", fontWeight: 700, fontSize: "10px" }}>{agentName}</div>
            <div style={{ color: "#556677", fontSize: "8px", marginTop: "1px" }}>
              role: <span style={{ color: "#7799bb" }}>{agentRole}</span>
              {" · "}now: <span style={{ color: "#7799bb" }}>{currentRoomName}</span>
            </div>
          </div>

          {/* Room select */}
          <div style={{ marginBottom: "8px" }}>
            <label style={{ color: "#7788aa", fontSize: "8px", display: "block", marginBottom: "3px" }}>
              DESTINATION ROOM
            </label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              style={{
                background:   "rgba(10, 14, 30, 0.9)",
                border:       `1px solid ${ACCENT_CYAN}44`,
                borderRadius: "3px",
                color:        "#c8d0e8",
                fontFamily:   "inherit",
                fontSize:     "9px",
                padding:      "3px 6px",
                width:        "100%",
                cursor:       "pointer",
                outline:      "none",
              }}
            >
              <option value="" disabled>— select room —</option>
              {Object.values(registry).map((entry) => (
                <option key={entry.roomId} value={entry.roomId}>
                  {entry.name} ({entry.roomType})
                </option>
              ))}
            </select>
          </div>

          {/* Mode selector */}
          <div style={{ marginBottom: "10px" }}>
            <label style={{ color: "#7788aa", fontSize: "8px", display: "block", marginBottom: "4px" }}>
              SCOPE
            </label>
            <div style={{ display: "flex", gap: "6px" }}>
              {(["individual", "role"] as AssignMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setAssignMode(m)}
                  style={{
                    flex:         1,
                    background:   assignMode === m ? `${ACCENT_CYAN}22` : "rgba(10,14,30,0.6)",
                    border:       `1px solid ${assignMode === m ? ACCENT_CYAN + "88" : "#334455"}`,
                    borderRadius: "3px",
                    color:        assignMode === m ? ACCENT_CYAN : "#556677",
                    fontFamily:   "inherit",
                    fontSize:     "8px",
                    padding:      "3px 4px",
                    cursor:       "pointer",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase" as const,
                    transition:   "all 0.15s ease",
                  }}
                >
                  {m === "individual" ? "This agent" : `All ${agentRole}`}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              disabled={!selectedRoomId || isPending}
              onClick={handleConfirm}
              style={{
                flex:         1,
                background:   selectedRoomId && !isPending ? `${ACCENT_CYAN}22` : "rgba(10,14,30,0.4)",
                border:       `1px solid ${selectedRoomId && !isPending ? ACCENT_CYAN + "88" : "#223344"}`,
                borderRadius: "3px",
                color:        selectedRoomId && !isPending ? ACCENT_CYAN : "#334455",
                fontFamily:   "inherit",
                fontSize:     "9px",
                fontWeight:   700,
                padding:      "4px",
                cursor:       selectedRoomId && !isPending ? "pointer" : "default",
                letterSpacing: "0.06em",
              }}
            >
              {isPending ? "…" : "✓ ASSIGN"}
            </button>
            <button
              onClick={() => setPopupAgentId(null)}
              style={{
                background:   "rgba(20,8,8,0.7)",
                border:       "1px solid #442233",
                borderRadius: "3px",
                color:        "#664455",
                fontFamily:   "inherit",
                fontSize:     "9px",
                padding:      "4px 8px",
                cursor:       "pointer",
                letterSpacing: "0.06em",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      </Html>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. RoomDropZoneLayer — all drop zones for active drag
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders a RoomDropZone for each room in the registry when a drag is active.
 * Uses the spatial-store building as the data source so it responds to YAML hot-reloads.
 */
function RoomDropZoneLayer() {
  const { draggingAgentId } = useEditor3D();
  const building = useSpatialStore((s) => s.building);
  const registry = useMemo(() => buildRoomRegistry(building), [building]);

  if (!draggingAgentId) return null;

  return (
    <group name="room-drop-zones">
      {Object.values(registry).map((entry) => (
        <RoomDropZone
          key={entry.roomId}
          roomId={entry.roomId}
          roomType={entry.roomType}
          position={entry.positionHint.position}
          dims={{
            x: entry.positionHint.dimensions.x,
            z: entry.positionHint.dimensions.z,
          }}
        />
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. AgentDragHandleLayer — all agent handles (edit mode only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders an AgentDragHandle above every agent when edit mode is ON.
 * Also renders the AgentAssignPopup3D for the currently selected agent.
 */
function AgentDragHandleLayer() {
  const { editMode, popupAgentId } = useEditor3D();
  const agents = useAgentStore((s) => s.agents);

  if (!editMode) return null;

  return (
    <group name="agent-drag-handles">
      {Object.values(agents).map((agent) => (
        <AgentDragHandle
          key={agent.def.agentId}
          agentId={agent.def.agentId}
          worldPosition={agent.worldPosition}
        />
      ))}

      {/* Popup for clicked handle */}
      {popupAgentId && (() => {
        const agent = agents[popupAgentId];
        if (!agent) return null;
        return (
          <AgentAssignPopup3D
            agentId={popupAgentId}
            worldPosition={agent.worldPosition}
          />
        );
      })()}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. EditModeRoomHighlightRing — additional room ring in edit mode (non-drag)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When edit mode is active but no drag is in progress, show subtle
 * corner-bracket outlines on all rooms to indicate they are valid drop targets.
 * This provides a persistent spatial affordance that rooms are editable.
 */
function EditModeRoomHighlightRing({
  position,
  dims,
  roomType,
}: {
  position: { x: number; y: number; z: number };
  dims:     { x: number; z: number };
  roomType: RoomType;
}) {
  const vs  = VOLUME_STYLES[roomType] ?? VOLUME_STYLES.office;
  const cx  = position.x + dims.x / 2;
  const cz  = position.z + dims.z / 2;
  const cy  = position.y + 0.035;

  const ringGeo = useMemo(() => {
    const r = Math.min(dims.x, dims.z) * 0.45;
    return new THREE.RingGeometry(r - 0.04, r, 16);
  }, [dims.x, dims.z]);

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color:       ACCENT_CYAN,
    transparent: true,
    opacity:     0.08,
    side:        THREE.DoubleSide,
    depthWrite:  false,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [vs.fillColor]);

  return (
    <mesh
      geometry={ringGeo}
      material={ringMat}
      position={[cx, cy, cz]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={3}
    />
  );
}

function EditModeRoomHintsLayer() {
  const { editMode, draggingAgentId } = useEditor3D();
  const building = useSpatialStore((s) => s.building);
  const registry = useMemo(() => buildRoomRegistry(building), [building]);

  // Only show subtle rings when in edit mode and NOT dragging
  if (!editMode || draggingAgentId) return null;

  return (
    <group name="edit-mode-room-hints">
      {Object.values(registry).map((entry) => (
        <EditModeRoomHighlightRing
          key={entry.roomId}
          position={entry.positionHint.position}
          dims={{
            x: entry.positionHint.dimensions.x,
            z: entry.positionHint.dimensions.z,
          }}
          roomType={entry.roomType}
        />
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. EditModeStatusBadge3D — diegetic floating edit-mode indicator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When edit mode is active, a floating amber banner hovers above the building
 * to give a persistent "editing" signal visible from all camera angles.
 * Disappears when edit mode is off.
 */
function EditModeStatusBadge3D() {
  const { editMode } = useEditor3D();
  const deviationCount = useRoomMappingStore((s) => s.snapshot.deviations.length);

  if (!editMode) return null;

  return (
    <group position={[6, 7.2, 3]}>
      <Html center distanceFactor={12} style={{ pointerEvents: "none" }}>
        <div
          style={{
            background:   "rgba(20, 10, 0, 0.88)",
            border:       `1px solid ${ACCENT_AMBER}66`,
            borderRadius: "4px",
            padding:      "3px 10px",
            backdropFilter: "blur(6px)",
            color:        ACCENT_AMBER,
            fontFamily:   "'JetBrains Mono', monospace",
            fontSize:     "8px",
            fontWeight:   700,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            whiteSpace:   "nowrap",
            boxShadow:    `0 0 12px ${ACCENT_AMBER}22`,
          }}
        >
          ✥ ROOM MAPPING EDIT MODE
          {deviationCount > 0 && (
            <span style={{ color: "#FF7043", marginLeft: "8px" }}>
              {deviationCount} custom
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. RoomMappingEditor3DLayer — top-level export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-level diegetic 3D room mapping editor layer.
 *
 * Add this as a direct child of the R3F `<Canvas>` (after RoomsFromRegistry)
 * in CommandCenterScene:
 *
 * ```tsx
 * <RoomMappingEditor3DLayer />
 * ```
 *
 * The layer is self-contained:
 *   - Manages its own editMode toggle (local state)
 *   - Reads agent positions from agent-store
 *   - Reads room geometry from spatial-store
 *   - Commits assignments through useRoomMapping3D (→ room-mapping-store)
 *
 * All sub-components communicate through Editor3DContext.
 */
export function RoomMappingEditor3DLayer() {
  const [editMode,     setEditMode]     = useState(false);
  const [popupAgentId, setPopupAgentId] = useState<string | null>(null);

  const rm3d = useRoomMapping3D();

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      if (prev) {
        // Closing edit mode — cancel any in-progress drag and close popup
        rm3d.cancelDrag();
        setPopupAgentId(null);
      }
      return !prev;
    });
  }, [rm3d]);

  const contextValue: Editor3DContextValue = {
    editMode,
    toggleEditMode,
    draggingAgentId: rm3d.draggingAgentId,
    hoverRoomId:     rm3d.hoverRoomId,
    isPending:       rm3d.isPending,
    popupAgentId,
    setPopupAgentId,
    startDrag:       rm3d.startDrag,
    setHoverRoom:    rm3d.setHoverRoom,
    endDrag:         rm3d.endDrag,
    cancelDrag:      rm3d.cancelDrag,
    formAssign:      rm3d.formAssign,
  };

  return (
    <Editor3DContext.Provider value={contextValue}>
      <group name="room-mapping-editor-3d">
        {/* Persistent toggle badge — always visible */}
        <RoomMappingEditToggle3D />

        {/* Edit-mode ambient status banner */}
        <EditModeStatusBadge3D />

        {/* Per-room subtle edit-mode hint rings (no drag active) */}
        <EditModeRoomHintsLayer />

        {/* Per-agent drag handles + popup form (edit mode only) */}
        <AgentDragHandleLayer />

        {/* Per-room drop zones (drag active only) */}
        <RoomDropZoneLayer />
      </group>
    </Editor3DContext.Provider>
  );
}
