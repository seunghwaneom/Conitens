/**
 * @module traces
 * OTEL-compatible trace logger writing to traces/*.jsonl.
 *
 * traces/ is classified as "event" plane by classifyPath().
 * Trace spans are append-only, similar to events.
 */

import { open, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";

export interface TraceSpan {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  name: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  status: "ok" | "error" | "unset";
  attributes: Record<string, unknown>;
}

function generateId(bytes: number = 16): string {
  return randomBytes(bytes).toString("hex");
}

export class TraceLogger {
  private readonly tracesDir: string;
  private activeTraceId: string | null = null;

  constructor(tracesDir: string) {
    this.tracesDir = tracesDir;
  }

  /**
   * Start a new trace context. Returns a trace_id.
   */
  startTrace(): string {
    this.activeTraceId = generateId(16);
    return this.activeTraceId;
  }

  /**
   * Get the current active trace ID.
   */
  get traceId(): string | null {
    return this.activeTraceId;
  }

  /**
   * Log a completed span to the daily trace file.
   */
  async logSpan(
    spanName: string,
    attributes: Record<string, unknown> = {},
    durationMs: number,
    options: {
      parentSpanId?: string;
      status?: "ok" | "error" | "unset";
      traceId?: string;
    } = {},
  ): Promise<TraceSpan> {
    const traceId = options.traceId ?? this.activeTraceId ?? this.startTrace();
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - durationMs);

    const span: TraceSpan = {
      trace_id: traceId,
      span_id: generateId(8),
      parent_span_id: options.parentSpanId,
      name: spanName,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_ms: durationMs,
      status: options.status ?? "ok",
      attributes,
    };

    // Write to daily trace file
    const date = endTime.toISOString().slice(0, 10);
    const filePath = join(this.tracesDir, `trace-${date}.jsonl`);

    await mkdir(this.tracesDir, { recursive: true });

    const line = JSON.stringify(span) + "\n";
    const fh = await open(filePath, "a");
    try {
      await fh.write(line);
      await fh.sync();
    } finally {
      await fh.close();
    }

    return span;
  }

  /**
   * Helper: time a function and log its span.
   */
  async timeSpan<T>(
    spanName: string,
    fn: () => Promise<T>,
    attributes: Record<string, unknown> = {},
  ): Promise<{ result: T; span: TraceSpan }> {
    const start = Date.now();
    let status: "ok" | "error" = "ok";
    let result!: T;
    let thrownError: unknown;

    try {
      result = await fn();
    } catch (err) {
      status = "error";
      attributes = { ...attributes, error: String(err) };
      thrownError = err;
    }

    const durationMs = Date.now() - start;
    const span = await this.logSpan(spanName, attributes, durationMs, { status });

    if (status === "error") {
      throw thrownError;
    }

    return { result, span };
  }

  /**
   * Read spans from a specific date's trace file.
   */
  async *readSpans(date: string): AsyncGenerator<TraceSpan> {
    const filePath = join(this.tracesDir, `trace-${date}.jsonl`);

    let fh;
    try {
      fh = await open(filePath, "r");
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }

    const rl = createInterface({
      input: fh.createReadStream({ encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    try {
      for await (const line of rl) {
        if (!line.trim()) continue;
        yield JSON.parse(line) as TraceSpan;
      }
    } finally {
      await fh.close();
    }
  }
}
