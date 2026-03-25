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
import { useEffect, useRef } from "react";
import { CommandCenterScene } from "./scene/CommandCenterScene.js";
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
  const building = useSpatialStore((s) => s.building);
  const dataSource = useSpatialStore((s) => s.dataSource);
  const prevDataSource = useRef<string>("static");

  useEffect(() => {
    if (!agentsInitialized) return;
    // Re-run when data source transitions to "yaml" (new dynamic building loaded)
    if (dataSource === "yaml" && prevDataSource.current !== "yaml") {
      reinitializePositions(building);
    }
    prevDataSource.current = dataSource;
  }, [dataSource, building, agentsInitialized, reinitializePositions]);

  return (
    /*
      Sub-AC 8b: ActionDispatcherProvider wraps the entire app so every
      component can call useActionDispatcher() to dispatch command files.
      Mounted at App root (not inside HUD) per coordinator warning pattern.
    */
    <ActionDispatcherProvider>
    {/*
      Sub-AC 3 (AC 15): TaskGroupsBootstrap — provides TaskGroupsContext to all
      descendants including the Three.js Canvas (HierarchySpatialTaskLayer reads
      group IDs from this context to render VirtualizedTaskOrbLayer per agent).
      Creates one task group per room + one per agent on mount; cleans up on unmount.
      Headless — renders children directly without extra DOM nodes.
    */}
    <TaskGroupsBootstrap>
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/*
        AC 9.1: Scene event recorder — subscribes to agent-store and
        spatial-store, pipes all state-changing events into the unified
        SceneEventLog for 3D replay capability.
      */}
      <SceneRecorder />
      {/*
        AC 9.2: Replay engine — drives the RAF playback loop and reconstructs
        3D scene state at the current playhead timestamp. Mounts headlessly;
        controls are provided by ReplayControlPanel in HUD.tsx.
      */}
      <ReplayEngine />
      {/*
        Sub-AC 9d: Scene-graph replay bridge — subscribes to the replay
        controller store and applies reconstructed agent/room state diffs
        to the 3D scene stores on every playhead tick. Also exposes pipeline
        states for ReplayPipelineLayer (rendered inside CommandCenterScene).
        Complements ReplayEngine: both can coexist safely via idempotent guards.
      */}
      <SceneGraphReplayBridge />
      {/*
        Sub-AC 9c: Spatial layout replay mount — reconstructs spatial_layout
        (3D positions of rooms, agents, and fixtures) from layout.* events at
        each cursor position during replay. Exposes the layout via
        useReplaySpatialLayoutStore for renderer components that need exact
        world-space positions rather than static room-centre fallbacks.
        Reads events from the cursor store (getCursorEvents); zero overhead in
        live mode. Headless (renders null).
      */}
      <ReplaySpatialLayoutMount />
      {/* Start the background metrics ticker that drives canvas textures */}
      <MetricsTicker />
      {/*
        Sub-AC 6c: Orchestrator WebSocket bridge — connects to @conitens/core
        ws-bus and feeds live ConitensEvents into the metrics store.
        Silently falls back to simulated data if the server is unavailable.
      */}
      <OrchestratorWSBridge />
      <CommandCenterScene cameraPreset={cameraPreset} />
      <HUD cameraPreset={cameraPreset} onPresetChange={setCameraPreset} />
      {/*
        Sub-AC 10b: Active collaboration sessions panel — shows live session handles
        returned by the MeetingHttpServer (port 8081) when meetings are convened.
        Reactive to both HTTP POST responses (via meeting-store.upsertSession) and
        live WebSocket meeting.* events (forwarded by OrchestratorWSBridge).
      */}
      <ActiveSessionsPanel />
      {/*
        Sub-AC 10c: Meeting session detail panel — shows full session status,
        transcript feed, and termination controls when a session is selected
        via ActiveSessionsPanel "INSPECT" button or selectSession() action.
        Renders as a left-side overlay alongside the 3D scene.
      */}
      <MeetingSessionPanel />
      {/*
        Sub-AC 7d: Topology editor — keyboard shortcuts, API persistence,
        and the topology HUD panel. Mounted here (not inside HUD.tsx) to
        avoid adding to HUD.tsx's already-large component surface.
        TopologyEditorLayer and TopologyEditModeIndicator are rendered inside
        the Canvas in CommandCenterScene.tsx.
      */}
      <TopologyBootstrap />
      {/*
        Sub-AC 8b: Context menu portal — renders a floating right-click menu
        for agent / room / task entities.  Uses ActionDispatcher internally
        to route selections to command file dispatch.
        Mounted here (not inside HUD) so it sits above the overlay layer.
      */}
      <ContextMenuPortal />
      {/*
        Sub-AC 8c: Command lifecycle log panel — scrollable list of all command
        state transitions (pending → processing → completed/failed/rejected).
        Reads live from command-lifecycle-store, fed by both local dispatch
        (use-command-file-writer) and orchestrator WS events (use-orchestrator-ws).
        Togglable — collapsed by default to avoid visual clutter.
      */}
      <CommandLogPanel defaultExpanded={false} />
      {/*
        Sub-AC 12c: Room-mapping hot-reload bridge — subscribes to the
        room-mapping store and propagates every config change to agent positions
        in the 3D scene without a full page restart. Reads persisted overrides
        from localStorage on startup and applies them once agents are initialized.
        Headless (renders null); mounted here alongside the other bridge components.
      */}
      <RoomMappingHotReloadBridge />
      {/*
        Sub-AC 5a: Task WS bridge — seeds the task store with mock data on
        mount (when no live orchestrator is running) and routes task.* WS
        events (forwarded from OrchestratorWSBridge) to the task-store so
        task-agent assignments and status transitions stay in sync with the
        orchestrator in real time.  Headless (renders null).
      */}
      <TaskWSBridge />
      {/*
        Sub-AC 7.2: Pipeline WS bridge — listens for pipeline.started /
        pipeline.step / pipeline.completed / pipeline.failed events from
        the orchestrator WS bus and updates the pipeline-store accordingly.
        Also runs a 30-second TTL eviction interval for terminal pipeline runs.
        Headless (renders null) per coordinator null-render bridge pattern.
      */}
      <PipelineWSBridge />
      {/*
        Sub-AC 7.2: Pipeline command interface — 2D HUD overlay for triggering,
        chaining, and cancelling agent pipelines across all rooms.  Collapsed by
        default; toggle with keyboard shortcut P.
        Complements the diegetic PipelineDiegeticLayer rendered inside the Canvas
        (CommandCenterScene.tsx) which provides room-scoped pipeline access.
      */}
      <PipelineCommandInterface defaultExpanded={false} />
    </div>
    </TaskGroupsBootstrap>
    </ActionDispatcherProvider>
  );
}
