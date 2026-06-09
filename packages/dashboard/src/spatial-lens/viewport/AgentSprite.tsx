import { GeneratedSprite } from "../assets/GeneratedSprite.js";
import styles from "../styles/spatial-lens.module.css";
import type { AgentVisualRole } from "./agentStations.js";
import type { AgentVisualState } from "./agentVisualState.js";

export function AgentSprite({
  role,
  state,
  selected = false,
}: {
  role: AgentVisualRole;
  state: AgentVisualState;
  selected?: boolean;
}) {
  return (
    <span
      className={styles["agent-sprite-frame"]}
      data-agent-role={role}
      data-agent-visual-state={state}
      data-selected={selected ? "true" : "false"}
      aria-hidden="true"
    >
      <GeneratedSprite
        sprite={resolveAgentSpriteId(role, state)}
        className={`${styles["agent-sprite"]} ${styles["pixel-generated-sprite"]}`}
      />
    </span>
  );
}

export function resolveAgentSpriteId(
  role: AgentVisualRole,
  state: AgentVisualState,
): string {
  if (role === "architect") {
    if (state === "reviewing") return "character.architectReviewing";
    if (state === "idle" || state === "waiting_for_input") return "character.architectIdle";
    return "character.architectWorking";
  }
  if (role === "sentinel" || role === "reviewer") {
    if (state === "reviewing" || state === "handoff_receiving") {
      return "character.sentinelReviewing";
    }
    if (state === "idle" || state === "waiting_for_input") return "character.sentinelIdle";
    return "character.sentinelWorking";
  }
  if (role === "owner") {
    if (state === "working" || state === "handoff_sending") return "character.ownerWorking";
    return "character.ownerIdle";
  }
  if (state === "reviewing") return "character.workerReviewing";
  if (state === "working" || state === "handoff_sending") return "character.workerWorking";
  return "character.workerIdle";
}
