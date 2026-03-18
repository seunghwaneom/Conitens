---
schema_v: 1
name: "Valid Explain"
slug: "valid-explain"
inputs:
  name:
    type: string
    required: true
steps:
  - id: hello
    kind: cli
    cmd: "python -c \"print('hello {{name}}')\""
    on_fail: stop
---
