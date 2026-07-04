/**
 * status-colors — shared agent-status color helper for HUD components.
 */

/** Agent status color helper */
export function agentStatusColor(status: string): string {
  switch (status) {
    case "inactive":   return "#555566";
    case "idle":       return "#888899";
    case "active":     return "#00ff88";
    case "busy":       return "#ffaa00";
    case "error":      return "#ff4444";
    case "terminated": return "#333344";
    default:           return "#555577";
  }
}
