---
schema_v: 1
name: "Incident Triage"
slug: "incident-triage"
description: "Run triage-oriented context refresh and office reporting for an active issue."
inputs:
  task_id:
    type: string
    required: false
steps:
  - id: context
    kind: cli
    cmd: "ensemble context update"
    on_fail: continue
  - id: office
    kind: cli
    cmd: "python scripts/ensemble_office.py --format md"
    on_fail: continue
---

# Notes

- Keep this workflow read-mostly.
- Use it before escalating to broader intervention.
