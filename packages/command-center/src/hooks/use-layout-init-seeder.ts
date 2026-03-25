/**
 * use-layout-init-seeder.ts — Bootstrap layout.init event seeder hook.
 *
 * Sub-AC 9a: Seeds the scene event_log with a `layout.init` entry at session
 * creation time, capturing the complete initial spatial_layout state (rooms,
 * agents, fixtures) to provide the replay engine with a valid baseline for
 * scene reconstruction.
 *
 * Why this is necessary
 * ---------------------
 * Cold-start replay must be possible from the event log alone. Without an
 * explicit layout.init event, the replay engine would need to read external
 * config files to reconstruct the initial scene — breaking replay determinism.
 * By recording the full initial spatial snapshot in layout.init, every
 * subsequent layout.node.moved / agent.moved event is a pure delta on top
 * of a known, event-sourced baseline.
 *
 * Seeding contract
 * ----------------
 * 1. Seed exactly one layout.init entry per session hook instance.
 *    A React ref guards against double-emission (e.g. React StrictMode).
 * 2. Seeding is deferred until recording is active (recording === true).
 *    If recording has not started, the effect is a no-op; it re-runs when
 *    recording flips to true.
 * 3. The payload is derived from static config (BUILDING + AGENT_INITIAL_PLACEMENTS)
 *    — never from runtime store state — so it is deterministic and equivalent
 *    to what a replayer would reconstruct on cold start.
 * 4. The entry uses category = "layout.init" and source = "system".
 *
 * Positioning in the event stream
 * --------------------------------
 * Expected event order at session start:
 *   seq 1 — recording.started       (emitted by startRecording() in use-scene-recorder.ts)
 *   seq 2 — layout.init             (emitted by this hook, immediately after recording starts)
 *   seq 3+ — building.loaded, agents.initialized, agent.placed × N, …
 *
 * Usage
 * -----
 * Mount once alongside SceneRecorder in App.tsx:
 *
 *   import { LayoutInitSeeder } from "./hooks/use-layout-init-seeder.js";
 *   // ...
 *   return (
 *     <div>
 *       <SceneRecorder />
 *       <LayoutInitSeeder />
 *       <CommandCenterScene />
 *     </div>
 *   );
 *
 * Or use the hook directly in a component that already mounts once:
 *
 *   function App() {
 *     useSceneRecorder();
 *     useLayoutInitSeeder();
 *     return <CommandCenterScene />;
 *   }
 *
 * AC traceability:
 *   Sub-AC 9a — seed event_log with bootstrap layout.init events at creation time
 */

import { useEffect, useRef } from "react";
import { useSceneEventLog } from "../store/scene-event-log.js";
import { buildLayoutInitPayload } from "../data/layout-init-seeder.js";
import { BUILDING } from "../data/building.js";
import { AGENT_INITIAL_PLACEMENTS } from "../data/agent-seed.js";

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * useLayoutInitSeeder — Seeds the scene event_log with a layout.init entry.
 *
 * Call once per application session, after useSceneRecorder() has been
 * mounted (so recording is active by the time this effect fires).
 *
 * Idempotent: a React ref guards against double-emission in StrictMode and
 * on hot-module reload cycles. The guard is per hook instance, not per store
 * session — if the application performs a full unmount/remount (e.g. after
 * clearLog()), the new component instance will seed a fresh layout.init.
 */
export function useLayoutInitSeeder(): void {
  const recording  = useSceneEventLog((s) => s.recording);
  const recordEntry = useSceneEventLog((s) => s.recordEntry);

  // Prevents double-emission across StrictMode double-invocation and
  // rapid recording start/stop cycles without a full unmount.
  const seededRef = useRef(false);

  useEffect(() => {
    // Wait until recording is active before seeding.
    if (!recording) return;

    // Guard: only seed once per hook instance lifetime.
    if (seededRef.current) return;
    seededRef.current = true;

    const payload = buildLayoutInitPayload(BUILDING, AGENT_INITIAL_PLACEMENTS);

    recordEntry({
      ts: Date.now(),
      category: "layout.init",
      source: "system",
      payload: payload as unknown as Record<string, unknown>,
    });
    // recordEntry is a stable Zustand action reference — safe to omit from deps.
    // We only re-run if recording changes (e.g. paused → resumed after mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);
}

// ── Convenience Component ─────────────────────────────────────────────────

/**
 * LayoutInitSeeder — Headless component that seeds the layout.init event.
 *
 * Renders null. Include alongside SceneRecorder in the component tree.
 *
 * Example (in App.tsx):
 *   import { SceneRecorder } from "./hooks/use-scene-recorder.js";
 *   import { LayoutInitSeeder } from "./hooks/use-layout-init-seeder.js";
 *   // ...
 *   return (
 *     <div>
 *       <SceneRecorder />
 *       <LayoutInitSeeder />
 *       <CommandCenterScene />
 *     </div>
 *   );
 */
export function LayoutInitSeeder(): null {
  useLayoutInitSeeder();
  return null;
}
