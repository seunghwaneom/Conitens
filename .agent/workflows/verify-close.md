---
schema_v: 1
name: "Conitens Verify and Close"
slug: "verify-close"
description: "Run verify and close only after the verify gate passes."
inputs:
  task_id:
    type: string
    required: true
  files:
    type: string
    required: true
steps:
  - id: verify
    kind: cli
    cmd: "ensemble verify --task {{task_id}} --files {{files}}"
    on_fail: stop
  - id: close
    kind: cli
    cmd: "ensemble close --task {{task_id}}"
    on_fail: stop
---

# Notes

- Requires `.agent` registration.
- Preserve the existing verify-before-close gate.
