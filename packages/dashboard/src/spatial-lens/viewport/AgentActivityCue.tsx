import type { AgentActivityCue as AgentActivityCueModel } from "./agentVisualState.js";
import styles from "../styles/spatial-lens.module.css";

export function AgentActivityCue({
  cue,
}: {
  cue: AgentActivityCueModel;
}) {
  return (
    <span
      className={styles["agent-activity-cue"]}
      data-agent-cue={cue.kind}
      data-cue-tone={cue.tone}
      title={cue.label}
      aria-hidden="true"
    >
      <span className={styles["agent-activity-cue-pixel"]} />
    </span>
  );
}
