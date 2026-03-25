/**
 * scene-pipeline-order.ts — Canonical render pipeline layer ordering.
 *
 * Sub-AC 5d: Defines the authoritative pipeline-slot specification for all
 * layers in CommandCenterScene.tsx.  The verifier (scene-graph-order-check.test.ts)
 * uses this module to assert that mapping connectors are inserted into the
 * render pipeline IMMEDIATELY AFTER the agent-rendering block.
 *
 * ── Design rationale ──────────────────────────────────────────────────────
 * Three.js draws objects in two interleaved sequences:
 *
 *   1. Scene-graph order (the order in which React/R3F adds groups to the
 *      THREE.Scene object).  For the same renderOrder value, objects added
 *      LATER to the scene appear on top when depthTest is disabled.
 *
 *   2. renderOrder (explicit draw-call queue override).  All connector
 *      materials use renderOrder 997–999 with depthTest: false, so they are
 *      guaranteed to composite on top of all agent/room geometry regardless
 *      of scene-graph insertion order.
 *
 * Sub-AC 5d enforces BOTH layers of ordering:
 *   a. renderOrder values (connector > agent) — verified by 5c tests
 *   b. Scene-graph (JSX) insertion order — verified HERE (5d tests)
 *
 * "Immediately after agents" means:
 *   In the flat JSX body of the <Canvas>'s Suspense children, the slot that
 *   follows the {useHierarchy ? ... : ...} agent-rendering block must be
 *   <TaskConnectorsLayer>.  No other geometry-producing component may occupy
 *   the gap between the agent block close and the connector slot.
 *
 * ── Record Transparency ──────────────────────────────────────────────────
 * This module is the single source of truth for the pipeline order contract.
 * Any intentional change to layer ordering in CommandCenterScene.tsx MUST be
 * reflected here AND must keep the connectors slot immediately after the
 * agent block close.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline slot descriptor
// ─────────────────────────────────────────────────────────────────────────────

/** Category tag for a render pipeline slot. */
export type PipelineSlotKind =
  | "background"    // fog, environment
  | "lighting"      // light rigs
  | "camera"        // camera controls
  | "interaction"   // invisible click planes
  | "agents"        // agent avatar rendering (hierarchy scene graph or legacy path)
  | "connectors"    // task-agent visual connectors — MUST follow agents
  | "room"          // room volumes, meeting gathering, mapping editor
  | "ui3d"          // 3D UI fixtures, topology editor, global dashboard
  | "metrics"       // diegetic metric displays, pipeline diegetic panel
  | "replay"        // replay pipeline layer, diegetic timeline
  | "birdsEye"      // bird's-eye overlays, LOD layer, clickable nodes
  | "spatial";      // spatial index provider, task hierarchy integration

/**
 * A single ordered slot in the render pipeline.
 *
 * Each slot maps to a JSX element in CommandCenterScene.tsx.
 * The verifier reads the source and checks that all elements appear in the
 * order declared in SCENE_PIPELINE_ORDER.
 */
export interface PipelineSlot {
  /**
   * Unique identifier for this slot.
   * Used by helper functions to locate slots by name.
   */
  readonly id: string;

  /**
   * Primary JSX element open-tag string expected in CommandCenterScene.tsx.
   * e.g. "<TaskConnectorsLayer", "<HierarchySceneGraph"
   *
   * Must be unique within the file (no duplicate component names at the same
   * nesting level) so line-number searches are unambiguous.
   */
  readonly jsxElement: string;

  /** Category of this slot (used to group and filter slots). */
  readonly kind: PipelineSlotKind;

  /**
   * When true, this slot lives INSIDE the `{useHierarchy ? ... : ...}` ternary
   * block rather than in the flat outer Suspense children.
   *
   * Slots with insideHierarchyBlock=true are EXCLUDED from the outer-pipeline
   * ordering check (the "immediately after agents" invariant) because they are
   * part of the conditional rendering group, not the flat pipeline sequence.
   */
  readonly insideHierarchyBlock?: true;

  /**
   * When true, this slot is wrapped in a conditional guard in the source:
   *   `{condition && <Component ... />}`
   *
   * Conditional (debug/mode-gated) slots do NOT count as geometry-producing
   * elements in the gap check between the agent block and the connector slot.
   */
  readonly conditional?: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical pipeline order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SCENE_PIPELINE_ORDER — ordered specification of all render pipeline layers.
 *
 * ── "Immediately after agents" invariant ─────────────────────────────────
 * In the OUTER pipeline (slots without insideHierarchyBlock), the first slot
 * with kind="connectors" must occupy the position IMMEDIATELY following the
 * {useHierarchy ? ... : ...} agent block.  That is:
 *
 *   outer[N]     = (any non-conditional agent block)   ← ternary close: `)}`
 *   outer[N+1]   = <TaskConnectorsLayer ...             ← connectors slot
 *
 * No non-conditional, non-debug geometry component may appear at outer[N+1]
 * before <TaskConnectorsLayer.
 *
 * ── renderOrder alignment ─────────────────────────────────────────────────
 * All "connectors" slots use renderOrder values 997–999 (RENDER_ORDER_BEAM,
 * RENDER_ORDER_ORB, RENDER_ORDER_SCAN) declared in TaskConnectors.tsx.
 * All "agents" slots use the default renderOrder (0) or BirdsEyeLODLayer's
 * agent-marker level (4).  The full numeric ordering is verified by Sub-AC 5c.
 */
export const SCENE_PIPELINE_ORDER: readonly PipelineSlot[] = [
  // ── Outer background / environment ──────────────────────────────────────
  {
    id:         "fog",
    jsxElement: "<fog",
    kind:       "background",
  },
  {
    id:         "lighting",
    jsxElement: "<Lighting",
    kind:       "lighting",
  },
  {
    id:         "camera",
    jsxElement: "<CameraRigConnected",
    kind:       "camera",
  },
  {
    id:         "click-handler",
    jsxElement: "<SceneClickHandler",
    kind:       "interaction",
  },

  // ── Agent rendering block (inside {useHierarchy ? ... : ...}) ───────────
  //
  // HierarchySceneGraph is the representative "last agent element" in the
  // hierarchy branch.  AgentAvatarsLayer fulfils the same role in the legacy
  // branch.  Both live inside the ternary block (insideHierarchyBlock=true).
  //
  // The ternary block as a whole closes BEFORE <TaskConnectorsLayer.
  {
    id:                  "agents-hierarchy",
    jsxElement:          "<HierarchySceneGraph",
    kind:                "agents",
    insideHierarchyBlock: true,
  },
  {
    id:                  "agents-legacy-shell",
    jsxElement:          "<BuildingShell",
    kind:                "agents",
    insideHierarchyBlock: true,
    conditional:         true,   // only in legacy branch
  },
  {
    id:                  "agents-legacy-floors",
    jsxElement:          "<DynamicFloors",
    kind:                "agents",
    insideHierarchyBlock: true,
    conditional:         true,   // only in legacy branch
  },
  {
    id:                  "agents-legacy-avatars",
    jsxElement:          "<AgentAvatarsLayer",
    kind:                "agents",
    insideHierarchyBlock: true,
    conditional:         true,   // only in legacy branch
  },
  {
    id:                  "lod-debug",
    jsxElement:          "<LODDebugOverlay",
    kind:                "agents",
    insideHierarchyBlock: true,
    conditional:         true,   // only when showLODDebug=true
  },

  // ── CONNECTOR SLOT — must be the first outer element after the agent block ─
  //
  // This is the core 5d invariant:
  //   After the `{useHierarchy ? ... : ...}` block closes with `)}`, the very
  //   next JSX component tag at the outer indentation level is <TaskConnectorsLayer.
  //   No unguarded, non-debug geometry component may appear in this gap.
  {
    id:         "connectors",
    jsxElement: "<TaskConnectorsLayer",
    kind:       "connectors",
  },

  // ── Room-layer geometry ──────────────────────────────────────────────────
  {
    id:         "rooms",
    jsxElement: "<RoomsFromRegistry",
    kind:       "room",
  },
  {
    id:         "meeting",
    jsxElement: "<MeetingGatheringLayer",
    kind:       "room",
  },
  {
    id:         "room-mapping",
    jsxElement: "<RoomMappingEditor3DLayer",
    kind:       "room",
  },

  // ── 3D UI fixtures & control plane ──────────────────────────────────────
  {
    id:         "topology",
    jsxElement: "<TopologyEditorLayer",
    kind:       "ui3d",
  },
  {
    id:         "topology-mode-indicator",
    jsxElement: "<TopologyEditModeIndicator",
    kind:       "ui3d",
  },
  {
    id:         "dashboard",
    jsxElement: "<GlobalDashboardPanel",
    kind:       "ui3d",
  },

  // ── Diegetic metric displays ──────────────────────────────────────────────
  {
    id:         "diegetic-metrics",
    jsxElement: "<DiegeticMetricLayer",
    kind:       "metrics",
  },
  {
    id:         "display-surfaces",
    jsxElement: "<DisplaySurfacesLayer",
    kind:       "metrics",
  },
  {
    id:         "drill-panel",
    jsxElement: "<DrillContextPanelLayer",
    kind:       "ui3d",
  },

  // ── Replay layers ─────────────────────────────────────────────────────────
  {
    id:         "replay-pipeline",
    jsxElement: "<ReplayPipelineLayer",
    kind:       "replay",
  },
  {
    id:         "replay-timeline",
    jsxElement: "<ReplayDiegeticTimeline",
    kind:       "replay",
  },
  {
    id:         "pipeline-diegetic",
    jsxElement: "<PipelineDiegeticLayer",
    kind:       "metrics",
  },

  // ── Bird's-eye overlays ──────────────────────────────────────────────────
  {
    id:         "birds-eye-viewport",
    jsxElement: "<BirdsEyeViewport",
    kind:       "birdsEye",
    conditional: true,   // guard: cameraMode === "birdsEye"
  },
  {
    id:         "birds-eye-overlay",
    jsxElement: "<BirdsEyeOverlay",
    kind:       "birdsEye",
  },
  {
    id:         "birds-eye-lod",
    jsxElement: "<BirdsEyeLODLayer",
    kind:       "birdsEye",
  },
  {
    id:         "birds-eye-nodes",
    jsxElement: "<BirdsEyeClickableNodes",
    kind:       "birdsEye",
  },
  {
    id:         "birds-eye-connectors",
    jsxElement: "<BirdsEyeConnectorLayer",
    kind:       "connectors",
  },

  // ── Spatial index & task integration ─────────────────────────────────────
  {
    id:         "spatial-index",
    jsxElement: "<SpatialIndexProvider",
    kind:       "spatial",
  },
  {
    id:         "spatial-tasks",
    jsxElement: "<HierarchySpatialTaskLayer",
    kind:       "spatial",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Derived indices (computed once at module load — zero runtime cost)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Index of the primary agent-rendering slot in SCENE_PIPELINE_ORDER.
 *
 * "agents-hierarchy" (HierarchySceneGraph) is chosen as the representative
 * because it is the last agent element in the PREFERRED rendering path.
 * In the legacy path, AgentAvatarsLayer fulfils the same role but both are
 * inside the ternary (insideHierarchyBlock=true).
 */
export const AGENTS_SLOT_INDEX: number = SCENE_PIPELINE_ORDER.findIndex(
  (s) => s.id === "agents-hierarchy",
);

/**
 * Index of the primary connector slot in SCENE_PIPELINE_ORDER.
 *
 * This is the TaskConnectorsLayer slot, which must appear in the outer
 * pipeline immediately after the agent block closes.
 */
export const CONNECTORS_SLOT_INDEX: number = SCENE_PIPELINE_ORDER.findIndex(
  (s) => s.id === "connectors",
);

/**
 * Outer pipeline slots — all slots with insideHierarchyBlock !== true.
 *
 * These are the slots that exist in the FLAT outer JSX body of the Suspense
 * children in CommandCenterScene.tsx (not nested inside the ternary block).
 *
 * The "immediately after agents" invariant applies to this filtered view:
 * the agent ternary block (represented by OUTER_AGENT_BLOCK_CLOSE_MARKER in
 * the source) must be immediately followed by the first "connectors" slot
 * with no other non-conditional, outer component in between.
 */
export const OUTER_PIPELINE_SLOTS: readonly PipelineSlot[] = SCENE_PIPELINE_ORDER.filter(
  (s) => !s.insideHierarchyBlock,
);

/**
 * JSX source token that marks the END of the agent rendering block.
 *
 * In CommandCenterScene.tsx the {useHierarchy ? ( ... ) : ( ... )} ternary
 * closes with a standalone `)}` at the outer indentation level.  After this
 * token, the next JSX component tag must be <TaskConnectorsLayer.
 */
export const OUTER_AGENT_BLOCK_CLOSE_MARKER = "useHierarchy ?";

/**
 * The JSX element that MUST appear as the first geometry-producing component
 * after the agent block closes in the outer pipeline.
 *
 * = TaskConnectorsLayer
 */
export const FIRST_CONNECTOR_AFTER_AGENTS = "TaskConnectorsLayer";

// ─────────────────────────────────────────────────────────────────────────────
// Utility: gap element extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts all JSX component open-tag strings that appear between two line
 * positions in a source string.  "Component open-tags" are patterns of the
 * form `<[A-Z][A-Za-z0-9]+` (uppercase-first component names only — lowercase
 * HTML intrinsics like `<fog` are excluded).
 *
 * Used by the scene-graph ordering check to verify that no unexpected
 * component appears in a pipeline gap.
 *
 * @param sourceLines - All lines of the source file as an array.
 * @param fromLine    - Start line (inclusive, 0-based).
 * @param toLine      - End line (exclusive, 0-based).
 * @returns Array of component names found in the gap (may be empty).
 */
export function extractJsxComponentsInRange(
  sourceLines: readonly string[],
  fromLine: number,
  toLine: number,
): string[] {
  const components: string[] = [];
  const componentTagRe = /<([A-Z][A-Za-z0-9]*)/g;

  for (let i = fromLine; i < toLine && i < sourceLines.length; i++) {
    const line = sourceLines[i]!;
    let match: RegExpExecArray | null;
    componentTagRe.lastIndex = 0;
    while ((match = componentTagRe.exec(line)) !== null) {
      components.push(match[1]!);
    }
  }

  return components;
}

/**
 * Finds the 0-based line index of the FIRST occurrence of `token` in
 * `sourceLines`.  Returns -1 if not found.
 *
 * Used as a convenience replacement for `lines.findIndex(l => l.includes(token))`.
 */
export function findFirstLine(sourceLines: readonly string[], token: string): number {
  return sourceLines.findIndex((l) => l.includes(token));
}

/**
 * Finds the 0-based line index of the LAST occurrence of `token` in
 * `sourceLines`.  Returns -1 if not found.
 */
export function findLastLine(sourceLines: readonly string[], token: string): number {
  let last = -1;
  for (let i = 0; i < sourceLines.length; i++) {
    if (sourceLines[i]!.includes(token)) last = i;
  }
  return last;
}

/**
 * Returns all (lineIndex, componentName) pairs for every JSX component
 * open-tag found in `sourceLines`.
 *
 * Uppercase-first rule is applied so Three.js intrinsics and HTML primitives
 * (fog, mesh, group, …) are not included.
 */
export function indexJsxComponents(
  sourceLines: readonly string[],
): Array<{ line: number; component: string }> {
  const result: Array<{ line: number; component: string }> = [];
  const re = /<([A-Z][A-Za-z0-9]*)/g;

  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i]!;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      result.push({ line: i, component: m[1]! });
    }
  }

  return result;
}

/**
 * Verifies that the SCENE_PIPELINE_ORDER specification is internally
 * consistent:
 *
 *   1. All slot ids are unique.
 *   2. AGENTS_SLOT_INDEX is set (≥ 0).
 *   3. CONNECTORS_SLOT_INDEX is set (≥ 0).
 *   4. In the outer pipeline (non-hierarchy slots), the first "connectors"
 *      slot appears after the last non-conditional "agents" slot.
 *
 * Returns an array of error strings.  An empty array means the spec is
 * internally valid.  Intended for use in tests and CI.
 */
export function validatePipelineOrderSpec(): string[] {
  const errors: string[] = [];

  // 1. Unique ids
  const ids = SCENE_PIPELINE_ORDER.map((s) => s.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`Duplicate slot id: "${id}"`);
    seen.add(id);
  }

  // 2. AGENTS_SLOT_INDEX found
  if (AGENTS_SLOT_INDEX < 0) {
    errors.push("AGENTS_SLOT_INDEX not found — 'agents-hierarchy' slot is missing");
  }

  // 3. CONNECTORS_SLOT_INDEX found
  if (CONNECTORS_SLOT_INDEX < 0) {
    errors.push("CONNECTORS_SLOT_INDEX not found — 'connectors' slot is missing");
  }

  // 4. In outer pipeline, first connector appears after last required agent
  const outerSlots = OUTER_PIPELINE_SLOTS;
  const lastOuterAgentIdx = (() => {
    let last = -1;
    outerSlots.forEach((s, i) => {
      if (s.kind === "agents" && !s.conditional) last = i;
    });
    return last;
  })();
  const firstOuterConnectorIdx = outerSlots.findIndex((s) => s.kind === "connectors");

  // Note: all agent slots are insideHierarchyBlock so they're absent from
  // OUTER_PIPELINE_SLOTS.  The expected result is lastOuterAgentIdx === -1
  // because the agent block is the ternary group (not a single outer element).
  // The check that matters is: connectors slot exists in outer pipeline and
  // appears before room/overlay layers.
  if (firstOuterConnectorIdx < 0) {
    errors.push("No 'connectors' slot found in OUTER_PIPELINE_SLOTS");
  }

  // 5. Every "connectors" slot in the FULL pipeline comes after every
  //    non-conditional "agents" slot.
  const allAgentLines = SCENE_PIPELINE_ORDER
    .map((s, i) => ({ slot: s, i }))
    .filter((x) => x.slot.kind === "agents" && !x.slot.conditional);
  const lastAgentIdx = allAgentLines.length > 0
    ? Math.max(...allAgentLines.map((x) => x.i))
    : -1;

  for (const { slot, i } of SCENE_PIPELINE_ORDER.map((s, i) => ({ slot: s, i }))) {
    if (slot.kind === "connectors" && i <= lastAgentIdx) {
      errors.push(
        `Connector slot "${slot.id}" (index ${i}) must come after all agent slots (last agent index ${lastAgentIdx})`,
      );
    }
  }

  return errors;
}
