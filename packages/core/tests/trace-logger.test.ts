import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TraceLogger } from "../src/traces/trace-logger.js";
import type { TraceSpan } from "../src/traces/trace-logger.js";

describe("TraceLogger", () => {
  let tempDir: string;
  let tracesDir: string;
  let logger: TraceLogger;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "conitens-trace-test-"));
    tracesDir = join(tempDir, "traces");
    logger = new TraceLogger(tracesDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("logs a span to daily trace file", async () => {
    const span = await logger.logSpan("test.operation", { key: "value" }, 150);

    expect(span.trace_id).toBeTruthy();
    expect(span.span_id).toBeTruthy();
    expect(span.name).toBe("test.operation");
    expect(span.duration_ms).toBe(150);
    expect(span.status).toBe("ok");
    expect(span.attributes.key).toBe("value");
  });

  it("writes to trace-YYYY-MM-DD.jsonl file", async () => {
    await logger.logSpan("test.op", {}, 100);

    const files = await readdir(tracesDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^trace-\d{4}-\d{2}-\d{2}\.jsonl$/);
  });

  it("reads back logged spans", async () => {
    await logger.logSpan("span.one", { n: 1 }, 50);
    await logger.logSpan("span.two", { n: 2 }, 100);

    const date = new Date().toISOString().slice(0, 10);
    const spans: TraceSpan[] = [];
    for await (const span of logger.readSpans(date)) {
      spans.push(span);
    }

    expect(spans.length).toBe(2);
    expect(spans[0].name).toBe("span.one");
    expect(spans[1].name).toBe("span.two");
  });

  it("uses active trace ID across spans", async () => {
    const traceId = logger.startTrace();
    const span1 = await logger.logSpan("op.1", {}, 10);
    const span2 = await logger.logSpan("op.2", {}, 20);

    expect(span1.trace_id).toBe(traceId);
    expect(span2.trace_id).toBe(traceId);
  });

  it("generates unique span IDs", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const span = await logger.logSpan(`op.${i}`, {}, i);
      ids.add(span.span_id);
    }
    expect(ids.size).toBe(10);
  });

  it("supports parent_span_id for nested spans", async () => {
    const parent = await logger.logSpan("parent", {}, 100);
    const child = await logger.logSpan("child", {}, 50, {
      parentSpanId: parent.span_id,
    });

    expect(child.parent_span_id).toBe(parent.span_id);
    expect(child.trace_id).toBe(parent.trace_id);
  });
});
