/**
 * @module replay
 * RFC-1.0.1 — Crash recovery via event log replay.
 *
 * Replays all events through reducers to rebuild entity/view files
 * from the event log alone (I-1, I-2 compliance).
 */
import { EventLog } from "../event-log/event-log.js";
import type { BaseReducer } from "../reducers/base-reducer.js";

/**
 * Replay all events through the given reducers to rebuild state.
 * This is the crash recovery mechanism — all entity and view files
 * can be regenerated from events alone.
 */
export async function replayAll(
  eventsDir: string,
  conitensDir: string,
  reducers: BaseReducer[],
  fromDate?: string,
): Promise<{ eventCount: number }> {
  const log = new EventLog(eventsDir);
  let eventCount = 0;

  // Reset all reducers before replay
  for (const reducer of reducers) {
    reducer.reset();
  }

  // Replay all events through matching reducers
  for await (const event of log.replay(fromDate)) {
    for (const reducer of reducers) {
      if (reducer.inputEvents === "*" || reducer.inputEvents.includes(event.type)) {
        await reducer.reduce(event, conitensDir);
      }
    }
    eventCount++;
  }

  return { eventCount };
}
