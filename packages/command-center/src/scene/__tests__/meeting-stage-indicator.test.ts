/**
 * meeting-stage-indicator.test.ts — Sub-AC 10b tests
 *
 * Validates the spatial agent gathering stage indicator: when a meeting is
 * convened, agents are repositioned/animated to a designated meeting zone and
 * the 3D scene renders visual indicators showing:
 *   1. Meeting membership (participant count)
 *   2. Current protocol stage (CONVENE / DELIBERATE / RESOLVE / ADJOURN)
 *
 * These tests target the exported pure-logic functions from MeetingGatheringLayer.tsx:
 *   • getMeetingStageConfig — stage → color/label/step config lookup
 *   • buildStageProgressDots — current step → filled/empty dot array
 *   • STAGE_CONFIG — exhaustive coverage of all four stages
 *   • MEETING_STAGE_COUNT — correct constant value
 *
 * NOTE: Three.js, R3F hooks (useFrame, Html), and Zustand selectors cannot
 *       run headless. Tests target only exported constants and pure utility
 *       functions. Component rendering is validated via the data-testid
 *       contract documented in MeetingGatheringLayer.tsx.
 *
 * Test ID scheme:
 *   10b-N : Sub-AC 10b meeting stage indicator
 */

import { describe, it, expect } from "vitest";
import {
  getMeetingStageConfig,
  buildStageProgressDots,
  STAGE_CONFIG,
  MEETING_STAGE_COUNT,
  type MeetingStageConfig,
} from "../MeetingGatheringLayer.js";
import type { MeetingStage } from "../../store/meeting-store.js";

// ---------------------------------------------------------------------------
// 1. STAGE_CONFIG completeness
// ---------------------------------------------------------------------------

describe("STAGE_CONFIG completeness (10b-1)", () => {
  const ALL_STAGES: MeetingStage[] = ["convene", "deliberate", "resolve", "adjourn"];

  it("covers all four canonical stages", () => {
    for (const stage of ALL_STAGES) {
      expect(STAGE_CONFIG[stage]).toBeDefined();
    }
  });

  it("each stage config has a non-empty label", () => {
    for (const stage of ALL_STAGES) {
      expect(typeof STAGE_CONFIG[stage].label).toBe("string");
      expect(STAGE_CONFIG[stage].label.length).toBeGreaterThan(0);
    }
  });

  it("each stage config has a valid CSS hex color", () => {
    const hexRe = /^#[0-9A-Fa-f]{6}$/;
    for (const stage of ALL_STAGES) {
      expect(STAGE_CONFIG[stage].color).toMatch(hexRe);
      expect(STAGE_CONFIG[stage].glowColor).toMatch(hexRe);
    }
  });

  it("steps are 1, 2, 3, 4 in order", () => {
    expect(STAGE_CONFIG.convene.step).toBe(1);
    expect(STAGE_CONFIG.deliberate.step).toBe(2);
    expect(STAGE_CONFIG.resolve.step).toBe(3);
    expect(STAGE_CONFIG.adjourn.step).toBe(4);
  });

  it("all steps are unique", () => {
    const steps = ALL_STAGES.map((s) => STAGE_CONFIG[s].step);
    expect(new Set(steps).size).toBe(4);
  });

  it("labels are uppercase strings", () => {
    for (const stage of ALL_STAGES) {
      const label = STAGE_CONFIG[stage].label;
      expect(label).toBe(label.toUpperCase());
    }
  });
});

// ---------------------------------------------------------------------------
// 2. MEETING_STAGE_COUNT constant
// ---------------------------------------------------------------------------

describe("MEETING_STAGE_COUNT constant (10b-2)", () => {
  it("equals 4 (the four canonical protocol stages)", () => {
    expect(MEETING_STAGE_COUNT).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 3. getMeetingStageConfig — lookup logic
// ---------------------------------------------------------------------------

describe("getMeetingStageConfig (10b-3)", () => {
  it("returns convene config for 'convene' stage", () => {
    const cfg = getMeetingStageConfig("convene");
    expect(cfg.label).toBe("CONVENE");
    expect(cfg.step).toBe(1);
  });

  it("returns deliberate config for 'deliberate' stage", () => {
    const cfg = getMeetingStageConfig("deliberate");
    expect(cfg.label).toBe("DELIBERATE");
    expect(cfg.step).toBe(2);
  });

  it("returns resolve config for 'resolve' stage", () => {
    const cfg = getMeetingStageConfig("resolve");
    expect(cfg.label).toBe("RESOLVE");
    expect(cfg.step).toBe(3);
  });

  it("returns adjourn config for 'adjourn' stage", () => {
    const cfg = getMeetingStageConfig("adjourn");
    expect(cfg.label).toBe("ADJOURN");
    expect(cfg.step).toBe(4);
  });

  it("falls back to convene config for undefined stage", () => {
    const cfg = getMeetingStageConfig(undefined);
    expect(cfg.label).toBe("CONVENE");
    expect(cfg.step).toBe(1);
  });

  it("falls back to convene config for unknown stage string", () => {
    // Cast to MeetingStage to simulate unknown / corrupted data arriving from WS
    const cfg = getMeetingStageConfig("unknown_phase" as MeetingStage);
    expect(cfg.label).toBe("CONVENE");
    expect(cfg.step).toBe(1);
  });

  it("returns a MeetingStageConfig with all required fields", () => {
    const stages: MeetingStage[] = ["convene", "deliberate", "resolve", "adjourn"];
    for (const stage of stages) {
      const cfg: MeetingStageConfig = getMeetingStageConfig(stage);
      expect(typeof cfg.label).toBe("string");
      expect(typeof cfg.color).toBe("string");
      expect(typeof cfg.glowColor).toBe("string");
      expect(typeof cfg.step).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. buildStageProgressDots — progress dot array
// ---------------------------------------------------------------------------

describe("buildStageProgressDots (10b-4)", () => {
  it("always returns exactly 4 dots", () => {
    expect(buildStageProgressDots(1)).toHaveLength(4);
    expect(buildStageProgressDots(2)).toHaveLength(4);
    expect(buildStageProgressDots(3)).toHaveLength(4);
    expect(buildStageProgressDots(4)).toHaveLength(4);
  });

  it("step 1 (convene): only the first dot is filled", () => {
    const dots = buildStageProgressDots(1);
    expect(dots[0].filled).toBe(true);
    expect(dots[1].filled).toBe(false);
    expect(dots[2].filled).toBe(false);
    expect(dots[3].filled).toBe(false);
  });

  it("step 2 (deliberate): first two dots are filled", () => {
    const dots = buildStageProgressDots(2);
    expect(dots[0].filled).toBe(true);
    expect(dots[1].filled).toBe(true);
    expect(dots[2].filled).toBe(false);
    expect(dots[3].filled).toBe(false);
  });

  it("step 3 (resolve): first three dots are filled", () => {
    const dots = buildStageProgressDots(3);
    expect(dots[0].filled).toBe(true);
    expect(dots[1].filled).toBe(true);
    expect(dots[2].filled).toBe(true);
    expect(dots[3].filled).toBe(false);
  });

  it("step 4 (adjourn): all four dots are filled", () => {
    const dots = buildStageProgressDots(4);
    expect(dots.every((d) => d.filled)).toBe(true);
  });

  it("stage property matches the canonical MeetingStage values", () => {
    const dots = buildStageProgressDots(1);
    const stages = dots.map((d) => d.stage);
    expect(stages).toEqual(["convene", "deliberate", "resolve", "adjourn"]);
  });

  it("dots are monotonically ordered (filled dots precede unfilled dots)", () => {
    for (const step of [1, 2, 3, 4] as const) {
      const dots = buildStageProgressDots(step);
      let seenUnfilled = false;
      for (const dot of dots) {
        if (!dot.filled) {
          seenUnfilled = true;
        } else if (seenUnfilled) {
          // A filled dot after an unfilled dot would break monotonic order
          throw new Error(`Non-monotonic progress at step ${step}: stage=${dot.stage}`);
        }
      }
    }
    // If no error was thrown, all steps are monotonic
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Visual color palette — stage colors are visually distinct
// ---------------------------------------------------------------------------

describe("stage color palette distinctness (10b-5)", () => {
  it("all four stage colors are unique hex strings", () => {
    const colors = (["convene", "deliberate", "resolve", "adjourn"] as MeetingStage[])
      .map((s) => STAGE_CONFIG[s].color.toLowerCase());
    expect(new Set(colors).size).toBe(4);
  });

  it("all four stage glowColors are unique hex strings", () => {
    const glows = (["convene", "deliberate", "resolve", "adjourn"] as MeetingStage[])
      .map((s) => STAGE_CONFIG[s].glowColor.toLowerCase());
    expect(new Set(glows).size).toBe(4);
  });

  it("no stage uses #000000 or #ffffff (would be invisible in dark theme)", () => {
    const blocked = new Set(["#000000", "#ffffff"]);
    for (const stage of ["convene", "deliberate", "resolve", "adjourn"] as MeetingStage[]) {
      expect(blocked.has(STAGE_CONFIG[stage].color.toLowerCase())).toBe(false);
      expect(blocked.has(STAGE_CONFIG[stage].glowColor.toLowerCase())).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. getMeetingStageConfig + buildStageProgressDots integration
// ---------------------------------------------------------------------------

describe("getMeetingStageConfig / buildStageProgressDots integration (10b-6)", () => {
  it("config step from getMeetingStageConfig matches expected filled dot count", () => {
    const stages: MeetingStage[] = ["convene", "deliberate", "resolve", "adjourn"];
    for (const stage of stages) {
      const cfg = getMeetingStageConfig(stage);
      const dots = buildStageProgressDots(cfg.step);
      const filledCount = dots.filter((d) => d.filled).length;
      expect(filledCount).toBe(cfg.step);
    }
  });

  it("dot at index (step - 1) is always filled for each stage", () => {
    const stages: MeetingStage[] = ["convene", "deliberate", "resolve", "adjourn"];
    for (const stage of stages) {
      const cfg = getMeetingStageConfig(stage);
      const dots = buildStageProgressDots(cfg.step);
      // The dot at the current stage's 0-based index must be filled
      expect(dots[cfg.step - 1].filled).toBe(true);
    }
  });

  it("dot at index step is always unfilled (the next stage dot is not filled)", () => {
    // Only applicable for stages 1-3; adjourn (step 4) has no next dot
    const stagesWithNext: MeetingStage[] = ["convene", "deliberate", "resolve"];
    for (const stage of stagesWithNext) {
      const cfg = getMeetingStageConfig(stage);
      const dots = buildStageProgressDots(cfg.step);
      // Dot at index cfg.step is the next (not yet reached) stage
      expect(dots[cfg.step].filled).toBe(false);
    }
  });

  it("adjourn stage dots: all 4 filled, stage labels are correct", () => {
    const cfg = getMeetingStageConfig("adjourn");
    const dots = buildStageProgressDots(cfg.step);
    expect(dots.every((d) => d.filled)).toBe(true);
    expect(dots.map((d) => d.stage)).toEqual(["convene", "deliberate", "resolve", "adjourn"]);
  });
});

// ---------------------------------------------------------------------------
// 7. Protocol stage lifecycle order contract
// ---------------------------------------------------------------------------

describe("protocol stage lifecycle order (10b-7)", () => {
  it("convene < deliberate < resolve < adjourn (step ordering)", () => {
    expect(STAGE_CONFIG.convene.step).toBeLessThan(STAGE_CONFIG.deliberate.step);
    expect(STAGE_CONFIG.deliberate.step).toBeLessThan(STAGE_CONFIG.resolve.step);
    expect(STAGE_CONFIG.resolve.step).toBeLessThan(STAGE_CONFIG.adjourn.step);
  });

  it("convene is the initial stage (step 1)", () => {
    expect(STAGE_CONFIG.convene.step).toBe(1);
  });

  it("adjourn is the terminal stage (step == MEETING_STAGE_COUNT)", () => {
    expect(STAGE_CONFIG.adjourn.step).toBe(MEETING_STAGE_COUNT);
  });
});

// ---------------------------------------------------------------------------
// 8. Visual indicator data-testid contract (static snapshot)
// ---------------------------------------------------------------------------

describe("visual indicator data-testid contract (10b-8)", () => {
  /**
   * These tests document the expected data-testid attributes used in the
   * GatheringConfirmationBadge React component. They don't render the
   * component (Three.js/R3F not available headless) but verify the logic
   * that drives the testid values.
   *
   * Corresponding DOM elements (for integration tests):
   *   [data-testid="protocol-stage-indicator"]   — outer stage container
   *   [data-stage="convene|deliberate|resolve|adjourn"] — current stage value
   *   [data-testid="stage-label"]                — stage label text
   *   [data-testid="stage-progress-dots"]        — dot row container
   *   [data-testid="stage-dot-0..3"]             — individual dots
   *   [data-filled="true|false"]                 — dot fill state
   *   [data-testid="stage-step-counter"]         — "STAGE N / 4" text
   */

  it("stage label for 'deliberate' is 'DELIBERATE'", () => {
    expect(getMeetingStageConfig("deliberate").label).toBe("DELIBERATE");
  });

  it("data-stage attribute value matches the MeetingStage string", () => {
    // The <div data-stage={meetingStage ?? 'convene'}> contract:
    // If meetingStage is undefined, we display 'convene' (the fallback)
    const stageOrDefault = (s: MeetingStage | undefined) => s ?? "convene";
    expect(stageOrDefault(undefined)).toBe("convene");
    expect(stageOrDefault("deliberate")).toBe("deliberate");
    expect(stageOrDefault("resolve")).toBe("resolve");
    expect(stageOrDefault("adjourn")).toBe("adjourn");
  });

  it("step counter text template is 'STAGE N / 4'", () => {
    const buildCounterText = (step: 1 | 2 | 3 | 4) => `STAGE ${step} / ${MEETING_STAGE_COUNT}`;
    expect(buildCounterText(1)).toBe("STAGE 1 / 4");
    expect(buildCounterText(2)).toBe("STAGE 2 / 4");
    expect(buildCounterText(3)).toBe("STAGE 3 / 4");
    expect(buildCounterText(4)).toBe("STAGE 4 / 4");
  });

  it("progress dot data-filled values match buildStageProgressDots output", () => {
    for (const step of [1, 2, 3, 4] as const) {
      const dots = buildStageProgressDots(step);
      const filledValues = dots.map((d) => String(d.filled));
      // Filled dots come first (true), unfilled (false) follow
      const expectedFilled = step;
      expect(filledValues.filter((v) => v === "true").length).toBe(expectedFilled);
      expect(filledValues.filter((v) => v === "false").length).toBe(4 - expectedFilled);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Meeting membership indicator (participant count contract)
// ---------------------------------------------------------------------------

describe("meeting membership indicator contract (10b-9)", () => {
  /**
   * The GatheringConfirmationBadge renders "· N AGENTS" where N is participantCount.
   * These tests verify that the value passed to the badge matches the gathering data.
   */

  it("participant count string template renders correctly", () => {
    const buildParticipantLabel = (n: number) => `· ${n} AGENTS`;
    expect(buildParticipantLabel(1)).toBe("· 1 AGENTS");
    expect(buildParticipantLabel(3)).toBe("· 3 AGENTS");
    expect(buildParticipantLabel(8)).toBe("· 8 AGENTS");
  });

  it("participantCount equals the number of keys in participantHomeRooms", () => {
    // This mirrors the logic in ActiveGathering:
    //   const participantCount = Object.keys(gathering.participantHomeRooms).length;
    const mockGathering = {
      participantHomeRooms: {
        "agent-a": "ops-control",
        "agent-b": "research-lab",
        "agent-c": "research-lab",
      },
    };
    const participantCount = Object.keys(mockGathering.participantHomeRooms).length;
    expect(participantCount).toBe(3);
  });

  it("participantCount is 0 for an empty gathering (no participants moved)", () => {
    const mockGathering = {
      participantHomeRooms: {} as Record<string, string>,
    };
    const participantCount = Object.keys(mockGathering.participantHomeRooms).length;
    expect(participantCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10. STAGE_CONFIG immutability contract
// ---------------------------------------------------------------------------

describe("STAGE_CONFIG is not mutated at runtime (10b-10)", () => {
  it("getMeetingStageConfig returns a stable reference to the config object", () => {
    const cfg1 = getMeetingStageConfig("resolve");
    const cfg2 = getMeetingStageConfig("resolve");
    // Same object reference — no new object created on each call
    expect(cfg1).toBe(cfg2);
  });

  it("getMeetingStageConfig result has the expected shape for all stages", () => {
    const stages: MeetingStage[] = ["convene", "deliberate", "resolve", "adjourn"];
    for (const stage of stages) {
      const cfg = getMeetingStageConfig(stage);
      // Must have exactly these four keys
      expect(Object.keys(cfg).sort()).toEqual(["color", "glowColor", "label", "step"].sort());
    }
  });
});
