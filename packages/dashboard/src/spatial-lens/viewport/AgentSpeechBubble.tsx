import type { AgentActivityCue } from "./agentVisualState.js";
import styles from "../styles/spatial-lens.module.css";

export function AgentSpeechBubble({
  cue,
}: {
  cue: AgentActivityCue;
}) {
  const text = getBubbleText(cue.kind);
  if (!text) return null;

  return (
    <span
      className={styles["agent-speech-bubble"]}
      data-cue-tone={cue.tone}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

function getBubbleText(kind: AgentActivityCue["kind"]): string | null {
  if (kind === "blocked") return "!";
  if (kind === "review") return "rev";
  if (kind === "assigned") return "next";
  if (kind === "handoff_receive") return "in";
  if (kind === "handoff_send") return "out";
  return null;
}
