/**
 * @module event-log
 * RFC-1.0.1 — Append-only JSONL event log.
 *
 * - Daily file split: YYYY-MM-DD.jsonl
 * - fsync after every write (I-1 durability invariant)
 * - ULID-based event_id for time-sortability
 */
import { open, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ulid } from "ulid";
import type { ConitensEvent, SchemaVersion } from "@conitens/protocol";
import { SCHEMA_VERSION } from "@conitens/protocol";

export class EventLog {
  private readonly eventsDir: string;

  constructor(eventsDir: string) {
    this.eventsDir = eventsDir;
  }

  /**
   * Append an event to the daily JSONL file.
   * - Daily file split: YYYY-MM-DD.jsonl
   * - JSON.stringify + newline
   * - fsync after write (data durability)
   * - Auto-generates event_id (evt_<ulid>) if not set
   * - Auto-sets ts (ISO 8601) if not set
   * - Validates schema version
   */
  async append(
    event: Omit<ConitensEvent, "event_id" | "ts" | "schema"> &
      Partial<Pick<ConitensEvent, "event_id" | "ts" | "schema">>,
  ): Promise<ConitensEvent> {
    // 1. Fill defaults
    const fullEvent: ConitensEvent = {
      schema: SCHEMA_VERSION,
      event_id: `evt_${ulid()}`,
      ts: new Date().toISOString(),
      ...event,
    };

    // 2. Determine daily file
    const date = fullEvent.ts.slice(0, 10); // YYYY-MM-DD
    const filePath = join(this.eventsDir, `${date}.jsonl`);

    // 3. Ensure directory exists
    await mkdir(this.eventsDir, { recursive: true });

    // 4. Append with fsync
    const line = JSON.stringify(fullEvent) + "\n";
    const fh = await open(filePath, "a");
    try {
      await fh.write(line);
      await fh.sync(); // fsync — I-1 durability guarantee
    } finally {
      await fh.close();
    }

    return fullEvent;
  }

  /**
   * Read all events from a specific date's JSONL file.
   * Yields one ConitensEvent per line, validating schema version.
   */
  async *read(date: string): AsyncGenerator<ConitensEvent> {
    const filePath = join(this.eventsDir, `${date}.jsonl`);

    let fileHandle;
    try {
      fileHandle = await open(filePath, "r");
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }

    const rl = createInterface({
      input: fileHandle.createReadStream({ encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    try {
      for await (const line of rl) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ConitensEvent;
        if (event.schema !== SCHEMA_VERSION) {
          throw new Error(
            `Schema version mismatch: expected ${SCHEMA_VERSION}, got ${event.schema}`,
          );
        }
        yield event;
      }
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Replay all events in chronological order.
   * If fromDate is given, only replay from that date onwards.
   * Reads all daily JSONL files sorted by filename (date).
   */
  async *replay(fromDate?: string): AsyncGenerator<ConitensEvent> {
    // List all .jsonl files in events directory
    let files: string[];
    try {
      const entries = await readdir(this.eventsDir);
      files = entries
        .filter((f) => f.endsWith(".jsonl"))
        .sort(); // Lexicographic sort = chronological for YYYY-MM-DD
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }

    for (const file of files) {
      const date = file.replace(".jsonl", "");
      if (fromDate && date < fromDate) continue;
      yield* this.read(date);
    }
  }
}
