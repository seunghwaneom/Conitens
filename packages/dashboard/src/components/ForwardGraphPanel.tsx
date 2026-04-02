import type { ForwardGraphModel } from "../forward-graph.js";

const CELL_WIDTH = 180;
const CELL_HEIGHT = 96;
const X_PADDING = 36;
const Y_PADDING = 28;

function nodeX(column: number) {
  return X_PADDING + column * CELL_WIDTH;
}

function nodeY(row: number) {
  return Y_PADDING + row * CELL_HEIGHT;
}

export function ForwardGraphPanel({ model }: { model: ForwardGraphModel | null }) {
  if (!model || model.nodes.length <= 1 || model.edges.length === 0) {
    return (
      <section className="forward-section">
        <div className="forward-section-header">
          <div>
            <p className="forward-panel-label">Graph</p>
            <h3>State inspector</h3>
          </div>
        </div>
        <div className="forward-placeholder">
          <p className="forward-empty">Graph builds after the first multi-step iteration completes.</p>
        </div>
      </section>
    );
  }

  const width = X_PADDING * 2 + CELL_WIDTH * 5;
  const height = Y_PADDING * 2 + CELL_HEIGHT * (Math.max(...model.nodes.map((node) => node.row)) + 1);
  const nodeMap = new Map(model.nodes.map((node) => [node.id, node]));

  return (
    <section className="forward-section">
      <div className="forward-section-header">
        <div>
          <p className="forward-panel-label">Graph</p>
          <h3>State inspector</h3>
        </div>
      </div>
      <div className="forward-graph-shell">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Forward graph inspector">
          {model.edges.map((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) {
              return null;
            }
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={nodeX(from.column) + 112}
                y1={nodeY(from.row) + 26}
                x2={nodeX(to.column)}
                y2={nodeY(to.row) + 26}
                className="forward-graph-edge"
              />
            );
          })}
          {model.nodes.map((node) => (
            <g key={node.id} transform={`translate(${nodeX(node.column)}, ${nodeY(node.row)})`}>
              <rect width="112" height="52" rx="10" className={`forward-graph-node graph-${node.kind}`} />
              <text x="12" y="18" className="forward-graph-kind">
                {node.kind.toUpperCase()}
              </text>
              <text x="12" y="36" className="forward-graph-label">
                {node.label.slice(0, 20)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <ul className="forward-graph-summary">
        {model.summary.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
