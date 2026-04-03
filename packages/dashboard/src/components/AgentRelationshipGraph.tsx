import React from "react";
import type { AgentProfile } from "../agent-fleet-model.js";

interface AgentRelationshipGraphProps {
  agents: AgentProfile[];
}

const ROLE_COLORS: Record<AgentProfile["role"], string> = {
  orchestrator: "#ff7043",
  implementer: "#66bb6a",
  researcher: "#ab47bc",
  reviewer: "#42a5f5",
  validator: "#ef5350",
};

const DEMO_EDGES: Array<{ from: string; to: string }> = [
  { from: "architect", to: "worker-1" },
  { from: "architect", to: "sentinel" },
  { from: "sentinel", to: "auditor" },
  { from: "owner", to: "worker-1" },
  { from: "scout", to: "architect" },
];

const SVG_WIDTH = 400;
const SVG_HEIGHT = 360;
const CENTER_X = 200;
const CENTER_Y = 180;
const RADIUS = 140;
const NODE_R = 28;
const MARKER_ID = "arrowhead";

export function AgentRelationshipGraph({ agents }: AgentRelationshipGraphProps) {
  const count = agents.length;

  const positions = agents.map((agent, index) => {
    const angle = (index * 2 * Math.PI) / count - Math.PI / 2;
    return {
      id: agent.id,
      x: CENTER_X + RADIUS * Math.cos(angle),
      y: CENTER_Y + RADIUS * Math.sin(angle),
      agent,
    };
  });

  const posMap = new Map(positions.map((p) => [p.id, p]));

  const edges = DEMO_EDGES.flatMap((edge) => {
    const from = posMap.get(edge.from);
    const to = posMap.get(edge.to);
    if (!from || !to) return [];

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return [];

    const ux = dx / dist;
    const uy = dy / dist;

    const x1 = from.x + ux * NODE_R;
    const y1 = from.y + uy * NODE_R;
    const x2 = to.x - ux * (NODE_R + 8);
    const y2 = to.y - uy * (NODE_R + 8);

    return [{ x1, y1, x2, y2, key: `${edge.from}-${edge.to}` }];
  });

  return (
    <div className="agent-graph-container">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        width="100%"
        aria-label="Agent relationship graph"
      >
        <defs>
          <marker
            id={MARKER_ID}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.4)" />
          </marker>
        </defs>

        {edges.map((edge) => (
          <line
            key={edge.key}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            markerEnd={`url(#${MARKER_ID})`}
          />
        ))}

        {positions.map(({ id, x, y, agent }) => (
          <g key={id} transform={`translate(${x},${y})`}>
            <circle r={NODE_R} fill={ROLE_COLORS[agent.role]} />
            <text dy={NODE_R + 14}>{agent.name}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
