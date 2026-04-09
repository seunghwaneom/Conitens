import React from "react";
import stageStyles from "../office-stage.module.css";
import styles from "./HandoffLink.module.css";

function toPercent(value: number) {
  return `${value}%`;
}

export function HandoffLink({
  fromLeft,
  fromTop,
  toLeft,
  toTop,
  tone,
}: {
  fromLeft: number;
  fromTop: number;
  toLeft: number;
  toTop: number;
  tone: "danger" | "warning" | "info" | "neutral";
}) {
  const elbowLeft = (fromLeft + toLeft) / 2;
  const horizontalStart = Math.min(fromLeft, elbowLeft);
  const horizontalWidth = Math.abs(elbowLeft - fromLeft);
  const verticalTop = Math.min(fromTop, toTop);
  const verticalHeight = Math.abs(toTop - fromTop);
  const horizontalEndStart = Math.min(elbowLeft, toLeft);
  const horizontalEndWidth = Math.abs(toLeft - elbowLeft);

  return (
    <>
      <span
        className={[stageStyles["office-handoff-segment"], stageStyles[`tone-${tone}`], styles.segmentHorizontal].join(" ")}
        style={{
          left: toPercent(horizontalStart),
          top: toPercent(fromTop),
          width: toPercent(horizontalWidth),
        }}
      />
      <span
        className={[stageStyles["office-handoff-segment"], stageStyles[`tone-${tone}`], styles.segmentVertical].join(" ")}
        style={{
          left: toPercent(elbowLeft),
          top: toPercent(verticalTop),
          height: toPercent(verticalHeight),
        }}
      />
      <span
        className={[stageStyles["office-handoff-segment"], stageStyles[`tone-${tone}`], styles.segmentHorizontal].join(" ")}
        style={{
          left: toPercent(horizontalEndStart),
          top: toPercent(toTop),
          width: toPercent(horizontalEndWidth),
        }}
      />
      <span
        className={[stageStyles["office-handoff-node"], stageStyles[`tone-${tone}`]].join(" ")}
        style={{ left: toPercent(fromLeft), top: toPercent(fromTop) }}
      />
      <span
        className={[stageStyles["office-handoff-node"], stageStyles[`tone-${tone}`]].join(" ")}
        style={{ left: toPercent(toLeft), top: toPercent(toTop) }}
      />
    </>
  );
}
