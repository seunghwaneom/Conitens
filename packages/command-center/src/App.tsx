/**
 * App — Root component for the Conitens 3D Command Center.
 *
 * Composes the 3D scene with the HUD overlay.
 * Bootstraps dynamic room loading from .agent/rooms/ YAML configs
 * and initializes agent avatars in their assigned rooms.
 *
 * Camera preset state is managed in the spatial store (event-sourced),
 * making all camera state changes fully replayable from the event log.
 *
 * AC2 — Agent pre-placement lifecycle:
 *   1. On mount: initializeAgents() places all agents as "inactive" in static rooms
 *   2. When YAML building loads: reinitializePositions() recomputes world positions
 *      from the updated room data, preserving agent status and task state.
 *   3. Agents appear with staggered fade-in animation (spawnIndex × STAGGER_MS)
 */
import { Component, useEffect, useRef } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { CommandCenterScene } from "./scene/CommandCenterScene.js";

/** ErrorBoundary — catches render errors and shows a diagnostic fallback. */
class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[SceneErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: "#ff6b6b", background: "#0a0a14", padding: 32, fontFamily: "monospace", height: "100vh", overflow: "auto" }}>
          <h2>⚠ Command Center Scene Error</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { HUD } from "./components/HUD.js";
import { useRoomLoader } from "./hooks/use-room-loader.js";
import { useAgentStore, injectSpatialStoreRef } from "./store/agent-store.js";
import { useSpatialStore } from "./store/spatial-store.js";
import { injectAgentStoreRefForMeeting } from "./store/meeting-store.js";
import { MetricsTicker } from "./hooks/use-metrics-texture.js";
import { OrchestratorWSBridge } from "./hooks/use-orchestrator-ws.js";
import { SceneRecorder } from "./hooks/use-scene-recorder.js";
import { ReplayEngine } from "./hooks/use-replay-engine.js";
import { SceneGraphReplayBridge } from "./hooks/use-scene-graph-replay-bridge.js";
import { ReplaySpatialLayoutMount } from "./hooks/use-replay-spatial-layout.js";
import { ActiveSessionsPanel } from "./components/ActiveSessionsPanel.js";
import { MeetingSessionPanel } from "./components/MeetingSessionPanel.js";
import { TopologyPanel } from "./components/TopologyPanel.js";
import { useTopologyKeyboardShortcuts } from "./scene/TopologyEditor.js";
import { useTopologyApi } from "./hooks/use-topology-api.js";
import { ActionDispatcherProvider } from "./components/ActionDispatcherProvider.js";
import { ContextMenuPortal } from "./components/ContextMenuDispatcher.js";
import { CommandLogPanel } from "./components/CommandLogPanel.js";
import { RoomMappingHotReloadBridge } from "./hooks/use-room-mapping-hot-reload.js";
import { TaskWSBridge } from "./hooks/use-task-ws-bridge.js";
import { PipelineWSBridge } from "./hooks/use-pipeline-ws-bridge.js";
import { PipelineCommandInterface } from "./components/PipelineCommandInterface.js";
import { TaskGroupsBootstrap } from "./hooks/task-groups-bootstrap.js";
import { PixelOffice } from "./office/PixelOffice.js";

/**
 * Headless component that activates topology hooks and renders the topology HUD panel.
 * Extracted here (not in HUD.tsx) per coordinator warning against adding more
 * top-level component definitions to HUD.tsx (already 2000+ lines).
 */
function TopologyBootstrap() {
  // Activate keyboard shortcuts (T to toggle, Del to sever, Esc to cancel)
  useTopologyKeyboardShortcuts();
  // Activate API persistence (load from server on mount, sync on every change)
  useTopologyApi();
  return <TopologyPanel />;
}

export function App() {
  // Camera preset is event-sourced in the spatial store (not local state)
  const cameraPreset = useSpatialStore((s) => s.cameraPreset);
  const setCameraPreset = useSpatialStore((s) => s.setCameraPreset);
  const viewMode = useAgentStore((s) => s.viewMode);
  const setViewMode = useAgentStore((s) => s.setViewMode);

  // Inject spatial store reference into agent-store so moveAgent can look up
  // dynamically-loaded room data (e.g. from YAML) rather than static fallback.
  // This is done once, synchronously before any agent actions run.
  useEffect(() => {
    injectSpatialStoreRef(() => useSpatialStore.getState());
  }, []);

  // Sub-AC 10a: Inject agent store reference into meeting-store so
  // gathering / dispersal can be triggered from meeting lifecycle events
  // without creating a circular import between the two stores.
  // Called once on mount — the reference is stable (Zustand singleton).
  useEffect(() => {
    injectAgentStoreRefForMeeting(() => ({
      gatherAgentsForMeeting: useAgentStore.getState().gatherAgentsForMeeting,
      disperseAgentsFromMeeting: useAgentStore.getState().disperseAgentsFromMeeting,
    }));
  }, []);

  // Bootstrap: load room configs from YAML (falls back to static data)
  useRoomLoader();

  // Initialize agent avatars — pre-placed as inactive in their default rooms.
  // This runs once on mount; the agent store records placement events
  // for full event-sourced traceability.
  const initializeAgents = useAgentStore((s) => s.initializeAgents);
  const reinitializePositions = useAgentStore((s) => s.reinitializePositions);
  const agentsInitialized = useAgentStore((s) => s.initialized);

  useEffect(() => {
    if (!agentsInitialized) {
      initializeAgents();
    }
  }, [initializeAgents, agentsInitialized]);

  // When the spatial store loads a building from YAML, recompute agent world
  // positions so agents stand in the correct locations if room coordinates changed.
  const dataSource = useSpatialStore((s) => s.dataSource);
  const prevDataSource = useRef<string>("static");

  useEffect(() => {
    if (!agentsInitialized) return;
    // Re-run when data source transitions to "yaml" (new dynamic building loaded)
    if (dataSource === "yaml" && prevDataSource.current !== "yaml") {
      // Read building snapshot directly from store to avoid putting it in deps
      // (building is an object → new reference each render → infinite loop)
      reinitializePositions(useSpatialStore.getState().building);
    }
    prevDataSource.current = dataSource;
  }, [dataSource, agentsInitialized, reinitializePositions]);

  return (
    /*
      Sub-AC 8b: ActionDispatcherProvider wraps the entire app so every
      component can call useActionDispatcher() to dispatch command files.
      Mounted at App root (not inside HUD) per coordinator warning pattern.
    */
    <ActionDispatcherProvider>
    <SceneErrorBoundary>
    {/*
      Sub-AC 3 (AC 15): TaskGroupsBootstrap — provides TaskGroupsContext to all
      descendants including the Three.js Canvas (HierarchySpatialTaskLayer reads
      group IDs from this context to render VirtualizedTaskOrbLayer per agent).
      Creates one task group per room + one per agent on mount; cleans up on unmount.
      Headless — renders children directly without extra DOM nodes.
    */}
    <TaskGroupsBootstrap>
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* View mode toggle button */}
      <button
        onClick={() => setViewMode(viewMode === "2d" ? "3d" : "2d")}
        style={{
          position: "absolute", top: 8, right: 8, zIndex: 100,
          padding: "4px 12px", cursor: "pointer",
          background: viewMode === "2d" ? "#1a3a2a" : "#2a1a3a",
          color: viewMode === "2d" ? "#66bb6a" : "#ab47bc",
          border: `1px solid ${viewMode === "2d" ? "#66bb6a55" : "#ab47bc55"}`,
          borderRadius: 4, fontFamily: "Courier New, monospace", fontSize: 11,
          letterSpacing: 1,
        }}
      >
        {viewMode === "2d" ? "◆ 2D PIXEL OFFICE" : "◇ 3D COMMAND CENTER"} → {viewMode === "2d" ? "3D" : "2D"}
      </button>

      {/* 2D Pixel Office (PixiJS) — default view */}
      {viewMode === "2d" && <PixelOffice />}

      {/* 3D Command Center (Three.js) — optional */}
      {viewMode === "3d" && (
        <>
          <CommandCenterScene cameraPreset={cameraPreset} />
          <HUD cameraPreset={cameraPreset} onPresetChange={setCameraPreset} />
        </>
      )}
      
      {/* Unified Global Context Rail */}
      <ActiveSessionsPanel />
      <CommandLogPanel defaultExpanded={true} />
      {/* Bridge/panel components temporarily disabled for React 19 + Zustand 5 compat. */}
    </div>
    </TaskGroupsBootstrap>
    </SceneErrorBoundary>
    </ActionDispatcherProvider>
  );
}
