---
schema_v: 1
name: "Research Build Review"
slug: "research-build-review"
description: "Capture context, run impact analysis, and generate an office snapshot."
inputs:
  file:
    type: string
    required: true
steps:
  - id: context
    kind: cli
    cmd: "ensemble context update"
    on_fail: continue
  - id: impact
    kind: cli
    cmd: "python scripts/ensemble_impact.py --file {{file}}"
    on_fail: continue
  - id: office
    kind: cli
    cmd: "python scripts/ensemble_office.py --format md"
    on_fail: continue
---

# Notes

- Intended for non-destructive research and review loops.
