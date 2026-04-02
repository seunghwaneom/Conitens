---
schema_v: 1
skill_id: reflection-summary
name: reflection-summary
description: "Turn a completed iteration into a compact reflection suitable for approved long-term memory."
triggers:
  - reflection-summary
  - iteration-retro
expected_capabilities:
  - summarize what changed
  - capture lessons without copying transcripts
  - emit evidence-linked reflections
references:
  - .conitens/context/progress.md
  - .conitens/personas/memory_record.schema.json
---

# reflection-summary

## Workflow

1. Read the latest progress and findings for the iteration.
2. Extract one or two durable lessons with evidence references.
3. Prefer reflection or procedural memory over identity edits.
4. Leave raw transcripts out of the summary.

## Constraints

- Do not auto-edit identity memory.
- Store references, not transcript dumps.
- Keep the reflection small enough to review quickly.
