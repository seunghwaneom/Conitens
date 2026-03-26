/**
 * replay/index.ts — Public API for the Sub-AC 9a replay parsing module.
 *
 * Exports the three layers of the event-log replay pipeline:
 *
 *   1. Schema definitions  (event-log-schema)
 *      TypedReplayEvent discriminated union, category types, parse error
 *      types, batch result type.
 *
 *   2. Parser              (event-log-parser)
 *      EventLogParser class (parseLine, parseLines, parseJsonlText),
 *      convenience utilities (classifyReplayEventType, extractEventDomain).
 *
 *   3. Timeline model      (replay-timeline)
 *      ReplayTimeline class, buildTimeline(), mergeTimelines(),
 *      emptyTimeline(), TimelineMetadata interface.
 *
 * Consumers that only need one layer may import from the sub-module directly
 * (e.g. `from "./replay/event-log-schema.js"`). This barrel is provided for
 * convenience and is the recommended import path for external components.
 */

// ── Schema types ─────────────────────────────────────────────────────────────
export type {
  ReplayEventCategory,
  BaseReplayEvent,
  AgentLifecycleReplayEvent,
  CommandOrPipelineEventType,
  CommandReplayEvent,
  StateChangeEventType,
  StateChangeReplayEvent,
  TypedReplayEvent,
  ParseErrorCode,
  ParseError,
  ParseResult,
  ParseBatchResult,
} from "./event-log-schema.js";
export { REPLAY_SCHEMA_VERSION } from "./event-log-schema.js";

// ── Parser ───────────────────────────────────────────────────────────────────
export {
  EventLogParser,
  defaultParser,
  classifyReplayEventType,
  extractEventDomain,
} from "./event-log-parser.js";

// ── Timeline model ───────────────────────────────────────────────────────────
export type { TimelineMetadata } from "./replay-timeline.js";
export {
  ReplayTimeline,
  buildTimeline,
  mergeTimelines,
  emptyTimeline,
} from "./replay-timeline.js";

// ── Replay-state cursor (Sub-AC 9b) ──────────────────────────────────────────
//
// Pure, immutable cursor that tracks position in a sorted TypedReplayEvent array.
// Provides event-entry-based traversal controls (step, seek) and exposes the
// current cursor index and associated event. No React or Zustand dependencies.
//
// Primary API:
//   emptyCursorState()                          → ReplayCursorState (before-start)
//   cursorAtIndex(events, index?)               → ReplayCursorState
//   cursorAtTs(events, targetTs)                → ReplayCursorState (binary search)
//   cursorStepForward(events, state)            → ReplayCursorState (next entry)
//   cursorStepBackward(events, state)           → ReplayCursorState (prev entry)
//   cursorSeekToTs(events, targetTs)            → ReplayCursorState
//   cursorSeekToIndex(events, index)            → ReplayCursorState
//   cursorSeekToStart(events)                   → ReplayCursorState
//   cursorSeekToEnd(events)                     → ReplayCursorState
//
// Binary-search utilities:
//   findLastIndexAtOrBeforeTs(events, ts)       → number
//   findFirstIndexAtOrAfterTs(events, ts)       → number
//
// Inspection helpers:
//   cursorProgress(state)                       → number (0..1)
//   cursorRemainingEvents(state)                → number
//   cursorElapsedEvents(state)                  → number
export type { ReplayCursorState, ReplayCursorVersion } from "./replay-cursor.js";
export { REPLAY_CURSOR_VERSION } from "./replay-cursor.js";
export {
  emptyCursorState,
  cursorAtIndex,
  cursorAtTs,
  cursorStepForward,
  cursorStepBackward,
  cursorSeekToTs,
  cursorSeekToIndex,
  cursorSeekToStart,
  cursorSeekToEnd,
  findLastIndexAtOrBeforeTs,
  findFirstIndexAtOrAfterTs,
  cursorProgress,
  cursorRemainingEvents,
  cursorElapsedEvents,
} from "./replay-cursor.js";

// ── State-reconstruction engine (Sub-AC 9b / AC 9.2) ─────────────────────────
//
// Pure, deterministic engine that processes TypedReplayEvent sequences
// to reconstruct complete scene-state snapshots at any given timestamp.
// No React or Zustand dependencies — safe for workers, Node.js, and tests.
//
// Primary API:
//   reconstructStateAt(events, targetTs, checkpoints?) → ReconstructedSceneState
//   buildCheckpoints(events, interval?)               → ReconstructionCheckpoint[]
//   buildFullTimeline(events)                         → { ts, seq, snapshot }[]
//   emptySceneState(ts?)                              → ReconstructedSceneState
//
// Query helpers:
//   traceAgentRoomHistory(events, agentId)            → { ts, seq, roomId }[]
//   listAgentIds(events)                              → string[]
export type {
  ReconstructedAgentState,
  ReconstructedRoomState,
  ReconstructedTaskState,
  ReconstructedCommandState,
  ReconstructedPipelineState,
  ReconstructedSceneState,
  ReconstructionCheckpoint,
} from "./state-reconstruction-engine.js";
export {
  DEFAULT_CHECKPOINT_INTERVAL,
  emptySceneState,
  reconstructStateAt,
  buildCheckpoints,
  buildFullTimeline,
  traceAgentRoomHistory,
  listAgentIds,
} from "./state-reconstruction-engine.js";

// ── Spatial layout reconstruction (Sub-AC 9c) ─────────────────────────────────
//
// Pure, deterministic engine that replays layout.* events from the nearest
// layout.init bootstrap up to the replay_state cursor position, producing a
// reconstructed spatial snapshot (3D positions, rotations, scales for rooms,
// agents, and fixtures).
//
// Primary API:
//   reconstructSpatialLayoutAt(events, cursor | targetTs) → ReconstructedSpatialLayout
//   reconstructSpatialLayoutAtIndex(events, index)        → ReconstructedSpatialLayout
//   findNearestLayoutInitIndex(events, upToIndex)         → number
//   emptySpatialLayout(ts?)                               → ReconstructedSpatialLayout
//
// Query helpers:
//   listRoomIds(layout)                → string[]
//   listSpatialAgentIds(layout)        → string[]
//   listFixtureIds(layout)             → string[]
//   traceRoomPositionHistory(events, roomId) → { ts, seq, position, eventType }[]
export type {
  Vec3,
  ReconstructedRoomNode,
  ReconstructedAgentNode,
  ReconstructedFixtureNode,
  ReconstructedSpatialLayout,
} from "./spatial-layout-reconstruction.js";
export {
  emptySpatialLayout,
  findNearestLayoutInitIndex,
  reconstructSpatialLayoutAt,
  reconstructSpatialLayoutAtIndex,
  listRoomIds,
  listSpatialAgentIds,
  listFixtureIds,
  traceRoomPositionHistory,
} from "./spatial-layout-reconstruction.js";
