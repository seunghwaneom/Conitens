/**
 * @module reducers
 * RFC-1.0.1 §11 — Base reducer interface for event-driven state management.
 */
import type { ConitensEvent } from "@conitens/protocol";

/**
 * Base interface for all reducers.
 * Each reducer owns specific files and responds to specific event types.
 */
export interface BaseReducer {
  /** Reducer name matching ReducerName from @conitens/protocol */
  readonly name: string;

  /** Event types this reducer handles. "*" means all events. */
  readonly inputEvents: string[] | "*";

  /**
   * Process an event and update owned files accordingly.
   * @param event The event to process
   * @param conitensDir Absolute path to the .conitens/ directory
   */
  reduce(event: ConitensEvent, conitensDir: string): Promise<void>;
}
