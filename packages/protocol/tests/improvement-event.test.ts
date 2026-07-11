import { describe, expect, it } from "vitest";

import { EVENT_TYPES, isValidEventType } from "../src/index.js";


describe("improvement events", () => {
  it("keeps candidate and revision lifecycle events in the protocol dictionary", () => {
    const expected = [
      "improvement.candidate_proposed",
      "improvement.revision_proposed",
      "improvement.revision_applied",
      "improvement.revision_rolled_back",
      "improvement.effect_observed",
    ] as const;

    for (const eventType of expected) {
      expect(EVENT_TYPES).toContain(eventType);
      expect(isValidEventType(eventType)).toBe(true);
    }
  });
});
