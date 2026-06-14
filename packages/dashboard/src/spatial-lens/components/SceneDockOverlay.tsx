import type { ReactNode } from "react";
import styles from "../styles/spatial-lens.module.css";

export function SceneDockOverlay({
  label,
  role = "floor",
  children,
}: {
  label: string;
  role?: "floor" | "route";
  children: ReactNode;
}) {
  return (
    <div
      className={styles["scene-dock-overlay"]}
      data-scene-dock="minimap"
      data-scene-dock-role={role}
      data-scene-dock-state={role === "route" ? "collapsed-reveal" : "persistent"}
      aria-label={label}
      tabIndex={role === "route" ? 0 : undefined}
    >
      <span className={styles["scene-dock-label"]}>{label}</span>
      {children}
    </div>
  );
}
