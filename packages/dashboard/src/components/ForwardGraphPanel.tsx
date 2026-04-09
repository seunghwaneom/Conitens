import type { ForwardGraphModel } from "../forward-graph.js";
import { EmptyState } from "../ds/index.js";
import styles from "./ForwardGraphPanel.module.css";

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
      <section className={styles.section}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.label}>Graph</p>
            <h3 className={styles.title}>State inspector</h3>
          </div>
        </div>
        <div className={styles.placeholder}>
          <EmptyState message="Graph builds after the first multi-step iteration completes." />
        </div>
      </section>
    );
  }

  const width = X_PADDING * 2 + CELL_WIDTH * 5;
  const height = Y_PADDING * 2 + CELL_HEIGHT * (Math.max(...model.nodes.map((node) => node.row)) + 1);
  const nodeMap = new Map(model.nodes.map((node) => [node.id, node]));

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <p className={styles.label}>Graph</p>
          <h3 className={styles.title}>State inspector</h3>
        </div>
      </div>
      <div className={styles.graphShell}>
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
                className={styles.graphEdge}
              />
            );
          })}
          {model.nodes.map((node) => (
            <g key={node.id} transform={`translate(${nodeX(node.column)}, ${nodeY(node.row)})`}>
              <rect
                width="112"
                height="52"
                rx="2"
                className={`${styles.graphNode} ${styles[`graphNode${node.kind.charAt(0).toUpperCase()}${node.kind.slice(1)}`] ?? ""}`}
              />
              <text x="12" y="18" className={styles.graphKind}>
                {node.kind.toUpperCase()}
              </text>
              <text x="12" y="36" className={styles.graphLabel}>
                {node.label.slice(0, 20)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <ul className={styles.graphSummary}>
        {model.summary.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
