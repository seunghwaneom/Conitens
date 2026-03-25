/**
 * TopologyPanel.tsx — HUD control panel for the topology editor.
 *
 * Sub-AC 7d: Agent wiring & topology editor.
 *
 * Provides:
 *   - Edit mode toggle button (also accessible via keyboard shortcut T)
 *   - Link-type selector (direct / delegated / broadcast / subscribe)
 *   - Link inventory list (all current links with sever controls)
 *   - Backend sync status indicator
 *   - Keyboard shortcut cheatsheet
 *
 * Design principles:
 *   - Extracted into its own file (NOT added to HUD.tsx) per coordinator warning
 *   - Mounts as a floating panel in the HUD layer, z-index below task panels
 *   - All state changes pass through topology-store — no local mutation
 *   - Dark command-center theme, JetBrains Mono font family
 *
 * Position: bottom-right of screen, above task-mapping HUD
 */

import { useState, useMemo } from "react";
import {
  useTopologyStore,
  LINK_TYPE_COLOR,
  LINK_TYPE_LABEL,
  type TopologyLinkType,
} from "../store/topology-store.js";
import { useAgentStore } from "../store/agent-store.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const LINK_TYPES: TopologyLinkType[] = ["direct", "delegated", "broadcast", "subscribe"];

const PANEL_STYLE: React.CSSProperties = {
  position:       "absolute",
  bottom:         "90px",
  right:          "12px",
  width:          "240px",
  background:     "rgba(8,8,18,0.92)",
  border:         "1px solid #333355",
  borderRadius:   "4px",
  fontFamily:     "'JetBrains Mono', monospace",
  fontSize:       "11px",
  color:          "#8888cc",
  zIndex:         8800,
  backdropFilter: "blur(6px)",
  boxShadow:      "0 4px 16px rgba(0,0,0,0.6)",
  overflow:       "hidden",
};

// ── TopologyPanel ──────────────────────────────────────────────────────────────

export function TopologyPanel() {
  const editMode        = useTopologyStore((s) => s.editMode);
  const setEditMode     = useTopologyStore((s) => s.setEditMode);
  const defaultLinkType = useTopologyStore((s) => s.defaultLinkType);
  const setDefaultLinkType = useTopologyStore((s) => s.setDefaultLinkType);
  const links           = useTopologyStore((s) => s.links);
  const removeLink      = useTopologyStore((s) => s.removeLink);
  const selectLink      = useTopologyStore((s) => s.selectLink);
  const selectedLinkId  = useTopologyStore((s) => s.selectedLinkId);
  const syncStatus      = useTopologyStore((s) => s.syncStatus);
  const agents          = useAgentStore((s) => s.agents);

  const [expanded, setExpanded] = useState(true);

  const linkList = useMemo(() => Object.values(links), [links]);
  const syncErrors = useMemo(
    () => Object.values(syncStatus).filter((s) => s === "error").length,
    [syncStatus],
  );

  const pendingCount = useMemo(
    () => Object.values(syncStatus).filter((s) => s === "pending").length,
    [syncStatus],
  );

  // Badge colour for the panel header button
  const headerAccent = editMode ? "#FF9100" : "#333355";

  return (
    <div style={PANEL_STYLE}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display:       "flex",
          alignItems:    "center",
          justifyContent: "space-between",
          padding:       "6px 10px",
          borderBottom:  expanded ? "1px solid #1a1a2e" : "none",
          cursor:        "pointer",
          background:    editMode ? "rgba(255,145,0,0.08)" : "transparent",
          transition:    "background 0.2s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Mode indicator dot */}
          <span
            style={{
              width:        7,
              height:       7,
              borderRadius: "50%",
              background:   headerAccent,
              flexShrink:   0,
              boxShadow:    editMode ? `0 0 6px ${headerAccent}` : "none",
              display:      "inline-block",
            }}
          />
          <span
            style={{
              fontWeight:    700,
              color:         editMode ? "#FF9100" : "#6666aa",
              letterSpacing: "0.10em",
              fontSize:      "9px",
              textTransform: "uppercase",
            }}
          >
            Topology
          </span>
          <span
            style={{
              fontSize:   "8px",
              color:      "#555577",
              marginLeft: 2,
            }}
          >
            {linkList.length} links
          </span>

          {/* Sync warning badges */}
          {syncErrors > 0 && (
            <span style={{ color: "#ff4444", fontSize: "8px" }} title="Sync errors">
              ⚠{syncErrors}
            </span>
          )}
          {pendingCount > 0 && (
            <span style={{ color: "#FF9100", fontSize: "8px" }} title="Pending sync">
              ⟳{pendingCount}
            </span>
          )}
        </div>

        <span style={{ color: "#444466", fontSize: "9px" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      {expanded && (
        <div style={{ padding: "8px 10px" }}>

          {/* Edit mode toggle */}
          <div style={{ marginBottom: 8 }}>
            <button
              onClick={() => setEditMode(!editMode)}
              style={{
                width:         "100%",
                padding:       "5px 8px",
                background:    editMode ? "rgba(255,145,0,0.18)" : "rgba(64,196,255,0.08)",
                border:        `1px solid ${editMode ? "#FF910088" : "#40C4FF44"}`,
                borderRadius:  "3px",
                color:         editMode ? "#FF9100" : "#40C4FF",
                fontFamily:    "'JetBrains Mono', monospace",
                fontSize:      "10px",
                fontWeight:    700,
                letterSpacing: "0.10em",
                cursor:        "pointer",
                textTransform: "uppercase",
                transition:    "all 0.15s",
              }}
            >
              {editMode ? "⬡ WIRING MODE ON" : "⬡ ENTER WIRING MODE"}
            </button>
            <div
              style={{
                fontSize:      "7px",
                color:         "#444466",
                marginTop:     3,
                letterSpacing: "0.05em",
                textAlign:     "center",
              }}
            >
              {editMode
                ? "Drag between agent ports to connect · T to exit"
                : "Keyboard: T to toggle · Delete to sever selected"}
            </div>
          </div>

          {/* Link type selector */}
          {editMode && (
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize:      "8px",
                  color:         "#555577",
                  letterSpacing: "0.10em",
                  marginBottom:  4,
                  textTransform: "uppercase",
                }}
              >
                Link Type
              </div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {LINK_TYPES.map((type) => {
                  const color = LINK_TYPE_COLOR[type];
                  const isSelected = type === defaultLinkType;
                  return (
                    <button
                      key={type}
                      onClick={() => setDefaultLinkType(type)}
                      style={{
                        padding:       "2px 6px",
                        background:    isSelected ? `${color}22` : "transparent",
                        border:        `1px solid ${isSelected ? color : color + "44"}`,
                        borderRadius:  "2px",
                        color:         isSelected ? color : color + "99",
                        fontFamily:    "'JetBrains Mono', monospace",
                        fontSize:      "8px",
                        fontWeight:    isSelected ? 700 : 400,
                        cursor:        "pointer",
                        letterSpacing: "0.06em",
                        transition:    "all 0.12s",
                      }}
                    >
                      {LINK_TYPE_LABEL[type]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Divider */}
          {linkList.length > 0 && (
            <div
              style={{
                borderTop:    "1px solid #1a1a2e",
                marginBottom: 6,
                paddingTop:   4,
                fontSize:     "8px",
                color:        "#444466",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Active Links
            </div>
          )}

          {/* Link list */}
          <div
            style={{
              maxHeight: "180px",
              overflowY: "auto",
              display:   "flex",
              flexDirection: "column",
              gap:       3,
            }}
          >
            {linkList.length === 0 && (
              <div
                style={{
                  fontSize:   "8px",
                  color:      "#333355",
                  textAlign:  "center",
                  padding:    "10px 0",
                  letterSpacing: "0.06em",
                }}
              >
                {editMode
                  ? "Drag between agent ports to create links"
                  : "No agent-to-agent links configured"}
              </div>
            )}

            {linkList.map((link) => {
              const typeColor  = LINK_TYPE_COLOR[link.linkType];
              const srcAgent   = agents[link.sourceAgentId];
              const tgtAgent   = agents[link.targetAgentId];
              const srcName    = srcAgent?.def.agentId ?? link.sourceAgentId;
              const tgtName    = tgtAgent?.def.agentId ?? link.targetAgentId;
              const isSelected = link.id === selectedLinkId;
              const ss         = syncStatus[link.id];

              return (
                <div
                  key={link.id}
                  onClick={() => selectLink(isSelected ? null : link.id)}
                  style={{
                    display:       "flex",
                    alignItems:    "center",
                    gap:           5,
                    padding:       "3px 5px",
                    background:    isSelected ? `${typeColor}14` : "rgba(255,255,255,0.02)",
                    border:        `1px solid ${isSelected ? typeColor + "66" : "#1a1a2e"}`,
                    borderRadius:  "2px",
                    cursor:        "pointer",
                    transition:    "all 0.12s",
                  }}
                >
                  {/* Type dot */}
                  <span
                    style={{
                      width:        5,
                      height:       5,
                      borderRadius: "50%",
                      background:   typeColor,
                      flexShrink:   0,
                      display:      "inline-block",
                    }}
                  />

                  {/* Source → Target */}
                  <span
                    style={{
                      flex:          1,
                      fontSize:      "8px",
                      color:         isSelected ? "#ccccee" : "#7777aa",
                      overflow:      "hidden",
                      textOverflow:  "ellipsis",
                      whiteSpace:    "nowrap",
                      letterSpacing: "0.04em",
                    }}
                    title={`${srcName} → ${tgtName}`}
                  >
                    {srcName.length > 8 ? `${srcName.slice(0, 8)}…` : srcName}
                    <span style={{ color: typeColor, margin: "0 2px" }}>→</span>
                    {tgtName.length > 8 ? `${tgtName.slice(0, 8)}…` : tgtName}
                  </span>

                  {/* Label */}
                  {link.label && (
                    <span
                      style={{
                        fontSize:     "7px",
                        color:        "#555577",
                        fontStyle:    "italic",
                        flexShrink:   0,
                        maxWidth:     40,
                        overflow:     "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace:   "nowrap",
                      }}
                    >
                      {link.label}
                    </span>
                  )}

                  {/* Sync status */}
                  {ss === "pending" && (
                    <span style={{ color: "#FF9100", fontSize: "8px", flexShrink: 0 }}>⟳</span>
                  )}
                  {ss === "error" && (
                    <span style={{ color: "#ff4444", fontSize: "8px", flexShrink: 0 }}>⚠</span>
                  )}

                  {/* Sever button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLink(link.id);
                    }}
                    title="Sever link"
                    style={{
                      background:   "transparent",
                      border:       "none",
                      color:        "#444466",
                      cursor:       "pointer",
                      fontSize:     "9px",
                      padding:      "0 2px",
                      lineHeight:   1,
                      flexShrink:   0,
                      transition:   "color 0.12s",
                    }}
                    onMouseOver={(e) => { (e.target as HTMLButtonElement).style.color = "#ff7777"; }}
                    onMouseOut={(e)  => { (e.target as HTMLButtonElement).style.color = "#444466"; }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Keyboard shortcut reference */}
          <div
            style={{
              borderTop:     "1px solid #1a1a2e",
              marginTop:     7,
              paddingTop:    5,
              fontSize:      "7px",
              color:         "#333355",
              letterSpacing: "0.04em",
              lineHeight:    1.6,
            }}
          >
            <span style={{ color: "#444466" }}>[T]</span> toggle wiring mode&nbsp;·&nbsp;
            <span style={{ color: "#444466" }}>[Del]</span> sever selected&nbsp;·&nbsp;
            <span style={{ color: "#444466" }}>[Esc]</span> cancel
          </div>
        </div>
      )}
    </div>
  );
}
