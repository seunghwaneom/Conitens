import React, { useId, useMemo } from "react";
import type { OfficeHandoffSnapshot } from "../dashboard-model.js";
import { OFFICE_STAGE_ROOMS } from "../office-stage-schema.js";
import stageStyles from "../office-ambient.module.css";

const ROOM_GRID_AREAS: Record<string, { col: number; row: number; rowSpan: number }> = {
  "ops-control":       { col: 0, row: 0, rowSpan: 1 },
  "impl-office":       { col: 0, row: 1, rowSpan: 2 },
  "project-main":      { col: 1, row: 0, rowSpan: 3 },
  "research-lab":      { col: 2, row: 0, rowSpan: 1 },
  "validation-office": { col: 2, row: 1, rowSpan: 1 },
  "review-office":     { col: 2, row: 2, rowSpan: 1 },
};

/**
 * Column weights as fractional proportions matching the CSS grid:
 *   grid-template-columns: 232px minmax(0, 1fr) 232px
 * At a typical ~750px stage width, the centre column ≈ 286px.
 * We use proportional weights so paths scale correctly at any width.
 */
const COL_WEIGHTS = [232, 286, 232];
const ROW_WEIGHTS = [164, 176, 164];
const TOTAL_W = COL_WEIGHTS[0] + COL_WEIGHTS[1] + COL_WEIGHTS[2];
const TOTAL_H = ROW_WEIGHTS[0] + ROW_WEIGHTS[1] + ROW_WEIGHTS[2];

function getRoomCenterPct(roomId: string): { x: number; y: number } | null {
  const grid = ROOM_GRID_AREAS[roomId];
  if (!grid) return null;
  const room = OFFICE_STAGE_ROOMS.find((r) => r.roomId === roomId);
  if (!room) return null;

  let xStart = 0;
  for (let c = 0; c < grid.col; c++) xStart += COL_WEIGHTS[c];
  let yStart = 0;
  for (let r = 0; r < grid.row; r++) yStart += ROW_WEIGHTS[r];

  const roomW = grid.col === 1
    ? TOTAL_W - COL_WEIGHTS[0] - COL_WEIGHTS[2]
    : COL_WEIGHTS[grid.col];
  let roomH = 0;
  for (let r = grid.row; r < grid.row + grid.rowSpan; r++) roomH += ROW_WEIGHTS[r];

  const anchorLeft = room.handoffAnchor.left / 100;
  const anchorTop = room.handoffAnchor.top / 100;

  const x = ((xStart + roomW * anchorLeft) / TOTAL_W) * 100;
  const y = ((yStart + roomH * anchorTop) / TOTAL_H) * 100;
  return { x, y };
}

export function HandoffOverlay({
  handoffs,
}: {
  handoffs: OfficeHandoffSnapshot[];
}) {
  const markerId = useId();
  const paths = useMemo(() => {
    return handoffs
      .map((handoff) => {
        const from = getRoomCenterPct(handoff.fromRoomId);
        const to = getRoomCenterPct(handoff.toRoomId);
        if (!from || !to) return null;
        const midX = (from.x + to.x) / 2;
        const midY = Math.min(from.y, to.y) - 8;
        return {
          id: handoff.id,
          d: `M ${from.x} ${from.y} Q ${midX} ${midY}, ${to.x} ${to.y}`,
          taskId: handoff.taskId,
        };
      })
      .filter(Boolean) as { id: string; d: string; taskId: string }[];
  }, [handoffs]);

  if (paths.length === 0) return null;

  return (
    <svg
      className={stageStyles["office-handoff-overlay"]}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="6"
          markerHeight="4"
          refX="5"
          refY="2"
          orient="auto"
        >
          <path d="M 0 0 L 6 2 L 0 4 Z" fill="rgba(80, 141, 212, 0.7)" />
        </marker>
      </defs>
      {paths.map((path) => (
        <g key={path.id}>
          <path
            d={path.d}
            fill="none"
            stroke="rgba(80, 141, 212, 0.15)"
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
          />
          <path
            className={stageStyles["office-handoff-path"]}
            d={path.d}
            fill="none"
            stroke="rgba(80, 141, 212, 0.55)"
            strokeWidth="0.4"
            /* stroke-dashoffset period must match sum: 2+2=4 → see handoff-march keyframe in office-stage.module.css */
            strokeDasharray="2 2"
            markerEnd={`url(#${markerId})`}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </svg>
  );
}
