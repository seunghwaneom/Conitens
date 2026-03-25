/**
 * scene-graph-order-check.test.ts — Sub-AC 5d scene-graph ordering verification.
 *
 * Sub-AC 5d: Enforce draw-order so mapping connectors are inserted into the
 * render pipeline IMMEDIATELY AFTER agents, verified by a scene-graph ordering
 * check.
 *
 * ── What this verifies ────────────────────────────────────────────────────────
 *
 * 1. Pipeline specification internal consistency (SCENE_PIPELINE_ORDER is valid).
 *
 * 2. "Immediately after agents" invariant in CommandCenterScene.tsx source:
 *    After the `{useHierarchy ? ... : ...}` agent-rendering ternary closes,
 *    the very next JSX component tag at the outer (Suspense-children) level
 *    is `<TaskConnectorsLayer`.  No unguarded geometry component may appear
 *    in this gap.
 *
 * 3. Full OUTER pipeline order matches SCENE_PIPELINE_ORDER specification:
 *    Each non-hierarchy-block slot's jsxElement appears in the source AFTER
 *    every preceding outer slot.
 *
 * 4. All "agents" kind slots appear BEFORE all "connectors" kind slots in the
 *    pipeline specification (structural kind-ordering guarantee).
 *
 * 5. BirdsEyeConnectorLayer appears after BirdsEyeLODLayer in the outer
 *    pipeline (bird's-eye draw order preserved).
 *
 * ── How it works ─────────────────────────────────────────────────────────────
 *
 * Tests read the SOURCE TEXT of CommandCenterScene.tsx and scene-pipeline-order.ts
 * using Node's `fs.readFileSync` — the same headless approach used in 5c tests.
 * This avoids any WebGL / React / Three.js dependency in the test runner.
 *
 * The "gap check" algorithm:
 *   1. Find the last line that contains `{useHierarchy ?` (start of agent ternary).
 *   2. Find the first occurrence of `<TaskConnectorsLayer` after that.
 *   3. Find the first occurrence of `)}` after the `{useHierarchy ?` line — this
 *      is the closing of the ternary.
 *   4. Extract all uppercase-first JSX component open-tags between the ternary
 *      close line and the `<TaskConnectorsLayer` line.
 *   5. Assert the extracted list is empty (no components in the gap).
 *
 * ── Coverage matrix ──────────────────────────────────────────────────────────
 *
 * 5d-1   SCENE_PIPELINE_ORDER has no duplicate slot ids
 * 5d-2   AGENTS_SLOT_INDEX ≥ 0 (agents-hierarchy slot exists)
 * 5d-3   CONNECTORS_SLOT_INDEX ≥ 0 (connectors slot exists)
 * 5d-4   CONNECTORS_SLOT_INDEX > AGENTS_SLOT_INDEX in the spec
 * 5d-5   validatePipelineOrderSpec() returns no errors
 * 5d-6   All "agents" kind slots precede all "connectors" kind slots in spec
 * 5d-7   OUTER_PIPELINE_SLOTS contains the connectors slot
 * 5d-8   In CommandCenterScene.tsx: TaskConnectorsLayer follows HierarchySceneGraph
 * 5d-9   Gap check: no JSX component tags between ternary-close and TaskConnectorsLayer
 * 5d-10  In source: TaskConnectorsLayer appears before RoomsFromRegistry (first in pipeline after agents)
 * 5d-11  Full outer pipeline order matches SCENE_PIPELINE_ORDER spec (sequential occurrence check)
 * 5d-12  BirdsEyeConnectorLayer appears after BirdsEyeLODLayer in source
 * 5d-13  BirdsEyeConnectorLayer slot is "connectors" kind in spec
 * 5d-14  All "connectors" kind slots in spec have kind === "connectors" (type integrity)
 * 5d-15  TaskConnectorsLayer appears before every non-connector, non-agent outer slot in spec
 * 5d-16  extractJsxComponentsInRange returns empty array for a gap with no components
 * 5d-17  extractJsxComponentsInRange correctly identifies uppercase component names
 * 5d-18  findFirstLine / findLastLine helpers return -1 for missing tokens
 * 5d-19  indexJsxComponents lists TaskConnectorsLayer before RoomsFromRegistry in source
 * 5d-20  FIRST_CONNECTOR_AFTER_AGENTS constant equals "TaskConnectorsLayer"
 * 5d-21  In source: agent-block close `)}` line < TaskConnectorsLayer line
 * 5d-22  In source: TaskConnectorsLayer is first connector-kind component in outer scope
 * 5d-23  OUTER_AGENT_BLOCK_CLOSE_MARKER present in CommandCenterScene.tsx source
 * 5d-24  Pipeline spec: "connectors" slot id exists at CONNECTORS_SLOT_INDEX
 * 5d-25  Scene source ordering covers all outer slots in SCENE_PIPELINE_ORDER
 *
 * Test ID scheme:
 *   5d-N : Sub-AC 5d (scene-graph draw-order enforcement)
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  SCENE_PIPELINE_ORDER,
  OUTER_PIPELINE_SLOTS,
  AGENTS_SLOT_INDEX,
  CONNECTORS_SLOT_INDEX,
  OUTER_AGENT_BLOCK_CLOSE_MARKER,
  FIRST_CONNECTOR_AFTER_AGENTS,
  validatePipelineOrderSpec,
  extractJsxComponentsInRange,
  findFirstLine,
  findLastLine,
  indexJsxComponents,
} from "../scene-pipeline-order.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared source loading
// ─────────────────────────────────────────────────────────────────────────────

let sceneSource: string = "";
let sceneLines: string[] = [];

beforeAll(async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { join, dirname } = await import("node:path");
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const scenePath = join(thisDir, "..", "CommandCenterScene.tsx");
  sceneSource = readFileSync(scenePath, "utf8");
  sceneLines = sceneSource.split("\n");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-1 through 5d-7 · Pipeline specification integrity
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-1: SCENE_PIPELINE_ORDER has no duplicate slot ids", () => {
  it("all slot ids are unique", () => {
    const ids = SCENE_PIPELINE_ORDER.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("Sub-AC 5d-2,3: AGENTS_SLOT_INDEX and CONNECTORS_SLOT_INDEX are found", () => {
  it("5d-2: AGENTS_SLOT_INDEX ≥ 0 — agents-hierarchy slot is present in the spec", () => {
    expect(AGENTS_SLOT_INDEX).toBeGreaterThanOrEqual(0);
  });

  it("5d-3: CONNECTORS_SLOT_INDEX ≥ 0 — connectors slot is present in the spec", () => {
    expect(CONNECTORS_SLOT_INDEX).toBeGreaterThanOrEqual(0);
  });

  it("5d-4: CONNECTORS_SLOT_INDEX > AGENTS_SLOT_INDEX — connectors come after agents in spec", () => {
    expect(CONNECTORS_SLOT_INDEX).toBeGreaterThan(AGENTS_SLOT_INDEX);
  });

  it("5d-24: Pipeline spec slot at CONNECTORS_SLOT_INDEX has id 'connectors'", () => {
    const connectorSlot = SCENE_PIPELINE_ORDER[CONNECTORS_SLOT_INDEX];
    expect(connectorSlot).toBeDefined();
    expect(connectorSlot!.id).toBe("connectors");
  });
});

describe("Sub-AC 5d-5: validatePipelineOrderSpec() returns no errors", () => {
  it("the pipeline specification is internally consistent", () => {
    const errors = validatePipelineOrderSpec();
    expect(errors).toEqual([]);
  });
});

describe("Sub-AC 5d-6: All 'agents' kind slots precede all 'connectors' kind slots in spec", () => {
  it("last agents-kind index < first connectors-kind index", () => {
    const agentIndices = SCENE_PIPELINE_ORDER
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s.kind === "agents")
      .map((x) => x.i);

    const connectorIndices = SCENE_PIPELINE_ORDER
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s.kind === "connectors")
      .map((x) => x.i);

    expect(agentIndices.length).toBeGreaterThan(0);
    expect(connectorIndices.length).toBeGreaterThan(0);

    const lastAgent    = Math.max(...agentIndices);
    const firstConnector = Math.min(...connectorIndices);

    expect(firstConnector).toBeGreaterThan(lastAgent);
  });
});

describe("Sub-AC 5d-7: OUTER_PIPELINE_SLOTS contains the connectors slot", () => {
  it("the TaskConnectorsLayer slot appears in the outer pipeline", () => {
    const connectorOuter = OUTER_PIPELINE_SLOTS.find((s) => s.id === "connectors");
    expect(connectorOuter).toBeDefined();
    expect(connectorOuter!.kind).toBe("connectors");
    expect(connectorOuter!.jsxElement).toBe("<TaskConnectorsLayer");
  });

  it("no agent-kind slot appears in the outer pipeline (all are insideHierarchyBlock)", () => {
    const outerAgents = OUTER_PIPELINE_SLOTS.filter((s) => s.kind === "agents");
    expect(outerAgents).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-8 · TaskConnectorsLayer follows HierarchySceneGraph in source
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-8: TaskConnectorsLayer appears after HierarchySceneGraph in source", () => {
  it("HierarchySceneGraph line < TaskConnectorsLayer line", () => {
    const hierarchyLine   = findFirstLine(sceneLines, "<HierarchySceneGraph");
    const connectorLine   = findFirstLine(sceneLines, "<TaskConnectorsLayer");

    expect(hierarchyLine,  "HierarchySceneGraph not found in source").toBeGreaterThan(-1);
    expect(connectorLine,  "TaskConnectorsLayer not found in source").toBeGreaterThan(-1);
    expect(connectorLine,  "TaskConnectorsLayer must come after HierarchySceneGraph")
      .toBeGreaterThan(hierarchyLine);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-9 · Gap check: no JSX components between ternary-close and TaskConnectorsLayer
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-9: Gap check — no JSX component between agent ternary close and TaskConnectorsLayer", () => {
  /**
   * Algorithm:
   * 1. Find the line of `{useHierarchy ?` (start of agent block).
   * 2. Find the line of `<TaskConnectorsLayer`.
   * 3. Find the LAST `)}` that occurs between those two lines — this is the
   *    ternary close.  (In the source the ternary block ends with `          )}`
   *    at the outer indent level.)
   * 4. Extract all uppercase-first JSX component open-tags in the gap between
   *    the ternary close line and the TaskConnectorsLayer line.
   * 5. Assert the list is empty.
   */
  it("no JSX component open-tags appear between the agent-block close and <TaskConnectorsLayer", () => {
    const agentBlockStartLine = findFirstLine(sceneLines, OUTER_AGENT_BLOCK_CLOSE_MARKER);
    const connectorLine       = findFirstLine(sceneLines, "<TaskConnectorsLayer");

    expect(agentBlockStartLine, `"${OUTER_AGENT_BLOCK_CLOSE_MARKER}" not found in source`)
      .toBeGreaterThan(-1);
    expect(connectorLine, "<TaskConnectorsLayer not found in source")
      .toBeGreaterThan(-1);

    // Find the closing `)}` of the ternary.  We look for `)}` lines that:
    //   - appear after the agent block start
    //   - appear before the connector line
    //   - are at the outer indentation level (contain `          )}` — 10 spaces)
    let ternaryCloseLine = -1;
    for (let i = agentBlockStartLine + 1; i < connectorLine; i++) {
      const line = sceneLines[i]!;
      // Match the closing `)}` of the ternary — note it may look like `          )}`
      // We use a simple heuristic: the line trims to exactly `)}` or starts with
      // whitespace and ends with `)}` and has no other significant content.
      if (/^\s+\)\}?\s*$/.test(line) && line.trimStart().startsWith(")")) {
        // Take the LAST such line before the connector (the ternary close is
        // the last `)}` before <TaskConnectorsLayer)
        ternaryCloseLine = i;
      }
    }

    expect(ternaryCloseLine, "Could not find the ternary-close `)}` before <TaskConnectorsLayer")
      .toBeGreaterThan(-1);

    // Now extract JSX component tags between ternaryCloseLine+1 and connectorLine
    const gapComponents = extractJsxComponentsInRange(
      sceneLines,
      ternaryCloseLine + 1,
      connectorLine,
    );

    expect(
      gapComponents,
      `Expected NO JSX components in gap between ternary-close (line ${ternaryCloseLine}) ` +
      `and <TaskConnectorsLayer (line ${connectorLine}), but found: [${gapComponents.join(", ")}]`,
    ).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-10 · TaskConnectorsLayer appears before RoomsFromRegistry
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-10: TaskConnectorsLayer appears before RoomsFromRegistry in source", () => {
  it("connector layer is rendered before the room layer", () => {
    const connectorLine = findFirstLine(sceneLines, "<TaskConnectorsLayer");
    const roomsLine     = findFirstLine(sceneLines, "<RoomsFromRegistry");

    expect(connectorLine, "<TaskConnectorsLayer not found").toBeGreaterThan(-1);
    expect(roomsLine,     "<RoomsFromRegistry not found").toBeGreaterThan(-1);
    expect(connectorLine, "TaskConnectorsLayer must come before RoomsFromRegistry")
      .toBeLessThan(roomsLine);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-11 · Full outer pipeline order matches spec (sequential occurrence check)
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-11: Full OUTER pipeline order in source matches SCENE_PIPELINE_ORDER spec", () => {
  /**
   * Walk OUTER_PIPELINE_SLOTS in order.  For each consecutive pair of slots
   * (prev, curr), assert that the first occurrence of curr.jsxElement in the
   * source appears AFTER the first occurrence of prev.jsxElement.
   *
   * This verifies the complete outer pipeline ordering — not just the
   * agent-to-connector boundary.
   */
  it("all outer slots appear in spec-declared order in CommandCenterScene.tsx", () => {
    // Collect (slotId, lineNumber) for every outer slot
    const slotPositions: Array<{ id: string; jsxElement: string; line: number }> = [];

    for (const slot of OUTER_PIPELINE_SLOTS) {
      const line = findFirstLine(sceneLines, slot.jsxElement);
      if (line === -1) {
        // Some conditional/debug slots may not be present in all source versions.
        // Only required (non-conditional) slots must be present.
        if (!slot.conditional) {
          expect(line, `Required slot "${slot.id}" (${slot.jsxElement}) not found in source`)
            .toBeGreaterThan(-1);
        }
        // Skip optional absent slots
        continue;
      }
      slotPositions.push({ id: slot.id, jsxElement: slot.jsxElement, line });
    }

    // Verify sequential ordering for slots that are present
    for (let i = 1; i < slotPositions.length; i++) {
      const prev = slotPositions[i - 1]!;
      const curr = slotPositions[i]!;
      expect(
        curr.line,
        `Slot "${curr.id}" (${curr.jsxElement}, line ${curr.line}) must appear after ` +
        `slot "${prev.id}" (${prev.jsxElement}, line ${prev.line}) in source`,
      ).toBeGreaterThan(prev.line);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-12,13 · BirdsEyeConnectorLayer ordering
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-12,13: BirdsEyeConnectorLayer appears after BirdsEyeLODLayer and is 'connectors' kind", () => {
  it("5d-12: BirdsEyeConnectorLayer line > BirdsEyeLODLayer line in source", () => {
    const lodLine       = findFirstLine(sceneLines, "<BirdsEyeLODLayer");
    const beConnLine    = findFirstLine(sceneLines, "<BirdsEyeConnectorLayer");

    expect(lodLine,    "<BirdsEyeLODLayer not found").toBeGreaterThan(-1);
    expect(beConnLine, "<BirdsEyeConnectorLayer not found").toBeGreaterThan(-1);
    expect(beConnLine, "BirdsEyeConnectorLayer must come after BirdsEyeLODLayer")
      .toBeGreaterThan(lodLine);
  });

  it("5d-13: birds-eye-connectors slot is of kind 'connectors' in the spec", () => {
    const slot = SCENE_PIPELINE_ORDER.find((s) => s.id === "birds-eye-connectors");
    expect(slot).toBeDefined();
    expect(slot!.kind).toBe("connectors");
    expect(slot!.jsxElement).toBe("<BirdsEyeConnectorLayer");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-14 · All "connectors" kind slots are correctly typed
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-14: All connector slots have kind === 'connectors' (type integrity)", () => {
  it("every slot with 'connector' in its id has kind === 'connectors'", () => {
    const connectorIdSlots = SCENE_PIPELINE_ORDER.filter((s) =>
      s.id.includes("connector"),
    );
    expect(connectorIdSlots.length).toBeGreaterThan(0);
    for (const slot of connectorIdSlots) {
      expect(slot.kind, `Slot "${slot.id}" should have kind "connectors"`).toBe("connectors");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-15 · TaskConnectorsLayer appears before every non-connector outer slot
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-15: TaskConnectorsLayer appears before every subsequent non-connector outer slot", () => {
  /**
   * In the outer pipeline, TaskConnectorsLayer is the FIRST major layer after
   * the agent block.  It must precede every "room", "ui3d", "metrics", "replay",
   * "birdsEye", and "spatial" layer.
   */
  const NON_CONNECTOR_OUTER_KINDS = new Set(["room", "ui3d", "metrics", "replay", "birdsEye", "spatial"]);

  it("TaskConnectorsLayer source line < all subsequent non-connector outer layer lines", () => {
    const connectorLine = findFirstLine(sceneLines, "<TaskConnectorsLayer");
    expect(connectorLine, "<TaskConnectorsLayer not found").toBeGreaterThan(-1);

    for (const slot of OUTER_PIPELINE_SLOTS) {
      if (!NON_CONNECTOR_OUTER_KINDS.has(slot.kind)) continue;
      if (slot.conditional) continue; // skip optional slots

      const slotLine = findFirstLine(sceneLines, slot.jsxElement);
      if (slotLine === -1) continue; // absent conditional slot

      expect(
        connectorLine,
        `TaskConnectorsLayer (line ${connectorLine}) must precede "${slot.id}" (${slot.jsxElement}, line ${slotLine})`,
      ).toBeLessThan(slotLine);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-16,17 · extractJsxComponentsInRange unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-16,17: extractJsxComponentsInRange utility correctness", () => {
  it("5d-16: returns empty array for a range with no JSX component tags", () => {
    const lines = [
      "  // just a comment",
      "  const x = 1;",
      "  {/* <fog /> */}",  // lowercase — not matched
    ];
    const result = extractJsxComponentsInRange(lines, 0, lines.length);
    expect(result).toHaveLength(0);
  });

  it("5d-17: correctly identifies uppercase component names", () => {
    const lines = [
      "  <TaskConnectorsLayer />",
      "  <RoomsFromRegistry />",
      "  <fog />",         // lowercase — excluded
      "  <group>",         // lowercase — excluded
    ];
    const result = extractJsxComponentsInRange(lines, 0, lines.length);
    expect(result).toContain("TaskConnectorsLayer");
    expect(result).toContain("RoomsFromRegistry");
    expect(result).not.toContain("fog");
    expect(result).not.toContain("group");
  });

  it("range boundaries are respected (fromLine inclusive, toLine exclusive)", () => {
    const lines = [
      "  <Before />",    // line 0 — before range
      "  <InRange />",   // line 1 — in range
      "  <After />",     // line 2 — after range (toLine=2 → exclusive)
    ];
    const result = extractJsxComponentsInRange(lines, 1, 2);
    expect(result).toContain("InRange");
    expect(result).not.toContain("Before");
    expect(result).not.toContain("After");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-18 · findFirstLine / findLastLine helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-18: findFirstLine and findLastLine return -1 for missing tokens", () => {
  const sampleLines = ["line one", "token here", "token again", "end"];

  it("findFirstLine returns index of first occurrence", () => {
    expect(findFirstLine(sampleLines, "token")).toBe(1);
  });

  it("findLastLine returns index of last occurrence", () => {
    expect(findLastLine(sampleLines, "token")).toBe(2);
  });

  it("findFirstLine returns -1 for absent token", () => {
    expect(findFirstLine(sampleLines, "missing")).toBe(-1);
  });

  it("findLastLine returns -1 for absent token", () => {
    expect(findLastLine(sampleLines, "missing")).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-19 · indexJsxComponents lists TaskConnectorsLayer before RoomsFromRegistry
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-19: indexJsxComponents lists TaskConnectorsLayer before RoomsFromRegistry in source", () => {
  it("TaskConnectorsLayer entry precedes RoomsFromRegistry entry in indexed list", () => {
    const indexed = indexJsxComponents(sceneLines);
    const connIdx  = indexed.findIndex((e) => e.component === "TaskConnectorsLayer");
    const roomsIdx = indexed.findIndex((e) => e.component === "RoomsFromRegistry");

    expect(connIdx,  "TaskConnectorsLayer not found by indexJsxComponents").toBeGreaterThan(-1);
    expect(roomsIdx, "RoomsFromRegistry not found by indexJsxComponents").toBeGreaterThan(-1);
    expect(connIdx,  "TaskConnectorsLayer must appear before RoomsFromRegistry")
      .toBeLessThan(roomsIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-20 · FIRST_CONNECTOR_AFTER_AGENTS constant
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-20: FIRST_CONNECTOR_AFTER_AGENTS equals 'TaskConnectorsLayer'", () => {
  it("the constant names the correct component", () => {
    expect(FIRST_CONNECTOR_AFTER_AGENTS).toBe("TaskConnectorsLayer");
  });

  it("the component named by FIRST_CONNECTOR_AFTER_AGENTS appears in the source", () => {
    const line = findFirstLine(sceneLines, `<${FIRST_CONNECTOR_AFTER_AGENTS}`);
    expect(line).toBeGreaterThan(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-21 · Agent-block close `)}` precedes TaskConnectorsLayer line
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-21: Agent-block ternary close appears before TaskConnectorsLayer in source", () => {
  it("the `)}` that closes the useHierarchy ternary is on an earlier line than <TaskConnectorsLayer", () => {
    const agentBlockStartLine  = findFirstLine(sceneLines, OUTER_AGENT_BLOCK_CLOSE_MARKER);
    const connectorLine        = findFirstLine(sceneLines, "<TaskConnectorsLayer");

    expect(agentBlockStartLine, `"${OUTER_AGENT_BLOCK_CLOSE_MARKER}" not found in source`)
      .toBeGreaterThan(-1);
    expect(connectorLine, "<TaskConnectorsLayer not found in source")
      .toBeGreaterThan(-1);

    // Find the last `)}` line before the connector (ternary close)
    let ternaryCloseLine = -1;
    for (let i = agentBlockStartLine + 1; i < connectorLine; i++) {
      if (/^\s+\)\}?\s*$/.test(sceneLines[i]!) && sceneLines[i]!.trimStart().startsWith(")")) {
        ternaryCloseLine = i;
      }
    }

    expect(ternaryCloseLine, "Ternary close `)}` not found between agent block and connector")
      .toBeGreaterThan(-1);
    expect(ternaryCloseLine, "`)}` must be on an earlier line than <TaskConnectorsLayer")
      .toBeLessThan(connectorLine);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-22 · TaskConnectorsLayer is first connector-kind component in outer scope
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-22: TaskConnectorsLayer is the first connector-kind component in the outer scope", () => {
  it("no other outer-scope connector component appears before TaskConnectorsLayer in source", () => {
    const connectorSlots = OUTER_PIPELINE_SLOTS.filter((s) => s.kind === "connectors");
    expect(connectorSlots.length).toBeGreaterThan(0);

    const connectorLinePositions = connectorSlots
      .map((s) => ({ slot: s, line: findFirstLine(sceneLines, s.jsxElement) }))
      .filter((x) => x.line !== -1);

    const taskConnectorEntry = connectorLinePositions.find(
      (x) => x.slot.jsxElement === "<TaskConnectorsLayer",
    );
    expect(taskConnectorEntry, "<TaskConnectorsLayer not found among outer connector slots")
      .toBeDefined();

    const earliestLine = Math.min(...connectorLinePositions.map((x) => x.line));
    expect(
      taskConnectorEntry!.line,
      "TaskConnectorsLayer must be the first connector-kind component in the source",
    ).toBe(earliestLine);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-23 · OUTER_AGENT_BLOCK_CLOSE_MARKER present in source
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-23: OUTER_AGENT_BLOCK_CLOSE_MARKER is present in CommandCenterScene.tsx", () => {
  it(`source contains "${OUTER_AGENT_BLOCK_CLOSE_MARKER}"`, () => {
    const line = findFirstLine(sceneLines, OUTER_AGENT_BLOCK_CLOSE_MARKER);
    expect(line).toBeGreaterThan(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5d-25 · Scene source ordering covers all required outer slots
// ─────────────────────────────────────────────────────────────────────────────

describe("Sub-AC 5d-25: All required outer slots are present in CommandCenterScene.tsx", () => {
  it("every non-conditional outer slot has a matching JSX tag in the source", () => {
    const missing: string[] = [];
    for (const slot of OUTER_PIPELINE_SLOTS) {
      if (slot.conditional) continue; // optional slots may be absent
      const line = findFirstLine(sceneLines, slot.jsxElement);
      if (line === -1) {
        missing.push(`${slot.id} (${slot.jsxElement})`);
      }
    }
    expect(
      missing,
      `Required outer pipeline slots missing from CommandCenterScene.tsx: [${missing.join(", ")}]`,
    ).toHaveLength(0);
  });
});
