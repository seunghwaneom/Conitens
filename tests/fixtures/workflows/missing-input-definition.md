---
schema_v: 1
name: "Missing Input Definition"
slug: "missing-input-definition"
inputs:
  task_id:
    type: string
    required: true
steps:
  - id: verify
    kind: cli
    cmd: "ensemble verify --task {{task_id}} --files {{files}}"
    on_fail: stop
---
