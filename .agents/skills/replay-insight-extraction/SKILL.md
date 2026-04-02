---
schema_v: 1
skill_id: replay-insight-extraction
name: replay-insight-extraction
description: "Extract replayable insights from run state, findings, and progress without relying on hidden chat history."
triggers:
  - replay-insight-extraction
  - replay-summary
expected_capabilities:
  - reconstruct run state from disk
  - identify decisions and failed hypotheses
  - emit replay-safe insight summaries
references:
  - .conitens/runtime/loop_state.sqlite3
  - .conitens/context/findings.md
  - .conitens/context/progress.md
---

# replay-insight-extraction

## Workflow

1. Start from persisted runtime state and markdown artifacts.
2. Identify decisions, blockers, and outcome-changing events.
3. Emit compact replay notes that can survive process restart.
4. Prefer facts and artifact paths over interpretation.

## Constraints

- No hidden chat-state assumptions.
- No full transcript stuffing.
- Keep replay output safe for future prompt reuse.
