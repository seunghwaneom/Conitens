import type { CSSProperties } from "react";
import { CORRIDOR_NODES } from "../viewport/corridorGraph.js";
import type { FloorLayoutPoint } from "../viewport/floorLayout.js";
import type {
  FloorViewportCorridorLane,
  FloorViewportFixture,
} from "../model/floorGeometry.js";
import { CorridorLane } from "./CorridorLane.js";
import { toFixtureStyle } from "./FloorGrid.js";
import styles from "../styles/spatial-lens.module.css";

export function CorridorLayer({
  corridors,
  fixtures,
}: {
  corridors: readonly FloorViewportCorridorLane[];
  fixtures: readonly FloorViewportFixture[];
}) {
  return (
    <div className={styles["corridor-layer"]} aria-hidden="true">
      {corridors.map((lane) => (
        <CorridorLane key={lane.id} lane={lane} />
      ))}
      {CORRIDOR_NODES.map((node) => (
        <span
          key={node.id}
          className={styles["corridor-node"]}
          data-corridor-node={node.kind}
          data-node-id={node.id}
          style={toPointStyle(node.point)}
        />
      ))}
      {fixtures.map((fixture) => (
        <span
          key={fixture.id}
          className={styles["floor-fixture"]}
          data-fixture-kind={fixture.kind}
          style={toFixtureStyle(fixture)}
        />
      ))}
    </div>
  );
}

function toPointStyle(point: FloorLayoutPoint): CSSProperties {
  return {
    left: `${point.left}%`,
    top: `${point.top}%`,
  };
}
