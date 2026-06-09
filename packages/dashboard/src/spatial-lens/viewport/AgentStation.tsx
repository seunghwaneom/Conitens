import type { CSSProperties } from "react";
import type { OfficeResidentPresence } from "../../office-presence-model.js";
import type { AgentStationSpec, AgentVisualRole } from "./agentStations.js";
import type { AgentActivityCue, AgentVisualState } from "./agentVisualState.js";
import { AgentActivityCue as AgentActivityCueView } from "./AgentActivityCue.js";
import { AgentSpeechBubble } from "./AgentSpeechBubble.js";
import { AgentSprite } from "./AgentSprite.js";
import styles from "../styles/spatial-lens.module.css";

export function AgentStation({
  resident,
  station,
  role,
  state,
  cue,
  selected,
  roomLabel,
  style,
  onSelectResident,
}: {
  resident: OfficeResidentPresence;
  station: AgentStationSpec;
  role: AgentVisualRole;
  state: AgentVisualState;
  cue: AgentActivityCue;
  selected: boolean;
  roomLabel: string;
  style: CSSProperties;
  onSelectResident: (agentId: string) => void;
}) {
  return (
    <button
      type="button"
      className={[
        styles["agent-station"],
        selected ? styles.selected : "",
      ].filter(Boolean).join(" ")}
      data-agent-id={resident.agentId}
      data-agent-role={role}
      data-agent-visual-state={state}
      data-agent-cue={cue.kind}
      data-agent-room-id={station.roomId}
      data-agent-station-id={station.id}
      data-agent-selected={selected ? "true" : "false"}
      aria-label={`${resident.agentId}, ${cue.label}, ${roomLabel}`}
      style={style}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelectResident(resident.agentId);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        onSelectResident(resident.agentId);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelectResident(resident.agentId);
      }}
    >
      <span className={styles["agent-ground-shadow"]} aria-hidden="true" />
      <AgentSprite role={role} state={state} selected={selected} />
      <AgentActivityCueView cue={cue} />
      <AgentSpeechBubble cue={cue} />
    </button>
  );
}
