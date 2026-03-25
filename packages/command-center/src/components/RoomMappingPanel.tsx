/**
 * RoomMappingPanel.tsx — HUD panel for viewing and editing room mappings.
 *
 * Displays the live room mapping configuration (role→room, capability→room,
 * special entities, fallback room) and allows the operator to edit them
 * at runtime.
 *
 * Key behaviors:
 *   - Hovering a row highlights the target room in the 3D scene
 *   - Clicking a room badge opens an inline dropdown to change it
 *   - Changing a role mapping immediately moves affected agents in 3D
 *   - All changes are event-sourced via room-mapping-store
 *   - Changes counter shows audit trail depth
 *   - RESET button restores all defaults and moves agents back
 *
 * Sub-AC 12b additions:
 *   - "Rooms" tab: edit room labels and parent/hierarchy at runtime
 *   - Add capability fallback (inline form at bottom of Capabilities tab)
 *   - Remove capability fallback (✕ button per row)
 *   - Reorder capability fallbacks (↑↓ arrows per row)
 *   - Add special entity assignment (inline form at bottom of Specials tab)
 *   - Remove special entity assignment (✕ button per row)
 *
 * Positioned as a floating center modal; opened via HUD toggle.
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useRoomMappingStore } from "../store/room-mapping-store.js";
import { useSpatialStore } from "../store/spatial-store.js";
import { useAgentStore } from "../store/agent-store.js";
import { AGENTS } from "../data/agents.js";
import type { AgentRole } from "../data/room-mapping-resolver.js";
import { STORAGE_KEY } from "../store/room-mapping-persistence.js";

// ── Active tab type ────────────────────────────────────────────────
type Tab = "roles" | "capabilities" | "specials" | "rooms" | "agents";

// ── Role icon map (small unicode glyphs for the role column) ───────
const ROLE_ICONS: Record<string, string> = {
  orchestrator: "♛",
  implementer:  "⚙",
  researcher:   "🔬",
  reviewer:     "👁",
  validator:    "🛡",
  planner:      "📋",
  analyst:      "📊",
  tester:       "🧪",
};

// ── Role accent colors ─────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  orchestrator: "#FF7043",
  implementer:  "#66BB6A",
  researcher:   "#AB47BC",
  reviewer:     "#42A5F5",
  validator:    "#EF5350",
  planner:      "#FFA726",
  analyst:      "#26C6DA",
  tester:       "#FF7043",
};

// ── Room type icons ────────────────────────────────────────────────
const ROOM_TYPE_ICONS: Record<string, string> = {
  control:  "⬡",
  office:   "□",
  lab:      "◈",
  lobby:    "○",
  archive:  "▣",
  corridor: "─",
};

// ── RoomMappingPanel ───────────────────────────────────────────────

export function RoomMappingPanel() {
  // Store selectors
  const config             = useRoomMappingStore((s) => s.config);
  const events             = useRoomMappingStore((s) => s.events);
  const persistenceSource  = useRoomMappingStore((s) => s.persistenceSource);
  const lastSavedAt        = useRoomMappingStore((s) => s.lastSavedAt);
  const updateRole         = useRoomMappingStore((s) => s.updateRoleMapping);
  const updateCapability   = useRoomMappingStore((s) => s.updateCapabilityFallback);
  const addCapability      = useRoomMappingStore((s) => s.addCapabilityFallback);
  const removeCapability   = useRoomMappingStore((s) => s.removeCapabilityFallback);
  const reorderCapability  = useRoomMappingStore((s) => s.reorderCapabilityFallback);
  const updateSpecial      = useRoomMappingStore((s) => s.updateSpecialAssignment);
  const addSpecial         = useRoomMappingStore((s) => s.addSpecialAssignment);
  const removeSpecial      = useRoomMappingStore((s) => s.removeSpecialAssignment);
  const setFallback        = useRoomMappingStore((s) => s.setFallbackRoom);
  const resetToDefaults    = useRoomMappingStore((s) => s.resetToDefaults);
  const closePanel         = useRoomMappingStore((s) => s.closePanel);

  const rooms              = useSpatialStore((s) => s.building.rooms);
  const getRoomById        = useSpatialStore((s) => s.getRoomById);
  const highlightRoom      = useSpatialStore((s) => s.highlightRoom);
  const unhighlightRoom    = useSpatialStore((s) => s.unhighlightRoom);
  const updateRoomLabel    = useSpatialStore((s) => s.updateRoomLabel);
  const updateRoomParent   = useSpatialStore((s) => s.updateRoomParent);

  const runtimeOverrides       = useRoomMappingStore((s) => s.runtimeOverrides);
  const setRuntimeOverride     = useRoomMappingStore((s) => s.setRuntimeOverride);
  const clearRuntimeOverride   = useRoomMappingStore((s) => s.clearRuntimeOverride);
  const clearAllRuntimeOverrides = useRoomMappingStore((s) => s.clearAllRuntimeOverrides);

  const agents    = useAgentStore((s) => s.agents);
  const moveAgent = useAgentStore((s) => s.moveAgent);

  // Local UI state
  const [activeTab, setActiveTab]             = useState<Tab>("roles");
  const [editingKey, setEditingKey]           = useState<string | null>(null);
  const [flashKeys, setFlashKeys]             = useState<Set<string>>(new Set());
  const [hoveredRoomId, setHoveredRoomId]     = useState<string | null>(null);
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Add-form state — capabilities
  const [newCapName, setNewCapName]           = useState("");
  const [newCapRoom, setNewCapRoom]           = useState("");
  const [newCapReason, setNewCapReason]       = useState("");
  const [showAddCap, setShowAddCap]           = useState(false);

  // Add-form state — specials
  const [newSpecEntity, setNewSpecEntity]     = useState("");
  const [newSpecRoom, setNewSpecRoom]         = useState("");
  const [newSpecReason, setNewSpecReason]     = useState("");
  const [showAddSpec, setShowAddSpec]         = useState(false);

  // Room editing state
  const [editingLabelRoomId, setEditingLabelRoomId]   = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue]       = useState("");
  const [editingParentRoomId, setEditingParentRoomId]  = useState<string | null>(null);

  // Agents tab state — per-agent runtime override editing
  const [editingOverrideKey, setEditingOverrideKey]   = useState<string | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(flashTimers.current).forEach(clearTimeout);
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────

  /** Get a room's accent color, falling back to a muted default */
  const getRoomColor = useCallback(
    (roomId: string): string => {
      const room = getRoomById(roomId);
      return room?.colorAccent ?? "#555577";
    },
    [getRoomById],
  );

  /** Flash a row key for 1.5s to indicate a successful update */
  const flashKey = useCallback((key: string) => {
    if (flashTimers.current[key]) clearTimeout(flashTimers.current[key]);
    setFlashKeys((prev) => new Set([...prev, key]));
    flashTimers.current[key] = setTimeout(() => {
      setFlashKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 1500);
  }, []);

  /** Move all live agents whose role matches the given role to a new room */
  const moveAgentsForRole = useCallback(
    (role: string, toRoomId: string) => {
      Object.values(agents).forEach((a) => {
        if (a.def.role === role && a.roomId !== toRoomId) {
          moveAgent(a.def.agentId, toRoomId);
        }
      });
    },
    [agents, moveAgent],
  );

  /** Hover: highlight target room in 3D */
  const handleRowEnter = useCallback(
    (roomId: string) => {
      setHoveredRoomId(roomId);
      highlightRoom(roomId);
    },
    [highlightRoom],
  );

  /** Hover leave: unhighlight */
  const handleRowLeave = useCallback(
    (roomId: string) => {
      setHoveredRoomId(null);
      unhighlightRoom(roomId);
    },
    [unhighlightRoom],
  );

  // ── Change handlers ────────────────────────────────────────────

  const handleRoleChange = useCallback(
    (role: AgentRole, newRoomId: string) => {
      updateRole(role, newRoomId);
      moveAgentsForRole(role, newRoomId);
      flashKey(`role-${role}`);
      setEditingKey(null);
    },
    [updateRole, moveAgentsForRole, flashKey],
  );

  const handleCapabilityChange = useCallback(
    (capability: string, newRoomId: string) => {
      updateCapability(capability, newRoomId);
      flashKey(`cap-${capability}`);
      setEditingKey(null);
    },
    [updateCapability, flashKey],
  );

  const handleSpecialChange = useCallback(
    (entityId: string, newRoomId: string) => {
      updateSpecial(entityId, newRoomId);
      flashKey(`special-${entityId}`);
      setEditingKey(null);
    },
    [updateSpecial, flashKey],
  );

  const handleFallbackChange = useCallback(
    (newRoomId: string) => {
      setFallback(newRoomId);
      flashKey("fallback");
      setEditingKey(null);
    },
    [setFallback, flashKey],
  );

  const handleReset = useCallback(() => {
    resetToDefaults();
    AGENTS.forEach((agentDef) => {
      const liveAgent = agents[agentDef.agentId];
      if (liveAgent && liveAgent.roomId !== agentDef.defaultRoom) {
        moveAgent(agentDef.agentId, agentDef.defaultRoom);
      }
    });
    flashKey("reset");
  }, [resetToDefaults, agents, moveAgent, flashKey]);

  // ── Add capability handler ─────────────────────────────────────

  const handleAddCapability = useCallback(() => {
    const cap = newCapName.trim();
    const roomId = newCapRoom || (rooms[0]?.roomId ?? "");
    if (!cap || !roomId) return;
    addCapability(cap, roomId, newCapReason.trim() || undefined);
    flashKey(`cap-${cap}`);
    setNewCapName("");
    setNewCapRoom("");
    setNewCapReason("");
    setShowAddCap(false);
  }, [newCapName, newCapRoom, newCapReason, rooms, addCapability, flashKey]);

  // ── Remove capability handler ──────────────────────────────────

  const handleRemoveCapability = useCallback(
    (capability: string) => {
      removeCapability(capability);
      flashKey("cap-remove");
    },
    [removeCapability, flashKey],
  );

  // ── Reorder capability handlers ────────────────────────────────

  const handleCapabilityUp = useCallback(
    (index: number) => {
      if (index > 0) reorderCapability(index, index - 1);
    },
    [reorderCapability],
  );

  const handleCapabilityDown = useCallback(
    (index: number) => {
      if (index < config.capabilityFallbacks.length - 1) {
        reorderCapability(index, index + 1);
      }
    },
    [reorderCapability, config.capabilityFallbacks.length],
  );

  // ── Add special handler ────────────────────────────────────────

  const handleAddSpecial = useCallback(() => {
    const entity = newSpecEntity.trim().toUpperCase();
    const roomId = newSpecRoom || (rooms[0]?.roomId ?? "");
    if (!entity || !roomId) return;
    addSpecial(entity, roomId, newSpecReason.trim() || undefined);
    flashKey(`special-${entity}`);
    setNewSpecEntity("");
    setNewSpecRoom("");
    setNewSpecReason("");
    setShowAddSpec(false);
  }, [newSpecEntity, newSpecRoom, newSpecReason, rooms, addSpecial, flashKey]);

  // ── Remove special handler ─────────────────────────────────────

  const handleRemoveSpecial = useCallback(
    (entityId: string) => {
      removeSpecial(entityId);
      flashKey("special-remove");
    },
    [removeSpecial, flashKey],
  );

  // ── Room label edit handlers ───────────────────────────────────

  const handleStartLabelEdit = useCallback((roomId: string, currentName: string) => {
    setEditingLabelRoomId(roomId);
    setEditingLabelValue(currentName);
  }, []);

  const handleCommitLabelEdit = useCallback(() => {
    if (editingLabelRoomId && editingLabelValue.trim()) {
      updateRoomLabel(editingLabelRoomId, editingLabelValue.trim());
      flashKey(`label-${editingLabelRoomId}`);
    }
    setEditingLabelRoomId(null);
    setEditingLabelValue("");
  }, [editingLabelRoomId, editingLabelValue, updateRoomLabel, flashKey]);

  const handleCancelLabelEdit = useCallback(() => {
    setEditingLabelRoomId(null);
    setEditingLabelValue("");
  }, []);

  const handleParentChange = useCallback(
    (roomId: string, parentRoomId: string) => {
      updateRoomParent(roomId, parentRoomId === "__none__" ? null : parentRoomId);
      flashKey(`parent-${roomId}`);
      setEditingParentRoomId(null);
    },
    [updateRoomParent, flashKey],
  );

  // ── Agents tab: per-agent runtime override handlers ────────────

  const handleSetOverride = useCallback(
    (agentId: string, newRoomId: string) => {
      setRuntimeOverride(agentId, newRoomId, `User reassigned ${agentId} → ${newRoomId}`, "user");
      moveAgent(agentId, newRoomId);
      flashKey(`override-${agentId}`);
      setEditingOverrideKey(null);
    },
    [setRuntimeOverride, moveAgent, flashKey],
  );

  const handleClearOverride = useCallback(
    (agentId: string) => {
      const entry = runtimeOverrides[agentId];
      clearRuntimeOverride(agentId, `User cleared override for ${agentId}`);
      // Revert agent to their role-mapped room
      const agentState = agents[agentId];
      if (agentState && entry) {
        const defaultRoomId = config.roleDefaults[agentState.def.role as keyof typeof config.roleDefaults]?.roomId
          ?? config.fallbackRoom;
        if (agentState.roomId !== defaultRoomId) {
          moveAgent(agentId, defaultRoomId);
        }
      }
      flashKey(`override-${agentId}`);
    },
    [clearRuntimeOverride, runtimeOverrides, agents, config, moveAgent, flashKey],
  );

  const handleClearAllOverrides = useCallback(() => {
    // Revert all overridden agents to their configured rooms before clearing
    const currentOverrides = { ...runtimeOverrides };
    clearAllRuntimeOverrides("User cleared all runtime overrides");
    Object.keys(currentOverrides).forEach((agentId) => {
      const agentState = agents[agentId];
      if (agentState) {
        const defaultRoomId = config.roleDefaults[agentState.def.role as keyof typeof config.roleDefaults]?.roomId
          ?? config.fallbackRoom;
        if (agentState.roomId !== defaultRoomId) {
          moveAgent(agentId, defaultRoomId);
        }
      }
    });
    flashKey("clear-all-overrides");
  }, [clearAllRuntimeOverrides, runtimeOverrides, agents, config, moveAgent, flashKey]);

  // ── Room badge / inline select ─────────────────────────────────

  function RoomSelect({
    value,
    onChange,
    onBlur,
    includeNone = false,
    noneLabel = "— none —",
  }: {
    value: string;
    onChange: (roomId: string) => void;
    onBlur: () => void;
    includeNone?: boolean;
    noneLabel?: string;
  }) {
    return (
      <select
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        style={S.select}
        onClick={(e) => e.stopPropagation()}
      >
        {includeNone && (
          <option value="__none__">{noneLabel}</option>
        )}
        {rooms.map((room) => (
          <option key={room.roomId} value={room.roomId}>
            {room.name}
          </option>
        ))}
      </select>
    );
  }

  function RoomBadge({
    roomId,
    onClick,
  }: {
    roomId: string;
    onClick: () => void;
  }) {
    const color = getRoomColor(roomId);
    const room = getRoomById(roomId);
    return (
      <button
        onClick={onClick}
        style={{
          ...S.roomTag,
          borderColor: color,
          color,
        }}
        title={`Room: ${room?.name ?? roomId} — click to change`}
      >
        {room?.name ?? roomId}
        <span style={{ marginLeft: 3, opacity: 0.7, fontSize: "7px" }}>▾</span>
      </button>
    );
  }

  // ── Inline add-capability form ──────────────────────────────────

  function AddCapabilityForm() {
    if (!showAddCap) {
      return (
        <button
          onClick={() => {
            setShowAddCap(true);
            setNewCapRoom(rooms[0]?.roomId ?? "");
          }}
          style={{ ...S.addBtn, marginTop: 6 }}
        >
          + ADD CAPABILITY
        </button>
      );
    }
    return (
      <div style={S.addForm}>
        <div style={S.addFormTitle}>NEW CAPABILITY FALLBACK</div>
        <div style={S.addFormRow}>
          <input
            autoFocus
            placeholder="capability name"
            value={newCapName}
            onChange={(e) => setNewCapName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddCapability();
              if (e.key === "Escape") { setShowAddCap(false); setNewCapName(""); }
            }}
            style={S.addInput}
          />
          <select
            value={newCapRoom}
            onChange={(e) => setNewCapRoom(e.target.value)}
            style={{ ...S.select, flex: "0 0 120px" }}
          >
            {rooms.map((r) => (
              <option key={r.roomId} value={r.roomId}>{r.name}</option>
            ))}
          </select>
        </div>
        <div style={S.addFormRow}>
          <input
            placeholder="reason (optional)"
            value={newCapReason}
            onChange={(e) => setNewCapReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddCapability();
              if (e.key === "Escape") { setShowAddCap(false); }
            }}
            style={{ ...S.addInput, flex: 1 }}
          />
          <button
            onClick={handleAddCapability}
            style={{ ...S.addBtn, borderColor: "#4a6aff", color: "#aaccff" }}
          >
            ✓ ADD
          </button>
          <button
            onClick={() => { setShowAddCap(false); setNewCapName(""); setNewCapReason(""); }}
            style={S.addBtn}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // ── Inline add-special form ────────────────────────────────────

  function AddSpecialForm() {
    if (!showAddSpec) {
      return (
        <button
          onClick={() => {
            setShowAddSpec(true);
            setNewSpecRoom(rooms[0]?.roomId ?? "");
          }}
          style={{ ...S.addBtn, marginTop: 6 }}
        >
          + ADD SPECIAL
        </button>
      );
    }
    return (
      <div style={S.addForm}>
        <div style={S.addFormTitle}>NEW SPECIAL ASSIGNMENT</div>
        <div style={S.addFormRow}>
          <input
            autoFocus
            placeholder="ENTITY_ID"
            value={newSpecEntity}
            onChange={(e) => setNewSpecEntity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddSpecial();
              if (e.key === "Escape") { setShowAddSpec(false); setNewSpecEntity(""); }
            }}
            style={S.addInput}
          />
          <select
            value={newSpecRoom}
            onChange={(e) => setNewSpecRoom(e.target.value)}
            style={{ ...S.select, flex: "0 0 120px" }}
          >
            {rooms.map((r) => (
              <option key={r.roomId} value={r.roomId}>{r.name}</option>
            ))}
          </select>
        </div>
        <div style={S.addFormRow}>
          <input
            placeholder="reason (optional)"
            value={newSpecReason}
            onChange={(e) => setNewSpecReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddSpecial();
              if (e.key === "Escape") { setShowAddSpec(false); }
            }}
            style={{ ...S.addInput, flex: 1 }}
          />
          <button
            onClick={handleAddSpecial}
            style={{ ...S.addBtn, borderColor: "#4a6aff", color: "#aaccff" }}
          >
            ✓ ADD
          </button>
          <button
            onClick={() => { setShowAddSpec(false); setNewSpecEntity(""); setNewSpecReason(""); }}
            style={S.addBtn}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // ── Tab renders ────────────────────────────────────────────────

  function renderRolesTab() {
    return (
      <div>
        <div style={S.colHeader}>
          <span style={{ flex: "0 0 90px" }}>ROLE</span>
          <span style={{ flex: 1, textAlign: "right", paddingRight: 4 }}>TARGET ROOM</span>
          <span style={{ flex: "0 0 60px", textAlign: "right" }}>AGENTS</span>
        </div>
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {(Object.entries(config.roleDefaults) as [AgentRole, { roomId: string; reason: string }][]).map(
            ([role, mapping]) => {
              const key = `role-${role}`;
              const isEditing = editingKey === key;
              const isFlashing = flashKeys.has(key);
              const roleAgents = AGENTS.filter((a) => a.role === role);
              const icon = ROLE_ICONS[role] ?? "?";
              const roleColor = ROLE_COLORS[role] ?? "#7777aa";

              return (
                <div
                  key={role}
                  style={{
                    ...S.row,
                    background: isFlashing
                      ? "rgba(74, 106, 255, 0.12)"
                      : hoveredRoomId === mapping.roomId
                      ? "rgba(255,255,255,0.03)"
                      : "transparent",
                  }}
                  onMouseEnter={() => handleRowEnter(mapping.roomId)}
                  onMouseLeave={() => handleRowLeave(mapping.roomId)}
                >
                  {/* Role column */}
                  <div
                    style={{
                      flex: "0 0 90px",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <span style={{ color: roleColor, fontSize: "11px" }}>{icon}</span>
                    <span
                      style={{
                        fontSize: "9px",
                        color: roleColor,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {role}
                    </span>
                  </div>

                  {/* Room column */}
                  <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                    {isEditing ? (
                      <RoomSelect
                        value={mapping.roomId}
                        onChange={(v) => handleRoleChange(role, v)}
                        onBlur={() => setEditingKey(null)}
                      />
                    ) : (
                      <RoomBadge
                        roomId={mapping.roomId}
                        onClick={() => setEditingKey(key)}
                      />
                    )}
                  </div>

                  {/* Agent icons column */}
                  <div
                    style={{
                      flex: "0 0 60px",
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 2,
                      paddingRight: 2,
                    }}
                  >
                    {roleAgents.length > 0 ? (
                      roleAgents.map((a) => (
                        <span
                          key={a.agentId}
                          style={{ color: a.visual.color, fontSize: "10px" }}
                          title={`${a.name} (${a.agentId})`}
                        >
                          {a.visual.icon}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: "#333355", fontSize: "8px" }}>—</span>
                    )}
                  </div>
                </div>
              );
            },
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: "8px", color: "#444466", fontStyle: "italic" }}>
          Hover a row to highlight the room in 3D · Click a room badge to reassign
        </div>
      </div>
    );
  }

  function renderCapabilitiesTab() {
    const total = config.capabilityFallbacks.length;
    return (
      <div>
        <div style={S.colHeader}>
          <span style={{ flex: "0 0 16px" }}>#</span>
          <span style={{ flex: 1 }}>CAPABILITY</span>
          <span style={{ flex: "0 0 120px", textAlign: "right" }}>TARGET ROOM</span>
          <span style={{ flex: "0 0 52px", textAlign: "right" }}>ORDER</span>
          <span style={{ flex: "0 0 20px" }}></span>
        </div>
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {config.capabilityFallbacks.map((fb, idx) => {
            const key = `cap-${fb.capability}`;
            const isEditing = editingKey === key;
            const isFlashing = flashKeys.has(key);

            return (
              <div
                key={fb.capability}
                style={{
                  ...S.row,
                  background: isFlashing
                    ? "rgba(74, 106, 255, 0.12)"
                    : hoveredRoomId === fb.roomId
                    ? "rgba(255,255,255,0.03)"
                    : "transparent",
                }}
                onMouseEnter={() => handleRowEnter(fb.roomId)}
                onMouseLeave={() => handleRowLeave(fb.roomId)}
              >
                {/* Index */}
                <span style={{ flex: "0 0 16px", fontSize: "7px", color: "#333355" }}>
                  {idx + 1}
                </span>

                {/* Capability name */}
                <span
                  style={{
                    flex: 1,
                    fontSize: "9px",
                    color: "#7777aa",
                    fontFamily: "inherit",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={fb.reason}
                >
                  {fb.capability}
                </span>

                {/* Room selector */}
                <div style={{ flex: "0 0 120px", display: "flex", justifyContent: "flex-end" }}>
                  {isEditing ? (
                    <RoomSelect
                      value={fb.roomId}
                      onChange={(v) => handleCapabilityChange(fb.capability, v)}
                      onBlur={() => setEditingKey(null)}
                    />
                  ) : (
                    <RoomBadge
                      roomId={fb.roomId}
                      onClick={() => setEditingKey(key)}
                    />
                  )}
                </div>

                {/* Up/down reorder arrows */}
                <div
                  style={{
                    flex: "0 0 52px",
                    display: "flex",
                    gap: 2,
                    justifyContent: "flex-end",
                    alignItems: "center",
                  }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCapabilityUp(idx); }}
                    disabled={idx === 0}
                    style={{
                      ...S.microBtn,
                      opacity: idx === 0 ? 0.2 : 0.7,
                    }}
                    title="Move up (higher priority)"
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCapabilityDown(idx); }}
                    disabled={idx === total - 1}
                    style={{
                      ...S.microBtn,
                      opacity: idx === total - 1 ? 0.2 : 0.7,
                    }}
                    title="Move down (lower priority)"
                  >
                    ↓
                  </button>
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveCapability(fb.capability); }}
                  style={{
                    ...S.microBtn,
                    flex: "0 0 20px",
                    color: "#ff4444",
                    opacity: 0.5,
                  }}
                  title={`Remove '${fb.capability}' capability fallback`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        {/* Add new capability form */}
        <AddCapabilityForm />

        <div style={{ marginTop: 6, fontSize: "8px", color: "#444466", fontStyle: "italic" }}>
          {total} capability fallbacks · ↑↓ reorder priority · ✕ remove · click room to reassign
        </div>
      </div>
    );
  }

  function renderSpecialsTab() {
    const specials = Object.entries(config.special);
    return (
      <div>
        {/* Special entity assignments */}
        <div style={S.colHeader}>
          <span style={{ flex: 1 }}>ENTITY</span>
          <span style={{ flex: "0 0 120px", textAlign: "right" }}>TARGET ROOM</span>
          <span style={{ flex: "0 0 20px" }}></span>
        </div>
        <div style={{ maxHeight: 180, overflowY: "auto" }}>
          {specials.map(([entityId, assignment]) => {
            const key = `special-${entityId}`;
            const isEditing = editingKey === key;
            const isFlashing = flashKeys.has(key);

            return (
              <div
                key={entityId}
                style={{
                  ...S.row,
                  background: isFlashing
                    ? "rgba(74, 106, 255, 0.12)"
                    : hoveredRoomId === assignment.roomId
                    ? "rgba(255,255,255,0.03)"
                    : "transparent",
                }}
                onMouseEnter={() => handleRowEnter(assignment.roomId)}
                onMouseLeave={() => handleRowLeave(assignment.roomId)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "9px", color: "#9999bb", fontWeight: 700 }}>
                    {entityId}
                  </div>
                  <div
                    style={{
                      fontSize: "8px",
                      color: "#444466",
                      fontStyle: "italic",
                      marginTop: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {assignment.reason}
                  </div>
                </div>

                <div style={{ flex: "0 0 120px", display: "flex", justifyContent: "flex-end" }}>
                  {isEditing ? (
                    <RoomSelect
                      value={assignment.roomId}
                      onChange={(v) => handleSpecialChange(entityId, v)}
                      onBlur={() => setEditingKey(null)}
                    />
                  ) : (
                    <RoomBadge
                      roomId={assignment.roomId}
                      onClick={() => setEditingKey(key)}
                    />
                  )}
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveSpecial(entityId); }}
                  style={{
                    ...S.microBtn,
                    flex: "0 0 20px",
                    color: "#ff4444",
                    opacity: 0.5,
                  }}
                  title={`Remove '${entityId}' special assignment`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        {/* Add special entity form */}
        <AddSpecialForm />

        {/* Fallback room section */}
        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: "1px solid #1a1a2e",
          }}
        >
          <div style={S.colHeader}>
            <span>GLOBAL FALLBACK</span>
            <span style={{ color: "#333355" }}>unmatched agents</span>
          </div>
          <div
            style={{
              ...S.row,
              background: flashKeys.has("fallback")
                ? "rgba(74, 106, 255, 0.12)"
                : hoveredRoomId === config.fallbackRoom
                ? "rgba(255,255,255,0.03)"
                : "transparent",
            }}
            onMouseEnter={() => handleRowEnter(config.fallbackRoom)}
            onMouseLeave={() => handleRowLeave(config.fallbackRoom)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "8px", color: "#555577", fontStyle: "italic" }}>
                {config.fallbackReason}
              </div>
            </div>
            <div style={{ flex: "0 0 120px", display: "flex", justifyContent: "flex-end" }}>
              {editingKey === "fallback" ? (
                <RoomSelect
                  value={config.fallbackRoom}
                  onChange={handleFallbackChange}
                  onBlur={() => setEditingKey(null)}
                />
              ) : (
                <RoomBadge
                  roomId={config.fallbackRoom}
                  onClick={() => setEditingKey("fallback")}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderRoomsTab() {
    return (
      <div>
        <div style={S.colHeader}>
          <span style={{ flex: "0 0 24px" }}>TYPE</span>
          <span style={{ flex: 1 }}>ROOM LABEL</span>
          <span style={{ flex: "0 0 36px", textAlign: "center" }}>FLR</span>
          <span style={{ flex: "0 0 120px", textAlign: "right" }}>PARENT ROOM</span>
        </div>
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {rooms.map((room) => {
            const isEditingLabel  = editingLabelRoomId === room.roomId;
            const isEditingParent = editingParentRoomId === room.roomId;
            const isFlashing      = flashKeys.has(`label-${room.roomId}`) || flashKeys.has(`parent-${room.roomId}`);
            const typeIcon        = ROOM_TYPE_ICONS[room.roomType] ?? "?";
            // Grab parentRoomId from room — optional field we attached
            const parentId = (room as typeof room & { parentRoomId?: string | null }).parentRoomId ?? null;
            const parentRoom = parentId ? getRoomById(parentId) : null;

            return (
              <div
                key={room.roomId}
                style={{
                  ...S.row,
                  background: isFlashing
                    ? "rgba(74, 106, 255, 0.12)"
                    : hoveredRoomId === room.roomId
                    ? "rgba(255,255,255,0.03)"
                    : "transparent",
                  alignItems: "center",
                }}
                onMouseEnter={() => handleRowEnter(room.roomId)}
                onMouseLeave={() => handleRowLeave(room.roomId)}
              >
                {/* Room type icon */}
                <span
                  style={{
                    flex: "0 0 24px",
                    fontSize: "10px",
                    color: room.colorAccent,
                    textAlign: "center",
                  }}
                  title={room.roomType}
                >
                  {typeIcon}
                </span>

                {/* Room label */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditingLabel ? (
                    <input
                      autoFocus
                      value={editingLabelValue}
                      onChange={(e) => setEditingLabelValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCommitLabelEdit();
                        if (e.key === "Escape") handleCancelLabelEdit();
                      }}
                      onBlur={handleCommitLabelEdit}
                      style={{
                        ...S.addInput,
                        width: "100%",
                        fontSize: "9px",
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => handleStartLabelEdit(room.roomId, room.name)}
                      style={S.labelEditBtn}
                      title={`Room ID: ${room.roomId} — click to rename`}
                    >
                      {room.name}
                      <span style={{ marginLeft: 4, fontSize: "7px", opacity: 0.4 }}>✎</span>
                    </button>
                  )}
                  <div style={{ fontSize: "7px", color: "#2a2a44", marginTop: 1 }}>
                    {room.roomId}
                  </div>
                </div>

                {/* Floor indicator */}
                <span
                  style={{
                    flex: "0 0 36px",
                    fontSize: "9px",
                    color: "#555577",
                    textAlign: "center",
                  }}
                >
                  F{room.floor}
                </span>

                {/* Parent room selector */}
                <div style={{ flex: "0 0 120px", display: "flex", justifyContent: "flex-end" }}>
                  {isEditingParent ? (
                    <RoomSelect
                      value={parentId ?? "__none__"}
                      onChange={(v) => handleParentChange(room.roomId, v)}
                      onBlur={() => setEditingParentRoomId(null)}
                      includeNone
                      noneLabel="— no parent —"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingParentRoomId(room.roomId)}
                      style={{
                        ...S.roomTag,
                        borderColor: parentRoom?.colorAccent ?? "#2a2a44",
                        color: parentRoom?.colorAccent ?? "#2a2a44",
                        fontSize: "7px",
                      }}
                      title={
                        parentRoom
                          ? `Parent: ${parentRoom.name} — click to change`
                          : "No parent — click to set"
                      }
                    >
                      {parentRoom?.name ?? "none"}
                      <span style={{ marginLeft: 3, opacity: 0.7, fontSize: "7px" }}>▾</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 6, fontSize: "8px", color: "#444466", fontStyle: "italic" }}>
          {rooms.length} rooms · click label ✎ to rename · set parent to build hierarchy
        </div>
      </div>
    );
  }

  // ── Agents tab — per-agent runtime room assignment ─────────────

  function renderAgentsTab() {
    const agentList = Object.values(agents);
    const overrideCount = Object.keys(runtimeOverrides).length;

    return (
      <div>
        {/* Active overrides banner */}
        {overrideCount > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 8px",
              marginBottom: 8,
              background: "rgba(255, 167, 38, 0.08)",
              border: "1px solid #5a3a00",
              borderRadius: 4,
            }}
          >
            <span style={{ fontSize: "8px", color: "#FFA726", letterSpacing: "0.05em" }}>
              ⚑ {overrideCount} runtime override{overrideCount !== 1 ? "s" : ""} active (volatile — session only)
            </span>
            <button
              onClick={handleClearAllOverrides}
              style={{
                ...S.microBtn,
                fontSize: "8px",
                color: "#FFA726",
                borderColor: "#5a3a00",
                padding: "2px 6px",
                background: "rgba(255,167,38,0.1)",
              }}
              title="Clear all runtime overrides and return agents to configured rooms"
            >
              ✕ CLEAR ALL
            </button>
          </div>
        )}

        {/* Column headers */}
        <div style={S.colHeader}>
          <span style={{ flex: "0 0 100px" }}>AGENT</span>
          <span style={{ flex: "0 0 60px", textAlign: "center" }}>STATUS</span>
          <span style={{ flex: 1, textAlign: "right", paddingRight: 4 }}>CURRENT ROOM</span>
          <span style={{ flex: "0 0 24px" }}></span>
        </div>

        {/* Agent list */}
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {agentList.length === 0 && (
            <div style={{ fontSize: "9px", color: "#333355", padding: "8px 0", fontStyle: "italic" }}>
              No agents registered
            </div>
          )}
          {agentList.map((agentState) => {
            const agentId    = agentState.def.agentId;
            const override   = runtimeOverrides[agentId];
            const key        = `override-${agentId}`;
            const isEditing  = editingOverrideKey === key;
            const isFlashing = flashKeys.has(key);
            const roleColor  = ROLE_COLORS[agentState.def.role] ?? "#7777aa";
            const roleIcon   = ROLE_ICONS[agentState.def.role] ?? "?";

            return (
              <div
                key={agentId}
                style={{
                  ...S.row,
                  background: isFlashing
                    ? "rgba(255,167,38,0.08)"
                    : override
                    ? "rgba(255,167,38,0.04)"
                    : hoveredRoomId === agentState.roomId
                    ? "rgba(255,255,255,0.03)"
                    : "transparent",
                  alignItems: "center",
                  borderLeft: override ? "2px solid #FFA726" : "2px solid transparent",
                  paddingLeft: 4,
                }}
                onMouseEnter={() => handleRowEnter(agentState.roomId)}
                onMouseLeave={() => handleRowLeave(agentState.roomId)}
              >
                {/* Agent identity */}
                <div
                  style={{
                    flex: "0 0 100px",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <span style={{ color: roleColor, fontSize: "10px", flexShrink: 0 }}>
                    {roleIcon}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "9px",
                        color: "#aaaacc",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={`${agentState.def.name} (${agentId})`}
                    >
                      {agentState.def.name}
                    </div>
                    <div style={{ fontSize: "7px", color: roleColor, opacity: 0.7 }}>
                      {agentState.def.role}
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div
                  style={{
                    flex: "0 0 60px",
                    textAlign: "center",
                    fontSize: "7px",
                    color:
                      agentState.status === "active"     ? "#66BB6A"
                    : agentState.status === "idle"       ? "#42A5F5"
                    : agentState.status === "busy"       ? "#FFA726"
                    : agentState.status === "error"      ? "#EF5350"
                    : agentState.status === "terminated" ? "#555577"
                    : "#333355",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {agentState.status}
                </div>

                {/* Current room (with override indicator) */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {override && (
                    <span
                      style={{
                        fontSize: "7px",
                        color: "#FFA726",
                        background: "rgba(255,167,38,0.1)",
                        border: "1px solid #5a3a00",
                        borderRadius: 8,
                        padding: "1px 4px",
                        flexShrink: 0,
                      }}
                      title={`Override active: ${override.reason}\nSource: ${override.source}`}
                    >
                      ⚑ override
                    </span>
                  )}
                  {isEditing ? (
                    <select
                      autoFocus
                      value={agentState.roomId}
                      onChange={(e) => handleSetOverride(agentId, e.target.value)}
                      onBlur={() => setEditingOverrideKey(null)}
                      style={{ ...S.select, flex: "0 0 120px" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rooms.map((room) => (
                        <option key={room.roomId} value={room.roomId}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <RoomBadge
                      roomId={agentState.roomId}
                      onClick={() => setEditingOverrideKey(key)}
                    />
                  )}
                </div>

                {/* Clear override button (only shown when override is active) */}
                <div style={{ flex: "0 0 24px", display: "flex", justifyContent: "center" }}>
                  {override ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleClearOverride(agentId); }}
                      style={{
                        ...S.microBtn,
                        color: "#FFA726",
                        opacity: 0.7,
                      }}
                      title={`Clear override: revert ${agentId} to configured room`}
                    >
                      ↺
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 6, fontSize: "8px", color: "#444466", fontStyle: "italic" }}>
          {agentList.length} agents · click room badge to override · ↺ to revert · overrides are session-only
        </div>
      </div>
    );
  }

  // ── Recent changes log (compact) ──────────────────────────────────

  function renderChangesLog() {
    if (events.length === 0) return null;
    const recent = events.slice(-5).reverse();
    return (
      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: "1px solid #1a1a2e",
        }}
      >
        <div
          style={{
            fontSize: "7px",
            color: "#333355",
            letterSpacing: "0.1em",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          RECENT CHANGES
        </div>
        {recent.map((evt) => (
          <div
            key={evt.id}
            style={{
              fontSize: "8px",
              color: "#444466",
              display: "flex",
              gap: 6,
              marginBottom: 2,
            }}
          >
            <span style={{ color: "#333355", flexShrink: 0 }}>
              {new Date(evt.ts).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            <span style={{ color: "#4a6aff", flexShrink: 0 }}>
              {evt.type.replace("mapping.", "")}
            </span>
            <span style={{ color: "#555577", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {typeof evt.payload.reason === "string"
                ? evt.payload.reason
                : JSON.stringify(evt.payload).slice(0, 60)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div style={S.backdrop}>
      <div style={S.panel}>
        {/* ── Header ── */}
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#4a6aff", fontSize: "14px" }}>◎</span>
            <span style={S.title}>ROOM MAPPING EDITOR</span>
            {events.length > 0 && (
              <span
                style={{
                  fontSize: "8px",
                  background: "rgba(74, 106, 255, 0.15)",
                  border: "1px solid #4a6aff",
                  borderRadius: 10,
                  padding: "1px 6px",
                  color: "#aaccff",
                }}
              >
                {events.length} change{events.length !== 1 ? "s" : ""}
              </span>
            )}
            {persistenceSource === "storage" && (
              <span
                style={{
                  fontSize: "8px",
                  background: "rgba(102, 187, 106, 0.12)",
                  border: "1px solid #2e7d32",
                  borderRadius: 10,
                  padding: "1px 6px",
                  color: "#66bb6a",
                  letterSpacing: "0.05em",
                }}
                title={`Loaded from localStorage (key: ${STORAGE_KEY})`}
              >
                💾 RESTORED
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button
              onClick={handleReset}
              style={{
                ...S.btn,
                color: "#ff6666",
                borderColor: "#552222",
                fontSize: "8px",
              }}
              title="Reset all mappings to defaults, restore agent positions, and clear saved config"
            >
              ↺ RESET
            </button>
            <button
              onClick={closePanel}
              style={S.btn}
              title="Close panel"
            >
              ✕ CLOSE
            </button>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={S.tabBar}>
          {(["roles", "capabilities", "specials", "rooms", "agents"] as Tab[]).map((tab) => {
            const overrideCount = Object.keys(runtimeOverrides).length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  ...S.tabBtn,
                  ...(activeTab === tab ? S.tabBtnActive : {}),
                }}
              >
                {tab === "roles"
                  ? "◈ ROLES"
                  : tab === "capabilities"
                  ? "⬡ CAPS"
                  : tab === "specials"
                  ? "★ SPECIALS"
                  : tab === "rooms"
                  ? "⊞ ROOMS"
                  : overrideCount > 0
                  ? `⚑ AGENTS (${overrideCount})`
                  : "⚑ AGENTS"}
              </button>
            );
          })}
        </div>

        {/* ── Content area ── */}
        <div style={S.content}>
          {activeTab === "roles"        && renderRolesTab()}
          {activeTab === "capabilities" && renderCapabilitiesTab()}
          {activeTab === "specials"     && renderSpecialsTab()}
          {activeTab === "rooms"        && renderRoomsTab()}
          {activeTab === "agents"       && renderAgentsTab()}
        </div>

        {/* ── Recent changes log (for mapping events) ── */}
        {activeTab !== "rooms" && activeTab !== "agents" && renderChangesLog()}

        {/* ── Footer status ── */}
        <div style={S.footer}>
          <span style={{ color: "#333355" }}>
            {rooms.length} rooms ·{" "}
            {Object.keys(config.roleDefaults).length} roles ·{" "}
            {config.capabilityFallbacks.length} caps ·{" "}
            {Object.keys(config.special).length} specials
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {lastSavedAt ? (
              <span
                style={{ color: "#2e7d32", fontSize: "8px" }}
                title={`Last saved: ${lastSavedAt}`}
              >
                💾 {new Date(lastSavedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            ) : (
              <span style={{ color: "#333355", fontSize: "8px" }}>
                {persistenceSource === "defaults" ? "unsaved" : ""}
              </span>
            )}
            <span style={{ color: "#4a6aff", fontSize: "8px" }}>
              ↻ event-sourced
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  /** Semi-transparent backdrop — does NOT block clicks outside the panel */
  backdrop: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 50,
  },

  panel: {
    pointerEvents: "auto",
    background: "rgba(8, 8, 20, 0.94)",
    border: "1px solid #333355",
    borderRadius: 8,
    padding: "14px 16px",
    backdropFilter: "blur(12px)",
    width: 500,
    maxHeight: "82vh",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    color: "#8888aa",
    fontSize: "10px",
    boxShadow: "0 0 40px rgba(0,0,0,0.6), 0 0 60px rgba(74,106,255,0.06)",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: "1px solid #1a1a2e",
  },

  title: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#aaaacc",
    letterSpacing: "0.1em",
  },

  tabBar: {
    display: "flex",
    gap: 3,
    marginBottom: 10,
  },

  tabBtn: {
    flex: 1,
    padding: "5px 4px",
    fontSize: "8px",
    fontFamily: "inherit",
    background: "rgba(20, 20, 40, 0.7)",
    border: "1px solid #222244",
    borderRadius: 3,
    color: "#444466",
    cursor: "pointer",
    letterSpacing: "0.06em",
    transition: "all 0.15s ease",
    textAlign: "center" as const,
  },

  tabBtnActive: {
    background: "rgba(74, 106, 255, 0.15)",
    borderColor: "#4a6aff",
    color: "#aaccff",
  },

  content: {
    flex: 1,
    overflowY: "auto",
    minHeight: 0,
  },

  colHeader: {
    display: "flex",
    alignItems: "center",
    fontSize: "7px",
    color: "#2a2a44",
    fontWeight: 700,
    letterSpacing: "0.12em",
    marginBottom: 4,
    paddingBottom: 3,
    borderBottom: "1px solid #141428",
  },

  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 3px",
    borderRadius: 3,
    transition: "background 0.1s ease",
    marginBottom: 2,
  },

  roomTag: {
    padding: "2px 7px",
    fontSize: "8px",
    fontFamily: "inherit",
    background: "rgba(15, 15, 30, 0.8)",
    border: "1px solid currentColor",
    borderRadius: 3,
    cursor: "pointer",
    letterSpacing: "0.04em",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap" as const,
    display: "flex",
    alignItems: "center",
  },

  select: {
    padding: "2px 4px",
    fontSize: "9px",
    fontFamily: "inherit",
    background: "#0a0a18",
    border: "1px solid #4a6aff",
    borderRadius: 3,
    color: "#aaccff",
    cursor: "pointer",
    outline: "none",
    maxWidth: 150,
  },

  btn: {
    padding: "3px 8px",
    fontSize: "9px",
    fontFamily: "inherit",
    background: "rgba(20, 20, 40, 0.7)",
    border: "1px solid #333355",
    borderRadius: 3,
    color: "#7777aa",
    cursor: "pointer",
    letterSpacing: "0.05em",
    transition: "all 0.15s ease",
  },

  microBtn: {
    padding: "1px 4px",
    fontSize: "9px",
    fontFamily: "inherit",
    background: "transparent",
    border: "1px solid #222244",
    borderRadius: 2,
    color: "#555577",
    cursor: "pointer",
    lineHeight: 1,
    transition: "opacity 0.1s ease",
  },

  addBtn: {
    padding: "3px 8px",
    fontSize: "8px",
    fontFamily: "inherit",
    background: "rgba(20, 20, 40, 0.7)",
    border: "1px solid #333355",
    borderRadius: 3,
    color: "#555577",
    cursor: "pointer",
    letterSpacing: "0.05em",
    transition: "all 0.15s ease",
  },

  addForm: {
    marginTop: 8,
    padding: "8px 10px",
    background: "rgba(74, 106, 255, 0.05)",
    border: "1px solid #2a2a4a",
    borderRadius: 4,
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },

  addFormTitle: {
    fontSize: "7px",
    color: "#4a6aff",
    fontWeight: 700,
    letterSpacing: "0.1em",
  },

  addFormRow: {
    display: "flex",
    gap: 6,
    alignItems: "center",
  },

  addInput: {
    flex: 1,
    padding: "3px 6px",
    fontSize: "9px",
    fontFamily: "inherit",
    background: "#0a0a18",
    border: "1px solid #333355",
    borderRadius: 3,
    color: "#aaccff",
    outline: "none",
  },

  labelEditBtn: {
    padding: "1px 4px",
    fontSize: "9px",
    fontFamily: "inherit",
    background: "transparent",
    border: "none",
    borderBottom: "1px dashed #333355",
    color: "#aaaacc",
    cursor: "text",
    textAlign: "left" as const,
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
  },

  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 6,
    borderTop: "1px solid #1a1a2e",
    fontSize: "8px",
    color: "#333355",
  },
};
