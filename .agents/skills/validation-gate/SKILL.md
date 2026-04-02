---
schema_v: 1
skill_id: validation-gate
name: validation-gate
description: "Run the minimum validation needed to prove a change, and reject completion when evidence is missing."
triggers:
  - validation-gate
  - verify-gate
expected_capabilities:
  - choose targeted tests
  - capture pass/fail evidence
  - block close on missing proof
references:
  - .conitens/context/progress.md
  - .vibe/context/DOCTOR_REPORT.md
---

# validation-gate

## Workflow

1. Map the change to the smallest relevant validation surface.
2. Run targeted checks first, then broader checks only if risk warrants it.
3. Record evidence, failures, and remaining gaps.
4. Reject completion if the change lacks concrete proof.

## Constraints

- No narrative-only "looks good" approvals.
- Prefer targeted validation over repo-wide scans.
- Preserve regression-only gates where legacy debt exists.
