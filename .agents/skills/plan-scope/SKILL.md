---
schema_v: 1
skill_id: plan-scope
name: plan-scope
description: "Turn a broad request into a scoped plan, acceptance boundary, and next iteration target."
triggers:
  - plan-scope
  - scope-plan
expected_capabilities:
  - read runtime and repo LATEST_CONTEXT
  - break work into ordered scoped steps
  - define acceptance before implementation
references:
  - .conitens/context/task_plan.md
  - .conitens/context/LATEST_CONTEXT.md
---

# plan-scope

## Workflow

1. Read runtime and repo context before proposing scope.
2. Identify the single active objective for the next iteration.
3. Produce ordered steps with acceptance and owner hints.
4. Stop before implementation if scope is still ambiguous.

## Constraints

- Prefer one task per iteration.
- Keep the scope small enough to verify in one pass.
- Do not invent dependencies or runtime surfaces without evidence.
