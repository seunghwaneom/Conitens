/**
 * canvas-charts.ts — Pure Canvas 2D chart drawing utilities.
 *
 * All functions take a CanvasRenderingContext2D and render a complete
 * chart into it.  They are intentionally side-effect-free (no store
 * reads) and accept all data as parameters so they can be unit-tested
 * without a DOM.
 *
 * Design language: dark command-center aesthetic.
 *   - Background: #0a0a12 with subtle grid
 *   - Grid lines:  #1e2a3a (dim blue-grey)
 *   - Text:        #8db8d8 (muted blue-white) / #c8e8ff (bright)
 *   - Accent lines: accent colour passed in
 *   - Alert/error: #ff4444
 *   - Warning:     #ffaa00
 *   - OK/active:   #33ee88
 *
 * Canvas coordinate convention:
 *   (0,0) = top-left, x+ = right, y+ = down.
 *
 * Chart types implemented:
 *   drawLineChart     — time-series line with fill area
 *   drawBarChart      — vertical grouped bars
 *   drawHBarChart     — horizontal bar (status breakdown)
 *   drawDonutChart    — segmented donut / ring chart
 *   drawTextPanel     — terminal-style scrolling text log
 *   drawAgentStatusPanel  — combined bar + count grid
 *   drawSystemPanel       — dual-line chart (CPU + MEM) + numeric readouts
 *   drawTaskQueuePanel    — queue depth line + bar
 *   drawThroughputPanel   — throughput sparkline + numeric
 *   drawLatencyPanel      — P95 task latency sparkline + gauge (Sub-AC 6b)
 *   drawEventLogPanel     — recent event log (text lines)
 *   drawKnowledgePanel    — mini knowledge-graph placeholder
 *   drawApprovalPanel     — approval queue list
 */

// ── Colour palette ─────────────────────────────────────────────────────────

export const C = {
  bg:         "#050810",
  bgGrid:     "#0d1520",
  gridLine:   "#1a2535",
  textDim:    "#4a6a8a",
  textMid:    "#7aaccc",
  textBright: "#c0e4ff",
  active:     "#33ee88",
  idle:       "#4488cc",
  busy:       "#ffaa22",
  error:      "#ff4455",
  inactive:   "#334455",
  cpu:        "#44ccff",
  mem:        "#aa66ff",
  queue:      "#ff9944",
  thru:       "#44ffcc",
  /** P95 task latency — cyan-violet to suggest measurement / precision. */
  latency:    "#cc88ff",
  white:      "#ffffff",
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Convert a hex colour to CSS rgba with given opacity. */
function hexAlpha(hex: string, alpha: number): string {
  // Expand short hex
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Draw the standard dark-grid background. */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  accentColor?: string,
): void {
  // Base background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle grid
  ctx.strokeStyle = C.gridLine;
  ctx.lineWidth = 0.5;
  const GRID = 32;
  for (let x = 0; x <= w; x += GRID) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += GRID) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Accent border glow (top edge)
  if (accentColor) {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0,   hexAlpha(accentColor, 0));
    grad.addColorStop(0.5, hexAlpha(accentColor, 0.7));
    grad.addColorStop(1,   hexAlpha(accentColor, 0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 1); ctx.lineTo(w, 1);
    ctx.stroke();

    // Bottom edge
    const grad2 = ctx.createLinearGradient(0, h-1, w, h-1);
    grad2.addColorStop(0,   hexAlpha(accentColor, 0));
    grad2.addColorStop(0.5, hexAlpha(accentColor, 0.3));
    grad2.addColorStop(1,   hexAlpha(accentColor, 0));
    ctx.strokeStyle = grad2;
    ctx.beginPath();
    ctx.moveTo(0, h-1); ctx.lineTo(w, h-1);
    ctx.stroke();
  }
}

/** Draw a section title bar. */
function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  x: number,
  y: number,
  w: number,
  accentColor: string,
): void {
  ctx.fillStyle = hexAlpha(accentColor, 0.15);
  ctx.fillRect(x, y, w, 20);

  ctx.fillStyle = accentColor;
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(title.toUpperCase(), x + 8, y + 10);
}

/** Draw a small label. */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string = C.textMid,
  align: CanvasTextAlign = "left",
  size = 10,
): void {
  ctx.fillStyle = color;
  ctx.font = `${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

// ── Line chart ─────────────────────────────────────────────────────────────

export interface LineChartOptions {
  color:      string;
  /** Fill area under line with translucent gradient. */
  fill?:      boolean;
  lineWidth?: number;
  /** Normalise data to 0-100 range. If false, use raw values. */
  autoScale?: boolean;
  yMin?:      number;
  yMax?:      number;
}

/**
 * Draw a single-series time-series line chart into a rectangular region.
 *
 * @param ctx       Canvas 2D context.
 * @param values    Array of y-values (will be mapped to the height).
 * @param x,y,w,h  Destination bounding box (in canvas pixels).
 * @param opts      Visual options.
 */
export function drawLineChart(
  ctx: CanvasRenderingContext2D,
  values: number[],
  x: number,
  y: number,
  w: number,
  h: number,
  opts: LineChartOptions,
): void {
  if (values.length < 2) return;

  const { color, fill = true, lineWidth = 1.5, autoScale = true } = opts;

  let yMin = opts.yMin ?? 0;
  let yMax = opts.yMax ?? 100;

  if (autoScale) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    yMin = Math.max(0, min - range * 0.1);
    yMax = max + range * 0.1;
  }

  const span = yMax - yMin || 1;
  const PAD = 2;
  const chartH = h - PAD * 2;

  // Map value → canvas y (inverted, 0=bottom)
  const toY = (v: number) =>
    y + h - PAD - ((v - yMin) / span) * chartH;

  // Map index → canvas x
  const n   = values.length;
  const toX = (i: number) => x + PAD + (i / (n - 1)) * (w - PAD * 2);

  // Clip to region
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Fill gradient under line
  if (fill) {
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, hexAlpha(color, 0.35));
    grad.addColorStop(1, hexAlpha(color, 0.02));

    ctx.beginPath();
    ctx.moveTo(toX(0), y + h);
    for (let i = 0; i < n; i++) ctx.lineTo(toX(i), toY(values[i]));
    ctx.lineTo(toX(n - 1), y + h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Line
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(values[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(toX(i), toY(values[i]));
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Latest value dot
  const lx = toX(n - 1);
  const ly = toY(values[n - 1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

// ── Dual-series line chart ──────────────────────────────────────────────────

/**
 * Draw two overlapping time-series lines in the same region.
 * Useful for CPU + Memory overlaid.
 */
export function drawDualLineChart(
  ctx: CanvasRenderingContext2D,
  series1: number[],
  color1: string,
  series2: number[],
  color2: string,
  x: number,
  y: number,
  w: number,
  h: number,
  yMax = 100,
): void {
  drawLineChart(ctx, series1, x, y, w, h, { color: color1, fill: true,  yMin: 0, yMax, autoScale: false, lineWidth: 1.5 });
  drawLineChart(ctx, series2, x, y, w, h, { color: color2, fill: false, yMin: 0, yMax, autoScale: false, lineWidth: 1.5 });
}

// ── Vertical bar chart ─────────────────────────────────────────────────────

export interface BarEntry {
  label: string;
  value: number;
  color: string;
}

/**
 * Draw a vertical bar chart.
 */
export function drawBarChart(
  ctx: CanvasRenderingContext2D,
  entries: BarEntry[],
  x: number,
  y: number,
  w: number,
  h: number,
  maxValue?: number,
): void {
  if (entries.length === 0) return;
  const max = maxValue ?? Math.max(...entries.map(e => e.value), 1);

  const PAD   = 4;
  const LABEL = 14;
  const chartH = h - PAD - LABEL;
  const gap    = 4;
  const barW   = (w - PAD * 2 - gap * (entries.length - 1)) / entries.length;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  entries.forEach((e, i) => {
    const bx = x + PAD + i * (barW + gap);
    const bh = (e.value / max) * chartH;
    const by = y + chartH - bh + PAD;

    // Bar glow (background)
    ctx.fillStyle = hexAlpha(e.color, 0.15);
    ctx.fillRect(bx, y + PAD, barW, chartH);

    // Bar fill
    ctx.fillStyle = hexAlpha(e.color, 0.7);
    ctx.fillRect(bx, by, barW, bh);

    // Top cap line
    ctx.fillStyle = e.color;
    ctx.fillRect(bx, by, barW, 2);

    // Label
    ctx.fillStyle = C.textDim;
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(e.label, bx + barW / 2, y + h - LABEL + 2);

    // Value
    if (e.value > 0) {
      ctx.fillStyle = e.color;
      ctx.font = "9px monospace";
      ctx.textBaseline = "bottom";
      ctx.fillText(String(e.value), bx + barW / 2, by - 1);
    }
  });

  ctx.restore();
}

// ── Horizontal bar (single metric gauge) ───────────────────────────────────

/**
 * Draw a single horizontal progress bar (gauge).
 *
 * @param value  0-100 percent.
 */
export function drawHBar(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: number,
  color: string,
  x: number,
  y: number,
  w: number,
  h = 14,
): void {
  const pct = Math.max(0, Math.min(100, value)) / 100;

  // Track
  ctx.fillStyle = hexAlpha(color, 0.12);
  ctx.fillRect(x, y, w, h);

  // Fill
  ctx.fillStyle = hexAlpha(color, 0.65);
  ctx.fillRect(x, y, Math.round(w * pct), h);

  // Leading edge glow
  const gx = x + Math.round(w * pct);
  if (pct > 0.02) {
    ctx.fillStyle = color;
    ctx.fillRect(gx - 2, y, 2, h);
  }

  // Label
  ctx.fillStyle = C.textBright;
  ctx.font      = "10px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 4, y + h / 2);

  // Percentage
  ctx.fillStyle = color;
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(value)}%`, x + w - 4, y + h / 2);
}

// ── Donut chart ────────────────────────────────────────────────────────────

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Draw a donut (ring) chart.
 */
export function drawDonutChart(
  ctx: CanvasRenderingContext2D,
  segments: DonutSegment[],
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): void {
  const total = segments.reduce((s, e) => s + e.value, 0);
  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = C.textDim;
    ctx.lineWidth = outerR - innerR;
    ctx.stroke();
    return;
  }

  let angle = -Math.PI / 2;
  const GAP = 0.04; // radians between segments

  for (const seg of segments) {
    const sweep = (seg.value / total) * (Math.PI * 2 - GAP * segments.length);
    if (sweep <= 0) { angle += GAP; continue; }

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, angle + GAP / 2, angle + sweep);
    ctx.arc(cx, cy, innerR, angle + sweep, angle + GAP / 2, true);
    ctx.closePath();
    ctx.fillStyle = hexAlpha(seg.color, 0.75);
    ctx.fill();

    // Outer ring highlight
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, angle + GAP / 2, angle + sweep);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    angle += sweep + GAP;
  }

  // Centre text (total)
  ctx.fillStyle = C.textBright;
  ctx.font = `bold ${Math.round(outerR * 0.4)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(total), cx, cy - 4);
  ctx.fillStyle = C.textDim;
  ctx.font = `${Math.round(outerR * 0.22)}px monospace`;
  ctx.fillText("AGENTS", cx, cy + outerR * 0.25);
}

// ── Text panel ─────────────────────────────────────────────────────────────

export interface TextLine {
  text:   string;
  color?: string;
  bold?:  boolean;
  size?:  number;
}

/**
 * Render terminal-style text lines in a rectangle.
 *
 * Lines are rendered top-to-bottom; if they exceed the height they
 * are clipped.  The oldest lines (at the top) fade out.
 */
export function drawTextPanel(
  ctx: CanvasRenderingContext2D,
  lines: TextLine[],
  x: number,
  y: number,
  w: number,
  h: number,
  lineH = 14,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const maxLines = Math.floor(h / lineH);
  const visible  = lines.slice(-maxLines); // take the last N lines

  visible.forEach((ln, i) => {
    const ly = y + i * lineH + lineH * 0.8;
    const alpha = 0.4 + 0.6 * (i / (visible.length - 1 || 1));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ln.color ?? C.textMid;
    ctx.font = `${ln.bold ? "bold " : ""}${ln.size ?? 10}px monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(ln.text, x + 4, ly);
  });

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Numeric readout ────────────────────────────────────────────────────────

/**
 * Draw a big numeric readout (value + label) centred in a box.
 */
export function drawNumericReadout(
  ctx: CanvasRenderingContext2D,
  value: string,
  label: string,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  // Box
  ctx.strokeStyle = hexAlpha(color, 0.35);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Value
  const fSize = Math.max(14, Math.floor(h * 0.42));
  ctx.fillStyle = color;
  ctx.font = `bold ${fSize}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(value, x + w / 2, y + h * 0.45);

  // Label
  ctx.fillStyle = C.textDim;
  ctx.font = "9px monospace";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, x + w / 2, y + h - 3);
}

// ── High-level panel renderers ─────────────────────────────────────────────

import type { AgentStatusCounts, MetricsSnapshot, TimeSeries } from "../store/metrics-store.js";

function tsValues(series: TimeSeries): number[] {
  return series.map(s => s.value);
}

// ── Agent Status Panel (for status-board, wall-monitor-array) ──────────────

/**
 * Draw the "agent status overview" panel.
 * Shows: bar chart of counts by status + donut ring + last-updated.
 */
export function drawAgentStatusPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "● AGENT STATUS", 0, 0, w, accentColor);

  const { agentCounts } = snap;
  const ts = new Date(snap.ts).toLocaleTimeString();

  // Donut chart (left half, centred)
  const donutX = Math.round(w * 0.28);
  const donutY = Math.round(h * 0.5);
  const outerR = Math.round(Math.min(w * 0.22, h * 0.35));
  const innerR = Math.round(outerR * 0.56);

  const segments = [
    { label: "active",     value: agentCounts.active,     color: C.active   },
    { label: "idle",       value: agentCounts.idle,       color: C.idle     },
    { label: "busy",       value: agentCounts.busy,       color: C.busy     },
    { label: "error",      value: agentCounts.error,      color: C.error    },
    { label: "inactive",   value: agentCounts.inactive,   color: C.inactive },
    { label: "terminated", value: agentCounts.terminated, color: C.textDim  },
  ].filter(s => s.value > 0);

  drawDonutChart(ctx, segments, donutX, donutY, outerR, innerR);

  // Bar chart (right half)
  const bx = Math.round(w * 0.52);
  const by = 28;
  const bw = w - bx - 8;
  const bh = h - by - 20;

  const entries = [
    { label: "ACT", value: agentCounts.active,     color: C.active   },
    { label: "IDL", value: agentCounts.idle,       color: C.idle     },
    { label: "BSY", value: agentCounts.busy,       color: C.busy     },
    { label: "ERR", value: agentCounts.error,      color: C.error    },
    { label: "INA", value: agentCounts.inactive,   color: C.inactive },
  ];
  drawBarChart(ctx, entries, bx, by, bw, bh);

  // Timestamp
  drawLabel(ctx, `UPD ${ts}`, w - 4, h - 3, C.textDim, "right", 8);
}

// ── System Metrics Panel (CPU + MEM) ───────────────────────────────────────

/**
 * Draw the system resource panel (CPU + Memory time-series + current values).
 */
export function drawSystemPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cpuHistory: TimeSeries,
  memHistory: TimeSeries,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "▸ SYSTEM RESOURCES", 0, 0, w, accentColor);

  const PAD = 8;
  const TOP = 26;

  // Dual line chart (full width, upper 55% of chart area)
  const chartH = Math.round((h - TOP) * 0.55);
  drawDualLineChart(
    ctx,
    tsValues(cpuHistory), C.cpu,
    tsValues(memHistory),  C.mem,
    PAD, TOP, w - PAD * 2, chartH,
    100,
  );

  // Legend
  const lx = PAD + 4;
  const ly = TOP + chartH + 4;
  ctx.fillStyle = C.cpu; ctx.fillRect(lx, ly, 16, 2);
  drawLabel(ctx, "CPU", lx + 20, ly + 4, C.cpu, "left", 9);
  ctx.fillStyle = C.mem; ctx.fillRect(lx + 50, ly, 16, 2);
  drawLabel(ctx, "MEM", lx + 74, ly + 4, C.mem, "left", 9);

  // Horizontal gauges
  const gy    = ly + 14;
  const gaugeH = Math.min(14, Math.round((h - gy - PAD) / 3));
  const gaugeW = w - PAD * 2;

  drawHBar(ctx, "CPU", snap.system.cpu,    C.cpu,    PAD, gy,              gaugeW, gaugeH);
  drawHBar(ctx, "MEM", snap.system.memory, C.mem,    PAD, gy + gaugeH + 3, gaugeW, gaugeH);
  drawHBar(ctx, "THR", Math.min(100, snap.system.eventsPerTick * 2.5), C.thru, PAD, gy + (gaugeH + 3) * 2, gaugeW, gaugeH);

  drawLabel(ctx, `TICK ${new Date(snap.ts).toLocaleTimeString()}`, w - 4, h - 3, C.textDim, "right", 8);
}

// ── Task Queue Panel ───────────────────────────────────────────────────────

/**
 * Draw the task queue depth panel.
 */
export function drawTaskQueuePanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  queueHistory: TimeSeries,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "◈ TASK QUEUE", 0, 0, w, accentColor);

  const PAD = 8;
  const TOP = 26;
  const readoutW = Math.round(w * 0.28);
  const chartW   = w - PAD - readoutW - PAD * 2;

  // Large numeric readout on left
  drawNumericReadout(
    ctx,
    String(snap.taskQueue),
    "PENDING",
    accentColor,
    PAD, TOP,
    readoutW,
    Math.round((h - TOP) * 0.5),
  );

  // Line chart on right
  drawLineChart(
    ctx,
    tsValues(queueHistory),
    PAD + readoutW + PAD,
    TOP,
    chartW,
    h - TOP - PAD,
    { color: C.queue, fill: true, yMin: 0, autoScale: true },
  );

  // Status line
  const status = snap.taskQueue === 0 ? "CLEAR"
               : snap.taskQueue < 5   ? "NORMAL"
               : snap.taskQueue < 10  ? "HIGH"
               : "OVERLOAD";
  const statusColor = snap.taskQueue === 0 ? C.active
                    : snap.taskQueue < 5   ? C.idle
                    : snap.taskQueue < 10  ? C.busy
                    : C.error;
  drawLabel(ctx, status, PAD + readoutW / 2, TOP + Math.round((h - TOP) * 0.5) + 14, statusColor, "center", 10);
}

// ── Throughput Panel ───────────────────────────────────────────────────────

/**
 * Draw the event throughput sparkline panel.
 */
export function drawThroughputPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  thruHistory: TimeSeries,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "≋ THROUGHPUT", 0, 0, w, accentColor);

  const PAD = 8;
  const TOP = 26;

  // Sparkline fills most of the panel
  drawLineChart(
    ctx,
    tsValues(thruHistory),
    PAD, TOP, w - PAD * 2, h - TOP - 28,
    { color: C.thru, fill: true, yMin: 0, autoScale: true, lineWidth: 2 },
  );

  // Current value (bottom)
  const val = snap.system.eventsPerTick;
  drawLabel(ctx, `${val} ev/tick`, PAD, h - 10, C.thru, "left", 11);
  drawLabel(ctx, "EVENTS/TICK", w - PAD, h - 10, C.textDim, "right", 9);
}

// ── Latency Panel — Sub-AC 6b ──────────────────────────────────────────────

/**
 * Draw the P95 task latency panel.
 *
 * Layout:
 *   Top-left: large numeric readout (ms value)
 *   Right:     sparkline (latency time series)
 *   Bottom:    SLO threshold gauge (0 → LATENCY_SLO_MS)
 *
 * Colour coding:
 *   < 200 ms  → idle/low (cyan-violet)
 *   200-500   → healthy (active green)
 *   500-1000  → busy/moderate (amber)
 *   > 1000 ms → overload/warning (red)
 *
 * @param ctx             Canvas 2D context
 * @param w               Canvas width
 * @param h               Canvas height
 * @param latencyHistory  Rolling latency time series (ms values)
 * @param snap            Current metrics snapshot (for latencyMs)
 * @param accentColor     Room/entity accent colour
 */
export function drawLatencyPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  latencyHistory: TimeSeries,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  const SLO_MS = 2_000; // 2 s SLO threshold → 100 % gauge

  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "⟳ LATENCY P95", 0, 0, w, accentColor);

  const PAD = 8;
  const TOP = 26;
  const readoutW = Math.round(w * 0.30);
  const chartW   = w - PAD - readoutW - PAD * 2;

  const latencyMs = snap.system.latencyMs ?? 0;

  // Classify latency level for colour selection
  const latencyColor =
    latencyMs > 1_000 ? C.error  :
    latencyMs > 500   ? C.busy   :
    latencyMs > 200   ? C.active :
    C.latency;

  // Large numeric readout: current latency in ms
  drawNumericReadout(
    ctx,
    `${Math.round(latencyMs)}`,
    "P95 MS",
    latencyColor,
    PAD, TOP,
    readoutW,
    Math.round((h - TOP) * 0.45),
  );

  // Latency trend sparkline (right column)
  const values = tsValues(latencyHistory);
  if (values.length >= 2) {
    drawLineChart(
      ctx,
      values,
      PAD + readoutW + PAD,
      TOP,
      chartW,
      h - TOP - 28,
      {
        color:     latencyColor,
        fill:      true,
        yMin:      0,
        autoScale: true,
        lineWidth: 2,
      },
    );
  }

  // SLO gauge bar (bottom) — shows how close current latency is to the SLO
  const sloFraction = Math.min(1, latencyMs / SLO_MS);
  const gaugeY = h - 22;
  const gaugeW = w - PAD * 2;
  const gaugeH = 10;

  // Gauge track
  ctx.fillStyle = hexAlpha(latencyColor, 0.12);
  ctx.fillRect(PAD, gaugeY, gaugeW, gaugeH);

  // Gauge fill
  ctx.fillStyle = hexAlpha(latencyColor, 0.65);
  ctx.fillRect(PAD, gaugeY, Math.round(gaugeW * sloFraction), gaugeH);

  // Leading edge
  if (sloFraction > 0.02) {
    ctx.fillStyle = latencyColor;
    ctx.fillRect(PAD + Math.round(gaugeW * sloFraction) - 2, gaugeY, 2, gaugeH);
  }

  // SLO label
  ctx.fillStyle = C.textDim;
  ctx.font      = "9px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("SLO", PAD, gaugeY + gaugeH + 7);
  ctx.textAlign = "right";
  ctx.fillStyle = latencyColor;
  ctx.fillText(`${Math.round(sloFraction * 100)}%`, w - PAD, gaugeY + gaugeH + 7);

  // Latency status label below the readout
  const statusLabel =
    latencyMs > 1_000 ? "OVERLOAD" :
    latencyMs > 500   ? "SLOW"     :
    latencyMs > 200   ? "NOMINAL"  :
    "FAST";
  drawLabel(ctx, statusLabel, PAD + readoutW / 2, TOP + Math.round((h - TOP) * 0.45) + 12, latencyColor, "center", 9);
}

// ── Event Log Panel ────────────────────────────────────────────────────────

/**
 * Generate plausible simulated event log lines from snapshot data.
 */
function generateEventLogLines(snap: MetricsSnapshot): TextLine[] {
  const t = new Date(snap.ts);
  const hh = t.getHours().toString().padStart(2, "0");
  const mm = t.getMinutes().toString().padStart(2, "0");
  const ss = t.getSeconds().toString().padStart(2, "0");
  const ts = `${hh}:${mm}:${ss}`;

  const lines: TextLine[] = [
    { text: `[${ts}] agent.tick → ${snap.agentCounts.active} active`, color: C.active },
    { text: `[${ts}] queue.depth = ${snap.taskQueue}`, color: snap.taskQueue > 8 ? C.error : C.queue },
    { text: `[${ts}] cpu=${snap.system.cpu}% mem=${snap.system.memory}%`, color: C.textMid },
    { text: `[${ts}] events/tick=${snap.system.eventsPerTick}`, color: C.thru },
  ];

  if (snap.agentCounts.error > 0) {
    lines.push({ text: `[${ts}] !! ${snap.agentCounts.error} agent(s) in ERROR`, color: C.error, bold: true });
  }
  if (snap.agentCounts.busy > 0) {
    lines.push({ text: `[${ts}] ${snap.agentCounts.busy} agent(s) BUSY`, color: C.busy });
  }

  // Room activity
  for (const [roomId, activity] of Object.entries(snap.roomActivity)) {
    if (activity === "active" || activity === "busy") {
      const c = activity === "busy" ? C.busy : C.active;
      lines.push({ text: `[${ts}] room.${roomId}=${activity.toUpperCase()}`, color: c });
    }
  }

  return lines;
}

/**
 * Draw a terminal-style recent event log panel.
 */
export function drawEventLogPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "⊞ EVENT LOG", 0, 0, w, accentColor);

  const lines = generateEventLogLines(snap);
  drawTextPanel(ctx, lines, 0, 22, w, h - 22, 13);
}

// ── Approval Queue Panel ───────────────────────────────────────────────────

/**
 * Draw a pending approvals queue panel.
 */
export function drawApprovalPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "✓ APPROVAL QUEUE", 0, 0, w, accentColor);

  const pending = snap.taskQueue;
  const lines: TextLine[] = [
    { text: `PENDING: ${pending}`, color: pending > 0 ? C.busy : C.active, bold: true, size: 14 },
    { text: "", color: C.textDim },
    { text: "AWAITING REVIEW:", color: C.textMid },
  ];

  if (pending === 0) {
    lines.push({ text: "  [no items pending]", color: C.active });
  } else {
    for (let i = 0; i < Math.min(pending, 5); i++) {
      lines.push({ text: `  #${1000 + i} impl-task-${(snap.ts + i) % 99}`, color: C.idle });
    }
    if (pending > 5) {
      lines.push({ text: `  ... +${pending - 5} more`, color: C.textDim });
    }
  }

  drawTextPanel(ctx, lines, 0, 22, w, h - 22, 15);
}

// ── Agent Cluster / Hologram Panel ─────────────────────────────────────────

/**
 * Draw the hologram-table panel: donut + active agent history sparkline.
 */
export function drawAgentClusterPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  activeAgentHistory: TimeSeries,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "◉ AGENT CLUSTER", 0, 0, w, accentColor);

  const cx = Math.round(w / 2);
  const TOP = 26;
  const donutH = Math.round((h - TOP) * 0.62);
  const cy = TOP + Math.round(donutH * 0.5);
  const outerR = Math.round(Math.min(w * 0.38, donutH * 0.48));
  const innerR = Math.round(outerR * 0.55);

  const segments = [
    { label: "active",   value: snap.agentCounts.active,   color: C.active   },
    { label: "idle",     value: snap.agentCounts.idle,     color: C.idle     },
    { label: "busy",     value: snap.agentCounts.busy,     color: C.busy     },
    { label: "error",    value: snap.agentCounts.error,    color: C.error    },
    { label: "inactive", value: snap.agentCounts.inactive, color: C.inactive },
  ].filter(s => s.value > 0);

  drawDonutChart(ctx, segments, cx, cy, outerR, innerR);

  // Sparkline below donut
  const PAD = 8;
  const sy  = TOP + donutH + 4;
  drawLineChart(
    ctx,
    tsValues(activeAgentHistory),
    PAD, sy, w - PAD * 2, h - sy - PAD,
    { color: C.active, fill: true, yMin: 0, autoScale: true, lineWidth: 2 },
  );
  drawLabel(ctx, "ACTIVE HISTORY", w / 2, h - 4, C.textDim, "center", 8);
}

// ── Knowledge Graph Panel ─────────────────────────────────────────────────

/**
 * Draw a stylised knowledge-graph metrics panel.
 */
export function drawKnowledgePanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "◆ KNOWLEDGE GRAPH", 0, 0, w, accentColor);

  const PAD = 10;
  const TOP = 28;

  // Simulated knowledge metrics derived from throughput
  const nodes   = 120 + Math.round(snap.system.eventsPerTick * 3.5);
  const edges   = Math.round(nodes * 1.8);
  const density = Math.min(100, Math.round((edges / (nodes * (nodes - 1) / 2)) * 100 * 50));

  // 2×2 readout grid
  const rw = Math.round((w - PAD * 3) / 2);
  const rh = Math.round((h - TOP - PAD * 3) / 2);
  const entries: [string, string, string][] = [
    ["NODES",    String(nodes),          accentColor],
    ["EDGES",    String(edges),          C.thru],
    ["DENSITY",  `${density}%`,          C.mem],
    ["QUERIES/s", String(snap.system.eventsPerTick), C.cpu],
  ];

  entries.forEach(([label, val, color], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawNumericReadout(
      ctx, val, label, color,
      PAD + col * (rw + PAD),
      TOP + PAD + row * (rh + PAD),
      rw, rh,
    );
  });
}

// ── Gate Status Panel ──────────────────────────────────────────────────────

/**
 * Draw the validation gate status panel.
 */
export function drawGateStatusPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "▣ GATE STATUS", 0, 0, w, accentColor);

  const PAD = 8;
  const TOP = 26;

  const gates = [
    { name: "LINT",    ok: snap.agentCounts.error === 0 },
    { name: "TESTS",   ok: snap.system.cpu < 85 },
    { name: "TYPES",   ok: snap.agentCounts.error < 2 },
    { name: "BUILD",   ok: snap.taskQueue < 15 },
    { name: "REVIEW",  ok: snap.agentCounts.active > 0 },
    { name: "MERGE",   ok: snap.taskQueue < 5 },
  ];

  const rowH = Math.round((h - TOP - PAD) / gates.length);

  gates.forEach((gate, i) => {
    const gy     = TOP + i * rowH;
    const color  = gate.ok ? C.active : C.error;
    const status = gate.ok ? "PASS" : "FAIL";

    // Background strip
    ctx.fillStyle = hexAlpha(color, 0.06);
    ctx.fillRect(PAD, gy + 1, w - PAD * 2, rowH - 2);

    // Status indicator dot
    ctx.beginPath();
    ctx.arc(PAD + 10, gy + rowH / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Gate name
    ctx.fillStyle = C.textBright;
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(gate.name, PAD + 22, gy + rowH / 2);

    // Status
    ctx.fillStyle = color;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "right";
    ctx.fillText(status, w - PAD, gy + rowH / 2);
  });
}

// ── Diff / File viewer Panel ───────────────────────────────────────────────

/**
 * Draw a simulated diff-screen / file browser panel.
 */
export function drawDiffPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: MetricsSnapshot,
  accentColor: string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "≡ DIFF VIEWER", 0, 0, w, accentColor);

  // Simulated diff lines
  const tick = snap.ts;
  const lines: TextLine[] = [
    { text: `--- a/src/task-${(tick >> 10) % 20}.ts`,  color: C.error },
    { text: `+++ b/src/task-${(tick >> 10) % 20}.ts`,  color: C.active },
    { text: `@@ -12,7 +12,8 @@`,                        color: C.textDim },
    { text: `-  const old = getValue();`,                color: C.error },
    { text: `+  const val = getValue();`,                color: C.active },
    { text: `+  validate(val);`,                        color: C.active },
    { text: `   if (!val) return null;`,                color: C.textMid },
    { text: `   return transform(val);`,                color: C.textMid },
    { text: "",                                         color: C.textDim },
    { text: `★ ${snap.agentCounts.active} agents active`, color: accentColor },
  ];

  drawTextPanel(ctx, lines, 0, 22, w, h - 22, 13);
}

// ── Timeline Panel ─────────────────────────────────────────────────────────

/**
 * Draw a timeline wall panel (multi-series + labels).
 */
export function drawTimelinePanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cpuHistory:   TimeSeries,
  memHistory:   TimeSeries,
  thruHistory:  TimeSeries,
  snap:         MetricsSnapshot,
  accentColor:  string,
): void {
  drawBackground(ctx, w, h, accentColor);
  drawTitle(ctx, "▶ TIMELINE", 0, 0, w, accentColor);

  const PAD = 8;
  const TOP = 26;
  const seriesH = Math.round((h - TOP - PAD * 4) / 3);

  const series = [
    { label: "CPU %",    values: tsValues(cpuHistory),  color: C.cpu,   yMax: 100 },
    { label: "MEM %",    values: tsValues(memHistory),   color: C.mem,   yMax: 100 },
    { label: "EV/TICK",  values: tsValues(thruHistory),  color: C.thru,  yMax: 50  },
  ];

  series.forEach(({ label, values, color, yMax }, i) => {
    const sy = TOP + PAD + i * (seriesH + PAD);
    drawLabel(ctx, label, PAD + 4, sy + 10, color, "left", 9);
    drawLineChart(ctx, values, PAD, sy + 14, w - PAD * 2, seriesH - 14, {
      color, fill: true, yMin: 0, yMax, autoScale: false,
    });
    // Latest value
    const last = values[values.length - 1] ?? 0;
    drawLabel(ctx, `${Math.round(last)}`, w - PAD, sy + 10, color, "right", 9);
  });
}

// ── Master dispatch ────────────────────────────────────────────────────────

/** Which chart type to render for a given furniture slot type. */
export type ScreenChartType =
  | "agent-status"
  | "system-overview"
  | "task-queue"
  | "throughput"
  | "latency"       // Sub-AC 6b: P95 task latency sparkline
  | "gate-status"
  | "diff-viewer"
  | "event-log"
  | "approval-queue"
  | "agent-cluster"
  | "knowledge-graph"
  | "timeline";

export const FURNITURE_CHART_MAP: Readonly<Record<string, ScreenChartType>> = {
  // Wall panels
  "status-board":       "agent-status",
  "wall-monitor-array": "system-overview",
  "task-board":         "task-queue",
  "timeline-wall":      "timeline",
  "gate-status-board":  "gate-status",
  // Sub-AC 6b: latency monitor — shows P95 task latency for SLO tracking
  "latency-monitor":    "latency",
  // Monitors
  "diff-screen":            "diff-viewer",
  "ui-preview-screen":      "system-overview",
  "approval-terminal":      "approval-queue",
  "file-browser-terminal":  "event-log",
  "replay-terminal":        "event-log",
  // Hologram stands
  "hologram-table":          "agent-cluster",
  "knowledge-graph-display": "knowledge-graph",
} as const;

/** All data needed to draw any chart. */
export interface ChartDataBundle {
  snap:               MetricsSnapshot;
  cpuHistory:         TimeSeries;
  memHistory:         TimeSeries;
  taskQueueHistory:   TimeSeries;
  throughputHistory:  TimeSeries;
  activeAgentHistory: TimeSeries;
  /**
   * Rolling P95 task latency time series (ms). Sub-AC 6b.
   * Optional for backward compatibility — charts fall back to an empty series
   * when not provided.
   */
  latencyHistory?:    TimeSeries;
}

/**
 * Draw the appropriate chart for a given furniture type onto the canvas.
 *
 * @param ctx         Canvas 2D context (already sized to w×h)
 * @param chartType   One of the ScreenChartType values
 * @param w           Canvas width in pixels
 * @param h           Canvas height in pixels
 * @param data        Metrics data bundle
 * @param accentColor Hex accent colour string from the room definition
 */
export function drawChartForType(
  ctx: CanvasRenderingContext2D,
  chartType: ScreenChartType,
  w: number,
  h: number,
  data: ChartDataBundle,
  accentColor: string,
): void {
  switch (chartType) {
    case "agent-status":
      drawAgentStatusPanel(ctx, w, h, data.snap, accentColor);
      break;
    case "system-overview":
      drawSystemPanel(ctx, w, h, data.cpuHistory, data.memHistory, data.snap, accentColor);
      break;
    case "task-queue":
      drawTaskQueuePanel(ctx, w, h, data.taskQueueHistory, data.snap, accentColor);
      break;
    case "throughput":
      drawThroughputPanel(ctx, w, h, data.throughputHistory, data.snap, accentColor);
      break;
    case "latency":
      drawLatencyPanel(ctx, w, h, data.latencyHistory ?? [], data.snap, accentColor);
      break;
    case "gate-status":
      drawGateStatusPanel(ctx, w, h, data.snap, accentColor);
      break;
    case "diff-viewer":
      drawDiffPanel(ctx, w, h, data.snap, accentColor);
      break;
    case "event-log":
      drawEventLogPanel(ctx, w, h, data.snap, accentColor);
      break;
    case "approval-queue":
      drawApprovalPanel(ctx, w, h, data.snap, accentColor);
      break;
    case "agent-cluster":
      drawAgentClusterPanel(ctx, w, h, data.activeAgentHistory, data.snap, accentColor);
      break;
    case "knowledge-graph":
      drawKnowledgePanel(ctx, w, h, data.snap, accentColor);
      break;
    case "timeline":
      drawTimelinePanel(ctx, w, h, data.cpuHistory, data.memHistory, data.throughputHistory, data.snap, accentColor);
      break;
    default:
      drawEventLogPanel(ctx, w, h, data.snap, accentColor);
  }
}
