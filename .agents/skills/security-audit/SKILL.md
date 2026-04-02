---
schema_v: 1
skill_id: security-audit
name: security-audit
description: "Check approval boundaries, data handling, and mutation safety before risky changes are accepted."
triggers:
  - security-audit
  - safety-review
expected_capabilities:
  - inspect trust boundaries
  - review approval and mutation paths
  - flag identity and policy escalation risks
references:
  - AGENTS.md
  - .conitens/context/LATEST_CONTEXT.md
---

# security-audit

## Workflow

1. Identify the write surfaces and approval boundaries involved.
2. Check for uncontrolled mutation paths, especially around identity and policy.
3. Flag namespace leaks, unsafe retrieval, or missing approval gates.
4. Return concrete risks before any sign-off.

## Constraints

- Treat identity edits as high risk.
- Do not normalize risky actions just because they are convenient.
- Prefer explicit approval evidence over inferred intent.
