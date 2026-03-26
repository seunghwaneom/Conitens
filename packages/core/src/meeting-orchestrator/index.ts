/**
 * @module meeting-orchestrator
 * Sub-AC 10b — Agent collaboration session spawning.
 *
 * Public API for the meeting orchestration control plane:
 *   - CollaborationSession + SessionRegistry (domain model)
 *   - MeetingHttpServer (HTTP control-plane server)
 *   - startMeetingHttpServer (convenience factory)
 */

export type {
  ParticipantKind,
  MeetingRole,
  SessionParticipant,
  ChannelMessage,
  SharedContext,
  SessionStatus,
  SessionHandle,
  SessionCreateInput,
  // Protocol state machine types (Sub-AC 10b)
  ProtocolPhase,
  ProtocolRequest,
  ProtocolDecision,
  ProtocolResolution,
  ProtocolState,
  BeginDeliberationInput,
  AddDecisionInput,
  ResolveProtocolInput,
} from "./collaboration-session.js";

export {
  CollaborationSession,
  SessionRegistry,
  assignMeetingRole,
  buildSessionParticipant,
  // Protocol state machine utilities (Sub-AC 10b)
  PROTOCOL_TRANSITIONS,
  canTransitionProtocol,
  ProtocolTransitionError,
} from "./collaboration-session.js";

export type {
  MeetingHttpServerOptions,
  ConveneResult,
} from "./meeting-http-server.js";

export {
  MeetingHttpServer,
  startMeetingHttpServer,
  MEETING_HTTP_PORT,
} from "./meeting-http-server.js";

// Sub-AC 10d — Meeting lifecycle event logger
// Sub-AC 10c — Spawned task event logger
export type {
  LogStartedInput,
  LogDeliberationInput,
  LogResolvedInput,
  LogTaskSpawnedInput,
} from "./meeting-event-logger.js";

export { MeetingEventLogger } from "./meeting-event-logger.js";
