import { Fragment } from "react";
import { GeneratedSprite } from "../assets/GeneratedSprite.js";
import styles from "../styles/spatial-lens.module.css";
import type {
  FloorViewportBlockedLaneMarker,
  FloorViewportHandoffRoute,
} from "../model/floorGeometry.js";

export function HandoffOverlay({
  routes,
  blockedMarkers,
}: {
  routes: readonly FloorViewportHandoffRoute[];
  blockedMarkers: readonly FloorViewportBlockedLaneMarker[];
}) {
  return (
    <div className={styles["handoff-overlay"]} aria-hidden="true">
      {routes.flatMap((route) =>
        routeToSegments(route).map((segment, index) => (
          <span
            key={`${route.id}-segment-${index}`}
            className={styles["handoff-route-segment"]}
            data-handoff-route={route.id}
            data-route-axis={segment.axis}
            data-fallback={route.isFallback ? "true" : "false"}
            style={{
              left: `${segment.left}%`,
              top: `${segment.top}%`,
              width: `${segment.width}%`,
              height: `${segment.height}%`,
            }}
          />
        )),
      )}
      {routes.flatMap((route) =>
        routeToGuideTiles(route).map((tile, index) => (
          <span
            key={`${route.id}-guide-${index}`}
            className={styles["handoff-route-guide-tile"]}
            data-handoff-route-guide={route.id}
            data-route-axis={tile.axis}
            data-route-guide-kind={tile.kind}
            style={{
              left: `${tile.left}%`,
              top: `${tile.top}%`,
            }}
          />
        )),
      )}
      {routes.map((route) => {
        const firstPoint = route.points[0];
        const lastPoint = route.points[route.points.length - 1];
        const packetPoint = route.points[Math.floor(route.points.length / 2)];
        return (
          <Fragment key={`${route.id}-markers`}>
            <span
              key={`${route.id}-start`}
              className={styles["handoff-beacon"]}
              data-route-end="start"
              style={{
                left: `${firstPoint?.left ?? 50}%`,
                top: `${firstPoint?.top ?? 50}%`,
              }}
            />
            <span
              key={`${route.id}-end`}
              className={styles["handoff-beacon"]}
              data-route-end="end"
              style={{
                left: `${lastPoint?.left ?? 50}%`,
                top: `${lastPoint?.top ?? 50}%`,
              }}
            />
            <span
              key={`${route.id}-packet-slot`}
              className={styles["handoff-packet-slot"]}
              data-handoff-packet-slot={route.id}
              style={{
                left: `${packetPoint?.left ?? 50}%`,
                top: `${packetPoint?.top ?? 50}%`,
              }}
            >
              <GeneratedSprite
                sprite="prop.packet"
                className={`${styles["handoff-packet"]} ${styles["pixel-generated-sprite"]}`}
                data-handoff-packet={route.id}
              />
            </span>
          </Fragment>
        );
      })}
      {blockedMarkers.map((marker) => (
        <GeneratedSprite
          key={marker.id}
          sprite="prop.barrier"
          className={`${styles["blocked-lane-marker"]} ${styles["pixel-generated-sprite"]}`}
          data-blocked-lane={marker.id}
          data-fallback={marker.isFallback ? "true" : "false"}
          style={{
            left: `${marker.point.left}%`,
            top: `${marker.point.top}%`,
          }}
        />
      ))}
    </div>
  );
}

interface HandoffSegment {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly axis: "x" | "y";
}

interface HandoffGuideTile {
  readonly left: number;
  readonly top: number;
  readonly axis: "x";
  readonly kind: "source";
}

function routeToSegments(route: FloorViewportHandoffRoute): HandoffSegment[] {
  const segments: HandoffSegment[] = [];
  for (let index = 1; index < route.points.length; index += 1) {
    const from = route.points[index - 1];
    const to = route.points[index];
    if (!from || !to) continue;
    const isHorizontal = Math.abs(from.top - to.top) <= Math.abs(from.left - to.left);
    if (isHorizontal) {
      segments.push({
        left: Math.min(from.left, to.left),
        top: from.top,
        width: Math.max(0.1, Math.abs(to.left - from.left)),
        height: 0,
        axis: "x",
      });
    } else {
      segments.push({
        left: from.left,
        top: Math.min(from.top, to.top),
        width: 0,
        height: Math.max(0.1, Math.abs(to.top - from.top)),
        axis: "y",
      });
    }
  }
  return segments;
}

function routeToGuideTiles(route: FloorViewportHandoffRoute): HandoffGuideTile[] {
  for (let index = 1; index < route.points.length; index += 1) {
    const from = route.points[index - 1];
    const to = route.points[index];
    if (!from || !to) continue;
    if (index === 1 || index === route.points.length - 1) continue;
    if (index >= route.points.length - 2) continue;

    const leftDelta = Math.abs(to.left - from.left);
    const topDelta = Math.abs(to.top - from.top);
    if (Math.max(leftDelta, topDelta) < 7) continue;
    if (topDelta > leftDelta) continue;

    return [
      {
        left: roundOverlayPercent((from.left + to.left) / 2),
        top: roundOverlayPercent((from.top + to.top) / 2),
        axis: "x",
        kind: "source",
      },
    ];
  }
  return [];
}

function roundOverlayPercent(value: number): number {
  return Math.round(value * 1000) / 1000;
}
