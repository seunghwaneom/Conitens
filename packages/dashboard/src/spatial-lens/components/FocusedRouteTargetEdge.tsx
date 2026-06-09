import type { OfficeHandoffSnapshot } from "../../dashboard-model.js";
import type { OfficeRoomPresence } from "../../office-presence-model.js";
import type { TaskState } from "../../store/event-store.js";
import { GeneratedSprite } from "../assets/GeneratedSprite.js";
import styles from "../styles/spatial-lens.module.css";
import { AgentSprite } from "../viewport/AgentSprite.js";
import { GeneratedRoomBackdropLayer } from "../viewport/GeneratedRoomBackdropLayer.js";
import {
  chooseAgentActivityCue,
  mapAgentToVisualRole,
  mapAgentToVisualState,
} from "../viewport/agentVisualState.js";

const FOCUSED_TARGET_ROUTE_STEPS = ["one", "two", "three"] as const;

export function FocusedRouteTargetEdge({
  rooms,
  tasks = [],
  handoffs = [],
  targetRoomId,
  selectedResidentId,
  onSelectResident,
}: {
  rooms: readonly OfficeRoomPresence[];
  tasks?: readonly TaskState[];
  handoffs?: readonly OfficeHandoffSnapshot[];
  targetRoomId: string | null;
  selectedResidentId: string | null;
  onSelectResident: (agentId: string) => void;
}) {
  const targetRoom = rooms.find((room) => room.roomId === targetRoomId);
  if (!targetRoom) return null;

  const targetResident =
    targetRoom.visibleResidents.find((resident) => {
      const role = mapAgentToVisualRole(resident);
      return role === "sentinel" || role === "reviewer";
    }) ??
    targetRoom.visibleResidents[0] ??
    null;
  const residentVisual = targetResident
    ? {
        role: mapAgentToVisualRole(targetResident),
        state: mapAgentToVisualState(targetResident, tasks, handoffs),
        cue: chooseAgentActivityCue(targetResident, tasks, handoffs),
      }
    : {
        role: "sentinel" as const,
        state: "reviewing" as const,
        cue: null,
      };
  const isTargetResidentSelected =
    targetResident?.agentId === selectedResidentId;

  return (
    <div
      className={styles["focused-target-edge"]}
      data-focused-route-target-edge="true"
      data-edge-continuity="corridor-connected"
      data-target-room-id={targetRoom.roomId}
      data-status-tone={targetRoom.snapshot.tone}
      aria-label={`${targetRoom.label} receiving edge`}
    >
      <span className={styles["focused-target-corridor"]} aria-hidden="true">
        {FOCUSED_TARGET_ROUTE_STEPS.map((step) => (
          <span
            key={step}
            className={styles["focused-target-route-pixel"]}
            data-focused-target-route-pixel={step}
            data-route-step={step}
          />
        ))}
      </span>
      <span className={styles["focused-target-threshold"]} aria-hidden="true" />
      <div className={styles["focused-target-wall"]}>
        <span className={styles["focused-target-plaque"]}>{targetRoom.label}</span>
        <span className={styles["focused-target-status"]} aria-hidden="true" />
      </div>
      <div
        className={styles["focused-target-floor"]}
        data-focused-validation-checkpoint="true"
      >
        <GeneratedRoomBackdropLayer
          roomId={targetRoom.roomId}
          usage="target-edge"
        />
        <GeneratedSprite
          sprite="prop.checklistBoard"
          scale={2}
          className={`${styles["focused-target-board"]} ${styles["pixel-generated-sprite"]}`}
        />
        <GeneratedSprite
          sprite="prop.clipboardRack"
          scale={1}
          className={`${styles["focused-target-clipboard"]} ${styles["pixel-generated-sprite"]}`}
          data-focused-validation-prop="clipboard-rack"
        />
        <GeneratedSprite
          sprite="prop.routePort"
          scale={1}
          className={`${styles["focused-target-route-port"]} ${styles["pixel-generated-sprite"]}`}
          data-focused-validation-prop="route-port"
        />
        <GeneratedSprite
          sprite="prop.inboxTray"
          scale={2}
          className={`${styles["focused-target-inbox"]} ${styles["pixel-generated-sprite"]}`}
        />
        <GeneratedSprite
          sprite="furniture.stampDesk"
          scale={2}
          className={`${styles["focused-target-stamp-desk"]} ${styles["pixel-generated-sprite"]}`}
          data-focused-validation-prop="stamp-desk"
        />
        <GeneratedSprite
          sprite="prop.documentStack"
          scale={1}
          className={`${styles["focused-target-document-stack"]} ${styles["pixel-generated-sprite"]}`}
          data-focused-validation-prop="document-stack"
        />
        <GeneratedSprite
          sprite="prop.greenStatusLight"
          scale={1}
          className={`${styles["focused-target-light-green"]} ${styles["pixel-generated-sprite"]}`}
          data-focused-validation-prop="green-light"
        />
        <GeneratedSprite
          sprite="prop.redStatusLight"
          scale={1}
          className={`${styles["focused-target-light-red"]} ${styles["pixel-generated-sprite"]}`}
          data-focused-validation-prop="red-light"
        />
        <GeneratedSprite
          sprite="prop.packet"
          scale={2}
          className={`${styles["focused-target-packet"]} ${styles["pixel-generated-sprite"]}`}
          data-focused-target-packet="true"
        />
        {targetResident ? (
          <button
            type="button"
            className={styles["focused-target-agent"]}
            data-agent-id={targetResident.agentId}
            data-focused-target-agent={targetResident.agentId}
            data-agent-visual-state={residentVisual.state}
            data-agent-cue={residentVisual.cue?.kind ?? ""}
            data-agent-selected={isTargetResidentSelected ? "true" : "false"}
            aria-label={`${targetResident.agentId}, ${targetRoom.label}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelectResident(targetResident.agentId);
            }}
          >
            <AgentSprite
              role={residentVisual.role}
              state={residentVisual.state}
              selected={isTargetResidentSelected}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
